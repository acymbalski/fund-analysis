/**
 * calc.js — All statistical calculations, matching refresh_funds.py exactly.
 *
 * RF_RATE: update annually to current 3-month T-bill yield.
 */

export const RF_RATE = 0.053;

// ── BASIC STATS ──────────────────────────────────────────────────────────────

/** Sample mean */
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Sample standard deviation (ddof=1, matching numpy default) */
function sampleStd(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ── OLS LINEAR REGRESSION ────────────────────────────────────────────────────

/**
 * Ordinary least-squares regression of y on x.
 * Matches scipy.stats.linregress output fields used in the Python script.
 * @returns {{ slope, intercept, r }}
 */
export function linregress(x, y) {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, r: 0 };

  const mx = mean(x);
  const my = mean(y);

  let ssxx = 0, ssxy = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    ssxx += dx * dx;
    ssxy += dx * dy;
    ssyy += dy * dy;
  }

  if (ssxx === 0) return { slope: 0, intercept: my, r: 0 };

  const slope     = ssxy / ssxx;
  const intercept = my - slope * mx;
  const r         = ssxx > 0 && ssyy > 0 ? ssxy / Math.sqrt(ssxx * ssyy) : 0;

  return { slope, intercept, r };
}

// ── DATE ALIGNMENT ────────────────────────────────────────────────────────────

/**
 * Convert Date to "YYYY-MM-DD" string for alignment.
 */
function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Align two price series by date (inner join), then compute daily returns.
 * Returns parallel arrays of daily return values.
 * @param {{ timestamps: Date[], prices: number[] }} fund
 * @param {{ timestamps: Date[], prices: number[] }} bench
 * @returns {{ fundRets: number[], benchRets: number[] }}
 */
export function alignReturns(fund, bench) {
  // Build bench price map: dateKey → price
  const benchMap = new Map();
  for (let i = 0; i < bench.timestamps.length; i++) {
    benchMap.set(dateKey(bench.timestamps[i]), bench.prices[i]);
  }

  const fundRets  = [];
  const benchRets = [];

  for (let i = 1; i < fund.timestamps.length; i++) {
    const dCurr = dateKey(fund.timestamps[i]);
    const dPrev = dateKey(fund.timestamps[i - 1]);

    const bCurr = benchMap.get(dCurr);
    const bPrev = benchMap.get(dPrev);

    if (bCurr != null && bPrev != null && fund.prices[i - 1] > 0 && bPrev > 0) {
      fundRets.push((fund.prices[i] / fund.prices[i - 1]) - 1);
      benchRets.push((bCurr / bPrev) - 1);
    }
  }

  return { fundRets, benchRets };
}

// ── GREEKS ────────────────────────────────────────────────────────────────────

/**
 * Compute full Greek suite from aligned daily return arrays.
 * Matches _greeks_from_aligned() in the Python script.
 *
 * @param {number[]} fa - fund daily returns
 * @param {number[]} ba - benchmark daily returns
 * @param {number}   rf - annual risk-free rate (default RF_RATE)
 * @returns {object|null}
 */
export function greeksFromAligned(fa, ba, rf = RF_RATE) {
  if (fa.length < 30) return null;

  const { slope, intercept, r } = linregress(ba, fa);

  const beta  = slope;
  const r2    = r * r * 100;
  const alpha = intercept * 252 * 100;   // annualized to %, matches Python

  const retAnn = mean(fa) * 252;
  const stdAnn = sampleStd(fa) * Math.sqrt(252);
  const sharpe = stdAnn > 0 ? (retAnn - rf) / stdAnn : 0;

  const rfDaily = (1 + rf) ** (1 / 252) - 1;
  const downReturns = fa.filter(x => x < rfDaily);
  const dStd = downReturns.length > 1
    ? sampleStd(downReturns) * Math.sqrt(252)
    : stdAnn;
  const sortino = dStd > 0 ? (retAnn - rf) / dStd : 0;

  // Max drawdown via cumulative product
  let cum = 1, peak = 1, mdd = 0;
  for (const r of fa) {
    cum  *= (1 + r);
    peak  = Math.max(peak, cum);
    mdd   = Math.min(mdd, (cum - peak) / peak);
  }

  // Up/down capture
  const upIdx  = ba.map((b, i) => b > 0 ? i : -1).filter(i => i >= 0);
  const dnIdx  = ba.map((b, i) => b < 0 ? i : -1).filter(i => i >= 0);

  const upcap = upIdx.length > 0
    ? mean(upIdx.map(i => fa[i])) / mean(upIdx.map(i => ba[i]))
    : 1;
  const dncap = dnIdx.length > 0
    ? mean(dnIdx.map(i => fa[i])) / mean(dnIdx.map(i => ba[i]))
    : 1;

  const calmar = mdd !== 0 ? (retAnn * 100) / Math.abs(mdd * 100) : 0;

  return {
    alpha:   round4(alpha),
    beta:    round4(beta),
    r2:      round2(r2),
    std:     round4(stdAnn),
    sharpe:  round4(sharpe),
    sortino: round4(sortino),
    mdd:     round4(mdd),
    upcap:   round4(upcap),
    dncap:   round4(dncap),
    calmar:  round4(calmar),
    retAnn:  round4(retAnn),
  };
}

/**
 * Compute Greeks over a specific trailing window (for 3yr / 5yr risk tab).
 * Matches compute_rolling_greeks() in the Python script.
 *
 * @param {{ timestamps, prices }} fundChart
 * @param {{ timestamps, prices }} benchChart
 * @param {number} windowDays - e.g. 756 (3yr) or 1260 (5yr)
 */
export function computeRollingGreeks(fundChart, benchChart, windowDays, rf = RF_RATE) {
  const { fundRets, benchRets } = alignReturns(fundChart, benchChart);
  if (fundRets.length < 60) return null;

  // need at least 80% of the window; otherwise use what we have (if > 60)
  const useN = Math.min(windowDays, fundRets.length);
  const fa   = fundRets.slice(-useN);
  const ba   = benchRets.slice(-useN);
  if (fa.length < 30) return null;

  return greeksFromAligned(fa, ba, rf);
}

/**
 * Compute full Greeks (vs benchmark) using all available aligned history.
 * Matches compute_greeks() in the Python script.
 */
export function computeGreeks(fundChart, benchChart, rf = RF_RATE) {
  const { fundRets, benchRets } = alignReturns(fundChart, benchChart);
  return greeksFromAligned(fundRets, benchRets, rf);
}

// ── PERFORMANCE ───────────────────────────────────────────────────────────────

/**
 * Compute trailing performance returns.
 * Matches compute_performance() in the Python script.
 *
 * @param {{ timestamps: Date[], prices: number[] }} chart
 * @returns {{ '1mo', '3mo', 'ytd', '1yr', '3yr', '5yr', '10yr' }}
 */
export function computePerformance(chart) {
  const { timestamps, prices } = chart;
  if (!prices || prices.length < 2) return {};

  const last = prices[prices.length - 1];
  const n    = prices.length;

  function ret(days) {
    if (n <= days) return null;
    const base = prices[n - days];
    return base > 0 ? last / base - 1 : null;
  }

  function ann(days, yrs) {
    const r = ret(days);
    return r !== null ? (1 + r) ** (1 / yrs) - 1 : null;
  }

  // YTD: first price in the current calendar year
  const currentYear = new Date().getFullYear();
  let ytdBase = null;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i].getFullYear() === currentYear) {
      ytdBase = prices[i];
      break;
    }
  }
  const ytd = ytdBase && ytdBase > 0 ? last / ytdBase - 1 : null;

  const since = prices[0] > 0 ? last / prices[0] - 1 : null;

  return {
    '1mo':  ret(21),
    '3mo':  ret(63),
    'ytd':  ytd,
    '1yr':  ret(252),
    '3yr':  ann(756,  3),
    '5yr':  ann(1260, 5),
    '10yr': ann(2520, 10),
    'since': since,
  };
}

// ── RISK SCORING ──────────────────────────────────────────────────────────────

/**
 * Assign Morningstar-style risk label based on percentile among cohort.
 * Matches risk_score_label() in the Python script.
 *
 * @param {number}   stdAnn       - this fund's annualized std dev
 * @param {number[]} categoryStds - all funds' std devs in the cohort
 * @returns {string}
 */
export function riskScoreLabel(stdAnn, categoryStds) {
  if (!categoryStds || categoryStds.length < 2 || stdAnn == null) return 'Average';
  const sorted = [...categoryStds].sort((a, b) => a - b);
  const pct = sorted.filter(v => v <= stdAnn).length / sorted.length;
  if (pct <= 0.10) return 'Low';
  if (pct <= 0.30) return 'Below Avg';
  if (pct <= 0.70) return 'Average';
  if (pct <= 0.90) return 'Above Avg';
  return 'High';
}

// ── HOLDINGS OVERLAP ──────────────────────────────────────────────────────────

/**
 * Compute pairwise overlap matrix.
 * overlap[t1][t2] = fraction of t1's holdings that appear in t2.
 *
 * @param {{ [ticker]: string[] }} holdingsMap - ticker → array of holding symbols
 * @returns {{ [t1]: { [t2]: number } }}
 */
export function overlapMatrix(holdingsMap) {
  const tickers = Object.keys(holdingsMap);
  const result  = {};
  const SKIP    = new Set(['', '—', 'GOLD BULLION']);

  for (const t1 of tickers) {
    result[t1] = {};
    const h1 = new Set(holdingsMap[t1].filter(s => !SKIP.has(s)));
    for (const t2 of tickers) {
      const h2 = new Set(holdingsMap[t2].filter(s => !SKIP.has(s)));
      result[t1][t2] = h1.size > 0
        ? [...h1].filter(s => h2.has(s)).length / h1.size
        : 0;
    }
  }
  return result;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function round4(v) { return Math.round(v * 10000) / 10000; }
function round2(v) { return Math.round(v * 100)   / 100;   }

/**
 * Parse fund metadata from quoteSummary into a clean object.
 * Handles the same fields as fetch_fund() in the Python script.
 */
export function parseSummary(ticker, summary) {
  const ks = summary?.defaultKeyStatistics ?? {};
  const fp = summary?.fundProfile          ?? {};
  const th = summary?.topHoldings          ?? {};
  const pr = summary?.price                ?? {};
  const sp = summary?.summaryProfile       ?? {};

  const name     = pr.longName ?? pr.shortName ?? ticker;
  const category = fp.categoryName ?? sp.sector ?? '—';
  const manager  = fp.family ?? '—';

  // Inception date (Unix timestamp → ISO date string)
  let inception = '—';
  const incRaw  = ks.fundInceptionDate?.raw ?? ks.fundInceptionDate;
  if (incRaw && typeof incRaw === 'number') {
    try { inception = new Date(incRaw * 1000).toISOString().slice(0, 10); }
    catch { inception = '—'; }
  }

  const expRatio = ks.annualReportExpenseRatio?.raw
                ?? ks.expenseRatio?.raw
                ?? 0;
  const aum      = (ks.totalAssets?.raw ?? 0) / 1e9;  // in billions
  const price    = pr.regularMarketPrice?.raw ?? null;

  // Turnover is in defaultKeyStatistics, not fundProfile
  const turnover = ks.annualHoldingsTurnover?.raw ?? null;

  // Number of holdings
  const numHoldings = th.holdingsCount ?? null;

  // MS stars
  const msStars = parseInt(ks.morningStarOverallRating?.raw ?? 0, 10) || 0;

  // Top holdings: [{ symbol, name, holdingPercent (decimal) }]
  const holdingsRaw = th.holdings ?? [];
  const holdings = holdingsRaw.slice(0, 10).map(h => {
    const sym = h.symbol ?? '—';
    const pct = (h.holdingPercent?.raw ?? h.holdingPercent ?? 0) * 100;
    return [sym, round2(pct)];
  }).filter(([sym]) => sym && sym !== '—' && sym !== 'nan');

  // Sector weightings: [{realestate: 0.12}, ...] flattened
  const SECTOR_NAMES = {
    'technology':          'Technology',
    'communication_services': 'Comm. Services',
    'consumer_cyclical':   'Consumer Disc.',
    'consumer_defensive':  'Consumer Staples',
    'financial_services':  'Financials',
    'healthcare':          'Healthcare',
    'industrials':         'Industrials',
    'basic_materials':     'Materials',
    'energy':              'Energy',
    'utilities':           'Utilities',
    'realestate':          'Real Estate',
    'real_estate':         'Real Estate',
  };

  const rawSectors = th.sectorWeightings ?? [];
  const sectorMap  = {};
  for (const obj of rawSectors) {
    for (const [k, v] of Object.entries(obj)) {
      const nm  = SECTOR_NAMES[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const pct = (v?.raw ?? v ?? 0) * 100;
      sectorMap[nm] = (sectorMap[nm] ?? 0) + pct;
    }
  }
  const sectors = Object.entries(sectorMap)
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([nm, p]) => [nm, round2(p)]);

  return {
    name, category, manager, inception,
    expRatio, turnover, aum, price, numHoldings,
    msStars,
    msAnalyst: '—',
    holdings,
    sectors,
  };
}

/**
 * Parse normalized Morningstar summary returned by mstar-backend /fund/{ticker}/summary.
 * The backend already extracts all fields, so this is a pass-through with defaults.
 *
 * @param {string} ticker
 * @param {object} data - response from morningstar-api.js fetchSummary()
 * @returns same shape as parseSummary()
 */
export function parseMorningstarSummary(ticker, data) {
  return {
    name:        data.name        ?? ticker,
    category:    data.category    ?? '—',
    manager:     data.manager     ?? '—',
    inception:   data.inception   ?? '—',
    expRatio:    data.expRatio    ?? 0,
    turnover:    data.turnover    ?? null,
    aum:         data.aum         ?? 0,
    price:       data.price       ?? null,
    numHoldings: data.numHoldings ?? null,
    msStars:     data.msStars     ?? 0,
    msAnalyst:   data.msAnalyst   ?? '—',
    holdings:    data.holdings    ?? [],
    sectors:     data.sectors     ?? [],
  };
}
