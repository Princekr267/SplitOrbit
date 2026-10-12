import React from 'react';
import { handleChunkError } from './chunkReload.js';

/**
 * Resilient lazy loader for routes and heavy components.
 * Catches dynamic import failures (e.g., outdated Vercel chunk hashes after a deploy)
 * and safely delegates to handleChunkError to trigger an automatic one-time reload.
 */
export function safeLazy(importer) {
  return React.lazy(() =>
    importer().catch((error) => {
      handleChunkError(error);
      throw error;
    })
  );
}
