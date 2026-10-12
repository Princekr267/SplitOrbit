import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { springs, durations, easings } from '../../motion/tokens.js';
import { lockBodyScroll, unlockBodyScroll } from '../../utils/overlayManager.js';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      lockBodyScroll();
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (isOpen) {
        unlockBodyScroll();
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: easings.easeOut }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-md transition-colors"
        >
          <m.div
            key="modal-dialog"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.94,
              y: 12,
              transition: { duration: 0.16, ease: easings.easeIn },
            }}
            transition={{
              type: 'spring',
              damping: 26,
              stiffness: 340,
              mass: 0.9,
            }}
            style={{ borderRadius: 16 }}
            className={`w-full ${maxWidth} bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-slate-950/25 dark:shadow-slate-950/70 overflow-hidden flex flex-col max-h-[90vh] text-text transition-colors ring-1 ring-border/50`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Pull Handle */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-surface shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface shrink-0">
              <h3 className="text-base font-bold text-text tracking-tight">{title}</h3>
              <m.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={springs.snappy}
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </m.button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto">{children}</div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
