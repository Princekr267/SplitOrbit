import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import api from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { rupeesToPaise, paiseToRupees, formatINR } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import {
  Calculator as CalcIcon,
  Coins,
  Receipt,
  ChevronDown,
  ChevronUp,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { springs, durations, easings } from '../../motion/tokens.js';
import { Stagger } from '../../motion/components.jsx';

export default function AddPaymentModal({
  isOpen,
  onClose,
  groupId,
  people = [],
  expenses = [],
  defaultFromPersonId = null,
  defaultToPersonId = null,
  isHost = true,
  currentPerson = null,
  onPaymentAdded,
}) {
  const { addToast } = useToast();

  const hostPerson = people.find((p) => p.isHost) || people[0];
  const friends = people.filter((p) => !p.isHost);

  const [fromPersonId, setFromPersonId] = useState('');
  const [toPersonId, setToPersonId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [mode, setMode] = useState('online');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Expandable Bills Card state
  const [isBillsExpanded, setIsBillsExpanded] = useState(false);

  const totalExpensesPaise = expenses.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  useEffect(() => {
    if (isOpen && people.length > 0) {
      if (!isHost && currentPerson) {
        // Friend is locked as sender
        setFromPersonId(currentPerson.id);
        const target = defaultToPersonId || hostPerson?.id || people.find((p) => p.id !== currentPerson.id)?.id || '';
        setToPersonId(target);
        if (currentPerson.remainingToPay > 0 && !amountRupees) {
          setAmountRupees(paiseToRupees(currentPerson.remainingToPay));
        }
      } else {
        // Host can pick anyone
        const defaultPayer =
          defaultFromPersonId || (friends.length > 0 ? friends[0].id : people[0].id);
        setFromPersonId(defaultPayer);
        const defaultRecipient =
          defaultToPersonId || (defaultPayer === hostPerson?.id && friends.length > 0 ? friends[0].id : hostPerson?.id || people[0].id);
        setToPersonId(defaultRecipient);

        // Autofill amount if default payer still has to pay
        const payerObj = people.find((p) => p.id === defaultPayer);
        if (payerObj && payerObj.remainingToPay > 0 && !amountRupees) {
          setAmountRupees(paiseToRupees(payerObj.remainingToPay));
        }
      }
    }
  }, [isOpen, people, defaultFromPersonId, defaultToPersonId, isHost, currentPerson]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const paise = rupeesToPaise(amountRupees);

    if (paise <= 0) {
      addToast('Please enter a valid payment amount', 'error');
      return;
    }

    const effectiveFromId = !isHost && currentPerson ? currentPerson.id : fromPersonId;

    if (!effectiveFromId || !toPersonId) {
      addToast('Please select both sender and receiver', 'error');
      return;
    }

    if (effectiveFromId === toPersonId) {
      addToast('Sender and receiver must be different members', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`/groups/${groupId}/payments`, {
        fromPersonId: effectiveFromId,
        toPersonId,
        amount: paise,
        mode,
        date: new Date(date).toISOString(),
        reference: reference.trim(),
        description: description.trim(),
      });

      addToast(
        isHost
          ? 'Payment recorded successfully! 🤝'
          : 'Payment submitted to host for approval! ⏳',
        'success'
      );
      setAmountRupees('');
      setReference('');
      setDescription('');
      onClose();
      if (onPaymentAdded) onPaymentAdded(res.data);
    } catch (err) {
      addToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const effectiveSenderId = !isHost && currentPerson ? currentPerson.id : fromPersonId;
  const selectedPayer = people.find((p) => p.id === effectiveSenderId);
  const selectedRecipient = people.find((p) => p.id === toPersonId);

  const recipientOptions = people.filter((p) => p.id !== effectiveSenderId);

  const getPayShortLabel = (p) => {
    if (p.remainingToPay > 0) return `To pay ${formatINR(p.remainingToPay)}`;
    if (p.groupOwesYou > 0) return `To receive ${formatINR(p.groupOwesYou)}`;
    return 'All clear (₹0)';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isHost ? 'Record Payment / Repayment' : 'Submit Payment for Approval'}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Expandable Bills & Member Payments Card */}
        <m.div
          layout="position"
          transition={springs.smooth}
          style={{ borderRadius: 16 }}
          className="rounded-2xl border border-border bg-surface-raised/40 overflow-hidden shadow-xs"
        >
          {/* Card Header Toggle Button */}
          <m.button
            type="button"
            whileTap={{ scale: 0.99, transition: springs.snappy }}
            onClick={() => setIsBillsExpanded((prev) => !prev)}
            aria-expanded={isBillsExpanded}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-surface-raised/80 transition cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-2xl"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400 group-hover:scale-105 transition-transform shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-text">
                    Bills & Member Payments Breakdown
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-brand-500/15 text-brand-700 dark:text-brand-300">
                    {expenses.length} {expenses.length === 1 ? 'Bill' : 'Bills'} • {formatINR(totalExpensesPaise)}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 truncate">
                  {isBillsExpanded
                    ? 'Tap to hide bill details'
                    : 'Tap to reveal all bills and split shares'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 hidden sm:inline">
                {isBillsExpanded ? 'Hide' : 'Reveal'}
              </span>
              <m.div
                animate={{ rotate: isBillsExpanded ? 180 : 0 }}
                transition={springs.smooth}
                className={`p-1.5 rounded-lg border border-border bg-surface ${
                  isBillsExpanded ? 'bg-brand-500/10 border-brand-500/30' : ''
                }`}
              >
                <ChevronDown className="w-4 h-4 text-text-muted" />
              </m.div>
            </div>
          </m.button>

          {/* Expandable Card Body with Layout-safe height & Stagger */}
          <AnimatePresence initial={false}>
            {isBillsExpanded && (
              <m.div
                key="bills-expanded-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: springs.smooth,
                  opacity: { duration: durations.fast, ease: easings.easeOut },
                }}
                className="overflow-hidden border-t border-border"
              >
                <div className="p-3.5 sm:p-4 bg-surface space-y-4 max-h-80 overflow-y-auto">
                  {/* Member Payments Overview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-text-muted">
                        <Users className="w-3.5 h-3.5 text-brand-500" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-text">
                          Member Payments
                        </span>
                      </div>
                      <span className="text-[10px] text-text-muted">
                        Click any member to autofill
                      </span>
                    </div>

                    <Stagger staggerChildren={0.03} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {people.map((p) => {
                        const owes = p.remainingToPay > 0;
                        const isOwed = p.groupOwesYou > 0;
                        const isSelected = p.id === effectiveSenderId || p.id === toPersonId;

                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              if (isHost && owes) {
                                setFromPersonId(p.id);
                                setToPersonId(hostPerson?.id || '');
                                setAmountRupees(paiseToRupees(p.remainingToPay));
                              } else if (!isHost && currentPerson && p.id !== currentPerson.id) {
                                setToPersonId(p.id);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition hover:scale-[1.01] ${
                              isSelected
                                ? 'bg-brand-500/10 border-brand-500/30 shadow-xs'
                                : 'bg-surface-raised/70 hover:bg-surface-raised border-border'
                            }`}
                            title={`Click to autofill from ${p.name}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center font-bold text-[10px] text-text-muted shrink-0">
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-text truncate">{p.name}</span>
                                  {p.isHost && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold uppercase">
                                      Host
                                    </span>
                                  )}
                                  {currentPerson && p.id === currentPerson.id && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-brand-500/15 text-brand-700 dark:text-brand-400 font-bold uppercase">
                                      You
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {owes ? (
                                <span className="font-bold text-rose-600 dark:text-rose-400 font-mono text-[11px] tabular-nums block">
                                  To pay {formatINR(p.remainingToPay)}
                                </span>
                              ) : isOwed ? (
                                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] tabular-nums block">
                                  To receive {formatINR(p.groupOwesYou)}
                                </span>
                              ) : (
                                <span className="text-text-muted font-mono text-[10px] block">
                                  All clear (₹0)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </Stagger>
                  </div>

                  {/* All Group Bills with Itemized Details */}
                  <div className="space-y-2.5 pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-text-muted">
                        <Receipt className="w-3.5 h-3.5 text-brand-500" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-text">
                          All Group Bills ({expenses.length})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-text-muted">
                        Total: {formatINR(totalExpensesPaise)}
                      </span>
                    </div>

                    {expenses.length === 0 ? (
                      <div className="p-4 rounded-xl bg-surface-raised/40 border border-border text-center">
                        <p className="text-xs text-text-muted italic">
                          No expenses recorded yet in this group.
                        </p>
                      </div>
                    ) : (
                      <Stagger staggerChildren={0.04} className="space-y-2.5">
                        {expenses.map((exp) => (
                          <div
                            key={exp.id}
                            className="p-3 rounded-xl bg-surface-raised/80 border border-border text-xs space-y-2 shadow-xs"
                          >
                            {/* Bill Top Bar */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="font-bold text-text text-xs sm:text-sm truncate">
                                    {exp.title}
                                  </h5>
                                  {exp.splitType && (
                                    <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
                                      {exp.splitType}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-text-muted">
                                  {formatDate(exp.date)} • Paid by{' '}
                                  <strong className="text-text font-medium">
                                    {exp.paidByPerson?.name || 'Unknown'}
                                  </strong>
                                </p>
                                {exp.description && (
                                  <p className="text-[10px] text-text-muted line-clamp-1">
                                    {exp.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-extrabold text-text font-mono tabular-nums text-sm">
                                  {formatINR(exp.totalAmount)}
                                </span>
                              </div>
                            </div>

                            {/* Member Split Breakdown for this Bill */}
                            {exp.splits && exp.splits.length > 0 && (
                              <div className="pt-2 border-t border-border/70 space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted block">
                                  Split Shares ({exp.splits.length} members)
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                  {exp.splits.map((s, idx) => {
                                    const isSender = s.personId === effectiveSenderId;
                                    const isReceiver = s.personId === toPersonId;
                                    const isSelf = currentPerson && s.personId === currentPerson.id;

                                    return (
                                      <div
                                        key={idx}
                                        className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-1 transition ${
                                          isSender || isSelf
                                            ? 'bg-brand-500/10 border-brand-500/30 font-semibold'
                                            : isReceiver
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : 'bg-surface border-border text-text-muted'
                                        }`}
                                      >
                                        <span className="truncate">
                                          {s.person?.name || 'Member'}
                                          {isSelf ? ' (You)' : ''}
                                        </span>
                                        <span className="font-mono text-text tabular-nums shrink-0 font-bold">
                                          {formatINR(s.amount)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </Stagger>
                    )}
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </m.div>

        {/* From -> To */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Who Paid (Sender) *
            </label>
            {!isHost && currentPerson ? (
              <div className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-sm flex items-center justify-between">
                <span className="font-semibold">{currentPerson.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 font-bold uppercase">
                  You
                </span>
              </div>
            ) : (
              <select
                value={fromPersonId}
                onChange={(e) => {
                  setFromPersonId(e.target.value);
                  const payer = people.find((p) => p.id === e.target.value);
                  if (payer && payer.remainingToPay > 0) {
                    setAmountRupees(paiseToRupees(payer.remainingToPay));
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isHost ? '(Host)' : ''} — {getPayShortLabel(p)}
                  </option>
                ))}
              </select>
            )}

            {/* Sender Summary line */}
            {selectedPayer && (
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-text-muted">
                  To settle:{' '}
                  <strong
                    className={
                      selectedPayer.remainingToPay > 0
                        ? 'text-rose-600 dark:text-rose-400 font-mono'
                        : selectedPayer.groupOwesYou > 0
                        ? 'text-emerald-600 dark:text-emerald-400 font-mono'
                        : 'text-text-muted font-mono'
                    }
                  >
                    {selectedPayer.remainingToPay > 0
                      ? `To pay ${formatINR(selectedPayer.remainingToPay)}`
                      : selectedPayer.groupOwesYou > 0
                      ? `To receive ${formatINR(selectedPayer.groupOwesYou)}`
                      : 'All clear (₹0.00)'}
                  </strong>
                </span>
                {selectedPayer.remainingToPay > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountRupees(paiseToRupees(selectedPayer.remainingToPay))}
                    className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                  >
                    Fill ₹{(selectedPayer.remainingToPay / 100).toFixed(2)}
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Received By (Recipient) *
            </label>
            <select
              value={toPersonId}
              onChange={(e) => setToPersonId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
            >
              {recipientOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isHost ? '(Host)' : ''} — {getPayShortLabel(p)}
                </option>
              ))}
            </select>

            {/* Recipient Summary line */}
            {selectedRecipient && (
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-text-muted">
                  To settle:{' '}
                  <strong
                    className={
                      selectedRecipient.remainingToPay > 0
                        ? 'text-rose-600 dark:text-rose-400 font-mono'
                        : selectedRecipient.groupOwesYou > 0
                        ? 'text-emerald-600 dark:text-emerald-400 font-mono'
                        : 'text-text-muted font-mono'
                    }
                  >
                    {selectedRecipient.remainingToPay > 0
                      ? `To pay ${formatINR(selectedRecipient.remainingToPay)}`
                      : selectedRecipient.groupOwesYou > 0
                      ? `To receive ${formatINR(selectedRecipient.groupOwesYou)}`
                      : 'All clear (₹0.00)'}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Amount & Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Amount (₹) *
              </label>
              <button
                type="button"
                data-calculator-trigger="true"
                onClick={() => window.dispatchEvent(new CustomEvent('splitorbit:open-calculator'))}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                title="Open Calculator to compute repayment"
              >
                <CalcIcon className="w-3 h-3" />
                Calc
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              data-amount-input="true"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm font-semibold focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Payment Mode *
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-raised border border-border">
              <button
                type="button"
                onClick={() => setMode('online')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'online'
                    ? 'bg-brand-500 text-slate-950 shadow'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Online / UPI
              </button>
              <button
                type="button"
                onClick={() => setMode('cash')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'cash'
                    ? 'bg-brand-500 text-slate-950 shadow'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Cash
              </button>
            </div>
          </div>
        </div>

        {/* Reference and Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              {mode === 'online' ? 'UPI / Ref No (Optional)' : 'Location / Note'}
            </label>
            <input
              type="text"
              placeholder={mode === 'online' ? 'e.g. UPI/1283912903' : 'Handed cash in person'}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
            />
          </div>
        </div>

        {/* Optional Description */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Note (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Settle dinner split, Part payment"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
          />
        </div>

        {isHost ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400/90 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
            ✓ Recorded by you as host. This payment is automatically accepted and immediately updates everyone's payments.
          </p>
        ) : (
          <p className="text-[11px] text-amber-600 dark:text-amber-400/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
            ⏳ Submitted for approval. This payment will be pending until reviewed and accepted by the host.
          </p>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-lg shadow-brand-500/20 disabled:opacity-50 cursor-pointer"
          >
            {loading
              ? isHost
                ? 'Recording...'
                : 'Submitting...'
              : isHost
              ? 'Record Payment'
              : 'Submit for Approval'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
