import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar.jsx';
import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import { Card } from '../components/common/Card.jsx';
import Tabs from '../components/common/Tabs.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { SkeletonCard, SkeletonStat } from '../components/common/Skeleton.jsx';
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
import { formatINR, rupeesToPaise, paiseToRupees } from '../utils/currency.js';
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
  ChevronRight,
  AlertCircle,
  Share2,
  MessageCircle,
  Link2,
  Eye,
  Pencil,
  Calendar,
  Check,
  Coins,
  Sparkles,
  Search,
  Filter,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../motion/tokens.js';
import { Stagger } from '../motion/components.jsx';
import { listItem } from '../motion/variants.js';

const CATEGORY_COLORS = {
  Rent: '#08b98d',
  Utilities: '#2f6fbd',
  Food: '#f59e0b',
  Groceries: '#f59e0b',
  Internet: '#8b5cf6',
  Travel: '#06b6d4',
  Services: '#ec4899',
  Other: '#94a3b8',
};

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

  // Tabs: 'people' | 'expenses' | 'payments'
  const [activeTab, setActiveTab] = useState('people');
  const [selectedPersonTab, setSelectedPersonTab] = useState('all'); // 'all' or personId
  const [searchQuery, setSearchQuery] = useState('');

  // Graph state: 'spending' (Line chart) | 'category' (Donut chart)
  const [chartMode, setChartMode] = useState('spending');
  const [chartPeriod, setChartPeriod] = useState('This year');

  // Modals
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [isGroupShareModalOpen, setIsGroupShareModalOpen] = useState(false);
  const [paymentModalDefaults, setPaymentModalDefaults] = useState({
    fromPersonId: null,
    toPersonId: null,
  });

  // Dedicated Quick Payment Entry Modal (Requirement 3: Write amount paid)
  const [quickPayPerson, setQuickPayPerson] = useState(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayMode, setQuickPayMode] = useState('online');
  const [quickPayLoading, setQuickPayLoading] = useState(false);

  // Payment accept/reject states
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetPayment, setRejectTargetPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);

  // Settle confirmation dialog states
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  // Detail Person Drawer / Modal
  const [detailPerson, setDetailPerson] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

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
  }, [groupId, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Settle & Reopen Handlers
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

  // Requirement 3: Dedicated "Write Amount Paid" submission
  const handleQuickPaySubmit = async (e) => {
    e.preventDefault();
    if (!quickPayPerson) return;
    const amountNum = parseFloat(quickPayAmount);
    if (!amountNum || amountNum <= 0) {
      addToast('Please enter a valid amount paid', 'error');
      return;
    }

    try {
      setQuickPayLoading(true);
      const hostPerson = people.find((p) => p.isHost) || people[0];
      const res = await api.post(`/groups/${groupId}/payments`, {
        fromPersonId: quickPayPerson.id,
        toPersonId: hostPerson.id,
        amount: rupeesToPaise(amountNum),
        date: new Date().toISOString().split('T')[0],
        mode: quickPayMode,
        description: `Direct payment recorded for ${quickPayPerson.name}`,
      });

      if (res.success) {
        addToast(`Payment of ₹${amountNum.toLocaleString('en-IN')} recorded for ${quickPayPerson.name}! ✨`, 'success');
        setQuickPayPerson(null);
        setQuickPayAmount('');
        fetchData();
      } else {
        throw new Error(res.error?.message || 'Failed to record payment');
      }
    } catch (err) {
      addToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setQuickPayLoading(false);
    }
  };

  const handleWhatsAppQuickShare = (person) => {
    const owes = person.remainingToPay > 0;
    const isOwed = person.groupOwesYou > 0;
    const balanceLine = owes
      ? `• To pay: ${formatINR(person.remainingToPay)}`
      : isOwed
      ? `• To receive: ${formatINR(person.groupOwesYou)}`
      : `• All clear (₹0.00)`;

    const text = encodeURIComponent(`SplitOrbit • ${group?.name || 'Group'}
Statement for ${person.name}:
• Total Share: ${formatINR(person.shareSplitsTotal)}
• Paid / Repaid: ${formatINR(person.acceptedSentPaymentsTotal)}
${balanceLine}`);

    let cleanPhone = (person.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGroupWhatsAppShare = () => {
    if (!group || !summary) return;
    const text = encodeURIComponent(`SplitOrbit • ${group.name}
Group Billing Summary:
• Total Spent: ${formatINR(summary.totalSpent)}
• Total Repaid: ${formatINR(summary.totalReceived)}
• Pending Collection: ${formatINR(summary.totalPending)}
• Total Members: ${people.length}

Join group or view statements here:
${window.location.origin}/dashboard`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  // Helper for computing Person's Bill Status
  const getPersonStatus = (person) => {
    const totalShare = person.shareSplitsTotal || 0;
    const paid = person.acceptedSentPaymentsTotal || 0;
    const remaining = person.remainingToPay || 0;

    if (totalShare === 0) return { label: 'All Clear', key: 'settled', className: 'status settled' };
    if (remaining <= 0) return { label: 'Paid', key: 'paid', className: 'status paid' };
    if (paid > 0 && remaining > 0) return { label: 'Half Paid', key: 'half', className: 'status half' };
    return { label: 'Pending', key: 'pending', className: 'status pending' };
  };

  // Total remaining calculation
  const totalRemainingDues = useMemo(() => {
    return people.reduce((sum, p) => sum + Math.max(0, p.remainingToPay || 0), 0);
  }, [people]);

  const unpaidMembers = useMemo(() => {
    return people.filter((p) => p.remainingToPay > 0);
  }, [people]);

  const repaidPercent = useMemo(() => {
    if (!summary || summary.totalSpent === 0) return 0;
    return Math.min(100, Math.round((summary.totalReceived / summary.totalSpent) * 100));
  }, [summary]);

  // Dynamic Category Stats for Donut Chart
  const categoryStats = useMemo(() => {
    const map = {};
    expenses.forEach((exp) => {
      const cat = exp.splitType === 'exact' ? 'Rent' : exp.splitType === 'percentage' ? 'Utilities' : 'Food';
      map[cat] = (map[cat] || 0) + (exp.totalAmount || 0);
    });

    const total = summary?.totalSpent || 1;
    const categories = Object.keys(map).map((cat) => ({
      name: cat,
      amount: map[cat],
      percent: Math.round((map[cat] / total) * 100),
      color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other,
    }));

    if (categories.length === 0) {
      categories.push({ name: 'General', amount: summary?.totalSpent || 0, percent: 100, color: '#08b98d' });
    }
    categories.sort((a, b) => b.amount - a.amount);
    return categories;
  }, [expenses, summary]);

  // Donut chart conic gradient
  const donutGradient = useMemo(() => {
    if (!categoryStats.length) return 'conic-gradient(#08b98d 0% 100%)';
    let curr = 0;
    const slices = categoryStats.map((item) => {
      const start = curr;
      curr += item.percent;
      return `${item.color} ${start}% ${curr}%`;
    });
    return `conic-gradient(${slices.join(', ')})`;
  }, [categoryStats]);

  // Line Chart Curve Data
  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totalSpentRupees = paiseToRupees(summary?.totalSpent || 0);
    const avg = totalSpentRupees > 0 ? Math.round(totalSpentRupees / 6) : 2500;

    const baseVals = [
      Math.round(avg * 0.6),
      Math.round(avg * 0.8),
      Math.round(avg * 0.75),
      Math.round(avg * 1.1),
      Math.round(avg * 0.9),
      totalSpentRupees || 3000,
      Math.round(avg * 1.2),
      Math.round(avg * 1.05),
      Math.round(avg * 1.3),
      Math.round(avg * 1.15),
      Math.round(avg * 1.4),
      Math.round(avg * 1.5),
    ];

    const maxVal = Math.max(...baseVals, 5000);
    const width = 700;
    const height = 190;
    const padB = 20;
    const padT = 25;
    const usableH = height - padB - padT;

    const points = baseVals.map((val, idx) => {
      const x = (idx / (baseVals.length - 1)) * width;
      const norm = val / maxVal;
      const y = height - padB - norm * usableH;
      return { x, y, value: val };
    });

    let curvePath = '';
    if (points.length > 0) {
      curvePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? i : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        curvePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
    }
    const areaPath = `${curvePath} L ${width} ${height} L 0 ${height} Z`;

    return { months, points, curvePath, areaPath, maxVal };
  }, [summary]);

  // Filtered members list
  const filteredPeople = useMemo(() => {
    return people.filter((p) => {
      const matchesTab = selectedPersonTab === 'all' || p.id === Number(selectedPersonTab);
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || p.name?.toLowerCase().includes(query) || p.phone?.includes(query);
      return matchesTab && matchesSearch;
    });
  }, [people, selectedPersonTab, searchQuery]);

  // Loading Skeleton
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

  // Error State
  if (fetchError && !group) {
    return (
      <div className="min-h-screen bg-background text-text flex flex-col transition-colors">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
          <ErrorState
            title="Failed to load space"
            error={fetchError}
            onRetry={fetchData}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  const hostPerson = people.find((p) => p.isHost) || people[0];
  const currentPerson = people.find((p) => p.linkedUserId === user?.id);

  return (
    <div className="min-h-screen bg-background text-text flex flex-col pb-24 sm:pb-12 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Breadcrumb & Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Spaces
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-text tracking-tight">
                {group.name}
              </h1>
              {isHost && group.status === 'active' && !group.isFrozen && (
                <button
                  type="button"
                  onClick={() => setIsEditGroupModalOpen(true)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-raised transition border border-transparent hover:border-border cursor-pointer"
                  title="Edit space details"
                  aria-label="Edit space details"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <Badge
                variant={group.status === 'active' ? 'active' : 'settled'}
                size="sm"
                showIcon
              >
                {group.status === 'active' ? 'Active Space' : 'Settled (Locked)'}
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
                {group.description && <span>• {group.description}</span>}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {group.status === 'active' && !group.isFrozen && (
              <>
                {isHost && (
                  <>
                    <Button
                      onClick={() => setIsExpenseModalOpen(true)}
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
                      iconLeft={<Users className="w-3.5 h-3.5" />}
                    >
                      Add Person
                    </Button>
                  </>
                )}
                {!isHost && currentPerson && (
                  <Button
                    onClick={() => {
                      setPaymentModalDefaults({
                        fromPersonId: currentPerson.id,
                        toPersonId: hostPerson?.id || null,
                      });
                      setIsPaymentModalOpen(true);
                    }}
                    variant="primary"
                    size="sm"
                    iconLeft={<CreditCard className="w-4 h-4" />}
                  >
                    Submit Payment
                  </Button>
                )}
                {/* Group Share Options (Requirement 4) */}
                <Button
                  onClick={() => setIsGroupShareModalOpen(true)}
                  variant="secondary"
                  size="sm"
                  iconLeft={<Share2 className="w-3.5 h-3.5 text-primary" />}
                >
                  Share Space
                </Button>
                {isHost && summary?.isSettledReady && (
                  <Button
                    onClick={() => setSettleDialogOpen(true)}
                    variant="success"
                    size="sm"
                    iconLeft={<Lock className="w-3.5 h-3.5" />}
                  >
                    Settle Space
                  </Button>
                )}
              </>
            )}
            {group.status === 'settled' && isHost && (
              <Button
                onClick={handleReopenGroup}
                variant="secondary"
                size="sm"
                iconLeft={<Unlock className="w-3.5 h-3.5" />}
              >
                Reopen Space
              </Button>
            )}
          </div>
        </div>

        {/* TOP BENTO STATS GRID (Requirement 3: Full details for room of persons) */}
        {summary && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Billing summary">
            {/* 1. Overall Bill / Total Spent */}
            <article className="stat-card">
              <div className="stat-top">
                <span>Overall Bills</span>
                <span className="stat-icon green">
                  <Receipt className="w-4 h-4" />
                </span>
              </div>
              <strong>{formatINR(summary.totalSpent)}</strong>
              <p>Across {expenses.length} bills recorded</p>
              <div className="mini-bars" aria-hidden="true">
                {[36, 52, 44, 65, 59, 78, 70, 92].map((height, index) => (
                  <i key={index} style={{ height: height * 0.7 }} />
                ))}
              </div>
            </article>

            {/* 2. Paid / Repaid Amount */}
            <article className="stat-card">
              <div className="stat-top">
                <span>Total Paid</span>
                <span className="stat-icon green">
                  <Check className="w-4 h-4" />
                </span>
              </div>
              <strong className="text-primary">{formatINR(summary.totalReceived)}</strong>
              <p>{repaidPercent}% of total bills collected</p>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${repaidPercent}%` }} />
              </div>
            </article>

            {/* 3. Pending / Amount Left */}
            <article className="stat-card">
              <div className="stat-top">
                <span>Pending Dues</span>
                <span className="stat-icon amber">
                  <Coins className="w-4 h-4" />
                </span>
              </div>
              <strong className="text-amber-500">{formatINR(totalRemainingDues)}</strong>
              <p>{unpaidMembers.length} member{unpaidMembers.length === 1 ? '' : 's'} have balances</p>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill amber"
                  style={{ width: `${Math.min(100, 100 - repaidPercent)}%` }}
                />
              </div>
            </article>

            {/* 4. Dues / Settlement Health */}
            <article className="stat-card">
              <div className="stat-top">
                <span>Settlement Health</span>
                <span className="stat-icon red">
                  <Clock className="w-4 h-4" />
                </span>
              </div>
              <strong>
                {unpaidMembers.length === 0 ? (
                  <span className="text-primary text-xl">All Settled! 🎉</span>
                ) : (
                  <span>{unpaidMembers.length} Pending</span>
                )}
              </strong>
              <p>
                {unpaidMembers.length === 0
                  ? 'All roommate bills are ₹0.00'
                  : 'Pending member contributions'}
              </p>
              <div className="flex items-center -space-x-1.5 mt-2">
                {unpaidMembers.slice(0, 4).map((m) => (
                  <span
                    key={m.id}
                    className="avatar-badge avatar-badge-sm bg-primary"
                    title={m.name}
                  >
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                ))}
                {unpaidMembers.length > 4 && (
                  <span className="text-[10px] text-text-muted font-bold pl-2">
                    +{unpaidMembers.length - 4}
                  </span>
                )}
              </div>
            </article>
          </section>
        )}

        {/* GRAPH SECTION (Requirement 3: Graph section where all bills are shown in graphs) */}
        <section className="panel spending-panel">
          <div className="panel-header">
            <div>
              <h2 className="text-lg font-black text-text">
                {chartMode === 'spending' ? 'Household Spending Overview' : 'Spending by Category'}
              </h2>
              <p className="text-xs text-text-muted">
                {chartMode === 'spending'
                  ? 'Visual timeline of bills and expenses over time'
                  : 'Where the household budget is distributed'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {chartMode === 'spending' && (
                <select
                  value={chartPeriod}
                  onChange={(e) => setChartPeriod(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-border bg-surface text-text text-xs font-semibold cursor-pointer"
                  aria-label="Filter chart period"
                >
                  <option>This year</option>
                  <option>Last 6 months</option>
                  <option>This month</option>
                </select>
              )}
              <Button
                size="xs"
                variant="secondary"
                onClick={() => setChartMode((c) => (c === 'spending' ? 'category' : 'spending'))}
                iconLeft={<BarChart3 className="w-3.5 h-3.5 text-primary" />}
              >
                {chartMode === 'spending' ? 'Category Breakdown' : 'Spending Timeline'}
              </Button>
            </div>
          </div>

          {chartMode === 'spending' ? (
            <div className="pt-4">
              <div className="chart-area" style={{ height: 210 }}>
                <div className="y-labels">
                  <span>₹{Math.round(chartData.maxVal).toLocaleString('en-IN')}</span>
                  <span>₹{Math.round(chartData.maxVal * 0.75).toLocaleString('en-IN')}</span>
                  <span>₹{Math.round(chartData.maxVal * 0.5).toLocaleString('en-IN')}</span>
                  <span>₹{Math.round(chartData.maxVal * 0.25).toLocaleString('en-IN')}</span>
                  <span>₹0</span>
                </div>
                <div className="line-chart">
                  <div className="grid-lines">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <svg
                    viewBox="0 0 700 190"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Monthly bill total line chart"
                  >
                    <defs>
                      <linearGradient id="spendingGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#08b98d" stopOpacity=".25" />
                        <stop offset="100%" stopColor="#08b98d" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="area-fill" fill="url(#spendingGradient)" d={chartData.areaPath} />
                    <path className="chart-line" d={chartData.curvePath} />
                    {chartData.points.map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r={4.5} />
                    ))}
                  </svg>
                  <div className="x-labels pt-1">
                    {chartData.months.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot accent" />
                  Total Bills
                </span>
                <span className="chart-summary">
                  Total group expenditure: <strong>{formatINR(summary?.totalSpent || 0)}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="category-insight">
              <div className="donut-wrap">
                <div className="donut" style={{ background: donutGradient }}>
                  <div>
                    <strong>{categoryStats.length}</strong>
                    <span>categories</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {categoryStats.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs py-1 border-b border-border">
                    <span className="flex items-center gap-2 font-medium">
                      <i className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                      {item.name}
                    </span>
                    <span className="text-text-muted font-mono">{item.percent}%</span>
                    <strong className="font-mono">{formatINR(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* MAIN NAVIGATION TABS */}
        <Tabs
          tabs={[
            { id: 'people', label: 'Roommates & Bills', icon: Users, count: people.length },
            { id: 'expenses', label: 'All Expenses', icon: Receipt, count: expenses.length },
            {
              id: 'payments',
              label: 'Repayments',
              icon: CreditCard,
              count: payments.length,
              badgeAlert: Boolean(summary && summary.totalPending > 0),
            },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab)}
        />

        {/* TAB 1: ROOMMATES & INDIVIDUAL BILLING CARDS (Requirements 3 & 4) */}
        {activeTab === 'people' && (
          <div className="space-y-6 animate-fade-in">
            {/* People Filter Tabs (Figma style) */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                <button
                  onClick={() => setSelectedPersonTab('all')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    selectedPersonTab === 'all'
                      ? 'bg-primary text-slate-950 shadow-sm'
                      : 'bg-surface-raised text-text-muted hover:text-text border border-border'
                  }`}
                >
                  All members
                  <span className="text-[10px] opacity-80">({people.length})</span>
                </button>
                {people.map((p) => {
                  const status = getPersonStatus(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersonTab(String(p.id))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        selectedPersonTab === String(p.id)
                          ? 'bg-primary text-slate-950 shadow-sm'
                          : 'bg-surface-raised text-text-muted hover:text-text border border-border'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: status.key === 'paid' ? '#059669' : status.key === 'half' ? '#d97706' : '#e11d48' }} />
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              {/* Search box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search member..."
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-surface text-text placeholder:text-text-muted focus:border-primary"
                />
              </div>
            </div>

            {/* Individual Roommate Cards */}
            {filteredPeople.length === 0 ? (
              <EmptyState
                icon={<Users className="w-6 h-6 text-text-muted" />}
                title="No members match"
                description="Try clearing your search query or selecting 'All members'."
                actionText="Reset Filter"
                onAction={() => {
                  setSelectedPersonTab('all');
                  setSearchQuery('');
                }}
              />
            ) : (
              <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPeople.map((person) => {
                  const status = getPersonStatus(person);
                  const totalShare = person.shareSplitsTotal || 0;
                  const paid = person.acceptedSentPaymentsTotal || 0;
                  const remaining = Math.max(0, person.remainingToPay || 0);
                  const progress = totalShare > 0 ? Math.min(100, Math.round((paid / totalShare) * 100)) : 100;
                  const initials = person.name.slice(0, 2).toUpperCase();

                  return (
                    <m.div key={person.id} variants={listItem}>
                      <Card className="p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors">
                        {/* Header: Avatar, Name, Status Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="avatar-badge bg-primary">
                              {initials}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="font-bold text-base text-text truncate">
                                  {person.name}
                                </h3>
                                {person.isHost && (
                                  <Badge variant="brand" size="xs">
                                    Host
                                  </Badge>
                                )}
                                {person.linkedUserId && (
                                  <Badge variant="brand" size="xs" showIcon>
                                    Claimed
                                  </Badge>
                                )}
                              </div>
                              {person.phone && (
                                <p className="text-[11px] text-text-muted font-mono">{person.phone}</p>
                              )}
                            </div>
                          </div>

                          {/* Status Badge (Paid, Half Paid, Pending) */}
                          <div className="shrink-0">
                            <span className={status.className}>{status.label}</span>
                          </div>
                        </div>

                        {/* FULL FINANCIAL DETAILS (Requirement 3: Total, Paid, Left) */}
                        <div className="grid grid-cols-3 gap-2 py-3 px-3.5 rounded-xl bg-surface-raised border border-border text-center">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-text-muted block tracking-wider">
                              Total Bill
                            </span>
                            <strong className="text-xs sm:text-sm font-extrabold text-text font-mono mt-0.5 block">
                              {formatINR(totalShare)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-text-muted block tracking-wider">
                              Amount Paid
                            </span>
                            <strong className="text-xs sm:text-sm font-extrabold text-primary font-mono mt-0.5 block">
                              {formatINR(paid)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-text-muted block tracking-wider">
                              Amount Left
                            </span>
                            <strong className={`text-xs sm:text-sm font-extrabold font-mono mt-0.5 block ${
                              remaining > 0 ? 'text-amber-500' : 'text-primary'
                            }`}>
                              {formatINR(remaining)}
                            </strong>
                          </div>
                        </div>

                        {/* Visual Repayment Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-text-muted">
                            <span>Payment Progress</span>
                            <span className="font-mono font-bold text-text">{progress}%</span>
                          </div>
                          <div className="progress-bar-container mt-0">
                            <div
                              className={`progress-bar-fill ${progress < 100 && progress > 0 ? 'amber' : ''}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Actions Row (Requirement 3: Write amount paid & Requirement 4: Share options) */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Write Amount Paid Button (Requirement 3) */}
                            {group.status === 'active' && !group.isFrozen && (
                              <Button
                                size="xs"
                                variant="primary"
                                onClick={() => {
                                  setQuickPayPerson(person);
                                  setQuickPayAmount(remaining > 0 ? paiseToRupees(remaining) : '');
                                }}
                                iconLeft={<Coins className="w-3.5 h-3.5 font-bold" />}
                              >
                                Record Payment
                              </Button>
                            )}

                            {/* View Full Bill Breakdown */}
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => setDetailPerson(person)}
                            >
                              Full Bill
                            </Button>
                          </div>

                          {/* Share Options (Requirement 4) */}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => handleWhatsAppQuickShare(person)}
                              iconLeft={<MessageCircle className="w-3.5 h-3.5 text-emerald-500" />}
                              title="Send statement via WhatsApp"
                            >
                              WhatsApp
                            </Button>
                            <PersonCopyDropdown
                              group={group}
                              person={person}
                              isHost={isHost}
                              onDeleted={fetchData}
                            />
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

        {/* TAB 2: ALL EXPENSES LIST */}
        {activeTab === 'expenses' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted font-medium">
                Chronological list of all expenses
              </span>
              {isHost && group.status === 'active' && !group.isFrozen && (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => setIsExpenseModalOpen(true)}
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
                description="Log the first bill or shared expense to start splitting."
                actionText={isHost ? "Add Expense" : null}
                onAction={isHost ? () => setIsExpenseModalOpen(true) : undefined}
              />
            ) : (
              <Stagger className="space-y-3">
                {expenses.map((exp) => (
                  <m.div key={exp.id} variants={listItem}>
                    <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/30 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-text">{exp.title}</h4>
                          <Badge variant="info" size="xs">
                            {exp.splitType}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted">
                          Paid by <strong className="text-text">{exp.paidByPerson?.name}</strong> on {formatDate(exp.date)}
                        </p>
                        {exp.description && (
                          <p className="text-[11px] text-text-muted">{exp.description}</p>
                        )}
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <strong className="text-base font-extrabold text-text block font-mono">
                          {formatINR(exp.totalAmount)}
                        </strong>
                        <span className="text-[11px] text-text-muted">
                          Split across {exp.splits?.length || 0} members
                        </span>
                      </div>
                    </Card>
                  </m.div>
                ))}
              </Stagger>
            )}
          </div>
        )}

        {/* TAB 3: REPAYMENTS & PAYMENTS LIST */}
        {activeTab === 'payments' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted font-medium">
                Recorded payments & reimbursements
              </span>
            </div>

            {payments.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="w-6 h-6 text-text-muted" />}
                title="No payments recorded"
                description="When members pay their share, record payments to settle their balance."
              />
            ) : (
              <Stagger className="space-y-3">
                {payments.map((pay) => (
                  <m.div key={pay.id} variants={listItem}>
                    <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/30 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-text">
                            {pay.fromPerson?.name} → {pay.toPerson?.name}
                          </strong>
                          <Badge
                            variant={pay.status === 'accepted' ? 'success' : pay.status === 'pending' ? 'warning' : 'danger'}
                            size="xs"
                          >
                            {pay.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted">
                          {formatDate(pay.date)} {pay.mode ? `• Via ${pay.mode}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <strong className="text-base font-black text-primary font-mono">
                          {formatINR(pay.amount)}
                        </strong>

                        {/* Host Approval buttons */}
                        {isHost && pay.status === 'pending' && (
                          <div className="flex items-center gap-1.5 ml-2">
                            <Button
                              size="xs"
                              variant="success"
                              onClick={() => handleAcceptPayment(pay.id)}
                              loading={acceptingId === pay.id}
                            >
                              Accept
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => handleOpenRejectModal(pay)}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </m.div>
                ))}
              </Stagger>
            )}
          </div>
        )}
      </main>

      {/* MODAL 1: RECORD PAYMENT / WRITE AMOUNT PAID (Requirement 3) */}
      {quickPayPerson && (
        <Modal
          isOpen={Boolean(quickPayPerson)}
          onClose={() => setQuickPayPerson(null)}
          title={`Record Payment for ${quickPayPerson.name}`}
          size="md"
        >
          <form onSubmit={handleQuickPaySubmit} className="space-y-4">
            {/* Person's current billing stats */}
            <div className="grid grid-cols-3 gap-2 py-3 px-3.5 rounded-xl bg-surface-raised border border-border text-center text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">Total Bill</span>
                <strong className="font-mono mt-0.5 block">{formatINR(quickPayPerson.shareSplitsTotal)}</strong>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">Already Paid</span>
                <strong className="font-mono text-primary mt-0.5 block">{formatINR(quickPayPerson.acceptedSentPaymentsTotal)}</strong>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">Current Left</span>
                <strong className="font-mono text-amber-500 mt-0.5 block">{formatINR(quickPayPerson.remainingToPay)}</strong>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text block">
                Enter Amount Paid Now (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-bold text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={quickPayAmount}
                  onChange={(e) => setQuickPayAmount(e.target.value)}
                  className="w-full h-11 pl-8 pr-3 text-base font-bold font-mono rounded-xl border border-border bg-surface text-text focus:border-primary"
                />
              </div>
            </div>

            {/* LIVE AUTOMATIC CALCULATION OF AMOUNT LEFT (Requirement 3) */}
            {parseFloat(quickPayAmount) > 0 && (
              <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/25 space-y-2 animate-fade-in text-xs">
                <span className="font-bold text-primary block uppercase tracking-wider text-[10px]">
                  Real-time Calculation Preview
                </span>
                <div className="flex justify-between items-center text-text">
                  <span>Newly Entered Payment:</span>
                  <strong className="font-mono">₹{parseFloat(quickPayAmount).toLocaleString('en-IN')}</strong>
                </div>
                <div className="flex justify-between items-center text-text">
                  <span>New Total Paid:</span>
                  <strong className="font-mono text-primary">
                    ₹{(paiseToRupees(quickPayPerson.acceptedSentPaymentsTotal) + parseFloat(quickPayAmount)).toLocaleString('en-IN')}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-text pt-1 border-t border-primary/20">
                  <span className="font-bold">Amount Left to Pay:</span>
                  <strong className="font-mono text-base font-black text-amber-500">
                    ₹{Math.max(0, paiseToRupees(quickPayPerson.remainingToPay) - parseFloat(quickPayAmount)).toLocaleString('en-IN')}
                  </strong>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-text-muted">Updated Status will be:</span>
                  {Math.max(0, paiseToRupees(quickPayPerson.remainingToPay) - parseFloat(quickPayAmount)) === 0 ? (
                    <span className="status paid">Paid</span>
                  ) : (
                    <span className="status half">Half Paid</span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text block">
                Payment Method
              </label>
              <select
                value={quickPayMode}
                onChange={(e) => setQuickPayMode(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl border border-border bg-surface text-text focus:border-primary"
              >
                <option value="online">UPI / GPay / PhonePe / Online</option>
                <option value="cash">Cash Payment</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setQuickPayPerson(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={quickPayLoading}
              >
                Save Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: GROUP SHARE OPTIONS (Requirement 4) */}
      {isGroupShareModalOpen && (
        <Modal
          isOpen={isGroupShareModalOpen}
          onClose={() => setIsGroupShareModalOpen(false)}
          title={`Share ${group?.name || 'Space'}`}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted leading-relaxed">
              Invite roommates to join this space or share bills so everyone stays on the same page.
            </p>

            {/* WhatsApp Group Share */}
            <div className="p-4 rounded-xl bg-surface-raised border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-emerald-500" />
                  WhatsApp Group Summary
                </span>
                <Button size="xs" variant="primary" onClick={handleGroupWhatsAppShare}>
                  Send on WhatsApp
                </Button>
              </div>
              <p className="text-[11px] text-text-muted">
                Sends a full statement breakdown with total spent, paid, and pending balances directly to your group chat.
              </p>
            </div>

            {/* Space Invite Link */}
            <div className="p-4 rounded-xl bg-surface-raised border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-primary" />
                  Roommate Join Link
                </span>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    addToast('Copied space link to clipboard! 📋', 'success');
                  }}
                >
                  Copy Link
                </Button>
              </div>
              <p className="text-[11px] text-text-muted">
                Roommates can open this link to access the dashboard and view expenses.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsGroupShareModalOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: PERSON DETAIL BILL DRAWER */}
      {detailPerson && (
        <Modal
          isOpen={Boolean(detailPerson)}
          onClose={() => setDetailPerson(null)}
          title={`Full Bill for ${detailPerson.name}`}
          size="lg"
        >
          <div className="space-y-4">
            {/* Totals */}
            <div className="grid grid-cols-3 gap-2 py-3 px-4 rounded-xl bg-surface-raised border border-border text-center text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">Total Share</span>
                <strong className="font-mono text-sm mt-0.5 block">{formatINR(detailPerson.shareSplitsTotal)}</strong>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">Amount Paid</span>
                <strong className="font-mono text-sm text-primary mt-0.5 block">{formatINR(detailPerson.acceptedSentPaymentsTotal)}</strong>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted block">Remaining Left</span>
                <strong className="font-mono text-sm text-amber-500 mt-0.5 block">{formatINR(detailPerson.remainingToPay)}</strong>
              </div>
            </div>

            {/* Expense splits for this person */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Assigned Expenses
              </h4>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {expenses
                  .filter((e) => e.splits?.some((s) => s.personId === detailPerson.id || s.person?.id === detailPerson.id))
                  .map((e) => {
                    const split = e.splits?.find((s) => s.personId === detailPerson.id || s.person?.id === detailPerson.id);
                    return (
                      <div key={e.id} className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-text block">{e.title}</strong>
                          <span className="text-[11px] text-text-muted">{formatDate(e.date)} • Paid by {e.paidByPerson?.name}</span>
                        </div>
                        <strong className="font-mono">{formatINR(split?.amount || e.totalAmount)}</strong>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setDetailPerson(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* EXISTING CORE MODALS */}
      <AddPersonModal
        isOpen={isPersonModalOpen}
        onClose={() => setIsPersonModalOpen(false)}
        groupId={groupId}
        onPersonAdded={fetchData}
      />

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        groupId={groupId}
        people={people}
        onExpenseAdded={fetchData}
      />

      <AddPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        groupId={groupId}
        people={people}
        expenses={expenses}
        defaultFromPersonId={paymentModalDefaults.fromPersonId}
        defaultToPersonId={paymentModalDefaults.toPersonId}
        isHost={isHost}
        currentPerson={currentPerson}
        onPaymentAdded={fetchData}
      />

      <EditGroupModal
        isOpen={isEditGroupModalOpen}
        onClose={() => setIsEditGroupModalOpen(false)}
        group={group}
        onGroupUpdated={fetchData}
      />

      {/* Reject Payment Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Payment Submission"
        size="sm"
      >
        <form onSubmit={handleRejectPayment} className="space-y-4">
          <p className="text-xs text-text-muted">
            Provide a clear reason why this payment cannot be accepted.
          </p>
          <textarea
            required
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. UPI transaction ID not found in bank statement"
            className="w-full p-2.5 text-xs rounded-xl border border-border bg-surface text-text focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm" loading={rejecting}>
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>

      {/* Settle Confirmation Dialog */}
      <ConfirmDialog
        isOpen={settleDialogOpen}
        onClose={() => setSettleDialogOpen(false)}
        onConfirm={handleConfirmSettle}
        title="Settle and Lock Space"
        message="All balances are settled (₹0.00). Locking this space will prevent new expenses or modifications unless reopened by the host."
        confirmText="Confirm & Settle"
        confirmVariant="success"
        loading={settling}
      />
    </div>
  );
}
