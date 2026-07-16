import {
  fetchPlmStyleDetails,
  savePlmStyleOverview,
  odata2Service,
} from "../../api";
import { computeIdGenContextValues } from "../../plmIdGeneratorPayload";
import type { ProjectItem } from "../../projectService";
import type { InforUser } from "../../../types/api";
import { extractODataList } from "../../../utils/odata";

const formatDateToMMDDYYYY = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  return dateStr;
};

export const styleOverviewService = {
  updateStyleOverviewAfterSync: async (params: {
    newStyleId: number | string;
    projItem: ProjectItem;
    currentUser: InforUser;
    buyerId: number | null;
    projectName: string;
  }): Promise<void> => {
    const { newStyleId, projItem, currentUser, buyerId, projectName } = params;
    console.log(`[StyleOverviewService] Starting Style Overview update for StyleId: ${newStyleId}`);

    try {
      // 1. Fetch latest style details to get RowVersionText and all style fields
      const styleDetails = await fetchPlmStyleDetails(newStyleId, currentUser);
      if (!styleDetails) {
        console.warn(`[StyleOverviewService] Style details not found for StyleId ${newStyleId}. Skipping Overview update.`);
        return;
      }

      const rowVersionText = String(styleDetails.RowVersionText || styleDetails.rowVersionText || "");

      // 2. Generate idGenContextVal and idGenContextVal2
      let idGenContextVal = '[""]';
      let idGenContextVal2 = "[]";
      try {
        const res = await computeIdGenContextValues({
          autoNumberId: "1", // Same autoNumberId used in copy task
          schema: currentUser.activeSchema,
          styleData: {
            SeasonId:     styleDetails.SeasonId    ? Number(styleDetails.SeasonId) : null,
            BrandId:      styleDetails.BrandId     ? Number(styleDetails.BrandId) : null,
            CollectionId: styleDetails.CollectionId ? Number(styleDetails.CollectionId) : null,
            CategoryId:   styleDetails.CategoryId   ? Number(styleDetails.CategoryId) : null,
            DivisionId:   styleDetails.DivisionId   ? Number(styleDetails.DivisionId) : null,
          },
        });
        idGenContextVal = res.newContextFieldValue;
        idGenContextVal2 = res.newContextFieldValue2;
      } catch (genErr) {
        console.error("[StyleOverviewService] Failed to generate ID Gen context values:", genErr);
      }

      // 2.5 Fetch Style Status lookup options (GlrefId: 104) to match the status ID
      let statusVal = 1; // fallback default
      try {
        const lookupResponse = await odata2Service.genericLookup({ GlrefId: 5 });
        const lookupList = extractODataList<any>(lookupResponse);
        
        const projStatus = (projItem.colorwayStatus || "").toLowerCase().trim();
        const matchedOpt = lookupList.find((opt) => {
          const nameVal = (opt.name || opt.Name || "").toLowerCase().trim();
          const origNameVal = (opt.original_Name || opt.original_name || "").toLowerCase().trim();
          return nameVal === projStatus || origNameVal === projStatus;
        });

        if (matchedOpt) {
          statusVal = matchedOpt.glValId || matchedOpt.GlValId || matchedOpt.id || matchedOpt.Id || 1;
          console.log(`[StyleOverviewService] Matched status "${projItem.colorwayStatus}" to ID: ${statusVal}`);
        } else {
          // If no direct name match, see if projItem.colorStatusId exists and use it
          statusVal = Number(projItem.colorStatusId || styleDetails.Status || styleDetails.ProductMaterialStatus || 1);
          console.warn(`[StyleOverviewService] Status "${projItem.colorwayStatus}" not found in lookup. Using fallback ID: ${statusVal}`);
        }
      } catch (lookupErr) {
        console.error("[StyleOverviewService] Failed to fetch lookup options for GlrefId 104:", lookupErr);
        statusVal = Number(projItem.colorStatusId || styleDetails.Status || styleDetails.ProductMaterialStatus || 1);
      }

      const dateVal = formatDateToMMDDYYYY(projItem.sampleDue) || formatDateToMMDDYYYY(styleDetails.Date3 as string);
      const buyerVal = buyerId ? String(buyerId) : "";
      const altCodeVal = projectName || "";
      const modifyIdVal = String(currentUser.userId);

      // 3. Build field values array with only the specified fields
      const fieldValues = [
        { fieldName: "StyleCode", value: styleDetails.StyleCode || "" },
        { fieldName: "Name", value: styleDetails.Name || "" },
        { fieldName: "Status", value: String(statusVal) },
        { fieldName: "e315e0b5-425d-43cf-b18d-cb545bbf23b0", value: dateVal },
        { fieldName: "MarketField4Id", value: buyerVal },
        { fieldName: "AltCode", value: altCodeVal },
        { fieldName: "ModifyId", value: modifyIdVal }
      ];

      // 4. Construct complete payload
      const payload = {
        key: String(newStyleId),
        userId: Number(currentUser.userId),
        notificationMessageKey: "UPDATED_STYLE_OVERVIEW",
        rowVersionText,
        fieldValues,
        subEntities: [],
        modifyId: String(currentUser.userId),
        idGenContextVal,
        idGenContextVal2,
        idGenVal: [],
        locale: "en-US",
        isGenAiGenerated: false,
        updatedFields: [],
        auditValues: [],
        Schema: currentUser.activeSchema,
      };

      console.log(`[StyleOverviewService] Sending Style Overview update request for StyleId ${newStyleId}...`);
      console.log("[StyleOverviewService] Style Overview Request Payload:", JSON.stringify(payload, null, 2));
      const updateRes = await savePlmStyleOverview(payload);
      console.log(`[StyleOverviewService] Style Overview updated successfully:`, updateRes);
    } catch (err) {
      console.error(`[StyleOverviewService] Failed to update Style Overview for StyleId ${newStyleId}:`, err);
    }
  }
};
