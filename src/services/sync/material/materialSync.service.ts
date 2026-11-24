import {
  api,
  odata2material,
  fetchPlmMaterialColorways,
  fetchPlmMaterialDetails,
  savePlmMaterialColorways,
} from "../../api";
import { getStoredToken } from "../../../auth/tokenUtils";
import { computeIdGenContextValues } from "../../plmIdGeneratorPayload";
import { buildSaveMaterialColorwayPayload } from "./materialColor.service";
import { projectService, type ProjectItem } from "../../projectService";
import type { GroupedStyle } from "../../../types/projects";
import type { InforUser } from "../../../types/api";
import { extractODataList } from "../../../utils/odata";

/** autoNumberId used by the PLM ID Generator for Material */
const MATERIAL_AUTO_NUMBER_ID = "2";

const formatDateToMMDDYYYY = (dateVal?: string | Date | null) => {
  if (!dateVal) return "";
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  return typeof dateVal === "string" ? dateVal : "";
};

const toNumberOrNull = (val: unknown): number | null =>
  val !== undefined && val !== null && val !== "" && !isNaN(Number(val)) ? Number(val) : null;

async function savePlmMaterialOverview(payload: Record<string, unknown>): Promise<any> {
  const token = getStoredToken();
  const { data } = await api.post(
    "/api/pdm/material/v2/save",
    payload,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  return data;
}

/**
 * Updates the Material Overview (FreeFieldCert = Project Name, DateField1 = Project Date)
 * following the same pattern used for the Style Overview update.
 */
async function updateMaterialOverviewAfterSync(params: {
  materialId: number | string;
  projectId: number;
  materialNode: Record<string, any>;
  currentUser: InforUser;
}): Promise<void> {
  const { materialId, projectId, materialNode, currentUser } = params;

  try {
    // 1. Resolve current project data (Project Name / Project Date)
    const projects = await projectService.getAllProjects();
    const project = projects.find((p) => Number(p.id) === Number(projectId));
    if (!project) {
      console.warn(`[MaterialSync] Project ${projectId} not found. Skipping Material Overview update.`);
      return;
    }
    const projectNameVal = project.ProjectName || "";
    const projectDateVal = formatDateToMMDDYYYY(project.SelectionDate);

    // 2. Fetch latest material details to get the current RowVersionText
    const materialDetails = (await fetchPlmMaterialDetails(materialId, currentUser)) ?? {};
    const details: Record<string, any> = { ...materialNode, ...materialDetails };

    const rowVersionText = String(details.RowVersionText || details.rowVersionText || "");
    if (!rowVersionText) {
      console.warn(`[MaterialSync] RowVersionText not found for MaterialId ${materialId}. Skipping Material Overview update.`);
      return;
    }

    // 3. Generate idGenContextVal and idGenContextVal2 (same logic as Style Overview)
    let idGenContextVal = '[""]';
    let idGenContextVal2 = "[]";
    try {
      const res = await computeIdGenContextValues({
        autoNumberId: MATERIAL_AUTO_NUMBER_ID,
        schema: currentUser.activeSchema,
        styleData: {
          MainCategoryId: toNumberOrNull(details.MainCategoryId),
          CategoryId: toNumberOrNull(details.CategoryId),
          SeasonId: toNumberOrNull(details.SeasonId),
          BrandId: toNumberOrNull(details.BrandId),
          CollectionId: toNumberOrNull(details.CollectionId),
          DivisionId: toNumberOrNull(details.DivisionId),
        },
      });
      idGenContextVal = res.newContextFieldValue;
      idGenContextVal2 = res.newContextFieldValue2;
    } catch (genErr) {
      console.error("[MaterialSync] Failed to generate ID Gen context values:", genErr);
    }

    // 4. Build field values
    const fieldValues = [
      { FieldName: "FreeFieldCert", Value: projectNameVal },
      { FieldName: "DateField1", Value: projectDateVal },
      { FieldName: "MaterialCode", Value: details.MaterialCode || "" },
      { FieldName: "MaterialName", Value: details.MaterialName || "" },
    ];

    // 5. Construct complete payload
    const userIdVal = String(currentUser.userId);
    const payload = {
      Key: Number(materialId),
      userId: userIdVal,
      notificationMessageKey: "UPDATED_MATERIAL_OVERVIEW",
      RowVersionText: rowVersionText,
      ModifyId: userIdVal,
      FieldValues: fieldValues,
      SubEntities: [],
      ModuleId: Number(materialId),
      idGenContextVal,
      idGenContextVal2,
      idGenVal: [],
      locale: "en-US",
      cultureInfos: [],
      auditValues: [],
      Schema: currentUser.activeSchema,
    };

    // console.log(
    //   `[MaterialSync] Material Overview save request (MaterialId ${materialId}):`,
    //   JSON.stringify(payload, null, 2),
    // );

    await savePlmMaterialOverview(payload);
    // console.log(`[MaterialSync] Material Overview saved (MaterialId ${materialId})`);
  } catch (err) {
    console.error(`[MaterialSync] Failed to update Material Overview for MaterialId ${materialId}:`, err);
  }
}

export const materialSyncService = {
  processMaterialGroup: async (
    group: GroupedStyle,
    currentUser: InforUser,
    projectId: number,
    refreshItems: (id: number) => Promise<ProjectItem[]>,
  ): Promise<{ ItemId: number; ItemName: string; ItemNumber: string; ItemType: 'Material' } | undefined> => {
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

    // 3.5 Update Material Overview after colorway update completes
    await updateMaterialOverviewAfterSync({
      materialId: sourceMaterialId,
      projectId,
      materialNode,
      currentUser,
    });

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
