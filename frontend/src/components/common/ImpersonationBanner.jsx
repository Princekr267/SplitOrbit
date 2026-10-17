import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ShieldAlert, ArrowRightLeft, Loader2, Sparkles } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../../motion/tokens.js';

export default function ImpersonationBanner() {
  const { user, exitImpersonation } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);

  if (!user || !user.isImpersonated) {
    return null;
  }

  const handleExit = async () => {
    if (exiting) return;
    try {
      setExiting(true);
      await exitImpersonation();
      addToast({
        type: 'success',
        title: 'Returned to Admin Session',
        message: 'You have exited account impersonation mode.',
      });
      navigate('/admin');
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to exit impersonation',
        message: err?.message || 'Unable to restore administrator session.',
      });
      setExiting(false);
    }
  };

  return (
    <AnimatePresence>
      <m.aside
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={springs.snappy}
        role="alert"
        aria-live="assertive"
        className="w-full bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-purple-900/90 border-b border-purple-500/30 text-purple-100 px-4 py-2.5 z-50 sticky top-0 backdrop-blur-md shadow-md shadow-purple-950/20"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          {/* Identity & Status */}
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap justify-center sm:justify-start">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-400/20 text-purple-200 border border-purple-400/30 font-bold uppercase tracking-wider text-[10px] shrink-0">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
              Impersonation Mode
            </span>

            <span className="text-purple-200 text-xs">
              Logged in as{' '}
              <strong className="text-white font-semibold">
                {user.name}
              </strong>{' '}
              <span className="font-mono text-purple-300">(@{user.username})</span>
            </span>

            <span className="hidden md:inline-block text-purple-400/70 text-[11px]">
              • Full Host & Account Privileges Enabled
            </span>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExit}
              disabled={exiting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/20 text-white font-semibold text-xs transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-400"
              title="Return to your Administrator account"
            >
              {exiting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-200" />
                  <span>Restoring Admin...</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-3.5 h-3.5 text-purple-200" />
                  <span>Exit Impersonation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </m.aside>
    </AnimatePresence>
  );
}
