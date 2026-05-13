/**
 * dashboard.js — Renders the master fund comparison table into #pane-dashboard.
 */

const STARS = { 1: '★☆☆☆☆', 2: '★★☆☆☆', 3: '★★★☆☆', 4: '★★★★☆', 5: '★★★★★' };

// Column definitions: [label, getValue, formatFn, classNameFn]
// getValue(fund) → raw value for sort
// formatFn(fund) → { text, className } for cell render

const COLS = [
  {
    label: 'Ticker',
    key: 'ticker',
    getValue: f => f.ticker,
    render: f => ({ text: f.ticker, cls: 'ticker-cell' }),
  },
  {
    label: 'Name',
    key: 'name',
    getValue: f => f.name,
    render: f => ({ text: f.name, cls: 'left' }),
  },
  {
    label: 'Category',
    key: 'category',
    getValue: f => f.category,
    render: f => ({ text: f.category, cls: 'left', style: 'color:var(--cb)' }),
  },
  {
    label: 'Manager',
    key: 'manager',
    getValue: f => f.manager,
    render: f => ({ text: f.manager, cls: 'left', style: 'color:var(--cgm)' }),
  },
  {
    label: 'Benchmark',
    key: 'benchName',
    getValue: f => f.benchName,
    render: f => ({ text: f.benchName, cls: 'left', style: 'color:var(--cb);font-size:8pt' }),
  },
  {
    label: 'Exp Ratio',
    key: 'expRatio',
    getValue: f => f.expRatio ?? 0,
    render: f => ({ text: fmtPct3(f.expRatio) }),
  },
  {
    label: 'Turnover',
    key: 'turnover',
    getValue: f => f.turnover ?? -Infinity,
    render: f => ({ text: f.turnover == null ? '—' : fmtPct1(f.turnover) }),
  },
  {
    label: 'AUM',
    key: 'aum',
    getValue: f => f.aum ?? 0,
    render: f => ({ text: f.aum ? `$${f.aum.toFixed(1)}B` : '—' }),
  },
  {
    label: 'Price',
    key: 'price',
    getValue: f => f.price ?? -Infinity,
    render: f => ({
      text: f.price != null ? `$${f.price.toFixed(2)}` : '—',
      cls: f.price != null ? 'bold' : 'muted',
      style: f.price != null ? 'color:var(--cb)' : '',
    }),
  },
  {
    label: '1mo',
    key: 'perf_1mo',
    getValue: f => f.perf?.['1mo'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['1mo']),
  },
  {
    label: '3mo',
    key: 'perf_3mo',
    getValue: f => f.perf?.['3mo'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['3mo']),
  },
  {
    label: 'YTD',
    key: 'perf_ytd',
    getValue: f => f.perf?.['ytd'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['ytd']),
  },
  {
    label: '1yr',
    key: 'perf_1yr',
    getValue: f => f.perf?.['1yr'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['1yr']),
  },
  {
    label: '3yr',
    key: 'perf_3yr',
    getValue: f => f.perf?.['3yr'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['3yr']),
  },
  {
    label: '5yr',
    key: 'perf_5yr',
    getValue: f => f.perf?.['5yr'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['5yr']),
  },
  {
    label: '10yr',
    key: 'perf_10yr',
    getValue: f => f.perf?.['10yr'] ?? -Infinity,
    render: f => renderPerf(f.perf?.['10yr']),
  },
  {
    label: '⭐',
    key: 'msStars',
    getValue: f => f.msStars ?? 0,
    render: f => {
      const s = f.msStars ?? 0;
      return { text: STARS[s] ?? '—', cls: s > 0 ? 'ms-stars center' : 'ms-stars none center' };
    },
  },
  {
    label: '# Hldgs',
    key: 'numHoldings',
    getValue: f => f.numHoldings ?? -Infinity,
    render: f => ({
      text: f.numHoldings != null ? String(f.numHoldings) : '—',
      cls: f.numHoldings != null ? 'center' : 'muted center',
    }),
  },
  {
    label: 'Alpha',
    key: 'alpha',
    getValue: f => f.greeks?.alpha ?? -Infinity,
    render: f => {
      const v = f.greeks?.alpha;
      if (v == null) return { text: '—', cls: 'muted' };
      return {
        text: (v >= 0 ? '+' : '') + v.toFixed(2),
        style: `color:${v >= 0 ? 'var(--cgd)' : 'var(--crd)'}`,
      };
    },
  },
  {
    label: 'Beta',
    key: 'beta',
    getValue: f => f.greeks?.beta ?? -Infinity,
    render: f => {
      const v = f.greeks?.beta;
      return v != null ? { text: v.toFixed(2) } : { text: '—', cls: 'muted' };
    },
  },
  {
    label: 'R²',
    key: 'r2',
    getValue: f => f.greeks?.r2 ?? -Infinity,
    render: f => {
      const v = f.greeks?.r2;
      return v != null ? { text: v.toFixed(1) } : { text: '—', cls: 'muted' };
    },
  },
  {
    label: 'Std Dev',
    key: 'std',
    getValue: f => f.greeks?.std ?? -Infinity,
    render: f => {
      const v = f.greeks?.std;
      return v != null ? { text: fmtPct1(v) } : { text: '—', cls: 'muted' };
    },
  },
  {
    label: 'Sharpe',
    key: 'sharpe',
    getValue: f => f.greeks?.sharpe ?? -Infinity,
    render: f => {
      const v = f.greeks?.sharpe;
      if (v == null) return { text: '—', cls: 'muted' };
      const color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
      return { text: v.toFixed(2), style: `color:${color}` };
    },
  },
  {
    label: 'Sortino',
    key: 'sortino',
    getValue: f => f.greeks?.sortino ?? -Infinity,
    render: f => {
      const v = f.greeks?.sortino;
      if (v == null) return { text: '—', cls: 'muted' };
      const color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
      return { text: v.toFixed(2), style: `color:${color}` };
    },
  },
  {
    label: 'Max DD',
    key: 'mdd',
    getValue: f => f.greeks?.mdd ?? Infinity,
    render: f => {
      const v = f.greeks?.mdd;
      if (v == null) return { text: '—', cls: 'muted' };
      return { text: `-${(Math.abs(v) * 100).toFixed(1)}%`, style: 'color:var(--crd)' };
    },
  },
  {
    label: 'Up Cap',
    key: 'upcap',
    getValue: f => f.greeks?.upcap ?? -Infinity,
    render: f => {
      const v = f.greeks?.upcap;
      if (v == null) return { text: '—', cls: 'muted' };
      const color = v >= 1 ? 'var(--cgd)' : 'var(--cwn)';
      return { text: `${(v * 100).toFixed(0)}%`, style: `color:${color}` };
    },
  },
  {
    label: 'Dn Cap',
    key: 'dncap',
    getValue: f => f.greeks?.dncap ?? -Infinity,
    render: f => {
      const v = f.greeks?.dncap;
      if (v == null) return { text: '—', cls: 'muted' };
      const color = v <= 1 ? 'var(--cgd)' : 'var(--crd)';
      return { text: `${(v * 100).toFixed(0)}%`, style: `color:${color}` };
    },
  },
];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct1(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtPct3(v) {
  return `${(v * 100).toFixed(3)}%`;
}

function renderPerf(v) {
  if (v == null) return { text: 'N/A', cls: 'muted' };
  const pct = v * 100;
  return {
    text: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
    cls: pct >= 0 ? 'pos' : 'neg',
  };
}

// ── Build cell ────────────────────────────────────────────────────────────────

function makeTd({ text, cls, style }) {
  const td = document.createElement('td');
  td.textContent = text;
  if (cls) {
    // ticker-cell must stand alone (CSS uses !important on bg)
    cls.split(' ').forEach(c => c && td.classList.add(c));
  }
  if (style) td.setAttribute('style', style);
  return td;
}

// ── Sort state ────────────────────────────────────────────────────────────────

function buildRow(fund) {
  const tr = document.createElement('tr');
  for (const col of COLS) {
    tr.appendChild(makeTd(col.render(fund)));
  }
  return tr;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderDashboard(fundData) {
  const pane = document.getElementById('pane-dashboard');
  pane.textContent = ''; // clear

  if (!fundData || fundData.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.textContent = '📊';
    const p = document.createElement('p');
    p.textContent = 'Enter tickers above and click Run to load fund data.';
    empty.appendChild(icon);
    empty.appendChild(p);
    pane.appendChild(empty);
    return;
  }

  // Sort state
  let sortCol = null;   // index into COLS
  let sortDir = 1;      // 1 = asc, -1 = desc

  // Build wrap + table structure
  const wrap = document.createElement('div');
  wrap.className = 'data-table-wrap';

  const table = document.createElement('table');
  table.className = 'data-table';

  // thead
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const ths = COLS.map((col, i) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    th.addEventListener('click', () => {
      if (sortCol === i) {
        sortDir *= -1;
      } else {
        sortCol = i;
        sortDir = 1;
      }
      // Update th classes
      ths.forEach((t, j) => {
        t.classList.remove('sort-asc', 'sort-desc');
        if (j === sortCol) t.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      });
      rebuildBody();
    });
    return th;
  });

  ths.forEach(th => headerRow.appendChild(th));
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  function rebuildBody() {
    // Sort a copy of fundData
    const sorted = fundData.slice().sort((a, b) => {
      if (sortCol === null) return 0;
      const col = COLS[sortCol];
      const av = col.getValue(a);
      const bv = col.getValue(b);
      if (av === bv) return 0;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir * av.localeCompare(bv);
      }
      return sortDir * (av < bv ? -1 : 1);
    });

    tbody.textContent = '';
    for (const fund of sorted) {
      tbody.appendChild(buildRow(fund));
    }
  }

  rebuildBody();

  wrap.appendChild(table);
  pane.appendChild(wrap);
}
