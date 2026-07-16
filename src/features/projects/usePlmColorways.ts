import { useState, useCallback, useEffect } from "react";
import { odata2style, odata2material } from "../../services/api";
import type { ColorwayOption } from "../../types/api";
import type { GroupedStyle } from "../../types/projects";
import {
  extractColorwaysFromPlmResponse,
  buildPlmStyleParams,
} from "./ProjectDetailsHelpers";

interface UsePlmColorwaysProps {
  sortedGroupedStyles: GroupedStyle[];
}

export function usePlmColorways({ sortedGroupedStyles }: UsePlmColorwaysProps) {
  const [plmColorwaysMap, setPlmColorwaysMap] = useState<Record<string, ColorwayOption[]>>({});
  const [loadingPlmColorways, setLoadingPlmColorways] = useState<Record<string, boolean>>({});

  // Force-loads a single style's colorways — no guard, safe for refresh operations.
  const loadStyleColorways = useCallback(async (styleNumber: string, styleId?: number, itemType?: 'Style' | 'Material') => {
    setLoadingPlmColorways((prev) => ({ ...prev, [styleNumber]: true }));
    try {
      let response;
      if (itemType === 'Material') {
        const params = { MaterialCode: styleNumber };
        response = await odata2material.getMaterialData(params);
      } else {
        const params = buildPlmStyleParams(styleNumber, styleId);
        response = await odata2style.getStyleData(params);
      }

      const options = await extractColorwaysFromPlmResponse(response);
      if (options.length > 0) {
        setPlmColorwaysMap((prev) => ({ ...prev, [styleNumber]: options }));
      }
    } catch (err) {
      console.error(`Failed to load PLM colorways for style ${styleNumber}:`, err);
    } finally {
      setLoadingPlmColorways((prev) => ({ ...prev, [styleNumber]: false }));
    }
  }, []);

  // Lazy-loads a single style's colorways — skips if already loaded or loading.
  const loadPlmColorwaysForStyle = useCallback(async (styleNumber: string, styleId?: number, itemType?: 'Style' | 'Material') => {
    if (plmColorwaysMap[styleNumber] || loadingPlmColorways[styleNumber]) return;
    return loadStyleColorways(styleNumber, styleId, itemType);
  }, [plmColorwaysMap, loadingPlmColorways, loadStyleColorways]);

  // Resets all PLM state and force-reloads for every group.
  // Used by handleRefresh to bypass lazy-load guards after a full reset.
  const resetAndReloadAll = useCallback(async (groups: GroupedStyle[]) => {
    setPlmColorwaysMap({});
    setLoadingPlmColorways({});
    await Promise.all(
      groups.map((group) => {
        const firstItem = group.items[0];
        return loadStyleColorways(group.styleMaterialNumber, firstItem?.styleId, firstItem?.itemType);
      }),
    );
  }, [loadStyleColorways]);

  // Lazy-load PLM colorways for all currently visible style groups
  useEffect(() => {
    sortedGroupedStyles.forEach((group) => {
      const firstItem = group.items[0];
      if (firstItem) {
        void loadPlmColorwaysForStyle(group.styleMaterialNumber, firstItem.styleId, firstItem.itemType);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedGroupedStyles]);

  return { plmColorwaysMap, loadPlmColorwaysForStyle, resetAndReloadAll };
}
