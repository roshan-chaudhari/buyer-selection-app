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
    { id: 2, flag: 1 },
    { id: 26, flag: 1 },
    { id: 8, flag: 1 },
    { id: 9, flag: 1 },
    { id: 13, flag: 1 },
    { id: 22, flag: 1 },
    { id: 23, flag: 1 },
    { id: 24, flag: 0 },
    { id: 16, flag: 1 },
    { id: 5, flag: 1 },
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

/**
 * Converts a zero-based variant index into an alphabetical suffix letter.
 * 0 → "A", 1 → "B", …, 25 → "Z", 26 → "AA", 27 → "AB", …
 */
function indexToAlphaSuffix(index: number): string {
  let suffix = "";
  let n = index;
  do {
    suffix = String.fromCharCode(65 + (n % 26)) + suffix;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return suffix;
}

export async function buildStyleCopyPayload(
  StyleNumber: string,
  Sequence: number,
  styleInput: PlmStyleNodeInput,
  schema: string,
  userId: number,
  /** Zero-based variant index used to generate alphabetical suffix (-A, -B, -C …)
   *  for As-Is and Small Change conditions. Defaults to 0 → "-A". */
  variantSuffixIndex: number = 0,
): Promise<PlmStyleCopyRequest> {
  const { StyleId, StyleCode, SeasonId, BOMLineMainMaterial } = styleInput;

  const cond = (styleInput.selectionCondition ?? "").toLowerCase().trim();
  const isBigChange = cond.includes("big") && cond.includes("change");
  const taskId: "styleCopy" | "styleVariant" = isBigChange ? "styleCopy" : "styleVariant";

  // For As-Is / Small Change: append alphabetical suffix (-A, -B, …) to style name and code.
  // For Big Change (Copy Of): keep the "Copy of " prefix, no suffix appended.
  const alphaSuffix = !isBigChange ? `-${indexToAlphaSuffix(variantSuffixIndex)}` : "";
  const styleNameValue = isBigChange ? "Copy of " : "";
  const infoClusterString = buildInfoClusters(StyleId);

  // Compute idGenContextVal / idGenContextVal2 dynamically from the PLM ID Generator API.
  let newContextFieldValue = '[""]';
  let newContextFieldValue2 = "[]";
  try {
    const res = await computeIdGenContextValues({
      autoNumberId: "1",  // TODO: replace with real PLM autoNumberId
      schema,
      styleData: {
        SeasonId: styleInput.SeasonId ?? null,
        BrandId: styleInput.BrandId ?? null,
        CollectionId: styleInput.CollectionId ?? null,
        CategoryId: styleInput.CategoryId ?? null,
        DivisionId: styleInput.DivisionId ?? null,
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
      value: isBigChange
        ? styleNameValue + StyleNumber
        : StyleNumber + alphaSuffix,
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
      value: isBigChange ? StyleCode : StyleCode + alphaSuffix,
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

  return payload;
}
