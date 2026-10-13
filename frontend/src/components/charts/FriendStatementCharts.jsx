import React from 'react';
import {
  ChartCard,
  RingChart,
  AreaLineChart,
} from './index.js';
import { formatFullINR, formatCompactINR } from '../../utils/chartMath.js';
import { CheckCircle2 } from 'lucide-react';

/**
 * Friend Statement Visualizations Component.
 * Used on both the logged-in Friend Dashboard and the public Share Link (/s/:token).
 * Displays own data only:
 * 1. "Your dues over time" area chart with hollow pending payment markers
 * 2. "Paid / pending / left" ring with accessible legend
 *
 * @param {object} analytics - Payload with { totals: { share, paid, pending, left }, series, pendingMarkers }
 * @param {boolean} loading
 * @param {string|null} error
 * @param {function} onRetry
 */
export function FriendStatementCharts({
  analytics,
  loading = false,
  error = null,
  onRetry,
}) {
  if (loading && !analytics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse select-none">
        <div className="h-64 rounded-2xl bg-surface-raised border border-border" />
        <div className="h-64 rounded-2xl bg-surface-raised border border-border" />
      </div>
    );
  }

  const totals = analytics?.totals || { share: 0, paid: 0, pending: 0, left: 0 };
  const series = analytics?.series || [];
  const pendingMarkers = analytics?.pendingMarkers || [];

  const ringTotal = totals.share > 0 ? totals.share : Math.max(1, totals.paid + totals.pending + totals.left);

  const ringSegments = [
    {
      key: 'paid',
      label: 'Paid & Approved',
      value: totals.paid,
      color: 'var(--chart-owed)',
    },
  ];

  const isSettled = totals.left === 0 && totals.pending === 0 && totals.paid > 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chart 1: Your dues over time */}
        <ChartCard
          title="Your Dues Over Time"
          subtitle="Remaining balance after each expense share and accepted repayment"
          error={error}
          onRetry={onRetry}
          empty={series.length === 0}
          emptyMessage="No transaction history to plot yet."
          tableData={{
            caption: 'Remaining dues trajectory',
            headers: ['Date', 'Event Description', 'Remaining Due'],
            rows: series.map((s) => [
              s.date,
              s.label || s.kind,
              formatFullINR(s.remaining, true),
            ]),
          }}
          legend={
            pendingMarkers.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-warning bg-surface inline-block shrink-0" />
                <span>Pending payment marker</span>
              </div>
            )
          }
        >
          <AreaLineChart
            series={series}
            pendingMarkers={pendingMarkers}
            height={210}
            color="var(--chart-primary)"
          />
        </ChartCard>

        {/* Chart 2: Paid / Pending / Left Ring */}
        <ChartCard
          title="Repayment Progress"
          subtitle={
            isSettled
              ? 'You have fully paid your share'
              : `${formatFullINR(totals.paid, true)} paid of ${formatFullINR(ringTotal, true)} total share`
          }
          error={error}
          onRetry={onRetry}
          empty={ringTotal === 0}
          emptyMessage="No costs recorded for your profile yet."
          tableData={{
            caption: 'Repayment breakdown',
            headers: ['Category', 'Amount'],
            rows: [
              ['Paid & Approved', formatFullINR(totals.paid, true)],
              totals.pending > 0
                ? ['Pending Approval', formatFullINR(totals.pending, true)]
                : null,
              ['Remaining Left to Pay', formatFullINR(totals.left, true)],
            ].filter(Boolean),
          }}
          legend={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
                <span className="text-text-muted">Paid:</span>
                <span className="font-mono font-medium text-text">
                  {formatCompactINR(totals.paid, true)}
                </span>
              </div>

              {totals.pending > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
                  <span className="text-text-muted">Pending approval:</span>
                  <span className="font-mono font-medium text-text">
                    {formatCompactINR(totals.pending, true)}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-600 shrink-0" />
                <span className="text-text-muted">Left to pay:</span>
                <span className="font-mono font-medium text-text">
                  {formatCompactINR(totals.left, true)}
                </span>
              </div>
            </div>
          }
        >
          {isSettled ? (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-success/10 text-success flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <span className="text-xl font-black text-text font-mono">100%</span>
              <span className="text-xs font-semibold text-success">
                All your dues are fully settled!
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <RingChart
                segments={ringSegments}
                total={ringTotal}
                size={190}
                strokeWidth={20}
              />
              {totals.pending > 0 && (
                <div className="mt-2 text-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-warning/10 text-warning border border-warning/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    {formatFullINR(totals.pending, true)} pending host verification
                  </span>
                </div>
              )}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

export default FriendStatementCharts;
