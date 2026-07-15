import { useEffect, useRef, useState } from 'react';
import { X, Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import ImageEditor from 'tui-image-editor';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';
import Button from '../../components/Button';
import styles from './AnnotationDrawer.module.scss';
import type { ProjectItem } from '../../services/projectService';
import { DEFAULT_GARMENT_SVG } from './constants';

interface AnnotationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: ProjectItem | null;
  onSave: (itemId: number, annotatedDataUrl: string) => Promise<void>;
  plmImageUrl: string | null;
  isLoadingPlmImage: boolean;
  plmImageError: string | null;
  onRetryFetch: () => void;
}

function getMenuPosition(): 'left' | 'bottom' {
  const width = document.documentElement.clientWidth || window.innerWidth;
  return width < 1024 ? 'bottom' : 'left';
}

export default function AnnotationDrawer({
  isOpen,
  onClose,
  item,
  onSave,
  plmImageUrl,
  isLoadingPlmImage,
  plmImageError,
  onRetryFetch,
}: AnnotationDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ImageEditor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<'left' | 'bottom'>(getMenuPosition);

  // local skippedToTemplate bypass state
  const [skippedToTemplate, setSkippedToTemplate] = useState(false);

  const [prevItemId, setPrevItemId] = useState<number | null>(null);
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  // Multi-image list state (stores base64 strings only)
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const currentItemId = item?.id ?? null;
  if (currentItemId !== prevItemId || isOpen !== prevIsOpen) {
    setPrevItemId(currentItemId);
    setPrevIsOpen(isOpen);
    setSkippedToTemplate(false);

    // Parse annotatedImage array of strings
    let list: string[] = [];
    const defaultOriginal = plmImageUrl || DEFAULT_GARMENT_SVG;

    if (isOpen && item?.annotatedImage) {
      const raw = item.annotatedImage;
      if (raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            list = parsed.map((x) => {
              if (x && typeof x === 'object') {
                return x.annotated || x.original || '';
              }
              return String(x);
            }).filter(Boolean);
          }
        } catch (e) {
          list = [raw];
        }
      } else {
        list = [raw];
      }
    }
    setImages(list);
    setCurrentIndex(0);
  }

  // Track viewport changes to update menu position
  useEffect(() => {
    const handleViewportResize = () => {
      const nextPos = getMenuPosition();
      setMenuPosition(prev => (prev !== nextPos ? nextPos : prev));
    };
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  // Initialize and destroy tui-image-editor instance
  useEffect(() => {
    if (!isOpen || !item || !containerRef.current) return;

    // Load initial image on mount/open
    const initialImage = images[0]
      || (skippedToTemplate ? null : plmImageUrl)
      || DEFAULT_GARMENT_SVG;

    console.log(`[PERFORMANCE LOG] Initializing ImageEditor for Style ${item.styleMaterialNumber}. Initial image source: ${initialImage.substring(0, 50)}...`);
    const editorInitStart = performance.now();

    try {
      const editor = new ImageEditor(containerRef.current, {
        includeUI: {
          loadImage: {
            path: initialImage,
            name: `Style-${item.styleMaterialNumber}`,
          },
          menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
          initMenu: 'draw',
          uiSize: {
            width: '100%',
            height: '100%',
          },
          menuBarPosition: menuPosition,
        },
        cssMaxWidth: 700,
        cssMaxHeight: 500,
        usageStatistics: false,
      });

      editorRef.current = editor;
      console.log(`[PERFORMANCE LOG] ImageEditor initialized. Duration: ${(performance.now() - editorInitStart).toFixed(2)}ms`);

      return () => {
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
          console.log("[PERFORMANCE LOG] ImageEditor destroyed.");
        }
      };
    } catch (err) {
      console.error('Failed to initialize image editor:', err);
      setTimeout(() => {
        setErrorMsg('Could not initialize the image editor component.');
      }, 0);
    }
  }, [isOpen, item?.id, menuPosition, skippedToTemplate]);

  // Load new image when index or plmImageUrl changes, without recreating the editor
  useEffect(() => {
    if (!editorRef.current || !isOpen) return;

    const hasSavedImages = images.length > 0;
    if (images.length === 0 && !plmImageUrl && !skippedToTemplate) {
      // Wait for PLM image load
      return;
    }

    const startTime = performance.now();
    console.log(`[PERFORMANCE LOG] Loading target image inside editor. Time: ${new Date().toISOString()}`);

    let targetImage = DEFAULT_GARMENT_SVG;
    if (hasSavedImages) {
      targetImage = images[currentIndex] || DEFAULT_GARMENT_SVG;
    } else if (!skippedToTemplate && plmImageUrl) {
      targetImage = plmImageUrl;
    }

    console.log(`[PERFORMANCE LOG] Loading URL: ${targetImage.substring(0, 50)}...`);

    editorRef.current.loadImageFromURL(targetImage, `Image-${currentIndex}`)
      .then(() => {
        const endTime = performance.now();
        console.log(`[PERFORMANCE LOG] Image loaded & rendered successfully inside editor. Duration: ${(endTime - startTime).toFixed(2)}ms`);
      })
      .catch((err) => {
        console.error("[PERFORMANCE LOG] Failed to load image in editor:", err);
      });
  }, [currentIndex, images.length, plmImageUrl, skippedToTemplate, isOpen]);

  // Disable background scrolling when the drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  const saveCurrentImageToState = () => {
    if (editorRef.current) {
      try {
        const dataUrl = editorRef.current.toDataURL({ format: 'jpeg', quality: 0.8 });
        setImages(prev => {
          const next = [...prev];
          if (currentIndex < next.length) {
            next[currentIndex] = dataUrl;
          }
          return next;
        });
        return dataUrl;
      } catch (e) {
        console.error("Failed to extract edited image:", e);
      }
    }
    return null;
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      saveCurrentImageToState();
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      saveCurrentImageToState();
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (editorRef.current) {
        // Reuse the existing Load functionality of tui-image-editor
        await editorRef.current.loadImageFromFile(file);
        
        // Extract base64 representing the loaded file
        const base64 = editorRef.current.toDataURL({ format: 'jpeg', quality: 0.8 });
        
        setImages(prev => {
          const updated = [...prev, base64];
          setCurrentIndex(updated.length - 1);
          return updated;
        });
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          if (base64) {
            setImages([base64]);
            setCurrentIndex(0);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error("Failed to load file:", err);
      setErrorMsg("Failed to load uploaded image.");
    }

    e.target.value = '';
  };

  const handleRemoveImage = async () => {
    if (!item?.id) return;
    const updatedImages = images.filter((_, idx) => idx !== currentIndex);

    setIsSaving(true);
    try {
      const serialized = updatedImages.length > 0 ? JSON.stringify(updatedImages) : '';
      await onSave(item.id, serialized);

      setImages(updatedImages);
      setCurrentIndex(prev => {
        if (updatedImages.length === 0) return 0;
        return Math.min(prev, updatedImages.length - 1);
      });
    } catch (err) {
      console.error("Failed to remove image:", err);
      setErrorMsg("Failed to remove image from database.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = async () => {
    if (!item?.id) return;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let updatedImages = [...images];
      if (editorRef.current) {
        const dataUrl = editorRef.current.toDataURL({ format: 'jpeg', quality: 0.8 });
        if (updatedImages.length > 0) {
          updatedImages[currentIndex] = dataUrl;
        } else {
          updatedImages = [dataUrl];
        }
      }

      const serialized = updatedImages.length > 0 ? JSON.stringify(updatedImages) : '';
      await onSave(item.id, serialized);
      onClose();
    } catch (err) {
      console.error('Failed to save annotated image:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save annotation changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasRealImage = images.length > 0;
  // Only display loader overlay when no saved images exist AND we are fetching PLM image
  const shouldShowLoader = !hasRealImage && isLoadingPlmImage && !skippedToTemplate;

  return (
    <>
      {/* Background Dimmer Backdrop */}
      <div
        className={`${styles.drawerOverlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={`${styles.drawerPanel} ${isOpen ? styles.open : ''}`}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <h3 className={styles.drawerTitle}>
            Annotate Item: {item?.styleMaterialNumber}
          </h3>
          {/* <Button
            variant="text"
            icon={<X size={20} />}
            onClick={onClose}
            aria-label="Close panel"
          /> */}
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className={styles.drawerErrorBanner}>
            {errorMsg}
          </div>
        )}

        {/* Editor — fills all remaining space between header and footer */}
        <div className={styles.editorContainer}>
          {shouldShowLoader && (
            <div className={styles.drawerLoadingOverlay}>
              <div className={styles.drawerLoadingSpinner} />
              <span className={styles.drawerLoadingText}>Fetching Style image from PLM...</span>
            </div>
          )}
          {plmImageError && !skippedToTemplate && !hasRealImage && (
            <div className={styles.drawerErrorContainer}>
              <span className={styles.drawerErrorText}>{plmImageError}</span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button variant="outline" onClick={onRetryFetch}>
                  Retry Fetch
                </Button>
                <Button variant="outline" onClick={() => setSkippedToTemplate(true)}>
                  Use Default Template
                </Button>
              </div>
            </div>
          )}
          {!hasRealImage && plmImageUrl && !isLoadingPlmImage && !plmImageError && !skippedToTemplate && (
            <div className={styles.fallbackBadge}>
              Using PLM Style Image
            </div>
          )}
          <div ref={containerRef} style={{ width: '100%', height: '100%', display: (shouldShowLoader || (plmImageError && !skippedToTemplate && !hasRealImage)) ? 'none' : 'block' }} />
        </div>

        {/* Action Footer — contains all action buttons for unified consistency */}
        <div className={styles.drawerFooter}>
          <div className={styles.footerLeft}>
            <input
              type="file"
              accept="image/*"
              id="drawer-image-upload"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById('drawer-image-upload')?.click()}
              icon={<Plus size={14} />}
              disabled={isSaving}
            />

            {images.length > 0 && (
              <Button
                variant="danger"
                onClick={handleRemoveImage}
                disabled={isSaving}
                icon={<Trash2 size={14} />}
              />
            )}
          </div>

          {images.length > 0 && (
            <div className={styles.footerCenter}>
              <div className={styles.navigationRow}>
                <Button
                  variant="text"
                  disabled={currentIndex === 0 || isSaving}
                  onClick={handlePrev}
                  icon={<ChevronLeft size={16} />}
                  style={{ minWidth: 0, padding: '0.25rem' }}
                />
                <span className={styles.imageCounter}>
                  {currentIndex + 1}/{images.length}
                </span>
                <Button
                  variant="text"
                  disabled={currentIndex === images.length - 1 || isSaving}
                  onClick={handleNext}
                  icon={<ChevronRight size={16} />}
                  style={{ minWidth: 0, padding: '0.25rem' }}
                />
              </div>
            </div>
          )}

          <div className={styles.footerRight}>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveClick}
              disabled={isSaving || !item}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
