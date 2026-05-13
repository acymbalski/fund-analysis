/**
 * Unit tests for calc.js
 * Run: node --test tests/calc.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linregress, alignReturns, computePerformance,
  computeGreeks, riskScoreLabel, overlapMatrix, greeksFromAligned,
} from '../docs/js/calc.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChart(priceArray, startDate = new Date('2020-01-02')) {
  const timestamps = priceArray.map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });
  return { timestamps, prices: priceArray };
}

function linspace(start, end, n) {
  const result = [];
  for (let i = 0; i < n; i++) result.push(start + (end - start) * (i / (n - 1)));
  return result;
}

function approx(a, b, tol = 1e-4) {
  return Math.abs(a - b) < tol;
}

// ── linregress ────────────────────────────────────────────────────────────────

test('linregress: perfect linear relationship (y = 2x + 1)', () => {
  const x = [1, 2, 3, 4, 5];
  const y = x.map(xi => 2 * xi + 1);
  const { slope, intercept, r } = linregress(x, y);
  assert(approx(slope, 2.0),         `slope=${slope} expected 2.0`);
  assert(approx(intercept, 1.0),     `intercept=${intercept} expected 1.0`);
  assert(approx(r, 1.0),            `r=${r} expected 1.0`);
});

test('linregress: negative slope', () => {
  const x = [1, 2, 3, 4, 5];
  const y = x.map(xi => -3 * xi + 10);
  const { slope, intercept, r } = linregress(x, y);
  assert(approx(slope, -3.0),        `slope=${slope} expected -3.0`);
  assert(approx(intercept, 10.0),   `intercept=${intercept} expected 10.0`);
  assert(approx(r, -1.0),           `r=${r} expected -1.0`);
});

test('linregress: zero slope (flat line)', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [5, 5, 5, 5, 5];
  const { slope, intercept } = linregress(x, y);
  assert(approx(slope, 0),           `slope=${slope} expected 0`);
  assert(approx(intercept, 5),       `intercept=${intercept} expected 5`);
});

test('linregress: too few points returns zeros', () => {
  const { slope, intercept, r } = linregress([1], [1]);
  assert.equal(slope, 0);
  assert.equal(intercept, 0);
  assert.equal(r, 0);
});

// ── computePerformance ────────────────────────────────────────────────────────

test('computePerformance: 1yr return = 10% when price grows exactly 10% over 252 days', () => {
  // 253 prices: index 0 = base, index 252 = base * 1.10
  const base = 100;
  const prices = Array.from({ length: 253 }, (_, i) =>
    i === 252 ? base * 1.10 : base
  );
  const chart = makeChart(prices);
  const perf = computePerformance(chart);
  // 1yr: last / prices[252 - 252] - 1 = 110/100 - 1 = 0.10
  assert(approx(perf['1yr'], 0.10, 1e-6), `1yr=${perf['1yr']} expected 0.10`);
});

test('computePerformance: returns null for periods with insufficient data', () => {
  const prices = linspace(100, 110, 50);  // only 50 days
  const chart  = makeChart(prices);
  const perf   = computePerformance(chart);
  assert.equal(perf['1yr'],  null, '1yr should be null with only 50 days');
  assert.equal(perf['3yr'],  null);
  assert.equal(perf['10yr'], null);
  assert(perf['1mo'] !== null, '1mo should exist with 50 days');
});

test('computePerformance: 3yr annualized return', () => {
  // 757 prices: grows from 100 to 100*(1.08)^3 over 756 days → 3yr ann ≈ 8%
  const target3yr = 1.08 ** 3;
  const prices = Array.from({ length: 757 }, (_, i) =>
    i === 0 ? 100 : i === 756 ? 100 * target3yr : 100
  );
  const chart = makeChart(prices);
  const perf  = computePerformance(chart);
  // ann(756, 3): (1 + (last/prices[0]-1))^(1/3) - 1 ≈ 0.08
  assert(approx(perf['3yr'], 0.08, 0.001), `3yr=${perf['3yr']} expected ~0.08`);
});

test('computePerformance: empty chart returns empty object', () => {
  const perf = computePerformance({ timestamps: [], prices: [] });
  assert.deepEqual(perf, {});
});

// ── alignReturns ──────────────────────────────────────────────────────────────

test('alignReturns: produces equal-length aligned return arrays', () => {
  // 10 trading days, both series identical
  const prices = linspace(100, 110, 11);
  const chart  = makeChart(prices);
  const { fundRets, benchRets } = alignReturns(chart, chart);
  assert.equal(fundRets.length, benchRets.length);
  assert(fundRets.length > 0);
  // same price series → same returns
  for (let i = 0; i < fundRets.length; i++) {
    assert(approx(fundRets[i], benchRets[i]));
  }
});

test('alignReturns: handles different date ranges (inner join)', () => {
  const fundPrices  = linspace(100, 110, 20);
  const benchPrices = linspace(200, 220, 15);

  // bench starts 5 days later
  const fundStart  = new Date('2020-01-02');
  const benchStart = new Date('2020-01-07');

  function makeChartFrom(prices, start) {
    const timestamps = prices.map((_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
    return { timestamps, prices };
  }

  const fund  = makeChartFrom(fundPrices, fundStart);
  const bench = makeChartFrom(benchPrices, benchStart);
  const { fundRets, benchRets } = alignReturns(fund, bench);
  assert.equal(fundRets.length, benchRets.length);
  assert(fundRets.length > 0);
  assert(fundRets.length < fundPrices.length - 1);  // inner join reduces count
});

// ── greeksFromAligned ─────────────────────────────────────────────────────────

test('greeksFromAligned: beta=1.0 when fund and bench returns are identical', () => {
  const n = 100;
  const returns = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.02);
  const result = greeksFromAligned(returns, returns);
  assert(result !== null);
  assert(approx(result.beta, 1.0, 0.001), `beta=${result.beta} expected 1.0`);
  assert(approx(result.r2, 100.0, 0.1), `r2=${result.r2} expected 100.0`);
});

test('greeksFromAligned: fund 2x bench → beta=2.0', () => {
  const n = 100;
  const bench = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.01);
  const fund  = bench.map(b => b * 2);
  const result = greeksFromAligned(fund, bench);
  assert(result !== null);
  assert(approx(result.beta, 2.0, 0.001), `beta=${result.beta} expected 2.0`);
});

test('greeksFromAligned: max drawdown of -50% when cumulative halves', () => {
  // Construct: 50 days of +1%, then 50 days of -1%, enough to get a ~26% drawdown
  // For exact -50%: cum drops from peak (1+r)^50 to (1+r)^50*(1-r)^50
  // Simpler: craft returns that produce exactly -50% drawdown
  const fa = new Array(50).fill(0).concat(new Array(50).fill(-0.01));
  // After 50 zeros, cumulative = 1. Then 50 days of -1%: 0.99^50 ≈ 0.605
  // mdd ≈ (0.605 - 1) / 1 = -0.395
  const ba = new Array(100).fill(0.001);
  const result = greeksFromAligned(fa, ba);
  assert(result !== null);
  assert(result.mdd < 0, `mdd should be negative, got ${result.mdd}`);
  assert(result.mdd > -1, `mdd=${result.mdd} unreasonable`);
});

test('greeksFromAligned: returns null for fewer than 30 points', () => {
  const fa = new Array(20).fill(0.001);
  const ba = new Array(20).fill(0.001);
  assert.equal(greeksFromAligned(fa, ba), null);
});

test('greeksFromAligned: up/down capture = 1.0 when fund equals bench', () => {
  const n = 100;
  const returns = Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? 0.01 : -0.01
  );
  const result = greeksFromAligned(returns, returns);
  assert(result !== null);
  assert(approx(result.upcap, 1.0, 0.001), `upcap=${result.upcap} expected 1.0`);
  assert(approx(result.dncap, 1.0, 0.001), `dncap=${result.dncap} expected 1.0`);
});

// ── riskScoreLabel ────────────────────────────────────────────────────────────

test('riskScoreLabel: correct labels for each percentile bucket', () => {
  // 10 values from 0.05 to 0.50 — sorted = [0.05, 0.10, ..., 0.50]
  const stds = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
  // pct = count(v <= stdAnn) / 10
  // 0.05: count=1 → 10% → Low
  // 0.10: count=2 → 20% → Below Avg
  // 0.30: count=6 → 60% → Average
  // 0.40: count=8 → 80% → Above Avg
  // 0.50: count=10 → 100% → High
  assert.equal(riskScoreLabel(0.05, stds), 'Low');
  assert.equal(riskScoreLabel(0.10, stds), 'Below Avg');
  assert.equal(riskScoreLabel(0.30, stds), 'Average');
  assert.equal(riskScoreLabel(0.40, stds), 'Above Avg');
  assert.equal(riskScoreLabel(0.50, stds), 'High');
});

test('riskScoreLabel: returns Average for empty or single-element array', () => {
  assert.equal(riskScoreLabel(0.2, []),       'Average');
  assert.equal(riskScoreLabel(0.2, [0.2]),    'Average');
  assert.equal(riskScoreLabel(null, [0.2]),   'Average');
});

// ── overlapMatrix ─────────────────────────────────────────────────────────────

test('overlapMatrix: 100% overlap with self', () => {
  const map = { VOO: ['AAPL', 'MSFT', 'NVDA'] };
  const result = overlapMatrix(map);
  assert.equal(result.VOO.VOO, 1.0);
});

test('overlapMatrix: 0% overlap with completely different holdings', () => {
  const map = {
    VOO:  ['AAPL', 'MSFT'],
    BND:  ['GOVT', 'AGG'],
  };
  const result = overlapMatrix(map);
  assert.equal(result.VOO.BND, 0);
  assert.equal(result.BND.VOO, 0);
});

test('overlapMatrix: 50% overlap asymmetry', () => {
  // VOO has 2 holdings, 1 shared with QQQ. QQQ has 4 holdings, 1 shared.
  // overlap[VOO][QQQ] = 1/2 = 0.5
  // overlap[QQQ][VOO] = 1/4 = 0.25
  const map = {
    VOO: ['AAPL', 'MSFT'],
    QQQ: ['AAPL', 'GOOG', 'AMZN', 'NVDA'],
  };
  const result = overlapMatrix(map);
  assert(approx(result.VOO.QQQ, 0.5),  `VOO→QQQ=${result.VOO.QQQ} expected 0.5`);
  assert(approx(result.QQQ.VOO, 0.25), `QQQ→VOO=${result.QQQ.VOO} expected 0.25`);
});

test('overlapMatrix: excludes skip symbols', () => {
  const map = { A: ['—', '', 'AAPL'], B: ['—', 'AAPL'] };
  const result = overlapMatrix(map);
  // A has 1 valid holding (AAPL); B has 1 valid (AAPL); overlap = 1/1 = 1.0
  assert(approx(result.A.B, 1.0), `A→B=${result.A.B} expected 1.0`);
});
