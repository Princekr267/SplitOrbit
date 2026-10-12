import React from 'react';
import { Split } from 'lucide-react';

export default function BrandedAuthSkeleton({ message = 'Securing your session...' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen w-full bg-background text-text flex flex-col items-center justify-center p-6 relative transition-colors select-none"
    >
      <div className="flex flex-col items-center max-w-sm w-full text-center space-y-6">
        {/* Animated Brand Emblem */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-brand-500/25 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-slate-950 shadow-xl shadow-brand-500/30">
            <Split className="w-8 h-8 font-bold" />
          </div>
        </div>

        {/* Brand Title & Status Message */}
        <div className="space-y-2">
          <span className="font-extrabold text-2xl tracking-tight text-text block">
            SplitOrbit
          </span>
          <p className="text-xs font-semibold text-text-muted">
            {message}
          </p>
        </div>

        {/* High-Visibility Premium Loading Shimmer Bar */}
        <div className="w-48 h-1.5 rounded-full bg-surface-muted overflow-hidden relative border border-border">
          <div className="absolute inset-y-0 left-0 w-24 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 animate-shimmer" />
        </div>

        <span className="sr-only">Loading user session, please wait...</span>
      </div>
    </div>
  );
}
