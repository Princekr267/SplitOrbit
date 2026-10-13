import React, { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Table, BarChart2, RefreshCw, AlertCircle, Inbox } from 'lucide-react';
import { fadeUp } from '../../motion/variants.js';
import { springs } from '../../motion/tokens.js';
import { useHoverCapable } from '../../motion/useHoverCapable.js';

/**
 * Reusable Chart Container Card.
 * Includes title, subtitle, optional legend, accessible "View as table" toggle,
 * chart-shaped loading skeleton with transform-based shimmer, empty state,
 * error state with retry, and hover-lift on pointer-fine devices.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  loading = false,
  error = null,
  onRetry,
  empty = false,
  emptyMessage = 'No data available for this chart yet.',
  emptyAction = null,
  tableData = null, // { caption: string, headers: string[], rows: any[][] }
  children,
  className = '',
  minHeight = '320px',
}) {
  const [showTable, setShowTable] = useState(false);
  const isHoverCapable = useHoverCapable();

  return (
    <m.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-10%' }}
      className={`glass-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-shadow duration-200 ${
        isHoverCapable ? 'hover:shadow-lg hover:border-border/80' : ''
      } ${className}`}
      style={{ minHeight }}
    >
      {/* Header section */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0 pr-2">
          {title && (
            <h3 className="text-sm sm:text-base font-semibold text-text tracking-tight leading-snug">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tableData && !loading && !error && !empty && (
            <button
              type="button"
              onClick={() => setShowTable((prev) => !prev)}
              aria-expanded={showTable}
              aria-label={showTable ? 'Switch to graphical chart' : 'View chart data as table'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-raised text-text-muted hover:text-text transition-colors min-h-[36px]"
            >
              {showTable ? (
                <>
                  <BarChart2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Chart</span>
                </>
              ) : (
                <>
                  <Table className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Table</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Dedicated Legend Bar */}
      {legend && !showTable && !loading && !error && !empty && (
        <div className="mb-3 pt-2 border-t border-border/40 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
          {legend}
        </div>
      )}

      {/* Main body area */}
      <div className="flex-1 flex flex-col justify-center relative min-h-[220px]">
        {loading ? (
          /* Transform-based shimmer skeleton */
          <div className="w-full h-full flex flex-col justify-center items-center py-6 space-y-4">
            <div className="w-full h-44 rounded-xl bg-surface-raised relative overflow-hidden">
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-text/5 to-transparent -translate-x-full animate-[shimmer_1.6s_infinite]"
                style={{
                  animation: 'shimmer 1.8s infinite',
                }}
              />
            </div>
            <div className="w-1/2 h-3 rounded-md bg-surface-raised" />
          </div>
        ) : error ? (
          /* Error State */
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center">
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-medium text-text">
                {typeof error === 'string' ? error : 'Unable to render chart'}
              </p>
              <p className="text-xs text-text-muted">
                Something went wrong loading this visualization.
              </p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-raised hover:bg-border text-text transition-colors min-h-[44px] min-w-[44px]"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        ) : empty ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-surface-raised text-text-muted flex items-center justify-center">
              <Inbox className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-xs sm:text-sm font-medium text-text-muted max-w-xs">
              {emptyMessage}
            </p>
            {emptyAction && <div className="pt-1">{emptyAction}</div>}
          </div>
        ) : showTable && tableData ? (
          /* Accessible Data Table View */
          <div className="w-full overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              {tableData.caption && (
                <caption className="sr-only">{tableData.caption}</caption>
              )}
              <thead className="bg-surface-raised border-b border-border text-text-muted">
                <tr>
                  {tableData.headers.map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tableData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-surface-raised/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-text font-mono tabular-nums">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Graphic Chart View */
          <div className="w-full h-full flex flex-col justify-center items-center">
            {children}
          </div>
        )}
      </div>
    </m.div>
  );
}

export default ChartCard;
