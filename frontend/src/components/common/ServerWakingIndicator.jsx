import React, { useState, useEffect } from 'react';
import { onServerWakingChange } from '../../api/client.js';
import { Loader2 } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';

/**
 * Cold-Start Notice
 * Automatically appears when any API request is in-flight for > 4 seconds.
 * Reassures users on free/sleeping hosts that the system is spinning up,
 * rather than hanging or broken.
 */
export default function ServerWakingIndicator() {
  const [isWaking, setIsWaking] = useState(false);

  useEffect(() => {
    return onServerWakingChange(setIsWaking);
  }, []);

  return (
    <AnimatePresence>
      {isWaking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4">
          <m.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="px-5 py-3 rounded-2xl bg-slate-900/95 text-white dark:bg-white/95 dark:text-slate-950 border border-slate-700/60 dark:border-slate-200/60 shadow-2xl backdrop-blur-md flex items-center gap-3 text-sm font-semibold pointer-events-auto"
          >
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>Waking up the server… (cold start)</span>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
