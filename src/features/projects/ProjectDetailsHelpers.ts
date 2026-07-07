import type { ProjectItem } from "../../services/projectService";
import type { ColorwayOption } from "../../types/api";
import type { GroupedStyle } from "../../types/projects";
import { extractODataList } from "../../utils/odata";

// ─── PLM API Interfaces ──────────────────────────────────────────────────────

export interface RawStyleColorway {
  StyleColorwayId?: number;
  Name?: string;
  Description?: string;
  Code?: string;
}

export interface RawStyleColorwaysEnvelope {
  results?: RawStyleColorway[];
  value?: RawStyleColorway[];
}

export interface RawStyleObject {
  StyleId?: number;
  StyleCode?: string;
  StyleColorways?: RawStyleColorway[] | RawStyleColorwaysEnvelope;
}

export interface RawODataEnvelope {
  value?: RawStyleObject[];
  d?: {
    results?: RawStyleObject[] | RawStyleObject;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function groupItemsByStyle(items: ProjectItem[]): GroupedStyle[] {
  const groups: Record<string, ProjectItem[]> = {};
  for (const item of items) {
    const key = item.styleMaterialNumber || "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return Object.entries(groups).map(([styleMaterialNumber, styleItems]) => {
    const first = styleItems[0];
    return {
      styleMaterialNumber,
      styleMaterialName: first.styleMaterialName || "",
      annotatedImage: styleItems.find((it) => it.annotatedImage)?.annotatedImage ?? first.annotatedImage,
      selectionCondition: first.selectionCondition || "As-Is",
      items: styleItems,
    };
  });
}

export function sortGroupedStyles(
  groups: GroupedStyle[],
  column: string,
  direction: "asc" | "desc",
): GroupedStyle[] {
  if (!column) return groups;
  const factor = direction === "asc" ? 1 : -1;
  return [...groups].sort((a, b) => {
    const rawA = a[column as keyof GroupedStyle];
    const rawB = b[column as keyof GroupedStyle];

    const valA = (typeof rawA === "string" || typeof rawA === "number") ? rawA : "";
    const valB = (typeof rawB === "string" || typeof rawB === "number") ? rawB : "";

    if (valA === undefined || valB === undefined) return 0;

    const numA = Number(valA);
    const numB = Number(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return (numA - numB) * factor;
    }

    return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * factor;
  });
}

export async function extractColorwaysFromPlmResponse(
  response: RawODataEnvelope | RawStyleObject[] | RawStyleObject
): Promise<ColorwayOption[]> {
  const styleList = extractODataList<RawStyleObject>(response);
  if (styleList.length === 0) return [];

  const rawColorways = extractODataList<RawStyleColorway>(styleList[0].StyleColorways);
  const mapped = rawColorways
    .map((cw) => {
      const val = cw.Name ?? "";
      if (!val) {
        return null;
      }
      return {
        value: val,
        label: cw.Code ? `${cw.Code} - ${val}` : val,
        colorwayId: cw.StyleColorwayId ?? 0,
      };
    })
    .filter((opt): opt is ColorwayOption => opt !== null);
  return mapped.sort((a, b) => a.value.localeCompare(b.value));
}

// ─── PLM Query Param Builder ─────────────────────────────────────────────────

export function buildPlmStyleParams(
  styleNumber: string,
  styleId?: number,
): { StyleId: number } | { StyleCode: string } {
  const isNumeric = styleNumber.length > 0 && /^\d+$/.test(styleNumber);
  if (styleId && styleId > 0) return { StyleId: styleId };
  if (isNumeric) return { StyleId: Number(styleNumber) };
  return { StyleCode: styleNumber };
}
