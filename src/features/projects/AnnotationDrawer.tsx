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
  onImageDeleted?: (styleMaterialNumber: string) => void;
  plmImageUrl: string | null;
  isLoadingPlmImage: boolean;
  plmImageError: string | null;
  onRetryFetch: () => void;
  isLocked?: boolean;
}

import { formatDisplayImageUrl } from '../../utils/image';

/** Calculates editor menu position based on viewport width */
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
  onImageDeleted: _onImageDeleted,
  plmImageUrl: plmImageUrlProp,
  isLoadingPlmImage: isLoadingPlmImageProp,
  plmImageError: plmImageErrorProp,
  onRetryFetch,
  isLocked = false,
}: AnnotationDrawerProps) {
  // Non-PLM items are project-level only: never use / wait for / report on PLM images.
  const isNotInPlm = !!item?.notInPLM;
  const plmImageUrl = isNotInPlm ? null : plmImageUrlProp;
  const isLoadingPlmImage = isNotInPlm ? false : isLoadingPlmImageProp;
  const plmImageError = isNotInPlm ? null : plmImageErrorProp;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ImageEditor | null>(null);
  const lastLoadedUrlRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<'left' | 'bottom'>(getMenuPosition);

  // local skippedToTemplate bypass state
  const [skippedToTemplateState, setSkippedToTemplate] = useState(false);
  const skippedToTemplate = skippedToTemplateState || isNotInPlm;

  const [prevItemId, setPrevItemId] = useState<number | null>(null);
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  // Multi-image list state (stores custom S3 / edited image URLs only)
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const dirtyIndexesRef = useRef<Set<number>>(new Set());

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
    // Store annotations in `images` (excluding the permanent default PLM image)
    const annotationsOnly = list.filter((url) => !url.includes('_default_') && !url.includes('-default-'));
    setImages(annotationsOnly);
    // For PLM items, always start on Original (PLM) image (Index 0).
    // For non-PLM items with uploaded images, open directly on the first uploaded image (Index 1).
    setCurrentIndex(isNotInPlm && annotationsOnly.length > 0 ? 1 : 0);
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
    const initialRaw = (isNotInPlm && images.length > 0)
      ? images[0]
      : ((skippedToTemplate ? null : plmImageUrl) || images[0] || DEFAULT_GARMENT_SVG);
    const initialImage = formatDisplayImageUrl(initialRaw);
    lastLoadedUrlRef.current = initialImage;

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
      dirtyIndexesRef.current = new Set();
      // Undo stack > 0 means the user edited the currently loaded image
      editor.on('undoStackChanged', (length: number) => {
        if (length > 0) dirtyIndexesRef.current.add(currentIndexRef.current);
      });

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
  }, [isOpen, item?.id, menuPosition, skippedToTemplate]);

  // Load new image when index or plmImageUrl changes, without recreating the editor
  useEffect(() => {
    if (!editorRef.current || !isOpen) return;

    if (!plmImageUrl && images.length === 0 && !skippedToTemplate) {
      // Wait for PLM image load
      return;
    }

    let targetImage = DEFAULT_GARMENT_SVG;
    if (currentIndex === 0) {
      targetImage = (skippedToTemplate ? null : plmImageUrl) || (isNotInPlm && images[0]) || DEFAULT_GARMENT_SVG;
    } else if (images[currentIndex - 1]) {
      targetImage = images[currentIndex - 1];
    }

    const resolvedUrl = formatDisplayImageUrl(targetImage);

    // Prevent redundant reload if image is already loaded
    if (lastLoadedUrlRef.current === resolvedUrl) {
      return;
    }
    lastLoadedUrlRef.current = resolvedUrl;

    editorRef.current.loadImageFromURL(resolvedUrl, `Image-${currentIndex}`)
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

  // Only export the editor canvas when the user actually edited the current image.
  // Re-exporting untouched / still-loading images produced black thumbnails.
  const saveCurrentImageToState = () => {
    if (editorRef.current && dirtyIndexesRef.current.has(currentIndex)) {
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

  const handleSelectImage = async (index: number) => {
    if (index === currentIndex) return;
    saveCurrentImageToState();
    setCurrentIndex(index);

    let nextRaw = DEFAULT_GARMENT_SVG;
    if (index === 0) {
      nextRaw = (skippedToTemplate ? null : plmImageUrl) || (isNotInPlm && images[0]) || DEFAULT_GARMENT_SVG;
    } else if (images[index - 1]) {
      nextRaw = images[index - 1];
    }

    const nextUrl = formatDisplayImageUrl(nextRaw);
    lastLoadedUrlRef.current = nextUrl;
    if (editorRef.current) {
      await editorRef.current.loadImageFromURL(nextUrl, `Image-${index}`).catch(() => {});
    }
  };

  const handlePrev = async () => {
    const minIndex = isNotInPlm && images.length > 0 ? 1 : 0;
    if (currentIndex > minIndex) {
      saveCurrentImageToState();
      const nextIdx = currentIndex - 1;
      setCurrentIndex(nextIdx);
      const nextUrl = formatDisplayImageUrl(
        nextIdx === 0
          ? ((skippedToTemplate ? null : plmImageUrl) || (isNotInPlm && images[0]) || DEFAULT_GARMENT_SVG)
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
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    saveCurrentImageToState();

    try {
      const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      const files = Array.from(fileList);
      const base64List = await Promise.all(files.map(readFileAsBase64));
      const validBase64List = base64List.filter(Boolean);

      if (validBase64List.length > 0) {
        const startIndex = images.length;
        const newImages = [...images, ...validBase64List];
        setImages(newImages);

        const targetIndex = startIndex + 1;
        setCurrentIndex(targetIndex);

        const firstNewBase64 = validBase64List[0];
        lastLoadedUrlRef.current = firstNewBase64;
        if (editorRef.current) {
          await editorRef.current.loadImageFromURL(firstNewBase64, `Upload-${targetIndex}`).catch((err) => {
            console.error("Failed to load uploaded image in editor:", err);
          });
        }
      }
    } catch (err) {
      console.error("Failed to load file(s):", err);
      setErrorMsg("Failed to load uploaded image(s).");
    }

    e.target.value = '';
  };

  /**
   * Uploads every not-yet-saved (base64) image to S3 sequentially and returns the final S3 URL list.
   * NOTE: itemId is intentionally NOT sent - otherwise the backend overwrites the item's
   * AnnotatedImage with just that single URL (and deletes the other S3 images).
   * The complete array is persisted once through onSave().
   */
  const uploadPendingImages = async (list: string[]): Promise<string[]> => {
    const result: string[] = [];
    const stamp = Date.now();
    for (let idx = 0; idx < list.length; idx++) {
      const img = list[idx];
      if (img && img.startsWith('data:')) {
        const ext = img.match(/^data:image\/(\w+);/)?.[1] || 'jpg';
        const cleanStyle = (item?.styleMaterialNumber || 'style').replace(/[^a-zA-Z0-9_-]/g, '_');
        const s3Result = await projectService.uploadImageToS3({
          projectName: projectName || 'General',
          styleName: item?.styleMaterialNumber || item?.styleMaterialName || 'Style',
          base64Data: img,
          fileName: `${cleanStyle}_${stamp}_${idx}.${ext}`,
        });
        result.push(s3Result.url);
      } else if (img) {
        result.push(img);
      }
    }
    return result;
  };

  const handleRemoveImageByIndex = async (indexToRemove: number) => {
    if (!item?.id || indexToRemove <= 0) return;
    const targetIdx = indexToRemove - 1;
    const removedImage = images[targetIdx];
    const remaining = images.filter((_, idx) => idx !== targetIdx);

    setIsSaving(true);
    try {
      const updatedImages = await uploadPendingImages(remaining);
      if (removedImage && (removedImage.includes('amazonaws.com') || removedImage.includes('buyerapp-image'))) {
        await projectService.deleteImageFromS3(removedImage);
      }

      const serialized = updatedImages.length > 0 ? JSON.stringify(updatedImages) : '[]';
      await onSave(item.id, serialized);

      dirtyIndexesRef.current = new Set();
      setImages(updatedImages);

      let nextIdx = 0;
      if (isNotInPlm) {
        nextIdx = updatedImages.length > 0 ? 1 : 0;
      } else {
        nextIdx = currentIndex === indexToRemove
          ? Math.max(0, indexToRemove - 1)
          : (currentIndex > indexToRemove ? currentIndex - 1 : currentIndex);
      }
      setCurrentIndex(nextIdx);

      const nextRaw = nextIdx === 0
        ? ((skippedToTemplate ? null : plmImageUrl) || (isNotInPlm && updatedImages[0]) || DEFAULT_GARMENT_SVG)
        : updatedImages[nextIdx - 1];
      const fallback = formatDisplayImageUrl(nextRaw);
      lastLoadedUrlRef.current = fallback;
      if (editorRef.current) {
        await editorRef.current.loadImageFromURL(fallback, `Image-${nextIdx}`).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to remove image:", err);
      setErrorMsg("Failed to remove image from database.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!item?.id || currentIndex === 0) return;
    await handleRemoveImageByIndex(currentIndex);
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
      // Only export the editor canvas if the user actually edited the image being shown
      if (editorRef.current && dirtyIndexesRef.current.has(currentIndex)) {
        const dataUrl = editorRef.current.toDataURL({ format: 'jpeg', quality: 0.8 });
        if (currentIndex === 0) {
          if (isNotInPlm) {
            if (updatedImages.length === 0) {
              updatedImages = [dataUrl];
            } else {
              updatedImages[0] = dataUrl;
            }
          } else {
            // User drew on the original PLM style image -> store as a new annotation
            updatedImages = [dataUrl, ...images];
          }
        } else if (currentIndex > 0 && currentIndex <= updatedImages.length) {
          updatedImages[currentIndex - 1] = dataUrl;
        }
      }

      // 2. Upload ALL pending (base64) images to S3 - no itemId so nothing gets overwritten
      const s3UrlImages = await uploadPendingImages(updatedImages);

      // Keep the permanent PLM default image reference stored with the item
      const defaultUrls = oldS3Urls.filter((u) => u.includes('_default_') || u.includes('-default-'));
      const finalList = [...defaultUrls, ...s3UrlImages];

      // 3. Clean up any previous S3 image copy that was replaced (prevents duplicate copies on S3!)
      const newUrlsSet = new Set(finalList);
      for (const oldUrl of oldS3Urls) {
        if (!newUrlsSet.has(oldUrl)) {
          await projectService.deleteImageFromS3(oldUrl);
        }
      }

      const serialized = finalList.length > 0 ? JSON.stringify(finalList) : '[]';
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

        {/* Annotation Grid: Display all uploaded images as thumbnail cards */}
        <div className={styles.annotationGridSection}>
          <div className={styles.annotationGridHeader}>
            <span className={styles.annotationGridTitle}>
              Annotation Grid ({isNotInPlm ? images.length : images.length + 1} {images.length === 1 && isNotInPlm ? "Image" : "Images"})
            </span>
            <span className={styles.annotationGridHint}>
              Click to view/edit. First 3 uploaded images export to PPT.
            </span>
          </div>

          <div className={styles.annotationGridList}>
            {/* Original PLM image (for PLM items) */}
            {!isNotInPlm && (
              <div
                role="button"
                tabIndex={0}
                className={`${styles.gridThumbCard} ${currentIndex === 0 ? styles.activeCard : ''}`}
                onClick={() => handleSelectImage(0)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectImage(0)}
                title="Original PLM Style Image"
              >
                <img
                  src={formatDisplayImageUrl(plmImageUrl || DEFAULT_GARMENT_SVG)}
                  alt="Original PLM"
                  className={styles.gridThumbImg}
                />
                <span className={styles.gridThumbLabel}>PLM Style</span>
                {currentIndex === 0 && <span className={styles.activeBadge}>Active</span>}
              </div>
            )}

            {/* Default template card (for non-PLM items with no uploaded images) */}
            {isNotInPlm && images.length === 0 && (
              <div
                role="button"
                tabIndex={0}
                className={`${styles.gridThumbCard} ${currentIndex === 0 ? styles.activeCard : ''}`}
                onClick={() => handleSelectImage(0)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectImage(0)}
                title="Default Garment Template"
              >
                <img
                  src={DEFAULT_GARMENT_SVG}
                  alt="Template"
                  className={styles.gridThumbImg}
                />
                <span className={styles.gridThumbLabel}>Template</span>
                {currentIndex === 0 && <span className={styles.activeBadge}>Active</span>}
              </div>
            )}

            {/* All uploaded images */}
            {images.map((imgUrl, idx) => {
              const cardIndex = idx + 1;
              const isActive = currentIndex === cardIndex;
              let slotName = `Image ${idx + 1}`;
              if (idx === 0) slotName = "1: Front";
              else if (idx === 1) slotName = "2: Back";
              else if (idx === 2) slotName = "3: Fabric";

              return (
                <div
                  key={idx}
                  role="button"
                  tabIndex={0}
                  className={`${styles.gridThumbCard} ${isActive ? styles.activeCard : ''}`}
                  onClick={() => handleSelectImage(cardIndex)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectImage(cardIndex)}
                  title={`${slotName} - Click to edit`}
                >
                  <img
                    src={formatDisplayImageUrl(imgUrl)}
                    alt={slotName}
                    className={styles.gridThumbImg}
                  />
                  <span className={styles.gridThumbLabel}>{slotName}</span>
                  {isActive && <span className={styles.activeBadge}>Active</span>}
                  {/* {!isLocked && (
                    <button
                      type="button"
                      className={styles.gridThumbDeleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveImageByIndex(cardIndex);
                      }}
                      title="Delete this image"
                      aria-label={`Delete ${slotName}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )} */}
                </div>
              );
            })}

            {/* Upload Button Card */}
            {/* {!isLocked && (
              <div
                role="button"
                tabIndex={0}
                className={styles.gridUploadCard}
                onClick={() => document.getElementById('drawer-image-upload')?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && document.getElementById('drawer-image-upload')?.click()}
                title="Upload image(s)"
              >
                <Plus size={20} className={styles.gridUploadIcon} />
                <span className={styles.gridUploadLabel}>Add Images</span>
              </div>
            )} */}
          </div>
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
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <Button
                  variant="secondary"
                  onClick={() => document.getElementById('drawer-image-upload')?.click()}
                  icon={<Plus size={14} />}
                  disabled={isSaving}
                  title="Upload additional image(s)"
                >
                  {isNotInPlm ? "Add Image" : null}
                </Button>

                {currentIndex > 0 && (
                  <Button
                    variant="danger"
                    onClick={handleRemoveImage}
                    disabled={isSaving}
                    icon={<Trash2 size={14} />}
                    title="Delete this image from S3"
                  />
                )}
              </>
            )}
          </div>

          {(images.length > 0 || !isNotInPlm) && (
            <div className={styles.footerCenter}>
              <div className={styles.navigationRow}>
                <Button
                  variant="text"
                  disabled={currentIndex === (isNotInPlm && images.length > 0 ? 1 : 0) || isSaving}
                  onClick={handlePrev}
                  icon={<ChevronLeft size={16} />}
                  style={{ minWidth: 0, padding: '0.25rem' }}
                  title="Previous image"
                />
                <span
                  className={styles.imageCounter}
                  title={currentIndex === 0 ? (isNotInPlm ? "Default Template" : "Original PLM Style Image") : `Image ${currentIndex}`}
                >
                  {currentIndex === 0 ? (isNotInPlm ? "Default Template" : "Original (PLM)") : `Image ${currentIndex}/${images.length}`}
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
