import React, { useState } from 'react';
import { MotionConfig } from 'motion/react';
import {
  ChartCard,
  RingChart,
  DivergingBars,
  AreaLineChart,
  ColumnBars,
  StackedBar,
  Sparkline,
} from '../components/charts/index.js';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import { formatFullINR } from '../utils/chartMath.js';

export default function DevChartsPage() {
  const [reducedMotionMode, setReducedMotionMode] = useState('user'); // 'user' | 'always' | 'never'
  const [errorRetried, setErrorRetried] = useState(false);

  // Sample data sets
  const sampleBalances = [
    { personId: 'p1', name: 'Karan Sharma', username: 'karan_s', net: -450000 },
    { personId: 'p2', name: 'Neha Gupta', username: 'neha_g', net: -230000 },
    { personId: 'p3', name: 'Aarav Patel', username: 'aarav_p', net: -120000 },
    { personId: 'p4', name: 'Rohan Verma', username: null, net: -50000 },
    { personId: 'p5', name: 'Sneha Rao', username: 'sneha_r', net: 0 },
    { personId: 'p6', name: 'Vikram Mehta', username: 'vikram_m', net: 150000 },
    { personId: 'p7', name: 'Pooja Nair', username: 'pooja_n', net: 700000 },
  ];

  const hugeBalances = [
    { personId: 'h1', name: 'Enterprise Corp', username: 'ent_corp', net: -1500000000 }, // 1.5 Cr
    { personId: 'h2', name: 'Founders Fund', username: 'founders', net: 1500000000 },
  ];

  const tinyBalances = [
    { personId: 't1', name: 'Chai Share', username: null, net: -1500 }, // ₹15
    { personId: 't2', name: 'Biscuit Split', username: null, net: 1500 },
  ];

  const sampleRingSegments = [
    { key: 'collected', label: 'Collected', value: 1250000, color: 'var(--chart-owed)' },
    { key: 'pending', label: 'Pending Approval', value: 350000, color: 'var(--chart-pending)', hatch: true },
    { key: 'remaining', label: 'Remaining', value: 400000, color: 'var(--chart-track)' },
  ];

  const samplePace = [
    { date: '2026-10-01', collected: 0, label: 'Day 1' },
    { date: '2026-10-02', collected: 250000, label: 'Dinner split' },
    { date: '2026-10-03', collected: 250000, label: 'No payments' },
    { date: '2026-10-04', collected: 600000, label: 'Karan paid ₹3,500' },
    { date: '2026-10-05', collected: 850000, label: 'Neha paid ₹2,500' },
    { date: '2026-10-06', collected: 1100000, label: 'Aarav paid' },
    { date: '2026-10-07', collected: 1250000, label: 'Current total' },
  ];

  const sampleFriendTrajectory = [
    { date: '2026-10-01', remaining: 1200000, label: 'Initial share' },
    { date: '2026-10-03', remaining: 1500000, label: 'Cab expense added' },
    { date: '2026-10-05', remaining: 800000, label: 'Payment approved' },
    { date: '2026-10-07', remaining: 450000, label: 'Final remaining' },
  ];

  const samplePendingMarkers = [
    { date: '2026-10-06', amount: 350000 },
  ];

  const sampleAging = [
    { key: '0-3', amount: 450000, people: 2 },
    { key: '4-7', amount: 230000, people: 1 },
    { key: '8-14', amount: 120000, people: 1 },
    { key: '15+', amount: 50000, people: 1 },
  ];

  const sampleAdminStatus = [
    { key: 'accepted', label: 'Accepted', count: 42, amount: 8400000, color: 'var(--chart-owed)' },
    { key: 'pending', label: 'Pending', count: 5, amount: 650000, color: 'var(--chart-pending)' },
    { key: 'rejected', label: 'Rejected', count: 2, amount: 150000, color: 'var(--chart-owes)' },
    { key: 'voided', label: 'Voided', count: 1, amount: 200000, color: 'var(--chart-axis)' },
  ];

  return (
    <MotionConfig reducedMotion={reducedMotionMode}>
      <div className="min-h-screen bg-background text-text p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header with Dev Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                Dev Environment
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Chart Primitives Visual QA
              </h1>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Test all custom SVG chart primitives across themes, motion states, data densities, and viewport sizes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Motion toggle */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-text-muted font-medium">Motion:</span>
              <select
                value={reducedMotionMode}
                onChange={(e) => setReducedMotionMode(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-border bg-surface-raised text-text font-medium"
              >
                <option value="user">User preference</option>
                <option value="always">Force reduced</option>
                <option value="never">Force animated</option>
              </select>
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>

        {/* Section 1: Host Group Visualizations */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            1. Host Group Dashboard Charts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Diverging Bars (Top 6 with expander) */}
            <ChartCard
              title="Who Pays What"
              subtitle="Net balances centered on zero axis"
              tableData={{
                caption: 'Net balances by person',
                headers: ['Person', 'Handle', 'Net Balance'],
                rows: sampleBalances.map((b) => [
                  b.name,
                  b.username ? `@${b.username}` : '—',
                  formatFullINR(b.net, true),
                ]),
              }}
              className="lg:col-span-2"
            >
              <DivergingBars balances={sampleBalances} />
            </ChartCard>

            {/* Ring Chart (Collected vs Pending vs Remaining) */}
            <ChartCard
              title="Collection Progress"
              subtitle="₹12,500 of ₹20,000 recovered"
              tableData={{
                caption: 'Collection breakdown',
                headers: ['Status', 'Amount'],
                rows: sampleRingSegments.map((s) => [s.label, formatFullINR(s.value, true)]),
              }}
            >
              <RingChart
                segments={sampleRingSegments}
                total={2000000}
                size={220}
              />
            </ChartCard>

            {/* Repayment Pace Area Line Chart with Target */}
            <ChartCard
              title="Repayment Pace"
              subtitle="Cumulative recoveries vs total group amount"
              className="lg:col-span-2"
              tableData={{
                caption: 'Repayment pace over time',
                headers: ['Date', 'Cumulative Recovered'],
                rows: samplePace.map((p) => [p.date, formatFullINR(p.collected, true)]),
              }}
            >
              <AreaLineChart
                series={samplePace}
                targetValue={1500000}
                height={230}
              />
            </ChartCard>

            {/* Pending Payments Aging Column Bars */}
            <ChartCard
              title="Pending Payments Aging"
              subtitle="FIFO age from original expense date"
              tableData={{
                caption: 'Aging buckets breakdown',
                headers: ['Bucket', 'Pending Amount', 'People Count'],
                rows: sampleAging.map((a) => [
                  `${a.key} days`,
                  formatFullINR(a.amount, true),
                  a.people,
                ]),
              }}
            >
              <ColumnBars buckets={sampleAging} height={230} />
            </ChartCard>
          </div>
        </section>

        {/* Section 2: Friend Statement & Share Link Charts */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            2. Friend Statement Visualizations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Friend Payments Over Time with Pending Markers */}
            <ChartCard
              title="Your Payments Over Time"
              subtitle="Decreases only on accepted repayments; hollow circle = pending"
            >
              <AreaLineChart
                series={sampleFriendTrajectory}
                pendingMarkers={samplePendingMarkers}
                color="var(--chart-primary)"
                height={220}
              />
            </ChartCard>

            {/* Friend Sparklines Showcase */}
            <ChartCard
              title="Person Card Sparklines"
              subtitle="Decorative inline trajectories"
            >
              <div className="w-full space-y-3 py-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/60">
                  <span className="text-xs font-semibold">Karan (to pay ₹4,500)</span>
                  <div className="flex items-center gap-3">
                    <Sparkline data={[1200000, 1000000, 800000, 450000]} />
                    <span className="font-mono text-xs font-bold text-danger">₹4,500</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/60">
                  <span className="text-xs font-semibold">Neha (settled up)</span>
                  <div className="flex items-center gap-3">
                    <Sparkline data={[800000, 500000, 200000, 0]} />
                    <span className="font-mono text-xs font-bold text-success">₹0</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/60">
                  <span className="text-xs font-semibold">Rahul (single event)</span>
                  <div className="flex items-center gap-3">
                    <Sparkline data={[500000]} />
                    <span className="font-mono text-xs font-bold text-danger">₹5,000</span>
                  </div>
                </div>
              </div>
            </ChartCard>
          </div>
        </section>

        {/* Section 3: Admin Status Breakdown */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            3. Admin Payments Breakdown
          </h2>
          <div className="grid grid-cols-1 gap-5">
            <ChartCard
              title="Payments By Status"
              subtitle="Real-time transaction state breakdown"
            >
              <StackedBar items={sampleAdminStatus} height={32} />
            </ChartCard>
          </div>
        </section>

        {/* Section 4: Edge Cases & Extreme States */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            4. Edge Cases: Empty, Huge & Tiny Amounts, Loading, Error
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Loading Skeleton */}
            <ChartCard
              title="Loading Skeleton State"
              subtitle="Transform shimmer with reserved height"
              loading={true}
            />

            {/* Error State with Retry */}
            <ChartCard
              title="Error State"
              subtitle="With retry callback"
              error={errorRetried ? null : 'Failed to fetch analytics from server'}
              onRetry={() => setErrorRetried(true)}
            >
              <div className="p-4 text-xs text-success">Successfully retried!</div>
            </ChartCard>

            {/* Empty State */}
            <ChartCard
              title="Empty Group State"
              subtitle="Zero expenses or activity"
              empty={true}
              emptyMessage="No expenses have been added to this group yet."
            />

            {/* Huge Amounts (Crores) */}
            <ChartCard
              title="Extreme High Scale (₹1.5 Cr)"
              subtitle="Checks Indian digit grouping and compact labels"
            >
              <DivergingBars balances={hugeBalances} />
            </ChartCard>

            {/* Tiny Amounts (₹15) */}
            <ChartCard
              title="Extreme Low Scale (₹15)"
              subtitle="Chai and small coin splits"
            >
              <DivergingBars balances={tinyBalances} />
            </ChartCard>

            {/* 100% Settled Ring Chart */}
            <ChartCard
              title="100% Settled State"
              subtitle="All friends fully paid"
            >
              <RingChart
                segments={[{ key: 'collected', label: 'Collected', value: 500000, color: 'var(--chart-owed)' }]}
                total={500000}
                size={220}
              />
            </ChartCard>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}
