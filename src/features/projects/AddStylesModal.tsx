import React, { useState, useEffect, useRef, useCallback } from "react";
import jsQR from "jsqr";
import { Plus, Camera, QrCode, AlertCircle } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import Input from "../../components/Input";
import ConfirmModal from "../../components/ConfirmModal";
import EditItemModal from "./EditItemModal";
import {
  projectService,
  type ProjectItem,
} from "../../services/projectService";
import type { TableType } from "../../types/table";
import { odata2style, odata2material } from "../../services/api";
import { extractODataList } from "../../utils/odata";
import styles from "./AddStylesModal.module.scss";

interface AddStylesModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: TableType;
  existingItems?: ProjectItem[];
  onAddStyles: (updated: TableType) => void;
  onError?: (message: string) => void;
}

interface ParsedQrInfo {
  styleNumber: string;
  colorCode?: string;
}

function parseQrData(raw: string): ParsedQrInfo {
  const trimmed = raw.trim();

  // Match Style Number or Style Code
  const styleMatch = trimmed.match(/Style\s*(?:Number|Code)\s*:\s*([^,;\n\r]+)/i);
  let styleNumber = styleMatch ? styleMatch[1].trim() : "";

  // If no prefix, extract the first segment before comma/semicolon/newline
  if (!styleNumber) {
    const parts = trimmed.split(/[,;\n\r]+/);
    styleNumber = parts[0].trim();
  }

  // Match Color, Color Code, Colorway, or Colorway Code
  const colorMatch = trimmed.match(/Color(?:way)?\s*(?:Code)?\s*:\s*([^,;\n\r]+)/i);
  const colorCode = colorMatch ? colorMatch[1].trim() : undefined;

  return {
    styleNumber,
    colorCode: colorCode || undefined,
  };
}

export default function AddStylesModal({
  isOpen,
  onClose,
  project,
  existingItems = [],
  onAddStyles,
  onError,
}: AddStylesModalProps) {
  const [isAddingStyle, setIsAddingStyle] = useState(false);

  // Scanner & Manual entry inside Add Styles Modal
  const [manualInput, setManualInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [scanError, setScanError] = useState("");
  const [lastScannedItem, setLastScannedItem] = useState<string | null>(null);

  // ── Not-in-PLM confirmation state ───────────────────────────────────────────
  const [notInPlmPendingCode, setNotInPlmPendingCode] = useState<string | null>(null);
  const [showNotInPlmConfirm, setShowNotInPlmConfirm] = useState(false);
  const [isAddingNotInPlm, setIsAddingNotInPlm] = useState(false);
  const [notInPlmEditItem, setNotInPlmEditItem] = useState<ProjectItem | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stable refs — never recreated across renders
  const audioContextRef = useRef<AudioContext | null>(null);   // ✅ 12: Reuse AudioContext
  const openingCameraRef = useRef(false);                      // ✅ 6: Prevent duplicate getUserMedia
  const lastQrRef = useRef("");                                 // ✅ 2: Skip same QR code
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // ✅ 3: Cleanup overlay timeout

  // ✅ 12: Reuse a single AudioContext for all beeps (avoids browser limit on AudioContext count)
  const playBeep = () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("AudioContext beep failed:", e);
    }
  };

  // Manage WebRTC camera stream lifecycle
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isCancelled = false;

    const startCamera = async () => {
      if (!isScanning || !isOpen) return;

      // ✅ 6: Prevent duplicate getUserMedia on rapid Start → Stop → Start
      if (openingCameraRef.current) return;
      openingCameraRef.current = true;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // ✅ 7: Use ideal constraint — works on Android Chrome, Samsung Internet, Safari
            facingMode: { ideal: "environment" },
            // ✅ 8: Higher resolution gives jsQR clearer QR edges → faster detection
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        // ✅ 13: Race condition fix - If component unmounted or stopped scanning while waiting for camera
        if (isCancelled) {
          console.warn("[AddStylesModal] Camera opened but scanner was stopped. Cleaning up immediately.");
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Mobile browsers (iOS Safari, Android Chrome) require an explicit .play() call.
          // Setting srcObject alone does NOT auto-play on mobile even with the autoPlay attribute.
          // Without this, video.readyState never reaches HAVE_ENOUGH_DATA (4), so the
          // scan loop never captures a frame and the QR scanner appears stuck/inactive.
          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn(
              "[AddStylesModal] video.play() failed (may be normal if already playing):",
              playErr,
            );
          }
        }
        setHasCameraPermission(true);
        setScanError("");
      } catch (err) {
        console.warn("Camera access denied or unavailable:", err);
        setHasCameraPermission(false);
        setScanError(
          "Camera not available or access denied. Showing scanner simulation.",
        );
      } finally {
        openingCameraRef.current = false;
      }
    };

    void startCamera();

    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        // ✅ 4: Pause before clearing srcObject — required for Safari to release camera properly
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      // ✅ 3: Clear overlay timeout on cleanup to prevent state update after unmount
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
        overlayTimeoutRef.current = null;
      }
    };
  }, [isScanning, isOpen]);

  const handleManualInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const form = e.currentTarget.closest("form");
      if (form) {
        form.requestSubmit();
      }
    }
  };

  /**
   * Fetches the style/material details from the OData Service and validates its existence.
   * Throws detailed errors if validation fails or duplicates are found.
   */
  const fetchAndValidateStyle = useCallback(
    async (
      code: string,
      skipDuplicateCheck = false,
      colorCode?: string,
    ): Promise<{ styleObj: any; itemType: "Style" | "Material" }> => {
      if (!skipDuplicateCheck) {
        if (colorCode) {
          // If color is provided, check if exact style and colorway already exists in project
          const isDuplicateInProject = existingItems?.some(
            (item) =>
              item.styleMaterialNumber.toLowerCase() === code.toLowerCase() &&
              item.colorway &&
              item.colorway.trim().toLowerCase() === colorCode.trim().toLowerCase(),
          );
          if (isDuplicateInProject) {
            throw new Error(`Item "${code}" with color "${colorCode}" already exists in this project`);
          }
        } else {
          // Check for duplicate in current project items (when no colorway specified in QR)
          const isDuplicateInProject = existingItems?.some(
            (item) =>
              item.styleMaterialNumber.toLowerCase() === code.toLowerCase(),
          );
          if (isDuplicateInProject) {
            throw new Error(`Item "${code}" already exists in this project`);
          }
        }
      }

      // Always use `search` so the OData layer can try both StyleCode and StyleId
      // (the OData filter handles numeric codes without quotes — see api.ts getStyleData).

      // 1. Try style lookup
      try {
        const response = await odata2style.getStyleData({ search: code });
        const styleList = extractODataList<any>(response);

        if (styleList.length > 0) {
          return {
            styleObj: styleList[0],
            itemType: "Style" as const,
          };
        }
      } catch {
        // Fall through to material lookup
      }

      // 2. Try material lookup
      try {
        const materialQueryParams = { search: code };

        const response =
          await odata2material.getMaterialData(materialQueryParams);
        const materialList = extractODataList<any>(response);

        if (materialList.length > 0) {
          return {
            styleObj: materialList[0],
            itemType: "Material" as const,
          };
        }
      } catch (err) {
        console.error(
          "[AddStylesModal] Material lookup failed with error:",
          err,
        );
      }

      throw new Error("Item not found as Style or Material in PLM.");
    },
    [existingItems],
  );

  /** Returns today's date as a YYYY-MM-DD string. */
  const getTodayDateString = () => new Date().toISOString().split("T")[0];

  /**
   * Maps Infor OData Style/Material metadata to the database schema structure.
   * If a scanned color is provided, resolves matching colorway from PLM metadata
   * and automatically marks it as selected.
   */
  const mapODataStyleToItemPayload = useCallback(
    (
      code: string,
      styleObj: any,
      itemType: "Style" | "Material",
      scannedColor?: string,
    ): Omit<ProjectItem, "id" | "projectId"> => {
      const styleNameStr =
        (styleObj.Name as string) ||
        (styleObj.MaterialName as string) ||
        (styleObj.Description as string) ||
        code.replace(/^QR-/, "");
      const styleId =
        styleObj.StyleId || styleObj.MaterialId || styleObj.Id || 0;
      const styleMaterialNum =
        itemType === "Style"
          ? styleObj.StyleCode || code
          : styleObj.MaterialCode || code;

      // Extract raw colorways from styleObj if available
      const colorwaysNode =
        styleObj.StyleColorways ||
        styleObj.MaterialColorways ||
        styleObj.MaterialColorway ||
        [];
      const rawColorways = extractODataList<any>(colorwaysNode);

      let matchedColorwayName = scannedColor || "";
      let matchedColorId = 0;

      if (scannedColor && rawColorways.length > 0) {
        const target = scannedColor.trim().toLowerCase();
        // Match by Code (e.g. "5001"), Name (e.g. "5001" or "BLACK"), or combined string
        const match =
          rawColorways.find((cw: any) => String(cw.Code ?? "").trim().toLowerCase() === target) ||
          rawColorways.find((cw: any) => String(cw.Name ?? "").trim().toLowerCase() === target) ||
          rawColorways.find((cw: any) => {
            const cCode = String(cw.Code ?? "").trim().toLowerCase();
            const cName = String(cw.Name ?? "").trim().toLowerCase();
            return (
              (cCode && target.includes(cCode)) ||
              (cName && target.includes(cName)) ||
              (cCode && cCode.includes(target)) ||
              (cName && cName.includes(target))
            );
          });

        if (match) {
          matchedColorwayName = match.Name || match.Code || scannedColor;
          matchedColorId =
            match.StyleColorwayId ??
            match.MaterialColorwayId ??
            match.MaterialColorwayID ??
            match.Id ??
            match.id ??
            0;
        }
      }

      return {
        styleId: Number(styleId),
        colorId: matchedColorId,
        styleMaterialNumber: styleMaterialNum,
        styleMaterialName: styleNameStr,
        itemType: itemType,
        colorway: matchedColorwayName,
        colorwayStatus: matchedColorwayName ? "Selected" : "Pending",
        selectionCondition: "As-Is",
        sampleDue: getTodayDateString(),
        buyerComments: "",
        internalComments: "",
      };
    },
    [],
  );

  /**
   * Validates, structures, and adds a Style Number & Colorway to the project.
   */
  const manualQrInput = useCallback(
    async (code: string) => {
      if (!project?.id || !code.trim()) return;

      const { styleNumber, colorCode } = parseQrData(code);
      if (!styleNumber) return;

      setIsAddingStyle(true);
      try {
        const { styleObj, itemType } = await fetchAndValidateStyle(
          styleNumber,
          false,
          colorCode,
        );

        const payload = mapODataStyleToItemPayload(
          styleNumber,
          styleObj,
          itemType,
          colorCode,
        );

        // Check if there is an existing row for this style with an empty colorway
        const existingEmptyRow = existingItems?.find(
          (it) =>
            it.styleMaterialNumber.toLowerCase() === styleNumber.toLowerCase() &&
            (!it.colorway || it.colorway.trim() === ""),
        );

        // Also check if after PLM color resolution, the resolved colorway is already in existingItems
        if (payload.colorway) {
          const isResolvedColorwayDuplicate = existingItems?.some(
            (it) =>
              it.styleMaterialNumber.toLowerCase() === styleNumber.toLowerCase() &&
              it.colorway?.toLowerCase() === payload.colorway.toLowerCase(),
          );
          if (isResolvedColorwayDuplicate) {
            throw new Error(
              `Item "${styleNumber}" with color "${payload.colorway}" already exists in this project`,
            );
          }
        }

        if (existingEmptyRow && existingEmptyRow.id && payload.colorway) {
          // Fill the unassigned color row for this style
          await projectService.updateProjectItem(existingEmptyRow.id, {
            ...existingEmptyRow,
            colorway: payload.colorway,
            colorId: payload.colorId,
            colorwayStatus: "Selected",
          });
        } else {
          // Add new item to project
          await projectService.addItemToProject(project.id!, payload);
        }

        const allProjects = await projectService.getAllProjects();
        const updated = allProjects.find((p) => p.id === project.id);
        if (updated) onAddStyles(updated);
        onClose();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Style not found.";
        // If the item was not found in PLM, offer to add it locally instead
        if (errMsg.toLowerCase().includes("not found as style or material in plm")) {
          const { styleNumber: sn } = parseQrData(code);
          setNotInPlmPendingCode(sn || code.trim());
          setShowNotInPlmConfirm(true);
        } else {
          console.error(
            "[AddStylesModal] Failed to add style via manualQrInput:",
            err,
          );
          onError?.(errMsg);
        }
      } finally {
        setIsAddingStyle(false);
      }
    },
    [
      project,
      existingItems,
      fetchAndValidateStyle,
      mapODataStyleToItemPayload,
      onAddStyles,
      onClose,
      onError,
    ],
  );

  // ── Not-in-PLM: add item locally then open edit modal ───────────────────────
  const handleConfirmAddNotInPlm = useCallback(async () => {
    if (!project?.id || !notInPlmPendingCode) return;
    setIsAddingNotInPlm(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const payload: Omit<ProjectItem, "id" | "projectId"> = {
        styleId: 0,
        colorId: 0,
        styleMaterialNumber: notInPlmPendingCode,
        styleMaterialName: notInPlmPendingCode,
        itemType: "Style",
        colorway: "",
        colorwayStatus: "Pending",
        selectionCondition: "As-Is",
        sampleDue: today,
        buyerComments: "",
        internalComments: "",
        notInPLM: true,
        annotatedImage: null,
      };
      const added = await projectService.addItemToProject(project.id!, payload);
      setShowNotInPlmConfirm(false);
      setNotInPlmPendingCode(null);
      // Open the edit modal immediately so the user can fill in details
      setNotInPlmEditItem(added);
    } catch (err) {
      console.error("[AddStylesModal] Failed to add not-in-PLM item:", err);
      onError?.(err instanceof Error ? err.message : "Failed to add item.");
      setShowNotInPlmConfirm(false);
      setNotInPlmPendingCode(null);
    } finally {
      setIsAddingNotInPlm(false);
    }
  }, [project, notInPlmPendingCode, onError]);

  const handleCancelNotInPlm = useCallback(() => {
    setShowNotInPlmConfirm(false);
    setNotInPlmPendingCode(null);
  }, []);

  const handleNotInPlmEditSave = useCallback(async (_updated: ProjectItem) => {
    setNotInPlmEditItem(null);
    // Refresh the project list so the parent table reflects the new item
    const allProjects = await projectService.getAllProjects();
    const refreshed = allProjects.find((p) => p.id === project.id);
    if (refreshed) onAddStyles(refreshed);
    onClose();
  }, [project, onAddStyles, onClose]);

  const handleAddStyle = async (e: React.FormEvent) => {
    e.preventDefault();

    const manualCode = manualInput.trim();
    if (manualCode) {
      await manualQrInput(manualCode);
    }
  };

  const handleQrImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qrCode = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
          );
          if (qrCode && qrCode.data) {
            playBeep();
            const rawCode = qrCode.data.trim();
            setLastScannedItem(rawCode);
            setTimeout(() => {
              setLastScannedItem(null);
            }, 3000);
            await manualQrInput(rawCode);
          } else {
            console.error(
              "[AddStylesModal] No QR code found in the uploaded image.",
            );
            onError?.("No QR code found in the uploaded image.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };


  // Stable ref for manualQrInput to prevent the scan loop from tearing down/restarting on every render
  const manualQrInputRef = useRef(manualQrInput);
  useEffect(() => {
    manualQrInputRef.current = manualQrInput;
  }, [manualQrInput]);

  useEffect(() => {

    if (!isScanning || !isOpen || !hasCameraPermission) return;

    // ✅ 2: Reset last-seen QR so the same code can be re-scanned in a new session
    lastQrRef.current = "";

    let timer: ReturnType<typeof setTimeout>;
    let isCancelled = false;
    let isProcessing = false;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const scan = async () => {
      // ✅ 9: Stop immediately if modal closed or scanning stopped
      if (isCancelled || isProcessing) return;

      const video = videoRef.current;

      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        context
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0);

        const imageData = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );

        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

        if (qrCode?.data) {
          const rawCode = qrCode.data.trim();

          // ✅ 2: Skip if same QR code is still in frame (camera hasn't moved away)
          if (rawCode === lastQrRef.current) {
            timer = setTimeout(scan, 200);
            return;
          }
          lastQrRef.current = rawCode;

          isProcessing = true;

          // ✅ 10: Structured debug log for production debugging
          console.debug("[QR Scanner]", {
            code: rawCode,
            width: canvas.width,
            height: canvas.height,
            timestamp: new Date().toISOString(),
          });

          playBeep();

          // ✅ 3: Use ref so the timeout is properly cancelled if the modal closes
          if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
          setLastScannedItem(rawCode);
          overlayTimeoutRef.current = setTimeout(() => {
            setLastScannedItem(null);
            overlayTimeoutRef.current = null;
          }, 3000);

          setIsScanning(false);

          try {
            await manualQrInputRef.current(rawCode);
          } catch (err) {
            // ✅ 11: Resume scanner on backend failure instead of leaving user stuck
            console.error("[QR Scanner] Backend processing failed:", err);
            setScanError("Unable to process QR. Please try again.");
            setIsScanning(true);
          } finally {
            isProcessing = false;
          }

          return;
        }
      }

      if (!isCancelled && isScanning) {
        timer = setTimeout(scan, 200);
      }
    };

    scan();

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isScanning, isOpen, hasCameraPermission]);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Add Styles / Items">
      <form onSubmit={handleAddStyle} className={styles.editForm}>
        {/* Scan a QR Code Card */}
        <div
          className={`${styles.card} ${lastScannedItem && lastScannedItem.startsWith("QR-") ? styles.successHighlight : ""}`}
        >
          <div className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>Scan a QR Code</h4>
          </div>

          <div className={styles.scannerViewport}>
            {isScanning ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={styles.videoElement}
                  style={{ display: hasCameraPermission ? "block" : "none" }}
                  onLoadedMetadata={() => {
                    // iOS Safari fallback: call play() when stream metadata is ready.
                    // This handles cases where the explicit play() in startCamera fires
                    // before the video element is fully ready to accept the stream.
                    videoRef.current?.play().catch(() => {});
                  }}
                />
                {!hasCameraPermission && (
                  <div className={styles.scannerPlaceholder}>
                    <QrCode
                      size={36}
                      className={`animate-pulse ${styles.pulseQrIcon}`}
                    />
                    <span className={styles.pulseQrText}>
                      {scanError || "Initializing camera..."}
                    </span>
                  </div>
                )}
                <div className={styles.scanLaser} />
                <div className={styles.scanBorders} />
                {lastScannedItem && (
                  <div className={styles.scannerOverlayText}>
                    Scanned: {lastScannedItem}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.scannerPlaceholder}>
                <Camera size={36} className={styles.inactiveCameraIcon} />
                <span className={styles.inactiveCameraText}>
                  Camera preview is inactive
                </span>
              </div>
            )}
          </div>

          <div className={styles.scannerButtons}>
            <Button
              type="button"
              variant={isScanning ? "danger" : "primary"}
              className={styles.startScanButton}
              onClick={() => setIsScanning((prev) => !prev)}
              icon={
                isScanning ? <AlertCircle size={16} /> : <Camera size={16} />
              }
            >
              {isScanning ? "Stop Scanning" : "Start Scanning"}
            </Button>

            <div className={styles.fileUploadWrapper}>
              <label htmlFor="qrImageUpload" className={styles.fileUploadLabel}>
                <Plus size={16} /> Upload QR Image
              </label>
              <input
                type="file"
                id="qrImageUpload"
                accept="image/*"
                onChange={handleQrImageUpload}
                className={styles.fileInputHidden}
              />
            </div>
          </div>

          <div className={styles.tipBox}>
            <strong>How to use:</strong> Click "Start Scanning" to use your
            camera, or click "Upload QR Image" to upload a QR code image. The
            item will be automatically added to your project once parsed and
            validated.
          </div>
        </div>

        {/* Manual Entry Card */}
        <div
          className={`${styles.card} ${lastScannedItem && !lastScannedItem.startsWith("QR-") ? styles.successHighlight : ""}`}
        >
          <h4 className={styles.cardTitle}>Manual Entry</h4>

          <Input
            label="Enter QR Code or Item ID"
            type="text"
            id="manualQrInput"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={handleManualInputKeyDown}
            placeholder="Type or paste QR code content..."
            fullWidth
          />

          <div className={styles.manualTipBox}>
            Use this option if you don't have camera access or want to manually
            add items.
          </div>
        </div>

        <div className={styles.formActions}>
          <Button
            type="button"
            onClick={onClose}
            disabled={isAddingStyle}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={styles.saveBtn}
            disabled={isAddingStyle || !manualInput.trim()}
            icon={<Plus size={14} />}
            variant="primary"
          >
            {isAddingStyle ? "Adding..." : `Add to Project`}
          </Button>
        </div>
      </form>
    </Modal>

    {/* ── Not-in-PLM: confirmation popup ──────────────────────────────────── */}
    <ConfirmModal
      isOpen={showNotInPlmConfirm}
      title="Item Not Found in PLM"
      message={
        <>
          <strong>&ldquo;{notInPlmPendingCode}&rdquo;</strong> was not found in PLM.
          <br />
          Do you want to add this item to the project anyway?
        </>
      }
      confirmLabel="Yes, Add to Project"
      confirmingLabel="Adding…"
      confirmVariant="primary"
      isConfirming={isAddingNotInPlm}
      onConfirm={handleConfirmAddNotInPlm}
      onCancel={handleCancelNotInPlm}
    />

    {/* ── Not-in-PLM: edit details popup (opens right after add) ──────────── */}
    {notInPlmEditItem && (
      <EditItemModal
        isOpen={true}
        onClose={() => {
          setNotInPlmEditItem(null);
          onClose();
        }}
        item={notInPlmEditItem}
        onSave={handleNotInPlmEditSave}
        onError={onError}
        plmImageUrl={null}
        isLoadingPlmImage={false}
        plmImageError={null}
      />
    )}
  </>
  );
}
