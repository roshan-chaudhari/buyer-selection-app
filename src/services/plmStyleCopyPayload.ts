import { computeIdGenContextValues } from "./plmIdGeneratorPayload";

export interface PlmStyleNodeInput {
  StyleNumber: string;
  StyleId: number;
  StyleCode: string;
  NameCulture?: string;
  SeasonId?: number | null;
  BrandId?: number | null;
  CollectionId?: number | null;
  CategoryId?: number | null;
  DivisionId?: number | null;
  BOMLineMainMaterial?: string | null;
  StyleBOM?: any;
  selectionCondition?: string | null;
}

export interface PlmCustomData {
  key: string;
  value?: string | number | boolean | null;
}

export interface PlmStyleCopyRequest {
  Sequence: number;
  schema: string;
  TaskId: "styleCopy" | "styleVariant";
  CustomData: PlmCustomData[];
}

function buildInfoClusters(styleId: number): string {
  const clusterDefinitions: Array<{ id: number; flag: number }> = [
    { id: 2,  flag: 1 },
    { id: 26, flag: 1 },
    { id: 8,  flag: 1 },
    { id: 9,  flag: 1 },
    { id: 13, flag: 1 },
    { id: 22, flag: 1 },
    { id: 23, flag: 1 },
    { id: 24, flag: 0 },
    { id: 16, flag: 1 },
    { id: 5,  flag: 1 },
    { id: 18, flag: 1 },
    { id: 10, flag: 1 },
    { id: 17, flag: 1 },
    { id: 19, flag: 1 },
    { id: 21, flag: 1 },
    { id: 20, flag: 1 },
    { id: 29, flag: 1 },
  ];

  return clusterDefinitions
    .map(({ id, flag }) => `${id},${flag},0,${flag ? styleId : 0},0`)
    .join("|");
}

function getBomLineIds(styleBomList: any, bomLineMainMaterial: string | null | undefined): string {
  if (!styleBomList || !Array.isArray(styleBomList) || styleBomList.length === 0) {
    return bomLineMainMaterial ?? "";
  }
  const list: string[] = [];
  const bom =
    styleBomList.find(
      (b: any) =>
        b && (b.IsMain === 1 || b.isMain === 1 || b.IsMain === true || b.isMain === true),
    ) ?? styleBomList[0];
  if (bom) {
    const bomVersionId = bom.Id ?? bom.id ?? 0;
    const bomLine = bom.BOMLine ?? bom.BomLine ?? bom.bomLine ?? [];
    if (Array.isArray(bomLine)) {
      const sortedLines = [...bomLine].sort((a, b) => {
        const idA = Number(a?.Id ?? a?.id ?? 0);
        const idB = Number(b?.Id ?? b?.id ?? 0);
        return idA - idB;
      });
      for (const item of sortedLines) {
        if (!item) continue;
        const bomLineId = item.Id ?? item.id ?? 0;
        list.push(`${bomVersionId},${bomLineId},${bomLineId}`);
      }
    }
  }
  return list.join("|");
}

export function extractStyleInputFromNode(
  styleNode: Record<string, unknown>
): PlmStyleNodeInput {
  return {
    StyleNumber: String(styleNode["Name"] ?? ""),
    StyleId: Number(styleNode["StyleId"] ?? 0),
    StyleCode: String(styleNode["StyleCode"] ?? ""),
    SeasonId: Number(styleNode["SeasonId"]),
    BrandId: Number(styleNode["BrandId"]),
    CollectionId: Number(styleNode["CollectionId"]),
    CategoryId: Number(styleNode["CategoryId"]),
    DivisionId: Number(styleNode["DivisionId"]),
    BOMLineMainMaterial: styleNode["BOMLineMainMaterial"] != null
      ? String(styleNode["BOMLineMainMaterial"])
      : null,
    StyleBOM: styleNode["StyleBOM"] ?? styleNode["StyleBom"] ?? styleNode["styleBom"] ?? styleNode["stylebom"] ?? null,
  };
}

export async function buildStyleCopyPayload(
  StyleNumber:string,
  Sequence: number,
  styleInput: PlmStyleNodeInput,
  schema: string,
  userId: number,
): Promise<PlmStyleCopyRequest> {
  const { StyleId, StyleCode, SeasonId, BOMLineMainMaterial} = styleInput;

  const cond = (styleInput.selectionCondition ?? "").toLowerCase().trim();
  const isBigChange = cond.includes("big") && cond.includes("change");
  const styleNameValue = isBigChange ? "Variant of" : "Copy of";
  const taskId: "styleCopy" | "styleVariant" = isBigChange ? "styleVariant" : "styleCopy";
  const infoClusterString = buildInfoClusters(StyleId);

  // Compute idGenContextVal / idGenContextVal2 dynamically from the PLM ID Generator API.
  let newContextFieldValue = '[""]';
  let newContextFieldValue2 = "[]";
  try {
    const res = await computeIdGenContextValues({
      autoNumberId: "1",  // TODO: replace with real PLM autoNumberId
      schema,
      styleData: {
        SeasonId:     styleInput.SeasonId    ?? null,
        BrandId:      styleInput.BrandId     ?? null,
        CollectionId: styleInput.CollectionId ?? null,
        CategoryId:   styleInput.CategoryId   ?? null,
        DivisionId:   styleInput.DivisionId   ?? null,
      },
    });
    newContextFieldValue = res.newContextFieldValue;
    newContextFieldValue2 = res.newContextFieldValue2;
  } catch (err: any) {
    console.error("[IdGenerator] ❌ Error:", err?.response?.data ?? err?.message);
  }

  const bomLineIds = getBomLineIds(styleInput.StyleBOM, BOMLineMainMaterial);

  const customData: PlmCustomData[] = [
    {
      key: "schema",
      value: schema,
    },
    {
      key: "numberPrefix",
      value: ""
    },
    {
      key: "styleName",
      value: styleNameValue+"-"+StyleNumber,
    },
    {
      key: "description",
      value: "",
    },
    {
      key: "quantity",
      value: 1,
    },
    {
      key: "modifyId",
      value: String(userId),
    },
    {
      key: "infoClusters",
      value: infoClusterString,
    },
    {
      key: "targetIds",
      value: undefined,
    },
    {
      key: "selectedImageTypes",
      value: "11,18,13,12,14,1,15,16,17",
    },
    {
      key: "bomlineIds",
      value: bomLineIds,
    },
    {
      key: "careIds",
      value: "",
    },
    {
      key: "masterPages",
      value: "",
    },
    {
      key: "sizeRanges",
      value: ""
    },
    {
      key: "colorways",
      value: "",
    },
    {
      key: "styleId",
      value: StyleId,
    },
    {
      key: "patterns",
      value: "",
    },
    {
      key: "markers",
      value: "",
    },
    {
      key: "attachments",
      value: "",
    },
    {
      key: "cultureInfo",
      value: "en-US",
    },
    {
      key: "idGenContextVal",
      value: newContextFieldValue,
    },
    {
      key: "idGenContextVal2",
      value: newContextFieldValue2,
    },
    {
      key: "operationType",
      value: taskId === "styleVariant" ? 2 : 0,
    },
    {
      key: "copyVersion",
      value: 1,
    },
    {
      key: "copyAttachment",
      value: true,
    },
    {
      key: "masterId",
      value: StyleId,
    },
    {
      key: "code",
      value: StyleCode,
    },
    {
      key: "fields",
      value: "99",
    },
    {
      key: "extendedfields",
      value: "",
    },
    {
      key: "copyValues",
      value: JSON.stringify([{ id: 1, module: 1, fieldId: 1, value: 1 }]),
    },
    {
      key: "copyTranslation",
      value: 0,
    },
    {
      key: "seasonId",
      value: SeasonId ?? 0,
    },
  ];

  const payload: PlmStyleCopyRequest = {
    Sequence,
    schema,
    TaskId: taskId,
    CustomData: customData,
  };

  console.log(
    `[buildStyleCopyPayload] Generated request payload for StyleId ${StyleId} (${StyleCode}):\n${JSON.stringify(payload, null, 2)}`,
  );

  return payload;
}
