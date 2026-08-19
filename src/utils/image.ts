import { DEFAULT_GARMENT_SVG } from '../features/projects/constants';

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

/** Formats image URL to route through the backend proxy if hosted on S3 */
export function formatDisplayImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return url;
  }
  if (url.includes('/api/projects/proxy-image') || url.includes('/api/projects/s3-image')) {
    return url;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `${defaultBaseUrl}/api/projects/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/** Extracts the first image URL or base64 string from an annotatedImage field or PLM fallback */
export function getFirstImage(imgStr: string | null | undefined, plmUrl: string | null = null): string {
  if (plmUrl) {
    return formatDisplayImageUrl(plmUrl);
  }
  if (imgStr) {
    if (imgStr.startsWith('[')) {
      try {
        const parsed = JSON.parse(imgStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          const val = (typeof first === 'object' ? first.annotated || first.original : first) || '';
          if (val) return formatDisplayImageUrl(val);
        }
      } catch {
        // Fall through to plain string handling
      }
    } else if (imgStr.startsWith('http') || imgStr.startsWith('data:') || imgStr.startsWith('blob:')) {
      return formatDisplayImageUrl(imgStr);
    }
  }
  return DEFAULT_GARMENT_SVG;
}

/** Extracts the raw image reference string from annotatedImage without proxy transformation */
export function extractFirstImageRef(imgStr: string | null | undefined): string {
  if (!imgStr) return '';
  if (imgStr.startsWith('[')) {
    try {
      const parsed = JSON.parse(imgStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        return (typeof first === 'object' ? first.annotated || first.original : first) || '';
      }
    } catch {
      return imgStr;
    }
  }
  return imgStr;
}

/** Checks whether an image string or data URI is an SVG */
export function isSvgImage(str: string): boolean {
  if (!str) return false;
  return str.startsWith('data:image/svg') || str.includes('.svg') || str.includes('<svg');
}

/** Fetches a binary Blob from a given data URI, S3 URL, or direct URL */
export async function resolveImageBlob(imgRef: string): Promise<Blob | null> {
  if (!imgRef) return null;

  if (imgRef.startsWith('data:')) {
    try {
      const res = await fetch(imgRef);
      return await res.blob();
    } catch {
      return null;
    }
  }

  try {
    const proxyUrl = formatDisplayImageUrl(imgRef);
    const res = await fetch(proxyUrl);
    if (res.ok) {
      return await res.blob();
    }
  } catch {
    // Fallback to direct fetch
  }

  try {
    const directRes = await fetch(imgRef);
    if (directRes.ok) {
      return await directRes.blob();
    }
  } catch {
    return null;
  }

  return null;
}
