import React, { useState } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { easings, springs } from '../../motion/tokens.js';
import { formatFullINR, buildDivergingBarsSummary } from '../../utils/chartMath.js';
import { ChartTooltip } from './ChartTooltip.jsx';

/**
 * Diverging Horizontal Bars per person.
 * Centered on a zero axis: owes to the left (danger), owed to the right (success).
 * Shows top 6 by default with smooth expander.
 * On hover/focus, other rows dim to 0.55 opacity.
 *
 * @param {Array<{ personId: string, name: string, username?: string, net: number }>} balances
 * @param {string} [summary]
 */
export function DivergingBars({ balances = [], summary = '' }) {
  const prefersReducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipData, setTooltipData] = useState(null);

  const accessibleSummary = summary || buildDivergingBarsSummary(balances);

  if (!balances || balances.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-text-muted">
        No participant balances recorded.
      </div>
    );
  }

  // Calculate maximum absolute net for symmetrical scale
  const maxAbsNet = Math.max(
    1,
    ...balances.map((b) => Math.abs(Number(b.net) || 0))
  );

  const displayedRows = expanded ? balances : balances.slice(0, 6);
  const hasMore = balances.length > 6;

  const handleFocusRow = (item, e) => {
    setHoveredId(item.personId);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipData({
      item,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = Math.min(displayedRows.length - 1, index + 1);
      const nextEl = document.getElementById(`diverging-row-${displayedRows[nextIdx].personId}`);
      nextEl?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = Math.max(0, index - 1);
      const prevEl = document.getElementById(`diverging-row-${displayedRows[prevIdx].personId}`);
      prevEl?.focus();
    } else if (e.key === 'Escape') {
      setHoveredId(null);
      setTooltipData(null);
    }
  };

  return (
    <div
      role="img"
      aria-label={accessibleSummary}
      className="w-full space-y-2 select-none"
    >
      {/* Zero-axis indicator bar */}
      <div className="relative flex items-center justify-between text-[10px] text-text-muted font-medium px-2 py-0.5 border-b border-border/60">
        <span className="text-danger">← To Pay</span>
        <span className="font-semibold text-text">Zero (₹0)</span>
        <span className="text-success">To Receive →</span>
      </div>

      <div className="space-y-1.5 py-1">
        {displayedRows.map((person, idx) => {
          const net = Number(person.net) || 0;
          const isOwes = net < 0;
          const isOwed = net > 0;
          const absNet = Math.abs(net);
          const barWidthPercent = (absNet / maxAbsNet) * 50; // max 50% width from center

          const isDimmed = hoveredId !== null && hoveredId !== person.personId;

          return (
            <div
              key={person.personId || person.name}
              id={`diverging-row-${person.personId}`}
              tabIndex={0}
              role="button"
              aria-label={`${person.name}: ${net < 0 ? 'to pay' : net > 0 ? 'to receive' : 'all clear'} ${formatFullINR(absNet, true)}`}
              onPointerEnter={(e) => handleFocusRow(person, e)}
              onPointerLeave={() => {
                setHoveredId(null);
                setTooltipData(null);
              }}
              onFocus={(e) => handleFocusRow(person, e)}
              onBlur={() => {
                setHoveredId(null);
                setTooltipData(null);
              }}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-opacity duration-150 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${
                isDimmed ? 'opacity-55' : 'opacity-100'
              }`}
            >
              {/* Name & Username column (left 35% on mobile, 30% desktop) */}
              <div className="w-28 sm:w-36 flex-shrink-0 text-left truncate">
                <span className="text-xs font-semibold text-text block truncate">
                  {person.name}
                </span>
                {person.username && (
                  <span className="text-[10px] text-text-muted block truncate font-mono">
                    @{person.username}
                  </span>
                )}
              </div>

              {/* Bar visualization (middle flex-1 with center axis at 50%) */}
              <div className="flex-1 h-6 relative flex items-center bg-surface-raised/40 rounded">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />

                {/* Left bar (To Pay - danger) */}
                {isOwes && (
                  <div className="absolute right-1/2 h-4 flex items-center justify-end pr-0.5">
                    <m.div
                      initial={
                        prefersReducedMotion
                          ? { width: `${barWidthPercent}%`, opacity: 0 }
                          : { width: 0, opacity: 0 }
                      }
                      whileInView={
                        prefersReducedMotion
                          ? { opacity: 1, transition: { duration: 0.15 } }
                          : {
                              width: `${barWidthPercent}%`,
                              opacity: 1,
                              transition: {
                                duration: 0.6,
                                delay: idx * 0.06,
                                ease: easings.premium,
                              },
                            }
                      }
                      viewport={{ once: true, margin: '-10%' }}
                      className="h-full bg-danger rounded-l-md"
                    />
                  </div>
                )}

                {/* Right bar (To Receive - success) */}
                {isOwed && (
                  <div className="absolute left-1/2 h-4 flex items-center justify-start pl-0.5">
                    <m.div
                      initial={
                        prefersReducedMotion
                          ? { width: `${barWidthPercent}%`, opacity: 0 }
                          : { width: 0, opacity: 0 }
                      }
                      whileInView={
                        prefersReducedMotion
                          ? { opacity: 1, transition: { duration: 0.15 } }
                          : {
                              width: `${barWidthPercent}%`,
                              opacity: 1,
                              transition: {
                                duration: 0.6,
                                delay: idx * 0.06,
                                ease: easings.premium,
                              },
                            }
                      }
                      viewport={{ once: true, margin: '-10%' }}
                      className="h-full bg-success rounded-r-md"
                    />
                  </div>
                )}

                {/* Settled pip if net == 0 */}
                {net === 0 && (
                  <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-text-muted/40" />
                )}
              </div>

              {/* Amount Label column */}
              <div className="w-20 sm:w-24 flex-shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
                {isOwes && <span className="text-danger">-{formatFullINR(absNet, true)}</span>}
                {isOwed && <span className="text-success">+{formatFullINR(absNet, true)}</span>}
                {net === 0 && <span className="text-text-muted">₹0</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show all / Collapse expander button */}
      {hasMore && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors rounded-lg hover:bg-surface-raised min-h-[44px]"
          >
            <span>{expanded ? 'Show top 6' : `Show all ${balances.length} members`}</span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      {/* Tooltip */}
      <ChartTooltip
        open={Boolean(tooltipData)}
        x={tooltipData?.x || 0}
        y={tooltipData?.y || 0}
        announcement={
          tooltipData
            ? `${tooltipData.item.name}: ${
                Number(tooltipData.item.net) < 0
                  ? 'To pay ' + formatFullINR(Math.abs(tooltipData.item.net), true)
                  : Number(tooltipData.item.net) > 0
                  ? 'To receive ' + formatFullINR(tooltipData.item.net, true)
                  : 'All clear'
              }`
            : ''
        }
      >
        {tooltipData && (
          <div className="space-y-1">
            <div className="font-semibold text-text">{tooltipData.item.name}</div>
            <div className="text-[11px] text-text-muted">
              {Number(tooltipData.item.net) < 0
                ? 'Remaining due to group'
                : Number(tooltipData.item.net) > 0
                ? 'Credit to collect from group'
                : 'All square'}
            </div>
            <div
              className={`font-mono font-bold text-sm ${
                Number(tooltipData.item.net) < 0
                  ? 'text-danger'
                  : Number(tooltipData.item.net) > 0
                  ? 'text-success'
                  : 'text-text-muted'
              }`}
            >
              {Number(tooltipData.item.net) < 0 && '-'}
              {Number(tooltipData.item.net) > 0 && '+'}
              {formatFullINR(Math.abs(Number(tooltipData.item.net)), true)}
            </div>
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}

export default DivergingBars;
