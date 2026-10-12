import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Split,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Clock,
  ShieldAlert,
  User,
  LogOut,
  Sparkles,
} from 'lucide-react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate } from '../utils/date.js';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import BrandedAuthSkeleton from '../components/common/BrandedAuthSkeleton.jsx';

export default function InviteAcceptPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, status: authStatus, logout, bootstrapAuth } = useAuth();
  const { addToast } = useToast();

  const [inviteData, setInviteData] = useState(null);
  const [invalidReason, setInvalidReason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [claimedSuccess, setClaimedSuccess] = useState(false);
  const [claimedResult, setClaimedResult] = useState(null);

  const hasAutoClaimedRef = useRef(false);

  // 1. Fetch preview on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchInvite() {
      if (!code) {
        setInvalidReason('invalid');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setClaimError(null);
        const res = await api.get(`/invites/${encodeURIComponent(code)}/preview`);
        if (!isMounted) return;

        if (res.data?.valid) {
          setInviteData(res.data);
          setInvalidReason(null);
        } else {
          setInvalidReason(res.data?.reason || 'invalid');
          setInviteData(null);
        }
      } catch (err) {
        if (!isMounted) return;
        setInvalidReason('invalid');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchInvite();

    return () => {
      isMounted = false;
    };
  }, [code]);

  // 2. Claim execution handler
  const handleClaim = async (isAuto = false) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }

    try {
      setClaiming(true);
      setClaimError(null);

      const res = await api.post(`/invites/${encodeURIComponent(code)}/claim`);

      if (res.success) {
        setClaimedSuccess(true);
        setClaimedResult(res.data);

        // Sanitize the URL to prevent sharing or re-clicking single-use code
        if (typeof window !== 'undefined' && window.history) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Re-bootstrap user session state
        if (bootstrapAuth) {
          await bootstrapAuth();
        }

        addToast(
          res.data?.alreadyClaimed
            ? 'Profile already claimed! Redirecting to statement...'
            : 'Profile claimed! Linked to your account 🎉',
          'success'
        );
      }
    } catch (err) {
      const errCode = err.code || err.response?.data?.error?.code;
      const errMsg = err.message || err.response?.data?.error?.message;

      if (errCode === 'ALREADY_IN_GROUP') {
        setClaimError('You already belong to this group under another profile.');
        addToast('You already belong to this group under another profile.', 'warning');
      } else if (errCode === 'HOST_CANNOT_CLAIM') {
        setClaimError('You are the host of this group and already have full access.');
        addToast('You are the host of this group and already have full access.', 'info');
      } else if (errCode === 'INVITE_USED') {
        setInvalidReason('used');
        addToast('This invite link has already been claimed.', 'error');
      } else if (errCode === 'INVITE_EXPIRED') {
        setInvalidReason('expired');
        addToast('This invite link has expired.', 'error');
      } else {
        setClaimError(errMsg || 'Failed to claim profile. Please try again.');
        addToast(errMsg || 'Failed to claim profile', 'error');
      }
    } finally {
      setClaiming(false);
    }
  };

  // 3. Auto-claim when authenticated user visits or returns from login
  useEffect(() => {
    if (
      authStatus === 'authenticated' &&
      user &&
      inviteData?.valid &&
      !loading &&
      !claimedSuccess &&
      !claiming &&
      !invalidReason &&
      !hasAutoClaimedRef.current
    ) {
      hasAutoClaimedRef.current = true;
      handleClaim(true);
    }
  }, [authStatus, user, inviteData, loading, claimedSuccess, claiming, invalidReason]);

  // Switch account handler
  const handleSwitchAccount = async () => {
    try {
      await logout();
      hasAutoClaimedRef.current = false;
      addToast('Signed out. Please sign in with your other account.', 'info');
    } catch {
      // ignore
    }
  };

  // Loading Skeleton
  if (loading || authStatus === 'loading') {
    return <BrandedAuthSkeleton message="Verifying invite link..." />;
  }

  // Invalid Reason / Error State
  if (invalidReason) {
    const errorDetails = {
      expired: {
        icon: Clock,
        title: 'Invite Link Expired',
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        description:
          'This single-use invite code was valid for 7 days and has expired. Please ask your group host to generate a new invite link.',
        action: (
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface-elevated text-text border border-border transition"
          >
            Go to SplitOrbit
          </Link>
        ),
      },
      used: {
        icon: AlertTriangle,
        title: 'Invite Already Claimed',
        color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        description:
          'This invite link has already been claimed by an account. Member invite links are single-use only.',
        action: (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-400 text-slate-950 transition shadow-lg shadow-brand-500/20"
            >
              Sign In to Your Account
            </Link>
            <Link
              to="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface-elevated text-text border border-border transition"
            >
              Go to Home
            </Link>
          </div>
        ),
      },
      revoked: {
        icon: ShieldAlert,
        title: 'Invite Revoked',
        color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        description:
          'This invite link was revoked by the group host or administrator, or the associated group has been removed.',
        action: (
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface-elevated text-text border border-border transition"
          >
            Return to SplitOrbit
          </Link>
        ),
      },
      invalid: {
        icon: AlertTriangle,
        title: 'Invalid Invite Link',
        color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        description:
          'We could not find an active invite matching this link. Please check the URL or request a new invite link from your host.',
        action: (
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface-elevated text-text border border-border transition"
          >
            Go to Home
          </Link>
        ),
      },
    };

    const currentError = errorDetails[invalidReason] || errorDetails.invalid;
    const IconComponent = currentError.icon;

    return (
      <div className="min-h-screen bg-background text-text flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto mb-4 shadow-xl ${currentError.color}`}
          >
            <IconComponent className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-text">{currentError.title}</h2>
          <p className="text-xs text-text-muted max-w-sm mx-auto mt-2 mb-6 leading-relaxed">
            {currentError.description}
          </p>
          <div className="flex justify-center">{currentError.action}</div>
        </div>
      </div>
    );
  }

  // Claimed Success State
  if (claimedSuccess) {
    const targetGroupId = claimedResult?.groupId;
    const targetPersonId = claimedResult?.personId;
    const groupName = claimedResult?.groupName || inviteData?.groupName || 'Expense Group';
    const profileLabel = inviteData?.profileLabel || 'Member Profile';

    return (
      <div className="min-h-screen bg-background text-text flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto shadow-xl shadow-emerald-500/10 animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-3 h-3" />
              Profile Connected
            </span>
            <h2 className="text-2xl font-black text-text tracking-tight">You're All Set! 🎉</h2>
            <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              You are now connected to <strong className="text-text font-bold">{groupName}</strong> as{' '}
              <strong className="text-brand-500 font-bold">{profileLabel}</strong>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border space-y-3 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Connected Account</span>
              <span className="font-semibold text-text">@{user?.username}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Group</span>
              <span className="font-semibold text-text">{groupName}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Member Profile</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {profileLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to={
                targetGroupId
                  ? `/friend?groupId=${targetGroupId}&personId=${targetPersonId || ''}`
                  : '/friend'
              }
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-400 text-slate-950 transition shadow-lg shadow-brand-500/20"
            >
              <span>Open My Statement</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/friend"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface-elevated text-text border border-border transition"
            >
              Friend Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active Invite Card
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
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <UserCheck className="w-3 h-3" />
            Member Invite
          </span>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface p-6 sm:p-8 rounded-2xl shadow-xl space-y-6 border border-border transition-colors">
          <div className="text-center space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              You are invited to join
            </span>
            <h1 className="text-2xl font-black text-text tracking-tight">
              {inviteData?.groupName}
            </h1>
            {inviteData?.hostName && (
              <p className="text-xs text-text-muted mt-0.5">
                Invited by <span className="font-medium text-text">{inviteData.hostName}</span>
              </p>
            )}
          </div>

          {/* Profile To Claim Box */}
          <div className="p-4 rounded-xl bg-surface-muted/60 border border-border/80 space-y-2 text-center">
            <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider">
              Profile to Claim
            </span>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {inviteData?.profileLabel}
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Claiming links this member profile to your SplitOrbit account so you can view personal statements, track pooled balances, and submit payments.
            </p>
          </div>

          {inviteData?.expiresAt && (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              <span>Valid until {formatDate(inviteData.expiresAt)}</span>
            </div>
          )}

          {claimError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium text-center">
              {claimError}
            </div>
          )}

          {/* Actions based on auth status */}
          {user ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface-muted/40 border border-border text-xs text-text flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    Signed in as <span className="font-bold">{user.name}</span>{' '}
                    <span className="text-text-muted font-normal">(@{user.username})</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="text-[11px] font-semibold text-text-muted hover:text-brand-500 transition ml-2 shrink-0 flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Switch</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleClaim(false)}
                disabled={claiming}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-400 text-slate-950 transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {claiming ? (
                  <div className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Join {inviteData?.groupName}</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-text-muted text-center">
                Please create an account or sign in to claim your member profile:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to={`/register?invite=${encodeURIComponent(code)}`}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold text-center bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-md shadow-brand-500/20"
                >
                  Create Account & Join
                </Link>
                <Link
                  to={`/login?next=${encodeURIComponent(`/invite/${code}`)}`}
                  className="py-2.5 px-3 rounded-xl text-xs font-semibold text-center bg-surface-muted border border-border text-text hover:bg-surface-elevated transition"
                >
                  I Have an Account
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
