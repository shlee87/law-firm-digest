# Phase 13 — Deferred Items

Items discovered during Phase 13 execution that are out of scope for the
current plan and tracked for follow-up.

## From Plan 13-05 (main.ts dispatch + run.ts deletion)

### 1. test/pipeline/run.test.disabled.ts — re-write under runDaily + runWeekly

- **Original path:** `test/pipeline/run.test.ts`
- **Disabled path (transient):** `test/pipeline/run.test.disabled.ts`
- **Status:** **RESOLVED in Plan 13-07.**
- **Resolution (2026-05-23, Plan 13-07):**
  - `test/pipeline/runDaily.e2e.test.ts` created — covers SPEC AC-1 (3
    items → pending.length === 3, no send, no archive, COMP-05 enforced,
    SUMM-06 Layer 1 short-circuit, D-09 windowStart preservation).
  - `test/pipeline/runWeekly.e2e.test.ts` created — covers SPEC AC-2
    (digest path, 5 items → sendMail+writeArchive+truncate with OPS-03
    ordering locked) and SPEC AC-3 (heartbeat path, 0 items → "이번 주 신규
    없음" subject + minimal body markers).
  - `test/pipeline/run.test.disabled.ts` DELETED. The pre-split
    `runPipeline` integration tests are obsolete by definition since the
    function no longer exists (Plan 13-05). All meaningful behavior maps
    to the two new e2e files OR is already covered by sibling unit tests
    (`guard01Layer1.test.ts` for Layer 1, `clusterDetection.test.ts` for
    DQOBS-03 markers, scraper-tier tests for Phase 4 browser lifecycle).
  - Follow-up: `firmFilter` / `saveHtmlPath` / `skipStateWrite` option
    surface coverage is NOT carried by the new e2e fixtures. These are
    runDaily/runWeekly contract details better suited to focused unit
    tests in plan 13-03/13-04 SUMMARY territory; if a regression ever
    surfaces, add a `test/pipeline/runDaily.options.test.ts` block. Not
    blocking for Phase 13 closure.
