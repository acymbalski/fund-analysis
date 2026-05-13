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

  const headers = [
    'Ticker', 'Name', 'Category', 'Manager', 'Benchmark',
    'Exp Ratio', 'Turnover', 'AUM ($B)', 'Price ($)',
    '1mo', '3mo', 'YTD', '1yr', '3yr', '5yr', '10yr', 'Since Inc',
    'Analyst', 'Cat Rank', 'MS Stars', '# Holdings',
    'Alpha', 'Beta', 'R²', 'Std Dev', 'Sharpe', 'Sortino', 'Max DD',
    'Up Cap', 'Dn Cap', 'Calmar',
  ];

  const rows = [headers];
  for (const f of fundData) {
    const g = f.greeks;
    rows.push([
      f.ticker,
      f.name,
      f.category,
      f.manager,
      f.benchName ?? f.benchTicker,
      f.expRatio ?? 0,
      f.turnover ?? '—',
      f.aum ?? 0,
      f.price ?? '—',
      fmtPerfVal(f.perf?.['1mo']),
      fmtPerfVal(f.perf?.['3mo']),
      fmtPerfVal(f.perf?.['ytd']),
      fmtPerfVal(f.perf?.['1yr']),
      fmtPerfVal(f.perf?.['3yr']),
      fmtPerfVal(f.perf?.['5yr']),
      fmtPerfVal(f.perf?.['10yr']),
      fmtPerfVal(f.perf?.['since']),
      f.msAnalyst ?? '—',
      '—',
      f.msStars ?? 0,
      f.numHoldings ?? '—',
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

  styleHeaderRow(ws, 0, headers.length);

  // Style data rows
  const PERF_COLS = [9, 10, 11, 12, 13, 14, 15, 16]; // 0-based col indices for perf
  for (let ri = 0; ri < fundData.length; ri++) {
    const rowIdx = ri + 1;
    const f = fundData[ri];

    // Ticker
    styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c: 0 }), S.ticker);

    // Perf cells
    for (const ci of PERF_COLS) {
      const perfKey = ['1mo','3mo','ytd','1yr','3yr','5yr','10yr','since'][ci - 9];
      const v = f.perf?.[perfKey];
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

function buildDeepDive(fundData) {
  const XLSX = window.XLSX;
  const rows = [];

  for (const f of fundData) {
    // Identity block
    rows.push([`=== ${f.ticker} — ${f.name} ===`]);
    rows.push(['Field', 'Value']);
    rows.push(['Ticker',     f.ticker]);
    rows.push(['Name',       f.name]);
    rows.push(['Category',   f.category]);
    rows.push(['Manager',    f.manager]);
    rows.push(['Inception',  f.inception]);
    rows.push(['Benchmark',  `${f.benchName} (${f.benchTicker})`]);
    rows.push(['Exp Ratio',  f.expRatio != null ? (f.expRatio * 100).toFixed(3) + '%' : '—']);
    rows.push(['Turnover',   f.turnover != null ? (f.turnover * 100).toFixed(1) + '%' : '—']);
    rows.push(['AUM',        f.aum ? `$${f.aum.toFixed(1)}B` : '—']);
    rows.push(['Price',      f.price != null ? `$${f.price.toFixed(2)}` : '—']);
    rows.push(['# Holdings', f.numHoldings ?? '—']);
    rows.push(['MS Stars',   f.msStars ?? 0]);
    rows.push([]);

    // Performance block
    rows.push(['Performance']);
    rows.push(['Period', 'Return']);
    for (const [key, label] of [['1mo','1 Month'],['3mo','3 Month'],['ytd','YTD'],
                                  ['1yr','1 Year'],['3yr','3 Yr Ann.'],['5yr','5 Yr Ann.'],['10yr','10 Yr Ann.']]) {
      rows.push([label, fmtPerfVal(f.perf?.[key])]);
    }
    rows.push([]);

    // Greeks block
    const g = f.greeks;
    rows.push(['Greeks']);
    rows.push(['Metric', 'Value']);
    rows.push(['Alpha',   g ? (g.alpha >= 0 ? '+' : '') + g.alpha.toFixed(2) : '—']);
    rows.push(['Beta',    g ? g.beta.toFixed(2) : '—']);
    rows.push(['R²',      g ? g.r2.toFixed(1) : '—']);
    rows.push(['Std Dev', g ? (g.std * 100).toFixed(1) + '%' : '—']);
    rows.push(['Sharpe',  g ? g.sharpe.toFixed(2) : '—']);
    rows.push(['Sortino', g ? g.sortino.toFixed(2) : '—']);
    rows.push(['Max DD',  g ? fmtMdd(g.mdd) : '—']);
    rows.push(['Up Cap',  g ? (g.upcap * 100).toFixed(0) + '%' : '—']);
    rows.push(['Dn Cap',  g ? (g.dncap * 100).toFixed(0) + '%' : '—']);
    rows.push(['Calmar',  g ? g.calmar.toFixed(2) : '—']);
    rows.push([]);

    // Holdings block
    rows.push(['Top Holdings']);
    rows.push(['Symbol', 'Weight %']);
    for (const [sym, pct] of (f.holdings ?? [])) {
      rows.push([sym, pct != null ? pct.toFixed(2) + '%' : '—']);
    }
    rows.push([]);

    // Sectors block
    rows.push(['Sector Allocation']);
    rows.push(['Sector', 'Weight %']);
    for (const [name, pct] of (f.sectors ?? [])) {
      rows.push([name, pct != null ? pct.toFixed(1) + '%' : '—']);
    }
    rows.push([]);
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 35 }];
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
