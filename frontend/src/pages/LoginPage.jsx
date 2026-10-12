import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Split, ArrowRight, Eye, EyeOff, AlertCircle, KeyRound, Users } from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import Button from '../components/common/Button.jsx';
import Input from '../components/common/Input.jsx';
import { Card } from '../components/common/Card.jsx';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../motion/tokens.js';

import { isValidNextUrl } from '../utils/url.js';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next') || searchParams.get('returnUrl');
  const validNext = isValidNextUrl(rawNext) ? rawNext : null;

  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) return;

    try {
      setLoading(true);
      const user = await login(cleanUsername, password);
      addToast('Welcome back!', 'success');
      const destination = validNext || (user?.role === 'admin' ? '/admin' : '/dashboard');
      navigate(destination, { replace: true });
    } catch (err) {
      const msg = err.message || 'Invalid username or password';
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors">
      {/* Top right Theme Toggle */}
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
        <h2 className="text-xl font-bold text-text">Sign in to your account</h2>
        <p className="mt-1 text-xs text-text-muted">
          Or{' '}
          <Link
            to={
              validNext
                ? `/register?next=${encodeURIComponent(validNext)}`
                : '/register'
            }
            className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
          >
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="space-y-5 animate-scale-in">
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              type="text"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
              placeholder="e.g. vikram"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              hint="Enter your unique SplitOrbit username"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-text">Password</label>
                <Link
                  to={
                    validNext
                      ? `/forgot-password?next=${encodeURIComponent(validNext)}`
                      : '/forgot-password'
                  }
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <KeyRound className="w-3 h-3" />
                  Forgot password?
                </Link>
              </div>
              <Input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
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
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              iconRight={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Sign In
            </Button>
          </form>

          <div className="pt-4 border-t border-border/80 space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <span className="relative px-3 bg-surface text-[10px] font-bold tracking-wider text-text-muted uppercase">
                Fast Demo Sign-In
              </span>
            </div>

            <m.button
              type="button"
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={springs.snappy}
              onClick={async () => {
                setUsername('vikram');
                setPassword('hostpassword123');
                try {
                  setLoading(true);
                  await login('vikram', 'hostpassword123');
                  addToast('Signed in as Demo Host (Vikram)', 'success');
                  navigate(returnUrl);
                } catch (err) {
                  setErrorMessage(err.message || 'Failed to sign in as host');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full group relative flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-raised/60 hover:bg-surface-raised border border-border hover:border-emerald-500/40 transition-all text-left cursor-pointer shadow-xs"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-text group-hover:text-emerald-500 transition-colors">
                    Demo Host
                  </span>
                  <span className="text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-surface border border-border text-text-muted">
                    Host
                  </span>
                </div>
                <span className="text-[10px] text-text-muted block truncate mt-0.5">
                  @vikram • Trip Group
                </span>
              </div>
            </m.button>
          </div>
        </Card>
      </div>
    </div>
  );
}
