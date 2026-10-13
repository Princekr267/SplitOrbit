import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../api/client.js';
import Navbar from '../components/common/Navbar.jsx';
import AnimatedAmount from '../components/common/AnimatedAmount.jsx';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../motion/tokens.js';
import {
  User,
  Lock,
  Shield,
  CreditCard,
  KeyRound,
  Download,
  LogOut,
  Check,
  RefreshCw,
  QrCode,
  AlertCircle,
  Copy,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Sparkles,
  Smartphone,
  Mail,
  Sliders,
  Users,
  Building,
} from 'lucide-react';

const AVATAR_COLORS = [
  { id: 'indigo', name: 'Indigo', bg: 'bg-indigo-500', hex: '#6366f1' },
  { id: 'emerald', name: 'Emerald', bg: 'bg-emerald-500', hex: '#10b981' },
  { id: 'violet', name: 'Violet', bg: 'bg-violet-500', hex: '#8b5cf6' },
  { id: 'rose', name: 'Rose', bg: 'bg-rose-500', hex: '#f43f5e' },
  { id: 'amber', name: 'Amber', bg: 'bg-amber-500', hex: '#f59e0b' },
  { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-500', hex: '#06b6d4' },
  { id: 'blue', name: 'Blue', bg: 'bg-blue-500', hex: '#3b82f6' },
  { id: 'teal', name: 'Teal', bg: 'bg-teal-500', hex: '#14b8a6' },
];

export default function ProfilePage() {
  const { user: authUser, setUser: setAuthUser, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarColor, setAvatarColor] = useState('indigo');
  const [upiId, setUpiId] = useState('');
  const [showUpi, setShowUpi] = useState(false);
  const [defaultPaymentMode, setDefaultPaymentMode] = useState('online');
  const [defaultSplitType, setDefaultSplitType] = useState('equal');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/me?includeStats=true');
      if (res.success && res.data) {
        setProfileData(res.data);
        const u = res.data.user;
        setName(u.name || '');
        setEmail(u.email || '');
        setPhone(u.phone || '');
        setAvatarColor(u.avatarColor || 'indigo');
        setUpiId(u.upiId || '');
        setShowUpi(!!u.showUpi);
        setDefaultPaymentMode(u.defaultPaymentMode || 'online');
        setDefaultSplitType(u.defaultSplitType || 'equal');
      }
    } catch (err) {
      addToast(err.message || 'Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleCopyUsername = async () => {
    if (!profileData?.user?.username) return;
    try {
      await navigator.clipboard.writeText(`@${profileData.user.username}`);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
      addToast('Copied username to clipboard!', 'success');
    } catch {
      addToast('Failed to copy', 'error');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        avatarColor,
        upiId: upiId.trim() || null,
        showUpi,
        defaultPaymentMode,
        defaultSplitType,
      };

      const res = await api.patch('/me/profile', payload);
      if (res.success) {
        addToast('Profile updated successfully! ✨', 'success');
        setProfileData((prev) => ({
          ...prev,
          user: res.data,
        }));
        // Update auth context state as well
        if (setAuthUser) {
          setAuthUser((prev) => ({ ...prev, ...res.data }));
        }
      }
    } catch (err) {
      addToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      addToast('Please enter your current password', 'error');
      return;
    }
    if (newPassword.length < 8) {
      addToast('New password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }

    try {
      setChangingPassword(true);
      const res = await api.post('/me/change-password', {
        currentPassword,
        newPassword,
      });
      if (res.success) {
        addToast('Password changed successfully! All other sessions were signed out.', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      addToast(err.message || 'Failed to change password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOutAll = async () => {
    const confirm = window.confirm(
      'Are you sure you want to sign out of ALL devices? You will be signed out of this browser as well.'
    );
    if (!confirm) return;

    try {
      setSigningOutAll(true);
      await api.post('/me/sign-out-all');
      addToast('Signed out of all devices', 'success');
      await logout();
      navigate('/login');
    } catch (err) {
      addToast(err.message || 'Failed to sign out all sessions', 'error');
      setSigningOutAll(false);
    }
  };

  const handleExportData = async () => {
    try {
      setExporting(true);
      const res = await api.get('/me/export');
      if (res.success && res.data) {
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(res.data, null, 2)
        )}`;
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', jsonString);
        downloadAnchor.setAttribute(
          'download',
          `splitorbit-export-${profileData?.user?.username || 'user'}-${new Date().toISOString().slice(0, 10)}.json`
        );
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        addToast('Export downloaded successfully! 📁', 'success');
      }
    } catch (err) {
      addToast(err.message || 'Export failed or rate limited (1 export per hour)', 'error');
    } finally {
      setExporting(false);
    }
  };

  const user = profileData?.user || authUser || {};
  const stats = profileData?.stats || {
    groupsHosted: 0,
    linkedProfiles: 0,
    totalOwedToMe: 0,
    totalIOwe: 0,
    pendingApprovals: 0,
  };

  const selectedColorObj =
    AVATAR_COLORS.find((c) => c.id === avatarColor) || AVATAR_COLORS[0];
  const initials = (name || user.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background text-text flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Profile Header Banner */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {/* Dynamic Initials Avatar */}
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-md ${selectedColorObj.bg} shrink-0`}
              >
                {initials}
              </div>

              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-text tracking-tight truncate">
                    {user.name || 'User Profile'}
                  </h1>
                  {user.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyUsername}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold bg-surface-raised hover:bg-surface-raised/80 text-text-muted hover:text-text border border-border transition-colors cursor-pointer"
                    title="Click to copy username"
                  >
                    <span>@{user.username}</span>
                    {copiedUsername ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3 text-text-muted" />
                    )}
                  </button>
                  <span className="text-xs text-text-muted">
                    Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'recently'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleExportData}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-surface-raised/80 border border-border text-text transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                <span>{exporting ? 'Exporting...' : 'Export Data (JSON)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Balance & Ledger Stats Bento */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
              Owed to You
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 block font-mono">
              <AnimatedAmount amount={stats.totalOwedToMe} />
            </div>
            <span className="text-[11px] text-text-muted block">Across hosted groups</span>
          </div>

          <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
              You Owe
            </span>
            <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 block font-mono">
              <AnimatedAmount amount={stats.totalIOwe} />
            </div>
            <span className="text-[11px] text-text-muted block">Across friend groups</span>
          </div>

          <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
              Pending Approvals
            </span>
            <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 block font-mono">
              <AnimatedAmount amount={stats.pendingApprovals} />
            </div>
            <span className="text-[11px] text-text-muted block">Waiting on host</span>
          </div>

          <div className="bg-surface p-4 rounded-2xl border border-border space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
              Groups Active
            </span>
            <div className="text-xl sm:text-2xl font-black text-text block font-mono">
              {stats.groupsHosted + stats.linkedProfiles}
            </div>
            <span className="text-[11px] text-text-muted block">
              {stats.groupsHosted} hosted • {stats.linkedProfiles} friend
            </span>
          </div>
        </div>

        {/* Settings Sections Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Personal Info & Preferences */}
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <User className="w-4 h-4 text-brand-500" />
              <h2 className="text-sm font-bold text-text uppercase tracking-wider">
                Personal Information
              </h2>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Username (Locked & Immutable) */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Username <span className="text-text-muted font-normal">(Permanent identity)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-text-muted font-mono font-medium">
                    @
                  </span>
                  <input
                    type="text"
                    value={user.username || ''}
                    disabled
                    className="w-full bg-surface-raised/70 border border-border rounded-xl pl-7 pr-9 py-2 text-xs font-mono text-text-muted cursor-not-allowed"
                  />
                  <Lock className="w-3.5 h-3.5 text-text-muted absolute right-3 top-3" />
                </div>
                <p className="text-[11px] text-text-muted mt-1">
                  Usernames cannot be changed once chosen.
                </p>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl px-3 py-2 text-xs text-text transition outline-none"
                  placeholder="Your full name"
                />
              </div>

              {/* Phone & Email (Optional for account recovery) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Phone <span className="text-text-muted font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Smartphone className="w-3.5 h-3.5 text-text-muted absolute left-3 top-3" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl pl-9 pr-3 py-2 text-xs text-text transition outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Email <span className="text-text-muted font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-text-muted absolute left-3 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. you@example.com"
                      className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl pl-9 pr-3 py-2 text-xs text-text transition outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Avatar Color Swatches */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  Avatar Accent Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_COLORS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setAvatarColor(col.id)}
                      title={col.name}
                      className={`w-7 h-7 rounded-full ${col.bg} transition transform flex items-center justify-center cursor-pointer ${
                        avatarColor === col.id
                          ? 'ring-2 ring-offset-2 ring-brand-500 ring-offset-surface scale-110'
                          : 'opacity-70 hover:opacity-100 hover:scale-105'
                      }`}
                    >
                      {avatarColor === col.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferences */}
              <div className="pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Default Payment Mode
                  </label>
                  <select
                    value={defaultPaymentMode}
                    onChange={(e) => setDefaultPaymentMode(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-xl px-3 py-2 text-xs text-text outline-none cursor-pointer"
                  >
                    <option value="online">Online (UPI / Bank)</option>
                    <option value="cash">Cash In-Person</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Default Split Type
                  </label>
                  <select
                    value={defaultSplitType}
                    onChange={(e) => setDefaultSplitType(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-xl px-3 py-2 text-xs text-text outline-none cursor-pointer"
                  >
                    <option value="equal">Equal Split</option>
                    <option value="exact">Exact Amount</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* 2. UPI Payment Integration & Privacy */}
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-text uppercase tracking-wider">
                UPI & Repayment Settings
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Host UPI ID <span className="text-text-muted font-normal">(VPA address)</span>
                </label>
                <div className="relative">
                  <QrCode className="w-3.5 h-3.5 text-text-muted absolute left-3 top-3" />
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="e.g. rahul@okhdfcbank or 9876543210@paytm"
                    className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl pl-9 pr-3 py-2 text-xs text-text transition outline-none font-mono"
                  />
                </div>
                <p className="text-[11px] text-text-muted mt-1">
                  Enables friends to pay you directly via GPay, PhonePe, or Paytm with 1 click.
                </p>
              </div>

              {/* Show UPI Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-raised border border-border">
                <div className="space-y-0.5 pr-4">
                  <span className="text-xs font-bold text-text block">
                    Show UPI to Friends in Groups
                  </span>
                  <span className="text-[11px] text-text-muted block leading-tight">
                    When enabled, friends see your UPI button & WhatsApp copy reminders.
                  </span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={showUpi}
                    onChange={(e) => setShowUpi(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Live Preview of UPI Card */}
              <div className="p-4 rounded-xl border border-dashed border-border bg-surface-raised/40 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
                  Friend View Live Preview
                </span>
                {showUpi && upiId ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface border border-emerald-500/30 text-xs">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="font-semibold text-text block">Pay Host via UPI</span>
                          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                            {upiId}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                        Pay with UPI App
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Visible to friends in their passbooks and copy messages
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-surface border border-border text-xs text-text-muted flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      UPI is currently <strong>hidden</strong>. Friends will only see cash or general repayment reminders.
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {savingProfile ? 'Saving...' : 'Update Payment Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Security, Password & Session Management */}
        <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-text uppercase tracking-wider">
                Security & Credentials
              </h2>
            </div>

            {/* Recovery Code Remaining Count */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-raised border border-border">
              <Shield className="w-3.5 h-3.5 text-brand-500" />
              <span>
                Recovery Codes:{' '}
                <strong className="text-text font-bold">
                  {profileData?.recoveryCodesRemaining ?? 'N/A'} remaining
                </strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Change Password Form */}
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text">Change Password</span>
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="text-xs text-text-muted hover:text-text inline-flex items-center gap-1 cursor-pointer"
                >
                  {showPasswords ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPasswords ? 'Hide' : 'Show'}</span>
                </button>
              </div>

              <div>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current Password"
                  className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl px-3 py-2 text-xs text-text transition outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Password (min 8 chars)"
                  className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl px-3 py-2 text-xs text-text transition outline-none"
                />

                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  className="w-full bg-surface-raised border border-border focus:border-brand-500 rounded-xl px-3 py-2 text-xs text-text transition outline-none"
                />
              </div>

              <p className="text-[11px] text-text-muted">
                Changing your password automatically terminates sessions on any other devices.
              </p>

              <button
                type="submit"
                disabled={changingPassword}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-surface-raised hover:bg-surface-raised/80 border border-border text-text transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {changingPassword ? 'Updating...' : 'Change Password'}
              </button>
            </form>

            {/* Session Management & Danger Actions */}
            <div className="space-y-4 lg:pl-6 lg:border-l lg:border-border">
              <div>
                <span className="text-xs font-bold text-text block mb-1">
                  Active Sessions & Devices
                </span>
                <p className="text-xs text-text-muted leading-relaxed">
                  If you suspect unauthorized access or logged in from a shared computer, you can invalidate all existing tokens.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Signing out of all devices immediately invalidates all active session cookies.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSignOutAll}
                  disabled={signingOutAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-500 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{signingOutAll ? 'Signing out...' : 'Sign Out of All Devices'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. My Linked Groups List */}
        {profileData?.groups && profileData.groups.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <Users className="w-4 h-4 text-sky-500" />
              <h2 className="text-sm font-bold text-text uppercase tracking-wider">
                My Linked Groups ({profileData.groups.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {profileData.groups.map((g) => (
                <Link
                  key={g.personId}
                  to={`/groups/${g.groupId}`}
                  className="p-3 rounded-xl bg-surface-raised hover:bg-surface-raised/80 border border-border flex items-center justify-between gap-3 transition group"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-xs text-text block truncate group-hover:text-brand-500 transition-colors">
                      {g.groupName}
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      {g.isHost ? 'Host' : g.canViewAllBills ? 'Member (Full View)' : 'Member (Own Bills)'}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-text transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
