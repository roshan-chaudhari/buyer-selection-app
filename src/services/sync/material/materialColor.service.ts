import type { InforUser } from "../../../types/api";
import type { ProjectItem } from "../../projectService";

export interface SaveMaterialColorwayRequestPayload {
  materialID: string;
  MaterialColorwayDto: any[];
  createId: number;
  modifyId: number;
  userId: number;
  moduleId: number;
  moduleCode: string;
  moduleName: string;
  forDelColorwaysIds: any[];
  Schema: string;
}

export function buildSaveMaterialColorwayPayload(params: {
  materialId: number;
  materialCode: string;
  materialName: string;
  materialDetails: Record<string, any>;
  matchedColorways: { plmColorway: any; projItem: ProjectItem }[];
  currentUser: InforUser;
}): SaveMaterialColorwayRequestPayload {
  const userId = Number(params.currentUser.userId);
  const schema = params.currentUser.activeSchema;

  console.log("[buildSaveMaterialColorwayPayload] Starting payload construction for:", {
    materialId: params.materialId,
    materialCode: params.materialCode,
    matchedColorwaysCount: params.matchedColorways.length,
    userId,
    schema
  });

  // const formatDateToMMDDYYYY = (dateStr?: string | null) => {
  //   if (!dateStr) {
  //     const d = new Date();
  //     const mm = String(d.getMonth() + 1).padStart(2, '0');
  //     const dd = String(d.getDate()).padStart(2, '0');
  //     const yyyy = d.getFullYear();
  //     const result = `${mm}/${dd}/${yyyy}`;
  //     return result;
  //   }
  //   const d = new Date(dateStr);
  //   if (!isNaN(d.getTime())) {
  //     const mm = String(d.getMonth() + 1).padStart(2, '0');
  //     const dd = String(d.getDate()).padStart(2, '0');
  //     const yyyy = d.getFullYear();
  //     const result = `${mm}/${dd}/${yyyy}`;
  //     return result;
  //   }
  //   const parts = dateStr.split('-');
  //   if (parts.length === 3) {
  //     const result = `${parts[1]}/${parts[2].split('T')[0]}/${parts[0]}`;
  //     return result;
  //   }
  //   return dateStr;
  // };

  const dtoList = params.matchedColorways.map(({ plmColorway, projItem }) => {
    const materialColorwayId = plmColorway.MaterialColorwayId ?? plmColorway.MaterialColorwayID ?? plmColorway.id ?? plmColorway.Id;

    const fieldValues = [
      {
        fieldName: "FreeFieldFive",
        value: projItem.buyerComments || ""
      },
      {
        fieldName: "MaterialId",
        value: Number(params.materialId),
      },
      {
        fieldName: "MaterialColorwayId",
        value: Number(materialColorwayId),
      },
      {
        fieldName: "RowVersionText",
        value: plmColorway.RowVersionText ?? plmColorway.rowVersionText ?? plmColorway.RowVersion ?? plmColorway.rowVersion ?? "",
      },
      {
        fieldName: "Name",
        value: plmColorway.Name || "",
      },
      {
        fieldName: "Code",
        value: plmColorway.Code || "",
      }
    ];
    return {
      Id: Number(materialColorwayId),
      FieldValues: fieldValues,
      colorContent: [],
    };
  });

  const finalPayload: SaveMaterialColorwayRequestPayload & Record<string, any> = {
    materialID: Number(params.materialId) as any,
    MaterialColorwayDto: dtoList,
    createId: userId,
    modifyId: userId,
    userId: userId,
    moduleId: Number(params.materialId),
    moduleCode: params.materialCode,
    moduleName: params.materialName,
    notificationMessageKey: "UPDATED_MATERIAL_COLORWAYS",
    pageType: "details",
    forDelColorwaysIds: [],
    parentMaterialId: null,
    Schema: schema,
  };

  console.log("[buildSaveMaterialColorwayPayload] Final constructed payload:", JSON.stringify(finalPayload, null, 2));
  return finalPayload;
}
