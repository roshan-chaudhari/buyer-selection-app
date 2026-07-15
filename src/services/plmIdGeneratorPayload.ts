import { odata2Service } from "./api";
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
  const dat =JSON.parse(JSON.stringify(data))

  // ── DEBUG: show what we received from PLM ──────────────────────────────────
  console.log("[IdGen DEBUG] 📥 dat (after d-unwrap):", dat);


  const idgenlookup1 = (dat.idRulesDetails.lookupField1 ?? "").replace(/\s/g, "");
  const idgenlookup2 = (dat.idRulesDetails.lookupField2 ?? "").replace(/\s/g, "");
  const datnumber = dat.idRulesDetails.autoNumberVal ?? [];
  

  // Filter "Contextual Value" segments ordered by seq
  const contextualSegments = datnumber
    .filter((v) => v.formatTypeName === "Contextual Value")
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  console.log("[IdGen DEBUG] 🧩 contextualSegments found:", contextualSegments.length, contextualSegments);

  // Build idGenContextVal — Code/Name values in seq order
  const contextValues: string[] = [];

  for (const seg of contextualSegments) {
    console.log("[IdGen DEBUG] 🔄 Processing segment:", seg);
    if (seg.fieldId == null) {
      console.log("[IdGen DEBUG]   ⚠️  fieldId is null — pushing empty");
      contextValues.push("");
      continue;
    }
    const glrefId = seg.fieldId;
    const fieldName = GLREF_TO_FIELD[glrefId];
    console.log("fieldName",fieldName)
    const entityId = fieldName ? (styleData[fieldName] as number | null | undefined) : null;
    const codeOrName: "Code" | "Name" = seg.codeNameId === 1 ? "Name" : "Code";

    console.log(`[IdGen DEBUG]   glrefId=${glrefId} → fieldName=${fieldName} → entityId=${entityId} → use ${codeOrName}`);

    const item = await fetchLookupItem(glrefId, entityId);
    console.log(`[IdGen DEBUG]   fetchLookupItem result:`, item);

    const val = item ? (codeOrName === "Name" ? (item.Name ?? "") : (item.Code ?? "")) : "";
    console.log(`[IdGen DEBUG]   → value="${val}"`);
    contextValues.push(val);
  }

  // e.g. ["K","S26"]
  const extxzval = contextValues.join('","');
  const newContextFieldValue = `["${extxzval}"]`;
  console.log("[IdGen DEBUG] ✅ newContextFieldValue:", newContextFieldValue);


  // ── Step 3: Build idGenContextVal2 — {FieldName, Value} pairs ────────────────
  // lookupField1 / lookupField2 are field names like "DivisionId", "SeasonId".
  // Value = the raw integer ID from styleData (no lookup needed).

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

  console.log("[IdGenContext] 🔑 newContextFieldValue  :", newContextFieldValue);
  console.log("[IdGenContext] 🔑 newContextFieldValue2 :", newContextFieldValue2);

  return { newContextFieldValue, newContextFieldValue2 };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Full pipeline: calls the PLM ID Generator API, parses the response,
 * resolves generic lookup values for the style's context fields, and
 * returns the two computed context strings ready to be used in a job payload.
 *
 * This is the ONLY function external callers need to import.
 *
 * @param autoNumberId  - The PLM auto-number definition ID (e.g. "StyleNumber")
 * @param schema        - The active tenant schema from currentUser.activeSchema
 * @param styleData     - The style's context fields (BrandId, CollectionId, etc.)
 *
 * @returns {
 *   newContextFieldValue  — e.g. ["K","S26"]
 *   newContextFieldValue2 — e.g. [{"FieldName":"BrandId","Value":12}]
 * }
 *
 * Usage:
 *   const { newContextFieldValue, newContextFieldValue2 } =
 *     await computeIdGenContextValues({ autoNumberId, schema, styleData });
 */
export async function computeIdGenContextValues(params: {
  autoNumberId: string;
  schema: string;
  styleData?: StyleContextInput;
}): Promise<IdGenContextValues> {
  const { autoNumberId, schema, styleData = {} } = params;

  // ── Step 1: Call PLM ID Generator API ──────────────────────────────────────
  const { getIdGeneratorDetails } = await import("./api");
  const rawResponse = await getIdGeneratorDetails({ autoNumberId, Schema: schema });

  console.log("[computeIdGenContextValues] 📥 Raw idgenerator response:", JSON.stringify(rawResponse, null, 2));

  // ── Step 2: Build and return context values ────────────────────────────────
  const result = await buildIdGenContextValues(rawResponse, styleData);

  console.log("[computeIdGenContextValues] 🔑 newContextFieldValue  :", result.newContextFieldValue);
  console.log("[computeIdGenContextValues] 🔑 newContextFieldValue2 :", result.newContextFieldValue2);

  return result;
}
