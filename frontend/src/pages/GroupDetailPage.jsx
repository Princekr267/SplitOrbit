import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar.jsx';
import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import { Card } from '../components/common/Card.jsx';
import Tabs from '../components/common/Tabs.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { SkeletonCard, SkeletonStat, SkeletonRow } from '../components/common/Skeleton.jsx';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import Modal from '../components/common/Modal.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import AddPersonModal from '../components/forms/AddPersonModal.jsx';
import AddExpenseModal from '../components/forms/AddExpenseModal.jsx';
import AddPaymentModal from '../components/forms/AddPaymentModal.jsx';
import EditGroupModal from '../components/forms/EditGroupModal.jsx';
import PersonCopyDropdown from '../components/common/PersonCopyDropdown.jsx';
import PersonName from '../components/common/PersonName.jsx';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatINR, getBalanceVisuals } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import {
  Users,
  Receipt,
  ArrowLeft,
  Plus,
  CreditCard,
  BarChart3,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  IndianRupee,
  Check,
  X,
  AlertCircle,
  Share2,
  MessageCircle,
  UserCheck,
  Link2,
  Eye,
  Pencil,
  Calendar,
} from 'lucide-react';
import { m } from 'motion/react';
import { springs } from '../motion/tokens.js';
import { Stagger } from '../motion/components.jsx';
import { listItem } from '../motion/variants.js';
import AnimatedAmount from '../components/common/AnimatedAmount.jsx';
import GroupChartsSkeleton from '../components/charts/GroupChartsSkeleton.jsx';
import Sparkline from '../components/charts/Sparkline.jsx';

const GroupChartsSection = React.lazy(() => import('../components/charts/GroupChartsSection.jsx'));

export default function GroupDetailPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [group, setGroup] = useState(null);
  const [people, setPeople] = useState([]);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Analytics for interactive charts
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  // Tabs: 'people' | 'expenses' | 'payments'
  const [activeTab, setActiveTab] = useState('people');

  // Modal states
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [paymentModalDefaults, setPaymentModalDefaults] = useState({
    fromPersonId: null,
    toPersonId: null,
  });

  // Payment accept/reject states
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetPayment, setRejectTargetPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);

  // Settle confirmation dialog states
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  // Quick pre-selected member for modals
  const [selectedPersonForAction, setSelectedPersonForAction] = useState(null);

  // Preload chart chunk on idle so Analytics tab opens instantly
  useEffect(() => {
    import('../components/charts/GroupChartsSection.jsx');
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      const res = await api.get(`/groups/${groupId}/analytics`);
      if (res.success) {
        setAnalytics(res.data);
      }
    } catch (err) {
      setAnalyticsError(err.message || 'Failed to load chart analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [groupId]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      // Kick off analytics in parallel with group/expenses/payments to eliminate sequential waterfall
      const analyticsPromise = api.get(`/groups/${groupId}/analytics`).catch((err) => ({ error: err }));

      const [groupRes, expRes, payRes] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/groups/${groupId}/expenses`),
        api.get(`/groups/${groupId}/payments`),
      ]);

      if (groupRes.success) {
        setGroup(groupRes.data.group);
        setPeople(groupRes.data.people || []);
        setSummary(groupRes.data.summary || null);
        setIsHost(groupRes.data.isHost);
        if (groupRes.data.isHost || user?.role === 'admin') {
          setAnalyticsLoading(true);
          analyticsPromise.then((res) => {
            if (res?.success) {
              setAnalytics(res.data);
              setAnalyticsError(null);
            } else if (res?.error && res.error.status !== 403) {
              setAnalyticsError(res?.error?.message || 'Failed to load chart analytics');
            }
          }).finally(() => {
            setAnalyticsLoading(false);
          });
        }
      }
      if (expRes.success) {
        setExpenses(expRes.data || []);
      }
      if (payRes.success) {
        setPayments(payRes.data || []);
      }
    } catch (err) {
      setFetchError(err.message || 'Failed to load group details');
      addToast(err.message || 'Failed to load group details', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, addToast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleConfirmSettle = async () => {
    if (!summary?.isSettledReady) {
      addToast('All balances must be ₹0 before settling the group', 'error');
      return;
    }

    try {
      setSettling(true);
      await api.post(`/groups/${groupId}/settle`);
      addToast('Group has been settled and locked! 🎉', 'success');
      setSettleDialogOpen(false);
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to settle group', 'error');
    } finally {
      setSettling(false);
    }
  };

  const handleReopenGroup = async () => {
    try {
      await api.post(`/groups/${groupId}/reopen`);
      addToast('Group reopened for new entries!', 'success');
      fetchData();
    } catch (err) {
      addToast(err.message || 'Failed to reopen group', 'error');
    }
  };

  const handleAcceptPayment = async (paymentId) => {
    try {
      setAcceptingId(paymentId);
      const res = await api.post(`/groups/${groupId}/payments/${paymentId}/accept`);
      if (res.success) {
        addToast('Payment accepted and credited to ledger! 🤝', 'success');
        fetchData();
      }
    } catch (err) {
      addToast(err.message || 'Failed to accept payment', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleOpenRejectModal = (payment) => {
    setRejectTargetPayment(payment);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectPayment = async (e) => {
    e.preventDefault();
    if (!rejectTargetPayment || !rejectReason.trim()) {
      addToast('Please provide a rejection reason', 'error');
      return;
    }

    try {
      setRejecting(true);
      const res = await api.post(`/groups/${groupId}/payments/${rejectTargetPayment.id}/reject`, {
        reason: rejectReason.trim(),
      });
      if (res.success) {
        addToast('Payment rejected. Friend has been notified.', 'success');
        setRejectModalOpen(false);
        fetchData();
      }
    } catch (err) {
      addToast(err.message || 'Failed to reject payment', 'error');
    } finally {
      setRejecting(false);
    }
  };

  const openExpenseForPerson = (personId) => {
    setSelectedPersonForAction(personId);
    setIsExpenseModalOpen(true);
  };

  const openPaymentForPerson = (targetPersonId) => {
    const hostPerson = people.find((p) => p.isHost);
    const currentPerson = people.find((p) => p.linkedUserId === user?.id);

    if (!isHost && currentPerson) {
      const targetRecipient =
        targetPersonId && targetPersonId !== currentPerson.id
          ? targetPersonId
          : hostPerson?.id || people.find((p) => p.id !== currentPerson.id)?.id || null;
      setPaymentModalDefaults({
        fromPersonId: currentPerson.id,
        toPersonId: targetRecipient,
      });
    } else {
      setPaymentModalDefaults({
        fromPersonId: targetPersonId || null,
        toPersonId: hostPerson?.id || null,
      });
    }
    setIsPaymentModalOpen(true);
  };

  const handleWhatsAppQuickShare = (person) => {
    const owes = person.remainingToPay > 0;
    const isOwed = person.groupOwesYou > 0;

    const balanceLine = owes
      ? `• Balance Due: ${formatINR(person.remainingToPay)} (owes host)`
      : isOwed
      ? `• Balance: Host owes you ${formatINR(person.groupOwesYou)}`
      : `• Balance: Fully Settled (₹0.00)`;

    const text = encodeURIComponent(`SplitOrbit • ${group.name}
Statement for ${person.name}:
• Total Share: ${formatINR(person.shareSplitsTotal)}
• Paid / Repaid: ${formatINR(person.acceptedSentPaymentsTotal)}
${balanceLine}`);

    let cleanPhone = (person.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleToggleBillVisibility = async (person) => {
    if (!isHost || person.isHost) return;
    const newStatus = !person.canViewAllBills;

    // Optimistic UI update
    setPeople((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, canViewAllBills: newStatus } : p))
    );

    try {
      const res = await api.patch(
        `/groups/${groupId}/people/${person.id}/permissions`,
        { canViewAllBills: newStatus }
      );
      if (res.success) {
        addToast(
          newStatus
            ? `Granted ${person.name} card visibility in group`
            : `Set ${person.name} card to hidden from other members (default)`,
          'success'
        );
      } else {
        throw new Error(res.error?.message || 'Failed to update permission');
      }
    } catch (err) {
      // Rollback on error
      setPeople((prev) =>
        prev.map((p) => (p.id === person.id ? { ...p, canViewAllBills: !newStatus } : p))
      );
      addToast(err.message || 'Failed to update visibility permission', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-text flex flex-col transition-colors">
        <Navbar />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="w-48 h-8 bg-surface-raised rounded-xl animate-pulse" />
          <SkeletonStat count={4} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard count={4} />
          </div>
        </main>
      </div>
    );
  }

  if (fetchError && !group) {
    return (
      <div className="min-h-screen bg-background text-text flex flex-col transition-colors">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
          <ErrorState
            title="Failed to load group"
            error={fetchError}
            onRetry={fetchData}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-background text-text flex flex-col transition-colors">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <EmptyState
            icon={<AlertCircle className="w-6 h-6 text-rose-500" />}
            title="Group Not Found"
            description="The requested group does not exist or you do not have permission to view it."
            actionText="Back to Dashboard"
            onAction={() => window.location.href = '/dashboard'}
          />
        </div>
      </div>
    );
  }

  const hostPerson = people.find((p) => p.isHost);
  const currentPerson = people.find((p) => p.linkedUserId === user?.id);

  // Requirement 1: Show only his and host card by default; other friends' cards become visible when host gives them permission
  const visiblePeople = isHost
    ? people
    : people.filter((p) => p.isHost || p.id === currentPerson?.id || p.canViewAllBills);

  const tabList = [
    { id: 'people', label: 'People', icon: Users, count: visiblePeople.length },
    { id: 'expenses', label: 'Expenses', icon: Receipt, count: expenses.length },
    {
      id: 'payments',
      label: 'Payments',
      icon: CreditCard,
      count: payments.length,
      badgeAlert: Boolean(summary && summary.totalPending > 0),
    },
    ...(isHost ? [{ id: 'analytics', label: 'Analytics', icon: BarChart3 }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-text flex flex-col pb-24 sm:pb-12 transition-colors">
      <Navbar />

      {/* Sticky Compact Summary Header on Scroll */}
      <div className="sticky top-16 z-30 bg-surface/90 backdrop-blur-md border-b border-border transition-colors hidden sm:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-bold text-text truncate max-w-xs">{group.name}</h2>
            <Badge variant={group.status === 'active' ? 'active' : 'settled'} size="xs" showIcon>
              {group.status === 'active' ? 'Active' : 'Settled'}
            </Badge>
          </div>

          {summary && (
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-text-muted text-[11px] mr-1.5">Spent:</span>
                <span className="font-bold text-text font-mono tabular-nums">{formatINR(summary.totalSpent)}</span>
              </div>
              <div>
                <span className="text-text-muted text-[11px] mr-1.5">Repaid:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{formatINR(summary.totalReceived)}</span>
              </div>
              {summary.totalPending > 0 && (
                <div>
                  <span className="text-text-muted text-[11px] mr-1.5">Pending:</span>
                  <span className="font-bold text-amber-500 font-mono tabular-nums">{formatINR(summary.totalPending)}</span>
                </div>
              )}
            </div>
          )}

          {isHost && group.status === 'active' && !group.isFrozen && (
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="primary"
                onClick={() => {
                  setSelectedPersonForAction(null);
                  setIsExpenseModalOpen(true);
                }}
                iconLeft={<Plus className="w-3.5 h-3.5" />}
              >
                Expense
              </Button>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Breadcrumb & Group Info Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight">
                {group.name}
              </h1>
              {isHost && group.status === 'active' && !group.isFrozen && (
                <button
                  type="button"
                  onClick={() => setIsEditGroupModalOpen(true)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-raised transition border border-transparent hover:border-border cursor-pointer"
                  title="Edit group details"
                  aria-label="Edit group details"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <Badge
                variant={group.status === 'active' ? 'active' : 'settled'}
                size="sm"
                showIcon
              >
                {group.status === 'active' ? 'Active' : 'Settled (Locked)'}
              </Badge>
              {group.isFrozen && (
                <Badge variant="danger" size="sm">
                  🔒 Frozen by Admin
                </Badge>
              )}
            </div>
            {group.date && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDate(group.date)}</span>
              </div>
            )}
            {group.description && (
              <p className="text-xs text-text-muted max-w-2xl">{group.description}</p>
            )}
          </div>

          {/* Group-level action buttons (Requirement 2 & 3: show only authorized buttons) */}
          <div className="flex items-center gap-2 shrink-0">
            {group.status === 'active' && !group.isFrozen ? (
              <>
                {isHost && (
                  <>
                    <Button
                      onClick={() => {
                        setSelectedPersonForAction(null);
                        setIsExpenseModalOpen(true);
                      }}
                      variant="primary"
                      size="sm"
                      iconLeft={<Plus className="w-4 h-4 font-bold" />}
                    >
                      Add Expense
                    </Button>
                    <Button
                      onClick={() => setIsPersonModalOpen(true)}
                      variant="secondary"
                      size="sm"
                      iconLeft={<Users className="w-3.5 h-3.5 text-text-muted" />}
                    >
                      Add Person
                    </Button>
                    <Button
                      onClick={() => setIsEditGroupModalOpen(true)}
                      variant="secondary"
                      size="sm"
                      iconLeft={<Pencil className="w-3.5 h-3.5 text-text-muted" />}
                    >
                      Edit Group
                    </Button>
                  </>
                )}
                {!isHost && currentPerson && (
                  <Button
                    onClick={() => openPaymentForPerson(hostPerson?.id || null)}
                    variant="primary"
                    size="sm"
                    iconLeft={<CreditCard className="w-4 h-4 font-bold" />}
                  >
                    Submit Payment
                  </Button>
                )}
                {isHost && summary?.isSettledReady && (
                  <Button
                    onClick={() => setSettleDialogOpen(true)}
                    variant="success"
                    size="sm"
                    iconLeft={<Lock className="w-3.5 h-3.5" />}
                  >
                    Settle Group
                  </Button>
                )}
              </>
            ) : (
              isHost && (
                <Button
                  onClick={handleReopenGroup}
                  variant="secondary"
                  size="sm"
                  iconLeft={<Unlock className="w-3.5 h-3.5" />}
                >
                  Reopen Group
                </Button>
              )
            )}
          </div>
        </div>

        {/* Admin Frozen Dispute Lock Banner */}
        {group.isFrozen && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-xs">
            <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold">This group is frozen by an administrator</h3>
              <p className="text-xs leading-relaxed opacity-90">
                {group.frozenReason ? `Reason: "${group.frozenReason}". ` : ''}
                All expense modifications, entries, and repayments are locked pending administrator review.
              </p>
            </div>
          </div>
        )}

        {/* Ledger Summary Cards Bento */}
        {summary && (
          <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <m.div variants={listItem}>
              <Card interactive tint="neutral" className="p-4 space-y-1">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                  Total Spent
                </span>
                <span className="text-xl sm:text-2xl font-black text-text mt-1 block font-mono tabular-nums">
                  <AnimatedAmount amount={summary.totalSpent} />
                </span>
                <span className="text-[11px] text-text-muted block">
                  Across {expenses.length} recorded expenses
                </span>
              </Card>
            </m.div>

            <m.div variants={listItem}>
              <Card interactive tint="success" className="p-4 space-y-1">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Total Repaid
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block font-mono tabular-nums">
                  <AnimatedAmount amount={summary.totalReceived} />
                </span>
                <span className="text-[11px] text-text-muted block">
                  Settled to host ledger
                </span>
              </Card>
            </m.div>

            <m.div variants={listItem}>
              <Card interactive tint="warning" className="p-4 space-y-1">
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Pending Approvals
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block font-mono tabular-nums">
                  <AnimatedAmount amount={summary.totalPending} />
                </span>
                <span className="text-[11px] text-text-muted block">
                  Awaiting host review
                </span>
              </Card>
            </m.div>

            <m.div variants={listItem}>
              <Card interactive tint="neutral" className="p-4 space-y-1">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                  Host Net Balance
                </span>
                {hostPerson && (
                  <>
                    <span
                      className={`text-xl sm:text-2xl font-black mt-1 block font-mono tabular-nums ${
                        hostPerson.net > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : hostPerson.net < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-text-muted'
                      }`}
                    >
                      <AnimatedAmount amount={hostPerson.net} showSign={true} />
                    </span>
                    <span className="text-[11px] text-text-muted block truncate">
                      {hostPerson.net > 0
                        ? 'Friends owe you'
                        : hostPerson.net < 0
                        ? 'You owe the group'
                        : 'All settled'}
                    </span>
                  </>
                )}
              </Card>
            </m.div>
          </Stagger>
        )}

        {/* Repayment Progress Meter */}
        {summary && summary.totalSpent > 0 && (
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text flex items-center gap-2">
                <span>Repayment Health</span>
                <span className="text-[11px] text-text-muted">
                  ({people.filter((p) => p.net === 0).length} of {people.length} members settled)
                </span>
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {Math.min(100, Math.round((summary.totalReceived / summary.totalSpent) * 100))}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-raised overflow-hidden border border-border">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((summary.totalReceived / summary.totalSpent) * 100))}%`,
                }}
              />
            </div>
          </Card>
        )}

        {/* Pending Repayments Alert for Host */}
        {isHost && summary && summary.totalPending > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in">
            <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-300">
              <Clock className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                You have pending repayment submissions waiting for approval (
                <strong>{formatINR(summary.totalPending)}</strong>).
              </span>
            </div>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => setActiveTab('payments')}
              className="border-amber-500/40 text-amber-700 dark:text-amber-300"
            >
              Review in Payments Tab →
            </Button>
          </div>
        )}

        {/* Tab Navigation */}
        <Tabs
          tabs={tabList}
          activeTab={activeTab}
          onChange={(newTab) => setActiveTab(newTab)}
        />

        {/* TAB 1: People & Balances */}
        {activeTab === 'people' && (
          <div className="space-y-4 animate-fade-in">
            {visiblePeople.length === 0 ? (
              <EmptyState
                icon={<Users className="w-6 h-6 text-text-muted" />}
                title="No members visible"
                description={
                  isHost
                    ? "Add friends to this group to start dividing expenses and sharing statements."
                    : "No other members visible in this group."
                }
                actionText={isHost ? "Add Person" : null}
                actionIcon={isHost ? <Plus className="w-3.5 h-3.5" /> : null}
                onAction={isHost ? () => setIsPersonModalOpen(true) : undefined}
              />
            ) : (
              <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visiblePeople.map((person) => {
                  const owesMoney = person.remainingToPay > 0;
                  const isOwed = person.groupOwesYou > 0;
                  const personTint = owesMoney ? 'danger' : isOwed ? 'success' : 'neutral';
                  const initials = (person.accountName || person.name || 'U')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <m.div key={person.id} variants={listItem}>
                      <Card
                        interactive
                        tint={personTint}
                        className="flex flex-col justify-between space-y-4 h-full"
                      >
                      {/* Header with Avatar, Name, Phone and Share Dropdown */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar Circle */}
                          <div className="w-10 h-10 rounded-full bg-brand-500/10 border border-brand-500/25 flex items-center justify-center font-bold text-xs text-brand-600 dark:text-brand-400 shrink-0">
                            {initials}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <PersonName person={person} />
                              {person.isHost && (
                                <Badge variant="brand" size="xs">
                                  Host
                                </Badge>
                              )}
                              {person.linkedUserId ? (
                                <Badge variant="brand" size="xs" showIcon>
                                  Claimed
                                </Badge>
                              ) : !person.isHost ? (
                                <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                                  <Link2 className="w-3 h-3 text-text-muted" />
                                  Link ready
                                </span>
                              ) : null}
                            </div>
                            {person.phone && (
                              <span className="text-xs text-text-muted block font-mono">
                                {person.phone}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Balance display */}
                        <div className="text-right shrink-0">
                          {(() => {
                            const personSparkline = analytics?.balances?.find((b) => b.personId === person.id)?.sparkline;
                            return owesMoney ? (
                              <div className="inline-flex flex-col items-end">
                                <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 tracking-wider">
                                  Owes Host
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {personSparkline && personSparkline.length > 1 && (
                                    <Sparkline data={personSparkline} width={52} height={18} />
                                  )}
                                  <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                                    {formatINR(person.remainingToPay)}
                                  </span>
                                </div>
                              </div>
                            ) : isOwed ? (
                              <div className="inline-flex flex-col items-end">
                                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                                  Group Owes
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {personSparkline && personSparkline.length > 1 && (
                                    <Sparkline data={personSparkline} width={52} height={18} />
                                  )}
                                  <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                                    {formatINR(person.groupOwesYou)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <Badge variant="settled" size="xs" showIcon>
                                Settled ₹0.00
                              </Badge>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Financial details breakdown (Share, Paid, Repaid) */}
                      <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-surface-raised border border-border text-[11px]">
                        <div>
                          <span className="text-text-muted block text-[10px] uppercase font-semibold">Share</span>
                          <span className="text-text font-bold block mt-0.5 font-mono tabular-nums">
                            {formatINR(person.shareSplitsTotal)}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block text-[10px] uppercase font-semibold">Paid Exp</span>
                          <span className="text-text font-bold block mt-0.5 font-mono tabular-nums">
                            {formatINR(person.paidExpensesTotal)}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block text-[10px] uppercase font-semibold">Repaid</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5 font-mono tabular-nums">
                            {formatINR(person.acceptedSentPaymentsTotal)}
                          </span>
                        </div>
                      </div>

                      {/* Visibility Permission Toggle (Host Only for non-host members) */}
                      {isHost && !person.isHost && (
                        <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-surface-raised/60 border border-border text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <Eye className={`w-3.5 h-3.5 shrink-0 ${person.canViewAllBills ? 'text-brand-500' : 'text-text-muted'}`} />
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-text text-[11px] truncate">Card & bills visible to group</span>
                              <span className="text-[10px] text-text-muted truncate">
                                {person.canViewAllBills ? 'Visible to other members in group' : 'Hidden from other members (default)'}
                              </span>
                            </div>
                          </div>
                          <m.button
                            type="button"
                            role="switch"
                            whileTap={{ scale: 0.94 }}
                            transition={springs.snappy}
                            aria-checked={Boolean(person.canViewAllBills)}
                            aria-label={`Toggle visibility for ${person.name}`}
                            onClick={() => handleToggleBillVisibility(person)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                              person.canViewAllBills ? 'bg-brand-500' : 'bg-surface-raised border-border'
                            }`}
                          >
                            <m.span
                              layout
                              transition={springs.snappy}
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-xs ${
                                person.canViewAllBills ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </m.button>
                        </div>
                      )}

                      {/* Contextual Action Buttons (Requirement 2: show only authorized buttons) */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border flex-wrap">
                        {group.status === 'active' && (
                          <div className="flex items-center gap-1.5 flex-1">
                            {isHost && (
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => openExpenseForPerson(person.id)}
                              >
                                + Expense
                              </Button>
                            )}
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => openPaymentForPerson(person.id)}
                            >
                              + Payment
                            </Button>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => handleWhatsAppQuickShare(person)}
                            iconLeft={<MessageCircle className="w-3.5 h-3.5 text-emerald-500" />}
                            title="Share statement on WhatsApp"
                          >
                            WhatsApp
                          </Button>
                          <PersonCopyDropdown group={group} person={person} isHost={isHost} onDeleted={fetchData} />
                        </div>
                      </div>
                    </Card>
                  </m.div>
                );
              })}
            </Stagger>
          )}
          </div>
        )}

        {/* TAB 2: Expenses */}
        {activeTab === 'expenses' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted font-medium">
                Chronological list of group expenses
              </span>
              {isHost && group.status === 'active' && (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => {
                    setSelectedPersonForAction(null);
                    setIsExpenseModalOpen(true);
                  }}
                  iconLeft={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Expense
                </Button>
              )}
            </div>

            {expenses.length === 0 ? (
              <EmptyState
                icon={<Receipt className="w-6 h-6 text-text-muted" />}
                title="No expenses recorded"
                description={
                  isHost
                    ? "Add the first expense to begin splitting costs among group members."
                    : "No expenses recorded yet in this group."
                }
                actionText={isHost ? "Add Expense" : null}
                actionIcon={isHost ? <Plus className="w-3.5 h-3.5" /> : null}
                onAction={
                  isHost
                    ? () => {
                        setSelectedPersonForAction(null);
                        setIsExpenseModalOpen(true);
                      }
                    : undefined
                }
              />
            ) : (
              <Stagger className="space-y-3">
                {expenses.map((exp) => (
                  <m.div key={exp.id} variants={listItem}>
                    <Card
                      interactive
                      tint="brand"
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-text">{exp.title}</h4>
                          <Badge variant="info" size="xs">
                            {exp.splitType}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted">
                          Paid by{' '}
                          <span className="text-text font-medium">
                            {exp.paidByPerson?.name}
                          </span>{' '}
                          on {formatDate(exp.date)}
                        </p>
                        {exp.description && (
                          <p className="text-[11px] text-text-muted">{exp.description}</p>
                        )}
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-base font-extrabold text-text block font-mono tabular-nums">
                          {formatINR(exp.totalAmount)}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          Split with {exp.splits?.length || 0} members
                        </span>
                      </div>
                    </Card>
                  </m.div>
                ))}
              </Stagger>
            )}
          </div>
        )}

        {/* TAB 3: Payments */}
        {activeTab === 'payments' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted font-medium">
                Repayment history and submitted payments
              </span>
              {group.status === 'active' && (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => openPaymentForPerson(null)}
                  iconLeft={<Plus className="w-3.5 h-3.5" />}
                >
                  {isHost ? 'Record Payment' : 'Submit Payment'}
                </Button>
              )}
            </div>

            {payments.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="w-6 h-6 text-text-muted" />}
                title="No payments recorded"
                description={
                  isHost
                    ? "When a friend pays cash or online, record it here to credit their balance."
                    : "When you make a repayment, submit it here for host approval."
                }
                actionText={isHost ? "Record Payment" : "Submit Payment"}
                actionIcon={<Plus className="w-3.5 h-3.5" />}
                onAction={() => openPaymentForPerson(null)}
              />
            ) : (
              <Stagger className="space-y-3">
                {payments.map((pay) => {
                  const isAccepted = pay.status === 'accepted';
                  const isPending = pay.status === 'pending';
                  const isRejected = pay.status === 'rejected';
                  const payTint = isAccepted ? 'success' : isPending ? 'warning' : 'danger';

                  return (
                    <m.div key={pay.id} variants={listItem}>
                      <Card
                        interactive
                        tint={payTint}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-text">
                              {pay.fromPerson?.name} → {pay.toPerson?.name}
                            </h4>
                            <Badge
                              variant={isAccepted ? 'accepted' : isPending ? 'pending' : 'rejected'}
                              size="xs"
                              showIcon
                            >
                              {pay.status}
                            </Badge>
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                              {pay.mode}
                            </span>
                          </div>

                          <p className="text-xs text-text-muted">
                            {formatDate(pay.date)}{' '}
                            {pay.reference && (
                              <span className="text-text-muted font-mono text-[11px]">
                                • Ref: {pay.reference}
                              </span>
                            )}
                          </p>
                          {pay.description && (
                            <p className="text-[11px] text-text-muted">{pay.description}</p>
                          )}
                          {isRejected && pay.rejectReason && (
                            <p className="text-[11px] text-rose-500 dark:text-rose-400 font-medium">
                              Reason: {pay.rejectReason}
                            </p>
                          )}
                        </div>

                        <div className="text-left sm:text-right shrink-0 space-y-2">
                          <span
                            className={`text-base font-extrabold block font-mono tabular-nums ${
                              isAccepted
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isPending
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-text-muted line-through'
                            }`}
                          >
                            {formatINR(pay.amount)}
                          </span>

                          {isPending && isHost && group.status === 'active' && (
                            <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                              <Button
                                size="xs"
                                variant="success"
                                onClick={() => handleAcceptPayment(pay.id)}
                                loading={acceptingId === pay.id}
                                iconLeft={<Check className="w-3.5 h-3.5" />}
                              >
                                Accept
                              </Button>
                              <Button
                                size="xs"
                                variant="danger"
                                onClick={() => handleOpenRejectModal(pay)}
                                iconLeft={<X className="w-3.5 h-3.5" />}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    </m.div>
                  );
                })}
              </Stagger>
            )}
          </div>
        )}

        {/* TAB: Analytics (Host Only - Desktop & Mobile) */}
        {(activeTab === 'analytics' || activeTab === 'charts') && isHost && (
          <div className="space-y-4 animate-fade-in">
            <React.Suspense fallback={<GroupChartsSkeleton />}>
              <GroupChartsSection
                analytics={analytics}
                loading={analyticsLoading}
                error={analyticsError}
                onRetry={fetchAnalytics}
                isSettled={group?.status === 'settled'}
              />
            </React.Suspense>
          </div>
        )}
      </main>

      {/* Mobile Floating Action Button (FAB) - Host only */}
      {isHost && group.status === 'active' && !group.isFrozen && (
        <div className="fixed bottom-6 right-6 sm:hidden z-30 flex flex-col gap-2">
          <m.button
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.05 }}
            transition={springs.snappy}
            onClick={() => {
              setSelectedPersonForAction(null);
              setIsExpenseModalOpen(true);
            }}
            aria-label="Add Expense"
            className="w-14 h-14 rounded-full bg-brand-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-brand-500/50 hover:bg-brand-400 transition-colors cursor-pointer"
          >
            <Plus className="w-6 h-6 font-black" />
          </m.button>
        </div>
      )}

      {/* Modals & Dialogs */}
      {isHost && group && (
        <EditGroupModal
          isOpen={isEditGroupModalOpen}
          onClose={() => setIsEditGroupModalOpen(false)}
          group={group}
          onGroupUpdated={(updatedGroup) => {
            setGroup((prev) => ({ ...prev, ...updatedGroup }));
            fetchData();
          }}
        />
      )}

      <AddPersonModal
        isOpen={isPersonModalOpen}
        onClose={() => setIsPersonModalOpen(false)}
        groupId={groupId}
        onPersonAdded={() => fetchData()}
      />

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setSelectedPersonForAction(null);
        }}
        groupId={groupId}
        people={people}
        defaultPayerId={selectedPersonForAction}
        onExpenseAdded={() => fetchData()}
      />

      <AddPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedPersonForAction(null);
          setPaymentModalDefaults({ fromPersonId: null, toPersonId: null });
        }}
        groupId={groupId}
        people={isHost ? people : visiblePeople}
        expenses={expenses}
        defaultFromPersonId={paymentModalDefaults.fromPersonId || selectedPersonForAction}
        defaultToPersonId={paymentModalDefaults.toPersonId}
        isHost={isHost}
        currentPerson={currentPerson}
        onPaymentAdded={() => fetchData()}
      />

      {/* Settle Group Confirm Dialog */}
      <ConfirmDialog
        isOpen={settleDialogOpen}
        onClose={() => setSettleDialogOpen(false)}
        onConfirm={handleConfirmSettle}
        title="Settle & Lock Group?"
        description="All member balances are currently ₹0. Settling this group will lock it from further expenses or edits until reopened by the host."
        confirmText="Settle & Lock"
        variant="primary"
        loading={settling}
      />

      {/* Reject Payment Reason Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Payment"
      >
        <form onSubmit={handleRejectPayment} className="space-y-4">
          <p className="text-xs text-text-muted">
            Provide a clear reason explaining why this payment is being rejected. The friend will see this message and can correct the payment.
          </p>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Reason for Rejection *
            </label>
            <textarea
              required
              rows="3"
              placeholder="e.g. UPI transaction reference not found, incorrect amount"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRejectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={rejecting}
            >
              Reject Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
