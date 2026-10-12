import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../api/client.js';
import {
  Split,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Printer,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { Card } from '../components/common/Card.jsx';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../motion/tokens.js';

import { isValidNextUrl } from '../utils/url.js';

function getPasswordStrength(password, username) {
  if (!password) return { score: 0, label: 'Too short', color: 'bg-slate-300 dark:bg-slate-700' };

  const encoder = new TextEncoder();
  const bytes = encoder.encode(password).length;

  if (bytes > 72) {
    return { score: 0, label: 'Exceeds 72 bytes limit', color: 'bg-rose-500' };
  }
  if (password.length < 8) {
    return { score: 1, label: 'Too short (min 8 chars)', color: 'bg-rose-500' };
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return { score: 1, label: 'Cannot match username', color: 'bg-rose-500' };
  }

  let score = 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
  if (score === 3) return { score: 3, label: 'Good', color: 'bg-blue-500' };
  if (score >= 4) return { score: 4, label: 'Strong', color: 'bg-emerald-500' };

  return { score: 1, label: 'Weak', color: 'bg-rose-500' };
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Username validation & availability
  const [usernameStatus, setUsernameStatus] = useState({ state: 'idle', message: '' });
  const checkDebounceRef = useRef(null);

  // Recovery codes post-registration state
  const [registeredRecoveryCodes, setRegisteredRecoveryCodes] = useState(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next') || searchParams.get('returnUrl');
  const validNext = isValidNextUrl(rawNext) ? rawNext : '/dashboard';
  let initialInvite = searchParams.get('invite') || searchParams.get('code') || '';
  if (!initialInvite && rawNext && rawNext.includes('/invite/')) {
    const match = rawNext.match(/\/invite\/([^/?#]+)/i);
    if (match && match[1]) {
      initialInvite = match[1];
    }
  }

  const [allowRegistration, setAllowRegistration] = useState(true);
  const [inviteCode, setInviteCode] = useState(initialInvite);
  const [invitePreview, setInvitePreview] = useState(null);
  const [claimedGroupInfo, setClaimedGroupInfo] = useState(null);

  const { register } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Check public settings for allowRegistration
  useEffect(() => {
    async function checkPublicSettings() {
      try {
        const res = await api.get('/settings/public');
        if (res.success && res.data && res.data.allowRegistration !== undefined) {
          setAllowRegistration(res.data.allowRegistration);
        }
      } catch {
        // Silently fallback to true
      }
    }
    checkPublicSettings();
  }, []);

  // Fetch invite preview if inviteCode is present
  useEffect(() => {
    async function checkInvitePreview() {
      if (!inviteCode || !inviteCode.trim()) {
        setInvitePreview(null);
        return;
      }
      try {
        const res = await api.get(`/invites/${encodeURIComponent(inviteCode.trim())}/preview`);
        if (res.data?.valid) {
          setInvitePreview(res.data);
        } else {
          setInvitePreview(null);
        }
      } catch {
        setInvitePreview(null);
      }
    }
    checkInvitePreview();
  }, [inviteCode]);

  // Debounced username check
  useEffect(() => {
    if (checkDebounceRef.current) {
      clearTimeout(checkDebounceRef.current);
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setUsernameStatus({ state: 'idle', message: '' });
      return;
    }

    if (!/^[a-z][a-z0-9_]{2,19}$/.test(cleanUsername)) {
      setUsernameStatus({
        state: 'invalid',
        message: 'Must be 3-20 characters: letters, digits, or underscore, starting with a letter',
      });
      return;
    }

    setUsernameStatus({ state: 'checking', message: 'Checking availability...' });

    checkDebounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username?u=${encodeURIComponent(cleanUsername)}`);
        if (res.data?.available) {
          setUsernameStatus({ state: 'available', message: 'Username is available' });
        } else {
          setUsernameStatus({ state: 'taken', message: res.data?.reason || 'Username is already taken' });
        }
      } catch (err) {
        setUsernameStatus({ state: 'idle', message: '' });
      }
    }, 300);

    return () => {
      if (checkDebounceRef.current) clearTimeout(checkDebounceRef.current);
    };
  }, [username]);

  const passwordStrength = getPasswordStrength(password, username);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanUsername = username.trim().toLowerCase();
    if (!name || !cleanUsername || !password) return;

    if (!/^[a-z][a-z0-9_]{2,19}$/.test(cleanUsername)) {
      setErrorMessage('Username format is invalid.');
      return;
    }

    if (usernameStatus.state === 'taken') {
      setErrorMessage('Please choose an available username.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    const encoder = new TextEncoder();
    if (encoder.encode(password).length > 72) {
      setErrorMessage('Password cannot exceed 72 bytes.');
      return;
    }

    if (password.toLowerCase() === cleanUsername) {
      setErrorMessage('Password cannot be your username.');
      return;
    }

    try {
      setLoading(true);
      const result = await register({
        name,
        username: cleanUsername,
        password,
        email: email || undefined,
        phone: phone || undefined,
        inviteCode: inviteCode || undefined,
      });

      if (result.claimed) {
        setClaimedGroupInfo(result.claimed);
      }

      if (result.recoveryCodes && result.recoveryCodes.length > 0) {
        setRegisteredRecoveryCodes(result.recoveryCodes);
      } else {
        // User without codes
        addToast('Account created successfully! Welcome to SplitOrbit 🎉', 'success');
        if (result.claimed?.groupId) {
          navigate(`/friend?groupId=${result.claimed.groupId}&personId=${result.claimed.personId || ''}`, { replace: true });
        } else {
          navigate(validNext, { replace: true });
        }
      }
    } catch (err) {
      const msg = err.message || 'Registration failed';
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCodes = () => {
    if (!registeredRecoveryCodes) return;
    const text = registeredRecoveryCodes.join('\n');
    navigator.clipboard.writeText(text);
    addToast('All 8 recovery codes copied to clipboard!', 'success');
  };

  const handleDownloadCodes = () => {
    if (!registeredRecoveryCodes) return;
    const content = `SplitOrbit Account Recovery Codes\nUsername: ${username.trim().toLowerCase()}\nDate: ${new Date().toISOString()}\n\nKeep these codes safe and private:\n\n${registeredRecoveryCodes.map((code, idx) => `${idx + 1}. ${code}`).join('\n')}\n\nEach code can be used exactly once to recover your account if you forget your password.`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `splitorbit-recovery-codes-${username.trim().toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('Recovery codes downloaded!', 'success');
  };

  const handlePrintCodes = () => {
    window.print();
  };

  const handleFinishRegistration = () => {
    if (!confirmedSaved) return;
    // Clear codes from memory
    setRegisteredRecoveryCodes(null);
    addToast('Account setup complete! Welcome to SplitOrbit 🎉', 'success');
    if (claimedGroupInfo?.groupId) {
      navigate(`/friend?groupId=${claimedGroupInfo.groupId}&personId=${claimedGroupInfo.personId || ''}`, { replace: true });
    } else {
      navigate(validNext, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background text-text flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors">
      {/* Top right Theme Toggle */}
      <div className="absolute top-4 right-4 z-20 print:hidden">
        <ThemeToggle />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center print:hidden">
        <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-slate-950 shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
            <Split className="w-6 h-6 font-bold" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-text">SplitOrbit</span>
        </Link>
        <h2 className="text-xl font-bold text-text">
          {registeredRecoveryCodes ? 'Save Your Recovery Codes' : 'Create your account'}
        </h2>
        {!registeredRecoveryCodes && (
          <p className="mt-1 text-xs text-text-muted">
            Already have an account?{' '}
            <Link
              to={
                validNext && validNext !== '/dashboard'
                  ? `/login?next=${encodeURIComponent(validNext)}`
                  : '/login'
              }
              className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
            >
              Sign in
            </Link>
          </p>
        )}
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        {registeredRecoveryCodes ? (
          /* STEP 2: Post-Registration Recovery Codes Screen */
          <Card className="space-y-6 animate-scale-in">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs flex gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-amber-900 dark:text-amber-100 mb-1">
                  Save these now
                </p>
                <p>
                  SplitOrbit never shows them again and no one can recover your account without them.
                  Each code can be used once to regain access if you lose your password.
                </p>
              </div>
            </div>

            {/* 2x4 Grid of Recovery Codes */}
            <div className="grid grid-cols-2 gap-2.5 p-4 rounded-xl bg-surface-muted/50 border border-border">
              {registeredRecoveryCodes.map((code, index) => (
                <div
                  key={index}
                  className="px-3 py-2 bg-surface rounded-lg border border-border/80 text-center font-mono text-xs sm:text-sm font-semibold tracking-wider text-text select-all"
                >
                  {code}
                </div>
              ))}
            </div>

            {/* Action Buttons: Copy, Download, Print */}
            <div className="grid grid-cols-3 gap-2 print:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyCodes}
                iconLeft={<Copy className="w-3.5 h-3.5" />}
              >
                Copy All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadCodes}
                iconLeft={<Download className="w-3.5 h-3.5" />}
              >
                Download
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrintCodes}
                iconLeft={<Printer className="w-3.5 h-3.5" />}
              >
                Print
              </Button>
            </div>

            {/* Confirmation Checkbox */}
            <div className="space-y-4 pt-2 border-t border-border print:hidden">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-text select-none">
                <input
                  type="checkbox"
                  id="confirm-saved-checkbox"
                  checked={confirmedSaved}
                  onChange={(e) => setConfirmedSaved(e.target.checked)}
                  className="mt-0.5 rounded border-border text-brand-600 focus:ring-brand-500 w-4 h-4"
                />
                <span className="font-medium">
                  I have saved my recovery codes in a safe place.
                </span>
              </label>

              <Button
                type="button"
                variant="primary"
                fullWidth
                disabled={!confirmedSaved}
                onClick={handleFinishRegistration}
                iconRight={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Continue to SplitOrbit
              </Button>
            </div>
          </Card>
        ) : (
          /* STEP 1: Registration Form */
          <Card className="space-y-4 animate-scale-in">
            <AnimatePresence>
              {errorMessage && (
                <m.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={springs.snappy}
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </m.div>
              )}
            </AnimatePresence>

            {!allowRegistration && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>
                  Self-registration is currently closed. A valid group invitation code is required to join.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {invitePreview && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-text flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="leading-snug">
                    Joining <strong>{invitePreview.groupName}</strong> as profile{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {invitePreview.profileLabel}
                    </strong>
                  </span>
                </div>
              )}

              {(!allowRegistration || inviteCode) && (
                <Input
                  label="Invitation Code"
                  type="text"
                  required={!allowRegistration}
                  placeholder="Enter your group invitation code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              )}

              <Input
                label="Full Name"
                type="text"
                required
                placeholder="e.g. Vikram Malhotra"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div>
                <Input
                  label="Username"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="e.g. vikram"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  rightIcon={
                    usernameStatus.state === 'checking' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                    ) : usernameStatus.state === 'available' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : usernameStatus.state === 'taken' || usernameStatus.state === 'invalid' ? (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    ) : null
                  }
                />
                {usernameStatus.message && (
                  <p
                    className={`mt-1 text-[11px] ${
                      usernameStatus.state === 'available'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : usernameStatus.state === 'checking'
                        ? 'text-text-muted'
                        : 'text-rose-500'
                    }`}
                  >
                    {usernameStatus.message}
                  </p>
                )}
              </div>

              <div>
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 8 characters (max 72 bytes)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="p-1 hover:text-text transition focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                />
                {/* Password strength meter */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1.5 w-full">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`flex-1 rounded-full transition-colors ${
                            passwordStrength.score >= step
                              ? passwordStrength.color
                              : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px] text-text-muted">
                      <span>Strength: {passwordStrength.label}</span>
                      <span>8-72 bytes</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border/60">
                <p className="text-[11px] text-text-muted mb-2">
                  Optional Contact Info (used for admin/host identity reference):
                </p>
                <div className="space-y-3">
                  <Input
                    label="Email (optional)"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    label="Phone (optional)"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                disabled={usernameStatus.state === 'taken' || usernameStatus.state === 'invalid'}
                iconRight={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Create Account
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
