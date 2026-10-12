import axios from 'axios';
import { isValidNextUrl } from '../utils/url.js';

const rawEnvUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
  '/api';
const rawBaseURL = String(rawEnvUrl).trim();
const cleanBaseURL = rawBaseURL.replace(/\/+$/, '');
const baseURL = cleanBaseURL.endsWith('/api') ? cleanBaseURL : `${cleanBaseURL}/api`;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000, // 15s bounded timeout to prevent eternal spinners
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Cold-start detector:
 * If an in-flight API request takes > 4s (backend cold start),
 * notifies listeners so the UI can show "Waking up the server…".
 */
let activeRequests = 0;
let serverWakingTimer = null;
let serverIsWaking = false;
const serverWakingListeners = new Set();

function updateServerWaking(isWaking) {
  if (serverIsWaking !== isWaking) {
    serverIsWaking = isWaking;
    serverWakingListeners.forEach((cb) => {
      try {
        cb(isWaking);
      } catch (e) {
        console.error('Error in server waking listener:', e);
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('splitorbit:server-waking', { detail: { isWaking } })
      );
    }
  }
}

export function onServerWakingChange(callback) {
  serverWakingListeners.add(callback);
  // Initial callback with current state
  try {
    callback(serverIsWaking);
  } catch {}
  return () => serverWakingListeners.delete(callback);
}

export function isServerWaking() {
  return serverIsWaking;
}

api.interceptors.request.use((config) => {
  activeRequests++;
  if (activeRequests === 1 && !serverWakingTimer) {
    serverWakingTimer = setTimeout(() => {
      if (activeRequests > 0) {
        updateServerWaking(true);
      }
    }, 4000);
  }
  return config;
});

function handleRequestFinished() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    if (serverWakingTimer) {
      clearTimeout(serverWakingTimer);
      serverWakingTimer = null;
    }
    updateServerWaking(false);
  }
}

/**
 * Registry of auth state listeners notified when a 401 is received from a protected endpoint.
 */
const unauthorizedListeners = new Set();
let isRedirecting401 = false;
let redirectDebounceTimer = null;

export function onUnauthorized(callback) {
  unauthorizedListeners.add(callback);
  return () => unauthorizedListeners.delete(callback);
}

export function notifyUnauthorized() {
  unauthorizedListeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.error('Error in unauthorized listener:', e);
    }
  });
}

/**
 * Checks if a requested URL represents a protected endpoint (requires auth).
 * Public routes (share links, invite preview, auth endpoints, health, public settings) are exempt from 401 redirect loops.
 */
export function isProtectedEndpoint(url) {
  if (!url) return false;

  let path = url;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      path = new URL(url).pathname;
    }
  } catch {
    // fallback to original string
  }

  // Strip query parameters and base '/api' prefix
  const cleanPath = path.split('?')[0].replace(/^\/api(?=\/|$)/, '') || '/';

  const publicPrefixes = [
    '/s/',
    '/s',
    '/invites/',
    '/invite/',
    '/auth/login',
    '/auth/register',
    '/auth/me',
    '/auth/recover',
    '/auth/recover-with-code',
    '/auth/request-reset',
    '/auth/reset-requests',
    '/auth/reset-password',
    '/auth/validate-reset-token',
    '/auth/check-username',
    '/auth/username-available',
    '/settings/public',
    '/health',
  ];

  return !publicPrefixes.some((prefix) => cleanPath === prefix || cleanPath.startsWith(prefix));
}

api.interceptors.response.use(
  (response) => {
    handleRequestFinished();
    return response.data;
  },
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const isCanceled =
      axios.isCancel(error) ||
      error.name === 'CanceledError' ||
      error.code === 'ERR_CANCELED';

    // Check if eligible for idempotent GET bounded retry
    const method = String(config?.method || 'get').toLowerCase();
    const isGet = method === 'get';
    const isNetworkOr5xx = !error.response || (status >= 500 && status <= 599);
    const retryCount = config?.__retryCount || 0;
    const maxRetries = 2;

    if (config && isGet && isNetworkOr5xx && !isCanceled && retryCount < maxRetries) {
      config.__retryCount = retryCount + 1;
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      // Re-issue request through api instance
      return api(config);
    }

    handleRequestFinished();

    const message =
      error.response?.data?.error?.message ||
      error.message ||
      'An unexpected error occurred';
    const code = error.response?.data?.error?.code || 'UNKNOWN_ERROR';
    const details = error.response?.data?.error?.details || null;

    const customError = new Error(message);
    customError.status = status;
    customError.code = code;
    customError.details = details;

    // Handle 401 Unauthorized from protected endpoints
    if (status === 401) {
      const requestedUrl = error.config?.url;
      const isProtected = isProtectedEndpoint(requestedUrl);

      if (isProtected) {
        notifyUnauthorized();

        if (typeof window !== 'undefined' && !isRedirecting401) {
          const currentPath = window.location.pathname + window.location.search;
          const isOnLoginPage = window.location.pathname === '/login';

          if (!isOnLoginPage) {
            isRedirecting401 = true;
            clearTimeout(redirectDebounceTimer);

            const nextParam = isValidNextUrl(currentPath)
              ? `?next=${encodeURIComponent(currentPath)}`
              : '';

            window.location.replace(`/login${nextParam}`);

            redirectDebounceTimer = setTimeout(() => {
              isRedirecting401 = false;
            }, 3000);
          }
        }
      }
    }

    return Promise.reject(customError);
  }
);

export default api;
