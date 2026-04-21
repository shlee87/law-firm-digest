---
phase: "10"
plan: "02"
subsystem: observability
tags: [data-quality, discriminated-union, low-confidence, cluster-marker, korean-wording, email-footer]
dependency_graph:
  requires: [10-01]
  provides: [DataQualityMarker-union, detectLowConfidence, renderMarkersMarkdown, low-confidence-email-footer]
  affects: [src/pipeline/detectClusters.ts, src/pipeline/detectLowConfidence.ts, src/observability/summary.ts, src/compose/templates.ts, src/compose/digest.ts, src/pipeline/run.ts]
tech_stack:
  added: []
  patterns: [discriminated-union, D-04-thresholds, D-05-korean-wording, D-07-byte-parity, D-15-clean-run-invisible]
key_files:
  created:
    - src/pipeline/detectLowConfidence.ts
    - test/pipeline/detectLowConfidence.test.ts
  modified:
    - src/pipeline/detectClusters.ts
    - src/observability/summary.ts
    - src/compose/templates.ts
    - src/compose/digest.ts
    - src/pipeline/run.ts
    - test/observability/summary.test.ts
    - test/compose/digest.test.ts
decisions:
  - "LOW_CONF_THRESHOLD=0.5, MIN_TOTAL_FLOOR=3 (inclusive — firms with exactly 3 items are checked)"
  - "D-05 Korean wording: cluster='개 항목 demote됨', low-confidence='items 품질 의심 (confidence=low 과반)'"
  - "renderMarkersMarkdown shared between DRY_RUN stdout (main.ts) and GHA step-summary (summary.ts) for D-07 byte-parity"
  - "D-15 clean-run invisible: markers block rendered only when markers.length > 0"
  - "ClusterMarker discriminated with kind='cluster'; LowConfidenceMarker with kind='low-confidence'"
metrics:
  duration: "~3h"
  completed: "2026-04-21"
  tasks_completed: 3
  files_modified: 9
---

# Phase 10 Plan 02: DataQualityMarker Union + Low-Confidence Detector Summary

Extended `ClusterMarker` to a discriminated union (`DataQualityMarker = ClusterMarker | LowConfidenceMarker`), created `detectLowConfidence` pure detector, exported `renderMarkersMarkdown` shared helper, wired low-confidence markers into email footer and GHA step-summary.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ClusterMarker discriminated union + DataQualityMarker + renderMarkersMarkdown | 836a4e8 | src/pipeline/detectClusters.ts, src/observability/summary.ts, test/observability/summary.test.ts |
| 2 | detectLowConfidence detector + marker merge in run.ts | 606548d | src/pipeline/detectLowConfidence.ts, src/pipeline/run.ts, test/pipeline/detectLowConfidence.test.ts |
| 3 | English 'items demoted' JSDoc purge (auto-fix Rule 1) | 63305f7 | src/observability/summary.ts |

## What Was Built

### Discriminated union (`src/pipeline/detectClusters.ts`)

```typescript
export interface ClusterMarker { kind: 'cluster'; firmId: string; firmName: string; count: number; signature: string; }
export interface LowConfidenceMarker { kind: 'low-confidence'; firmId: string; firmName: string; lowCount: number; totalCount: number; }
export type DataQualityMarker = ClusterMarker | LowConfidenceMarker;
```

### Low-confidence detector (`src/pipeline/detectLowConfidence.ts`)

Pure function: skips `r.error` firms, skips `total < 3`, emits `LowConfidenceMarker` when `low/total >= 0.5`.

D-04 thresholds: `LOW_CONF_THRESHOLD = 0.5`, `MIN_TOTAL_FLOOR = 3` (inclusive).

### Shared renderer (`src/observability/summary.ts`)

`renderMarkersMarkdown` exported for D-07 byte-parity between DRY_RUN stdout and GHA step-summary. Returns `''` when `markers.length === 0` (D-15 clean-run invisible).

### Email footer (`src/compose/templates.ts`)

`renderDataQualityFooter` switch on `marker.kind` renders both cluster and low-confidence rows in HTML email.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comment contained old English 'items demoted' phrase**
- **Found during:** Task 1 — acceptance gate `grep -cE "items demoted" src/observability/summary.ts` should be 0
- **Issue:** JSDoc in `renderMarkersMarkdown` quoted the old English string, triggering the acceptance gate
- **Fix:** Rewrote JSDoc to say "Phase 8 used an English form; this is the D-05 Korean replacement" without quoting the old string
- **Files modified:** src/observability/summary.ts
- **Commit:** 63305f7

## Self-Check: PASSED

- `src/pipeline/detectLowConfidence.ts` exists with `detectLowConfidence` export
- `src/pipeline/detectClusters.ts` exports `DataQualityMarker` union type
- `src/observability/summary.ts` exports `renderMarkersMarkdown`
- Commits 836a4e8, 606548d, 63305f7 exist in git log
- 443 tests pass (31 files) after this plan
