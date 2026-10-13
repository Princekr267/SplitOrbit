import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/common/Navbar.jsx';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatINR } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import {
  Users,
  CreditCard,
  Receipt,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Send,
  Edit2,
  ExternalLink,
  Info,
  Eye,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { springs, durations, easings } from '../motion/tokens.js';
import { Stagger } from '../motion/components.jsx';
import { listItem } from '../motion/variants.js';
import AnimatedAmount from '../components/common/AnimatedAmount.jsx';
import FriendStatementSkeleton from '../components/charts/FriendStatementSkeleton.jsx';

const FriendStatementCharts = React.lazy(() => import('../components/charts/FriendStatementCharts.jsx'));

export default function FriendDashboardPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Expanded statement per profile id
  const [expandedProfileId, setExpandedProfileId] = useState(null);
  const [profileStatements, setProfileStatements] = useState({});
  const [loadingStatementId, setLoadingStatementId] = useState(null);

  // Analytics per profile
  const [profileAnalytics, setProfileAnalytics] = useState({});
  const [loadingAnalyticsId, setLoadingAnalyticsId] = useState(null);

  // Submit payment modal state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [activeProfileForPayment, setActiveProfileForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('online');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Resubmit payment modal state
  const [resubmitModalOpen, setResubmitModalOpen] = useState(false);
  const [resubmitPayment, setResubmitPayment] = useState(null);
  const [resubmitProfile, setResubmitProfile] = useState(null);
  const [resubmitAmount, setResubmitAmount] = useState('');
  const [resubmitMode, setResubmitMode] = useState('online');
  const [resubmitRef, setResubmitRef] = useState('');
  const [resubmitDesc, setResubmitDesc] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  // Full group bills state
  const [groupBillsModalOpen, setGroupBillsModalOpen] = useState(false);
  const [groupBillsData, setGroupBillsData] = useState(null);
  const [loadingGroupBills, setLoadingGroupBills] = useState(false);
  const [activeGroupBillsProfile, setActiveGroupBillsProfile] = useState(null);

  const handleViewGroupBills = async (profile) => {
    setActiveGroupBillsProfile(profile);
    setGroupBillsModalOpen(true);
    setLoadingGroupBills(true);
    setGroupBillsData(null);

    try {
      const res = await api.get(`/friend/profiles/${profile.person.id}/group-bills`);
      if (res.success) {
        setGroupBillsData(res.data);
      } else {
        throw new Error(res.error?.message || 'Failed to load group bills');
      }
    } catch (err) {
      addToast(err.message || 'Failed to load group bills', 'error');
    } finally {
      setLoadingGroupBills(false);
    }
  };

  const fetchProfiles = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await api.get('/friend/profiles');
      if (res.success) {
        setProfiles(res.data || []);
      }
    } catch (err) {
      setError(err);
      addToast(err.message || 'Failed to load your friend profiles', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  const [searchParams] = useSearchParams();
  const targetGroupId = searchParams.get('groupId');
  const targetPersonId = searchParams.get('personId');

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const loadStatementForProfile = async (profile) => {
    const personId = profile.person.id;
    const groupId = profile.group.id;

    if (expandedProfileId === personId) {
      setExpandedProfileId(null);
      return;
    }

    setExpandedProfileId(personId);

    // Fetch visual analytics if not loaded yet
    if (!profileAnalytics[personId]) {
      (async () => {
        try {
          setLoadingAnalyticsId(personId);
          const aRes = await api.get(`/me/profiles/${personId}/analytics`);
          if (aRes.success) {
            setProfileAnalytics((prev) => ({
              ...prev,
              [personId]: aRes.data,
            }));
          }
        } catch {
          // graceful fallback
        } finally {
          setLoadingAnalyticsId(null);
        }
      })();
    }

    if (profileStatements[personId]) return;

    try {
      setLoadingStatementId(personId);
      const res = await api.get(`/groups/${groupId}/people/${personId}/statement`);
      if (res.success) {
        setProfileStatements((prev) => ({
          ...prev,
          [personId]: res.data,
        }));
      }
    } catch (err) {
      addToast(err.message || 'Failed to load itemized statement', 'error');
    } finally {
      setLoadingStatementId(null);
    }
  };

  // Auto-expand statement and scroll into view if targeted via URL query params (e.g. redirected from claim)
  useEffect(() => {
    if (profiles.length > 0 && (targetPersonId || targetGroupId)) {
      const target = profiles.find(
        (p) =>
          (targetPersonId && p.person?.id === targetPersonId) ||
          (targetGroupId && p.group?.id === targetGroupId)
      );
      if (target) {
        if (expandedProfileId !== target.person?.id) {
          loadStatementForProfile(target);
        }
        setTimeout(() => {
          const el = document.getElementById(`profile-card-${target.person?.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-brand-500');
            setTimeout(() => el.classList.remove('ring-2', 'ring-brand-500'), 2500);
          }
        }, 350);
      }
    }
  }, [profiles, targetGroupId, targetPersonId]);

  const handleOpenSubmitPayment = (profile) => {
    setActiveProfileForPayment(profile);
    const remainingRupees = profile.summary.remainingToPay > 0
      ? (profile.summary.remainingToPay / 100).toFixed(2)
      : '';
    setPaymentAmount(remainingRupees);
    setPaymentMode('online');
    setPaymentRef('');
    setPaymentDesc('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setSubmitModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!activeProfileForPayment) return;

    const parsedRupees = parseFloat(paymentAmount);
    if (isNaN(parsedRupees) || parsedRupees <= 0) {
      addToast('Please enter a valid amount', 'error');
      return;
    }

    const amountInPaise = Math.round(parsedRupees * 100);

    try {
      setSubmittingPayment(true);
      const res = await api.post('/friend/payments', {
        personId: activeProfileForPayment.person.id,
        groupId: activeProfileForPayment.group.id,
        amount: amountInPaise,
        mode: paymentMode,
        reference: paymentRef,
        description: paymentDesc,
        date: paymentDate,
      });

      if (res.success) {
        addToast('Repayment submitted to host! Awaiting approval ⏳', 'success');
        setSubmitModalOpen(false);
        // Invalidate cached statement and refresh
        setProfileStatements((prev) => {
          const next = { ...prev };
          delete next[activeProfileForPayment.person.id];
          return next;
        });
        fetchProfiles(true);
        if (expandedProfileId === activeProfileForPayment.person.id) {
          loadStatementForProfile(activeProfileForPayment);
        }
      }
    } catch (err) {
      addToast(err.message || 'Failed to submit payment', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleOpenResubmitModal = (payment, profile) => {
    setResubmitPayment(payment);
    setResubmitProfile(profile);
    setResubmitAmount((payment.amount / 100).toFixed(2));
    setResubmitMode(payment.mode || 'online');
    setResubmitRef(payment.reference || '');
    setResubmitDesc(payment.description || '');
    setResubmitModalOpen(true);
  };

  const handleResubmit = async (e) => {
    e.preventDefault();
    if (!resubmitPayment || !resubmitProfile) return;

    const parsedRupees = parseFloat(resubmitAmount);
    if (isNaN(parsedRupees) || parsedRupees <= 0) {
      addToast('Please enter a valid amount', 'error');
      return;
    }

    const amountInPaise = Math.round(parsedRupees * 100);

    try {
      setResubmitting(true);
      const res = await api.patch(`/friend/payments/${resubmitPayment.id}`, {
        personId: resubmitProfile.person.id,
        groupId: resubmitProfile.group.id,
        amount: amountInPaise,
        mode: resubmitMode,
        reference: resubmitRef,
        description: resubmitDesc,
      });

      if (res.success) {
        addToast('Payment resubmitted to host for approval! 🔄', 'success');
        setResubmitModalOpen(false);
        // Invalidate cached statement and refresh
        setProfileStatements((prev) => {
          const next = { ...prev };
          delete next[resubmitProfile.person.id];
          return next;
        });
        fetchProfiles(true);
        if (expandedProfileId === resubmitProfile.person.id) {
          loadStatementForProfile(resubmitProfile);
        }
      }
    } catch (err) {
      addToast(err.message || 'Failed to resubmit payment', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Calculate global summary across all claimed groups
  const totalRemainingAcrossGroups = profiles.reduce(
    (sum, p) => sum + (p.summary?.remainingToPay || 0),
    0
  );
  const totalPendingAcrossGroups = profiles.reduce(
    (sum, p) => sum + (p.summary?.pendingSentTotal || 0),
    0
  );

  return (
    <div className="min-h-screen bg-background text-text flex flex-col pb-20 sm:pb-8 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-text tracking-tight">
                Friend Passbook
              </h1>
              <Badge variant="brand" size="xs">
                Linked Profiles
              </Badge>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Track your shared expenses, repayments, and pending host approvals across all your friend groups.
            </p>
          </div>

          <button
            onClick={() => fetchProfiles(true)}
            disabled={refreshing}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-surface-raised border border-border text-text transition disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <ErrorState
            title="Failed to load friend profiles"
            error={error}
            onRetry={() => fetchProfiles(true)}
            className="my-4"
          />
        )}

        {/* Global Summary Cards Bento */}
        {profiles.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
                Total You Owe
              </span>
              <span className={`text-xl sm:text-2xl font-black mt-1 block font-mono tabular-nums ${totalRemainingAcrossGroups > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatINR(totalRemainingAcrossGroups)}
              </span>
              <span className="text-[11px] text-text-muted block">
                Net remaining balance
              </span>
            </div>

            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                Pending Approvals
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block font-mono tabular-nums">
                {formatINR(totalPendingAcrossGroups)}
              </span>
              <span className="text-[11px] text-text-muted block">
                Submitted to host
              </span>
            </div>

            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
                Linked Groups
              </span>
              <span className="text-xl sm:text-2xl font-black text-text mt-1 block font-mono tabular-nums">
                {profiles.length}
              </span>
              <span className="text-[11px] text-text-muted block">
                Active group memberships
              </span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-3" />
            <p className="text-xs text-text-muted">Loading your statements...</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="bg-surface p-12 rounded-2xl text-center space-y-4 border border-dashed border-border shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto text-text-muted">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">No Linked Groups Yet</h2>
              <p className="text-xs text-text-muted max-w-sm mx-auto mt-1 leading-relaxed">
                When a host adds you to an expense group, they can share an invite link with you. Once you claim it, your statement will appear here!
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-slate-950 hover:bg-brand-400 transition"
            >
              Go to Host Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {profiles.map((item) => {
              const { person, group, summary } = item;
              const isExpanded = expandedProfileId === person.id;
              const statement = profileStatements[person.id];
              const isLoadingThisStatement = loadingStatementId === person.id;
              const owesMoney = summary.remainingToPay > 0;
              const isSettled = summary.remainingToPay === 0 && summary.groupOwesYou === 0;

              return (
                <m.div
                  key={person.id}
                  id={`profile-card-${person.id}`}
                  layout="position"
                  transition={springs.smooth}
                  style={{ borderRadius: 16 }}
                  className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden transition-all duration-300"
                >
                  {/* Card Header & Summary */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-lg text-text">{group.name}</h3>
                          <Badge
                            variant={group.status === 'active' ? 'active' : 'settled'}
                            size="xs"
                            showIcon
                          >
                            {group.status === 'active' ? 'Active' : 'Settled'}
                          </Badge>
                        </div>
                        <span className="text-xs text-text-muted block mt-0.5">
                          Profile: <strong className="text-text font-semibold">{person.name}</strong>
                          {group.hostName && (
                            <>
                              {' '}• Host: <strong className="text-text font-semibold">{group.hostName}</strong>
                              {group.hostUsername && <span className="font-mono text-text-muted/80 ml-1">@{group.hostUsername}</span>}
                            </>
                          )}
                          {group.hostUpi && <span className="text-emerald-600 dark:text-emerald-400 font-mono ml-1.5 font-medium">• UPI: {group.hostUpi}</span>}
                        </span>
                      </div>

                      {/* Balance Status */}
                      <div className="text-left sm:text-right">
                        {owesMoney ? (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 tracking-wider block">
                              You Owe Host
                            </span>
                            <span className="text-xl font-black text-rose-600 dark:text-rose-400 block font-mono tabular-nums">
                              {formatINR(summary.remainingToPay)}
                            </span>
                          </div>
                        ) : isSettled ? (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider block">
                              Status
                            </span>
                            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 block font-mono tabular-nums">
                              Fully Settled (₹0)
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400 tracking-wider block">
                              Host Owes You
                            </span>
                            <span className="text-xl font-black text-teal-600 dark:text-teal-400 block font-mono tabular-nums">
                              {formatINR(summary.groupOwesYou)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-surface-raised border border-border text-xs">
                      <div>
                        <span className="text-text-muted text-[11px] block">Your Total Share</span>
                        <span className="font-bold text-text block mt-0.5 font-mono tabular-nums">
                          {formatINR(summary.shareSplitsTotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted text-[11px] block">Accepted Repayments</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5 font-mono tabular-nums">
                          {formatINR(summary.acceptedSentTotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted text-[11px] block">Pending Approvals</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400 block mt-0.5 font-mono tabular-nums">
                          {formatINR(summary.pendingSentTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Admin Frozen Notice */}
                    {group.isFrozen && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">
                          This group is currently frozen by an administrator. Submitting repayments is paused.
                        </span>
                      </div>
                    )}

                    {/* Bill Visibility Privacy Banner */}
                    {!item.person.canViewAllBills ? (
                      <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center gap-2.5 text-xs text-text-muted">
                        <Info className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="leading-relaxed">
                          You are viewing your own bills. The host has not enabled full group visibility for you.
                        </span>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400 font-medium">
                          <Eye className="w-4 h-4 shrink-0" />
                          <span>Full group bill visibility is enabled by the host.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleViewGroupBills(item)}
                          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View All Group Bills</span>
                        </button>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                      <m.button
                        whileTap={{ scale: 0.98 }}
                        transition={springs.snappy}
                        onClick={() => loadStatementForProfile(item)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text transition-colors py-1 cursor-pointer"
                      >
                        <m.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={springs.snappy}
                          className="inline-flex"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </m.span>
                        <span>{isExpanded ? 'Hide Activity Details' : 'View Itemized Activity'}</span>
                      </m.button>

                      <div className="flex items-center gap-2 flex-wrap">
                        {group.hostUpi && owesMoney && (
                          <a
                            href={`upi://pay?pa=${encodeURIComponent(group.hostUpi)}&pn=${encodeURIComponent(group.hostName || 'Host')}&am=${(summary.remainingToPay / 100).toFixed(2)}&cu=INR`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors shadow-sm"
                            title={`Pay ₹${(summary.remainingToPay / 100).toFixed(2)} via UPI App to ${group.hostUpi}`}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay with UPI App</span>
                          </a>
                        )}

                        {group.status === 'active' && !group.isFrozen && (
                          <m.button
                            whileTap={{ scale: 0.97 }}
                            transition={springs.snappy}
                            onClick={() => handleOpenSubmitPayment(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition-colors shadow-sm cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>+ Submit Payment</span>
                          </m.button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Itemized Activity Section */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: springs.smooth,
                          opacity: { duration: durations.fast, ease: easings.easeOut },
                        }}
                        className="overflow-hidden border-t border-border bg-surface-raised/40"
                      >
                        <div className="p-5 sm:p-6 space-y-6">
                          {isLoadingThisStatement ? (
                            <div className="py-8 flex justify-center items-center gap-2 text-xs text-text-muted">
                              <div className="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                              <span>Loading activity...</span>
                            </div>
                          ) : !statement ? (
                            <p className="text-xs text-text-muted text-center py-4">
                              Failed to load activity details.
                            </p>
                          ) : (
                            <>
                              {/* Sticky Remaining to Pay Card */}
                              <div className="sticky top-16 z-20 pt-1 pb-2">
                                <div className="bg-surface/95 backdrop-blur-md p-4 rounded-xl border border-border flex items-center justify-between shadow-md">
                                  <div>
                                    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                                      Remaining to Pay
                                    </span>
                                    <span className="text-xs text-text-muted block mt-0.5 font-medium">
                                      {owesMoney ? 'Amount to return to host' : summary.groupOwesYou > 0 ? 'Host owes you' : 'All debts settled'}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    {owesMoney ? (
                                      <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                                        <AnimatedAmount amount={summary.remainingToPay} />
                                      </span>
                                    ) : summary.groupOwesYou > 0 ? (
                                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                                        <AnimatedAmount amount={summary.groupOwesYou} />
                                      </span>
                                    ) : (
                                      <Badge variant="settled" size="sm" showIcon>
                                        Settled ₹0.00
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Friend Statement Visualizations */}
                              <React.Suspense fallback={<FriendStatementSkeleton />}>
                                <FriendStatementCharts
                                  analytics={profileAnalytics[person.id]}
                                  loading={loadingAnalyticsId === person.id}
                                />
                              </React.Suspense>

                              {/* Payments Section */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
                                  <CreditCard className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                                  Repayments Submitted ({statement.payments?.length || 0})
                                </h4>

                                {statement.payments?.length === 0 ? (
                                  <p className="text-xs text-text-muted italic">No repayments recorded yet.</p>
                                ) : (
                                  <Stagger className="space-y-2">
                                    {statement.payments.map((p) => {
                                      const isAccepted = p.status === 'accepted';
                                      const isPending = p.status === 'pending';
                                      const isRejected = p.status === 'rejected';

                                      return (
                                        <m.div
                                          key={p.id}
                                          variants={listItem}
                                          className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                            isRejected
                                              ? 'bg-rose-500/10 border-rose-500/30'
                                              : isPending
                                              ? 'bg-amber-500/10 border-amber-500/30'
                                              : 'bg-surface border-border'
                                          }`}
                                        >
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-text font-mono tabular-nums text-sm">
                                                {formatINR(p.amount)}
                                              </span>
                                              <Badge
                                                variant={
                                                  isAccepted ? 'accepted' : isPending ? 'pending' : 'rejected'
                                                }
                                                size="xs"
                                                showIcon
                                              >
                                                {p.status}
                                              </Badge>
                                              <span className="text-[10px] text-text-muted uppercase font-semibold">
                                                {p.mode}
                                              </span>
                                            </div>

                                            <p className="text-text-muted text-[11px]">
                                              {formatDate(p.date)}{' '}
                                              {p.reference && (
                                                <span className="font-mono text-text-muted">
                                                  • Ref: {p.reference}
                                                </span>
                                              )}
                                            </p>

                                            {p.description && (
                                              <p className="text-text text-[11px]">{p.description}</p>
                                            )}

                                            {/* Rejection Alert & Resubmit Action */}
                                            {isRejected && (
                                              <div className="pt-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400 text-[11px]">
                                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                  <span>
                                                    Host Reason: <strong>{p.rejectReason || 'No reason provided'}</strong>
                                                  </span>
                                                </div>
                                                <button
                                                  onClick={() => handleOpenResubmitModal(p, item)}
                                                  className="self-start sm:self-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition"
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                  <span>Edit & Resubmit</span>
                                                </button>
                                              </div>
                                            )}
                                          </div>

                                          <div className="text-right shrink-0">
                                            <span className="text-[10px] text-text-muted">
                                              {isAccepted
                                                ? 'Verified by host'
                                                : isPending
                                                ? 'Awaiting host verification'
                                                : 'Not applied to balance'}
                                            </span>
                                          </div>
                                        </m.div>
                                      );
                                    })}
                                  </Stagger>
                                )}
                              </div>

                              {/* Itemized Expenses Section */}
                              <div className="space-y-3 pt-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
                                  <Receipt className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                                  Expenses You Were Split In ({statement.expenses?.length || 0})
                                </h4>

                                {statement.expenses?.length === 0 ? (
                                  <p className="text-xs text-text-muted italic">No expenses recorded.</p>
                                ) : (
                                  <Stagger className="space-y-2">
                                    {statement.expenses.map((exp) => (
                                      <m.div
                                        key={exp.expenseId}
                                        variants={listItem}
                                        className="p-3 rounded-xl bg-surface border border-border text-xs flex items-center justify-between gap-3 shadow-xs"
                                      >
                                        <div>
                                          <h5 className="font-bold text-text">{exp.title}</h5>
                                          <p className="text-[11px] text-text-muted">
                                            {formatDate(exp.date)} • Paid by {exp.paidBy} (Total {formatINR(exp.totalAmount)})
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className="text-[10px] uppercase font-semibold text-text-muted block">
                                            Your Share
                                          </span>
                                          <span className="font-extrabold text-text font-mono tabular-nums">
                                            {formatINR(exp.personShare)}
                                          </span>
                                        </div>
                                      </m.div>
                                    ))}
                                  </Stagger>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </m.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Submit Repayment Modal */}
      <Modal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        title="Submit Repayment to Host"
      >
        {activeProfileForPayment && (
          <form onSubmit={handleSubmitPayment} className="space-y-4">
            <div className="p-3 rounded-xl bg-surface-raised border border-border text-xs">
              <span className="text-text-muted block">Submitting repayment for</span>
              <strong className="text-text block mt-0.5">
                {activeProfileForPayment.group.name} ({activeProfileForPayment.person.name})
              </strong>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold block">
                  Total dues: {formatINR(activeProfileForPayment.summary.remainingToPay)}
                </span>
                {activeProfileForPayment.summary.remainingToPay > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount((activeProfileForPayment.summary.remainingToPay / 100).toFixed(2))}
                    className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                  >
                    Fill Full Dues
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                data-amount-input="true"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="500.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm font-semibold focus:outline-none focus:border-brand-500 font-mono tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  Payment Mode *
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-xs focus:outline-none focus:border-brand-500"
                >
                  <option value="online">Online (UPI / Bank Transfer)</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Transaction Reference / UTR (Optional)
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. UPI Ref 3249019283"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-xs focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Note / Description (Optional)
              </label>
              <input
                type="text"
                value={paymentDesc}
                onChange={(e) => setPaymentDesc(e.target.value)}
                placeholder="e.g. Paid for dinner & cab"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-xs focus:outline-none focus:border-brand-500"
              />
            </div>

            <p className="text-[11px] text-text-muted">
              💡 This repayment will be marked as <strong className="text-amber-600 dark:text-amber-400">Pending</strong> until the group host approves and applies it to balances.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSubmitModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingPayment}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {submittingPayment ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                ) : (
                  <span>Submit to Host</span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Resubmit Repayment Modal */}
      <Modal
        isOpen={resubmitModalOpen}
        onClose={() => setResubmitModalOpen(false)}
        title="Edit & Resubmit Payment"
      >
        {resubmitPayment && (
          <form onSubmit={handleResubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
              <span className="font-bold block">Previous Rejection Reason:</span>
              <p className="mt-0.5">{resubmitPayment.rejectReason || 'No reason provided by host'}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                data-amount-input="true"
                value={resubmitAmount}
                onChange={(e) => setResubmitAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-sm font-semibold focus:outline-none focus:border-brand-500 font-mono tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  Payment Mode *
                </label>
                <select
                  value={resubmitMode}
                  onChange={(e) => setResubmitMode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-xs focus:outline-none focus:border-brand-500"
                >
                  <option value="online">Online (UPI / Bank Transfer)</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Transaction Reference / UTR
              </label>
              <input
                type="text"
                value={resubmitRef}
                onChange={(e) => setResubmitRef(e.target.value)}
                placeholder="Updated transaction ID or reference"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-xs focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Note / Clarification
              </label>
              <input
                type="text"
                value={resubmitDesc}
                onChange={(e) => setResubmitDesc(e.target.value)}
                placeholder="Add clarification for the host"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-xs focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setResubmitModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {resubmitting ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                ) : (
                  <span>Resubmit Payment</span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Full Group Bills Modal (Host Granted Visibility) */}
      <Modal
        isOpen={groupBillsModalOpen}
        onClose={() => setGroupBillsModalOpen(false)}
        title={`All Group Bills • ${activeGroupBillsProfile?.group?.name || 'Group'}`}
        size="lg"
      >
        {loadingGroupBills ? (
          <div className="py-12 flex flex-col justify-center items-center gap-3 text-xs text-text-muted">
            <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            <span>Loading group bills...</span>
          </div>
        ) : !groupBillsData ? (
          <p className="text-xs text-text-muted text-center py-8">
            Failed to load group bills.
          </p>
        ) : (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
            {/* Group Members List */}
            <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
                Group Members ({groupBillsData.members?.length || 0})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {groupBillsData.members?.map((m) => (
                  <span
                    key={m.id}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      m.isHost
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                        : 'bg-surface border-border text-text'
                    }`}
                  >
                    {m.name}
                    {m.isHost && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">(Host)</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Expenses Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-text">
                  Group Expenses ({groupBillsData.expenses?.length || 0})
                </span>
              </div>

              {groupBillsData.expenses?.length === 0 ? (
                <p className="text-xs text-text-muted italic py-4 text-center">
                  No expenses have been recorded for this group yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {groupBillsData.expenses?.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-4 rounded-xl bg-surface border border-border space-y-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-text">{exp.title}</h4>
                          <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
                            <span>{formatDate(exp.date)}</span>
                            <span>•</span>
                            <span>Paid by <strong className="text-text font-semibold">{exp.paidByName}</strong></span>
                            {exp.splitType && (
                              <>
                                <span>•</span>
                                <span className="capitalize">{exp.splitType} Split</span>
                              </>
                            )}
                          </div>
                          {exp.description && (
                            <p className="text-xs text-text-muted pt-1">{exp.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-base font-black text-brand-600 dark:text-brand-400 font-mono tabular-nums">
                            {formatINR(exp.totalAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Splits breakdown among members */}
                      <div className="pt-2 border-t border-border space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                          Splits Breakdown
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {exp.splits?.map((s, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded-lg text-xs border ${
                                s.isMine
                                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-700 dark:text-brand-300'
                                  : 'bg-surface-raised border-border text-text'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold truncate">
                                  {s.memberName} {s.isMine && '(You)'}
                                </span>
                                <span className="font-mono font-bold text-text shrink-0 tabular-nums">
                                  {formatINR(s.shareAmount)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
