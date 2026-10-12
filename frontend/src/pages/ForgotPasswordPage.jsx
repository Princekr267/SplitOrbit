import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import api from '../api/client.js';
import { isValidNextUrl } from '../utils/url.js';
import {
  Split,
  KeyRound,
  Users,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { Card } from '../components/common/Card.jsx';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../motion/tokens.js';

export default function ForgotPasswordPage() {
  const [activeTab, setActiveTab] = useState('hub'); // 'hub' | 'code' | 'request'
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next') || searchParams.get('returnUrl');
  const validNext = isValidNextUrl(rawNext) ? rawNext : null;

  // Recovery Code Form State
  const [codeUsername, setCodeUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Request Admin Reset Form State
  const [reqUsername, setReqUsername] = useState('');
  const [reqContact, setReqContact] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);
  const [reqError, setReqError] = useState('');

  const handleRecoveryCodeSubmit = async (e) => {
    e.preventDefault();
    setCodeError('');

    if (newPassword.length < 8) {
      setCodeError('New password must be at least 8 characters.');
      return;
    }
    const encoder = new TextEncoder();
    if (encoder.encode(newPassword).length > 72) {
      setCodeError('New password cannot exceed 72 bytes.');
      return;
    }
    if (newPassword.toLowerCase() === codeUsername.trim().toLowerCase()) {
      setCodeError('Password cannot be your username.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setCodeError('Passwords do not match.');
      return;
    }

    try {
      setCodeLoading(true);
      await api.post('/auth/recover-with-code', {
        username: codeUsername.trim().toLowerCase(),
        recoveryCode: recoveryCode.trim().toUpperCase(),
        newPassword,
      });

      addToast('Password successfully reset with recovery code! Please sign in.', 'success');
      navigate('/login');
    } catch (err) {
      const msg = err.message || 'Failed to reset password. Please check your recovery code.';
      setCodeError(msg);
      addToast(msg, 'error');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleAdminRequestSubmit = async (e) => {
    e.preventDefault();
    setReqError('');

    if (!reqUsername) return;

    try {
      setReqLoading(true);
      await api.post('/auth/request-reset', {
        username: reqUsername.trim().toLowerCase(),
        contactChannel: reqContact.trim() || undefined,
        userNote: reqNote.trim() || undefined,
      });
      setReqSuccess(true);
      addToast('Password reset request submitted to admin.', 'success');
    } catch (err) {
      const msg = err.message || 'Failed to submit reset request.';
      setReqError(msg);
      addToast(msg, 'error');
    } finally {
      setReqLoading(false);
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
        <h2 className="text-xl font-bold text-text">Account Recovery</h2>
        <p className="mt-1 text-xs text-text-muted">
          Remember your password?{' '}
          <Link
            to={
              validNext
                ? `/login?next=${encodeURIComponent(validNext)}`
                : '/login'
            }
            className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
          >
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
        {activeTab === 'hub' && (
          <div className="space-y-4">
            <Card className="space-y-4 animate-scale-in">
              <div className="border-b border-border pb-3">
                <h3 className="text-sm font-semibold text-text">Choose a Recovery Option</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  SplitOrbit accounts do not use email passwords. Pick the fastest option for you:
                </p>
              </div>

              {/* Option A */}
              <div
                onClick={() => setActiveTab('code')}
                className="p-3.5 rounded-xl border border-border hover:border-brand-500/50 bg-surface hover:bg-surface-muted/60 transition cursor-pointer flex items-start gap-3 group"
              >
                <div className="p-2 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0 group-hover:scale-105 transition-transform">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text">Option A (Self-Serve)</span>
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Instant
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-text mt-0.5">Use a Recovery Code</p>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Enter one of the 8 recovery codes saved during account registration.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-brand-500 group-hover:translate-x-0.5 transition shrink-0 self-center" />
              </div>

              {/* Option B: Admin Reset Request */}
              <div
                onClick={() => setActiveTab('request')}
                className="p-3.5 rounded-xl border border-border hover:border-amber-500/50 bg-surface hover:bg-surface-muted/60 transition cursor-pointer flex items-start gap-3 group"
              >
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text">Option B (Admin Assisted)</span>
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      Verified
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-text mt-0.5">Request an Admin Reset</p>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Lost all recovery codes? Submit an identity verification ticket to the platform administrator to issue a single-use reset credential.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-amber-500 group-hover:translate-x-0.5 transition shrink-0 self-center" />
              </div>
            </Card>

            <div className="text-center pt-2">
              <Link
                to="/reset-password"
                className="text-xs text-text-muted hover:text-text underline font-medium"
              >
                Already have an admin reset link or 8-character reset code? Click here to set your new password
              </Link>
            </div>
          </div>
        )}

        {/* Option A Subview: Recovery Code */}
        {activeTab === 'code' && (
          <Card className="space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text">Reset with Recovery Code</h3>
                <p className="text-xs text-text-muted">Enter one of your 8-character recovery codes</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('hub')}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                Back to options
              </button>
            </div>

            <AnimatePresence>
              {codeError && (
                <m.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{codeError}</span>
                </m.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleRecoveryCodeSubmit} className="space-y-4">
              <Input
                label="Username"
                type="text"
                required
                placeholder="e.g. vikram"
                value={codeUsername}
                onChange={(e) => setCodeUsername(e.target.value.toLowerCase())}
              />

              <Input
                label="Recovery Code (XXXX-XXXX)"
                type="text"
                required
                placeholder="ABCD-EFGH"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                hint="Case-insensitive, letters & numbers (hyphen optional)"
              />

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
                loading={codeLoading}
                iconRight={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Reset Password & Continue
              </Button>
            </form>
          </Card>
        )}

        {/* Option C Subview: Admin Request */}
        {activeTab === 'request' && (
          <Card className="space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text">Request Admin Reset</h3>
                <p className="text-xs text-text-muted">Contact the platform administrator for assistance</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('hub')}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                Back to options
              </button>
            </div>

            {reqSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-xs space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="font-bold text-sm text-emerald-900 dark:text-emerald-100">
                    Request Submitted Successfully
                  </p>
                </div>
                <p>
                  Your password reset request has been recorded. The platform administrator will review
                  it and reach out via your contact channel or provide a reset code.
                </p>
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => navigate('/login')}
                  >
                    Return to Sign In
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAdminRequestSubmit} className="space-y-4">
                <AnimatePresence>
                  {reqError && (
                    <m.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2"
                      role="alert"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{reqError}</span>
                    </m.div>
                  )}
                </AnimatePresence>

                <Input
                  label="Username"
                  type="text"
                  required
                  placeholder="e.g. vikram"
                  value={reqUsername}
                  onChange={(e) => setReqUsername(e.target.value.toLowerCase())}
                  hint="Your registered SplitOrbit username"
                />

                <Input
                  label="Contact Information (optional)"
                  type="text"
                  placeholder="e.g. Phone number or email to reach you"
                  value={reqContact}
                  onChange={(e) => setReqContact(e.target.value)}
                  hint="Where the administrator can verify or send your reset code"
                />

                <div>
                  <label className="text-xs font-semibold text-text mb-1 block">
                    Note / Context (optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Lost recovery codes, member of Manali Road Trip group"
                    value={reqNote}
                    onChange={(e) => setReqNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={reqLoading}
                  iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Submit Reset Request
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
