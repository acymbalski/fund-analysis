/**
 * main.js — App bootstrap, event handling, fetch orchestration.
 *
 * Flow:
 *   1. Parse ticker input
 *   2. For each ticker: fetch chart (10y) + quoteSummary in parallel
 *   3. Determine benchmark; fetch benchmark chart (cached)
 *   4. Compute performance, greeks, risk metrics
 *   5. Render all 5 tabs
 */

import { fetchChart, fetchSummary } from './api.js';
import { getBenchmark }             from './benchmark.js';
import {
  computePerformance, computeGreeks,
  computeRollingGreeks, parseSummary, riskScoreLabel,
} from './calc.js';

import { renderDashboard }   from './ui/dashboard.js';
import { renderDeepDive }    from './ui/deepdive.js';
import { renderOverlap }     from './ui/overlap.js';
import { renderPerformance } from './ui/performance.js';
import { renderRisk }        from './ui/risk.js';
import { exportXlsx }        from './export.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const inputEl      = document.getElementById('ticker-input');
const btnRun       = document.getElementById('btn-run');
const btnExport    = document.getElementById('btn-export');
const progressWrap = document.getElementById('progress-wrap');
const statusEl     = document.getElementById('status-messages');
const footerStatus = document.getElementById('footer-status');
// Progress bar elements queried lazily (HTML has them inside progress-wrap)
const getProgressBar = () => document.getElementById('progress-bar');
const getProgressLbl = () => document.getElementById('progress-label');

// ── Tab switching ─────────────────────────────────────────────────────────────
document.getElementById('tab-nav').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('hidden', p.id !== `pane-${tab}`);
    p.classList.toggle('active', p.id === `pane-${tab}`);
  });
});

// ── Persist tickers in localStorage ──────────────────────────────────────────
const LS_KEY = 'funds_screener_tickers';
const saved  = localStorage.getItem(LS_KEY);
if (saved) inputEl.value = saved;

// ── State ─────────────────────────────────────────────────────────────────────
let currentFundData = [];

// ── Run Analysis ──────────────────────────────────────────────────────────────
btnRun.addEventListener('click', runAnalysis);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') runAnalysis(); });

async function runAnalysis() {
  const raw     = inputEl.value.trim();
  const tickers = raw.split(/[\s,;]+/).map(t => t.toUpperCase()).filter(Boolean);

  if (tickers.length === 0) {
    addStatus('Enter at least one ticker.', 'warn');
    return;
  }

  localStorage.setItem(LS_KEY, inputEl.value);

  // Reset UI
  btnRun.disabled    = true;
  btnExport.disabled = true;
  statusEl.innerHTML = '';
  setProgress(0, `Fetching ${tickers.length} ticker(s)…`);
  progressWrap.classList.remove('hidden');

  const benchCache = new Map();    // benchTicker → { timestamps, prices }
  const fundData   = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    setProgress((i / tickers.length) * 100, `[${i + 1}/${tickers.length}] ${ticker}…`);
    try {
      const fd = await fetchOneFund(ticker, benchCache);
      fundData.push(fd);
      addStatus(`✓ ${ticker} — ${fd.name}`, 'ok');
    } catch (err) {
      console.error(ticker, err);
      addStatus(`✗ ${ticker} — ${err.message}`, 'err');
      fundData.push(errorFund(ticker));
    }
  }

  setProgress(100, 'Rendering…');
  currentFundData = fundData;

  try {
    renderDashboard(fundData);
    renderDeepDive(fundData);
    renderOverlap(fundData);
    renderPerformance(fundData);
    renderRisk(fundData);
  } catch (err) {
    console.error('Render error:', err);
    addStatus(`Render error: ${err.message}`, 'err');
  }

  const ts = new Date().toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  footerStatus.textContent =
    `Last refreshed: ${ts} · ${fundData.length} fund(s) · Greeks vs each fund's own benchmark`;

  progressWrap.classList.add('hidden');
  btnRun.disabled    = false;
  btnExport.disabled = false;
}

// ── Fetch + compute one fund ─────────────────────────────────────────────────
async function fetchOneFund(ticker, benchCache) {
  // Fetch chart and summary in parallel
  const [chart, summary] = await Promise.all([
    fetchChart(ticker, '10y'),
    fetchSummary(ticker),
  ]);

  // Parse metadata
  const meta = parseSummary(ticker, summary);

  // Determine benchmark
  const [benchTicker, benchName] = getBenchmark(ticker, summary);

  // Fetch benchmark history (2y for Greeks; cached per bench ticker)
  if (!benchCache.has(benchTicker)) {
    try {
      benchCache.set(benchTicker, await fetchChart(benchTicker, '2y'));
    } catch {
      // Fallback to S&P 500 if bench fetch fails
      try {
        benchCache.set(benchTicker, await fetchChart('^GSPC', '2y'));
      } catch {
        benchCache.set(benchTicker, null);
      }
    }
  }
  const benchChart = benchCache.get(benchTicker);

  // Performance uses full history
  const perf = computePerformance(chart);

  // Greeks & risk use 2y of aligned data
  const greeks  = benchChart ? computeGreeks(chart, benchChart)             : null;
  const risk3yr = benchChart ? computeRollingGreeks(chart, benchChart, 756)  : null;
  const risk5yr = benchChart ? computeRollingGreeks(chart, benchChart, 1260) : null;

  return {
    ticker,
    name:        meta.name,
    category:    meta.category,
    manager:     meta.manager,
    inception:   meta.inception,
    benchTicker,
    benchName,
    expRatio:    meta.expRatio,
    turnover:    meta.turnover,
    aum:         meta.aum,
    price:       meta.price ?? (chart.prices.at(-1) ?? null),
    numHoldings: meta.numHoldings,
    perf,
    greeks,
    risk3yr,
    risk5yr,
    msStars:     meta.msStars,
    holdings:    meta.holdings,
    sectors:     meta.sectors,
  };
}

// ── Error placeholder fund ────────────────────────────────────────────────────
function errorFund(ticker) {
  return {
    ticker, name: ticker, category: '—', manager: '—', inception: '—',
    benchTicker: '^GSPC', benchName: 'S&P 500',
    expRatio: 0, turnover: null, aum: 0, price: null, numHoldings: null,
    perf: {}, greeks: null, risk3yr: null, risk5yr: null,
    msStars: 0, holdings: [], sectors: [],
  };
}

// ── Export ────────────────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  if (currentFundData.length > 0) exportXlsx(currentFundData);
});

// ── UI helpers ────────────────────────────────────────────────────────────────
function setProgress(pct, label) {
  getProgressBar().style.width = `${pct}%`;
  getProgressLbl().textContent = label;
}

function addStatus(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `status-msg status-${type}`;
  el.textContent = msg;
  statusEl.appendChild(el);
  statusEl.scrollTop = statusEl.scrollHeight;
}
