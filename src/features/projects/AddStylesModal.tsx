import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Plus, Camera, QrCode, AlertCircle } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { projectService, type ProjectItem } from '../../services/projectService';
import type { TableType } from '../../types/table';
import { odata2style, odata2material } from '../../services/api';
import { extractODataList } from '../../utils/odata';
import styles from './AddStylesModal.module.scss';

interface AddStylesModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: TableType;
  existingItems?: ProjectItem[];
  onAddStyles: (updated: TableType) => void;
  onError?: (message: string) => void;
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
  const [manualInput, setManualInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lastScannedItem, setLastScannedItem] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn('AudioContext beep failed:', e);
    }
  };

  // Manage WebRTC camera stream lifecycle
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      if (isScanning && isOpen) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: 'environment',
              width: { ideal: 640 },
              height: { ideal: 480 }
            }
          });
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
              console.warn('[AddStylesModal] video.play() failed (may be normal if already playing):', playErr);
            }
          }
          setHasCameraPermission(true);
          setScanError('');
        } catch (err) {
          console.warn('Camera access denied or unavailable:', err);
          setHasCameraPermission(false);
          setScanError('Camera not available or access denied. Showing scanner simulation.');
        }
      }
    };

    void startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isScanning, isOpen]);



  const handleManualInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const form = e.currentTarget.closest('form');
      if (form) {
        form.requestSubmit();
      }
    }
  };

  /**
   * Fetches the style/material details from the OData Service and validates its existence.
   * Throws detailed errors if validation fails or duplicates are found.
   */
  const fetchAndValidateStyle = useCallback(async (code: string, skipDuplicateCheck = false): Promise<{ styleObj: any; itemType: 'Style' | 'Material' }> => {
    if (!skipDuplicateCheck) {
      // Check for duplicate in current project items
      const isDuplicateInProject = existingItems?.some(
        (item) => item.styleMaterialNumber.toLowerCase() === code.toLowerCase()
      );
      if (isDuplicateInProject) {
        throw new Error(`Item "${code}" already exists in this project`);
      }
    }

    // Determine parameter: numeric-only -> ID; alphanumeric -> Code
    const isNum = code.length > 0 && /^\d+$/.test(code);

    // 1. Try style lookup
    try {
      const styleQueryParams = isNum 
        ? { StyleId: Number(code) } 
        : { search: code };

      const response = await odata2style.getStyleData(styleQueryParams);
      const styleList = extractODataList<any>(response);

      if (styleList.length > 0) {
        return {
          styleObj: styleList[0],
          itemType: 'Style' as const
        };
      }
    } catch (err) {
      console.log('[AddStylesModal] Style lookup failed, checking material...', err);
    }

    // 2. Try material lookup
    try {
      const materialQueryParams = isNum 
        ? { MaterialId: Number(code) } 
        : { search: code };

      console.log('[AddStylesModal] Initiating Material lookup with query params:', JSON.stringify(materialQueryParams, null, 2));
      const response = await odata2material.getMaterialData(materialQueryParams);
      console.log('[AddStylesModal] Material lookup response received:', response ? 'Yes (length: ' + JSON.stringify(response).length + ')' : 'No');
      const materialList = extractODataList<any>(response);
      console.log('[AddStylesModal] Extracted materialList count:', materialList.length);

      if (materialList.length > 0) {
        console.log('[AddStylesModal] Found Material in PLM:', JSON.stringify(materialList[0], null, 2));
        return {
          styleObj: materialList[0],
          itemType: 'Material' as const
        };
      } else {
        console.log('[AddStylesModal] Material list is empty for code:', code);
      }
    } catch (err) {
      console.error('[AddStylesModal] Material lookup failed with error:', err);
    }

    throw new Error('Item not found as Style or Material in PLM.');
  }, [existingItems]);

  /** Returns today's date as a YYYY-MM-DD string. */
  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  /**
   * Maps Infor OData Style/Material metadata to the database schema structure.
   */
  const mapODataStyleToItemPayload = useCallback((
    code: string, 
    styleObj: any,
    itemType: 'Style' | 'Material'
  ): Omit<ProjectItem, 'id' | 'projectId'> => {
    const styleNameStr = (styleObj.Name as string) || (styleObj.MaterialName as string) || (styleObj.Description as string) || code.replace(/^QR-/, '');
    const styleId = styleObj.StyleId || styleObj.MaterialId || styleObj.Id || 0;
    const styleMaterialNum = itemType === 'Style' ? (styleObj.StyleCode || code) : (styleObj.MaterialCode || code);

    return {
      styleId: Number(styleId),
      colorId: 0,
      styleMaterialNumber: styleMaterialNum,
      styleMaterialName: styleNameStr,
      itemType: itemType,
      colorway: '',
      colorwayStatus: 'Pending',
      selectionCondition: 'As-Is',
      sampleDue: getTodayDateString(),
      buyerComments: '',
      internalComments: '',
    };
  }, []);

  /**
   * Validates, structures, and adds a Style Number to the project.
   */
  const manualQrInput = useCallback(async (code: string) => {
    if (!project?.id || !code.trim()) return;

    let styleNumber = code.trim();
    // Parse the QR code response format (e.g. Style Number:WS260041,Style Name:DMAGIC,Brand:Crossline)
    const match = styleNumber.match(/Style\s+Number\s*:\s*([^,]+)/i);
    if (match) {
      styleNumber = match[1].trim();
    }

    setIsAddingStyle(true);
    try {
      const { styleObj, itemType } = await fetchAndValidateStyle(styleNumber);
      const payload = mapODataStyleToItemPayload(styleNumber, styleObj, itemType);
      await projectService.addItemToProject(project.id!, payload);

      const allProjects = await projectService.getAllProjects();
      const updated = allProjects.find((p) => p.id === project.id);
      if (updated) onAddStyles(updated);
      onClose();
    } catch (err) {
      console.error('[AddStylesModal] Failed to add style via manualQrInput:', err);
      onError?.(err instanceof Error ? err.message : 'Style not found.');
    } finally {
      setIsAddingStyle(false);
    }
  }, [project, fetchAndValidateStyle, mapODataStyleToItemPayload, onAddStyles, onClose, onError]);

  const handleAddStyle = async (e: React.FormEvent) => {
    e.preventDefault();

    const manualCode = manualInput.trim();
    if (manualCode) {
      await manualQrInput(manualCode);
    }
  };

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
          if (qrCode && qrCode.data) {
            playBeep();
            const rawCode = qrCode.data.trim();
            setLastScannedItem(rawCode);
            setTimeout(() => {
              setLastScannedItem(null);
            }, 3000);
            await manualQrInput(rawCode);
          } else {
            console.error('[AddStylesModal] No QR code found in the uploaded image.');
            onError?.('No QR code found in the uploaded image.');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Continuous scanning loop using requestAnimationFrame when camera is active
  useEffect(() => {
    let animationFrameId: number;
    let canvas: HTMLCanvasElement | null = null;
    let context: CanvasRenderingContext2D | null = null;

    const scanFrame = async () => {
      if (!isScanning || !isOpen) return;

      const video = videoRef.current;
      // Use readyState >= 2 (HAVE_CURRENT_DATA) instead of === HAVE_ENOUGH_DATA (4).
      // Mobile browsers (iOS/Android) often stay at readyState 3 (HAVE_FUTURE_DATA)
      // and never reach 4, causing the scan loop to never capture a frame.
      if (video && video.readyState >= 2) {
        if (!canvas) {
          canvas = document.createElement('canvas');
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (!context) {
          context = canvas.getContext('2d');
        }

        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (qrCode && qrCode.data) {
            const rawCode = qrCode.data.trim();
            console.log('[AddStylesModal] 📷 Decoded QR code from camera stream:', rawCode);

            playBeep();
            setLastScannedItem(rawCode);
            setTimeout(() => {
              setLastScannedItem(null);
            }, 3000);

            setIsScanning(false);
            await manualQrInput(rawCode);
            return;
          }
        }
      }

      // Add a slight delay to avoid blocking the main thread and improve UI responsiveness
      setTimeout(() => {
        if (isScanning && isOpen && hasCameraPermission) {
          animationFrameId = requestAnimationFrame(scanFrame);
        }
      }, 150);
    };

    if (isScanning && isOpen && hasCameraPermission) {
      animationFrameId = requestAnimationFrame(scanFrame);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScanning, isOpen, hasCameraPermission, manualQrInput]);

  // Simulate barcode scanning intervals when scanner is active but camera is not available
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;

    if (isScanning && isOpen && !hasCameraPermission) {
      timerId = setInterval(async () => {
        // Simulating a valid QR response string for A10001 which is present in PLM mock database
        const itemCode = 'Style Number:A10001,Style Name:Lewis Shirt Floral Recycled Polyester,Brand:Crossline';

        playBeep();
        setLastScannedItem(itemCode);
        setTimeout(() => {
          setLastScannedItem(null);
        }, 2000);

        setIsScanning(false);
        await manualQrInput(itemCode);
      }, 3000);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isScanning, isOpen, hasCameraPermission, manualQrInput]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Add Styles / Items"
    >
      <form onSubmit={handleAddStyle} className={styles.editForm}>
        {/* Scan a QR Code Card */}
        <div className={`${styles.card} ${lastScannedItem && lastScannedItem.startsWith('QR-') ? styles.successHighlight : ''}`}>
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
                  style={{ display: hasCameraPermission ? 'block' : 'none' }}
                  onLoadedMetadata={() => {
                    // iOS Safari fallback: call play() when stream metadata is ready.
                    // This handles cases where the explicit play() in startCamera fires
                    // before the video element is fully ready to accept the stream.
                    videoRef.current?.play().catch(() => {});
                  }}
                />
                {!hasCameraPermission && (
                  <div className={styles.scannerPlaceholder}>
                    <QrCode size={36} className={`animate-pulse ${styles.pulseQrIcon}`} />
                    <span className={styles.pulseQrText}>
                      {scanError || 'Initializing camera...'}
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
                <span className={styles.inactiveCameraText}>Camera preview is inactive</span>
              </div>
            )}
          </div>

          <div className={styles.scannerButtons}>
            <Button
              type="button"
              variant={isScanning ? 'danger' : 'primary'}
              className={styles.startScanButton}
              onClick={() => setIsScanning(prev => !prev)}
              icon={isScanning ? <AlertCircle size={16} /> : <Camera size={16} />}
            >
              {isScanning ? 'Stop Scanning' : 'Start Scanning'}
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
            <strong>How to use:</strong> Click "Start Scanning" to use your camera, or click "Upload QR Image" to upload a QR code image. The item will be automatically added to your project once parsed and validated.
          </div>
        </div>

        {/* Manual Entry Card */}
        <div className={`${styles.card} ${lastScannedItem && !lastScannedItem.startsWith('QR-') ? styles.successHighlight : ''}`}>
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
            Use this option if you don't have camera access or want to manually add items.
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
            {isAddingStyle ? 'Adding...' : `Add to Project`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
