# XLSX Export Gap Fix — Design Spec

**Date:** 2026-05-12

## Problem

`docs/js/export.js` Dashboard sheet and Performance sheet are missing columns present in the UI (`docs/js/ui/dashboard.js`).

## Gaps

| Gap | Location | Fix |
|-----|----------|-----|
| Since Inc missing | Dashboard sheet | Add col 16 after 10yr |
| Analyst missing | Dashboard sheet | Add col 17 after Since Inc |
| Cat Rank missing | Dashboard sheet | Add col 18 after Analyst (value: `'—'`) |
| Since Inc hardcoded `'—'` | Performance sheet | Read `f.perf?.['since']` |

## Changes

### `docs/js/export.js` — `buildDashboard`

Headers array: insert `'Since Inc'`, `'Analyst'`, `'Cat Rank'` after `'10yr'` (before `'MS Stars'`).

Data rows: insert corresponding values at same positions:
- Since Inc: `fmtPerfVal(f.perf?.['since'])`
- Analyst: `f.msAnalyst ?? '—'`
- Cat Rank: `'—'`

Column widths: add 3 entries (`{ wch: 9 }`, `{ wch: 10 }`, `{ wch: 10 }`) at the matching positions.

`PERF_COLS`: extend from `[9,10,11,12,13,14,15]` to `[9,10,11,12,13,14,15,16]`.

Perf key map in styling loop: add `'since'` at index 7 (offset from col 9).

### `docs/js/export.js` — `buildPerformance`

Since Inc row value: change `'—'` → `fmtPerfVal(f.perf?.['since'])`.

## Scope

Single file: `docs/js/export.js`. No other files touched.
