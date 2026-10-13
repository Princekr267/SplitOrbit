import React from 'react';
import {
  ChartCard,
  RingChart,
  DivergingBars,
  AreaLineChart,
  ColumnBars,
} from './index.js';
import { formatFullINR, formatCompactINR } from '../../utils/chartMath.js';
import { CheckCircle2 } from 'lucide-react';

/**
 * Host Group Page Animated Charts Section.
 * Implements the 5 core host visualizations:
 * 1. Who owes what (diverging bars across all members including host)
 * 2. Collected progress ring (collected, pending with hatch, remaining)
 * 3. Repayment pace (cumulative collected over days with target line)
 * 4. Cash vs Online mode breakdown (donut with count in center)
 * 5. Pending dues aging columns (0-3, 4-7, 8-14, 15+ days)
 *
 * @param {object} analytics - Full payload from GET /api/groups/:groupId/analytics
 * @param {boolean} loading
 * @param {string|null} error
 * @param {function} onRetry
 * @param {boolean} isSettled
 */
export function GroupChartsSection({
  analytics,
  loading = false,
  error = null,
  onRetry,
  isSettled = false,
}) {
  if (loading && !analytics) {
    return <GroupChartsSkeleton />;
  }

  const balances = analytics?.balances || [];
  const collected = analytics?.collected || { collected: 0, pending: 0, remaining: 0, totalOwed: 0 };
  const pace = analytics?.pace || [];
  const modes = analytics?.modes || { cash: { amount: 0, count: 0 }, online: { amount: 0, count: 0 } };
  const agingBuckets = analytics?.aging?.buckets || [];

  // 1. Ring Segments (Active filled slices; background track handles remaining)
  const ringSegments = [
    {
      key: 'collected',
      label: 'Collected',
      value: collected.collected,
      color: 'var(--chart-owed)',
    },
    ...(collected.pending > 0
      ? [
          {
            key: 'pending',
            label: 'Pending Approval',
            value: collected.pending,
            color: 'var(--chart-pending)',
          },
        ]
      : []),
  ];

  // 2. Mode Segments for Donut
  const totalModeAmount = (modes.cash?.amount || 0) + (modes.online?.amount || 0);
  const totalModeCount = (modes.cash?.count || 0) + (modes.online?.count || 0);
  const modeSegments = [
    {
      key: 'online',
      label: 'Online (UPI)',
      value: modes.online?.amount || 0,
      color: 'var(--chart-primary)',
    },
    {
      key: 'cash',
      label: 'Cash',
      value: modes.cash?.amount || 0,
      color: 'var(--chart-secondary)',
    },
  ];

  // Settled status detection
  const isFullyRecovered =
    isSettled || (collected.totalOwed > 0 && collected.remaining === 0 && collected.pending === 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 12-Column Responsive Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Chart 1: Who Owes What (Spans 2 columns on desktop) */}
        <ChartCard
          title="Who Owes What"
          subtitle="Net balance per member, centered on zero (includes host)"
          error={error}
          onRetry={onRetry}
          empty={balances.length === 0}
          emptyMessage="No balances recorded in this group yet."
          tableData={{
            caption: 'Net balance per member',
            headers: ['Member', 'Handle', 'Net Balance'],
            rows: balances.map((b) => [
              b.name,
              b.username ? `@${b.username}` : '—',
              formatFullINR(b.net, true),
            ]),
          }}
          className="lg:col-span-2"
        >
          <DivergingBars balances={balances} />
        </ChartCard>

        {/* Chart 2: Collected Progress Ring */}
        <ChartCard
          title="Collection Progress"
          subtitle={
            isFullyRecovered
              ? 'All dues settled up'
              : `${formatFullINR(collected.collected, true)} of ${formatFullINR(
                  collected.totalOwed,
                  true
                )} total owed`
          }
          error={error}
          onRetry={onRetry}
          empty={collected.totalOwed === 0}
          emptyMessage="No shared dues have been created yet."
          tableData={{
            caption: 'Collection progress breakdown',
            headers: ['Category', 'Amount'],
            rows: [
              ['Collected', formatFullINR(collected.collected, true)],
              collected.pending > 0
                ? ['Pending Approval', formatFullINR(collected.pending, true)]
                : null,
              ['Remaining Dues', formatFullINR(collected.remaining, true)],
            ].filter(Boolean),
          }}
          legend={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0" />
                <span className="text-text-muted">Collected:</span>
                <span className="font-mono font-medium text-text">
                  {formatCompactINR(collected.collected, true)}
                </span>
              </div>
              {collected.pending > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warning flex-shrink-0" />
                  <span className="text-text-muted">Pending:</span>
                  <span className="font-mono font-medium text-text">
                    {formatCompactINR(collected.pending, true)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-600 flex-shrink-0" />
                <span className="text-text-muted">Remaining:</span>
                <span className="font-mono font-medium text-text">
                  {formatCompactINR(collected.remaining, true)}
                </span>
              </div>
            </div>
          }
          className="lg:col-span-1"
        >
          {isFullyRecovered ? (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <span className="text-xl font-black text-text font-mono">100%</span>
              <span className="text-xs font-semibold text-success">
                Group ledger is completely square!
              </span>
            </div>
          ) : (
            <RingChart
              segments={ringSegments}
              total={collected.totalOwed}
              size={210}
              strokeWidth={22}
            />
          )}
        </ChartCard>

        {/* Chart 3: Repayment Pace (Area Line Chart) */}
        <ChartCard
          title="Repayment Pace"
          subtitle="Cumulative repayments over time vs total group owed"
          error={error}
          onRetry={onRetry}
          empty={pace.length === 0}
          emptyMessage="No repayment timeline recorded yet."
          tableData={{
            caption: 'Repayment pace by date',
            headers: ['Date', 'Cumulative Recovered', 'Target Owed'],
            rows: pace.map((p) => [
              p.date,
              formatFullINR(p.collected, true),
              formatFullINR(p.totalOwed, true),
            ]),
          }}
          className="md:col-span-2 lg:col-span-1"
        >
          <AreaLineChart
            series={pace}
            targetValue={collected.totalOwed}
            height={210}
            color="var(--chart-primary)"
          />
        </ChartCard>

        {/* Chart 4: Cash vs Online Payment Modes */}
        <ChartCard
          title="Payment Modes"
          subtitle="Accepted repayments by channel"
          error={error}
          onRetry={onRetry}
          empty={totalModeCount === 0}
          emptyMessage="No accepted payments to categorize yet."
          tableData={{
            caption: 'Payment modes breakdown',
            headers: ['Channel', 'Transaction Count', 'Total Amount'],
            rows: [
              ['Online (UPI)', modes.online?.count || 0, formatFullINR(modes.online?.amount || 0, true)],
              ['Cash', modes.cash?.count || 0, formatFullINR(modes.cash?.amount || 0, true)],
            ],
          }}
          legend={
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-text-muted">Online:</span>
                <span className="font-mono font-medium text-text">
                  {formatCompactINR(modes.online?.amount || 0, true)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0" />
                <span className="text-text-muted">Cash:</span>
                <span className="font-mono font-medium text-text">
                  {formatCompactINR(modes.cash?.amount || 0, true)}
                </span>
              </div>
            </div>
          }
          className="lg:col-span-1"
        >
          <RingChart
            segments={modeSegments}
            total={totalModeAmount}
            size={200}
            strokeWidth={20}
            centerContent={
              <div className="flex flex-col items-center">
                <span className="text-2xl font-extrabold text-text font-mono tabular-nums">
                  {totalModeCount}
                </span>
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  Payments
                </span>
              </div>
            }
          />
        </ChartCard>

        {/* Chart 5: Pending Dues Aging */}
        <ChartCard
          title="Pending Dues Aging"
          subtitle="FIFO age from original expense date"
          error={error}
          onRetry={onRetry}
          empty={agingBuckets.length === 0 || collected.remaining === 0}
          emptyMessage="No outstanding pending dues to age."
          tableData={{
            caption: 'Pending dues aging buckets',
            headers: ['Age Bracket', 'Remaining Due', 'Members'],
            rows: agingBuckets.map((b) => [
              `${b.key} days`,
              formatFullINR(b.amount, true),
              b.people || 0,
            ]),
          }}
          className="lg:col-span-1"
        >
          <ColumnBars buckets={agingBuckets} height={210} />
        </ChartCard>
      </div>
    </div>
  );
}

/**
 * Reserved-height Loading Skeleton for the Charts Section.
 * Prevents layout shift during lazy chunk import and data fetching.
 */
export function GroupChartsSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-surface-raised/80 border border-border" />
        <div className="lg:col-span-1 h-72 rounded-2xl bg-surface-raised/80 border border-border" />
        <div className="md:col-span-2 lg:col-span-1 h-72 rounded-2xl bg-surface-raised/80 border border-border" />
        <div className="lg:col-span-1 h-72 rounded-2xl bg-surface-raised/80 border border-border" />
        <div className="lg:col-span-1 h-72 rounded-2xl bg-surface-raised/80 border border-border" />
      </div>
    </div>
  );
}

export default GroupChartsSection;
