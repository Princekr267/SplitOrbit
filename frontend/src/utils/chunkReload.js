/**
 * Chunk Reload and Deployment Version Management
 * Handles Vercel deploy cache invalidations, vite:preloadError, and dynamic import failures.
 * Protects against infinite reload loops using a bounded sessionStorage flag.
 */

const CHUNK_RELOAD_FLAG = 'splitorbit_chunk_reload_attempted';

export function isChunkLoadError(error) {
  if (!error) return false;
  const msg = error?.message || String(error);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    error?.name === 'ChunkLoadError'
  );
}

export function handleChunkError(error) {
  if (typeof window === 'undefined') return false;

  console.warn('[SplitOrbit Chunk Handler]: Detected dynamic import/chunk failure:', error);

  const alreadyAttempted = sessionStorage.getItem(CHUNK_RELOAD_FLAG);
  if (!alreadyAttempted) {
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, 'true');
    window.location.reload();
    return true;
  }

  // Reload was already attempted during this session and chunk still failed;
  // Notify listeners to show friendly "A new version is available. Reload" UI without looping
  window.dispatchEvent(
    new CustomEvent('splitorbit:chunk-error', {
      detail: { error, message: 'A new version of SplitOrbit is available.' },
    })
  );
  return false;
}

export function setupChunkReloadHandler() {
  if (typeof window === 'undefined') return;

  // Clear reload attempt flag once page runs stably for 10 seconds
  const timer = setTimeout(() => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    } catch {}
  }, 10000);

  // Vite specific event fired when dynamic import fails
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    handleChunkError(event?.payload || new Error('vite:preloadError'));
  });

  // Global unhandledrejection listener for failed dynamic imports
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event?.reason)) {
      event.preventDefault();
      handleChunkError(event.reason);
    }
  });

  return () => {
    clearTimeout(timer);
  };
}
