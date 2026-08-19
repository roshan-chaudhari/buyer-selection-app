import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import ImageEditor from 'tui-image-editor';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';
import Button from '../../components/Button';
import styles from './AnnotationDrawer.module.scss';
import { projectService, type ProjectItem } from '../../services/projectService';
import { DEFAULT_GARMENT_SVG } from './constants';

interface AnnotationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: ProjectItem | null;
  projectName?: string;
  onSave: (itemId: number, annotatedDataUrl: string) => Promise<void>;
  plmImageUrl: string | null;
  isLoadingPlmImage: boolean;
  plmImageError: string | null;
  onRetryFetch: () => void;
  isLocked?: boolean;
}

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

function formatDisplayImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return url;
  }
  if (url.includes('/api/projects/proxy-image') || url.includes('/api/projects/s3-image')) {
    return url;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `${defaultBaseUrl}/api/projects/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function getMenuPosition(): 'left' | 'bottom' {
  const width = document.documentElement.clientWidth || window.innerWidth;
  return width < 1024 ? 'bottom' : 'left';
}

export default function AnnotationDrawer({
  isOpen,
  onClose,
  item,
  projectName,
  onSave,
  plmImageUrl,
  isLoadingPlmImage,
  plmImageError,
  onRetryFetch,
  isLocked = false,
}: AnnotationDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ImageEditor | null>(null);
  const lastLoadedUrlRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<'left' | 'bottom'>(getMenuPosition);

  // local skippedToTemplate bypass state
  const [skippedToTemplate, setSkippedToTemplate] = useState(false);

  const [prevItemId, setPrevItemId] = useState<number | null>(null);
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  // Multi-image list state (stores custom S3 / edited image URLs only)
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const currentItemId = item?.id ?? null;
  if (currentItemId !== prevItemId || isOpen !== prevIsOpen) {
    setPrevItemId(currentItemId);
    setPrevIsOpen(isOpen);
    setSkippedToTemplate(false);
    lastLoadedUrlRef.current = null;

    // Parse annotatedImage array of strings
    let list: string[] = [];

    if (isOpen && item?.annotatedImage) {
      const raw = String(item.annotatedImage).trim();
      if (raw && raw !== '[]' && raw !== 'null' && raw !== 'undefined' && raw !== '""') {
        if (raw.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              list = parsed
                .map((x) => {
                  if (x && typeof x === 'object') {
                    return x.annotated || x.original || '';
                  }
                  return String(x || '').trim();
                })
                .filter((url) => url && url !== 'null' && url !== 'undefined' && url !== '[]');
            }
          } catch (e) {
            list = [raw];
          }
        } else {
          list = [raw];
        }
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

    // Load initial image on mount/open -> Always open clean Original PLM Image
    const initialRaw = (skippedToTemplate ? null : plmImageUrl)
      || images[0]
      || DEFAULT_GARMENT_SVG;
    const initialImage = formatDisplayImageUrl(initialRaw);
    lastLoadedUrlRef.current = initialImage;

    console.log(`[PERFORMANCE LOG] Initializing ImageEditor for Style ${item.styleMaterialNumber}. Initial image source: ${initialImage.substring(0, 50)}...`);
    const editorInitStart = performance.now();

    try {
      const editor = new ImageEditor(containerRef.current, {
        includeUI: {
          loadImage: {
            path: initialImage,
            name: `Style-${item.styleMaterialNumber}`,
          },
          menu: isLocked ? [] : ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
          initMenu: isLocked ? '' : 'draw',
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

    if (!plmImageUrl && images.length === 0 && !skippedToTemplate) {
      // Wait for PLM image load
      return;
    }

    const startTime = performance.now();
    let targetImage = DEFAULT_GARMENT_SVG;
    if (currentIndex === 0) {
      targetImage = (skippedToTemplate ? null : plmImageUrl) || DEFAULT_GARMENT_SVG;
    } else if (images[currentIndex - 1]) {
      targetImage = images[currentIndex - 1];
    }

    const resolvedUrl = formatDisplayImageUrl(targetImage);

    // Prevent redundant reload if image is already loaded
    if (lastLoadedUrlRef.current === resolvedUrl) {
      return;
    }
    lastLoadedUrlRef.current = resolvedUrl;

    console.log(`[PERFORMANCE LOG] Loading URL: ${resolvedUrl.substring(0, 50)}...`);

    editorRef.current.loadImageFromURL(resolvedUrl, `Image-${currentIndex}`)
      .then(() => {
        const endTime = performance.now();
        console.log(`[PERFORMANCE LOG] Image loaded & rendered successfully inside editor. Duration: ${(endTime - startTime).toFixed(2)}ms`);
      })
      .catch((err) => {
        console.warn("[AnnotationDrawer] Failed to load image in editor, falling back to PLM image:", err);
        if (plmImageUrl && resolvedUrl !== formatDisplayImageUrl(plmImageUrl)) {
          const fallback = formatDisplayImageUrl(plmImageUrl);
          lastLoadedUrlRef.current = fallback;
          editorRef.current?.loadImageFromURL(fallback, `PLM-Fallback`).catch(() => {});
        }
      });
  }, [currentIndex, images, plmImageUrl, skippedToTemplate, isOpen]);

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
        if (currentIndex > 0) {
          setImages(prev => {
            const next = [...prev];
            if (next.length >= currentIndex) {
              next[currentIndex - 1] = dataUrl;
            }
            return next;
          });
        }
        return dataUrl;
      } catch (e) {
        console.error("Failed to extract edited image:", e);
      }
    }
    return null;
  };

  const handlePrev = async () => {
    if (currentIndex > 0) {
      saveCurrentImageToState();
      const nextIdx = currentIndex - 1;
      setCurrentIndex(nextIdx);
      const nextUrl = formatDisplayImageUrl(
        nextIdx === 0
          ? ((skippedToTemplate ? null : plmImageUrl) || DEFAULT_GARMENT_SVG)
          : images[nextIdx - 1]
      );
      lastLoadedUrlRef.current = nextUrl;
      if (editorRef.current) {
        await editorRef.current.loadImageFromURL(nextUrl, `Image-${nextIdx}`).catch(() => {});
      }
    }
  };

  const handleNext = async () => {
    if (currentIndex < images.length) {
      saveCurrentImageToState();
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const nextUrl = formatDisplayImageUrl(images[nextIdx - 1]);
      lastLoadedUrlRef.current = nextUrl;
      if (editorRef.current) {
        await editorRef.current.loadImageFromURL(nextUrl, `Image-${nextIdx}`).catch(() => {});
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          lastLoadedUrlRef.current = base64;
          const nextIndex = images.length + 1;
          setImages(prev => [...prev, base64]);
          setCurrentIndex(nextIndex);

          if (editorRef.current) {
            await editorRef.current.loadImageFromURL(base64, `Upload-${nextIndex}`).catch((err) => {
              console.error("Failed to load uploaded image in editor:", err);
            });
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to load file:", err);
      setErrorMsg("Failed to load uploaded image.");
    }

    e.target.value = '';
  };

  const handleRemoveImage = async () => {
    if (!item?.id || currentIndex === 0) return;
    const targetIdx = currentIndex - 1;
    const removedImage = images[targetIdx];
    const updatedImages = images.filter((_, idx) => idx !== targetIdx);

    setIsSaving(true);
    try {
      if (removedImage && (removedImage.includes('amazonaws.com') || removedImage.includes('buyerapp-image'))) {
        await projectService.deleteImageFromS3(removedImage);
      }

      const serialized = updatedImages.length > 0 ? JSON.stringify(updatedImages) : '';
      await onSave(item.id, serialized);

      setImages(updatedImages);
      setCurrentIndex(0); // return to Original PLM image

      const fallback = formatDisplayImageUrl(plmImageUrl || DEFAULT_GARMENT_SVG);
      lastLoadedUrlRef.current = fallback;
      if (editorRef.current) {
        await editorRef.current.loadImageFromURL(fallback, 'PLM-Original').catch(() => {});
      }
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
      // 1. Collect existing S3 URLs in database before this save to remove replaced copies
      const oldS3Urls: string[] = [];
      if (item.annotatedImage) {
        const raw = String(item.annotatedImage).trim();
        if (raw.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((x) => {
                const u = typeof x === 'object' ? x.annotated || x.original : String(x || '');
                if (u && (u.includes('amazonaws.com') || u.includes('buyerapp-image'))) {
                  oldS3Urls.push(u);
                }
              });
            }
          } catch (e) {}
        } else if (raw.includes('amazonaws.com') || raw.includes('buyerapp-image')) {
          oldS3Urls.push(raw);
        }
      }

      let updatedImages = [...images];
      if (editorRef.current) {
        const dataUrl = editorRef.current.toDataURL({ format: 'jpeg', quality: 0.8 });
        if (currentIndex === 0) {
          // Saving new annotation created from the original PLM image
          updatedImages = [dataUrl, ...images.filter(x => !x.startsWith('data:'))];
        } else {
          // Updating existing annotation slot
          updatedImages[currentIndex - 1] = dataUrl;
        }
      }

      // 2. Upload only newly added/modified base64 images to S3
      const s3UrlImages = await Promise.all(
        updatedImages.map(async (img, idx) => {
          if (img && img.startsWith('data:')) {
            const ext = img.match(/^data:image\/(\w+);/)?.[1] || 'jpg';
            const fileName = `${item.styleMaterialNumber || 'style'}_${Date.now()}_${idx}.${ext}`;
            const s3Result = await projectService.uploadImageToS3({
              projectName: projectName || 'General',
              styleName: item.styleMaterialNumber || item.styleMaterialName || 'Style',
              base64Data: img,
              fileName,
              itemId: item.id,
            });
            return s3Result.url;
          }
          // Existing S3 URL -> do not re-upload
          return img;
        })
      );

      // 3. Clean up any previous S3 image copy that was replaced (prevents duplicate copies on S3!)
      const newUrlsSet = new Set(s3UrlImages);
      for (const oldUrl of oldS3Urls) {
        if (!newUrlsSet.has(oldUrl)) {
          console.log(`[AnnotationDrawer] Removing replaced S3 image copy: ${oldUrl}`);
          await projectService.deleteImageFromS3(oldUrl);
        }
      }

      const serialized = s3UrlImages.length > 0 ? JSON.stringify(s3UrlImages) : '';
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
      {/* Backdrop */}
      <div
        className={`${styles.drawerOverlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={`${styles.drawerPanel} ${isOpen ? styles.open : ''}`}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <h3 className={styles.drawerTitle}>
            Annotate Item: {item?.styleMaterialNumber} {isLocked ? "(Read-Only)" : ""}
          </h3>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className={styles.drawerErrorBanner}>
            {errorMsg}
          </div>
        )}

        {/* Editor — fills all remaining space between header and footer */}
        <div className={`${styles.editorContainer} ${isLocked ? styles.lockedContainer : ''}`}>
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

          <div
            ref={containerRef}
            style={{
              width: '100%',
              height: '100%',
              display: (shouldShowLoader || (plmImageError && !skippedToTemplate && !hasRealImage)) ? 'none' : 'block'
            }}
          />
        </div>

        {/* Footer Controls */}
        <div className={styles.drawerFooter}>
          <div className={styles.footerLeft}>
            {!isLocked && (
              <>
                <input
                  type="file"
                  id="drawer-image-upload"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <Button
                  variant="secondary"
                  onClick={() => document.getElementById('drawer-image-upload')?.click()}
                  icon={<Plus size={14} />}
                  disabled={isSaving}
                  title="Upload additional image"
                />

                {currentIndex > 0 && (
                  <Button
                    variant="danger"
                    onClick={handleRemoveImage}
                    disabled={isSaving}
                    icon={<Trash2 size={14} />}
                    title="Delete this annotation from S3"
                  />
                )}
              </>
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
                  title="Previous image"
                />
                <span
                  className={styles.imageCounter}
                  title={currentIndex === 0 ? "Original PLM Style Image" : `Annotation ${currentIndex}`}
                >
                  {currentIndex === 0 ? "Original (PLM)" : `Annotation ${currentIndex}/${images.length}`}
                </span>
                <Button
                  variant="text"
                  disabled={currentIndex >= images.length || isSaving}
                  onClick={handleNext}
                  icon={<ChevronRight size={16} />}
                  style={{ minWidth: 0, padding: '0.25rem' }}
                  title="Next image"
                />
              </div>
            </div>
          )}

          <div className={styles.footerRight}>
            <Button
              variant={isLocked ? "primary" : "outline"}
              onClick={onClose}
              disabled={isSaving}
            >
              {isLocked ? "Close" : "Cancel"}
            </Button>
            {!isLocked && (
              <Button
                variant="primary"
                onClick={handleSaveClick}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
