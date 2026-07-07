/**
 * Extracts a user-friendly error message from Axios errors, standard Error objects, or unknown errors.
 */
export function getErrorMessage(err: unknown, defaultMessage = 'Something went wrong'): string {
  if (!err) return defaultMessage;
  const errorObj = err as any;
  return errorObj?.response?.data?.message || errorObj?.message || defaultMessage;
}
