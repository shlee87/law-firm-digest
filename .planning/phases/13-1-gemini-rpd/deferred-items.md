# Phase 13 — Deferred Items

Items discovered during Phase 13 execution that are out of scope for the
current plan and tracked for follow-up.

## From Plan 13-05 (main.ts dispatch + run.ts deletion)

### 1. test/pipeline/run.test.disabled.ts — re-write under runDaily + runWeekly

- **Original path:** `test/pipeline/run.test.ts`
- **New path:** `test/pipeline/run.test.disabled.ts` (renamed so vitest's
  `*.test.ts` discovery pattern skips it; `@ts-nocheck` header so tsc skips it)
- **Why deferred:** Plan 13-05 deletes `src/pipeline/run.ts` (the test target).
  The integration tests covered `runPipeline({...})` calls with full
  pipeline-stage mocking. Re-writing them split across `runDaily` and
  `runWeekly` is a meaningful scope (≥ 30 test cases) and belongs in
  **Plan 13-07** (e2e tests for the daily + weekly entries).
- **Action under Plan 13-07:** delete `run.test.disabled.ts` after the new
  test files (`test/pipeline/runDaily.test.ts` + `test/pipeline/runWeekly.test.ts`)
  cover the same orchestration scenarios.
- **Test count impact:** No test loss — the existing tests are preserved in the
  disabled file as a checklist of what 13-07 must cover. Plan 13-07's success
  criteria should include a 1-to-1 reconciliation against the disabled file's
  `describe`/`it` blocks before deletion.
