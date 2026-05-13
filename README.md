# Fund & ETF Screener

Live fund analysis at **[funds.cymbal.ski](https://funds.cymbal.ski)**

A web translation of `original/refresh_funds.py` + `Fund_ETF_Screener.xlsx`. Enter tickers, click Run Analysis, and get the same metrics the Python script computed — in your browser, live.

## What It Does

- **Dashboard** — side-by-side comparison: expense ratio, AUM, performance (1mo–10yr), Morningstar stars, and full Greeks
- **Deep Dive** — per-fund card with identity, performance history, risk/Greeks, top 10 holdings, sector breakdown
- **Overlap & Sectors** — holdings overlap heatmap + shared holdings + aggregate sector pie chart
- **Performance** — color-scale comparison table + 1yr return bar chart + Greeks comparison
- **Risk Analysis** — Morningstar-style 3yr/5yr rolling risk metrics, risk score (Low/Below Avg/Average/Above Avg/High), Sharpe and Std Dev charts

## How to Use

1. Open **[funds.cymbal.ski](https://funds.cymbal.ski)**
2. Enter tickers in the input box (space or comma-separated): `VOO FXAIX BND`
3. Click **▶ Run Analysis**
4. Browse tabs; click **⬇ Export XLSX** to download an Excel workbook

Tickers are saved in your browser — the input pre-fills on reload.

## Greeks Explained

| Metric | Meaning |
|---|---|
| **Alpha** | Annualized excess return vs the fund's own benchmark |
| **Beta** | Market sensitivity. 1.0 = moves with benchmark exactly |
| **R²** | % of fund movement explained by benchmark. 100 = pure tracker |
| **Std Dev** | Annualized volatility of daily returns |
| **Sharpe** | Return per unit of total risk. >1.0 good, >2.0 excellent |
| **Sortino** | Like Sharpe but only penalizes downside volatility |
| **Max DD** | Worst peak-to-trough loss |
| **Up Capture** | % of benchmark upside captured. >100% = beat on good days |
| **Dn Capture** | % of benchmark downside suffered. <100% = held up better on bad days |
| **Calmar** | Annualized return / Max Drawdown. Higher = better risk-adjusted growth |

## Risk-Free Rate

`RF_RATE = 0.053` (5.3%) in `src/js/calc.js:8` — update annually to the current 3-month T-bill yield.

## Data Source

Yahoo Finance via the `allorigins.win` CORS proxy. If data loads slowly or fails:
- Yahoo Finance occasionally rate-limits requests
- Try again after a minute
- For production reliability, replace `allorigins.win` with a Cloudflare Worker (see below)

## Upgrade: Cloudflare Worker Proxy

For faster, own-controlled data fetching (30-line Worker, free tier):

1. Create a Cloudflare account
2. Create a Worker at `proxy.funds.cymbal.ski`
3. Deploy `src/worker/proxy.js` (template in that file)
4. In `src/js/api.js`, change: `const PROXY = 'https://api.allorigins.win/raw?url=';`
   to: `const PROXY = 'https://proxy.funds.cymbal.ski/?url=';`

## Running Tests

```bash
node --test tests/calc.test.js tests/benchmark.test.js
# or
npm test
```

Requires Node 18+. No install needed.

## Deploying

GitHub Pages serves the `/src` directory automatically on push to `main`.

**First-time setup:**
1. Settings → Pages → Source: branch `main`, folder `/src`
2. Settings → Pages → Custom domain: `funds.cymbal.ski`
3. DNS: add CNAME record `funds.cymbal.ski → <username>.github.io`

The `src/CNAME` file is already committed.

## Project Structure

```
src/
  index.html          Single-page app
  CNAME               funds.cymbal.ski
  css/app.css         Styles (color palette from original Excel)
  js/
    main.js           Orchestration: fetch → compute → render
    api.js            Yahoo Finance fetch functions
    calc.js           All math: performance, Greeks, risk scoring
    benchmark.js      Category→benchmark mapping
    export.js         XLSX export (xlsx-js-style)
    ui/
      dashboard.js    Dashboard tab
      deepdive.js     Deep Dive tab
      overlap.js      Overlap & Sectors tab
      performance.js  Performance tab
      risk.js         Risk Analysis tab
tests/
  calc.test.js        Math unit tests
  benchmark.test.js   Benchmark detection tests
original/
  refresh_funds.py    Original Python script (reference)
  Fund_ETF_Screener.xlsx  Original Excel workbook (reference)
```
