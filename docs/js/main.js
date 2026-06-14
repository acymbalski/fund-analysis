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

import { fetchChart as yahooFetchChart, fetchSummary as yahooFetchSummary } from './api.js';
import {
  fetchChart as mstarFetchChart,
  fetchSummary as mstarFetchSummary,
  getMstarToken,
} from './morningstar-api.js';
import { getBenchmark }             from './benchmark.js';
import {
  computePerformance, computeGreeks,
  computeRollingGreeks, parseSummary, parseMorningstarSummary, riskScoreLabel,
} from './calc.js';

import { renderDashboard }   from './ui/dashboard.js';
import { renderDeepDive }    from './ui/deepdive.js';
import { renderOverlap }     from './ui/overlap.js';
import { renderPerformance } from './ui/performance.js';
import { renderRisk }        from './ui/risk.js';
import { exportXlsx }        from './export.js';

// ── Data source ───────────────────────────────────────────────────────────────
const LS_SOURCE_KEY = 'funds_data_source';

export function getDataSource() {
  return localStorage.getItem(LS_SOURCE_KEY) ?? 'yahoo';
}

export function setDataSource(src) {
  localStorage.setItem(LS_SOURCE_KEY, src);
}

function isMstarSource() {
  return getDataSource() === 'morningstar';
}

function getFetchChart() {
  return isMstarSource() ? mstarFetchChart : yahooFetchChart;
}

function getFetchSummary() {
  return isMstarSource() ? mstarFetchSummary : yahooFetchSummary;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const inputEl        = document.getElementById('ticker-input');
const btnRun         = document.getElementById('btn-run');
const btnExport      = document.getElementById('btn-export');
const progressWrap   = document.getElementById('progress-wrap');
const statusEl       = document.getElementById('status-messages');
const footerStatus   = document.getElementById('footer-status');
const dataFreshness  = document.getElementById('data-freshness');
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
const LS_KEY       = 'funds_screener_tickers';
const LS_CACHE_KEY = 'funds_screener_cache';
const saved        = localStorage.getItem(LS_KEY);
if (saved) inputEl.value = saved;

// ── State ─────────────────────────────────────────────────────────────────────
let currentFundData = [];

// ── Cache helpers ─────────────────────────────────────────────────────────────
function formatFreshnessTs(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function showFreshness(isoStr) {
  const source = isMstarSource() ? ' · Morningstar' : ' · Yahoo Finance';
  dataFreshness.textContent = `Data as of ${formatFreshnessTs(isoStr)}${source}`;
  dataFreshness.classList.remove('hidden');
}

function saveCache(fundData, isoStr) {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ ts: isoStr, data: fundData }));
  } catch (_) { /* quota exceeded — skip silently */ }
}

function tryRestoreCache() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return;
    const { ts, data } = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return;
    currentFundData = data;
    renderDashboard(data);
    renderDeepDive(data);
    renderOverlap(data);
    renderPerformance(data);
    renderRisk(data);
    showFreshness(ts);
    btnExport.disabled = false;
    footerStatus.textContent =
      `Restored from cache · ${data.length} fund(s) · Greeks vs each fund's own benchmark`;
  } catch (_) { /* corrupt cache — ignore */ }
}

// ── Run Analysis ──────────────────────────────────────────────────────────────
btnRun.addEventListener('click', runAnalysis);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') runAnalysis(); });

tryRestoreCache();

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

  const benchCache = new Map();    // benchTicker → Promise<{ timestamps, prices }>
  let completed = 0;

  setProgress(0, `Fetching ${tickers.length} ticker(s)…`);

  const results = await Promise.allSettled(
    tickers.map(ticker =>
      fetchOneFund(ticker, benchCache).then(fd => {
        completed++;
        setProgress((completed / tickers.length) * 100, `[${completed}/${tickers.length}] ${ticker} ✓`);
        addStatus(`✓ ${ticker} — ${fd.name}`, 'ok');
        return fd;
      }).catch(err => {
        completed++;
        setProgress((completed / tickers.length) * 100, `[${completed}/${tickers.length}] ${ticker} ✗`);
        console.error(ticker, err);
        addStatus(`✗ ${ticker} — ${err.message}`, 'err');
        return errorFund(ticker);
      })
    )
  );

  const fundData = results.map(r => r.value);

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

  const nowIso = new Date().toISOString();
  saveCache(fundData, nowIso);
  showFreshness(nowIso);

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
  const fetchChart   = getFetchChart();
  const fetchSummary = getFetchSummary();
  const useMstar     = isMstarSource();

  // Fetch chart and summary in parallel
  const [chart, summary] = await Promise.all([
    fetchChart(ticker, '10y'),
    fetchSummary(ticker),
  ]);

  // Parse metadata — Morningstar backend returns already-normalized data
  const meta = useMstar
    ? parseMorningstarSummary(ticker, summary)
    : parseSummary(ticker, summary);

  // Determine benchmark.
  // Yahoo: pass raw summary so getBenchmark can read explicit benchmarkTicker fields.
  // Morningstar: synthesize a minimal summary-shaped object from category string.
  const [benchTicker, benchName] = useMstar
    ? getBenchmark(ticker, { fundProfile: { categoryName: meta.category } })
    : getBenchmark(ticker, summary);

  // Fetch benchmark history (2y for Greeks; promise-cached to avoid duplicate parallel fetches)
  // Always use Yahoo for benchmark — benchmark tickers are equity indices, not M* funds
  if (!benchCache.has(benchTicker)) {
    benchCache.set(benchTicker,
      yahooFetchChart(benchTicker, '2y').catch(() =>
        yahooFetchChart('^GSPC', '2y').catch(() => null)
      )
    );
  }
  const benchChart = await benchCache.get(benchTicker);

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
    msAnalyst:   meta.msAnalyst,
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
    msStars: 0, msAnalyst: '—', holdings: [], sectors: [],
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

// ── Source selector wiring ────────────────────────────────────────────────────
(function initSourceSelector() {
  const selector  = document.getElementById('source-selector');
  const btnYahoo  = document.getElementById('source-yahoo');
  const btnMstar  = document.getElementById('source-mstar');
  const modal     = document.getElementById('mstar-auth-modal');
  const authForm  = document.getElementById('mstar-auth-form');
  const authEmail = document.getElementById('mstar-email');
  const authPw    = document.getElementById('mstar-password');
  const authErr   = document.getElementById('mstar-auth-error');
  const authClose = document.getElementById('mstar-auth-close');
  const authBtn   = document.getElementById('mstar-auth-submit');

  if (!selector) return; // graceful no-op if HTML not yet updated

  function syncButtons() {
    const src = getDataSource();
    btnYahoo.classList.toggle('active', src === 'yahoo');
    btnMstar.classList.toggle('active', src === 'morningstar');
  }
  syncButtons();

  btnYahoo.addEventListener('click', () => {
    setDataSource('yahoo');
    syncButtons();
  });

  btnMstar.addEventListener('click', () => {
    if (getMstarToken()) {
      // Already authenticated this session
      setDataSource('morningstar');
      syncButtons();
    } else {
      // Need credentials
      authErr.textContent = '';
      authEmail.value = '';
      authPw.value = '';
      modal.classList.remove('hidden');
      authEmail.focus();
    }
  });

  authClose.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    authBtn.disabled = true;
    authBtn.textContent = 'Authenticating…';
    authErr.textContent = '';
    try {
      const { authenticate } = await import('./morningstar-api.js');
      await authenticate(authEmail.value.trim(), authPw.value);
      setDataSource('morningstar');
      syncButtons();
      modal.classList.add('hidden');
    } catch (err) {
      authErr.textContent = err.message;
    } finally {
      authBtn.disabled = false;
      authBtn.textContent = 'Sign In';
      authPw.value = '';
    }
  });
})();
