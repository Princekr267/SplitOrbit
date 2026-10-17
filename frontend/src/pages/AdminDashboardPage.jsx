import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar.jsx';
import Badge from '../components/common/Badge.jsx';
import Modal from '../components/common/Modal.jsx';
import Button from '../components/common/Button.jsx';
import SensitiveActionModal from '../components/common/SensitiveActionModal.jsx';
import UserDetailDrawer from '../components/admin/UserDetailDrawer.jsx';
import GroupLedgerModal from '../components/admin/GroupLedgerModal.jsx';
import SignupsChart from '../components/admin/SignupsChart.jsx';
import IntegrityCard from '../components/admin/IntegrityCard.jsx';
import OversightTab from '../components/admin/OversightTab.jsx';
import ShareLinksTab from '../components/admin/ShareLinksTab.jsx';
import ExportModal from '../components/admin/ExportModal.jsx';
import PersonName from '../components/common/PersonName.jsx';
import AnimatedAmount from '../components/common/AnimatedAmount.jsx';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatINR } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import {
  Shield,
  ShieldCheck,
  Users,
  Layers,
  CreditCard,
  Share2,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Code,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  KeyRound,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  Settings,
  UserCog,
  LogOut,
  LogIn,
  Edit2,
  TrendingUp,
  UserPlus,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { m } from 'motion/react';
import { springs } from '../motion/tokens.js';
import { Stagger, AnimatedNumber } from '../motion/components.jsx';
import { listItem } from '../motion/variants.js';

export default function AdminDashboardPage() {
  const { user, impersonate } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Guard: Admin only
  if (user && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'resets' | 'users' | 'groups' | 'settings' | 'audit'

  // Stats
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Reset Requests Queue
  const [resetRequests, setResetRequests] = useState([]);
  const [loadingResets, setLoadingResets] = useState(false);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [resetModalRequestId, setResetModalRequestId] = useState(null);
  const [resetReason, setResetReason] = useState('');
  const [resetExpiresIn, setResetExpiresIn] = useState('1');
  const [resetAdminPassword, setResetAdminPassword] = useState('');
  const [generatingReset, setGeneratingReset] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Users Management
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [neverLoggedInFilter, setNeverLoggedInFilter] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userLimit, setUserLimit] = useState(20);
  const [userPagination, setUserPagination] = useState({ total: 0, totalPages: 1 });
  const [loadingUsers, setLoadingUsers] = useState(false);

  // User Actions State
  const [inspectedUserId, setInspectedUserId] = useState(null);
  const [editingNameUser, setEditingNameUser] = useState(null);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [updatingName, setUpdatingName] = useState(false);

  // Sensitive Action Modal State
  const [sensitiveAction, setSensitiveAction] = useState(null); // { type, title, description, confirmLabel, confirmVariant, targetId, extraData, onExecute }

  // Groups Management
  const [groupsList, setGroupsList] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupStatusFilter, setGroupStatusFilter] = useState('');
  const [groupFrozenFilter, setGroupFrozenFilter] = useState('');
  const [groupDeletedFilter, setGroupDeletedFilter] = useState('');
  const [groupPage, setGroupPage] = useState(1);
  const [groupLimit, setGroupLimit] = useState(20);
  const [groupPagination, setGroupPagination] = useState({ total: 0, totalPages: 1 });
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [inspectedGroupId, setInspectedGroupId] = useState(null);

  // System Settings
  const [settingsData, setSettingsData] = useState({
    allowRegistration: true,
    pendingAlertDays: 3,
    announcement: {
      enabled: false,
      message: '',
      level: 'info',
    },
  });
  const [loadingSettings, setLoadingSettings] = useState(false);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [auditAdminOnly, setAuditAdminOnly] = useState(false);
  const [auditRoleFilter, setAuditRoleFilter] = useState('all');
  const [auditSearchFilter, setAuditSearchFilter] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Export Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Diff Modal
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const res = await api.get('/admin/stats');
      if (res.success) {
        setStats(res.data);
      }
    } catch (err) {
      addToast(err.message || 'Failed to load system stats', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [addToast]);

  // Fetch Users (server-side pagination & filters)
  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const queryParams = new URLSearchParams();
      if (userSearch) queryParams.set('search', userSearch);
      if (userRoleFilter) queryParams.set('role', userRoleFilter);
      if (userStatusFilter) queryParams.set('status', userStatusFilter);
      if (neverLoggedInFilter) queryParams.set('neverLoggedIn', 'true');
      queryParams.set('page', String(userPage));
      queryParams.set('limit', String(userLimit));

      const res = await api.get(`/admin/users?${queryParams.toString()}`);
      if (res.success) {
        setUsersList(res.data.users || []);
        if (res.data.pagination) {
          setUserPagination(res.data.pagination);
        }
      }
    } catch (err) {
      addToast(err.message || 'Failed to load user list', 'error');
    } finally {
      setLoadingUsers(false);
    }
  }, [userSearch, userRoleFilter, userStatusFilter, neverLoggedInFilter, userPage, userLimit, addToast]);

  // Fetch Groups (server-side filters)
  const fetchGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const queryParams = new URLSearchParams();
      if (groupSearch) queryParams.set('search', groupSearch);
      if (groupStatusFilter) queryParams.set('status', groupStatusFilter);
      if (groupFrozenFilter) queryParams.set('frozen', groupFrozenFilter);
      if (groupDeletedFilter) queryParams.set('deleted', groupDeletedFilter);
      queryParams.set('page', String(groupPage));
      queryParams.set('limit', String(groupLimit));

      const res = await api.get(`/admin/groups?${queryParams.toString()}`);
      if (res.success) {
        setGroupsList(res.data.groups || []);
        if (res.data.pagination) {
          setGroupPagination(res.data.pagination);
        }
      }
    } catch (err) {
      addToast(err.message || 'Failed to load system groups', 'error');
    } finally {
      setLoadingGroups(false);
    }
  }, [groupSearch, groupStatusFilter, groupFrozenFilter, groupDeletedFilter, groupPage, groupLimit, addToast]);

  // Fetch System Settings
  const fetchSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const res = await api.get('/admin/settings');
      if (res.success) {
        setSettingsData(res.data);
      }
    } catch (err) {
      addToast(err.message || 'Failed to load system settings', 'error');
    } finally {
      setLoadingSettings(false);
    }
  }, [addToast]);

  // Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoadingAudit(true);
      const queryParams = new URLSearchParams();
      if (auditActionFilter) queryParams.set('action', auditActionFilter);
      if (auditEntityFilter) queryParams.set('entityType', auditEntityFilter);
      if (auditAdminOnly) queryParams.set('adminOnly', 'true');
      if (auditRoleFilter !== 'all') queryParams.set('actorRole', auditRoleFilter);
      if (auditSearchFilter.trim()) queryParams.set('search', auditSearchFilter.trim());

      const res = await api.get(`/admin/audit-logs?${queryParams.toString()}`);
      if (res.success) {
        setAuditLogs(res.data.logs || []);
      }
    } catch (err) {
      addToast(err.message || 'Failed to load audit trail', 'error');
    } finally {
      setLoadingAudit(false);
    }
  }, [auditActionFilter, auditEntityFilter, auditAdminOnly, auditRoleFilter, auditSearchFilter, addToast]);

  // Fetch Reset Requests Queue
  const fetchResetRequests = useCallback(async () => {
    try {
      setLoadingResets(true);
      const res = await api.get('/admin/reset-requests');
      if (res.success) {
        setResetRequests(res.data?.requests || (Array.isArray(res.data) ? res.data : []));
      }
    } catch {
      // quiet fail on background polling
    } finally {
      setLoadingResets(false);
    }
  }, []);

  // Polling: auto-refresh reset requests queue every 60s
  useEffect(() => {
    fetchResetRequests();
    const interval = setInterval(fetchResetRequests, 60000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchResetRequests]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'groups') fetchGroups();
    if (activeTab === 'settings') fetchSettings();
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'resets') fetchResetRequests();
  }, [activeTab, fetchUsers, fetchGroups, fetchSettings, fetchAuditLogs, fetchResetRequests]);

  // Dismiss a reset request
  const handleDismissRequest = async (requestId) => {
    try {
      const res = await api.post(`/admin/reset-requests/${requestId}/dismiss`);
      if (res.success) {
        addToast('Reset request dismissed', 'success');
        fetchResetRequests();
      }
    } catch (err) {
      addToast(err.message || 'Failed to dismiss request', 'error');
    }
  };

  // Open Reset Credential Modal
  const handleOpenResetModal = (targetUser, requestId = null) => {
    setResetModalUser(targetUser);
    setResetModalRequestId(requestId);
    setResetReason('');
    setResetExpiresIn('1');
    setResetAdminPassword('');
    setResetResult(null);
  };

  const handleCloseResetModal = () => {
    setResetModalUser(null);
    setResetModalRequestId(null);
    setResetResult(null);
  };

  // Generate Reset Credential
  const handleGenerateReset = async (e) => {
    e.preventDefault();
    if (!resetReason || resetReason.trim().length < 3) {
      addToast('Reason must be at least 3 characters', 'error');
      return;
    }
    if (!resetAdminPassword) {
      addToast('Administrator password confirmation is required', 'error');
      return;
    }

    try {
      setGeneratingReset(true);
      const targetId = resetModalUser.id || resetModalUser.userId;
      const res = await api.post(`/admin/users/${targetId}/reset-credential`, {
        reason: resetReason.trim(),
        expiresInHours: parseInt(resetExpiresIn, 10) || 1,
        currentPassword: resetAdminPassword,
        requestId: resetModalRequestId || undefined,
      });

      if (res.success) {
        setResetResult(res.data);
        addToast('Reset credential generated successfully! 🔑', 'success');
        fetchResetRequests();
        if (activeTab === 'users') fetchUsers();
      }
    } catch (err) {
      addToast(err.message || 'Failed to generate reset credential', 'error');
    } finally {
      setGeneratingReset(false);
    }
  };

  const handleCopyField = async (field, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      addToast(`Copied ${field} to clipboard! 📋`, 'success');
    } catch {
      addToast('Failed to copy', 'error');
    }
  };

  // USER ACTION HANDLERS WITH SENSITIVE MODAL
  const triggerToggleUserStatus = (u) => {
    setSensitiveAction({
      type: 'toggle_user',
      title: u.isActive ? `Disable Account @${u.username}` : `Activate Account @${u.username}`,
      description: u.isActive
        ? 'Disabling this account will immediately revoke all active login sessions and prevent signing in.'
        : 'Activating this account will allow the user to log in again.',
      confirmLabel: u.isActive ? 'Disable User' : 'Activate User',
      confirmVariant: u.isActive ? 'danger' : 'primary',
      onExecute: async ({ reason, currentPassword }) => {
        const res = await api.patch(`/admin/users/${u.id}/status`, {
          isActive: !u.isActive,
          reason,
          currentPassword,
        });
        if (res.success) {
          addToast(res.message || 'User status updated', 'success');
          fetchUsers();
          fetchStats();
        }
      },
    });
  };

  const triggerChangeUserRole = (u) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    setSensitiveAction({
      type: 'change_role',
      title: `Change Role for @${u.username}`,
      description:
        newRole === 'admin'
          ? 'Promoting to Administrator grants full control over users, groups, and settings. All existing recovery codes for this user will be deleted.'
          : 'Demoting to standard User removes administrative privileges immediately.',
      confirmLabel: newRole === 'admin' ? 'Promote to Admin' : 'Demote to User',
      confirmVariant: newRole === 'admin' ? 'warning' : 'danger',
      onExecute: async ({ reason, currentPassword }) => {
        const res = await api.patch(`/admin/users/${u.id}/role`, {
          role: newRole,
          reason,
          currentPassword,
        });
        if (res.success) {
          addToast(res.message || 'User role updated', 'success');
          fetchUsers();
        }
      },
    });
  };

  const triggerForceSignOut = (u) => {
    setSensitiveAction({
      type: 'force_sign_out',
      title: `Force Sign-Out @${u.username}`,
      description: 'This will invalidate all current JWT sessions and tokens immediately across all devices.',
      confirmLabel: 'Force Sign Out',
      confirmVariant: 'danger',
      onExecute: async ({ reason, currentPassword }) => {
        const res = await api.post(`/admin/users/${u.id}/force-sign-out`, {
          reason,
          currentPassword,
        });
        if (res.success) {
          addToast(res.message || 'User sessions invalidated', 'success');
        }
      },
    });
  };

  const triggerImpersonateUser = (u) => {
    setSensitiveAction({
      type: 'impersonate_user',
      title: `Access Account: ${u.name} (@${u.username})`,
      description: `You are about to log in as ${u.name} (@${u.username}). You will have full host and member access to view and manage their groups, expenses, and account settings. You can exit back to your administrator account at any time using the top banner.`,
      confirmLabel: 'Access Account',
      confirmVariant: 'primary',
      onExecute: async ({ reason, currentPassword }) => {
        const payload = await impersonate(u.id, { reason, currentPassword });
        if (payload?.user || payload?.token) {
          addToast(`Now accessing SplitOrbit as ${u.name}`, 'success');
          navigate('/dashboard');
        }
      },
    });
  };

  const handleUpdateDisplayName = async (e) => {
    e.preventDefault();
    if (!editingNameUser || !newDisplayName.trim()) return;

    try {
      setUpdatingName(true);
      const res = await api.patch(`/admin/users/${editingNameUser.id}/name`, {
        name: newDisplayName.trim(),
      });
      if (res.success) {
        addToast('Display name updated successfully', 'success');
        setEditingNameUser(null);
        fetchUsers();
      }
    } catch (err) {
      addToast(err.message || 'Failed to update name', 'error');
    } finally {
      setUpdatingName(false);
    }
  };

  // GROUP ACTION HANDLERS WITH SENSITIVE MODAL
  const triggerFreezeGroup = (g) => {
    const isFrozen = g.isFrozen;
    setSensitiveAction({
      type: isFrozen ? 'unfreeze_group' : 'freeze_group',
      title: isFrozen ? `Unfreeze Group "${g.name}"` : `Freeze Dispute Lock for "${g.name}"`,
      description: isFrozen
        ? 'Unfreezing will restore ability for members and hosts to record expenses and repayments.'
        : 'Freezing this group locks all expenses, repayments, and modifications with a 409 error until unlocked.',
      confirmLabel: isFrozen ? 'Unfreeze Group' : 'Freeze Group (Lock)',
      confirmVariant: isFrozen ? 'primary' : 'danger',
      onExecute: async ({ reason, currentPassword }) => {
        const endpoint = isFrozen ? `/admin/groups/${g.id}/unfreeze` : `/admin/groups/${g.id}/freeze`;
        const res = await api.post(endpoint, { reason, currentPassword });
        if (res.success) {
          addToast(res.message || 'Group status updated', 'success');
          fetchGroups();
          fetchStats();
        }
      },
    });
  };

  const triggerReopenGroup = (g) => {
    setSensitiveAction({
      type: 'reopen_group',
      title: `Reopen Settled Group "${g.name}"`,
      description: 'Reopening this settled group allows members to record additional expenses and repayments.',
      confirmLabel: 'Reopen Group',
      confirmVariant: 'warning',
      onExecute: async ({ reason, currentPassword }) => {
        const res = await api.post(`/admin/groups/${g.id}/reopen`, { reason, currentPassword });
        if (res.success) {
          addToast(res.message || 'Group reopened', 'success');
          fetchGroups();
          fetchStats();
        }
      },
    });
  };

  const triggerRestoreGroup = (g) => {
    setSensitiveAction({
      type: 'restore_group',
      title: `Restore Soft-Deleted Group "${g.name}"`,
      description: 'Restores this group to active state, making it accessible to members again.',
      confirmLabel: 'Restore Group',
      confirmVariant: 'primary',
      onExecute: async ({ reason, currentPassword }) => {
        const res = await api.post(`/admin/groups/${g.id}/restore`, { reason, currentPassword });
        if (res.success) {
          addToast(res.message || 'Group restored', 'success');
          fetchGroups();
          fetchStats();
        }
      },
    });
  };

  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const triggerTransferHost = (g) => {
    setTransferTargetUserId('');
    setSensitiveAction({
      type: 'transfer_host',
      title: `Transfer Host Ownership of "${g.name}"`,
      description:
        'Atomically transfers group ownership and the host person row to another registered user. The target user cannot already be linked to a member in this group.',
      confirmLabel: 'Transfer Ownership',
      confirmVariant: 'warning',
      extraContent: (
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-text">
            Target User ID (UUID) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            value={transferTargetUserId}
            onChange={(e) => setTransferTargetUserId(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
          />
        </div>
      ),
      onExecute: async ({ reason, currentPassword }) => {
        if (!transferTargetUserId.trim()) {
          throw new Error('Please enter the target user ID.');
        }
        const res = await api.post(`/admin/groups/${g.id}/transfer-host`, {
          newHostUserId: transferTargetUserId.trim(),
          reason,
          currentPassword,
        });
        if (res.success) {
          addToast(res.message || 'Host ownership transferred successfully', 'success');
          fetchGroups();
        }
      },
    });
  };

  // SYSTEM SETTINGS SAVE HANDLER
  const handleSaveSettings = () => {
    setSensitiveAction({
      type: 'save_settings',
      title: 'Confirm System Settings Update',
      description:
        'Changes to system settings take effect immediately platform-wide and will be recorded in audit logs.',
      confirmLabel: 'Save Settings',
      confirmVariant: 'primary',
      onExecute: async ({ reason, currentPassword }) => {
        const res = await api.put('/admin/settings', {
          settings: {
            allowRegistration: Boolean(settingsData.allowRegistration),
            pendingAlertDays: parseInt(settingsData.pendingAlertDays, 10) || 3,
            announcement: {
              enabled: Boolean(settingsData.announcement?.enabled),
              message: String(settingsData.announcement?.message || '').trim(),
              level: settingsData.announcement?.level === 'warning' ? 'warning' : 'info',
            },
          },
          reason,
          currentPassword,
        });
        if (res.success) {
          setSettingsData(res.data);
          addToast('System settings saved successfully! ⚙️', 'success');
        }
      },
    });
  };

  const handleOpenDiff = (log) => {
    setSelectedAuditLog(log);
    setDiffModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-text flex flex-col pb-16 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-text tracking-tight">
                Admin Control Center
              </h1>
              <Badge variant="warning" size="xs">
                Platform Admin
              </Badge>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Platform governance, user credentials, group oversight, and system settings.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-surface-raised border border-border text-text transition shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-brand-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => {
                fetchStats();
                fetchResetRequests();
                if (activeTab === 'users') fetchUsers();
                if (activeTab === 'groups') fetchGroups();
                if (activeTab === 'settings') fetchSettings();
                if (activeTab === 'audit') fetchAuditLogs();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-surface-raised border border-border text-text transition shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh All</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-border flex items-center gap-6 overflow-x-auto no-scrollbar relative">
          {[
            { id: 'overview', label: 'Overview & Volume', icon: Shield },
            { id: 'resets', label: 'Reset Requests', icon: KeyRound, badge: resetRequests.length },
            { id: 'users', label: 'User Governance', icon: Users },
            { id: 'groups', label: 'Groups Oversight', icon: Layers },
            { id: 'oversight', label: 'Payments & Expenses', icon: CreditCard },
            { id: 'links', label: 'Share Links & Invites', icon: Share2 },
            { id: 'integrity', label: 'Data Integrity', icon: ShieldCheck },
            { id: 'settings', label: 'System Settings', icon: Settings },
            { id: 'audit', label: 'Audit Trail', icon: FileText },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <m.button
                key={tab.id}
                whileTap={{ scale: 0.96 }}
                transition={springs.snappy}
                onClick={() => setActiveTab(tab.id)}
                className={`relative pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
                  isActive ? 'text-text' : 'text-text-muted hover:text-text'
                }`}
              >
                <m.div
                  animate={{ scale: isActive ? 1.08 : 1 }}
                  transition={springs.snappy}
                  className="flex items-center"
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-500' : 'text-text-muted'}`} />
                </m.div>
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 shrink-0">
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <m.div
                    layoutId="admin-active-tab-indicator"
                    transition={springs.smooth}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full"
                  />
                )}
              </m.button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW & VOLUME */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {loadingStats ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-text-muted">
                <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <span>Aggregating platform health metrics...</span>
              </div>
            ) : stats ? (
              <>
                {/* Metrics Grid */}
                <Stagger className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Total Users */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Total Users</span>
                        <Users className="w-4 h-4 text-brand-500" />
                      </div>
                      <div className="text-2xl font-black text-text tabular-nums">
                        <AnimatedNumber value={stats.overview?.totalUsers || stats.users.total} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        +{stats.overview?.newUsers7Days || 0} in 7d • +{stats.overview?.newUsers30Days || 0} in 30d
                      </span>
                    </div>
                  </m.div>

                  {/* Active Groups */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Active Groups</span>
                        <Layers className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="text-2xl font-black text-text tabular-nums">
                        <AnimatedNumber value={stats.overview?.activeGroups || stats.groups.active} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        {stats.groups.settled || 0} settled • {stats.groups.frozen || 0} frozen
                      </span>
                    </div>
                  </m.div>

                  {/* Total Tracked Volume */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Total Tracked</span>
                        <CreditCard className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="text-2xl font-black text-text tabular-nums truncate">
                        <AnimatedAmount amountPaise={stats.overview?.totalTracked || stats.expenses.volume} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        {stats.expenses.count} total expenses
                      </span>
                    </div>
                  </m.div>

                  {/* Total Pending Volume */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Total Pending</span>
                        <Clock className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums truncate">
                        <AnimatedAmount amountPaise={stats.overview?.totalPending || stats.payments.pendingVolume} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        {stats.payments.pendingCount} pending repayments
                      </span>
                    </div>
                  </m.div>

                  {/* Pending Older Than Alert Threshold */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Pending &gt; {stats.overview?.pendingAlertDays || 3}d</span>
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="text-2xl font-black text-orange-600 dark:text-orange-400 tabular-nums truncate">
                        <AnimatedAmount amountPaise={stats.overview?.pendingOlderVolume || 0} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        {stats.overview?.pendingOlderCount || 0} overdue payments
                      </span>
                    </div>
                  </m.div>

                  {/* Voided Records */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Voided Records</span>
                        <XCircle className="w-4 h-4 text-rose-500" />
                      </div>
                      <div className="text-2xl font-black text-text tabular-nums">
                        <AnimatedNumber value={stats.overview?.voidedRecords || 0} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        Deleted/rejected entries
                      </span>
                    </div>
                  </m.div>

                  {/* Open Reset Requests */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Reset Requests</span>
                        <KeyRound className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="text-2xl font-black text-text tabular-nums">
                        <AnimatedNumber value={stats.overview?.openResetRequests || resetRequests.length} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        Awaiting administrator action
                      </span>
                    </div>
                  </m.div>

                  {/* Admin Actions Today */}
                  <m.div variants={listItem}>
                    <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Admin Actions Today</span>
                        <Shield className="w-4 h-4 text-brand-500" />
                      </div>
                      <div className="text-2xl font-black text-text tabular-nums">
                        <AnimatedNumber value={stats.overview?.adminActionsToday || 0} />
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        Logged in audit ledger
                      </span>
                    </div>
                  </m.div>
                </Stagger>

                {/* Signups Per Day Chart */}
                <div className="p-5 rounded-2xl bg-surface border border-border space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-text flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-brand-500" />
                        <span>Daily User Registrations (Last 14 Days)</span>
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        Lightweight SVG trend of new account signups.
                      </p>
                    </div>
                  </div>
                  <SignupsChart data={stats.signupsPerDay || []} />
                </div>

                {/* Recent Activity */}
                <div className="p-5 rounded-2xl bg-surface border border-border space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text">Recent Platform Actions</h3>
                    <button
                      onClick={() => setActiveTab('audit')}
                      className="text-xs text-brand-600 dark:text-brand-400 font-bold hover:underline cursor-pointer"
                    >
                      View All Logs &rarr;
                    </button>
                  </div>

                  <div className="space-y-2">
                    {stats.recentActivity?.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Badge variant="neutral" size="xs" className="shrink-0">
                            {act.action}
                          </Badge>
                          <span className="font-medium text-text truncate">
                            {act.actorName} ({act.actorRole})
                          </span>
                          {act.reason && (
                            <span className="text-text-muted italic truncate min-w-0 max-w-[96px] sm:max-w-xs">
                              &ldquo;{act.reason}&rdquo;
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted shrink-0">
                          {formatDate(act.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Database Integrity Health */}
                <IntegrityCard
                  onSelectGroup={(gid) => {
                    setGroupSearch(gid);
                    setActiveTab('groups');
                  }}
                />
              </>
            ) : null}
          </div>
        )}

        {/* TAB 2: RESET REQUESTS QUEUE */}
        {activeTab === 'resets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text">Open Password Reset Requests</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Users who cannot sign in and have submitted a request for administrator assistance.
                </p>
              </div>
              <Badge variant={resetRequests.length > 0 ? 'warning' : 'neutral'} size="sm">
                {resetRequests.length} Open
              </Badge>
            </div>

            {loadingResets ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <span>Checking reset requests queue...</span>
              </div>
            ) : resetRequests.length === 0 ? (
              <div className="p-8 rounded-2xl bg-surface border border-border text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-text">No pending reset requests</h3>
                <p className="text-xs text-text-muted max-w-md mx-auto">
                  All users are either logged in or have had their credentials addressed.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {resetRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
                          {req.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-text text-xs">{req.name}</span>
                            <span className="text-[11px] font-mono text-brand-600 dark:text-brand-400 font-semibold">@{req.username}</span>
                          </div>
                          <span className="text-[11px] text-text-muted">
                            Submitted: {formatDate(req.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => handleOpenResetModal(req, req.id)}
                          iconLeft={<KeyRound className="w-3.5 h-3.5" />}
                        >
                          Generate Credential
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleDismissRequest(req.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>

                    {req.note && (
                      <div className="p-2.5 rounded-xl bg-surface-raised border border-border text-xs text-text-muted flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-text-muted shrink-0" />
                        <span className="italic">&ldquo;{req.note}&rdquo;</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-[11px] text-text-muted flex-wrap">
                      <span>Email: <strong>{req.email || 'None'}</strong></span>
                      <span>Phone: <strong>{req.phone || 'None'}</strong></span>
                      <span>Groups Hosted: <strong>{req.groupsHosted || 0}</strong></span>
                      <span>Linked Profiles: <strong>{req.groupsLinked || 0}</strong></span>
                      <span>Last Login: <strong>{req.lastLoginAt ? formatDate(req.lastLoginAt) : 'Never'}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: USER GOVERNANCE */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Search and Filters Bar */}
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    placeholder="Search by full name or @username..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={userRoleFilter}
                    onChange={(e) => {
                      setUserRoleFilter(e.target.value);
                      setUserPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </select>

                  <select
                    value={userStatusFilter}
                    onChange={(e) => {
                      setUserStatusFilter(e.target.value);
                      setUserPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>

                  <label className="flex items-center gap-1.5 text-xs text-text-muted px-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={neverLoggedInFilter}
                      onChange={(e) => {
                        setNeverLoggedInFilter(e.target.checked);
                        setUserPage(1);
                      }}
                      className="rounded text-brand-500 focus:ring-brand-500 cursor-pointer"
                    />
                    <span>Never logged in</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Users Table / List */}
            {loadingUsers ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <span>Loading users catalog...</span>
              </div>
            ) : usersList.length === 0 ? (
              <div className="p-8 rounded-2xl bg-surface border border-border text-center text-xs text-text-muted">
                No users found matching current filters.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  <div className="col-span-4">User Identity</div>
                  <div className="col-span-2">Role & Status</div>
                  <div className="col-span-2">Groups / Linked</div>
                  <div className="col-span-2">Last Login</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {usersList.map((u) => (
                  <div
                    key={u.id}
                    className="p-3.5 rounded-xl bg-surface border border-border shadow-xs flex flex-col lg:grid lg:grid-cols-12 gap-3 items-start lg:items-center text-xs"
                  >
                    <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 font-bold flex items-center justify-center text-xs shrink-0">
                        {u.name?.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0">
                        <button
                          onClick={() => setInspectedUserId(u.id)}
                          className="text-left block truncate cursor-pointer transition group"
                          title="Click to view full user details"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-text group-hover:text-brand-500 transition-colors truncate">
                              {u.name}
                            </span>
                            <span className="text-[11px] font-mono text-brand-600 dark:text-brand-400 font-semibold shrink-0">
                              @{u.username}
                            </span>
                          </div>
                        </button>
                        <span className="text-[10px] text-text-muted block truncate mt-0.5">
                          {u.email ? u.email : (u.phone ? `Phone: ${u.phone}` : 'No email attached')}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-2 flex flex-col items-start gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={u.role === 'admin' ? 'warning' : 'neutral'} size="xs">
                          {u.role}
                        </Badge>
                        <Badge variant={u.isActive ? 'active' : 'danger'} size="xs">
                          {u.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      {!u.isActive && u.deactivatedReason && (
                        <span className="text-[10px] text-rose-500 italic block leading-tight truncate max-w-[140px]" title={u.deactivatedReason}>
                          &ldquo;{u.deactivatedReason}&rdquo;
                        </span>
                      )}
                    </div>

                    <div className="col-span-2 text-text-muted text-[11px]">
                      <span>{u.groupsHosted || 0} hosted • {u.groupsLinked || 0} linked</span>
                    </div>

                    <div className="col-span-2 text-text-muted text-[11px]">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : <em className="opacity-70">Never</em>}
                    </div>

                    <div className="col-span-2 flex items-center justify-end gap-1.5 w-full lg:w-auto flex-wrap">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setInspectedUserId(u.id)}
                        title="View account drawer"
                      >
                        Inspect
                      </Button>

                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setEditingNameUser(u);
                          setNewDisplayName(u.name);
                        }}
                        title="Edit display name"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>

                      {u.role !== 'admin' && (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => handleOpenResetModal(u)}
                          title="Generate reset credentials"
                        >
                          <KeyRound className="w-3 h-3 text-purple-500" />
                        </Button>
                      )}

                      {u.id !== user.id && (
                        <>
                          {u.isActive && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => triggerImpersonateUser(u)}
                              title={`Log in as ${u.name} (@${u.username})`}
                              className="text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                            >
                              <LogIn className="w-3 h-3 text-purple-500" />
                            </Button>
                          )}

                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => triggerChangeUserRole(u)}
                            title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                          >
                            <Shield className="w-3 h-3 text-amber-500" />
                          </Button>

                          <Button
                            size="xs"
                            variant={u.isActive ? 'ghost' : 'success'}
                            onClick={() => triggerToggleUserStatus(u)}
                            title={u.isActive ? 'Disable account' : 'Enable account'}
                          >
                            {u.isActive ? (
                              <UserX className="w-3 h-3 text-rose-500" />
                            ) : (
                              <UserCheck className="w-3 h-3 text-emerald-500" />
                            )}
                          </Button>
                        </>
                      )}

                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => triggerForceSignOut(u)}
                        title="Force sign-out all sessions"
                      >
                        <LogOut className="w-3 h-3 text-text-muted" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {userPagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-border text-xs text-text-muted">
                <span>
                  Showing {usersList.length} of {userPagination.total} users
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={userPage <= 1}
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    iconLeft={<ChevronLeft className="w-3.5 h-3.5" />}
                  >
                    Previous
                  </Button>
                  <span className="font-semibold text-text">
                    Page {userPage} of {userPagination.totalPages}
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={userPage >= userPagination.totalPages}
                    onClick={() => setUserPage((p) => p + 1)}
                    iconRight={<ChevronRight className="w-3.5 h-3.5" />}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: GROUPS OVERSIGHT */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            {/* Search and Filters Bar */}
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => {
                      setGroupSearch(e.target.value);
                      setGroupPage(1);
                    }}
                    placeholder="Search by group title..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={groupStatusFilter}
                    onChange={(e) => {
                      setGroupStatusFilter(e.target.value);
                      setGroupPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="settled">Settled</option>
                  </select>

                  <select
                    value={groupFrozenFilter}
                    onChange={(e) => {
                      setGroupFrozenFilter(e.target.value);
                      setGroupPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="">All Locks</option>
                    <option value="true">Frozen (Locked)</option>
                    <option value="false">Unfrozen</option>
                  </select>

                  <select
                    value={groupDeletedFilter}
                    onChange={(e) => {
                      setGroupDeletedFilter(e.target.value);
                      setGroupPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="">All Lifecycles</option>
                    <option value="false">Active Only</option>
                    <option value="true">Deleted Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Groups Table / List */}
            {loadingGroups ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <span>Loading groups directory...</span>
              </div>
            ) : groupsList.length === 0 ? (
              <div className="p-8 rounded-2xl bg-surface border border-border text-center text-xs text-text-muted">
                No groups found matching current filters.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  <div className="col-span-4">Group Name & Host</div>
                  <div className="col-span-2">Status & Lock</div>
                  <div className="col-span-3">Members & Total Spent</div>
                  <div className="col-span-3 text-right">Actions</div>
                </div>

                {groupsList.map((g) => (
                  <div
                    key={g.id}
                    className="p-3.5 rounded-xl bg-surface border border-border shadow-xs flex flex-col lg:grid lg:grid-cols-12 gap-3 items-start lg:items-center text-xs"
                  >
                    <div className="col-span-4 min-w-0">
                      <button
                        onClick={() => setInspectedGroupId(g.id)}
                        className="font-bold text-text hover:text-brand-500 text-left block truncate cursor-pointer transition"
                      >
                        {g.name}
                      </button>
                      <span className="text-[10px] text-text-muted block">
                        Host: {g.hostName} (@{g.hostUsername})
                      </span>
                    </div>

                    <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                      <Badge variant={g.status === 'active' ? 'active' : 'settled'} size="xs">
                        {g.status}
                      </Badge>
                      {g.isFrozen && (
                        <div className="flex flex-col">
                          <Badge variant="danger" size="xs">
                            🔒 Frozen
                          </Badge>
                          {g.frozenReason && (
                            <span className="text-[10px] text-amber-500 italic block leading-tight truncate max-w-[140px] mt-0.5" title={g.frozenReason}>
                              &ldquo;{g.frozenReason}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                      {g.isDeleted && (
                        <Badge variant="neutral" size="xs">
                          🗑️ Deleted
                        </Badge>
                      )}
                    </div>

                    <div className="col-span-3 text-text-muted text-[11px]">
                      <span>{g.memberCount || 0} members • </span>
                      <strong className="text-text font-mono">
                        <AnimatedAmount amountPaise={g.totalSpent || 0} />
                      </strong>
                    </div>

                    <div className="col-span-3 flex items-center justify-end gap-1.5 w-full lg:w-auto flex-wrap">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setInspectedGroupId(g.id)}
                        title="View full group ledger"
                      >
                        Ledger
                      </Button>

                      <Button
                        size="xs"
                        variant={g.isFrozen ? 'success' : 'ghost'}
                        onClick={() => triggerFreezeGroup(g)}
                        title={g.isFrozen ? 'Unfreeze group' : 'Freeze group with dispute lock'}
                      >
                        {g.isFrozen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3 text-amber-500" />}
                      </Button>

                      {g.status === 'settled' && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => triggerReopenGroup(g)}
                          title="Reopen settled group"
                        >
                          Reopen
                        </Button>
                      )}

                      {g.isDeleted && (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => triggerRestoreGroup(g)}
                          title="Restore deleted group"
                        >
                          Restore
                        </Button>
                      )}

                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => triggerTransferHost(g)}
                        title="Transfer host ownership"
                      >
                        <ArrowLeftRight className="w-3 h-3 text-brand-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {groupPagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-border text-xs text-text-muted">
                <span>
                  Showing {groupsList.length} of {groupPagination.total} groups
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={groupPage <= 1}
                    onClick={() => setGroupPage((p) => Math.max(1, p - 1))}
                    iconLeft={<ChevronLeft className="w-3.5 h-3.5" />}
                  >
                    Previous
                  </Button>
                  <span className="font-semibold text-text">
                    Page {groupPage} of {groupPagination.totalPages}
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={groupPage >= groupPagination.totalPages}
                    onClick={() => setGroupPage((p) => p + 1)}
                    iconRight={<ChevronRight className="w-3.5 h-3.5" />}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: PAYMENTS & EXPENSES OVERSIGHT */}
        {activeTab === 'oversight' && <OversightTab />}

        {/* TAB: SHARE LINKS & INVITES */}
        {activeTab === 'links' && <ShareLinksTab />}

        {/* TAB: DATA INTEGRITY CHECKER */}
        {activeTab === 'integrity' && (
          <div className="space-y-6">
            <IntegrityCard
              onSelectGroup={(gid) => {
                setGroupSearch(gid);
                setActiveTab('groups');
              }}
            />
          </div>
        )}

        {/* TAB 5: SYSTEM SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-base font-bold text-text">System Configuration & Policies</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Global platform behavior, registration gates, and announcement broadcasts.
              </p>
            </div>

            {loadingSettings ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <span>Loading system settings...</span>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-surface border border-border shadow-xs space-y-6">
                {/* allowRegistration */}
                <div className="flex items-start justify-between gap-4 pb-5 border-b border-border">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-text block">Self-Registration Gate</span>
                    <p className="text-xs text-text-muted leading-relaxed">
                      When turned off, general user signup is closed. Only users with valid, unexpired group invitation codes may register.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={settingsData.allowRegistration}
                      onChange={(e) =>
                        setSettingsData({ ...settingsData, allowRegistration: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-raised border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
                  </label>
                </div>

                {/* pendingAlertDays */}
                <div className="space-y-1.5 pb-5 border-b border-border">
                  <label className="text-sm font-bold text-text block">
                    Pending Payment Alert Threshold (Days)
                  </label>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">
                    Pending repayments older than this threshold (1 to 30 days) will be flagged on the admin dashboard as overdue.
                  </p>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settingsData.pendingAlertDays}
                    onChange={(e) =>
                      setSettingsData({
                        ...settingsData,
                        pendingAlertDays: Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)),
                      })
                    }
                    className="w-32 px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text font-bold focus:outline-none focus:border-brand-500 transition"
                  />
                </div>

                {/* announcement */}
                <div className="space-y-3 pb-5 border-b border-border">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-text block">
                      Platform Announcement Banner
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={settingsData.announcement?.enabled}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            announcement: {
                              ...settingsData.announcement,
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-surface-raised border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
                    </label>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Broadcasted across all logged-in user screens as a dismissible banner. Rendered strictly as plain text.
                  </p>

                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      maxLength={200}
                      value={settingsData.announcement?.message || ''}
                      onChange={(e) =>
                        setSettingsData({
                          ...settingsData,
                          announcement: {
                            ...settingsData.announcement,
                            message: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g. Scheduled maintenance tonight from 11 PM to midnight IST..."
                      className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
                    />
                    <div className="flex items-center justify-between text-[10px] text-text-muted">
                      <span>Rendered securely as plain text only.</span>
                      <span>{(settingsData.announcement?.message || '').length}/200</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="announcementLevel"
                          value="info"
                          checked={settingsData.announcement?.level === 'info'}
                          onChange={() =>
                            setSettingsData({
                              ...settingsData,
                              announcement: { ...settingsData.announcement, level: 'info' },
                            })
                          }
                          className="text-brand-500 focus:ring-brand-500 cursor-pointer"
                        />
                        <span>Info (Blue)</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="announcementLevel"
                          value="warning"
                          checked={settingsData.announcement?.level === 'warning'}
                          onChange={() =>
                            setSettingsData({
                              ...settingsData,
                              announcement: { ...settingsData.announcement, level: 'warning' },
                            })
                          }
                          className="text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                        <span>Warning (Amber)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="primary" onClick={handleSaveSettings}>
                    Save System Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row gap-3 flex-wrap">
              <input
                type="text"
                value={auditSearchFilter}
                onChange={(e) => setAuditSearchFilter(e.target.value)}
                placeholder="Search reason or actor..."
                className="flex-1 min-w-[150px] px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
              />
              <input
                type="text"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                placeholder="Filter by action (e.g. admin.user)..."
                className="flex-1 min-w-[150px] px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
              />
              <input
                type="text"
                value={auditEntityFilter}
                onChange={(e) => setAuditEntityFilter(e.target.value)}
                placeholder="Filter entity (User, Group...)..."
                className="flex-1 min-w-[130px] px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500 transition"
              />
              <select
                value={auditRoleFilter}
                onChange={(e) => setAuditRoleFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin Actions</option>
                <option value="host">Host Actions</option>
                <option value="friend">Friend Actions</option>
              </select>
              <button
                type="button"
                onClick={() => setAuditAdminOnly((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  auditAdminOnly
                    ? 'bg-brand-500/20 border-brand-500/40 text-brand-400'
                    : 'bg-surface-raised border-border text-text-muted hover:text-text'
                }`}
              >
                {auditAdminOnly ? '✓ Admin Only' : 'Admin Only'}
              </button>
            </div>

            {loadingAudit ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <span>Loading immutable audit trail...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 rounded-2xl bg-surface border border-border text-center text-xs text-text-muted">
                No audit entries found.
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl bg-surface border border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="neutral" size="xs">
                          {log.action}
                        </Badge>
                        <span className="font-bold text-text">
                          {log.actorName} ({log.actorRole})
                        </span>
                        <span className="text-text-muted text-[11px]">
                          &bull; {log.entityType} ID: <code className="font-mono">{log.entityId}</code>
                        </span>
                      </div>
                      {log.reason && (
                        <p className="text-[11px] text-text-muted italic">
                          Reason: &ldquo;{log.reason}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-text-muted">
                        {formatDate(log.createdAt)}
                      </span>
                      {(log.before || log.after) && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleOpenDiff(log)}
                        >
                          Diff
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* USER DETAIL DRAWER */}
      <UserDetailDrawer
        userId={inspectedUserId}
        isOpen={Boolean(inspectedUserId)}
        onClose={() => setInspectedUserId(null)}
        onImpersonate={(targetUser) => {
          setInspectedUserId(null);
          triggerImpersonateUser(targetUser);
        }}
        currentUserId={user?.id}
      />

      {/* GROUP LEDGER MODAL */}
      <GroupLedgerModal
        groupId={inspectedGroupId}
        isOpen={Boolean(inspectedGroupId)}
        onClose={() => setInspectedGroupId(null)}
      />

      {/* SENSITIVE ACTION SIGNING MODAL */}
      {sensitiveAction && (
        <SensitiveActionModal
          isOpen={Boolean(sensitiveAction)}
          onClose={() => setSensitiveAction(null)}
          title={sensitiveAction.title}
          description={sensitiveAction.description}
          confirmLabel={sensitiveAction.confirmLabel}
          confirmVariant={sensitiveAction.confirmVariant}
          onConfirm={sensitiveAction.onExecute}
        >
          {sensitiveAction.extraContent}
        </SensitiveActionModal>
      )}

      {/* EDIT DISPLAY NAME MODAL */}
      {editingNameUser && (
        <Modal
          isOpen={Boolean(editingNameUser)}
          onClose={() => setEditingNameUser(null)}
          title={`Edit Display Name • @${editingNameUser.username}`}
          size="sm"
        >
          <form onSubmit={handleUpdateDisplayName} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-text block">Full Display Name</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                required
                maxLength={255}
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500"
              />
              <span className="text-[10px] text-text-muted block">
                Usernames (@{editingNameUser.username}) are permanent and cannot be modified.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingNameUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={updatingName}>
                Save Name
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* CREDENTIAL GENERATION RESULT MODAL */}
      {resetResult && (
        <Modal
          isOpen={Boolean(resetResult)}
          onClose={handleCloseResetModal}
          title="Single-Use Reset Credential Generated"
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200">
              <strong className="block font-bold">Credential Active</strong>
              <span>
                These credentials will expire on {formatDate(resetResult.expiresAt)} and can only be used once. Send them directly to the user.
              </span>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-text block">Direct Reset Link</span>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-raised border border-border">
                <input
                  type="text"
                  readOnly
                  value={resetResult.link}
                  className="bg-transparent text-[11px] font-mono text-text flex-1 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopyField('link', resetResult.link)}
                  className="p-1.5 rounded-lg hover:bg-surface text-brand-500 cursor-pointer transition shrink-0"
                  title="Copy link"
                >
                  {copiedField === 'link' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-text block">6-Digit Code</span>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-raised border border-border">
                <span className="font-mono text-base font-extrabold text-brand-500 flex-1 tracking-widest pl-2">
                  {resetResult.code}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyField('code', resetResult.code)}
                  className="p-1.5 rounded-lg hover:bg-surface text-brand-500 cursor-pointer transition shrink-0"
                  title="Copy code"
                >
                  {copiedField === 'code' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-text block">Pre-Formatted Message (WhatsApp / SMS)</span>
              <div className="relative">
                <textarea
                  readOnly
                  rows={4}
                  value={resetResult.whatsappMessage}
                  className="w-full p-2.5 rounded-xl bg-surface-raised border border-border text-[11px] font-mono text-text resize-none focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopyField('message', resetResult.whatsappMessage)}
                  className="absolute right-2 top-2 p-1.5 rounded-lg bg-surface border border-border text-brand-500 hover:bg-surface-raised cursor-pointer transition"
                  title="Copy message"
                >
                  {copiedField === 'message' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="primary" size="sm" onClick={handleCloseResetModal}>
                Done & Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* GENERATE CREDENTIAL PROMPT MODAL */}
      {resetModalUser && !resetResult && (
        <Modal
          isOpen={Boolean(resetModalUser)}
          onClose={handleCloseResetModal}
          title={`Generate Reset Credential • @${resetModalUser.username}`}
          size="md"
        >
          <form onSubmit={handleGenerateReset} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-1">
              <span className="text-text-muted block">Generating reset for</span>
              <strong className="text-text font-bold text-sm block">
                {resetModalUser.name} (@{resetModalUser.username})
              </strong>
            </div>

            <div>
              <label className="block font-semibold text-text mb-1">
                Reason for Password Reset <span className="text-red-500">*</span>
              </label>
              <textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="e.g. Identity confirmed by phone call, ticket #491"
                rows={2}
                required
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-text mb-1">Expiration Window</label>
              <select
                value={resetExpiresIn}
                onChange={(e) => setResetExpiresIn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text focus:outline-none focus:border-brand-500 cursor-pointer"
              >
                <option value="1">1 hour (Recommended)</option>
                <option value="4">4 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours (Maximum)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-text mb-1">
                Admin Password Confirmation <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={resetAdminPassword}
                  onChange={(e) => setResetAdminPassword(e.target.value)}
                  placeholder="Enter your current admin password"
                  required
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface-raised border border-border text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand-500"
                />
                <Lock className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={handleCloseResetModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={generatingReset}>
                Generate Credential
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* AUDIT DIFF MODAL */}
      {diffModalOpen && selectedAuditLog && (
        <Modal
          isOpen={diffModalOpen}
          onClose={() => setDiffModalOpen(false)}
          title={`Audit Diff • ${selectedAuditLog.action}`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="font-bold text-text-muted uppercase text-[10px] tracking-wider block">
                  State Before Action
                </span>
                <pre className="p-3 rounded-xl bg-surface-raised border border-border overflow-x-auto text-[11px] font-mono text-text max-h-64">
                  {selectedAuditLog.before ? JSON.stringify(selectedAuditLog.before, null, 2) : 'null'}
                </pre>
              </div>

              <div className="space-y-1.5">
                <span className="font-bold text-text-muted uppercase text-[10px] tracking-wider block">
                  State After Action
                </span>
                <pre className="p-3 rounded-xl bg-surface-raised border border-border overflow-x-auto text-[11px] font-mono text-text max-h-64">
                  {selectedAuditLog.after ? JSON.stringify(selectedAuditLog.after, null, 2) : 'null'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setDiffModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CSV EXPORT MODAL */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
}
