---
phase: 12-topic-based-filter
plan: 02
subsystem: pipeline
tags: [topic-filter, gemini-quota-guard, dedup, state, typescript, tdd]

requires:
  - phase: 12-01
    provides: TopicConfig type, loadTopics(), FirmsConfigSchema topics field, RED test suite

provides:
  - isTopicRelevant(title, body, topics) — pure function, D-11 permissive, 500-char window
  - applyTopicFilter — error pass-through, empty-topics fast-path
  - FirmResult.topicFiltered?: RawItem[] field in types.ts
  - run.ts pipeline wiring: loadTopics() + applyTopicFilter between keyword filter and dedup
  - per-item [filter] skip log lines (D-10)
  - writer.ts seen.json extension: topicFiltered URLs merged alongside summarized URLs
affects:
  - state/seen.json (topicFiltered URLs recorded as seen on each run)
  - run.ts pipeline order (step 7.5 added between applyKeywordFilter and dedupAll)

tech-stack:
  added: []
  patterns:
    - Empty-topics fast-path — Object.values({}).flat() === [] → return results unchanged
    - D-11 permissive bias — empty body returns true before any keyword check
    - lastNewAt only advances on summarizedUrls, not topicFilteredUrls (semantically: delivered vs. seen)

key-files:
  created:
    - .planning/phases/12-topic-based-filter/12-02-SUMMARY.md
  modified:
    - src/types.ts (topicFiltered?: RawItem[] added to FirmResult)
    - src/pipeline/filter.ts (stubs replaced with real isTopicRelevant + applyTopicFilter)
    - src/pipeline/run.ts (loadTopics import + call, applyTopicFilter wiring, D-10 log)
    - src/state/writer.ts (topicFilteredUrls merged into seen.json)
    - test/pipeline/run.test.ts (loadTopicsMock + applyTopicFilterMock added)

key-decisions:
  - "topicFiltered URLs recorded in seen.json alongside summarized URLs (D-09/REQ-5) — prevents re-fetch and re-evaluation on subsequent runs"
  - "lastNewAt uses summarizedUrls.length, not newUrls.length — topic-filtered items are 'seen' not 'delivered', staleness clock must not advance for them"
  - "applyTopicFilter placed AFTER applyKeywordFilter, BEFORE dedupAll (D-08 pipeline order) — quota guard purpose"

patterns-established:
  - "D-11 permissive: if (!body.trim()) return true — empty body never silently discards an item"
  - "Fast-path pattern: Object.values(topics).flat().length === 0 → return results unchanged (filter disabled)"
  - "D-09 writer pattern: r.topicFiltered ?? [] merged with filter to exclude duplicates of summarizedUrls"

requirements-completed:
  - SPEC-12-REQ-2
  - SPEC-12-REQ-3
  - SPEC-12-REQ-4
  - SPEC-12-REQ-5
  - SPEC-12-REQ-6

duration: 20min
completed: 2026-04-21
---

# Phase 12-02: Topic Filter Implementation Summary

**isTopicRelevant + applyTopicFilter implemented (8 RED tests → GREEN), wired into run.ts between keyword filter and dedup, topicFiltered URLs merged into seen.json**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-21
- **Tasks:** 3 (incl. human-verify checkpoint)
- **Files modified:** 5

## Accomplishments
- `isTopicRelevant` pure function: D-11 permissive on empty body, case-insensitive 500-char window, ANY keyword from ANY topic area sufficient
- `applyTopicFilter` wraps it for FirmResult arrays: error pass-through, no mutation, empty-topics fast-path returns input unchanged
- `FirmResult.topicFiltered?: RawItem[]` field carries excluded items to writer
- `run.ts` wired: `loadTopics()` at startup, `applyTopicFilter(filtered, topics)` between keyword filter and dedupAll, per-item `[filter] skipped — no topic match:` log
- `writer.ts` extended: `topicFilteredUrls` merged into `seen.json` with dedup against existing+summarized; `lastNewAt` advances only on summarized deliveries
- `test/pipeline/run.test.ts` updated: `loadTopicsMock`/`applyTopicFilterMock` added to vi.mock factories and beforeEach resets

## Task Commits

1. **Task 1 (types + filter impl):** `11decf2` — FirmResult.topicFiltered, real isTopicRelevant/applyTopicFilter, run.ts + writer.ts wiring, run.test.ts mock updates

## Files Created/Modified
- `src/types.ts` — `topicFiltered?: RawItem[]` added to FirmResult
- `src/pipeline/filter.ts` — stubs replaced with real implementations
- `src/pipeline/run.ts` — `loadTopics`/`applyTopicFilter` imports, `topics` var, filter call + D-10 logs, `dedupAll` now receives `topicFiltered` results
- `src/state/writer.ts` — `topicFilteredUrls` merge in subsequent-run branch; `lastNewAt` condition narrowed to `summarizedUrls`
- `test/pipeline/run.test.ts` — two new mocks added to hoisted factory and beforeEach

## Decisions Made
- `lastNewAt` uses `summarizedUrls.length > 0` (not `newUrls.length`) — topicFiltered items are "recorded as seen" but not "delivered content"; advancing the staleness clock for them would incorrectly suppress future new-content notifications.

## Deviations from Plan

### Auto-fixed Issues

**1. [Unplanned — test mock gap] Added loadTopicsMock + applyTopicFilterMock to run.test.ts**
- **Found during:** Task 2 (post-implementation test run)
- **Issue:** `run.test.ts` mocks `loader.js` and `filter.js` via `vi.mock`. New exports not in mock factories caused 18 test failures: `[vitest] No "loadTopics" export is defined on the mock`.
- **Fix:** Added both mocks to `vi.hoisted()`, `vi.mock` factories, and `beforeEach` resets with identity pass-through defaults.
- **Files modified:** test/pipeline/run.test.ts
- **Verification:** 456/456 tests pass after fix.

---

**Total deviations:** 1 auto-fixed (test mock gap — standard pattern for new loader/filter exports)
**Impact on plan:** Essential correctness fix. No scope creep.

## Issues Encountered
None beyond the test mock gap above.

## Next Phase Readiness
- Phase 12 feature complete — topic filter active in pipeline
- firms.yaml keywords are live-editable by non-developers (SPEC-12-REQ-1 / CONF-01)
- Filtered items recorded in seen.json — no re-evaluation on future runs (SPEC-12-REQ-5)
- All 6 SPEC-12 requirements covered across plans 01 and 02

---
*Phase: 12-topic-based-filter*
*Completed: 2026-04-21*
