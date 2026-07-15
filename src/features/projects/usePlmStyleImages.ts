import { useState, useCallback, useEffect } from "react";
import { odata2style } from "../../services/api";
import { fetchStyleImage } from "../../services/api";
import { extractODataList } from "../../utils/odata";
import type { InforUser } from "../../types/api";
import type { GroupedStyle } from "../../types/projects";

// Global session cache — prevents re-fetching on component remount
const globalPlmImagesCache: Record<string, string> = {};

interface UsePlmStyleImagesProps {
  sortedGroupedStyles: GroupedStyle[];
  currentUser: InforUser | null;
}

interface UsePlmStyleImagesResult {
  plmImagesMap: Record<string, string>;
  loadingPlmImages: Record<string, boolean>;
  plmImagesErrors: Record<string, string>;
  loadStyleImage: (styleMaterialNumber: string, styleId?: number) => Promise<void>;
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
}: UsePlmStyleImagesProps): UsePlmStyleImagesResult {
  const [plmImagesMap, setPlmImagesMap] = useState<Record<string, string>>(
    () => ({ ...globalPlmImagesCache }),
  );
  const [loadingPlmImages, setLoadingPlmImages] = useState<Record<string, boolean>>({});
  const [plmImagesErrors, setPlmImagesErrors] = useState<Record<string, string>>({});

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

  // Pre-fetch style images for all visible groups not yet cached
  useEffect(() => {
    if (!currentUser) return;
    sortedGroupedStyles.forEach((group) => {
      const firstItem = group.items[0];
      if (
        firstItem &&
        plmImagesMap[group.styleMaterialNumber] === undefined &&
        globalPlmImagesCache[group.styleMaterialNumber] === undefined &&
        !loadingPlmImages[group.styleMaterialNumber]
      ) {
        void loadStyleImage(group.styleMaterialNumber, firstItem.styleId);
      }
    });
  }, [sortedGroupedStyles, plmImagesMap, loadingPlmImages, loadStyleImage, currentUser]);

  return { plmImagesMap, loadingPlmImages, plmImagesErrors, loadStyleImage };
}
