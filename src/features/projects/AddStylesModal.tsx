import React, { useState, useEffect, useRef } from 'react';
import { Plus, Camera, QrCode, AlertCircle } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { projectService, type ProjectItem } from '../../services/projectService';
import type { TableType } from '../../types/table';
import { odata2style } from '../../services/api';
import type { StyleObject } from '../../types/api';
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
  const [scannedItems, setScannedItems] = useState<string[]>([]);

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
            video: { facingMode: 'environment' }
          });
          activeStream = stream;
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
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
    };
  }, [isScanning, isOpen]);

  // Simulate barcode scanning intervals when scanner is active
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;

    if (isScanning && isOpen) {
      timerId = setInterval(() => {
        const randId = Math.floor(1000 + Math.random() * 9000);
        const itemCode = `QR-ITEM-${randId}`;

        // Ensure we don't scan duplicates in simulation
        const existsInProject = existingItems?.some(
          (item) => item.styleMaterialNumber.toLowerCase() === itemCode.toLowerCase()
        );
        const existsInScanned = scannedItems.some(
          (item) => item.toLowerCase() === itemCode.toLowerCase()
        );

        if (!existsInProject && !existsInScanned) {
          playBeep();
          setScannedItems(prev => [...prev, itemCode]);
          setLastScannedItem(itemCode);

          setTimeout(() => {
            setLastScannedItem(null);
          }, 2000);
        }
      }, 3000);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isScanning, isOpen, existingItems, scannedItems]);


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
   * Fetches the style details from the OData Service and validates its existence.
   * Throws detailed errors if validation fails or duplicates are found.
   */
  const fetchAndValidateStyle = async (code: string, skipDuplicateCheck = false): Promise<StyleObject & Record<string, unknown>> => {
    if (!skipDuplicateCheck) {
      // Check for duplicate in current project items
      const isDuplicateInProject = existingItems?.some(
        (item) => item.styleMaterialNumber.toLowerCase() === code.toLowerCase()
      );
      if (isDuplicateInProject) {
        throw new Error(`Item "${code}" already exists in this project`);
      }

      // Check for duplicate in current scan list
      const isDuplicateInScanned = scannedItems.some(
        (item) => item.toLowerCase() === code.toLowerCase()
      );
      if (isDuplicateInScanned) {
        throw new Error(`Item "${code}" is already in the list to be added`);
      }
    }

    // Determine parameter: numeric-only -> StyleId; alphanumeric -> StyleCode
    const isNum = code.length > 0 && /^\d+$/.test(code);
    const queryParams: { StyleId?: number; StyleCode?: string } = isNum 
      ? { StyleId: Number(code) } 
      : { StyleCode: code };

    const response = await odata2style.getStyleData(queryParams);
    
    // Normalize wrapped OData formats (e.g. value, d.results, array, or object)
    const styleList = extractODataList<StyleObject>(response);

    if (styleList.length === 0) {
      throw new Error('Style not found.');
    }

    return styleList[0] as StyleObject & Record<string, unknown>;
  };

  /** Returns today's date as a YYYY-MM-DD string. */
  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  /**
   * Maps Infor OData Style metadata to the database schema structure.
   */
  const mapODataStyleToItemPayload = (code: string, styleObj: StyleObject & Record<string, unknown>): Omit<ProjectItem, 'id' | 'projectId'> => {
    const styleNameStr = (styleObj.Name as string) || code.replace(/^QR-/, '');

    return {
      styleId: styleObj.StyleId || 0,
      colorId: 0,
      styleMaterialNumber: code,
      styleMaterialName: styleNameStr,
      colorway: '',
      colorwayStatus: 'Pending',
      selectionCondition: 'As-Is',
      sampleDue: getTodayDateString(),
      buyerComments: '',
      internalComments: '',
    };
  };

  const handleAddStyle = async (e: React.FormEvent) => {
    e.preventDefault();

    const manualCode = manualInput.trim();
    const scannedCodes = [...scannedItems];

    if (!project?.id || (scannedCodes.length === 0 && !manualCode)) return;

    setIsAddingStyle(true);
    try {
      let plmStyle: (StyleObject & Record<string, unknown>) | null = null;
      if (manualCode) {
        plmStyle = await fetchAndValidateStyle(manualCode);
      }

      const todayStr = getTodayDateString();

      if (scannedCodes.length > 0) {
        await Promise.all(
          scannedCodes.map(async (code) => {
            let styleId = 0;
            let styleMaterialName = code.replace(/^QR-/, '');
            try {
              const plmStyle = await fetchAndValidateStyle(code, true);
              if (plmStyle) {
                styleId = plmStyle.StyleId || 0;
                styleMaterialName = (plmStyle.Name as string) || styleMaterialName;
              }
            } catch (err) {
              console.warn(`[AddStylesModal] Failed to resolve scanned code ${code} against PLM:`, err);
            }
            return projectService.addItemToProject(project.id!, {
              styleId,
              styleMaterialNumber: code,
              styleMaterialName,
              colorway: '',
              colorwayStatus: 'Pending',
              selectionCondition: 'As-Is',
              sampleDue: todayStr,
              buyerComments: '',
              internalComments: '',
            });
          })
        );
      }

      if (manualCode && plmStyle) {
        const payload = mapODataStyleToItemPayload(manualCode, plmStyle);
        await projectService.addItemToProject(project.id!, payload);
      }

      const allProjects = await projectService.getAllProjects();
      const updated = allProjects.find((p) => p.id === project.id);
      if (updated) onAddStyles(updated);
      onClose();
    } catch (err) {
      console.error('[AddStylesModal] Failed to add styles:', err);
      onError?.(err instanceof Error ? err.message : 'Style not found.');
    } finally {
      setIsAddingStyle(false);
    }
  };

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
                {hasCameraPermission ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={styles.videoElement}
                  />
                ) : (
                  <div className={styles.scannerPlaceholder}>
                    <QrCode size={36} className={`animate-pulse ${styles.pulseQrIcon}`} />
                    <span className={styles.pulseQrText}>
                      {scanError || 'Simulating scanner...'}
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

          <Button
            type="button"
            variant={isScanning ? 'danger' : 'primary'}
            className={styles.startScanButton}
            onClick={() => setIsScanning(prev => !prev)}
            icon={isScanning ? <AlertCircle size={16} /> : <Camera size={16} />}
          >
            {isScanning ? 'Stop Scanning' : 'Start Scanning'}
          </Button>

          <div className={styles.tipBox}>
            <strong>How to use:</strong> Click "Start Scanning" and point your camera at a QR code. The item will be automatically added to your project once scanned.
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
            disabled={isAddingStyle || (scannedItems.length === 0 && !manualInput.trim())}
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
