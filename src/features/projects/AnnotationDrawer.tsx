import { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
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

  const currentItemId = item?.id ?? null;
  if (currentItemId !== prevItemId || isOpen !== prevIsOpen) {
    setPrevItemId(currentItemId);
    setPrevIsOpen(isOpen);
    setSkippedToTemplate(false);
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
    const shouldWait = (isLoadingPlmImage || plmImageError) && !skippedToTemplate;
    if (!isOpen || !item || !containerRef.current || shouldWait) return;

    const initialImage = item.annotatedImage || (skippedToTemplate ? null : plmImageUrl) || DEFAULT_GARMENT_SVG;

    console.log(`[DEBUG PLM Image] AnnotationDrawer initializing ImageEditor for Style ${item.styleMaterialNumber}:`, {
      annotatedImage: item.annotatedImage,
      plmImageUrl: plmImageUrl ? plmImageUrl.substring(0, 50) + "..." : null,
      usingFallback: !item.annotatedImage && (!plmImageUrl || skippedToTemplate)
    });

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

      return () => {
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
        }
      };
    } catch (err) {
      console.error('Failed to initialize image editor:', err);
      setTimeout(() => {
        setErrorMsg('Could not initialize the image editor component.');
      }, 0);
    }
  }, [isOpen, item, menuPosition, plmImageUrl, isLoadingPlmImage, plmImageError, skippedToTemplate]);

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

  const handleSaveClick = async () => {
    if (!item?.id || !editorRef.current) return;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      // Export as JPEG at 80% quality — reduces payload from ~10 MB (PNG) to <1 MB
      const dataUrl = editorRef.current.toDataURL({ format: 'jpeg', quality: 0.8 });
      await onSave(item.id, dataUrl);
      onClose();
    } catch (err) {
      console.error('Failed to save annotated image:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save annotation changes.');
    } finally {
      setIsSaving(false);
    }
  };

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
            Annotate Item: {item?.styleMaterialNumber || 'Image'}
          </h3>
          <Button
            variant="text"
            icon={<X size={20} />}
            onClick={onClose}
            aria-label="Close panel"
          />
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className={styles.drawerErrorBanner}>
            {errorMsg}
          </div>
        )}

        {/* Editor — fills all remaining space between header and footer */}
        <div className={styles.editorContainer}>
          {isLoadingPlmImage && !skippedToTemplate && (
            <div className={styles.drawerLoadingOverlay}>
              <div className={styles.drawerLoadingSpinner} />
              <span className={styles.drawerLoadingText}>Fetching Style image from PLM...</span>
            </div>
          )}
          {plmImageError && !skippedToTemplate && (
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
          {!item?.annotatedImage && plmImageUrl && !isLoadingPlmImage && !plmImageError && !skippedToTemplate && (
            <div className={styles.fallbackBadge}>
              Using PLM Style Image
            </div>
          )}
          <div ref={containerRef} style={{ width: '100%', height: '100%', display: ((isLoadingPlmImage || plmImageError) && !skippedToTemplate) ? 'none' : 'block' }} />
        </div>

        {/* Action Footer */}
        <div className={styles.drawerFooter}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            icon={<X size={14} />}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveClick}
            disabled={isSaving || !item}
            icon={<Check size={14} />}
          >
            {isSaving ? 'Saving...' : 'Save Annotation'}
          </Button>
        </div>
      </div>
    </>
  );
}
