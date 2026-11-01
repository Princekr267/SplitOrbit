import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCompactINR,
  formatFullINR,
  linearScale,
  getNiceTicks,
  buildDivergingBarsSummary,
  buildRingSummary,
  buildAreaLineSummary,
  buildColumnBarsSummary,
  buildStackedBarSummary,
} from '../chartMath.js';

describe('Chart Math & Formatting Helpers', () => {
  describe('formatCompactINR', () => {
    it('formats zero correctly', () => {
      assert.equal(formatCompactINR(0), '₹0');
      assert.equal(formatCompactINR(0, true), '₹0');
    });

    it('formats small amounts', () => {
      assert.equal(formatCompactINR(900), '₹900');
      assert.equal(formatCompactINR(90000, true), '₹900');
    });

    it('formats thousands (K)', () => {
      assert.equal(formatCompactINR(45000), '₹45K');
      assert.equal(formatCompactINR(1500), '₹1.5K');
      assert.equal(formatCompactINR(4500000, true), '₹45K');
    });

    it('formats lakhs (L)', () => {
      assert.equal(formatCompactINR(120000), '₹1.2L');
      assert.equal(formatCompactINR(500000), '₹5L');
      assert.equal(formatCompactINR(1250000), '₹12.5L');
      assert.equal(formatCompactINR(12000000, true), '₹1.2L');
    });

    it('formats crores (Cr)', () => {
      assert.equal(formatCompactINR(15000000), '₹1.5Cr');
      assert.equal(formatCompactINR(10000000), '₹1Cr');
    });

    it('handles negative values with leading minus', () => {
      assert.equal(formatCompactINR(-45000), '-₹45K');
      assert.equal(formatCompactINR(-120000), '-₹1.2L');
      assert.equal(formatCompactINR(-900), '-₹900');
    });

    it('handles invalid / null inputs safely', () => {
      assert.equal(formatCompactINR(null), '₹0');
      assert.equal(formatCompactINR(undefined), '₹0');
      assert.equal(formatCompactINR(NaN), '₹0');
    });
  });

  describe('formatFullINR', () => {
    it('formats Indian grouped numbers', () => {
      assert.equal(formatFullINR(125000), '₹1,25,000');
      assert.equal(formatFullINR(12500000, true), '₹1,25,000');
    });

    it('handles negative numbers', () => {
      assert.equal(formatFullINR(-125000), '-₹1,25,000');
    });

    it('supports decimal places', () => {
      assert.equal(formatFullINR(125000.5, false, 2), '₹1,25,000.50');
    });
  });

  describe('linearScale', () => {
    it('maps domain to range linearly', () => {
      const scale = linearScale([0, 100], [0, 500]);
      assert.equal(scale(0), 0);
      assert.equal(scale(50), 250);
      assert.equal(scale(100), 500);
    });

    it('inverts range value to domain value', () => {
      const scale = linearScale([0, 100], [0, 500]);
      assert.equal(scale.invert(250), 50);
      assert.equal(scale.invert(500), 100);
    });

    it('handles reversed range (e.g. SVG y-axis from height to 0)', () => {
      const yScale = linearScale([0, 100], [300, 0]);
      assert.equal(yScale(0), 300);
      assert.equal(yScale(50), 150);
      assert.equal(yScale(100), 0);
    });

    it('handles zero span domain gracefully', () => {
      const scale = linearScale([50, 50], [0, 200]);
      assert.equal(scale(50), 100);
    });
  });

  describe('getNiceTicks', () => {
    it('generates nice round ticks covering the range', () => {
      const ticks = getNiceTicks(0, 100, 5);
      assert.ok(ticks.length >= 4 && ticks.length <= 8);
      assert.ok(ticks[0] <= 0);
      assert.ok(ticks[ticks.length - 1] >= 100);
      assert.equal(ticks[0], 0);
    });

    it('handles identical min and max', () => {
      const ticks = getNiceTicks(50, 50);
      assert.deepEqual(ticks, [50]);
    });

    it('handles large monetary spans', () => {
      const ticks = getNiceTicks(0, 150000, 5);
      assert.ok(ticks.length >= 3);
      assert.ok(ticks.includes(0));
    });
  });

  describe('Summary Builders', () => {
    it('builds diverging bars summary', () => {
      const summary = buildDivergingBarsSummary([
        { name: 'Aman', net: -120000 },
        { name: 'Meera', net: -80000 },
        { name: 'Rahul', net: 230000 },
      ]);
      assert.equal(
        summary,
        'Aman needs to pay ₹1,200. Meera needs to pay ₹800. Rahul receives ₹2,300.'
      );
    });

    it('builds ring summary', () => {
      const summary = buildRingSummary(
        [
          { label: 'Collected', value: 1500000 },
          { label: 'Pending', value: 300000 },
          { label: 'Remaining', value: 200000 },
        ],
        2000000
      );
      assert.equal(
        summary,
        'Total ₹20,000. Collected: ₹15,000 (75%), Pending: ₹3,000 (15%), Remaining: ₹2,000 (10%).'
      );
    });

    it('builds area line summary', () => {
      const summary = buildAreaLineSummary(
        [{ date: '2026-10-01', collected: 500000 }, { date: '2026-10-02', collected: 1500000 }],
        2000000
      );
      assert.equal(
        summary,
        'Repayment pace across 2 data points. Total collected ₹15,000 of ₹20,000 owed.'
      );
    });

    it('builds column bars summary', () => {
      const summary = buildColumnBarsSummary([
        { key: '0-3', amount: 500000 },
        { key: '4-7', amount: 200000 },
        { key: '8-14', amount: 0 },
        { key: '15+', amount: 100000 },
      ]);
      assert.equal(
        summary,
        'Pending payments aging: 0-3 days: ₹5,000, 4-7 days: ₹2,000, 8-14 days: ₹0, 15+ days: ₹1,000.'
      );
    });

    it('builds stacked bar summary', () => {
      const summary = buildStackedBarSummary([
        { label: 'accepted', count: 10, amount: 1500000 },
        { label: 'pending', count: 2, amount: 300000 },
      ]);
      assert.equal(
        summary,
        'Payments breakdown: 10 accepted (₹15,000), 2 pending (₹3,000).'
      );
    });
  });
});
