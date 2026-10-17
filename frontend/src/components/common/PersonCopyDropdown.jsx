import React, { useState, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  ChevronDown,
  FileText,
  AlignLeft,
  Link2,
  Share2,
  RefreshCw,
  ExternalLink,
  UserPlus,
  UserCheck,
  Trash2,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { formatINR } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import api from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { springs, durations } from '../../motion/tokens.js';

export default function PersonCopyDropdown({ group, person, isHost = false, onDeleted }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [deletingPerson, setDeletingPerson] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const dropdownRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const { addToast } = useToast();

  const markCopied = () => {
    setJustCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setJustCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Generate Short Text
  const getShortText = () => {
    const owes = person.remainingToPay > 0;
    const isOwed = person.groupOwesYou > 0;

    const balanceLine = owes
      ? `• Balance Due: ${formatINR(person.remainingToPay)} (owes host)`
      : isOwed
      ? `• Balance: Host owes you ${formatINR(person.groupOwesYou)}`
      : `• Balance: Fully Settled (₹0.00)`;

    const hostUpi = group?.hostUpi;
    const upiLine = hostUpi ? `\n• Pay to UPI: ${hostUpi}` : '';

    return `SplitOrbit • ${group.name}
Statement for ${person.name}:
• Total Share: ${formatINR(person.shareSplitsTotal)}
• Paid / Repaid: ${formatINR(person.acceptedSentPaymentsTotal)}
${balanceLine}${upiLine}`;
  };

  const handleCopyShort = async () => {
    try {
      const text = getShortText();
      await navigator.clipboard.writeText(text);
      markCopied();
      addToast('Copied short statement to clipboard! 📋', 'success');
      setIsOpen(false);
    } catch (err) {
      addToast('Failed to copy to clipboard', 'error');
    }
  };

  // 2. Generate Detailed Itemized Text (WhatsApp Ready)
  const handleCopyDetailed = async () => {
    try {
      setLoadingStatement(true);
      const res = await api.get(`/groups/${group.id}/people/${person.id}/statement`);
      if (!res.success) throw new Error('Could not fetch statement');

      const data = res.data;
      const expLines =
        data.expenses.length > 0
          ? data.expenses
              .map(
                (e) =>
                  `• ${formatDate(e.date)}: ${e.title} — *${formatINR(e.personShare)}* (Paid by ${e.paidBy})`
              )
              .join('\n')
          : '• No expenses recorded';

      const payLines =
        data.payments.length > 0
          ? data.payments
              .map(
                (p) =>
                  `• ${formatDate(p.date)}: *${formatINR(p.amount)}* (${p.mode.toUpperCase()}) — ${p.status.toUpperCase()}`
              )
              .join('\n')
          : '• No payments recorded';

      const owes = data.summary.remainingToPay > 0;
      const isOwed = data.summary.groupOwesYou > 0;
      const balanceStr = owes
        ? `*Balance Due (Owes Host):* *${formatINR(data.summary.remainingToPay)}*`
        : isOwed
        ? `*Group Owes You:* *${formatINR(data.summary.groupOwedYou || data.summary.groupOwesYou)}*`
        : `*Status:* *Settled (₹0.00)*`;

      const upiStr = data.hostUpi ? `\nPay to UPI: ${data.hostUpi}` : '';

      const detailedText = `*SplitOrbit: ${group.name}* 💸
Statement for: *${person.name}*
━━━━━━━━━━━━━━━━━━━
*EXPENSES:*
${expLines}

*PAYMENTS:*
${payLines}

━━━━━━━━━━━━━━━━━━━
*Total Share:* ${formatINR(data.summary.shareSplitsTotal)}
*Total Repaid:* ${formatINR(data.summary.acceptedSentTotal)}
${balanceStr}${upiStr}`;

      await navigator.clipboard.writeText(detailedText);
      markCopied();
      addToast('Copied detailed WhatsApp statement! 📑', 'success');
      setIsOpen(false);
    } catch (err) {
      addToast(err.message || 'Failed to copy detailed statement', 'error');
    } finally {
      setLoadingStatement(false);
    }
  };

  // 3. Generate or Copy Share View Link
  const handleShareLink = async () => {
    try {
      setGeneratingLink(true);
      const res = await api.post(`/groups/${group.id}/people/${person.id}/share-link`);
      if (res.success && res.data?.viewUrl) {
        await navigator.clipboard.writeText(res.data.viewUrl);
        markCopied();
        addToast('Private statement link generated & copied! 🔗', 'success');
        setIsOpen(false);
      }
    } catch (err) {
      addToast(err.message || 'Failed to generate share link', 'error');
    } finally {
      setGeneratingLink(false);
    }
  };

  // 4. Generate or Copy Level 2 Claim Invite Link
  const handleInviteLink = async () => {
    try {
      setGeneratingInvite(true);
      const res = await api.post(`/groups/${group.id}/people/${person.id}/invite`);
      if (res.success && res.data?.inviteUrl) {
        await navigator.clipboard.writeText(res.data.inviteUrl);
        markCopied();
        addToast(`Invite link copied for ${person.name}! Valid for 7 days. ✉️`, 'success');
        setIsOpen(false);
      }
    } catch (err) {
      addToast(err.message || 'Failed to generate invite link', 'error');
    } finally {
      setGeneratingInvite(false);
    }
  };

  // 5. Direct Share to WhatsApp
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(getShortText());
    let cleanPhone = (person.phone || '').replace(/[^0-9]/g, '');

    // Format Indian numbers if 10 digits without country code
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  };

  const handleDeletePerson = async () => {
    if (!window.confirm(`Are you sure you want to remove ${person.name} from this group?`)) {
      return;
    }
    try {
      setDeletingPerson(true);
      const res = await api.delete(`/groups/${group.id}/people/${person.id}`);
      if (res.success) {
        addToast(`${person.name} removed from group`, 'success');
        setIsOpen(false);
        onDeleted?.();
      }
    } catch (err) {
      const isHistory =
        err.code === 'PERSON_HAS_HISTORY' ||
        err.response?.data?.error?.code === 'PERSON_HAS_HISTORY';
      const msg = isHistory
        ? `Cannot remove ${person.name}: they have recorded expenses or payments. Delete or reassign their expenses and payments first.`
        : (err.message || 'Failed to remove member');
      addToast(msg, 'error');
    } finally {
      setDeletingPerson(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <m.button
        type="button"
        whileTap={{ scale: 0.95 }}
        transition={springs.snappy}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-surface-raised text-text-muted hover:text-text border border-border transition-colors shadow-xs cursor-pointer"
        title="Share & Copy Statement"
      >
        <AnimatePresence mode="wait" initial={false}>
          {justCopied ? (
            <m.span
              key="copied-check"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={springs.snappy}
              className="flex items-center text-emerald-500"
            >
              <Check className="w-3.5 h-3.5" />
            </m.span>
          ) : (
            <m.span
              key="copy-icon"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={springs.snappy}
              className="flex items-center"
            >
              <Copy className="w-3.5 h-3.5 text-text-muted" />
            </m.span>
          )}
        </AnimatePresence>
        <span className={justCopied ? 'text-emerald-500 font-bold' : ''}>
          {justCopied ? 'Copied!' : 'Share'}
        </span>
        <m.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={springs.snappy}
          className="inline-flex items-center text-text-muted"
        >
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </m.span>
      </m.button>

      {/* Floating Menu */}
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: -4,
              transition: { duration: durations.fast },
            }}
            transition={springs.snappy}
            style={{ borderRadius: 12 }}
            className="absolute right-0 mt-1.5 w-56 bg-surface border border-border shadow-2xl py-1.5 z-30 backdrop-blur-xl text-xs space-y-0.5 transition-colors overflow-hidden"
          >
            <m.button
              whileTap={{ scale: 0.98 }}
              onClick={handleCopyShort}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:bg-surface-raised transition-colors cursor-pointer"
            >
              <AlignLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold block">Copy Short</span>
                <span className="text-[10px] text-text-muted block">Total, paid & remaining</span>
              </div>
            </m.button>

            <m.button
              whileTap={{ scale: 0.98 }}
              onClick={handleCopyDetailed}
              disabled={loadingStatement}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <div>
                <span className="font-semibold block">
                  {loadingStatement ? 'Loading...' : 'Copy Detailed (WhatsApp)'}
                </span>
                <span className="text-[10px] text-text-muted block">Itemized expenses & dates</span>
              </div>
            </m.button>

            {isHost && !person.isHost && (
              <>
                <m.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleShareLink}
                  disabled={generatingLink}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <span className="font-semibold block">
                      {generatingLink
                        ? 'Generating...'
                        : person.shareEnabled
                        ? 'Regenerate View Link'
                        : 'Generate View Link'}
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      {person.shareEnabled ? 'Replaces old link' : 'Private read-only link'}
                    </span>
                  </div>
                </m.button>

                {person.linkedUserId ? (
                  <div className="px-3 py-2 flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-lg mx-1">
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-bold block">Account Linked</span>
                      <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block">
                        Claimed by SplitOrbit user
                      </span>
                    </div>
                  </div>
                ) : (
                  <m.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleInviteLink}
                    disabled={generatingInvite}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <span className="font-semibold block">
                        {generatingInvite ? 'Generating...' : 'Invite to Claim Account'}
                      </span>
                      <span className="text-[10px] text-text-muted block">
                        Single-use invite link (7 days)
                      </span>
                    </div>
                  </m.button>
                )}
              </>
            )}

            <div className="h-px bg-border my-1" />

            <m.button
              whileTap={{ scale: 0.98 }}
              onClick={handleShareWhatsApp}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors font-semibold cursor-pointer"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>Share on WhatsApp</span>
            </m.button>

            {isHost && !person.isHost && (
              <>
                <div className="h-px bg-border my-1" />
                <m.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDeletePerson}
                  disabled={deletingPerson}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>{deletingPerson ? 'Removing...' : 'Remove Member'}</span>
                </m.button>
              </>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
