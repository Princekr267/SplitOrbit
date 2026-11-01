import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import Badge from '../common/Badge.jsx';
import AnimatedAmount from '../common/AnimatedAmount.jsx';
import PersonName from '../common/PersonName.jsx';
import api from '../../api/client.js';
import { formatINR } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import { Layers, Users, Receipt, CreditCard, Lock, AlertCircle } from 'lucide-react';

export default function GroupLedgerModal({ groupId, isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !groupId) return;

    let mounted = true;
    async function fetchLedger() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/admin/groups/${groupId}`);
        if (mounted && res.success) {
          setData(res.data);
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load group ledger');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchLedger();
    return () => {
      mounted = false;
    };
  }, [isOpen, groupId]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={data?.group ? `Ledger Inspection • ${data.group.name}` : 'Group Ledger'}
      size="xl"
    >
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-text-muted">
          <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <span>Loading ledger records & balances...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : data?.group ? (
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1 text-xs">
          {/* Header Summary */}
          <div className="p-4 rounded-2xl bg-surface-raised border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm font-extrabold text-text">{data.group.name}</h3>
                <Badge variant={data.group.status === 'active' ? 'active' : 'settled'} size="sm">
                  {data.group.status}
                </Badge>
                {data.group.isFrozen && (
                  <Badge variant="danger" size="sm">
                    🔒 Frozen
                  </Badge>
                )}
                {data.group.isDeleted && (
                  <Badge variant="neutral" size="sm">
                    🗑️ Deleted
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-1">
                Created: {formatDate(data.group.createdAt)} • Group ID: <code className="font-mono text-[10px]">{data.group.id}</code>
              </p>
            </div>
          </div>

          {/* Member Net Balances */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-brand-500" />
              <span>Member Payments ({data.balances?.people?.length || 0})</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {data.balances?.people?.map((p) => {
                const owesMoney = p.net < 0;
                const isOwed = p.net > 0;
                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-text block truncate max-w-[120px]">
                        {p.name} {p.isHost && '👑'}
                      </span>
                      <span className="text-[10px] text-text-muted block">
                        Spent: {formatINR(p.paid)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-black font-mono tabular-nums text-xs block ${
                          owesMoney
                            ? 'text-red-500'
                            : isOwed
                            ? 'text-emerald-500'
                            : 'text-text-muted'
                        }`}
                      >
                        {formatINR(p.net)}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-text-muted block">
                        {owesMoney ? 'To Pay' : isOwed ? 'To Receive' : 'All Clear'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Expenses Ledger */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-amber-500" />
              <span>Expenses ({data.expenses?.length || 0})</span>
            </h4>
            {data.expenses?.length === 0 ? (
              <p className="text-xs text-text-muted italic p-3 rounded-xl bg-surface border border-border">
                No expenses recorded.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {data.expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-text block">{exp.title}</span>
                      <span className="text-[10px] text-text-muted">
                        {formatDate(exp.date)} • Paid by: {exp.paidByPerson?.name || 'Member'} • Split: {exp.splitType}
                      </span>
                    </div>
                    <span className="font-bold font-mono text-text text-xs shrink-0">
                      <AnimatedAmount amountPaise={exp.totalAmount} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments Ledger */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-teal-500" />
              <span>Payments & Repayments ({data.payments?.length || 0})</span>
            </h4>
            {data.payments?.length === 0 ? (
              <p className="text-xs text-text-muted italic p-3 rounded-xl bg-surface border border-border">
                No repayments recorded.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {data.payments.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-text block">
                        Repayment ({pay.mode})
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {formatDate(pay.date)} • Status: {pay.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={pay.status === 'accepted' ? 'settled' : pay.status === 'pending' ? 'pending' : 'danger'}
                        size="xs"
                      >
                        {pay.status}
                      </Badge>
                      <span className="font-bold font-mono text-text text-xs shrink-0">
                        <AnimatedAmount amountPaise={pay.amount} />
                      </span>
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
