import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Split,
  Receipt,
  AlertCircle,
  ShieldCheck,
  Calendar,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import api from '../api/client.js';
import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import { Card } from '../components/common/Card.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import AnimatedAmount from '../components/common/AnimatedAmount.jsx';
import FriendStatementSkeleton from '../components/charts/FriendStatementSkeleton.jsx';
import ErrorBoundary from '../components/common/ErrorBoundary.jsx';
import BrandedAuthSkeleton from '../components/common/BrandedAuthSkeleton.jsx';
import { formatINR } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FriendStatementCharts = React.lazy(() => import('../components/charts/FriendStatementCharts.jsx'));

export default function PublicStatementPage() {
  const { token } = useParams();
  const { user, bootstrapAuth } = useAuth();
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingProfile, setClaimingProfile] = useState(false);

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      const res = await api.get(`/s/${token}/analytics`);
      if (res.success) {
        setAnalytics(res.data);
      }
    } catch (err) {
      setAnalyticsError(err.message || 'Failed to load visual analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchStatement = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/s/${token}`);
      if (res.success) {
        setData(res.data);
        // Lazy-load analytics after statement data
        fetchAnalytics();
      }
    } catch (err) {
      setError(err.message || 'This shared statement link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  const handleClaimViaViewLink = async () => {
    try {
      setClaimingProfile(true);
      const res = await api.post(`/s/${encodeURIComponent(token)}/claim`);
      if (res.success) {
        addToast(
          res.data?.alreadyClaimed
            ? 'Profile already linked to your account!'
            : 'Statement linked to your account successfully! 🎉',
          'success'
        );
        if (bootstrapAuth) await bootstrapAuth();
        fetchStatement();
      }
    } catch (err) {
      addToast(err.message || 'Failed to link account to this statement', 'error');
    } finally {
      setClaimingProfile(false);
    }
  };

  if (loading) {
    return <BrandedAuthSkeleton message="Loading passbook statement..." />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-text flex flex-col items-center justify-center p-4 text-center">
        <ErrorState
          title="Statement Unavailable"
          message={error || 'This link may have been revoked by the host or does not exist.'}
          onRetry={fetchStatement}
          actionText="Retry Loading Statement"
        />
        <div className="mt-4">
          <Link
            to="/"
            className="text-xs text-text-muted hover:text-text underline font-medium"
          >
            Return to SplitOrbit Home
          </Link>
        </div>
      </div>
    );
  }

  const { person, group, totals, ledger } = data;
  const owes = totals.remainingToPay > 0;
  const isOwed = totals.groupOwesYou > 0;

  return (
    <div className="min-h-screen bg-background text-text flex flex-col pb-16 transition-colors">
      {/* Top Header */}
      <header className="border-b border-border bg-surface/85 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-slate-950 font-black text-xs">
              <Split className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-text">SplitOrbit</span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <span className="text-[11px] font-medium text-text-muted flex items-center gap-1 bg-surface-raised px-2.5 py-1 rounded-full border border-border">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              Verified Passbook
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Person & Group Title Card */}
        <Card className="p-5 space-y-1">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            {group.name}
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-text tracking-tight">
            Statement for {person.name}
          </h1>
          <p className="text-xs text-text-muted">
            Official passbook ledger calculated directly in paise precision.
          </p>
        </Card>

        {/* Big Balance Callout Bento Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
              Total Share
            </span>
            <span className="text-xl font-black text-text mt-1 block font-mono tabular-nums">
              <AnimatedAmount amount={totals.totalShare} />
            </span>
            <span className="text-[11px] text-text-muted mt-0.5 block">Your divided costs</span>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
              Total Repaid
            </span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block font-mono tabular-nums">
              <AnimatedAmount amount={totals.totalPaid} />
            </span>
            <span className="text-[11px] text-text-muted mt-0.5 block">Accepted repayments</span>
          </Card>
        </div>

        {/* Sticky Remaining to Pay Card */}
        <div className="sticky top-14 z-20 pt-1 pb-1">
          <div className="bg-surface/95 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border flex items-center justify-between shadow-md transition-shadow">
            <div>
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                Remaining to Pay
              </span>
              <span className="text-xs text-text-muted block mt-0.5 font-medium">
                {owes ? 'Amount to return to host' : isOwed ? 'Host owes you' : 'All debts settled'}
              </span>
            </div>

            <div className="text-right">
              {owes ? (
                <div className="inline-flex flex-col items-end">
                  <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                    <AnimatedAmount amount={totals.remainingToPay} />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Owes Host
                  </span>
                </div>
              ) : isOwed ? (
                <div className="inline-flex flex-col items-end">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    <AnimatedAmount amount={totals.groupOwesYou} />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Group Owes You
                  </span>
                </div>
              ) : (
                <Badge variant="settled" size="sm" showIcon>
                  Settled ₹0.00
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Lazy-Loaded Friend Visualizations (Protected by ErrorBoundary) */}
        <ErrorBoundary
          title="Charts Unavailable"
          message="Visual charts could not be loaded for this statement."
          fallback={(err, retry) => (
            <div className="p-4 rounded-xl bg-surface border border-border text-center text-xs text-text-muted flex items-center justify-between">
              <span>Visualizations temporarily unavailable.</span>
              <button
                type="button"
                onClick={retry}
                className="font-semibold underline text-text cursor-pointer hover:text-brand-500"
              >
                Retry
              </button>
            </div>
          )}
        >
          <React.Suspense fallback={<FriendStatementSkeleton />}>
            <FriendStatementCharts
              analytics={analytics}
              loading={analyticsLoading}
              error={analyticsError}
              onRetry={fetchAnalytics}
            />
          </React.Suspense>
        </ErrorBoundary>

        {/* Call To Action Banner: Sign up / Claim profile */}
        {data.person?.isLinkedToCurrentUser ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-surface-raised to-surface border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="space-y-0.5">
              <span className="text-xs sm:text-sm font-bold text-text flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                Linked to your account (@{user?.username})
              </span>
              <span className="text-[11px] text-text-muted block">
                This statement profile is linked to your SplitOrbit account. View itemized splits and manage payments from your friend dashboard.
              </span>
            </div>
            <Link
              to={`/friend?groupId=${data.group?.id}&personId=${data.person?.id}`}
              className="shrink-0"
            >
              <Button size="sm" variant="primary" iconRight={<ArrowRight className="w-3.5 h-3.5" />}>
                Open in Dashboard
              </Button>
            </Link>
          </div>
        ) : !data.person?.isClaimed ? (
          user ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-brand-500/10 via-surface-raised to-surface border border-brand-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <span className="text-xs sm:text-sm font-bold text-text block">
                  Link this statement to your account
                </span>
                <span className="text-[11px] text-text-muted block">
                  Signed in as <strong className="text-text font-semibold">@{user.username}</strong>. Connect this profile to submit repayments and track pooled balances.
                </span>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={handleClaimViaViewLink}
                disabled={claimingProfile}
                iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                className="shrink-0"
              >
                {claimingProfile ? 'Linking...' : `Link to @${user.username}`}
              </Button>
            </div>
          ) : (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-surface-raised to-surface border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <span className="text-xs sm:text-sm font-bold text-text block">
                  Want to record repayments and track across groups?
                </span>
                <span className="text-[11px] text-text-muted block">
                  Sign up or log in to link this statement to your SplitOrbit account.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/login?next=${encodeURIComponent(`/s/${token}`)}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-elevated text-text transition"
                >
                  Sign In
                </Link>
                <Link
                  to={`/register?shareToken=${encodeURIComponent(token)}&next=${encodeURIComponent(`/s/${token}`)}`}
                >
                  <Button size="sm" variant="primary" iconRight={<ArrowRight className="w-3.5 h-3.5" />}>
                    Sign Up & Link Account
                  </Button>
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="p-3.5 rounded-xl bg-surface-raised border border-border text-xs text-text-muted flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>This statement profile is claimed by a verified member account.</span>
          </div>
        )}

        {/* Passbook Ledger */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-text tracking-tight flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Passbook Activity ({ledger.length} entries)
          </h2>

          {ledger.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-6 h-6 text-text-muted" />}
              title="No transactions recorded"
              description="Your share of expenses or recorded payments will appear here."
            />
          ) : (
            <div className="space-y-2.5">
              {ledger.map((item) => {
                const isExpense = item.type === 'expense_share';
                const isAcceptedPay = item.type === 'payment' && item.status === 'accepted';
                const isPendingPay = item.type === 'payment' && item.status === 'pending';
                const isRejectedPay = item.type === 'payment' && item.status === 'rejected';

                return (
                  <Card
                    key={`${item.type}-${item.id}`}
                    hover
                    className="p-3.5 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isExpense ? (
                          <span className="w-5 h-5 rounded-md bg-surface-raised border border-border flex items-center justify-center text-rose-500 font-bold text-[10px]">
                            <TrendingDown className="w-3 h-3 text-rose-500" />
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                            <TrendingUp className="w-3 h-3 text-emerald-500" />
                          </span>
                        )}

                        <span className="font-bold text-text truncate">
                          {isExpense ? item.title : `Payment via ${item.mode.toUpperCase()}`}
                        </span>

                        {!isExpense && (
                          <Badge
                            variant={
                              isAcceptedPay ? 'accepted' : isPendingPay ? 'pending' : 'rejected'
                            }
                            size="xs"
                            showIcon
                          >
                            {item.status}
                          </Badge>
                        )}
                      </div>

                      <div className="text-[11px] text-text-muted flex items-center gap-1.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-text-muted" />
                          {formatDate(item.date)}
                        </span>
                        {isExpense && <span>• Paid by {item.paidBy}</span>}
                        {!isExpense && item.reference && (
                          <span className="font-mono text-[10px]">• Ref: {item.reference}</span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[11px] text-text-muted">{item.description}</p>
                      )}

                      {isRejectedPay && item.rejectReason && (
                        <p className="text-[11px] text-rose-500 dark:text-rose-400 font-medium">
                          Rejection note: {item.rejectReason}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono tabular-nums font-bold text-sm block ${
                          isExpense
                            ? 'text-rose-600 dark:text-rose-400'
                            : isAcceptedPay
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-text-muted'
                        }`}
                      >
                        {isExpense ? `-${formatINR(item.amount)}` : `+${formatINR(item.amount)}`}
                      </span>

                      {/* Running remaining due */}
                      <span className="text-[10px] text-text-muted block font-mono tabular-nums">
                        Due: {formatINR(item.runningRemaining)}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
