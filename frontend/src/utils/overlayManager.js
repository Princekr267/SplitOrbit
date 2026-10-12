/**
 * Overlay & Scroll Lock Manager
 * Ensures that modals, bottom sheets, drawers, and calculator panels
 * clean up perfectly on close and on route navigation.
 * Prevents leftover scroll locks, stuck pointer-events, or orphaned backdrops.
 */

let activeLockCount = 0;
let originalOverflow = '';

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;

  if (activeLockCount === 0) {
    originalOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-modal-open', 'true');
  }
  activeLockCount++;
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;

  activeLockCount = Math.max(0, activeLockCount - 1);
  if (activeLockCount === 0) {
    document.body.style.overflow = originalOverflow || '';
    document.body.removeAttribute('data-modal-open');
    document.body.removeAttribute('data-inert');
  }
}

/**
 * Force resets any active scroll locks, modal state attributes, and inert layers.
 * Must be called on route changes to ensure no navigation is blocked by an orphaned overlay.
 */
export function forceResetAllOverlays() {
  if (typeof document === 'undefined') return;

  activeLockCount = 0;
  document.body.style.overflow = '';
  document.body.removeAttribute('data-modal-open');
  document.body.removeAttribute('data-inert');

  // Also close any open calculator instance
  window.dispatchEvent(new CustomEvent('splitorbit:close-calculator'));
}

export function getActiveOverlayCount() {
  return activeLockCount;
}
