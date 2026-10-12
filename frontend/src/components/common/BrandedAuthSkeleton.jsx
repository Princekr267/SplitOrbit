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
          <div className="absolute inset-0 rounded-2xl bg-brand-500/20 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-slate-950 shadow-xl shadow-brand-500/25">
            <Split className="w-8 h-8 font-bold animate-pulse" />
          </div>
        </div>

        {/* Brand Title & Status */}
        <div className="space-y-1">
          <span className="font-extrabold text-2xl tracking-tight text-text">
            SplitOrbit
          </span>
          <p className="text-xs text-text-muted font-medium animate-pulse">
            {message}
          </p>
        </div>

        {/* Shimmer Placeholder Content */}
        <div className="w-full space-y-3 pt-2">
          <div className="h-10 w-full rounded-xl bg-surface-muted/60 animate-pulse border border-border/50" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 w-full rounded-xl bg-surface-muted/40 animate-pulse border border-border/40" />
            <div className="h-10 w-full rounded-xl bg-surface-muted/40 animate-pulse border border-border/40" />
          </div>
        </div>

        <span className="sr-only">Loading user session, please wait...</span>
      </div>
    </div>
  );
}
