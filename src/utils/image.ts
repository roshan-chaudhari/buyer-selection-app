import { DEFAULT_GARMENT_SVG } from '../features/projects/constants';

const defaultBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';

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
  // 1. If an annotated/saved image exists in the app/S3, extract it
  if (imgStr) {
    const raw = String(imgStr).trim();
    if (raw && raw !== '[]' && raw !== 'null' && raw !== 'undefined' && raw !== '""' && raw !== "''") {
      if (raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const first = parsed[0];
            const val = (typeof first === 'object' ? first.annotated || first.original : first) || '';
            if (val) return formatDisplayImageUrl(val);
          }
        } catch {
          // Fall through to plain string handling
        }
      } else if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('blob:')) {
        return formatDisplayImageUrl(raw);
      }
    }
  }

  // 2. Default state: Check whether it has an image from PLM. If it does, show it!
  if (plmUrl && plmUrl.trim() !== '') {
    return formatDisplayImageUrl(plmUrl);
  }

  // 3. Fallback to garment placeholder only when neither annotation nor PLM image exists
  return DEFAULT_GARMENT_SVG;
}

/** Checks whether an S3 URL represents the permanent default PLM style image */
export function isPlmDefaultImage(urlOrKey: string | null | undefined): boolean {
  if (!urlOrKey) return false;
  const str = String(urlOrKey).toLowerCase();
  return str.includes('_default_') || str.includes('-default-');
}

/** Extracts all S3 URLs contained in an annotatedImage string/JSON */
export function extractS3Urls(annotatedImage: string | null | undefined): string[] {
  if (!annotatedImage) return [];
  const urls: string[] = [];
  const raw = String(annotatedImage).trim();
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((x) => {
          const u = typeof x === 'object' ? x?.annotated || x?.original : String(x || '');
          if (u && (u.includes('amazonaws.com') || u.includes('buyerapp-image'))) {
            urls.push(u);
          }
        });
      }
    } catch {}
  } else if (raw.includes('amazonaws.com') || raw.includes('buyerapp-image')) {
    urls.push(raw);
  }
  return urls;
}

/** Extracts only user annotation S3 URLs (the default PLM image can never be deleted) */
export function extractAnnotationS3Urls(annotatedImage: string | null | undefined): string[] {
  return extractS3Urls(annotatedImage).filter((url) => !isPlmDefaultImage(url));
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
