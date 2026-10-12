import React from 'react';
import { AlertCircle, RefreshCw, Home, Sparkles } from 'lucide-react';
import { isChunkLoadError } from '../../utils/chunkReload.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('ErrorBoundary caught rendering error:', error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error, this.handleRetry)
          : this.props.fallback;
      }

      const isChunkError = isChunkLoadError(this.state.error);

      if (isChunkError) {
        return (
          <div className="p-8 max-w-md mx-auto my-12 rounded-2xl bg-surface border border-brand-500/30 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-text tracking-tight">
                New App Version Available
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                SplitOrbit has been updated. Please reload the page to load the newest version.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="p-6 max-w-lg mx-auto rounded-2xl bg-surface border border-border text-center space-y-4 my-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-text tracking-tight">
              {this.props.title || 'Something went wrong rendering this section'}
            </h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              {this.props.message ||
                this.state.error?.message ||
                'An unexpected error occurred while displaying this content.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-surface-elevated text-text border border-border transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-surface-elevated text-text border border-border transition cursor-pointer"
            >
              <span>Reload Page</span>
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Go Home</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
