import { useState, useCallback, useEffect, useRef } from "react";
import { odata2style, fetchStyleImage } from "../../services/api";
import { projectService } from "../../services/projectService";
import { extractODataList } from "../../utils/odata";
import { resolveImageBlob } from "../../utils/image";
import type { InforUser } from "../../types/api";
import type { GroupedStyle } from "../../types/projects";

// Global session cache — prevents re-fetching on component remount
export const globalPlmImagesCache: Record<string, string> = {};
// Track styles that have been auto-saved or are currently in-flight to prevent duplicate saves
export const autoSavedStylesSet = new Set<string>();
export const inFlightAutoSaveSet = new Set<string>();

export function markStyleImageDeleted(_styleMaterialNumber: string) {
  // PLM default image is permanent and cannot be deleted; only annotations are deleted.
}

export function resetStyleImageDeleted(_styleMaterialNumber: string) {
  // No-op kept for interface compatibility
}

interface UsePlmStyleImagesProps {
  sortedGroupedStyles: GroupedStyle[];
  currentUser: InforUser | null;
  projectName?: string;
  onItemImageSaved?: (styleMaterialNumber: string, s3Url: string) => void;
}

interface UsePlmStyleImagesResult {
  plmImagesMap: Record<string, string>;
  loadingPlmImages: Record<string, boolean>;
  plmImagesErrors: Record<string, string>;
  loadStyleImage: (styleMaterialNumber: string, styleId?: number) => Promise<void>;
  markStyleImageDeleted: (styleMaterialNumber: string) => void;
  resetStyleImageDeleted: (styleMaterialNumber: string) => void;
}

function hasSavedAppImage(annotatedImage: string | null | undefined): boolean {
  if (!annotatedImage) return false;
  const raw = String(annotatedImage).trim();
  if (!raw || raw === "[]" || raw === "null" || raw === "undefined" || raw === '""') return false;
  return raw.includes("amazonaws.com") || raw.includes("buyerapp-image") || raw.includes("/api/projects/");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolveStyleId(
  styleMaterialNumber: string,
  styleId?: number,
): Promise<number | undefined> {
  if (styleId) return styleId;

  const isNumeric = styleMaterialNumber.length > 0 && /^\d+$/.test(styleMaterialNumber);
  const queryParams = isNumeric
    ? { StyleId: Number(styleMaterialNumber) }
    : { StyleCode: styleMaterialNumber };

  const response = await odata2style.getStyleData(queryParams);
  const styleList = extractODataList<any>(response);
  return styleList.length > 0 ? styleList[0].StyleId : undefined;
}

export function usePlmStyleImages({
  sortedGroupedStyles,
  currentUser,
  projectName,
  onItemImageSaved,
}: UsePlmStyleImagesProps): UsePlmStyleImagesResult {
  const [plmImagesMap, setPlmImagesMap] = useState<Record<string, string>>(
    () => ({ ...globalPlmImagesCache }),
  );
  const [loadingPlmImages, setLoadingPlmImages] = useState<Record<string, boolean>>({});
  const [plmImagesErrors, setPlmImagesErrors] = useState<Record<string, string>>({});

  const sortedGroupedStylesRef = useRef(sortedGroupedStyles);
  sortedGroupedStylesRef.current = sortedGroupedStyles;

  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;

  const onItemImageSavedRef = useRef(onItemImageSaved);
  onItemImageSavedRef.current = onItemImageSaved;

  const loadStyleImage = useCallback(
    async (styleMaterialNumber: string, styleId?: number) => {
      if (!currentUser) return;

      setLoadingPlmImages((prev) => ({ ...prev, [styleMaterialNumber]: true }));
      setPlmImagesErrors((prev) => ({ ...prev, [styleMaterialNumber]: "" }));

      try {
        const resolvedStyleId = await resolveStyleId(styleMaterialNumber, styleId);
        if (!resolvedStyleId) {
          throw new Error("Could not resolve StyleId from style code");
        }

        const imageUrl = await fetchStyleImage(resolvedStyleId, currentUser);
        const val = imageUrl || "";
        globalPlmImagesCache[styleMaterialNumber] = val;
        setPlmImagesMap((prev) => ({ ...prev, [styleMaterialNumber]: val }));

        // ── Auto-save default PLM image to current application storage (S3) ──
        if (
          val &&
          !autoSavedStylesSet.has(styleMaterialNumber) &&
          !inFlightAutoSaveSet.has(styleMaterialNumber)
        ) {
          const currentGroups = sortedGroupedStylesRef.current;
          const group = currentGroups.find((g) => g.styleMaterialNumber === styleMaterialNumber);
          const firstItem = group?.items?.[0];
          const hasImageAlready = hasSavedAppImage(group?.annotatedImage || firstItem?.annotatedImage);

          if (hasImageAlready) {
            autoSavedStylesSet.add(styleMaterialNumber);
          } else if (firstItem?.id) {
            inFlightAutoSaveSet.add(styleMaterialNumber);
            try {
              let base64Data: string | null = null;
              if (val.startsWith("data:")) {
                base64Data = val;
              } else {
                const blob = await resolveImageBlob(val);
                if (blob) {
                  base64Data = await blobToDataUrl(blob);
                }
              }

              if (base64Data) {
                const ext = base64Data.match(/^data:image\/(\w+);/)?.[1] || "jpg";
                const cleanStyle = styleMaterialNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
                const fileName = `${cleanStyle}_default_${Date.now()}.${ext}`;

                const s3Result = await projectService.uploadImageToS3({
                  projectName: projectNameRef.current || "General",
                  styleName: styleMaterialNumber,
                  base64Data,
                  fileName,
                  itemId: firstItem.id,
                });

                if (s3Result && s3Result.url) {
                  const s3Url = s3Result.url;
                  autoSavedStylesSet.add(styleMaterialNumber);

                  const serialized = JSON.stringify([s3Url]);
                  if (group) group.annotatedImage = serialized;
                  group?.items?.forEach((it) => {
                    it.annotatedImage = serialized;
                  });

                  globalPlmImagesCache[styleMaterialNumber] = s3Url;
                  setPlmImagesMap((prev) => ({ ...prev, [styleMaterialNumber]: s3Url }));

                  if (onItemImageSavedRef.current) {
                    onItemImageSavedRef.current(styleMaterialNumber, s3Url);
                  }
                }
              }
            } catch (saveErr) {
              console.warn(
                `[usePlmStyleImages] Auto-save default PLM image to S3 failed for ${styleMaterialNumber}:`,
                saveErr,
              );
            } finally {
              inFlightAutoSaveSet.delete(styleMaterialNumber);
            }
          }
        }
      } catch (err) {
        console.error(
          `[usePlmStyleImages] Failed to load style image for ${styleMaterialNumber}:`,
          err,
        );
        setPlmImagesErrors((prev) => ({
          ...prev,
          [styleMaterialNumber]: err instanceof Error ? err.message : String(err),
        }));
        // Cache empty string to prevent infinite retry loops
        globalPlmImagesCache[styleMaterialNumber] = "";
        setPlmImagesMap((prev) => ({ ...prev, [styleMaterialNumber]: "" }));
      } finally {
        setLoadingPlmImages((prev) => ({ ...prev, [styleMaterialNumber]: false }));
      }
    },
    [currentUser],
  );

  // Pre-fetch style images for all visible groups not yet cached or auto-saved
  useEffect(() => {
    if (!currentUser) return;
    sortedGroupedStyles.forEach((group) => {
      const firstItem = group.items[0];
      if (!firstItem || firstItem.notInPLM) return;

      const hasStoredImage = hasSavedAppImage(group.annotatedImage || firstItem.annotatedImage);
      if (hasStoredImage) {
        autoSavedStylesSet.add(group.styleMaterialNumber);
      }

      const needsFetch =
        plmImagesMap[group.styleMaterialNumber] === undefined &&
        globalPlmImagesCache[group.styleMaterialNumber] === undefined &&
        !loadingPlmImages[group.styleMaterialNumber];

      const needsAutoSave =
        !hasStoredImage &&
        !autoSavedStylesSet.has(group.styleMaterialNumber) &&
        !inFlightAutoSaveSet.has(group.styleMaterialNumber) &&
        !loadingPlmImages[group.styleMaterialNumber];

      if (needsFetch || needsAutoSave) {
        void loadStyleImage(group.styleMaterialNumber, firstItem.styleId);
      }
    });
  }, [sortedGroupedStyles, plmImagesMap, loadingPlmImages, loadStyleImage, currentUser]);

  return {
    plmImagesMap,
    loadingPlmImages,
    plmImagesErrors,
    loadStyleImage,
    markStyleImageDeleted,
    resetStyleImageDeleted,
  };
}
