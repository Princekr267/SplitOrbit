import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../common/Modal.jsx';
import api from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { rupeesToPaise, formatINR } from '../../utils/currency.js';
import { Calculator as CalcIcon } from 'lucide-react';

export default function AddExpenseModal({
  isOpen,
  onClose,
  groupId,
  people = [],
  defaultPayerId = null,
  onExpenseAdded,
}) {
  const { addToast } = useToast();

  const [title, setTitle] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [paidByPersonId, setPaidByPersonId] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('food');
  const [paymentStatus, setPaymentStatus] = useState('Pending');
  const [splitType, setSplitType] = useState('equal');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Equal split: selected person IDs
  const [selectedPersonIds, setSelectedPersonIds] = useState([]);

  // Exact split: { [personId]: rupeeInputString }
  const [exactInputs, setExactInputs] = useState({});

  // Percentage split: { [personId]: percentInputString }
  const [percentInputs, setPercentInputs] = useState({});

  // Reset or initialize on modal open
  useEffect(() => {
    if (isOpen && people.length > 0) {
      if (!paidByPersonId || !people.some((p) => p.id === paidByPersonId)) {
        setPaidByPersonId(defaultPayerId || people[0].id);
      }
      setSelectedPersonIds(people.map((p) => p.id));

      const initialExact = {};
      const initialPercent = {};
      const equalSharePercent = (100 / people.length).toFixed(2);
      people.forEach((p) => {
        initialExact[p.id] = '';
        initialPercent[p.id] = equalSharePercent;
      });
      setExactInputs(initialExact);
      setPercentInputs(initialPercent);
    }
  }, [isOpen, people, defaultPayerId]);

  const totalPaise = useMemo(() => {
    return rupeesToPaise(amountRupees);
  }, [amountRupees]);

  // Equal split computed share per person
  const equalPerPersonPaise = useMemo(() => {
    if (selectedPersonIds.length === 0 || totalPaise <= 0) return 0;
    return Math.floor(totalPaise / selectedPersonIds.length);
  }, [totalPaise, selectedPersonIds]);

  // Exact split validation
  const exactSumPaise = useMemo(() => {
    let sum = 0;
    Object.values(exactInputs).forEach((val) => {
      sum += rupeesToPaise(val);
    });
    return sum;
  }, [exactInputs]);

  // Percentage split sum
  const percentSum = useMemo(() => {
    let sum = 0;
    Object.values(percentInputs).forEach((val) => {
      sum += parseFloat(val) || 0;
    });
    return Math.round(sum * 100) / 100;
  }, [percentInputs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || totalPaise <= 0) {
      addToast('Please enter a valid title and positive amount', 'error');
      return;
    }

    if (!paidByPersonId) {
      addToast('Please select who paid for this expense', 'error');
      return;
    }

    let payloadSplits = [];

    if (splitType === 'equal') {
      if (selectedPersonIds.length === 0) {
        addToast('Please select at least one person to split with', 'error');
        return;
      }
    } else if (splitType === 'exact') {
      if (exactSumPaise !== totalPaise) {
        addToast(
          `Sum of exact splits (${formatINR(exactSumPaise)}) must equal total (${formatINR(totalPaise)})`,
          'error'
        );
        return;
      }
      payloadSplits = Object.entries(exactInputs)
        .filter(([_, val]) => rupeesToPaise(val) > 0)
        .map(([personId, val]) => ({
          personId,
          amount: rupeesToPaise(val),
        }));
    } else if (splitType === 'percentage') {
      if (Math.abs(percentSum - 100) > 0.05) {
        addToast(`Percentage splits must total exactly 100%. Current: ${percentSum}%`, 'error');
        return;
      }
      payloadSplits = Object.entries(percentInputs)
        .filter(([_, val]) => parseFloat(val) > 0)
        .map(([personId, val]) => ({
          personId,
          basisPoints: Math.round(parseFloat(val) * 100),
        }));
    }

    try {
      setLoading(true);
      const res = await api.post(`/groups/${groupId}/expenses`, {
        title: title.trim(),
        totalAmount: totalPaise,
        date: new Date(date).toISOString(),
        paidByPersonId,
        category,
        paymentStatus,
        status: paymentStatus,
        description: description.trim() ? `${description.trim()} [cat:${category}]` : `[cat:${category}]`,
        splitType,
        selectedPersonIds: splitType === 'equal' ? selectedPersonIds : [],
        splits: payloadSplits,
      });

      addToast('Expense recorded successfully! 💸', 'success');
      setTitle('');
      setAmountRupees('');
      setDescription('');
      onClose();
      if (onExpenseAdded) onExpenseAdded(res.data);
    } catch (err) {
      addToast(err.message || 'Failed to record expense', 'error');
    } finally {
      setLoading(false);
    }
  };

  const togglePersonSelection = (id) => {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Expense" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title & Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Expense Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Dinner, Fuel, Airbnb"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Total (₹) *
              </label>
              <button
                type="button"
                data-calculator-trigger="true"
                onClick={() => window.dispatchEvent(new CustomEvent('splitorbit:open-calculator'))}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                title="Open Calculator to compute amount"
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
        </div>

        {/* Payer and Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Paid By *
            </label>
            <select
              value={paidByPersonId}
              onChange={(e) => setPaidByPersonId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isHost ? '(Host)' : ''}
                </option>
              ))}
            </select>
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

        {/* Split Type Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Split Method
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-surface-raised border border-border">
            {['equal', 'exact', 'percentage'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={`py-1.5 text-xs font-semibold rounded-lg capitalize transition ${
                  splitType === type
                    ? 'bg-brand-500 text-slate-950 shadow'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Split Breakdown */}
        <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2.5">
          <div className="flex items-center justify-between text-xs text-text-muted pb-1.5 border-b border-border">
            <span className="font-semibold uppercase tracking-wider">Split Breakdown</span>
            {splitType === 'equal' && (
              <span className="text-emerald-500 dark:text-emerald-400 font-medium font-mono tabular-nums">
                {selectedPersonIds.length > 0
                  ? `~${formatINR(equalPerPersonPaise)} / person`
                  : 'Select participants'}
              </span>
            )}
            {splitType === 'exact' && (
              <span
                className={`font-medium font-mono tabular-nums ${
                  exactSumPaise === totalPaise ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'
                }`}
              >
                {formatINR(exactSumPaise)} / {formatINR(totalPaise)}
              </span>
            )}
            {splitType === 'percentage' && (
              <span
                className={`font-medium font-mono tabular-nums ${
                  Math.abs(percentSum - 100) < 0.05 ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'
                }`}
              >
                {percentSum}% / 100%
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {people.map((p) => {
              const isSelected = selectedPersonIds.includes(p.id);

              if (splitType === 'equal') {
                return (
                  <label
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-surface-raised cursor-pointer text-xs transition border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePersonSelection(p.id)}
                        className="rounded border-border text-brand-500 focus:ring-brand-500 w-4 h-4 bg-surface-raised"
                      />
                      <span className={isSelected ? 'text-text font-medium' : 'text-text-muted'}>
                        {p.name} {p.isHost ? '(Host)' : ''}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-text font-semibold font-mono tabular-nums">
                        {formatINR(equalPerPersonPaise)}
                      </span>
                    )}
                  </label>
                );
              }

              if (splitType === 'exact') {
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-surface border border-border/50 text-xs"
                  >
                    <span className="text-text truncate">
                      {p.name} {p.isHost ? '(Host)' : ''}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-text-muted text-[11px]">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        data-amount-input="true"
                        value={exactInputs[p.id] || ''}
                        onChange={(e) =>
                          setExactInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="w-24 px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-text text-right text-xs focus:outline-none focus:border-brand-500 font-mono tabular-nums"
                      />
                    </div>
                  </div>
                );
              }

              if (splitType === 'percentage') {
                const currPercent = parseFloat(percentInputs[p.id]) || 0;
                const estimatedPaise = Math.round((totalPaise * currPercent) / 100);

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-surface border border-border/50 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="text-text block truncate">
                        {p.name} {p.isHost ? '(Host)' : ''}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono tabular-nums">
                        {formatINR(estimatedPaise)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={percentInputs[p.id] || ''}
                        onChange={(e) =>
                          setPercentInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="w-20 px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-text text-right text-xs focus:outline-none focus:border-brand-500 font-mono tabular-nums"
                      />
                      <span className="text-text-muted text-xs">%</span>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>

        {/* Optional Description */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Note (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Paid via card, receipts on desk"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-lg shadow-brand-500/20 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Record Expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
