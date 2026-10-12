/**
 * Global Application Stability & Telemetry
 * Captures uncaught runtime errors and unhandled promise rejections,
 * logs them cleanly, and emits non-blocking user notifications with reload options.
 */

import { isChunkLoadError, handleChunkError } from './chunkReload.js';

export function setupStabilityListeners() {
  if (typeof window === 'undefined') return;

  // Window error handler
  window.addEventListener('error', (event) => {
    // If it's a script/chunk loading error
    if (isChunkLoadError(event.error || event.message)) {
      handleChunkError(event.error || new Error(event.message));
      return;
    }

    console.error('[SplitOrbit Stability Caught Window Error]:', event.error || event.message);

    // Emit a non-blocking toast with a reload action if it's a critical fatal error
    if (event.error && !event.defaultPrevented) {
      window.dispatchEvent(
        new CustomEvent('splitorbit:toast', {
          detail: {
            message: 'A minor glitch occurred in the interface.',
            type: 'error',
            duration: 6000,
            action: {
              label: 'Reload',
              onClick: () => window.location.reload(),
            },
          },
        })
      );
    }
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;

    if (isChunkLoadError(reason)) {
      handleChunkError(reason);
      return;
    }

    console.error('[SplitOrbit Stability Caught Unhandled Rejection]:', reason);

    // Ignore benign canceled requests
    const isCanceled =
      reason?.name === 'CanceledError' ||
      reason?.message?.includes('canceled') ||
      reason?.code === 'ERR_CANCELED';

    if (!isCanceled && !event.defaultPrevented) {
      window.dispatchEvent(
        new CustomEvent('splitorbit:toast', {
          detail: {
            message: 'Network or processing interruption encountered.',
            type: 'error',
            duration: 6000,
            action: {
              label: 'Reload',
              onClick: () => window.location.reload(),
            },
          },
        })
      );
    }
  });
}
