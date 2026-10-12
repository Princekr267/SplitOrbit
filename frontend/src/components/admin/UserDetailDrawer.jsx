import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import Badge from '../common/Badge.jsx';
import PersonName from '../common/PersonName.jsx';
import api from '../../api/client.js';
import { formatDate } from '../../utils/date.js';
import { User, Layers, Users, Clock, Shield, KeyRound, AlertCircle } from 'lucide-react';

export default function UserDetailDrawer({ userId, isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !userId) return;

    let mounted = true;
    async function fetchDetail() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/admin/users/${userId}`);
        if (mounted && res.success) {
          setData(res.data);
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load user details');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchDetail();
    return () => {
      mounted = false;
    };
  }, [isOpen, userId]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={data?.user ? `User Profile • @${data.user.username}` : 'User Profile'}
      size="lg"
    >
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-text-muted">
          <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <span>Loading account details...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : data?.user ? (
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1 text-xs">
          {/* Identity & Status */}
          <div className="p-4 rounded-2xl bg-surface-raised border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-500 font-black text-lg">
                {data.user.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-base font-extrabold text-text">{data.user.name}</span>
                  <span className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400">@{data.user.username}</span>
                </div>
                <span className="text-[11px] text-text-muted">
                  Account ID: <code className="font-mono text-[10px]">{data.user.id}</code>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={data.user.role === 'admin' ? 'warning' : 'neutral'} size="sm">
                {data.user.role === 'admin' ? '🛡️ Administrator' : 'User'}
              </Badge>
              <Badge variant={data.user.isActive ? 'active' : 'danger'} size="sm">
                {data.user.isActive ? 'Active' : 'Disabled'}
              </Badge>
            </div>
          </div>

          {/* Account Deactivated Banner with Reason */}
          {!data.user.isActive && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Account Deactivated</span>
              </div>
              <p className="text-[11px] text-text">
                Admin Reason: <span className="italic font-medium">&ldquo;{data.user.deactivatedReason || 'No reason specified'}&rdquo;</span>
              </p>
            </div>
          )}

          {/* Account Attributes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
                Email Address
              </span>
              <span className="text-xs font-semibold text-text block">
                {data.user.email || <em className="text-text-muted font-normal">Not provided</em>}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
                Phone Number
              </span>
              <span className="text-xs font-semibold text-text block">
                {data.user.phone || <em className="text-text-muted font-normal">Not provided</em>}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
                Last Login
              </span>
              <span className="text-xs font-semibold text-text block">
                {data.user.lastLoginAt ? (
                  formatDate(data.user.lastLoginAt)
                ) : (
                  <em className="text-text-muted font-normal">Never logged in</em>
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
                Password Last Changed
              </span>
              <span className="text-xs font-semibold text-text block">
                {data.user.passwordChangedAt ? (
                  formatDate(data.user.passwordChangedAt)
                ) : (
                  <em className="text-text-muted font-normal">Never changed</em>
                )}
              </span>
            </div>
          </div>

          {/* Hosted Groups Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand-500" />
                <span>Groups Hosted ({data.groupsHosted?.length || 0})</span>
              </h4>
            </div>

            {data.groupsHosted?.length === 0 ? (
              <p className="text-xs text-text-muted italic p-3 rounded-xl bg-surface border border-border">
                This user has not hosted any groups yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.groupsHosted.map((g) => (
                  <div
                    key={g.id}
                    className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-text text-xs">{g.name}</span>
                      <span className="text-[10px] text-text-muted block">
                        Created: {formatDate(g.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {g.isFrozen && (
                        <Badge variant="danger" size="xs">
                          Frozen
                        </Badge>
                      )}
                      <Badge variant={g.status === 'active' ? 'active' : 'settled'} size="xs">
                        {g.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked Profiles in Other Groups */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
                <span>Linked Member Profiles ({data.linkedProfiles?.length || 0})</span>
              </h4>
            </div>

            {data.linkedProfiles?.length === 0 ? (
              <p className="text-xs text-text-muted italic p-3 rounded-xl bg-surface border border-border">
                This user is not linked to any member profiles in other groups.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.linkedProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-text text-xs">{p.name}</span>
                      <span className="text-[10px] text-text-muted block">
                        Group: <strong>{p.groupName}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.canViewAllBills && (
                        <Badge variant="brand" size="xs">
                          Can View All
                        </Badge>
                      )}
                      <Badge variant="neutral" size="xs">
                        Member
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
