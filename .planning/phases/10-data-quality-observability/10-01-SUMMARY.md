---
phase: "10"
plan: "01"
subsystem: observability
tags: [recorder, metrics, markdown-table, body-length, guard-count, confidence]
dependency_graph:
  requires: []
  provides: [FirmMetrics-9-col, bodyLengths-write-site, guardCount-write-site, confidence-write-site]
  affects: [src/observability/recorder.ts, src/pipeline/run.ts]
tech_stack:
  added: []
  patterns: [REPLACE-NOT-ACCUMULATE, PER-FIRM-ISOLATION, DISABLED-FIRM-FILTER, DETERMINISTIC-OUTPUT-ORDER]
key_files:
  created: []
  modified:
    - src/observability/recorder.ts
    - src/pipeline/run.ts
    - test/observability/recorder.test.ts
    - test/pipeline/run.test.ts
decisions:
  - "isEmptyFirm gate: fetched===0 AND bodyLengths.length===0 → AvgBody/GUARD/H-M-L all render as em-dash"
  - "AvgBody column is integer math (Math.round), not float"
  - "Recorder write-sites placed post-enrichBody and post-cluster-detect in run.ts"
metrics:
  duration: "~2h"
  completed: "2026-04-21"
  tasks_completed: 2
  files_modified: 4
---

# Phase 10 Plan 01: Recorder Extension + Pipeline Write-Sites Summary

Widened `FirmMetrics` to 9 columns (bodyLengths, guardCount, confidenceH/M/L), added three fluent methods (`bodyLengths`, `guardCount`, `confidence`), extended `toMarkdownTable` to emit the DQOBS-01 9-column header, and wired the three new write-sites in `run.ts`.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Recorder 9-col + fluent methods | ce55643 | src/observability/recorder.ts, test/observability/recorder.test.ts |
| 2 | Pipeline write-sites in run.ts | 112e03f | src/pipeline/run.ts, test/pipeline/run.test.ts |

## What Was Built

### Recorder widening (`src/observability/recorder.ts`)

`FirmMetrics` gained 4 new fields: `bodyLengths: number[]`, `guardCount: number`, `confidenceH: number`, `confidenceM: number`, `confidenceL: number`.

Three new fluent methods on `FirmRecorder`: `.bodyLengths(lengths)`, `.guardCount(n)`, `.confidence(h, m, l)`.

`toMarkdownTable` now emits a 9-column table:

```
| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |
|------|--------:|----:|-----:|--------|---------:|--------:|------:|------:|
```

`isEmptyFirm` gate: firms with `fetched===0 AND bodyLengths.length===0` render `—` in AvgBody/GUARD/H-M-L columns.

### Pipeline write-sites (`src/pipeline/run.ts`)

- **Site 1** (post-enrichBody): `recorder.firm(id).bodyLengths(r.raw.map(item => (item.description ?? '').length))`
- **Site 2** (post-cluster-detect): Layer1+Layer2+Layer3 guardCount tally, H/M/L confidence distribution, `recorder.firm(id).guardCount(n).confidence(h,m,l)`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/observability/recorder.ts` exists and exports 9-col toMarkdownTable
- `src/pipeline/run.ts` has three DQOBS-01 write-sites
- Commits ce55643 and 112e03f exist in git log
