import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import api from '../api/client.js';
import {
  Split,
  KeyRound,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
} from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { Card } from '../components/common/Card.jsx';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../motion/tokens.js';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState('');
  const [tokenValidation, setTokenValidation] = useState({
    status: 'idle', // 'idle' | 'checking' | 'valid' | 'invalid'
    data: null,
    error: '',
  });

  const [mode, setMode] = useState('link'); // 'link' | 'code'
  const [username, setUsername] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const { addToast } = useToast();
  const navigate = useNavigate();

  // Handle URL token
  useEffect(() => {
    const rawToken = searchParams.get('token');
    if (rawToken) {
      setToken(rawToken);
      setMode('link');

      // Strip token from browser address bar immediately
      window.history.replaceState({}, '', '/reset-password');

      // Validate token
      async function validate() {
        setTokenValidation({ status: 'checking', data: null, error: '' });
        try {
          const res = await api.get(`/auth/validate-reset-token?token=${encodeURIComponent(rawToken)}`);
          if (res.data?.valid) {
            setTokenValidation({ status: 'valid', data: res.data, error: '' });
          } else {
            setTokenValidation({
              status: 'invalid',
              data: null,
              error: res.data?.reason || 'This reset link has expired or has already been used.',
            });
          }
        } catch (err) {
          setTokenValidation({
            status: 'invalid',
            data: null,
            error: err.message || 'Invalid or expired reset link.',
          });
        }
      }
      validate();
    } else {
      setMode('code');
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (newPassword.length < 8) {
      setFormError('New password must be at least 8 characters.');
      return;
    }
    const encoder = new TextEncoder();
    if (encoder.encode(newPassword).length > 72) {
      setFormError('New password cannot exceed 72 bytes.');
      return;
    }
    const targetUsername = mode === 'link' ? tokenValidation.data?.username : username.trim().toLowerCase();
    if (targetUsername && newPassword.toLowerCase() === targetUsername.toLowerCase()) {
      setFormError('Password cannot be your username.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const payload = { newPassword };
      if (mode === 'link') {
        payload.token = token;
      } else {
        payload.username = username.trim().toLowerCase();
        payload.resetCode = resetCode.trim();
      }

      await api.post('/auth/reset-password', payload);
      addToast('Password successfully reset! Please sign in with your new password.', 'success');
      navigate('/login');
    } catch (err) {
      const msg = err.message || 'Failed to reset password.';
      setFormError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-slate-950 shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
            <Split className="w-6 h-6 font-bold" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-text">SplitOrbit</span>
        </Link>
        <h2 className="text-xl font-bold text-text">Set New Password</h2>
        <p className="mt-1 text-xs text-text-muted">
          Remembered your password?{' '}
          <Link to="/login" className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="space-y-5 animate-scale-in">
          {/* Mode Switch tabs (if not currently loaded with a valid token) */}
          {tokenValidation.status !== 'valid' && (
            <div className="flex rounded-lg bg-surface-muted p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('code')}
                className={`flex-1 py-1.5 rounded-md transition ${
                  mode === 'code' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                }`}
              >
                Admin Reset Code
              </button>
              <button
                type="button"
                onClick={() => setMode('link')}
                className={`flex-1 py-1.5 rounded-md transition ${
                  mode === 'link' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                }`}
              >
                Reset Link Token
              </button>
            </div>
          )}

          {/* Token Validating State */}
          {mode === 'link' && tokenValidation.status === 'checking' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto" />
              <p className="text-xs text-text-muted">Verifying your reset link securely...</p>
            </div>
          )}

          {/* Token Invalid / Expired State */}
          {mode === 'link' && tokenValidation.status === 'invalid' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-200 text-xs flex gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <div>
                  <p className="font-bold text-sm text-rose-900 dark:text-rose-100 mb-1">
                    Invalid or Expired Link
                  </p>
                  <p>{tokenValidation.error}</p>
                </div>
              </div>
              <div className="text-center pt-2">
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Return to recovery options
                </Link>
              </div>
            </div>
          )}

          {/* Valid Token Notice */}
          {mode === 'link' && tokenValidation.status === 'valid' && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Resetting password for account:{' '}
                <strong className="text-emerald-950 dark:text-emerald-100">
                  {tokenValidation.data.username}
                </strong>
              </span>
            </div>
          )}

          {/* Form error */}
          <AnimatePresence>
            {formError && (
              <m.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </m.div>
            )}
          </AnimatePresence>

          {/* Form render conditions */}
          {(mode === 'code' || (mode === 'link' && tokenValidation.status === 'valid')) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'code' && (
                <>
                  <Input
                    label="Username"
                    type="text"
                    required
                    placeholder="e.g. karan"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  />

                  <Input
                    label="Admin Reset Code"
                    type="text"
                    maxLength={9}
                    required
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    placeholder="e.g. K9MN-24PX"
                    value={resetCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                      setResetCode(val);
                    }}
                    hint="Single-use code issued by platform administrator (e.g. K9MN-24PX)"
                  />
                </>
              )}

              <div>
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 8 characters (max 72 bytes)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="p-1 hover:text-text transition focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </div>

              <Input
                label="Confirm New Password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                iconRight={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Save New Password
              </Button>
            </form>
          )}

          {mode === 'link' && tokenValidation.status === 'idle' && (
            <div className="space-y-4">
              <Input
                label="Reset Token"
                type="text"
                placeholder="Paste reset token here"
                value={token}
                onChange={(e) => setToken(e.target.value.trim())}
              />
              <Button
                type="button"
                variant="outline"
                fullWidth
                disabled={!token}
                onClick={async () => {
                  setTokenValidation({ status: 'checking', data: null, error: '' });
                  try {
                    const res = await api.get(`/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
                    if (res.data?.valid) {
                      setTokenValidation({ status: 'valid', data: res.data, error: '' });
                    } else {
                      setTokenValidation({
                        status: 'invalid',
                        data: null,
                        error: res.data?.reason || 'Invalid reset token',
                      });
                    }
                  } catch (err) {
                    setTokenValidation({ status: 'invalid', data: null, error: err.message });
                  }
                }}
              >
                Verify Token
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
