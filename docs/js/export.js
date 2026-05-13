/**
 * export.js — Build and download a 5-sheet XLSX workbook using xlsx-js-style.
 * Accessed via window.XLSX (CDN global).
 */

// ── Style presets ─────────────────────────────────────────────────────────────

const S = {
  header: {
    s: {
      fill: { fgColor: { rgb: '2E5090' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
    },
  },
  banner: {
    s: {
      fill: { fgColor: { rgb: '1A3366' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
    },
  },
  sectionLabel: {
    s: {
      fill: { fgColor: { rgb: '37474F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 8 },
    },
  },
  identLabel: {
    s: {
      fill: { fgColor: { rgb: 'ECEFF1' } },
      font: { color: { rgb: '757575' }, sz: 8 },
    },
  },
  identValue: {
    s: {
      font: { bold: true, color: { rgb: '212121' }, sz: 9 },
    },
  },
  summaryLabel: {
    s: {
      fill: { fgColor: { rgb: 'E3F2FD' } },
      font: { color: { rgb: '1565C0' }, sz: 8 },
    },
  },
  summaryValue: {
    s: {
      fill: { fgColor: { rgb: 'E3F2FD' } },
      font: { bold: true, color: { rgb: '0D47A1' }, sz: 10 },
    },
  },
  ticker: {
    s: {
      fill: { fgColor: { rgb: 'FFF9C4' } },
      font: { bold: true, color: { rgb: '1565C0' }, sz: 11 },
    },
  },
  pos: {
    s: { font: { color: { rgb: '1B5E20' }, bold: true } },
  },
  neg: {
    s: { font: { color: { rgb: 'B71C1C' }, bold: true } },
  },
  riskLow: {
    s: { fill: { fgColor: { rgb: 'C8E6C9' } }, font: { color: { rgb: '1B5E20' }, bold: true } },
  },
  riskHigh: {
    s: { fill: { fgColor: { rgb: 'FFCDD2' } }, font: { color: { rgb: 'B71C1C' }, bold: true } },
  },
  muted: {
    s: { font: { color: { rgb: '9E9E9E' } } },
  },
};

// ── Number format codes ───────────────────────────────────────────────────────

const FMT = {
  pct:  '0.00%',
  pct3: '0.000%',
  usd:  '"$"#,##0.00',
  aum:  '#,##0.0"B"',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Apply style and optional number format to a cell in a worksheet.
 * @param {object} ws   - worksheet object
 * @param {string} ref  - cell reference e.g. "A1"
 * @param {object} style - style preset (has .s)
 * @param {string} [fmt] - number format string
 */
function styleCell(ws, ref, style, fmt) {
  if (!ws[ref]) return;
  ws[ref].s = style.s;
  if (fmt) ws[ref].z = fmt;
}

/**
 * Apply header style to an entire row (row index 0-based).
 */
function styleHeaderRow(ws, rowIdx, numCols) {
  for (let c = 0; c < numCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: rowIdx, c });
    styleCell(ws, ref, S.header);
  }
}

function fmtPerfVal(v) {
  if (v == null) return '—';
  const pct = v * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

function fmtNum(v, decimals = 2) {
  return v != null ? v.toFixed(decimals) : '—';
}

function fmtMdd(v) {
  return v != null ? '-' + (Math.abs(v) * 100).toFixed(1) + '%' : '—';
}

function riskLabel(std, stds) {
  if (!stds || stds.length < 2 || std == null) return 'Average';
  const sorted = [...stds].sort((a, b) => a - b);
  const pct = sorted.filter(v => v <= std).length / sorted.length;
  if (pct <= 0.10) return 'Low';
  if (pct <= 0.30) return 'Below Avg';
  if (pct <= 0.70) return 'Average';
  if (pct <= 0.90) return 'Above Avg';
  return 'High';
}

function riskStyle(label) {
  if (label === 'Low')  return S.riskLow;
  if (label === 'High') return S.riskHigh;
  return null;
}

const SKIP_SYMS = new Set(['', '—', 'GOLD BULLION']);

// ── Sheet 1: Dashboard ────────────────────────────────────────────────────────

function buildDashboard(fundData) {
  const XLSX = window.XLSX;

  // Summary stats bar (mirrors the dashboard-summary div)
  function avg(arr) {
    const vals = arr.filter(v => v != null && isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  const avgExp    = avg(fundData.map(f => f.expRatio));
  const avgPrice  = avg(fundData.map(f => f.price));
  const avg1yr    = avg(fundData.map(f => f.perf?.['1yr']));
  const avgSharpe = avg(fundData.map(f => f.greeks?.sharpe));
  const avgSort   = avg(fundData.map(f => f.greeks?.sortino));
  const avgMdd    = avg(fundData.map(f => f.greeks?.mdd));

  const summaryLabels = ['Funds Tracked', 'Avg Exp Ratio', 'Avg Prev Close', 'Avg 1-Yr Return', 'Avg Sharpe', 'Avg Sortino', 'Avg Max Drawdown'];
  const summaryValues = [
    String(fundData.length),
    avgExp    != null ? (avgExp * 100).toFixed(3) + '%'                            : '—',
    avgPrice  != null ? '$' + avgPrice.toFixed(2)                                  : '—',
    avg1yr    != null ? (avg1yr >= 0 ? '+' : '') + (avg1yr * 100).toFixed(1) + '%' : '—',
    avgSharpe != null ? avgSharpe.toFixed(2)                                        : '—',
    avgSort   != null ? avgSort.toFixed(2)                                          : '—',
    avgMdd    != null ? '-' + (Math.abs(avgMdd) * 100).toFixed(1) + '%'            : '—',
  ];

  const headers = [
    'Ticker', 'Name', 'Category', 'Manager', 'Benchmark',
    'Exp Ratio', 'Turnover', 'AUM ($B)', 'Price ($)',
    '1mo', '3mo', 'YTD', '1yr', '3yr', '5yr', '10yr', 'Since Inc',
    'Analyst', 'Cat Rank', '⭐', '# Hldgs',
    'Alpha', 'Beta', 'R²', 'Std Dev', 'Sharpe', 'Sortino', 'Max DD',
    'Up Cap', 'Dn Cap', 'Calmar',
  ];

  // rows: summary label, summary value, blank, then header + data
  const rows = [summaryLabels, summaryValues, [], headers];
  for (const f of fundData) {
    const g = f.greeks;
    rows.push([
      f.ticker,
      f.name,
      f.category,
      f.manager,
      f.benchName ?? f.benchTicker,
      f.expRatio ?? 0,
      f.turnover != null ? (f.turnover * 100).toFixed(1) + '%' : '—',
      f.aum ?? 0,
      f.price != null ? '$' + f.price.toFixed(2) : '—',
      fmtPerfVal(f.perf?.['1mo']),
      fmtPerfVal(f.perf?.['3mo']),
      fmtPerfVal(f.perf?.['ytd']),
      fmtPerfVal(f.perf?.['1yr']),
      fmtPerfVal(f.perf?.['3yr']),
      fmtPerfVal(f.perf?.['5yr']),
      fmtPerfVal(f.perf?.['10yr']),
      fmtPerfVal(f.perf?.['since'] ?? f.perf?.['sinceInc']),
      f.msAnalyst ?? '—',
      '—',
      f.msStars ? ['', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'][f.msStars] ?? '—' : '—',
      f.numHoldings != null ? String(f.numHoldings) : '—',
      g ? (g.alpha >= 0 ? '+' : '') + g.alpha.toFixed(2) : '—',
      g ? g.beta.toFixed(2) : '—',
      g ? g.r2.toFixed(1) : '—',
      g ? (g.std * 100).toFixed(1) + '%' : '—',
      g ? g.sharpe.toFixed(2) : '—',
      g ? g.sortino.toFixed(2) : '—',
      g ? fmtMdd(g.mdd) : '—',
      g ? (g.upcap * 100).toFixed(0) + '%' : '—',
      g ? (g.dncap * 100).toFixed(0) + '%' : '—',
      g ? g.calmar.toFixed(2) : '—',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 22 }, { wch: 18 }, { wch: 22 },
    { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 9 },
    { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 9 },
    { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 7 }, { wch: 7 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 7 },
  ];

  // Summary rows (0 = labels, 1 = values)
  for (let c = 0; c < summaryLabels.length; c++) {
    styleCell(ws, XLSX.utils.encode_cell({ r: 0, c }), S.summaryLabel);
    styleCell(ws, XLSX.utils.encode_cell({ r: 1, c }), S.summaryValue);
  }

  // Header row is row 3 (0-indexed)
  styleHeaderRow(ws, 3, headers.length);

  // Style data rows (start at row 4)
  const PERF_COLS = [9, 10, 11, 12, 13, 14, 15, 16];
  for (let ri = 0; ri < fundData.length; ri++) {
    const rowIdx = ri + 4;
    const f = fundData[ri];

    styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 0 }), S.ticker);

    for (const ci of PERF_COLS) {
      const perfKey = ['1mo','3mo','ytd','1yr','3yr','5yr','10yr','since'][ci - 9];
      const v = ci === 16
        ? (f.perf?.['since'] ?? f.perf?.['sinceInc'])
        : f.perf?.[perfKey];
      if (v != null) {
        styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: ci }), v >= 0 ? S.pos : S.neg);
      }
    }

    // Exp ratio number format
    {
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: 5 });
      if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = FMT.pct3;
    }

    // AUM format
    {
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: 7 });
      if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = FMT.aum;
    }
  }

  return ws;
}

// ── Sheet 2: Deep Dive ────────────────────────────────────────────────────────
// Layout mirrors the web page: horizontal identity grid, horizontal perf/greeks
// tables, holdings + sectors side-by-side in cols 0–2 and 4–5.

function buildDeepDive(fundData) {
  const XLSX = window.XLSX;
  const rows = [];
  const styleCells = []; // { r, c, style }

  const STARS_TEXT = ['', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'];

  function addRow(cells) {
    const r = rows.length;
    rows.push(cells);
    return r;
  }

  function markStyle(r, c, style) {
    styleCells.push({ r, c, style });
  }

  function markRowStyle(r, numCols, style) {
    for (let c = 0; c < numCols; c++) markStyle(r, c, style);
  }

  for (const f of fundData) {
    const g = f.greeks;

    // ── Banner ──
    const bannerR = addRow([`${f.ticker}  ·  ${f.name}`]);
    markStyle(bannerR, 0, S.banner);

    // ── FUND IDENTITY ──
    const identHdrR = addRow(['FUND IDENTITY']);
    markStyle(identHdrR, 0, S.sectionLabel);

    const identLabelR = addRow([
      'Manager', 'Category', 'Benchmark', 'Inception',
      'Exp Ratio', 'Turnover', 'AUM', 'Prev Close', 'MS Rating', 'Analyst',
    ]);
    markRowStyle(identLabelR, 10, S.identLabel);

    const identValueR = addRow([
      f.manager ?? '—',
      f.category ?? '—',
      f.benchName ?? '—',
      f.inception ?? '—',
      f.expRatio != null ? (f.expRatio * 100).toFixed(3) + '%' : '—',
      f.turnover != null ? (f.turnover * 100).toFixed(1) + '%' : 'N/A',
      f.aum ? `$${f.aum.toFixed(1)}B` : '—',
      f.price != null ? `$${f.price.toFixed(2)}` : '—',
      f.msStars ? (STARS_TEXT[f.msStars] ?? '—') : '—',
      f.msAnalyst ?? '—',
    ]);
    markRowStyle(identValueR, 10, S.identValue);

    addRow([]);

    // ── PERFORMANCE HISTORY ──
    const perfHdrR = addRow(['PERFORMANCE HISTORY  (Total Return %)']);
    markStyle(perfHdrR, 0, S.sectionLabel);

    const perfLabelR = addRow(['1 Month', '3 Month', 'YTD', '1 Year', '3 Yr Ann.', '5 Yr Ann.', '10 Yr Ann.', 'Since Inc.']);
    markRowStyle(perfLabelR, 8, S.header);

    const perfRawVals = [
      f.perf?.['1mo'], f.perf?.['3mo'], f.perf?.['ytd'], f.perf?.['1yr'],
      f.perf?.['3yr'], f.perf?.['5yr'], f.perf?.['10yr'],
      f.perf?.['since'] ?? f.perf?.['sinceInc'],
    ];
    const perfValueR = addRow(perfRawVals.map(v =>
      v == null ? 'N/A' : (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%'
    ));
    for (let c = 0; c < 8; c++) {
      const v = perfRawVals[c];
      if (v != null) markStyle(perfValueR, c, v >= 0 ? S.pos : S.neg);
    }

    addRow([]);

    // ── RISK & GREEKS ──
    const greeksHdrR = addRow([`RISK & GREEKS  (vs ${f.benchName ?? f.benchTicker ?? 'Benchmark'}, trailing 252 days)`]);
    markStyle(greeksHdrR, 0, S.sectionLabel);

    const greekLabelR = addRow(['Alpha', 'Beta', 'R-Squared', 'Std Dev Ann.', 'Sharpe', 'Sortino', 'Up Capture', 'Dn Capture', 'Max Drawdown', 'Calmar']);
    markRowStyle(greekLabelR, 10, S.header);

    const greekValueR = addRow(g ? [
      (g.alpha >= 0 ? '+' : '') + g.alpha.toFixed(2),
      g.beta.toFixed(2),
      g.r2.toFixed(1),
      (g.std * 100).toFixed(1) + '%',
      g.sharpe.toFixed(2),
      g.sortino.toFixed(2),
      (g.upcap * 100).toFixed(0) + '%',
      (g.dncap * 100).toFixed(0) + '%',
      `-${(Math.abs(g.mdd) * 100).toFixed(1)}%`,
      g.calmar.toFixed(2),
    ] : new Array(10).fill('—'));
    if (g) {
      markStyle(greekValueR, 0, g.alpha >= 0 ? S.pos : S.neg);
      markStyle(greekValueR, 4, g.sharpe >= 1 ? S.pos : g.sharpe >= 0.5 ? S.muted : S.neg);
      markStyle(greekValueR, 5, g.sortino >= 1 ? S.pos : g.sortino >= 0.5 ? S.muted : S.neg);
      markStyle(greekValueR, 8, S.neg);
    }

    addRow([]);

    // ── TOP 10 HOLDINGS + SECTOR BREAKDOWN side-by-side ──
    // cols 0-2: holdings, col 3: gap, cols 4-5: sectors
    const holdSectTitleR = addRow(['TOP 10 HOLDINGS', null, null, null, 'SECTOR BREAKDOWN']);
    markStyle(holdSectTitleR, 0, S.sectionLabel);
    markStyle(holdSectTitleR, 4, S.sectionLabel);

    const holdSectColR = addRow(['#', 'Symbol', 'Weight %', null, 'Sector', 'Weight %']);
    markStyle(holdSectColR, 0, S.header);
    markStyle(holdSectColR, 1, S.header);
    markStyle(holdSectColR, 2, S.header);
    markStyle(holdSectColR, 4, S.header);
    markStyle(holdSectColR, 5, S.header);

    const holdings = f.holdings ?? [];
    const sectors  = f.sectors  ?? [];
    const maxLen = Math.max(holdings.length, sectors.length);
    for (let i = 0; i < maxLen; i++) {
      const h = holdings[i];
      const s = sectors[i];
      addRow([
        h ? i + 1 : null,
        h ? h[0] : null,
        h ? Number(h[1]).toFixed(2) + '%' : null,
        null,
        s ? s[0] : null,
        s ? Number(s[1]).toFixed(1) + '%' : null,
      ]);
    }

    addRow([]);
    addRow([]);
    addRow([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  for (const { r, c, style } of styleCells) {
    styleCell(ws, XLSX.utils.encode_cell({ r, c }), style);
  }

  // Col widths accommodate: identity (10 cols), perf (8), greeks (10), holdings+sectors (6)
  ws['!cols'] = [
    { wch: 20 }, // 0: manager / rank / 1mo / alpha
    { wch: 15 }, // 1: category / symbol / 3mo / beta
    { wch: 20 }, // 2: benchmark / weight% / ytd / r-squared
    { wch: 12 }, // 3: inception / (gap) / 1yr / std dev
    { wch: 24 }, // 4: exp ratio / sector / 3yr / sharpe
    { wch: 12 }, // 5: turnover / sector-wt% / 5yr / sortino
    { wch: 12 }, // 6: aum / 10yr / up capture
    { wch: 12 }, // 7: prev close / since inc / dn capture
    { wch: 14 }, // 8: ms rating / max drawdown
    { wch: 12 }, // 9: analyst / calmar
  ];

  return ws;
}

// ── Sheet 3: Overlap ──────────────────────────────────────────────────────────

function buildOverlap(fundData) {
  const XLSX = window.XLSX;
  const rows = [];

  // Pre-compute holding arrays/sets
  const tickers   = fundData.map(f => f.ticker);
  const holdSyms  = fundData.map(f =>
    (f.holdings ?? []).map(([sym]) => sym).filter(s => !SKIP_SYMS.has(s))
  );
  const holdSets  = holdSyms.map(arr => new Set(arr));

  // Heatmap header
  rows.push(['HOLDINGS OVERLAP — % of row fund\'s holdings also in column fund']);
  rows.push(['', ...tickers]);

  for (let r = 0; r < fundData.length; r++) {
    const row = [tickers[r]];
    for (let c = 0; c < fundData.length; c++) {
      if (r === c) {
        row.push('—');
      } else {
        const h1 = holdSyms[r];
        const h2 = holdSets[c];
        const val = h1.length > 0 ? h1.filter(s => h2.has(s)).length / h1.length : 0;
        row.push(Math.round(val * 100) + '%');
      }
    }
    rows.push(row);
  }

  rows.push([]);
  rows.push([]);

  // Shared holdings
  rows.push(['TOP SHARED HOLDINGS — in 2 or more funds']);
  rows.push(['Symbol', '# Funds', 'Funds Holding It']);

  const symFunds = new Map();
  for (const f of fundData) {
    for (const [sym] of (f.holdings ?? [])) {
      if (SKIP_SYMS.has(sym)) continue;
      if (!symFunds.has(sym)) symFunds.set(sym, []);
      symFunds.get(sym).push(f.ticker);
    }
  }

  const shared = [...symFunds.entries()]
    .filter(([, tks]) => tks.length >= 2)
    .sort(([a, at], [b, bt]) => bt.length - at.length || a.localeCompare(b))
    .slice(0, 15);

  for (const [sym, tks] of shared) {
    rows.push([sym, tks.length, tks.join(', ')]);
  }

  rows.push([]);
  rows.push([]);

  // Aggregate sector allocation
  rows.push(['AGGREGATE SECTOR ALLOCATION (all funds combined)']);
  rows.push(['Sector', 'Weight %']);

  const sectorTotals = new Map();
  let grandTotal = 0;
  for (const f of fundData) {
    for (const [name, pct] of (f.sectors ?? [])) {
      sectorTotals.set(name, (sectorTotals.get(name) ?? 0) + pct);
      grandTotal += pct;
    }
  }

  const sectors = [...sectorTotals.entries()]
    .map(([name, sum]) => [name, grandTotal > 0 ? sum / grandTotal * 100 : 0])
    .sort(([, a], [, b]) => b - a);

  for (const [name, pct] of sectors) {
    rows.push([name, pct.toFixed(1) + '%']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 9 }, ...tickers.map(() => ({ wch: 9 }))];

  // Style header rows
  styleHeaderRow(ws, 1, tickers.length + 1);

  return ws;
}

// ── Sheet 4: Performance ──────────────────────────────────────────────────────

function buildPerformance(fundData) {
  const XLSX = window.XLSX;
  const rows = [];

  // Perf comparison table
  rows.push(['PERFORMANCE COMPARISON — All Funds Side-by-Side']);
  const perfHeaders = ['Fund', '1 Month', '3 Month', 'YTD', '1 Year', '3 Yr Ann.', '5 Yr Ann.', '10 Yr Ann.', 'Since Inc.'];
  rows.push(perfHeaders);

  for (const f of fundData) {
    rows.push([
      f.ticker,
      fmtPerfVal(f.perf?.['1mo']),
      fmtPerfVal(f.perf?.['3mo']),
      fmtPerfVal(f.perf?.['ytd']),
      fmtPerfVal(f.perf?.['1yr']),
      fmtPerfVal(f.perf?.['3yr']),
      fmtPerfVal(f.perf?.['5yr']),
      fmtPerfVal(f.perf?.['10yr']),
      fmtPerfVal(f.perf?.['since']),
    ]);
  }

  rows.push([]);
  rows.push([]);

  // Greeks table
  rows.push(['GREEKS (vs each fund\'s own benchmark, trailing ~252 days)']);
  const greekHeaders = ['Fund', 'Alpha', 'Beta', 'R²', 'Std Dev', 'Sharpe', 'Sortino', 'Max DD', 'Calmar'];
  rows.push(greekHeaders);

  for (const f of fundData) {
    const g = f.greeks;
    rows.push([
      f.ticker,
      g ? (g.alpha >= 0 ? '+' : '') + g.alpha.toFixed(2) : '—',
      g ? g.beta.toFixed(2) : '—',
      g ? g.r2.toFixed(1) : '—',
      g ? (g.std * 100).toFixed(1) + '%' : '—',
      g ? g.sharpe.toFixed(2) : '—',
      g ? g.sortino.toFixed(2) : '—',
      g ? fmtMdd(g.mdd) : '—',
      g ? g.calmar.toFixed(2) : '—',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  ];

  // Style header rows (row index 1 = perf headers, row index rows.length-fundData.length-1 = greeks headers)
  styleHeaderRow(ws, 1, perfHeaders.length);
  const greekHeaderRow = 3 + fundData.length; // row 0 banner, row 1 header, rows 2..N+1 data, row N+2 blank, row N+3 blank, row N+4 banner, row N+5 greeks header
  styleHeaderRow(ws, greekHeaderRow + 1, greekHeaders.length);

  // Style ticker + perf cells for perf table (rows 2..fundData.length+1)
  for (let ri = 0; ri < fundData.length; ri++) {
    const rowIdx = ri + 2;
    const f = fundData[ri];
    styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 0 }), S.ticker);
    const perfKeys = ['1mo','3mo','ytd','1yr','3yr','5yr','10yr'];
    for (let ci = 0; ci < perfKeys.length; ci++) {
      const v = f.perf?.[perfKeys[ci]];
      if (v != null) {
        styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: ci + 1 }), v >= 0 ? S.pos : S.neg);
      }
    }
  }

  return ws;
}

// ── Sheet 5: Risk ─────────────────────────────────────────────────────────────

function buildRisk(fundData) {
  const XLSX = window.XLSX;
  const rows = [];

  const stds3 = fundData.map(f => f.risk3yr?.std).filter(v => v != null);
  const stds5 = fundData.map(f => f.risk5yr?.std).filter(v => v != null);

  function riskRows(riskKey, perfKey, stds) {
    const yr = riskKey === 'risk3yr' ? '3Yr' : '5Yr';
    const headers = [
      'Fund', 'Benchmark',
      `${yr} Return`, `${yr} Std Dev`, `${yr} Sharpe`, `${yr} Sortino`,
      `${yr} Max DD`, `${yr} Beta`, `${yr} Alpha`,
      `${yr} Up Cap`, `${yr} Dn Cap`, 'Risk Score',
    ];
    const dataRows = [];
    for (const f of fundData) {
      const risk = f[riskKey];
      const ret  = f.perf?.[perfKey];
      dataRows.push([
        f.ticker,
        f.benchName ?? f.benchTicker ?? '—',
        fmtPerfVal(ret),
        risk ? (risk.std * 100).toFixed(1) + '%' : '—',
        risk ? risk.sharpe.toFixed(2) : '—',
        risk ? risk.sortino.toFixed(2) : '—',
        risk ? fmtMdd(risk.mdd) : '—',
        risk ? risk.beta.toFixed(2) : '—',
        risk ? (risk.alpha >= 0 ? '+' : '') + risk.alpha.toFixed(2) : '—',
        risk ? (risk.upcap * 100).toFixed(0) + '%' : '—',
        risk ? (risk.dncap * 100).toFixed(0) + '%' : '—',
        risk ? riskLabel(risk.std, stds) : '—',
      ]);
    }
    return { headers, dataRows };
  }

  const r3 = riskRows('risk3yr', '3yr', stds3);
  const r5 = riskRows('risk5yr', '5yr', stds5);

  // 3yr block
  rows.push(['3-YEAR RISK METRICS (rolling 756 trading days vs fund\'s own benchmark)']);
  rows.push(r3.headers);
  for (const dr of r3.dataRows) rows.push(dr);
  rows.push([]);
  rows.push([]);

  // 5yr block
  rows.push(['5-YEAR RISK METRICS (rolling 1260 trading days vs fund\'s own benchmark)']);
  rows.push(r5.headers);
  for (const dr of r5.dataRows) rows.push(dr);
  rows.push([]);
  rows.push([]);

  // Risk legend
  rows.push(['RISK SCORE LEGEND']);
  rows.push(['Label', 'Description']);
  const RISK_DESCS = {
    'Low':       'Bottom 10% std dev — lowest volatility in cohort',
    'Below Avg': '10th–30th percentile — below average volatility',
    'Average':   '30th–70th percentile — typical volatility for category',
    'Above Avg': '70th–90th percentile — above average volatility',
    'High':      'Top 10% std dev — highest volatility in cohort',
  };
  for (const [label, desc] of Object.entries(RISK_DESCS)) rows.push([label, desc]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 11 },
  ];

  // Style headers at row 1 and row 4 + fundData.length
  styleHeaderRow(ws, 1, r3.headers.length);
  const r5HeaderRow = 3 + fundData.length + 2 + 1; // banner + header + data + 2 blank + banner
  // Actually compute exact position
  const r5BannerIdx = 2 + fundData.length + 2; // 0-indexed row of 5yr banner
  styleHeaderRow(ws, r5BannerIdx + 1, r5.headers.length);

  // Style ticker cells + perf + risk score for 3yr data
  for (let ri = 0; ri < fundData.length; ri++) {
    const rowIdx = ri + 2;
    const f = fundData[ri];
    styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 0 }), S.ticker);
    // Risk score
    const risk3 = f.risk3yr;
    if (risk3) {
      const label = riskLabel(risk3.std, stds3);
      const style = riskStyle(label);
      if (style) styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 11 }), style);
    }
  }

  // Style ticker cells + risk score for 5yr data
  const r5StartRow = r5BannerIdx + 2;
  for (let ri = 0; ri < fundData.length; ri++) {
    const rowIdx = r5StartRow + ri;
    const f = fundData[ri];
    styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 0 }), S.ticker);
    const risk5 = f.risk5yr;
    if (risk5) {
      const label = riskLabel(risk5.std, stds5);
      const style = riskStyle(label);
      if (style) styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 11 }), style);
    }
  }

  return ws;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportXlsx(fundData) {
  const XLSX = window.XLSX;
  if (!XLSX) {
    alert('XLSX library not loaded. Check CDN link.');
    return;
  }

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildDashboard(fundData),   'Dashboard');
  XLSX.utils.book_append_sheet(wb, buildDeepDive(fundData),    'Deep Dive');
  XLSX.utils.book_append_sheet(wb, buildOverlap(fundData),     'Overlap');
  XLSX.utils.book_append_sheet(wb, buildPerformance(fundData), 'Performance');
  XLSX.utils.book_append_sheet(wb, buildRisk(fundData),        'Risk');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Fund_ETF_Screener_${today}.xlsx`);
}
