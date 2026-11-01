/**
 * SplitOrbit Chart Mathematics & Formatting Helpers
 * Pure utility functions for scale projection, tick generation,
 * Indian currency formatting, and accessible chart summaries.
 */

/**
 * Format a number into compact Indian Rupee format (e.g. ₹1.2L, ₹45K, ₹900).
 * @param {number} value - The value to format.
 * @param {boolean} isPaise - Whether the input value is in integer paise.
 * @returns {string} Formatted compact string.
 */
export function formatCompactINR(value, isPaise = false) {
  if (value === null || value === undefined || isNaN(value)) return '₹0';
  const val = isPaise ? Number(value) / 100 : Number(value);
  if (val === 0) return '₹0';

  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);

  let formatted = '';
  if (abs >= 10000000) { // 1 Crore
    const cr = abs / 10000000;
    formatted = `${cleanDecimals(cr, 2)}Cr`;
  } else if (abs >= 100000) { // 1 Lakh
    const l = abs / 100000;
    formatted = `${cleanDecimals(l, 2)}L`;
  } else if (abs >= 1000) { // Thousand
    const k = abs / 1000;
    formatted = `${cleanDecimals(k, 1)}K`;
  } else {
    formatted = `${Math.round(abs)}`;
  }

  return `${sign}₹${formatted}`;
}

/**
 * Helper to strip trailing zeros after decimal point
 */
function cleanDecimals(num, maxDigits) {
  const rounded = num.toFixed(maxDigits);
  return rounded.replace(/\.?0+$/, '');
}

/**
 * Format a number into full Indian-grouped currency (e.g. ₹1,25,000.50).
 * @param {number} value - The value to format.
 * @param {boolean} isPaise - Whether the input value is in integer paise.
 * @param {number} decimals - Minimum and maximum decimal places (default: 0).
 * @returns {string}
 */
export function formatFullINR(value, isPaise = false, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return '₹0';
  const val = isPaise ? Number(value) / 100 : Number(value);
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);

  const formattedNumber = abs.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${sign}₹${formattedNumber}`;
}

/**
 * Linear scale mapping a domain [d0, d1] to range [r0, r1].
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {Function} scale function with .invert(r) method
 */
export function linearScale([d0, d1], [r0, r1]) {
  const dSpan = d1 - d0;
  const rSpan = r1 - r0;

  const scale = function (val) {
    if (dSpan === 0) return (r0 + r1) / 2;
    return r0 + ((val - d0) / dSpan) * rSpan;
  };

  scale.invert = function (rangeVal) {
    if (rSpan === 0) return (d0 + d1) / 2;
    return d0 + ((rangeVal - r0) / rSpan) * dSpan;
  };

  scale.domain = () => [d0, d1];
  scale.range = () => [r0, r1];

  return scale;
}

/**
 * Helper for nice numbers algorithm.
 */
function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }

  return niceFraction * Math.pow(10, exponent);
}

/**
 * Generate nice human-readable tick values between min and max.
 * @param {number} min
 * @param {number} max
 * @param {number} [count=5]
 * @returns {number[]} Array of tick values
 */
export function getNiceTicks(min, max, count = 5) {
  if (min === max) return [min];
  if (min > max) [min, max] = [max, min];

  const range = niceNum(max - min, false);
  const step = niceNum(range / (count - 1), true);
  if (step === 0) return [min];

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks = [];
  // Cap at 20 ticks to guard against precision loops
  for (let t = niceMin; t <= niceMax + step * 0.5 && ticks.length < 20; t += step) {
    // Avoid floating point jitter
    const precision = Math.max(0, -Math.floor(Math.log10(step)));
    ticks.push(Number(t.toFixed(precision)));
  }

  return ticks;
}

/**
 * Accessible Summary Builders
 */

/**
 * Builds an accessible summary for diverging horizontal bars.
 * @param {Array<{ name: string, net: number }>} balances
 * @returns {string}
 */
export function buildDivergingBarsSummary(balances = []) {
  if (!balances || balances.length === 0) return 'No payments recorded in this group.';
  const statements = balances.map((b) => {
    const net = Number(b.net) || 0;
    if (net < 0) {
      return `${b.name} needs to pay ${formatFullINR(Math.abs(net), true)}`;
    } else if (net > 0) {
      return `${b.name} receives ${formatFullINR(net, true)}`;
    }
    return `${b.name} is all clear`;
  });
  return statements.join('. ') + '.';
}

/**
 * Builds an accessible summary for ring charts.
 * @param {Array<{ label: string, value: number }>} segments
 * @param {number} total
 * @returns {string}
 */
export function buildRingSummary(segments = [], total = 0) {
  if (!segments || segments.length === 0 || total === 0) return 'No repayment data available.';
  const parts = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const pct = Math.round((s.value / total) * 100);
      return `${s.label}: ${formatFullINR(s.value, true)} (${pct}%)`;
    });
  return `Total ${formatFullINR(total, true)}. ` + parts.join(', ') + '.';
}

/**
 * Builds an accessible summary for repayment pace / area line charts.
 * @param {Array<{ date: string, collected?: number, totalOwed?: number, remaining?: number }>} series
 * @param {number} [target]
 * @returns {string}
 */
export function buildAreaLineSummary(series = [], target) {
  if (!series || series.length === 0) return 'No activity over time.';
  const count = series.length;
  const lastPoint = series[count - 1];
  if (lastPoint.collected !== undefined) {
    const collectedStr = formatFullINR(lastPoint.collected, true);
    const targetStr = target ? ` of ${formatFullINR(target, true)} to pay` : '';
    return `Repayment pace across ${count} data points. Total collected ${collectedStr}${targetStr}.`;
  }
  if (lastPoint.remaining !== undefined) {
    const remainingStr = formatFullINR(lastPoint.remaining, true);
    return `Payments trajectory across ${count} events. Current remaining amount is ${remainingStr}.`;
  }
  return `Timeline chart with ${count} data points.`;
}

/**
 * Builds an accessible summary for aging columns.
 * @param {Array<{ key: string, amount: number }>} buckets
 * @returns {string}
 */
export function buildColumnBarsSummary(buckets = []) {
  if (!buckets || buckets.length === 0) return 'No pending payments aging data.';
  const details = buckets.map((b) => `${b.key} days: ${formatFullINR(b.amount, true)}`);
  return 'Pending payments aging: ' + details.join(', ') + '.';
}

/**
 * Builds an accessible summary for status stacked bars.
 * @param {Array<{ label: string, count: number, amount: number }>} items
 * @returns {string}
 */
export function buildStackedBarSummary(items = []) {
  if (!items || items.length === 0) return 'No payments data recorded.';
  const parts = items.map((i) => `${i.count} ${i.label} (${formatFullINR(i.amount, true)})`);
  return 'Payments breakdown: ' + parts.join(', ') + '.';
}
