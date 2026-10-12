import React, { useState } from 'react';
import { AlertCircle, RefreshCw, LogIn } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import Button from './Button.jsx';
import { isValidNextUrl } from '../../utils/url.js';

export default function ErrorState({
  title = 'Something went wrong',
  message,
  error,
  onRetry,
  actionText = 'Retry',
  fullScreen = false,
  icon: CustomIcon,
  className = '',
}) {
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const displayMessage =
    localError ||
    message ||
    (error instanceof Error ? error.message : typeof error === 'string' ? error : '') ||
    'An unexpected error occurred while communicating with the server.';

  const handleRetry = async () => {
    if (!onRetry) return;
    try {
      setRetrying(true);
      setLocalError(null);
      await onRetry();
    } catch (err) {
      const isAuthError =
        err?.status === 401 ||
        err?.code === 'AUTH_REQUIRED' ||
        err?.code === 'UNAUTHORIZED';

      if (isAuthError) {
        const currentPath = `${location.pathname}${location.search}`;
        const nextQuery = isValidNextUrl(currentPath)
          ? `?next=${encodeURIComponent(currentPath)}`
          : '';
        navigate(`/login${nextQuery}`, { replace: true });
        return;
      }

      setLocalError(err.message || 'Retry failed. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  const IconComponent = CustomIcon || AlertCircle;

  const content = (
    <div
      role="alert"
      className={`p-6 rounded-2xl bg-surface border border-rose-500/25 shadow-lg space-y-4 text-center max-w-md w-full transition-colors ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
        <IconComponent className="w-6 h-6" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-text tracking-tight">{title}</h3>
        <p className="text-xs text-text-muted leading-relaxed">{displayMessage}</p>
      </div>

      {onRetry && (
        <div className="pt-2 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            disabled={retrying}
            iconLeft={
              <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
            }
          >
            {retrying ? 'Retrying...' : actionText}
          </Button>
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background text-text flex items-center justify-center p-4 transition-colors">
        {content}
      </div>
    );
  }

  return content;
}
