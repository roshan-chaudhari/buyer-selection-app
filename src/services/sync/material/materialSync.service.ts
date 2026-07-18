import {
  odata2material,
  fetchPlmMaterialColorways,
  savePlmMaterialColorways,
} from "../../api";
import { buildSaveMaterialColorwayPayload } from "./materialColor.service";
import { projectService, type ProjectItem } from "../../projectService";
import type { GroupedStyle } from "../../../types/projects";
import type { InforUser } from "../../../types/api";
import { extractODataList } from "../../../utils/odata";

export const materialSyncService = {
  processMaterialGroup: async (
    group: GroupedStyle,
    currentUser: InforUser,
    projectId: number,
    refreshItems: (id: number) => Promise<ProjectItem[]>,
  ): Promise<{ ItemId: number; ItemName: string; ItemNumber: string; ItemType: 'Material' } | undefined> => {
    console.log(`[MaterialSync] Starting processMaterialGroup for material: ${group.styleMaterialNumber}`);
    const firstItem = group.items[0];
    if (!firstItem) {
      console.warn(`[MaterialSync] Group has no items. Skipping.`);
      return;
    }

    const sourceMaterialId = firstItem.styleId;
    if (!sourceMaterialId) {
      console.warn(`[MaterialSync] No source MaterialId found for item ${firstItem.id}. Skipping.`);
      return;
    }

    // 1. Fetch source Material details with OData by MaterialCode
    const odataResponse = await odata2material.getMaterialData({ MaterialCode: firstItem.styleMaterialNumber });
    const materialList = extractODataList<any>(odataResponse);
    const materialNode = materialList[0];

    if (!materialNode) {
      console.warn(
        `[MaterialSync] OData returned no material data for code "${firstItem.styleMaterialNumber}". PLM may have returned an empty result or the material may not exist in PLM. Skipping sync for this group.`,
      );
      return;
    }

    // 2. Fetch original Material Colorways from layout endpoint to get RowVersionText
    const plmColorways = await fetchPlmMaterialColorways(sourceMaterialId, currentUser);

    const matchedColorways = Array.isArray(plmColorways)
      ? matchMaterialColorways(plmColorways, group.items)
      : [];

    // 3. Save updates to existing colorways directly (Comments + Dates)
    if (matchedColorways.length > 0) {
      const saveColorwayPayload = buildSaveMaterialColorwayPayload({
        materialId: Number(sourceMaterialId),
        materialCode: firstItem.styleMaterialNumber,
        materialName: firstItem.styleMaterialName,
        materialDetails: materialNode,
        matchedColorways,
        currentUser,
      });

      await savePlmMaterialColorways(saveColorwayPayload as any);
    }

    // 4. Upload annotated image to Material (if present) - Commented out per requirements (no image update for Material)
    /*
    const base64Str = getBase64Image(group.annotatedImage || firstItem.annotatedImage);
    if (base64Str) {
      const extension = getExtensionFromBase64(base64Str) || "jpg";
      const filename = `${firstItem.styleMaterialNumber}_annotated.${extension}`;
      const rawBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");

      const uploadPayload = {
        objectFilePath: filename,
        objectExtension: null,
        sequence: 0,
        details: {
          name: null,
          note: null,
          dlType: 11,
          type: "materialImages",
        },
        referenceId: Number(sourceMaterialId),
        modifyDate: "0001-01-01T00:00:00",
        code: "E0012",
        isDefault: false,
        objectId: 0,
        originalObjectName: filename,
        objectStream: null,
        tempId: generateUUID(),
      };

      try {
        await uploadPlmStyleImage(uploadPayload);
      } catch (uploadErr) {
        console.error(`[MaterialSync] Image upload failed:`, uploadErr);
      }
    }
    */

    // 5. Update local database items
    for (const item of group.items) {
      if (!item.id) continue;

      const match = matchedColorways.find((mc) => mc.projItem.id === item.id);
      const styleColorwayId = match?.plmColorway?.MaterialColorwayId ?? match?.plmColorway?.MaterialColorwayID ?? match?.plmColorway?.Id ?? match?.plmColorway?.id;
      const finalColorId = styleColorwayId ? Number(styleColorwayId) : (item.colorId ?? 0);

      try {
        await projectService.updateProjectItem(item.id, {
          styleId: Number(sourceMaterialId),
          colorId: finalColorId,
          colorStatusId: item.colorStatusId ?? 0,
          styleMaterialNumber: item.styleMaterialNumber,
          styleMaterialName: item.styleMaterialName,
          itemType: 'Material',
          colorway: item.colorway,
          colorwayStatus: item.colorwayStatus,
          selectionCondition: item.selectionCondition || "As-Is",
          sampleDue: item.sampleDue,
          buyerComments: item.buyerComments,
          internalComments: item.internalComments,
          annotatedImage: item.annotatedImage,
        });
      } catch (updateErr) {
        console.error(
          `[MaterialSync] Failed to update local DB for item ${item.id} (${item.styleMaterialNumber}):`,
          updateErr,
        );
      }
    }

    await refreshItems(projectId);

    return {
      ItemId: Number(sourceMaterialId),
      ItemName: firstItem.styleMaterialName,
      ItemNumber: firstItem.styleMaterialNumber,
      ItemType: 'Material' as const,
    };
  },
};

// Helper functions (analogous to Style helpers)
function matchMaterialColorways(plmColorways: any[], localItems: ProjectItem[]) {
  const list: { plmColorway: any; projItem: ProjectItem }[] = [];
  for (const projItem of localItems) {
    const plmCol = plmColorways.find(
      (pc) => (pc.Name || "").toLowerCase().trim() === (projItem.colorway || "").toLowerCase().trim()
    );
    if (plmCol) {
      list.push({ plmColorway: plmCol, projItem });
    }
  }
  return list;
}
