import { odata2Service, getIdGeneratorDetails } from "./api";
import type { GenericLookUp } from "../types/api";

export interface AutoNumberSegment {
  /** e.g. "Contextual Value", "Fixed Value", "Sequence", "Year" */
  formatTypeName?: string;
  /** Ordering position in the generated number string */
  seq?: number;

  fieldId?: number | null;
  /** 1 = use the lookup item's Name; anything else = use Code */
  codeNameId?: number | null;
  [key: string]: unknown;
}

export interface IdGeneratorResponse {
  /** Field name used for lookup context 1 (e.g. "BrandId") */
  lookupField1?: string | null;
  /** Field name used for lookup context 2 (e.g. "DivisionId") */
  lookupField2?: string | null;
  /** The list of number format segments */
  autoNumberVal?: AutoNumberSegment[];
  [key: string]: unknown;
}

/** The two computed context values returned by this service */
export interface IdGenContextValues {
  /** JSON array string of contextual lookup values, e.g. ["K","S26"] */
  newContextFieldValue: string;
  /** JSON array of {FieldName, Value} objects, e.g. [{"FieldName":"BrandId","Value":12}] */
  newContextFieldValue2: string;
}

// ── GlrefId → styleData field name mapping ───────────────────────────────────
// Add new entries here to support additional PLM lookup types.
// Key   = PLM GlrefId (the `fieldId` from autoNumberVal segments)
// Value = the matching field name in StyleContextInput

const GLREF_TO_FIELD: Record<number, keyof StyleContextInput> = {
  1:  "BrandId",
  58:  "SeasonId",      // Season — common GlrefId. Adjust if your PLM uses a different value.
  24: "CollectionId",
  51: "CategoryId",
  90: "DivisionId",    // Map the custom fieldId 58 to DivisionId as observed in the logs
};


// ── Style data fields ─────────────────────────────────────────────────────────

export interface StyleContextInput {
  BrandId?:      number | null;
  SeasonId?:     number | null;
  CollectionId?: number | null;
  CategoryId?:   number | null;
  DivisionId?:   number | null;
  // Add more fields here as needed; they will be resolved via GLREF_TO_FIELD
  [key: string]: number | null | undefined;
}

// ── Helper: extract list from PLM OData envelope ─────────────────────────────

function extractList<T>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as T[];
  const r = response as Record<string, unknown>;
  if (Array.isArray(r.value)) return r.value as T[];
  if (r.d && typeof r.d === "object") {
    const d = r.d as Record<string, unknown>;
    if (Array.isArray(d.results)) return d.results as T[];
    return [d as unknown as T];
  }
  return [];
}

// ── Helper: fetch a single GenericLookUp item by GlrefId + entity Id ─────────

async function fetchLookupItem(
  glrefId: number,
  entityId: number | null | undefined,
): Promise<GenericLookUp | null> {
  if (!entityId) return null;
  try {
    const response = await odata2Service.genericLookup({ GlrefId: glrefId });
    const list = extractList<GenericLookUp>(response);
    return list.find((r) => r.GlValId === entityId || r.Id === entityId) ?? null;
  } catch {
    return null;
  }
}

// ── Main exported function ────────────────────────────────────────────────────

export async function buildIdGenContextValues(
  rawResponse: unknown,
  styleData: StyleContextInput,
): Promise<IdGenContextValues> {

  // Unwrap `d` envelope if present
  const r = rawResponse as Record<string, unknown>;
  const data: IdGeneratorResponse = (r?.d ?? rawResponse) as IdGeneratorResponse;
  const dat = JSON.parse(JSON.stringify(data));

  const idgenlookup1 = (dat.idRulesDetails.lookupField1 ?? "").replace(/\s/g, "");
  const idgenlookup2 = (dat.idRulesDetails.lookupField2 ?? "").replace(/\s/g, "");
  const datnumber = (dat.idRulesDetails?.autoNumberVal ?? []) as AutoNumberSegment[];

  // Filter "Contextual Value" segments ordered by seq
  const contextualSegments = datnumber
    .filter((v) => v.formatTypeName === "Contextual Value")
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  // Build idGenContextVal — Code/Name values in seq order
  const contextValues: string[] = [];

  for (const seg of contextualSegments) {
    if (seg.fieldId == null) {
      contextValues.push("");
      continue;
    }
    const glrefId = seg.fieldId;
    const fieldName = GLREF_TO_FIELD[glrefId];
    const entityId = fieldName ? (styleData[fieldName] as number | null | undefined) : null;
    const codeOrName: "Code" | "Name" = seg.codeNameId === 1 ? "Name" : "Code";

    const item = await fetchLookupItem(glrefId, entityId);
    const val = item ? (codeOrName === "Name" ? (item.Name ?? "") : (item.Code ?? "")) : "";
    contextValues.push(val);
  }

  // e.g. ["K","S26"]
  const extxzval = contextValues.join('","');
  const newContextFieldValue = `["${extxzval}"]`;

  // ── Step 3: Build idGenContextVal2 — {FieldName, Value} pairs ────────────────
  const resolveVal = (fieldName: string): number | null => {
    if (!fieldName) return null;
    const v = styleData[fieldName];
    return v != null && v !== 0 ? Number(v) : null;
  };

  const v1 = resolveVal(idgenlookup1);
  const v2 = resolveVal(idgenlookup2);

  let newContextFieldValue2: string;

  if (!idgenlookup1 && !idgenlookup2) {
    newContextFieldValue2 = "[]";
  } else if (!idgenlookup1) {
    newContextFieldValue2 = `[{"FieldName":"${idgenlookup2}","Value":${v2 ?? "null"}}]`;
  } else if (!idgenlookup2) {
    newContextFieldValue2 = `[{"FieldName":"${idgenlookup1}","Value":${v1 ?? "null"}}]`;
  } else {
    newContextFieldValue2 = `[{"FieldName":"${idgenlookup1}","Value":${v1 ?? "null"}},{"FieldName":"${idgenlookup2}","Value":${v2 ?? "null"}}]`;
  }

  return { newContextFieldValue, newContextFieldValue2 };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Full pipeline: calls the PLM ID Generator API, parses the response,
 * resolves generic lookup values for the style's context fields, and
 * returns the two computed context strings ready to be used in a job payload.
 */
export async function computeIdGenContextValues(params: {
  autoNumberId: string;
  schema: string;
  styleData?: StyleContextInput;
}): Promise<IdGenContextValues> {
  const { autoNumberId, schema, styleData = {} } = params;

  // ── Step 1: Call PLM ID Generator API ──────────────────────────────────────
  const rawResponse = await getIdGeneratorDetails({ autoNumberId, Schema: schema });

  // ── Step 2: Build and return context values ────────────────────────────────
  const result = await buildIdGenContextValues(rawResponse, styleData);

  return result;
}
