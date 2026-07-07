/**
 * Checks if the stored token is expired based on expires_in and retrieved_at.
 */
export function isTokenExpired(storedTokenStr: string | null): boolean {
  if (!storedTokenStr) return true;
  try {
    const parsed = JSON.parse(storedTokenStr);
    if (parsed && typeof parsed === 'object' && parsed.retrieved_at && parsed.expires_in) {
      const elapsedSeconds = (Date.now() - parsed.retrieved_at) / 1000;
      // Add a 10 seconds buffer to be safe before exact expiry
      return elapsedSeconds >= parsed.expires_in - 10;
    }
  } catch {
    // If parsing fails, treat it as not expired to let standard API requests try and fail if needed
  }
  return false;
}

/**
 * Encapsulates reading and parsing the accessToken from localStorage.
 */
export function getStoredToken(): string | null {
  const stored = localStorage.getItem('accessToken');
  if (!stored) return null;
  if (isTokenExpired(stored)) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('session');
    return null;
  }
  try {
    const parsed = JSON.parse(stored);
    return parsed?.access_token || parsed;
  } catch {
    return stored;
  }
}
