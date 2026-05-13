/**
 * risk.js — Renders 3yr/5yr risk metrics, risk score legend, and charts
 * into #pane-risk.
 */

import { riskScoreLabel } from '../calc.js';

// ── Module-level chart instances ──────────────────────────────────────────────

let _sharpeChart = null;
let _stdChart    = null;

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_DESCS = {
  'Low':       'Bottom 10% std dev — lowest volatility in cohort',
  'Below Avg': '10th–30th percentile — below average volatility',
  'Average':   '30th–70th percentile — typical volatility for category',
  'Above Avg': '70th–90th percentile — above average volatility',
  'High':      'Top 10% std dev — highest volatility in cohort',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtPct(v, decimals = 1) {
  return v != null ? (v * 100).toFixed(decimals) + '%' : '—';
}

function fmtNum(v, decimals = 2) {
  return v != null ? v.toFixed(decimals) : '—';
}

function fmtMdd(v) {
  return v != null ? '-' + (Math.abs(v) * 100).toFixed(1) + '%' : '—';
}

function coloredCell(val, colorFn) {
  if (val == null) return el('td', 'muted', '—');
  const td = document.createElement('td');
  td.textContent = typeof colorFn === 'function' ? colorFn(val).text : val;
  const style = typeof colorFn === 'function' ? colorFn(val).style : null;
  if (style) td.setAttribute('style', style);
  return td;
}

// ── Risk Metric Table ─────────────────────────────────────────────────────────

function renderRiskTable(pane, fundData, riskKey, perfKey, stds) {
  const wrap = el('div', 'data-table-wrap');
  const table = el('table', 'data-table');

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  const yr = riskKey === 'risk3yr' ? '3Yr' : '5Yr';
  const headers = [
    'Fund', 'Benchmark',
    `${yr} Return`, `${yr} Std Dev`, `${yr} Sharpe`, `${yr} Sortino`,
    `${yr} Max DD`, `${yr} Beta`, `${yr} Alpha`,
    `${yr} Up Cap`, `${yr} Dn Cap`, 'Risk Score',
  ];
  for (const lbl of headers) hRow.appendChild(el('th', null, lbl));
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const f of fundData) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'ticker-cell', f.ticker));
    tr.appendChild(el('td', null, f.benchName ?? f.benchTicker ?? '—'));

    const risk = f[riskKey];
    const ret  = f.perf?.[perfKey];

    if (!risk) {
      // Return from perf, rest N/A
      const retTd = document.createElement('td');
      if (ret != null) {
        retTd.textContent = (ret >= 0 ? '+' : '') + (ret * 100).toFixed(2) + '%';
        retTd.className = ret >= 0 ? 'pos' : 'neg';
        retTd.style.fontWeight = 'bold';
      } else {
        retTd.textContent = '—';
        retTd.className = 'muted';
      }
      tr.appendChild(retTd);
      for (let i = 0; i < 9; i++) tr.appendChild(el('td', 'muted', '—'));
    } else {
      // Return (from perf)
      const retTd = document.createElement('td');
      if (ret != null) {
        retTd.textContent = (ret >= 0 ? '+' : '') + (ret * 100).toFixed(2) + '%';
        retTd.className = ret >= 0 ? 'pos' : 'neg';
        retTd.style.fontWeight = 'bold';
      } else {
        retTd.textContent = '—';
        retTd.className = 'muted';
      }
      tr.appendChild(retTd);

      // Std Dev
      {
        const td = document.createElement('td');
        td.textContent = risk.std != null ? fmtPct(risk.std) : '—';
        if (risk.std == null) td.className = 'muted';
        tr.appendChild(td);
      }

      // Sharpe
      {
        const v = risk.sharpe;
        const td = document.createElement('td');
        if (v == null) { td.textContent = '—'; td.className = 'muted'; }
        else {
          td.textContent = v.toFixed(2);
          td.style.color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
        }
        tr.appendChild(td);
      }

      // Sortino
      {
        const v = risk.sortino;
        const td = document.createElement('td');
        if (v == null) { td.textContent = '—'; td.className = 'muted'; }
        else {
          td.textContent = v.toFixed(2);
          td.style.color = v >= 1 ? 'var(--cgd)' : v >= 0.5 ? 'var(--cwn)' : 'var(--crd)';
        }
        tr.appendChild(td);
      }

      // Max DD
      {
        const v = risk.mdd;
        const td = document.createElement('td');
        if (v == null) { td.textContent = '—'; td.className = 'muted'; }
        else { td.textContent = fmtMdd(v); td.style.color = 'var(--crd)'; }
        tr.appendChild(td);
      }

      // Beta
      {
        const td = document.createElement('td');
        td.textContent = risk.beta != null ? risk.beta.toFixed(2) : '—';
        if (risk.beta == null) td.className = 'muted';
        tr.appendChild(td);
      }

      // Alpha
      {
        const v = risk.alpha;
        const td = document.createElement('td');
        if (v == null) { td.textContent = '—'; td.className = 'muted'; }
        else {
          td.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
          td.style.color = v >= 0 ? 'var(--cgd)' : 'var(--crd)';
        }
        tr.appendChild(td);
      }

      // Up Cap
      {
        const v = risk.upcap;
        const td = document.createElement('td');
        if (v == null) { td.textContent = '—'; td.className = 'muted'; }
        else {
          td.textContent = (v * 100).toFixed(0) + '%';
          td.style.color = v >= 1 ? 'var(--cgd)' : 'var(--cwn)';
        }
        tr.appendChild(td);
      }

      // Dn Cap
      {
        const v = risk.dncap;
        const td = document.createElement('td');
        if (v == null) { td.textContent = '—'; td.className = 'muted'; }
        else {
          td.textContent = (v * 100).toFixed(0) + '%';
          td.style.color = v <= 1 ? 'var(--cgd)' : 'var(--crd)';
        }
        tr.appendChild(td);
      }

      // Risk Score badge
      {
        const label = riskScoreLabel(risk.std, stds);
        const badgeCls = `risk-badge risk-${label.replace(' ', '-')}`;
        const span = el('span', badgeCls, label);
        const td = document.createElement('td');
        td.appendChild(span);
        tr.appendChild(td);
      }
    }

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  pane.appendChild(wrap);
}

// ── Section 3: Risk Score Legend ─────────────────────────────────────────────

function renderLegend(pane) {
  pane.appendChild(el('div', 'section-header', 'RISK SCORE LEGEND'));

  for (const [label, desc] of Object.entries(RISK_DESCS)) {
    const row = el('div', 'legend-row');
    const badgeCls = `risk-badge risk-${label.replace(' ', '-')}`;
    row.appendChild(el('span', badgeCls, label));
    row.appendChild(el('span', null, ' — ' + desc));
    pane.appendChild(row);
  }
}

// ── Section 4: Charts ─────────────────────────────────────────────────────────

function renderCharts(pane, fundData) {
  const labels = fundData.map(f => f.ticker);

  // ── Clustered bar: 3yr vs 5yr Sharpe ──────────────────────────────────────
  {
    const chartWrap = el('div', 'chart-wrap');
    chartWrap.appendChild(el('div', 'chart-title', '3-Year vs 5-Year Sharpe Ratio'));
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-risk-sharpe';
    canvas.style.height = '280px';
    chartWrap.appendChild(canvas);
    pane.appendChild(chartWrap);

    if (_sharpeChart) { _sharpeChart.destroy(); _sharpeChart = null; }

    _sharpeChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '3yr Sharpe',
            data: fundData.map(f => f.risk3yr?.sharpe ?? null),
            backgroundColor: '#2E7D32',
          },
          {
            label: '5yr Sharpe',
            data: fundData.map(f => f.risk5yr?.sharpe ?? null),
            backgroundColor: '#1565C0',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : '—'}`,
            },
          },
        },
        scales: {
          y: {
            grid: {
              color: ctx => ctx.tick.value === 0 ? '#333' : '#e0e0e0',
              lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1,
            },
          },
        },
      },
    });
  }

  // ── Horizontal bar: 3yr vs 5yr Std Dev ────────────────────────────────────
  {
    const chartWrap = el('div', 'chart-wrap');
    chartWrap.appendChild(el('div', 'chart-title', '3-Year vs 5-Year Std Dev (Annualized)'));
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-risk-std';
    canvas.style.height = '280px';
    chartWrap.appendChild(canvas);
    pane.appendChild(chartWrap);

    if (_stdChart) { _stdChart.destroy(); _stdChart = null; }

    _stdChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '3yr Std Dev',
            data: fundData.map(f => f.risk3yr?.std != null ? parseFloat((f.risk3yr.std * 100).toFixed(2)) : null),
            backgroundColor: '#C62828',
          },
          {
            label: '5yr Std Dev',
            data: fundData.map(f => f.risk5yr?.std != null ? parseFloat((f.risk5yr.std * 100).toFixed(2)) : null),
            backgroundColor: '#F57F17',
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x != null ? ctx.parsed.x.toFixed(2) + '%' : '—'}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { callback: v => v + '%' },
          },
        },
      },
    });
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderRisk(fundData) {
  const pane = document.getElementById('pane-risk');
  pane.textContent = '';

  if (!fundData || fundData.length === 0) {
    pane.appendChild(el('p', 'muted', 'No fund data loaded.'));
    return;
  }

  // Compute cohort std arrays for risk scoring
  const stds3 = fundData.map(f => f.risk3yr?.std).filter(v => v != null);
  const stds5 = fundData.map(f => f.risk5yr?.std).filter(v => v != null);

  pane.appendChild(el('div', 'section-banner',
    'RISK ANALYSIS — Morningstar-Style 3-Year & 5-Year Risk Profile'));

  pane.appendChild(el('div', 'section-header',
    '3-YEAR RISK METRICS (rolling 756 trading days vs fund\'s own benchmark)'));
  renderRiskTable(pane, fundData, 'risk3yr', '3yr', stds3);

  pane.appendChild(el('div', 'section-header',
    '5-YEAR RISK METRICS (rolling 1260 trading days vs fund\'s own benchmark)'));
  renderRiskTable(pane, fundData, 'risk5yr', '5yr', stds5);

  renderLegend(pane);
  renderCharts(pane, fundData);
}
