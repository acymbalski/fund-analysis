/**
 * benchmark.js — Determine a fund's benchmark ticker.
 * Logic mirrors get_benchmark() in refresh_funds.py exactly.
 */

export const KNOWN_BENCH_NAMES = {
  '^GSPC':     'S&P 500',
  '^NDX':      'Nasdaq 100',
  '^RUT':      'Russell 2000',
  'EFA':       'MSCI EAFE',
  'EEM':       'MSCI Emerging Markets',
  'AGG':       'Bloomberg US Agg Bond',
  'BND':       'Bloomberg US Agg Bond',
  '^IRX':      '3-Mo T-Bill',
  '^TNX':      '10-Yr Treasury',
  'GC=F':      'Gold',
  '^DJI':      'Dow Jones',
  '^W5000':    'Wilshire 5000',
  '^SP400':    'S&P MidCap 400',
  'ACWI':      'MSCI ACWI',
  'SHY':       'Bloomberg 1-3 Yr US Govt',
  'TLT':       'Bloomberg US Long Govt',
  'HYG':       'Bloomberg US HY Bond',
  'TIP':       'Bloomberg US TIPS',
  'VNQ':       'MSCI US REIT',
  'GLD':       'LBMA Gold Price',
  'DJP':       'Bloomberg Commodity',
  'BWX':       'FTSE World Govt Bond ex-US',
};

// Category string → [benchmarkTicker, benchmarkName]
// Keys are lowercase substrings (matched with .includes()).
// CRITICAL: more specific entries MUST come before generic ones.
// e.g. 'foreign large blend' before 'large blend' to avoid false match.
export const CATEGORY_BENCH = {
  // Foreign / international (must precede bare 'large' / 'small')
  'foreign large blend':            ['EFA',    'MSCI EAFE'],
  'foreign large growth':           ['EFA',    'MSCI EAFE Growth'],
  'foreign large value':            ['EFA',    'MSCI EAFE Value'],
  'diversified emerging':           ['EEM',    'MSCI Emerging Markets'],
  'world large blend':              ['ACWI',   'MSCI ACWI'],
  'world bond':                     ['BWX',    'FTSE World Govt Bond ex-US'],

  // Domestic equity
  'large blend':                    ['^GSPC',  'S&P 500'],
  'large growth':                   ['^NDX',   'Nasdaq 100'],
  'large value':                    ['^GSPC',  'S&P 500 Value'],
  'mid-cap blend':                  ['^SP400', 'S&P MidCap 400'],
  'mid-cap growth':                 ['^SP400', 'S&P MidCap 400'],
  'mid-cap value':                  ['^SP400', 'S&P MidCap 400'],
  'small blend':                    ['^RUT',   'Russell 2000'],
  'small growth':                   ['^RUT',   'Russell 2000 Growth'],
  'small value':                    ['^RUT',   'Russell 2000 Value'],

  // Fixed income (more specific before more generic)
  'intermediate core-plus bond':    ['AGG',    'Bloomberg US Agg Bond'],
  'intermediate core bond':         ['AGG',    'Bloomberg US Agg Bond'],
  'short-term bond':                ['SHY',    'Bloomberg 1-3 Yr US Govt'],
  'long-term bond':                 ['TLT',    'Bloomberg US Long Govt'],
  'high yield bond':                ['HYG',    'Bloomberg US HY Bond'],
  'inflation-protected bond':       ['TIP',    'Bloomberg US TIPS'],
  'multisector bond':               ['AGG',    'Bloomberg US Agg Bond'],

  // Alternatives / real assets
  'real estate':                    ['VNQ',    'MSCI US REIT'],
  'commodities gold':               ['GLD',    'LBMA Gold Price'],
  'commodities broad basket':       ['DJP',    'Bloomberg Commodity'],
};

/**
 * Determine a fund's benchmark from quoteSummary data.
 * Priority: explicit benchmarkTicker field → category mapping → default.
 *
 * @param {string} ticker - the fund ticker (to avoid self-reference)
 * @param {object} summary - quoteSummary result object from api.js
 * @returns {[string, string]} [benchTicker, benchName]
 */
export function getBenchmark(ticker, summary) {
  const ks  = summary?.defaultKeyStatistics ?? {};
  const fp  = summary?.fundProfile ?? {};
  const sp  = summary?.summaryProfile ?? {};

  // 1. Explicit benchmark fields
  const explicitTicker = ks.benchmarkTicker ?? fp.benchmarkTicker ?? fp.benchmark;
  if (explicitTicker && explicitTicker !== ticker) {
    const name = ks.benchmarkName ?? fp.benchmarkName ?? KNOWN_BENCH_NAMES[explicitTicker] ?? explicitTicker;
    return [explicitTicker, name];
  }

  // 2. Category-based lookup
  const category = (
    fp.categoryName ?? sp.sector ?? ''
  ).toLowerCase();

  for (const [catKey, bench] of Object.entries(CATEGORY_BENCH)) {
    if (category.includes(catKey)) return bench;
  }

  // 3. legalType / bond signal
  const legalType = (fp.legalType ?? '').toLowerCase();
  if (['bond', 'fixed income', 'debt', 'money market'].some(w => legalType.includes(w))) {
    return ['AGG', 'Bloomberg US Agg Bond'];
  }

  // 4. Default
  return ['^GSPC', 'S&P 500'];
}
