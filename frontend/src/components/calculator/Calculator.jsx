import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Calculator as CalcIcon,
  X,
  History,
  Users,
  Check,
  Delete,
  Info,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { springs, durations, easings } from '../../motion/tokens.js';
import { safeEvaluate, calculateSplitBreakdown } from '../../utils/mathParser.js';
import { useToast } from '../../context/ToastContext.jsx';
import { lockBodyScroll, unlockBodyScroll } from '../../utils/overlayManager.js';

export default function Calculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('calc'); // 'calc' | 'split'
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasTargetInput, setHasTargetInput] = useState(false);

  // Split mode state
  const [splitTotal, setSplitTotal] = useState('');
  const [splitCount, setSplitCount] = useState('3');
  const [splitBreakdown, setSplitBreakdown] = useState(null);

  const { addToast } = useToast();
  const panelRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const lastFocusedInputRef = useRef(null);

  // 1. Track last focused amount input at document level
  useEffect(() => {
    const handleFocusIn = (e) => {
      const target = e.target;
      if (
        target &&
        typeof target.matches === 'function' &&
        target.matches('input[data-amount-input], textarea[data-amount-input]')
      ) {
        lastFocusedInputRef.current = target;
        setHasTargetInput(true);
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, []);

  // Check if tracked target is still connected whenever calculator opens
  useEffect(() => {
    if (isOpen) {
      if (lastFocusedInputRef.current && document.body.contains(lastFocusedInputRef.current)) {
        setHasTargetInput(true);
      } else {
        lastFocusedInputRef.current = null;
        setHasTargetInput(false);
      }
      // Lock scroll on mobile screens when panel is open
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        lockBodyScroll();
      }
    } else {
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        unlockBodyScroll();
      }
    }
    return () => {
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        unlockBodyScroll();
      }
    };
  }, [isOpen]);

  // Hide floating calculator button whenever a modal or bottom sheet is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const checkModal = () => {
      const open = document.body.hasAttribute('data-modal-open');
      setIsModalOpen(open);
      if (open && isOpen) {
        setIsOpen(false);
      }
    };
    checkModal();
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-modal-open'] });
    return () => observer.disconnect();
  }, [isOpen]);

  // Global custom event triggers so other components (Navbar, modals) can toggle or open calculator
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleToggle = () => setIsOpen((prev) => !prev);
    const handleClose = () => setIsOpen(false);

    window.addEventListener('splitorbit:open-calculator', handleOpen);
    window.addEventListener('splitorbit:toggle-calculator', handleToggle);
    window.addEventListener('splitorbit:close-calculator', handleClose);
    window.addEventListener('splittrack:open-calculator', handleOpen);
    window.addEventListener('splittrack:toggle-calculator', handleToggle);
    window.addEventListener('splittrack:close-calculator', handleClose);

    return () => {
      window.removeEventListener('splitorbit:open-calculator', handleOpen);
      window.removeEventListener('splitorbit:toggle-calculator', handleToggle);
      window.removeEventListener('splitorbit:close-calculator', handleClose);
      window.removeEventListener('splittrack:open-calculator', handleOpen);
      window.removeEventListener('splittrack:toggle-calculator', handleToggle);
      window.removeEventListener('splittrack:close-calculator', handleClose);
    };
  }, []);

  // 2. Live evaluation of expression as user types
  useEffect(() => {
    if (!expression.trim()) {
      setResult(null);
      setError(null);
      return;
    }

    const evalRes = safeEvaluate(expression);
    if (evalRes.success) {
      setResult(evalRes.result);
      setError(null);
    } else {
      // Don't show premature errors while typing (e.g., trailing operator)
      if (!/[+\-*/%]$/.test(expression.trim())) {
        setError(evalRes.error);
      }
    }
  }, [expression]);

  // 3. Recalculate split mode
  useEffect(() => {
    if (activeTab === 'split') {
      try {
        const bd = calculateSplitBreakdown(splitTotal, splitCount);
        setSplitBreakdown(bd);
      } catch (err) {
        setSplitBreakdown(null);
      }
    }
  }, [splitTotal, splitCount, activeTab]);

  // 4. Keyboard support & outside click listener
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e) => {
      if (
        (panelRef.current && panelRef.current.contains(e.target)) ||
        (toggleBtnRef.current && toggleBtnRef.current.contains(e.target)) ||
        (e.target && typeof e.target.closest === 'function' && e.target.closest('[data-calculator-trigger]'))
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (activeTab !== 'calc') return;

      // Don't intercept typing if user focuses an actual input inside the calculator
      if (e.target && e.target.tagName === 'INPUT') {
        return;
      }

      const key = e.key;
      if ('0123456789.()'.includes(key)) {
        e.preventDefault();
        setExpression((prev) => prev + key);
      } else if (['+', '-', '*', '/', '%'].includes(key)) {
        e.preventDefault();
        const opMap = { '*': '×', '/': '÷', '-': '−' };
        setExpression((prev) => prev + (opMap[key] || key));
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeTab, expression, result]);

  // 5. Accessible Focus Trap inside the panel
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleTabTrap = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = panelRef.current.querySelectorAll(focusableSelectors);
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    const el = panelRef.current;
    el.addEventListener('keydown', handleTabTrap);
    return () => {
      el.removeEventListener('keydown', handleTabTrap);
    };
  }, [isOpen, activeTab, showHistory]);

  const handleAppend = (char) => {
    setExpression((prev) => prev + char);
  };

  const handleClear = () => {
    setExpression('');
    setResult(null);
    setError(null);
  };

  const handleBackspace = () => {
    setExpression((prev) => prev.slice(0, -1));
  };

  const handleEquals = () => {
    if (!expression.trim()) return;

    const evalRes = safeEvaluate(expression);
    if (evalRes.success) {
      const finalRes = evalRes.result;
      setResult(finalRes);
      setError(null);

      // Save to session history (max 10 items)
      if (finalRes !== null && !isNaN(finalRes)) {
        setHistory((prev) => [
          { expression, result: finalRes, timestamp: new Date() },
          ...prev.slice(0, 9),
        ]);
      }
      setExpression(String(finalRes));
    } else {
      setError(evalRes.error || 'Syntax error');
    }
  };

  const handleUseResult = (valueToUse) => {
    const rawVal = valueToUse !== undefined ? valueToUse : result;
    if (rawVal === null || rawVal === undefined || isNaN(Number(rawVal))) return;

    const num = Number(rawVal);
    // Convert to paise correctly: Math.round(result * 100)
    const paise = Math.round(num * 100);
    const rupeesFormatted = (paise / 100).toFixed(2);

    const targetInput = lastFocusedInputRef.current;
    if (targetInput && document.body.contains(targetInput)) {
      // Native HTMLInputElement value setter to trigger React controlled input updates
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(targetInput, rupeesFormatted);
      } else {
        targetInput.value = rupeesFormatted;
      }

      // Dispatch bubbling input and change events
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));

      addToast(`Filled ₹${rupeesFormatted} into amount input!`, 'success');
      setIsOpen(false);
      return;
    }

    // Fallback: Copy to clipboard if no input was targeted
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(rupeesFormatted);
      addToast(`Copied ₹${rupeesFormatted} to clipboard!`, 'info');
    }
  };

  const portalContent = (
    <div className="splitorbit-calculator-root">
      {/* Floating Action Button (FAB) - Clear of mobile bottom nav and FAB */}
      <m.button
        ref={toggleBtnRef}
        type="button"
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        transition={springs.snappy}
        data-calculator-trigger="true"
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? "Close Calculator" : "Open Calculator"}
        aria-label="Open financial calculator"
        aria-expanded={isOpen}
        className={`fixed bottom-6 left-4 sm:left-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-2xl transition-all duration-200 flex items-center justify-center border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          isModalOpen ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100'
        } ${
          isOpen
            ? 'bg-slate-800 text-white border-slate-700 rotate-90 shadow-slate-900/40'
            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-emerald-500/25'
        }`}
      >
        <CalcIcon className="w-6 h-6 stroke-[2.2]" />
      </m.button>

      {/* Floating Calculator Panel */}
      <AnimatePresence>
        {isOpen && (
          <m.div
            key="calculator-floating-panel"
            ref={panelRef}
            role="dialog"
            aria-label="Financial Calculator"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.94,
              y: 12,
              transition: { duration: durations.fast, ease: easings.easeIn },
            }}
            transition={{
              type: 'spring',
              damping: 26,
              stiffness: 340,
              mass: 0.9,
            }}
            className="fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-24 sm:left-6 z-50 w-full sm:w-[360px] bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col max-h-[88vh] sm:max-h-[640px] text-slate-900 dark:text-slate-100 transition-colors ring-1 ring-border/50"
          >
          {/* Top Header & Tabs */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 shrink-0">
            {/* Mode switch */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setActiveTab('calc');
                  setShowHistory(false);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'calc'
                    ? 'bg-brand-500 text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setActiveTab('split');
                  setShowHistory(false);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'split'
                    ? 'bg-brand-500 text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Split
              </button>
            </div>

            <div className="flex items-center gap-1">
              {activeTab === 'calc' && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowHistory((prev) => !prev)}
                  title="Session History"
                  aria-label="View calculation history"
                  className={`min-h-[36px] min-w-[36px] p-2 rounded-xl transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    showHistory
                      ? 'text-emerald-600 dark:text-brand-400 bg-slate-100 dark:bg-slate-800'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <History className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setIsOpen(false)}
                title="Close Calculator (Esc)"
                aria-label="Close calculator"
                className="min-h-[36px] min-w-[36px] p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* TAB 1: Standard Calculator */}
          {activeTab === 'calc' && (
            <div className="p-4 flex flex-col flex-1 space-y-3 overflow-y-auto">
              {/* History Drawer */}
              {showHistory ? (
                <div className="flex-1 min-h-[280px] max-h-[340px] overflow-y-auto space-y-2 pr-1">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Recent Calculations (Session)
                    </span>
                    {history.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setHistory([])}
                        className="text-[11px] text-rose-500 dark:text-rose-400 hover:underline focus:outline-none"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {history.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
                      No calculations recorded in this session.
                    </div>
                  ) : (
                    history.map((h, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setExpression(String(h.result));
                          setShowHistory(false);
                        }}
                        className="w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <span className="text-xs text-slate-500 dark:text-slate-400 block truncate font-mono tabular-nums">
                          {h.expression}
                        </span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-brand-400 font-mono tabular-nums">
                          = {h.result}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <>
                  {/* Digital Display: 2 lines (Expression + Result Preview) */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/90 text-right space-y-1">
                    <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 h-5 overflow-x-auto whitespace-nowrap">
                      {expression || '0'}
                    </div>
                    <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white tracking-tight h-8 overflow-x-auto whitespace-nowrap flex items-center justify-end">
                      {result !== null ? (
                        <span>= {result}</span>
                      ) : error ? (
                        <span className="text-rose-500 dark:text-rose-400 text-xs font-sans font-medium">{error}</span>
                      ) : (
                        ''
                      )}
                    </div>
                  </div>

                  {/* "Use Result" CTA */}
                  <button
                    type="button"
                    disabled={result === null || !hasTargetInput}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleUseResult()}
                    title={
                      hasTargetInput
                        ? `Fill ₹${result !== null ? result : ''} into focused field`
                        : 'Focus an amount field on the page to insert'
                    }
                    className={`w-full min-h-[44px] py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      result !== null && hasTargetInput
                        ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 shadow-sm cursor-pointer'
                        : 'bg-slate-100 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    <span>
                      {result !== null
                        ? hasTargetInput
                          ? `Use result in amount field (₹${result})`
                          : `Focus an amount field to insert (₹${result})`
                        : 'Enter calculation'}
                    </span>
                  </button>

                  {/* Keypad Grid */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {/* Row 1 */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleClear}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-xs bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
                    >
                      C
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('(')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-semibold text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      (
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend(')')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-semibold text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      )
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('÷')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-base bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      ÷
                    </button>

                    {/* Row 2 */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('7')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      7
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('8')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      8
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('9')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      9
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('×')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-base bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      ×
                    </button>

                    {/* Row 3 */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('4')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      4
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('5')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      5
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('6')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      6
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('−')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-base bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      −
                    </button>

                    {/* Row 4 */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('1')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      1
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('2')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      2
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('3')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      3
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('+')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-base bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      +
                    </button>

                    {/* Row 5: 0, ., %, Backspace */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('0')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-sm bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('.')}
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-base bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 text-slate-900 dark:text-white transition border border-slate-200 dark:border-slate-800/80 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 font-mono tabular-nums cursor-pointer"
                    >
                      .
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAppend('%')}
                      aria-label="Percentage"
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-base bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-brand-400 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleBackspace}
                      aria-label="Backspace"
                      className="min-h-[44px] min-w-[44px] rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-rose-500 dark:hover:text-rose-400 active:scale-95 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    >
                      <Delete className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Equal Action Button */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleEquals}
                    className="w-full min-h-[44px] rounded-xl font-black text-lg bg-brand-500 hover:bg-brand-400 text-slate-950 transition shadow-lg shadow-brand-500/25 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    =
                  </button>
                </>
              )}
            </div>
          )}

          {/* TAB 2: Split Mode */}
          {activeTab === 'split' && (
            <div className="p-4 flex flex-col flex-1 space-y-4 overflow-y-auto">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Total Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 100.00"
                    value={splitTotal}
                    onChange={(e) => setSplitTotal(e.target.value)}
                    data-amount-input="true"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Number of People
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 3"
                    value={splitCount}
                    onChange={(e) => setSplitCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono tabular-nums"
                  />
                </div>
              </div>

              {/* Split Breakdown */}
              {splitBreakdown && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Divided Parts:</span>
                    <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
                      ₹{splitBreakdown.perPersonRupees[0]} / person
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {splitBreakdown.perPersonRupees.map((amt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono tabular-nums"
                      >
                        <span className="font-sans text-xs">Person {idx + 1}</span>
                        <span className="font-bold text-slate-900 dark:text-white">₹{amt}</span>
                      </div>
                    ))}
                  </div>

                  {splitBreakdown.remainderPaise > 0 && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-500/20 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        Remainder of {splitBreakdown.remainderPaise} paise distributed 1-by-1 to
                        guarantee exact sum of ₹
                        {(splitBreakdown.totalPaise / 100).toFixed(2)}.
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!hasTargetInput}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleUseResult(splitBreakdown.perPersonRupees[0])}
                    className={`w-full min-h-[44px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      hasTargetInput
                        ? 'bg-brand-500 text-slate-950 hover:bg-brand-400 shadow-md shadow-brand-500/20 cursor-pointer'
                        : 'bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {hasTargetInput
                        ? `Use per-person amount (₹${splitBreakdown.perPersonRupees[0]})`
                        : `Focus an amount field to insert (₹${splitBreakdown.perPersonRupees[0]})`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </m.div>
      )}
    </AnimatePresence>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(portalContent, document.body) : null;
}
