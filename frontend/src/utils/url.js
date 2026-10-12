/**
 * URL validation and sanitization helpers for safe redirects.
 */

/**
 * Validates a redirect parameter against open redirect attacks:
 * - Must be a non-empty string with length <= 300
 * - Must start with exactly one leading '/' (no '//')
 * - Must not specify any scheme / protocol (e.g., http:, https:, javascript:)
 * - Must not contain backslashes which some browsers normalize to slashes
 */
export function isValidNextUrl(next) {
  if (typeof next !== 'string') return false;
  const trimmed = next.trim();
  if (trimmed.length === 0 || trimmed.length > 300) return false;

  // Single leading slash, not double
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;

  // No URI scheme / protocol (e.g. javascript:, data:, https:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;

  // No backslashes
  if (trimmed.includes('\\')) return false;

  return true;
}

/**
 * Returns the sanitized `next` URL if valid, or a safe fallback.
 */
export function sanitizeNextUrl(next, fallback = '/dashboard') {
  if (isValidNextUrl(next)) {
    return next.trim();
  }
  return fallback;
}

/**
 * Builds the `next` query parameter from the current location.
 */
export function buildNextParam(pathname = '/', search = '') {
  const fullPath = `${pathname}${search}`;
  return isValidNextUrl(fullPath) ? encodeURIComponent(fullPath) : '';
}
