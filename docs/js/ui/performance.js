/**
 * performance.js — Renders performance comparison, bar chart, and greeks table
 * into #pane-performance.
 */

// ── Module-level chart instances ──────────────────────────────────────────────

let _barChart = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtPerf(v) {
  if (v == null) return null;
  const pct = v * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

/**
 * Interpolate between two hex colors by t ∈ [0, 1].
 */
function lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r  = Math.round(r1 + (r2 - r1) * t);
  const g  = Math.round(g1 + (g2 - g1) * t);
  const b  = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Compute a background color for a value within a column's [min, max] range.
 * Red (#FFCDD2) at min, white (#FFFFFF) at median, green (#C8E6C9) at max.
 */
function columnBgColor(val, min, max) {
  if (min === max) return '#FFFFFF';
  const mid = (min + max) / 2;
  if (val <= mid) {
    const t = (val - min) / (mid - min);
    return lerpColor('#FFCDD2', '#FFFFFF', t);
  } else {
    const t = (val - mid) / (max - mid);
    return lerpColor('#FFFFFF', '#C8E6C9', t);
  }
}

// ── Section 1: Performance Comparison Table ───────────────────────────────────

const PERF_PERIODS = [
  { label: '1 Month',    key: '1mo' },
  { label: '3 Month',    key: '3mo' },
  { label: 'YTD',        key: 'ytd' },
  { label: '1 Year',     key: '1yr' },
  { label: '3 Yr Ann.',  key: '3yr' },
  { label: '5 Yr Ann.',  key: '5yr' },
  { label: '10 Yr Ann.', key: '10yr' },
];

function renderPerfTable(pane, fundData) {
  pane.appendChild(el('div', 'section-banner',
    'PERFORMANCE COMPARISON — All Funds Side-by-Side'));

  // Pre-compute per-column min/max for color scaling
  const colStats = PERF_PERIODS.map(({ key }) => {
    const vals = fundData.map(f => f.perf?.[key]).filter(v => v != null);
    if (vals.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });

  const wrap = el('div', 'data-table-wrap');
  const table = el('table', 'data-table');

  // Header
  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  hRow.appendChild(el('th', null, 'Fund'));
  for (const { label } of PERF_PERIODS) hRow.appendChild(el('th', null, label));
  hRow.appendChild(el('th', null, 'Since Inc.'));
  thead.appendChild(hRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const f of fundData) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'ticker-cell', f.ticker));

    PERF_PERIODS.forEach(({ key }, ci) => {
      const v = f.perf?.[key];
      const td = document.createElement('td');
      const txt = fmtPerf(v);
      if (txt == null) {
        td.textContent = '—';
        td.className = 'muted';
      } else {
        td.textContent = txt;
        td.className = v >= 0 ? 'pos' : 'neg';
        td.style.fontWeight = 'bold';
        const { min, max } = colStats[ci];
        td.style.backgroundColor = columnBgColor(v, min, max);
      }
      tr.appendChild(td);
    });

    // Since Inc. — always N/A
    tr.appendChild(el('td', 'muted', '—'));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  pane.appendChild(wrap);
}

// ── Section 2: 1-Year Return Bar Chart ───────────────────────────────────────

function renderBarChart(pane, fundData) {
  const chartWrap = el('div', 'chart-wrap');
  chartWrap.appendChild(el('div', 'chart-title', '1-Year Return Comparison'));
  const canvas = document.createElement('canvas');
  canvas.id = 'chart-perf-bar';
  canvas.style.height = '280px';
  chartWrap.appendChild(canvas);
  pane.appendChild(chartWrap);

  if (_barChart) {
    _barChart.destroy();
    _barChart = null;
  }

  const labels = fundData.map(f => f.ticker);
  const values = fundData.map(f => {
    const v = f.perf?.['1yr'];
    return v != null ? parseFloat((v * 100).toFixed(4)) : null;
  });
  const colors = values.map(v => v == null ? '#9E9E9E' : v >= 0 ? '#1B5E20' : '#B71C1C');

  _barChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '1-Year Return',
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return '—';
              return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
            },
          },
        },
      },
      scales: {
        y: {
          grid: {
            color: ctx => ctx.tick.value === 0 ? '#333' : '#e0e0e0',
            lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1,
          },
          ticks: {
            callback: v => v + '%',
          },
        },
      },
    },
  });
}

// ── Section 3: Greeks Comparison Table ───────────────────────────────────────

function renderGreeksTable(pane, fundData) {
  pane.appendChild(el('div', 'section-header',
    'GREEKS (vs each fund\'s own benchmark, trailing ~252 days)'));

  const wrap = el('div', 'data-table-wrap');
  const table = el('table', 'data-table');

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  for (const lbl of ['Fund', 'Alpha', 'Beta', 'R²', 'Std Dev', 'Sharpe', 'Sortino', 'Max DD', 'Calmar']) {
    hRow.appendChild(el('th', null, lbl));
  }
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const f of fundData) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'ticker-cell', f.ticker));

    const g = f.greeks;
    if (!g) {
      for (let i = 0; i < 8; i++) tr.appendChild(el('td', 'muted', '—'));
    } else {
      // Alpha
      tr.appendChild(greekCell(g.alpha, v => {
        const td = document.createElement('td');
        td.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        td.style.color = v >= 0 ? 'var(--cgd)' : 'var(--crd)';
        return td;
      }));
      // Beta
      tr.appendChild(greekCell(g.beta, v => simpleCell(v.toFixed(2))));
      // R²
      tr.appendChild(greekCell(g.r2, v => simpleCell(v.toFixed(1))));
      // Std Dev
      tr.appendChild(greekCell(g.std, v => simpleCell((v * 100).toFixed(1) + '%')));
      // Sharpe
      tr.appendChild(greekCell(g.sharpe, v => {
        const td = document.createElement('td');
        td.textContent = v.toFixed(2);
        td.style.color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
        return td;
      }));
      // Sortino
      tr.appendChild(greekCell(g.sortino, v => {
        const td = document.createElement('td');
        td.textContent = v.toFixed(2);
        td.style.color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
        return td;
      }));
      // Max DD
      tr.appendChild(greekCell(g.mdd, v => {
        const td = document.createElement('td');
        td.textContent = '-' + (Math.abs(v) * 100).toFixed(1) + '%';
        td.style.color = 'var(--crd)';
        return td;
      }));
      // Calmar
      tr.appendChild(greekCell(g.calmar, v => {
        const td = document.createElement('td');
        td.textContent = v.toFixed(2);
        td.style.color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
        return td;
      }));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  pane.appendChild(wrap);
}

function greekCell(val, renderFn) {
  if (val == null) return el('td', 'muted', '—');
  return renderFn(val);
}

function simpleCell(text) {
  return el('td', null, text);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderPerformance(fundData) {
  const pane = document.getElementById('pane-performance');
  pane.textContent = '';

  if (!fundData || fundData.length === 0) {
    pane.appendChild(el('p', 'muted', 'No fund data loaded.'));
    return;
  }

  renderPerfTable(pane, fundData);
  renderBarChart(pane, fundData);
  renderGreeksTable(pane, fundData);
}
