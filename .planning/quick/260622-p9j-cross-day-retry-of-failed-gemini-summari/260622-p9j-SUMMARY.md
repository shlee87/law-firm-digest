---
phase: quick-260622-p9j
plan: 01
subsystem: state/pipeline
tags: [retry, gemini, pending, daily, cross-day]
dependency_graph:
  requires: [src/state/pending.ts, src/pipeline/runDaily.ts, src/summarize/gemini.ts]
  provides: [cross-day Gemini retry for failed PendingItems]
  affects: [src/pipeline/runDaily.ts, src/state/pending.ts]
tech_stack:
  added: []
  patterns:
    - retry pre-pass before Step 9 summarize in runDaily
    - pairsMap to thread inputBody without touching FirmResult/types.ts
    - COMP-05 exception: summaryBody stored only on failed items, deleted on retry success
key_files:
  created:
    - test/pipeline/retryFailedSummaries.test.ts
  modified:
    - src/state/pending.ts
    - src/pipeline/runDaily.ts
    - test/state/pending.test.ts
decisions:
  - pairsMap approach chosen over FirmResult widening to keep types.ts + runWeekly untouched
  - CAP=3 total attempts (not retries) — z.number().int().positive() rejects 0 at parse time (T-p9j-03)
  - summaryBody stored at toPendingItem call (not at summarize call) — preserves COMP-05 single-write-path principle
metrics:
  duration: ~8 minutes
  completed: 2026-06-22
  tasks_completed: 2
  files_modified: 3
  files_created: 1
---

# Phase quick-260622-p9j Plan 01: Cross-Day Gemini Retry Summary

**One-liner:** Cross-day retry of failed Gemini summaries using stored summaryBody, capped at 3 attempts, with pairsMap threading inputBody through runDaily without widening FirmResult type.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extend PendingItemSchema + add updatePending | 6ed76c4 | src/state/pending.ts, test/state/pending.test.ts |
| 2 | Retry pre-pass in runDaily + tests | d4cd37a | src/pipeline/runDaily.ts, test/pipeline/retryFailedSummaries.test.ts |

## What Was Built

**Task 1 — PendingItemSchema + updatePending:**
- Added `summaryBody?: string` and `summaryAttempts?: number` optional fields to `PendingItemSchema` (before `.strict()`). `z.number().int().positive()` rejects 0 per T-p9j-03 threat mitigation.
- Exported `updatePending(items, path?)` — reads current pending, replaces items array, preserves `windowStart` (D-09), routes through `writePendingInternal` (OPS-06 DRY_RUN gate inherited).
- Extended `toPendingItem` with optional third arg `body?: string`. Sets `summaryBody` + `summaryAttempts: 1` only when `summaryModel === 'failed'` AND body is non-empty (COMP-05 exception clearly documented).
- 2 new tests: backward-compat parse (no new fields in file → undefined), updatePending replaces items + preserves windowStart.

**Task 2 — Retry pre-pass in runDaily:**
- Inserted retry pre-pass block before Step 9, guarded by `!skipGemini`.
- Reads current pending, filters items where `summaryModel === 'failed' && (summaryAttempts ?? 1) < 3` (CAP=3).
- Calls `summarize()` per failed item using stored `summaryBody` (no re-fetch, no seen.json change).
- On success: clears `summaryBody`, bumps `summaryAttempts`, updates `summary_ko`/model/confidence.
- On failure: bumps `summaryAttempts`, keeps `summaryBody`.
- Persists changes via `updatePending()` before new-item summarize step.
- Added `pairsMap: Map<firmId, SummarizedPair[]>` parallel to `summarized` FirmResult[] — threads `inputBody` from the summarize closure to `toPendingItem` at Step 10. `FirmResult` in `types.ts` is untouched (D-01/surgical requirement).
- 4 new tests: (a) recovery, (b) CAP stop, (c) toPendingItem unit test, (d) weekly geminiCallCount=0.

## Invariants Verified

- **D-01:** `runWeekly.ts` does NOT import `updatePending` or the `summarize` function. Only counter accessors (`resetGeminiCallCount`, `getGeminiCallCount`) are imported — confirmed via grep.
- **D-09:** `updatePending` preserves `windowStart` by reading current state before replacing items.
- **COMP-05:** `summaryBody` only stored when `summaryModel === 'failed'`; deleted on retry success; never stored for skipped/succeeded items.
- **CAP=3:** filter uses `(summaryAttempts ?? 1) < 3` — items with `summaryAttempts: 3` are never retried again.
- **Backward-compat:** Existing `pending.json` without new fields parses cleanly (fields are optional in zod schema).

## Test Results

```
Test Files  37 passed (37)
Tests  509 passed (509)
```

- Baseline: 503 tests
- New tests: +6 (2 in pending.test.ts, 4 in retryFailedSummaries.test.ts)
- Regressions: 0

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing TypeScript errors in `test/main.test.ts` (5 implicit `any` type errors) were present before this task and are out of scope per SCOPE BOUNDARY rule. Logged as a pre-existing issue.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. `summaryBody` stored only on self-written failed items (self-trust boundary, T-p9j-02 accepted).

## Self-Check

### Created files exist:
- test/pipeline/retryFailedSummaries.test.ts: FOUND

### Commits exist:
- 6ed76c4 (Task 1): FOUND
- d4cd37a (Task 2): FOUND

## Self-Check: PASSED
