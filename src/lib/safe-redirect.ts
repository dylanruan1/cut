/**
 * Safe internal redirects — never allow open redirects.
 */
export function sanitizeInternalRedirect(
  preferred: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!preferred) return fallback;
  const trimmed = preferred.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.startsWith("/\\")) return fallback;
  if (/[\x00-\x1f]/.test(trimmed)) return fallback;
  if (trimmed.startsWith("/login") || trimmed.startsWith("/signup")) {
    return fallback;
  }
  return trimmed;
}
