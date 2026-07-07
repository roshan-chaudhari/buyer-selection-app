import React, { useState, useEffect } from 'react';
import { Save, Palette, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Dropdown from '../../components/Dropdown';
import Textarea from '../../components/Textarea';
import { projectService, type ProjectItem } from '../../services/projectService';
import { odata2style, odata2Service } from '../../services/api';
import type {StyleColorway, StyleObject, ColorwayOption, LookupOption } from '../../types/api';
import { extractODataList } from '../../utils/odata';
import { toDateInputValue, formatScannedDate } from '../../utils/date';
import styles from './EditItemModal.module.scss';

// ─── Mapping Helpers ──────────────────────────────────────────────────────────

function buildColorwayQueryParams(
  styleId: number | undefined,
  styleMaterialNumber: string,
): Record<string, string | number> {
  if (styleId && styleId > 0) return { StyleId: styleId };
  const isNumeric = /^\d+$/.test(styleMaterialNumber);
  return isNumeric
    ? { StyleId: Number(styleMaterialNumber) }
    : { StyleCode: styleMaterialNumber };
}

function toColorwayOption(cw: StyleColorway): ColorwayOption | null {
  const value = cw.Name ?? '';
  if (!value) return null;
  return {
    value,
    label: cw.Code ? `${cw.Code} - ${value}` : value,
    colorwayId: cw.StyleColorwayId ?? 0,
  };
}

/** Returns a single-item fallback list for a non-composite colorway string. */
function fallbackColorwayOption(colorway: string, colorId: number): ColorwayOption[] {
  if (!colorway || colorway.includes(',')) return [];
  return [{ value: colorway, label: colorway, colorwayId: colorId }];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ProjectItem;
  onSave: (updated: ProjectItem) => void;
  onError?: (message: string) => void;
  onOpenAnnotation?: (item: ProjectItem) => void;
  plmImageUrl: string | null;
  isLoadingPlmImage: boolean;
  plmImageError: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditItemModal({
  isOpen,
  onClose,
  item,
  onSave,
  onError,
  onOpenAnnotation,
  plmImageUrl,
  isLoadingPlmImage,
  plmImageError,
}: EditItemModalProps) {

  // ── Form state ──────────────────────────────────────────────────────────────
  const [styleId, setStyleId] = useState(item.styleId ?? 0);
  const [colorId, setColorId] = useState(item.colorId ?? 0);
  const [styleName, setStyleName] = useState(item.styleMaterialName ?? '');
  const [colorway, setColorway] = useState(item.colorway ?? '');
  const [colorwayStatus, setColorwayStatus] = useState(item.colorwayStatus ?? 'Pending');
  const [colorStatusId, setColorStatusId] = useState(item.colorStatusId ?? 0);
  const [selectionCondition, setSelectionCondition] = useState(item.selectionCondition ?? 'As-Is');
  const [sampleDue, setSampleDue] = useState(() => toDateInputValue(item.sampleDue));
  const [buyerComments, setBuyerComments] = useState(item.buyerComments ?? '');
  const [internalComments, setInternalComments] = useState(item.internalComments ?? '');
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(item.annotatedImage ?? null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Async dropdown state ────────────────────────────────────────────────────
  const [colorwayOptions, setColorwayOptions] = useState<ColorwayOption[]>(() =>
    fallbackColorwayOption(item.colorway, item.colorId ?? 0)
  );
  const [isLoadingColorways, setIsLoadingColorways] = useState(false);

  const [statusOptions, setStatusOptions] = useState<LookupOption[]>(() =>
    item.colorwayStatus ? [{ value: item.colorwayStatus, label: item.colorwayStatus, id: item.colorStatusId ?? 0 }] : []
  );
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // ── Fetch colorways on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !item.styleMaterialNumber) return;

    const loadColorways = async () => {
      setIsLoadingColorways(true);
      try {
        const params = buildColorwayQueryParams(item.styleId, item.styleMaterialNumber);
        const response = await odata2style.getStyleData(params);
        const styleList = extractODataList<StyleObject>(response);

        if (styleList.length === 0) {
          setColorwayOptions(fallbackColorwayOption(item.colorway, item.colorId ?? 0));
          return;
        }

        const [styleObj] = styleList;

        if (styleObj.StyleId) setStyleId(styleObj.StyleId);

        const options: ColorwayOption[] = (styleObj.StyleColorways ?? [])
          .map(toColorwayOption)
          .filter((opt): opt is ColorwayOption => opt !== null);


        // Prepend current colorway if it's missing from the fetched list
        const currentIsSingle = item.colorway && !item.colorway.includes(',');
        const currentIsMissing = !options.some(
          (opt) => opt.value.toLowerCase() === item.colorway?.toLowerCase()
        );

        if (currentIsSingle && currentIsMissing) {
          options.unshift({
            value: item.colorway,
            label: item.colorway,
            colorwayId: item.colorId ?? 0,
          });
        }

        setColorwayOptions(options);
      } catch (err) {
        console.error('[EditItemModal] loadColorways failed:', err);
        setColorwayOptions(fallbackColorwayOption(item.colorway, item.colorId ?? 0));
      } finally {
        setIsLoadingColorways(false);
      }
    };

    loadColorways();
  }, [isOpen, item.styleMaterialNumber, item.styleId, item.colorway, item.colorId]);

  // ── Fetch status options on open ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const loadStatusOptions = async () => {
      setIsLoadingStatus(true);
      try {
        const options = await odata2Service.getLookupOptions(231);
        if (options.length > 0) setStatusOptions(options);
      } catch (err) {
        console.error('[EditItemModal] loadStatusOptions failed:', err);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    loadStatusOptions();
  }, [isOpen]);

  // ── Colorway selection handler ──────────────────────────────────────────────
  const handleColorwayChange = (e: { target: { value: string } }) => {
    const selected = e.target.value;
    setColorway(selected);
    const firstVal = selected.split(',')[0]?.trim();
    const match = colorwayOptions.find((opt) => opt.value === firstVal);
    setColorId(match?.colorwayId ?? 0);
  };

  // ── Status selection handler ──────────────────────────────────────────────
  const handleStatusChange = (e: { target: { value: string } }) => {
    const selected = e.target.value;
    setColorwayStatus(selected);
    const match = statusOptions.find((opt) => opt.value === selected);
    setColorStatusId(match?.id ?? 0);
  };

  // ── Save handler ────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.id) return;

    const selectedNames = colorway.split(',').map((c) => c.trim()).filter(Boolean);
    const colorwaysWithIds = selectedNames.map((name) => {
      const match = colorwayOptions.find((opt) => opt.value.toLowerCase() === name.toLowerCase());
      return {
        colorway: name,
        colorId: match ? match.colorwayId : 0,
      };
    });

    setIsSaving(true);
    try {
      const updated = await projectService.updateProjectItem(item.id, {
        styleId: styleId || 0,
        colorId: colorId || 0,
        styleMaterialNumber: item.styleMaterialNumber,
        styleMaterialName: styleName.trim(),
        colorway: colorway.trim(),
        colorwayStatus,
        colorStatusId: colorStatusId || 0,
        selectionCondition,
        sampleDue: sampleDue || null,
        buyerComments: buyerComments.trim(),
        internalComments: internalComments.trim(),
        annotatedImage,
        colorwaysWithIds,
      });
      onSave(updated);
      onClose();
    } catch (err) {
      console.error('[EditItemModal] handleSave failed:', err);
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Annotate handler ────────────────────────────────────────────────────────
  // Passes current unsaved form values into the annotation view so edits aren't lost
  const handleOpenAnnotation = () => {
    onClose();
    onOpenAnnotation?.({
      ...item,
      styleId: styleId || item.styleId,
      styleMaterialName: styleName.trim(),
      colorway: colorway.trim(),
      colorwayStatus,
      colorStatusId: colorStatusId || 0,
      selectionCondition,
      sampleDue: sampleDue || null,
      buyerComments: buyerComments.trim(),
      internalComments: internalComments.trim(),
      annotatedImage,
    });
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const scannedDateLabel = formatScannedDate(item.createdDate);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Item Details">
      <div className={styles.qrBlock}>
        <p className={styles.qrLabel}>QR Code</p>
        <p className={styles.qrValue}>{item.styleMaterialNumber}</p>
        <p className={styles.qrScannedDate}>Scanned: {scannedDateLabel}</p>
      </div>

      <form onSubmit={handleSave} className={styles.editForm}>
        <div className={styles.formGrid}>
          <Input
            label="Style/Fabric Name"
            type="text"
            id="styleName"
            value={styleName}
            onChange={(e) => setStyleName(e.target.value)}
          />
          <Dropdown
            label="Colorways"
            id="colorway"
            value={colorway}
            onChange={handleColorwayChange}
            disabled={isLoadingColorways}
            multiselect={true}
          >
            <option value="" disabled>
              {isLoadingColorways
                ? 'Loading colorways...'
                : colorwayOptions.length === 0
                ? '-- No Colorways Available --'
                : '-- Select Colorway --'}
            </option>
            {colorwayOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Dropdown>

          <Dropdown
            label="Colorway Status"
            id="colorwayStatus"
            value={colorwayStatus}
            onChange={handleStatusChange}
            disabled={isLoadingStatus}
          >
            <option value="" disabled>
              {isLoadingStatus
                ? 'Loading statuses...'
                : statusOptions.length === 0
                ? '-- No Statuses Available --'
                : '-- Select Status --'}
            </option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Dropdown>

          <Dropdown
            label="Select Condition"
            id="selectionCondition"
            value={selectionCondition}
            onChange={(e) => setSelectionCondition(e.target.value)}
          >
            <option value="As-Is">As-Is</option>
            <option value="Small Change">Small Change</option>
            <option value="Big-Change">Big-Change</option>
          </Dropdown>

          <Input
            label="Sample Due"
            type="date"
            id="sampleDue"
            value={sampleDue}
            onChange={(e) => setSampleDue(e.target.value)}
          />
        </div>

        <div className={styles.commentsWrapper}>
          <Textarea
            label="Buyer Comments"
            id="buyerComments"
            value={buyerComments}
            onChange={(e) => setBuyerComments(e.target.value)}
            rows={3}
          />
          <Textarea
            label="Internal Comment"
            id="internalComments"
            value={internalComments}
            onChange={(e) => setInternalComments(e.target.value)}
            rows={3}
          />
        </div>

        <div className={styles.editModalThumbnailSection}>
          <label>Image Annotation</label>
          <div className={styles.editModalThumbnailRow}>
            <div className={styles.editModalThumbnail}>
              {annotatedImage ? (
                <img
                  src={annotatedImage}
                  alt="Annotation Thumbnail"
                  className={styles.editModalThumbnailImg}
                />
              ) : isLoadingPlmImage ? (
                <div className={styles.thumbnailSpinner} title="Loading Style image from PLM..." />
              ) : plmImageError ? (
                <div className={styles.thumbnailError} title={plmImageError}>
                  Error Loading PLM
                </div>
              ) : plmImageUrl ? (
                <img
                  src={plmImageUrl}
                  alt="PLM Style Thumbnail"
                  className={styles.editModalThumbnailImg}
                />
              ) : (
                <div className={styles.editModalThumbnailPlaceholder}>No Image</div>
              )}
            </div>
            <div className={styles.thumbnailActions}>
              {onOpenAnnotation && (
                <Button
                  type="button"
                  variant="outline"
                  icon={<Palette size={14} />}
                  onClick={handleOpenAnnotation}
                  disabled={isLoadingPlmImage}
                >
                  Annotate Image
                </Button>
              )}
              {annotatedImage && (
                <Button
                  type="button"
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => setAnnotatedImage(null)}
                >
                  Delete Image
                </Button>
              )}
            </div>
          </div>
          {!annotatedImage && plmImageUrl && (
            <span className={styles.thumbnailInfo}>
              Showing Style image from PLM. Click &quot;Annotate Image&quot; to draw on it.
            </span>
          )}
          {!annotatedImage && !isLoadingPlmImage && !plmImageUrl && !plmImageError && (
            <span className={styles.thumbnailInfo}>
              No PLM image found. Drawing will fallback to default template.
            </span>
          )}
        </div>


        <div className={styles.formActions}>
          <Button type="button" onClick={onClose} disabled={isSaving} variant="outline">
            Cancel
          </Button>
          <Button
            type="submit"
            className={styles.saveBtn}
            disabled={isSaving}
            icon={<Save size={14} />}
            variant="primary"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
