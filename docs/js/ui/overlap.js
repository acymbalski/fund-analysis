/**
 * overlap.js — Renders holdings overlap heatmap, shared holdings, and sector
 * allocation into #pane-overlap.
 */

const SKIP_SYMS = new Set(['', '—', 'GOLD BULLION']);

const SECTOR_PALETTE = [
  '#1565C0','#C62828','#2E7D32','#F57F17','#6A1B9A','#00838F',
  '#558B2F','#AD1457','#4527A0','#0277BD','#00695C','#E65100',
];

// ── Chart instance ────────────────────────────────────────────────────────────

let _sectorChart = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function heatmapClass(val) {
  if (val >= 0.5) return 'heatmap-high';
  if (val >= 0.3) return 'heatmap-med';
  if (val >= 0.1) return 'heatmap-low';
  if (val >  0)   return 'heatmap-trace';
  return 'heatmap-none';
}

/**
 * Compute overlap fraction: how many of t1's holdings appear in t2.
 * Returns value in [0, 1].
 */
function overlap(h1Syms, h2Set) {
  const h1 = h1Syms.filter(s => !SKIP_SYMS.has(s));
  if (h1.length === 0) return 0;
  return h1.filter(s => h2Set.has(s)).length / h1.length;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ── Section 1: Heatmap ────────────────────────────────────────────────────────

function renderHeatmap(pane, fundData) {
  const banner = el('div', 'section-banner',
    'HOLDINGS OVERLAP — % of row fund\'s holdings also in column fund');
  pane.appendChild(banner);

  // Pre-compute holding symbol arrays and sets
  const holdingSyms = fundData.map(f =>
    (f.holdings ?? []).map(([sym]) => sym).filter(s => !SKIP_SYMS.has(s))
  );
  const holdingSets = holdingSyms.map(arr => new Set(arr));

  const wrap = el('div', 'data-table-wrap');
  const table = el('table', 'data-table');

  // Header row
  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  hRow.appendChild(document.createElement('th')); // blank corner
  for (const f of fundData) {
    const th = el('th', null, f.ticker);
    hRow.appendChild(th);
  }
  thead.appendChild(hRow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  for (let r = 0; r < fundData.length; r++) {
    const tr = document.createElement('tr');
    const th = el('th', 'ticker-cell', fundData[r].ticker);
    tr.appendChild(th);

    for (let c = 0; c < fundData.length; c++) {
      const td = document.createElement('td');
      if (r === c) {
        td.className = 'heatmap-self';
        td.textContent = '—';
      } else {
        const val = overlap(holdingSyms[r], holdingSets[c]);
        td.className = heatmapClass(val);
        td.textContent = Math.round(val * 100) + '%';
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  pane.appendChild(wrap);

  // Legend
  const legend = el('div', 'legend-row');
  const chips = [
    ['heatmap-high',  '≥ 50%'],
    ['heatmap-med',   '30–50%'],
    ['heatmap-low',   '10–30%'],
    ['heatmap-trace', '< 10% (> 0)'],
    ['heatmap-none',  '0%'],
    ['heatmap-self',  'Self'],
  ];
  for (const [cls, label] of chips) {
    const chip = el('span', `legend-chip ${cls}`, label);
    legend.appendChild(chip);
  }
  pane.appendChild(legend);
}

// ── Section 2: Shared Holdings ────────────────────────────────────────────────

function renderSharedHoldings(pane, fundData) {
  pane.appendChild(el('div', 'section-header',
    'TOP SHARED HOLDINGS — in 2 or more funds'));

  // Count how many funds hold each symbol
  const symFunds = new Map(); // sym → [ticker, ...]
  for (const f of fundData) {
    for (const [sym] of (f.holdings ?? [])) {
      if (SKIP_SYMS.has(sym)) continue;
      if (!symFunds.has(sym)) symFunds.set(sym, []);
      symFunds.get(sym).push(f.ticker);
    }
  }

  // Filter to 2+ funds, sort by count desc then alpha
  const shared = [...symFunds.entries()]
    .filter(([, tickers]) => tickers.length >= 2)
    .sort(([a, at], [b, bt]) => bt.length - at.length || a.localeCompare(b))
    .slice(0, 15);

  if (shared.length === 0) {
    pane.appendChild(el('p', 'muted', 'No holdings shared across 2+ funds.'));
    return;
  }

  const wrap = el('div', 'data-table-wrap');
  const table = el('table', 'data-table');

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  for (const lbl of ['Symbol', '# Funds', 'Funds Holding It']) {
    hRow.appendChild(el('th', null, lbl));
  }
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const [sym, tickers] of shared) {
    const tr = document.createElement('tr');

    const symTd = el('td', 'ticker-cell', sym);
    tr.appendChild(symTd);

    const countTd = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = String(tickers.length);
    strong.style.color = tickers.length >= 3 ? 'var(--crd)' : 'var(--cb)';
    countTd.appendChild(strong);
    tr.appendChild(countTd);

    tr.appendChild(el('td', null, tickers.join(', ')));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  pane.appendChild(wrap);
}

// ── Section 3: Aggregate Sector Allocation ────────────────────────────────────

function renderSectors(pane, fundData) {
  pane.appendChild(el('div', 'section-header',
    'AGGREGATE SECTOR ALLOCATION (all funds combined)'));

  // Aggregate
  const sectorTotals = new Map();
  let grandTotal = 0;
  for (const f of fundData) {
    for (const [name, pct] of (f.sectors ?? [])) {
      sectorTotals.set(name, (sectorTotals.get(name) ?? 0) + pct);
      grandTotal += pct;
    }
  }

  if (sectorTotals.size === 0 || grandTotal === 0) {
    pane.appendChild(el('p', 'muted', 'No sector data available.'));
    return;
  }

  // Normalize to % of grand total
  const sectors = [...sectorTotals.entries()]
    .map(([name, sum]) => [name, sum / grandTotal * 100])
    .sort(([, a], [, b]) => b - a);

  const maxPct = sectors[0][1];
  const BAR_MAX = 20;

  const wrap = el('div', 'data-table-wrap');
  const table = el('table', 'data-table');

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  for (const lbl of ['Sector', 'Weight %', 'Bar']) {
    hRow.appendChild(el('th', null, lbl));
  }
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const [name, pct] of sectors) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'left', name));
    tr.appendChild(el('td', null, pct.toFixed(1) + '%'));
    const barLen = Math.round((pct / maxPct) * BAR_MAX);
    tr.appendChild(el('td', null, '█'.repeat(barLen)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  pane.appendChild(wrap);

  // Pie chart
  const chartWrap = el('div', 'chart-wrap');
  chartWrap.appendChild(el('div', 'chart-title', 'Sector Allocation'));
  const canvas = document.createElement('canvas');
  canvas.id = 'chart-sector-pie';
  canvas.style.maxHeight = '340px';
  chartWrap.appendChild(canvas);
  pane.appendChild(chartWrap);

  if (_sectorChart) {
    _sectorChart.destroy();
    _sectorChart = null;
  }

  _sectorChart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: sectors.map(([n]) => n),
      datasets: [{
        data: sectors.map(([, p]) => parseFloat(p.toFixed(2))),
        backgroundColor: sectors.map((_, i) => SECTOR_PALETTE[i % SECTOR_PALETTE.length]),
        borderWidth: 1,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${ctx.parsed.toFixed(1)}%`,
          },
        },
      },
    },
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderOverlap(fundData) {
  const pane = document.getElementById('pane-overlap');
  pane.textContent = '';

  if (!fundData || fundData.length === 0) {
    pane.appendChild(el('p', 'muted', 'No fund data loaded.'));
    return;
  }

  renderHeatmap(pane, fundData);
  renderSharedHoldings(pane, fundData);
  renderSectors(pane, fundData);
}
