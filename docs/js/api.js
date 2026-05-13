/**
 * api.js — Yahoo Finance data fetching via self-hosted CF Worker CORS proxy.
 *
 * Two endpoints per ticker:
 *   fetchChart(ticker, range)   → { timestamps: Date[], prices: number[] }
 *   fetchSummary(ticker)        → raw quoteSummary modules object
 *
 * Benchmark histories are cached externally by the caller (see main.js).
 */

const PROXY = 'https://proxy.acymbalski.workers.dev/?url=';
const YF_BASE = 'https://query1.finance.yahoo.com';

function proxyUrl(url) {
  return PROXY + encodeURIComponent(url);
}

/**
 * Fetch adjusted-close price history.
 * @param {string} ticker - Yahoo Finance ticker (e.g. "VOO", "^GSPC")
 * @param {string} range  - "2y" | "10y" (default "10y")
 * @returns {{ timestamps: Date[], prices: number[] }}
 */
export async function fetchChart(ticker, range = '10y') {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${range}&interval=1d&includePrePost=false`;
  const res = await fetch(proxyUrl(url));
  if (!res.ok) throw new Error(`Chart fetch failed for ${ticker}: HTTP ${res.status}`);
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);

  const rawTs  = result.timestamp;
  const closes = result.indicators?.adjclose?.[0]?.adjclose
              ?? result.indicators?.quote?.[0]?.close;

  if (!rawTs || !closes) throw new Error(`Empty price data for ${ticker}`);

  // Filter out nulls, align arrays
  const timestamps = [];
  const prices     = [];
  for (let i = 0; i < rawTs.length; i++) {
    if (closes[i] != null && isFinite(closes[i])) {
      timestamps.push(new Date(rawTs[i] * 1000));
      prices.push(closes[i]);
    }
  }
  if (prices.length < 2) throw new Error(`Too few data points for ${ticker}`);
  return { timestamps, prices };
}

/**
 * Fetch fund metadata (category, holdings, sectors, expense ratio, AUM, etc.)
 * @param {string} ticker
 * @returns {object} - keyed quoteSummary modules
 */
export async function fetchSummary(ticker) {
  const modules = [
    'summaryProfile',
    'defaultKeyStatistics',
    'fundProfile',
    'topHoldings',
    'fundPerformance',
    'assetProfile',
    'price',
  ].join(',');

  const url = `${YF_BASE}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
    `?modules=${modules}`;
  const res = await fetch(proxyUrl(url));
  if (!res.ok) throw new Error(`Summary fetch failed for ${ticker}: HTTP ${res.status}`);
  const json = await res.json();

  const result = json?.quoteSummary?.result?.[0];
  if (!result) {
    const errMsg = json?.quoteSummary?.error?.description ?? 'Unknown error';
    throw new Error(`No summary data for ${ticker}: ${errMsg}`);
  }
  return result;
}

/**
 * Convenience: fetch both chart + summary in parallel.
 * @returns {{ chart: {timestamps, prices}, summary: object }}
 */
export async function fetchFundData(ticker) {
  const [chart, summary] = await Promise.all([
    fetchChart(ticker, '10y'),
    fetchSummary(ticker),
  ]);
  return { chart, summary };
}
