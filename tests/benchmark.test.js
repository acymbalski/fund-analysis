/**
 * Unit tests for benchmark.js
 * Run: node --test tests/benchmark.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBenchmark } from '../src/js/benchmark.js';

function makeSummary(categoryName, extras = {}) {
  return {
    fundProfile: { categoryName, ...extras },
    defaultKeyStatistics: {},
    summaryProfile: {},
    price: {},
  };
}

// ── Category-based mapping ────────────────────────────────────────────────────

test('getBenchmark: Large Blend → S&P 500', () => {
  const [ticker, name] = getBenchmark('FXAIX', makeSummary('Large Blend'));
  assert.equal(ticker, '^GSPC');
  assert.equal(name, 'S&P 500');
});

test('getBenchmark: Large Growth → Nasdaq 100', () => {
  const [ticker, name] = getBenchmark('QQQ', makeSummary('Large Growth'));
  assert.equal(ticker, '^NDX');
  assert.equal(name, 'Nasdaq 100');
});

test('getBenchmark: Small Blend → Russell 2000', () => {
  const [ticker] = getBenchmark('IWM', makeSummary('Small Blend'));
  assert.equal(ticker, '^RUT');
});

test('getBenchmark: Diversified Emerging → EEM', () => {
  const [ticker, name] = getBenchmark('EEM', makeSummary('Diversified Emerging'));
  assert.equal(ticker, 'EEM');
  assert.equal(name, 'MSCI Emerging Markets');
});

test('getBenchmark: Intermediate Core Bond → AGG', () => {
  const [ticker, name] = getBenchmark('BND', makeSummary('Intermediate Core Bond'));
  assert.equal(ticker, 'AGG');
  assert.equal(name, 'Bloomberg US Agg Bond');
});

test('getBenchmark: Intermediate Core-Plus Bond → AGG', () => {
  const [ticker] = getBenchmark('PIMIX', makeSummary('Intermediate Core-Plus Bond'));
  assert.equal(ticker, 'AGG');
});

test('getBenchmark: Real Estate → VNQ', () => {
  const [ticker, name] = getBenchmark('VNQ', makeSummary('Real Estate'));
  assert.equal(ticker, 'VNQ');
  assert.equal(name, 'MSCI US REIT');
});

test('getBenchmark: Foreign Large Blend → EFA', () => {
  const [ticker, name] = getBenchmark('EFA', makeSummary('Foreign Large Blend'));
  assert.equal(ticker, 'EFA');
  assert.equal(name, 'MSCI EAFE');
});

test('getBenchmark: High Yield Bond → HYG', () => {
  const [ticker] = getBenchmark('HYG', makeSummary('High Yield Bond'));
  assert.equal(ticker, 'HYG');
});

test('getBenchmark: case-insensitive category matching', () => {
  // Category names come from Yahoo Finance in various capitalizations
  const [ticker] = getBenchmark('SPY', makeSummary('large blend'));
  assert.equal(ticker, '^GSPC');
});

// ── Default fallback ──────────────────────────────────────────────────────────

test('getBenchmark: unknown category defaults to S&P 500', () => {
  const [ticker, name] = getBenchmark('XYZ', makeSummary('Miscellaneous Category'));
  assert.equal(ticker, '^GSPC');
  assert.equal(name, 'S&P 500');
});

test('getBenchmark: empty category defaults to S&P 500', () => {
  const [ticker] = getBenchmark('XYZ', makeSummary(''));
  assert.equal(ticker, '^GSPC');
});

test('getBenchmark: null/undefined category defaults to S&P 500', () => {
  const [ticker] = getBenchmark('XYZ', {
    fundProfile: {},
    defaultKeyStatistics: {},
    summaryProfile: {},
    price: {},
  });
  assert.equal(ticker, '^GSPC');
});

// ── Explicit benchmark field takes priority ───────────────────────────────────

test('getBenchmark: explicit benchmarkTicker in defaultKeyStatistics wins', () => {
  const summary = {
    fundProfile: { categoryName: 'Large Blend' },
    defaultKeyStatistics: { benchmarkTicker: '^NDX' },
    summaryProfile: {},
    price: {},
  };
  const [ticker] = getBenchmark('MYETF', summary);
  assert.equal(ticker, '^NDX');
});

test('getBenchmark: does not use benchmarkTicker if it equals the fund itself', () => {
  const summary = {
    fundProfile: { categoryName: 'Large Blend' },
    defaultKeyStatistics: { benchmarkTicker: 'VOO' },
    summaryProfile: {},
    price: {},
  };
  // ticker === benchmarkTicker → fall through to category
  const [ticker] = getBenchmark('VOO', summary);
  assert.equal(ticker, '^GSPC');
});

// ── Bond legal type signal ────────────────────────────────────────────────────

test('getBenchmark: bond legalType → AGG when category unknown', () => {
  const summary = {
    fundProfile: { categoryName: 'Specialty', legalType: 'Fixed Income ETF' },
    defaultKeyStatistics: {},
    summaryProfile: {},
    price: {},
  };
  const [ticker] = getBenchmark('XYZ', summary);
  assert.equal(ticker, 'AGG');
});
