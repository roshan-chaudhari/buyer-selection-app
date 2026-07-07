/**
 * Normalizes wrapped OData v2/v4 response shapes into a flat array of elements.
 */
export function extractODataList<T>(raw: unknown): T[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  if (Array.isArray(raw)) return raw as T[];
  if (Array.isArray(r.value)) return r.value as T[];
  if (Array.isArray(r.results)) return r.results as T[];
  
  const d = r.d as Record<string, unknown> | undefined;
  if (d && typeof d === 'object') {
    if (Array.isArray(d.results)) return d.results as T[];
    return [d as T];
  }
  return [];
}
