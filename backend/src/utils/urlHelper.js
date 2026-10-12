import env from '../config/env.js';

/**
 * Returns the sanitized, trailing-slash-stripped FRONTEND_URL.
 */
export function getCleanFrontendUrl() {
  const url = (env.FRONTEND_URL || 'http://localhost:5173').trim();
  return url.replace(/\/+$/, '');
}

/**
 * Builds a Level 1 read-only public statement link (/s/:token).
 */
export function buildShareUrl(rawToken) {
  return `${getCleanFrontendUrl()}/s/${rawToken}`;
}

/**
 * Builds a Level 2 single-use member claim invite link (/invite/:code).
 */
export function buildInviteUrl(rawCode) {
  return `${getCleanFrontendUrl()}/invite/${rawCode}`;
}

/**
 * Builds an admin-issued password reset link (/reset-password?token=...).
 */
export function buildResetUrl(rawToken) {
  return `${getCleanFrontendUrl()}/reset-password?token=${rawToken}`;
}
