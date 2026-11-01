/**
 * Formats integer paise into Indian Rupee display (e.g. 10050 -> "₹100.50").
 * 
 * @param {number} paise - Amount in integer paise
 * @param {object} [options]
 * @param {boolean} [options.showSign=false] - If true, prefixes '+' for positive amounts
 * @param {boolean} [options.hideSymbol=false]
 * @returns {string}
 */
export function formatINR(paise, { showSign = false, hideSymbol = false } = {}) {
  if (paise === null || paise === undefined || isNaN(paise)) {
    return hideSymbol ? '0.00' : '₹0.00';
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = absPaise / 100;

  // Format using Indian numbering system
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const symbol = hideSymbol ? '' : '₹';

  if (isNegative) {
    return `-${symbol}${formatted}`;
  }
  if (showSign && paise > 0) {
    return `+${symbol}${formatted}`;
  }
  return `${symbol}${formatted}`;
}

/**
 * Converts a rupee input string/number to integer paise safely without floating point drift.
 * (e.g. "150.50" -> 15050)
 * 
 * @param {string|number} rupeeValue
 * @returns {number} Integer paise
 */
export function rupeesToPaise(rupeeValue) {
  if (rupeeValue === '' || rupeeValue === null || rupeeValue === undefined) {
    return 0;
  }
  const clean = String(rupeeValue).trim().replace(/,/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;

  return Math.round(num * 100);
}

/**
 * Converts integer paise to decimal rupees string for input fields.
 * (e.g. 15050 -> "150.50")
 * 
 * @param {number} paise
 * @returns {string}
 */
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return '';
  return (paise / 100).toFixed(2);
}

/**
 * Semantic money language helper:
 * - Owes/Remaining: Danger color (Rose)
 * - Settled/Received: Success color (Emerald)
 * - Pending: Warning color (Amber)
 */
export function getBalanceVisuals(netPaise) {
  if (netPaise > 0) {
    return {
      status: 'owes',
      label: 'To Pay',
      colorClass: 'text-rose-600 dark:text-rose-400',
      bgClass: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300',
      badgeVariant: 'danger',
    };
  }
  if (netPaise < 0) {
    return {
      status: 'owed',
      label: 'To Receive',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
      badgeVariant: 'success',
    };
  }
  return {
    status: 'settled',
    label: 'All Clear',
    colorClass: 'text-text-muted',
    bgClass: 'bg-surface-raised border-border text-text-muted',
    badgeVariant: 'settled',
  };
}
