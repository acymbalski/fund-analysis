/**
 * deepdive.js — Renders per-fund detail cards into #pane-deepdive.
 */

const STARS = { 1: '★☆☆☆☆', 2: '★★☆☆☆', 3: '★★★☆☆', 4: '★★★★☆', 5: '★★★★★' };

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtPct1(v) {
  return v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`;
}

function fmtPct3(v) {
  return v == null ? 'N/A' : `${(v * 100).toFixed(3)}%`;
}

function fmtPerfVal(v) {
  if (v == null) return null;
  const pct = v * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

function perfColor(v) {
  if (v == null) return 'var(--cgm)';
  return v >= 0 ? 'var(--cgd)' : 'var(--crd)';
}

function sharpeColor(v) {
  if (v == null) return 'var(--cgm)';
  return v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
}

// ── Section banner ────────────────────────────────────────────────────────────

function makeBanner(fund) {
  const banner = el('div', 'section-banner');
  banner.textContent = `${fund.ticker} · ${fund.name}`;
  return banner;
}

// ── Identity grid ─────────────────────────────────────────────────────────────

function makeIdentityGrid(fund) {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid var(--cbd);';

  const items = [
    ['Manager',       fund.manager ?? '—'],
    ['Category',      fund.category ?? '—'],
    ['Benchmark',     fund.benchName ?? '—'],
    ['Inception',     fund.inception ?? '—'],
    ['Exp Ratio',     fund.expRatio != null ? fmtPct3(fund.expRatio) : '—'],
    ['Turnover',      fund.turnover != null ? fmtPct1(fund.turnover) : 'N/A'],
    ['AUM',           fund.aum ? `$${fund.aum.toFixed(1)}B` : '—'],
    ['Prev Close',    fund.price != null ? `$${fund.price.toFixed(2)}` : '—'],
    ['MS Rating',     (() => {
      const s = fund.msStars ?? 0;
      return STARS[s] ?? '—';
    })()],
    ['Analyst Medal', '—'],
  ];

  for (const [label, value] of items) {
    const cell = document.createElement('div');
    cell.style.cssText = 'padding:8px 14px;min-width:140px;flex:1 1 140px;border-right:1px solid var(--cbd);border-bottom:1px solid var(--cbd);';

    const lbl = el('div', null, label);
    lbl.style.cssText = 'font-size:8pt;color:var(--cgm);margin-bottom:2px;';

    const val = el('div', null, value);
    val.style.cssText = 'font-size:9pt;font-weight:600;color:var(--ct);';

    // Special styling for stars
    if (label === 'MS Rating') {
      const s = fund.msStars ?? 0;
      val.style.color = s > 0 ? 'var(--cg)' : 'var(--cgm)';
      val.style.fontSize = '11pt';
    }

    cell.appendChild(lbl);
    cell.appendChild(val);
    container.appendChild(cell);
  }

  return container;
}

// ── Performance table ─────────────────────────────────────────────────────────

function makePerformanceTable(fund) {
  const cols = [
    { label: '1 Month',    val: fund.perf?.['1mo'] },
    { label: '3 Month',    val: fund.perf?.['3mo'] },
    { label: 'YTD',        val: fund.perf?.['ytd'] },
    { label: '1 Year',     val: fund.perf?.['1yr'] },
    { label: '3 Yr Ann.',  val: fund.perf?.['3yr'] },
    { label: '5 Yr Ann.',  val: fund.perf?.['5yr'] },
    { label: '10 Yr Ann.', val: fund.perf?.['10yr'] },
    { label: 'Since Inc.', val: fund.perf?.['sinceInc'] ?? null },
  ];

  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto;';

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;white-space:nowrap;';

  // Single header row + single value row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of cols) {
    const th = document.createElement('th');
    th.textContent = col.label;
    th.style.cssText = 'background:var(--ch);color:var(--cw);padding:5px 10px;font-size:7.5pt;font-weight:700;border:1px solid var(--cbd);text-align:center;';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const valRow = document.createElement('tr');
  for (const col of cols) {
    const td = document.createElement('td');
    td.style.cssText = `text-align:center;padding:8px 10px;font-size:13pt;font-weight:700;border:1px solid var(--cbd);color:${perfColor(col.val)};`;
    td.textContent = fmtPerfVal(col.val) ?? 'N/A';
    if (col.val == null) {
      td.style.color = 'var(--cgm)';
      td.style.fontSize = '9pt';
      td.style.fontWeight = '400';
    }
    valRow.appendChild(td);
  }
  tbody.appendChild(valRow);
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

// ── Greeks table ──────────────────────────────────────────────────────────────

function makeGreeksTable(fund) {
  const g = fund.greeks;

  const cols = [
    {
      label: 'Alpha',
      val: g?.alpha,
      fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2),
      color: v => v >= 0 ? 'var(--cgd)' : 'var(--crd)',
    },
    {
      label: 'Beta',
      val: g?.beta,
      fmt: v => v.toFixed(2),
      color: () => 'var(--ct)',
    },
    {
      label: 'R-Squared',
      val: g?.r2,
      fmt: v => v.toFixed(1),
      color: () => 'var(--ct)',
    },
    {
      label: 'Std Dev Ann.',
      val: g?.std,
      fmt: v => `${(v * 100).toFixed(1)}%`,
      color: () => 'var(--ct)',
    },
    {
      label: 'Sharpe',
      val: g?.sharpe,
      fmt: v => v.toFixed(2),
      color: v => sharpeColor(v),
    },
    {
      label: 'Sortino',
      val: g?.sortino,
      fmt: v => v.toFixed(2),
      color: v => sharpeColor(v),
    },
    {
      label: 'Up Capture',
      val: g?.upcap,
      fmt: v => `${(v * 100).toFixed(0)}%`,
      color: v => v >= 1 ? 'var(--cgd)' : 'var(--cwn)',
    },
    {
      label: 'Dn Capture',
      val: g?.dncap,
      fmt: v => `${(v * 100).toFixed(0)}%`,
      color: v => v <= 1 ? 'var(--cgd)' : 'var(--crd)',
    },
    {
      label: 'Max Drawdown',
      val: g?.mdd,
      fmt: v => `-${(Math.abs(v) * 100).toFixed(1)}%`,
      color: () => 'var(--crd)',
    },
    {
      label: 'Calmar',
      val: g?.calmar,
      fmt: v => v.toFixed(2),
      color: v => v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)',
    },
  ];

  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto;';

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;white-space:nowrap;';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  for (const col of cols) {
    const th = document.createElement('th');
    th.textContent = col.label;
    th.style.cssText = 'background:var(--ch);color:var(--cgm);padding:4px 8px;font-size:7.5pt;font-weight:700;border:1px solid var(--cbd);text-align:center;';
    hRow.appendChild(th);
  }
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const vRow = document.createElement('tr');
  for (const col of cols) {
    const td = document.createElement('td');
    td.style.cssText = 'text-align:center;padding:6px 8px;font-size:10pt;font-weight:700;border:1px solid var(--cbd);';
    if (col.val == null) {
      td.textContent = '—';
      td.style.color = 'var(--cgm)';
      td.style.fontWeight = '400';
    } else {
      td.textContent = col.fmt(col.val);
      td.style.color = col.color(col.val);
    }
    vRow.appendChild(td);
  }
  tbody.appendChild(vRow);
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

// ── Holdings mini-table ───────────────────────────────────────────────────────

function makeHoldingsTable(fund) {
  const wrap = document.createElement('div');

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;font-size:8.5pt;';

  if (!fund.holdings || fund.holdings.length === 0) {
    const p = el('p', null, 'No holdings data.');
    p.style.cssText = 'color:var(--cgm);padding:8px 10px;font-size:8pt;';
    wrap.appendChild(p);
    return wrap;
  }

  const tbody = document.createElement('tbody');
  fund.holdings.forEach(([symbol, pct], i) => {
    const tr = document.createElement('tr');
    const rank = i + 1;
    const isTop3 = rank <= 3;

    // # col
    const tdNum = document.createElement('td');
    tdNum.textContent = rank;
    tdNum.style.cssText = 'padding:3px 6px;border:1px solid var(--cbd);color:var(--cgm);width:24px;text-align:center;font-size:7.5pt;';

    // Symbol col
    const tdSym = document.createElement('td');
    tdSym.textContent = symbol;
    tdSym.style.cssText = `padding:3px 8px;border:1px solid var(--cbd);font-weight:${isTop3 ? '700' : '400'};color:${isTop3 ? 'var(--cb)' : 'var(--ct)'};`;

    // Weight col
    const tdPct = document.createElement('td');
    tdPct.textContent = `${Number(pct).toFixed(2)}%`;
    tdPct.style.cssText = 'padding:3px 8px;border:1px solid var(--cbd);text-align:right;';

    tr.appendChild(tdNum);
    tr.appendChild(tdSym);
    tr.appendChild(tdPct);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ── Sectors mini-table ────────────────────────────────────────────────────────

function makeSectorsTable(fund) {
  const wrap = document.createElement('div');

  if (!fund.sectors || fund.sectors.length === 0) {
    const p = el('p', null, 'No sector data.');
    p.style.cssText = 'color:var(--cgm);padding:8px 10px;font-size:8pt;';
    wrap.appendChild(p);
    return wrap;
  }

  const maxPct = Math.max(...fund.sectors.map(([, pct]) => pct));

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;font-size:8.5pt;';

  const tbody = document.createElement('tbody');
  for (const [name, pct] of fund.sectors) {
    const tr = document.createElement('tr');

    // Sector name
    const tdName = document.createElement('td');
    tdName.textContent = name;
    tdName.style.cssText = 'padding:3px 8px;border:1px solid var(--cbd);color:var(--ct);white-space:nowrap;';

    // Weight + bar
    const tdBar = document.createElement('td');
    tdBar.style.cssText = 'padding:3px 8px;border:1px solid var(--cbd);width:60%;';

    const barWrap = document.createElement('div');
    barWrap.className = 'sector-bar-wrap';

    const barEl = document.createElement('span');
    barEl.className = 'sector-bar';
    const barWidth = Math.min(100, maxPct > 0 ? (pct / maxPct) * 100 : 0);
    barEl.style.width = `${barWidth.toFixed(1)}%`;

    const pctLabel = document.createElement('span');
    pctLabel.textContent = `${Number(pct).toFixed(1)}%`;
    pctLabel.style.cssText = 'font-weight:700;color:var(--cb);white-space:nowrap;';

    barWrap.appendChild(barEl);
    barWrap.appendChild(pctLabel);
    tdBar.appendChild(barWrap);

    tr.appendChild(tdName);
    tr.appendChild(tdBar);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ── Build one fund card ───────────────────────────────────────────────────────

function makeFundCard(fund) {
  const card = el('div', 'fund-card');

  // Banner
  card.appendChild(makeBanner(fund));

  // Body
  const body = el('div', 'fund-card-body');

  // ── FUND IDENTITY ──
  body.appendChild(el('div', 'section-header', 'FUND IDENTITY'));
  body.appendChild(makeIdentityGrid(fund));

  // ── PERFORMANCE HISTORY ──
  body.appendChild(el('div', 'section-header', 'PERFORMANCE HISTORY  (Total Return %)'));
  const perfWrap = document.createElement('div');
  perfWrap.style.cssText = 'padding:0;overflow-x:auto;';
  perfWrap.appendChild(makePerformanceTable(fund));
  body.appendChild(perfWrap);

  // ── RISK & GREEKS ──
  const greeksLabel = `RISK & GREEKS  (vs ${fund.benchName ?? fund.benchTicker ?? 'Benchmark'}, trailing 252 days)`;
  body.appendChild(el('div', 'section-header', greeksLabel));
  const greeksWrap = document.createElement('div');
  greeksWrap.style.cssText = 'padding:0;overflow-x:auto;';
  greeksWrap.appendChild(makeGreeksTable(fund));
  body.appendChild(greeksWrap);

  // ── HOLDINGS + SECTORS GRID ──
  const grid = el('div', 'fund-card-grid');

  // Left: holdings
  const holdCol = document.createElement('div');
  holdCol.style.cssText = 'border-right:1px solid var(--cbd);';
  holdCol.appendChild(el('div', 'section-header', 'TOP 10 HOLDINGS'));
  const holdPad = document.createElement('div');
  holdPad.style.cssText = 'padding:8px;';
  holdPad.appendChild(makeHoldingsTable(fund));
  holdCol.appendChild(holdPad);

  // Right: sectors
  const sectCol = document.createElement('div');
  sectCol.appendChild(el('div', 'section-header', 'SECTOR BREAKDOWN'));
  const sectPad = document.createElement('div');
  sectPad.style.cssText = 'padding:8px;';
  sectPad.appendChild(makeSectorsTable(fund));
  sectCol.appendChild(sectPad);

  grid.appendChild(holdCol);
  grid.appendChild(sectCol);
  body.appendChild(grid);

  card.appendChild(body);
  return card;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderDeepDive(fundData) {
  const pane = document.getElementById('pane-deepdive');
  pane.textContent = ''; // clear

  if (!fundData || fundData.length === 0) {
    const empty = el('div', 'empty-state');
    const icon = el('div', 'empty-icon', '🔍');
    const p = el('p', null, 'Enter tickers above and click Run to load fund data.');
    empty.appendChild(icon);
    empty.appendChild(p);
    pane.appendChild(empty);
    return;
  }

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:24px;';

  for (const fund of fundData) {
    container.appendChild(makeFundCard(fund));
  }

  pane.appendChild(container);
}
