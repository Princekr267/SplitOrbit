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
        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full bg-slate-900/95 text-white dark:bg-white/95 dark:text-slate-950 border border-slate-700/60 dark:border-slate-200/60 shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-semibold pointer-events-none"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>Waking up the server… (cold start)</span>
        </m.div>
      )}
    </AnimatePresence>
  );
}
