import { api } from "./api";
import { getStoredToken } from "../auth/tokenUtils";
import type { ProjectItem } from "./projectService";


export interface StyleColorwayDtoItem {
  Id: number;
  FieldValues: {
    fieldName: string;
    value: any;
  }[];
  colorContent: any[];
}

export interface SaveColorwayRequestPayload {
  styleID: number;
  StyleColorwayDto: StyleColorwayDtoItem[];
  modifyId: number;
  userId: number;
  createId: number;
  moduleId: number;
  moduleCode: string;
  moduleName: string;
  notificationMessageKey: "UPDATED_STYLE_COLORWAYS";
  pageType: "details";
  forDelColorwaysIds: any[];
  parentStyleId: null;
  Schema: string;
}

/**
 * Builds the save colorway details request payload dynamically.
 */
export function buildSaveColorwayPayload(params: {
  newStyleId: number;
  newStyleCode: string;
  newStyleName: string;
  matchedColorways: { plmColorway: any; projItem: ProjectItem }[];
  currentUser: any;
}): SaveColorwayRequestPayload {
  const userId = Number(params.currentUser.userId);
  
  const dtoList = params.matchedColorways.map(({ plmColorway, projItem }) => {
    const styleColorwayId = plmColorway.StyleColorwayId ?? plmColorway.StyleColorwayID ?? plmColorway.id;
    
    const fieldValues = [
      {
        fieldName: "RowVersionText",
        value: plmColorway.RowVersionText ?? plmColorway.rowVersionText ?? plmColorway.RowVersion ?? plmColorway.rowVersion ?? ""
      },
      {
        fieldName: "Name",
        value: plmColorway.Name || ""
      },
      {
        fieldName: "StyleColorwayId",
        value: Number(styleColorwayId)
      },
      {
        fieldName: "Code",
        value: plmColorway.Code || ""
      },
      {
        fieldName: "StyleId",
        value: Number(params.newStyleId)
      },
      {
        fieldName: "FreeFieldThree",
        value: projItem.buyerComments || ""
      },
      {
        fieldName: "Status",
        value: Number(projItem.colorStatusId ?? plmColorway.Status ?? 1)
      },
      {
        fieldName: "FreeFieldSix",
        value: projItem.internalComments || ""
      },
      {
        fieldName: "ColorwayStatus",
        value: Number(projItem.colorStatusId ?? plmColorway.ColorwayStatus ?? 1)
      }
    ];

    return {
      Id: Number(styleColorwayId),
      FieldValues: fieldValues,
      colorContent: [],
    };
  });

  return {
    styleID: params.newStyleId,
    StyleColorwayDto: dtoList,
    modifyId: userId,
    userId: userId,
    createId: userId,
    moduleId: params.newStyleId,
    moduleCode: params.newStyleCode,
    moduleName: params.newStyleName,
    notificationMessageKey: "UPDATED_STYLE_COLORWAYS",
    pageType: "details",
    forDelColorwaysIds: [],
    parentStyleId: null,
    Schema: params.currentUser.activeSchema,
  };
}

/**
 * Sends a request to save/update style colorways in PLM.
 * Endpoint: POST /api/pdm/style/colorways/save
 */
export async function savePlmStyleColorways(payload: SaveColorwayRequestPayload): Promise<any> {
  const token = getStoredToken();
  console.log("[savePlmStyleColorways] Sending Payload:", JSON.stringify(payload, null, 2));
  try {
    const response = await api.post(
      "/api/pdm/style/colorways/save",
      payload,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    return response.data;
  } catch (err: any) {
    if (err.response) {
      console.error("[savePlmStyleColorways] Server Error Response:", JSON.stringify(err.response.data, null, 2));
    }
    throw err;
  }
}
