---
quick_id: 260523-mtz
mode: quick
type: execute
wave: 1
status: complete
completed_at: 2026-05-23T21:30:24Z
duration_seconds: 67
requirements_closed: [DQOBS-01, DQOBS-02]
files_modified:
  - src/observability/recorder.ts
  - test/observability/recorder.test.ts
commits:
  - 04a572e: "fix(13.1): DQOBS-01 isEmptyFirm predicate masks weekly observability rows"
tests:
  before: 22
  after: 23
  delta: 1 new (DQOBS-01 regression: runWeekly pattern)
verification:
  vitest: 23/23 passed
  tsc: zero errors
  no_runWeekly_drift: confirmed (git diff src/pipeline/runWeekly.ts empty)
---

# Quick Task 260523-mtz: Fix DQOBS-01 Weekly Observability Regression

## One-liner

Extended `isEmptyFirm` predicate in `src/observability/recorder.ts` from two-signal (fetched + bodyLengths) to four-signal (+ guardCount + confidenceH/M/L) so weekly step-summary rows render real GUARD + H/M/L counts instead of em-dash masking, closing BLOCKER-1 from `.planning/v1.1-MILESTONE-AUDIT.md`.

## Root Cause Recap

Phase 13's daily/weekly pipeline split routes weekly metric writes through the recorder via `recorder.firm(id).guardCount(...)` (runWeekly.ts:197) and `.confidence(h,m,l)` (runWeekly.ts:201) WITHOUT first calling `.fetched(n)` — weekly reads pending instead of fetching. The original predicate `m.fetched === 0 && m.bodyLengths.length === 0` evaluated true for every weekly row, blanking GUARD and H/M/L columns to em-dash and suppressing data the recorder already held.

## Fix Surface (Option B per audit)

Single predicate widening at `src/observability/recorder.ts:157`. Recorder-side fix chosen over runWeekly-side because the predicate is the single surface every current and future weekly-style entry point flows through — Option A (have runWeekly call `.fetched(items.length)` per firm) would fabricate a metric that doesn't match the weekly semantic (`fetched` = items pulled from a remote — weekly pulls zero) and would require parallel patches in every future non-fetching entry point.

## Code Changes

**`src/observability/recorder.ts`** — replaced two-signal predicate with four-signal predicate + DQOBS-01 explanatory comment block. One predicate line changed (now spans 7 lines with comment header).

**`test/observability/recorder.test.ts`** — added one regression test `DQOBS-01 regression: runWeekly pattern (guardCount + confidence, no fetched call) renders non-em-dash GUARD + H/M/L` inside the existing `Phase 10 DQOBS-01 extensions` describe block, after the `Mid-stage throw honesty` test. Test name contains literal `runWeekly` so grep-on-test-file makes the regression provenance findable.

## TDD Cycle (verified)

| Step | Action | Result |
|------|--------|--------|
| RED | Added new test, ran `pnpm vitest run test/observability/recorder.test.ts` | 22 passed, 1 failed — failure message: `expected '... \| Cooley \| 0 \| 0 \| 0 \| — \| 0ms \| — \| — \| — \|' to contain '... \| Cooley \| 0 \| 0 \| 0 \| — \| 0ms \| — \| 2 \| 5/1/0 \|'` (GUARD/H-M-L columns specifically — clean diagnostic) |
| GREEN | Widened predicate to four-signal check | 23/23 passed |
| Typecheck | `pnpm tsc --noEmit` | zero errors |

## Verification (acceptance criteria from plan)

- [x] `pnpm vitest run test/observability/recorder.test.ts` → 23 passed (was 22)
- [x] `pnpm tsc --noEmit` → zero errors
- [x] Widened predicate has all four signal-group checks (`fetched`, `bodyLengths.length`, `guardCount`, `confidenceH + confidenceM + confidenceL`)
- [x] `git diff src/pipeline/runWeekly.ts` → empty (no drift)
- [x] `git diff --name-only` → exactly `src/observability/recorder.ts` and `test/observability/recorder.test.ts` (scope-clean)

## Truths Satisfied (frontmatter must_haves)

| Truth | Status |
|-------|--------|
| Weekly step-summary GUARD column renders integer (not em-dash) when runWeekly populates guardCount via recorder | Satisfied — new test asserts `\| 2 \|` not `\| — \|` |
| Weekly step-summary H/M/L column renders H/M/L counts (not em-dash) when runWeekly populates confidence(h,m,l) via recorder | Satisfied — new test asserts `\| 5/1/0 \|` not `\| — \|` |
| Truly-empty firms (no fetched, no body, no guard, no confidence) still render as em-dash — daily-side mid-stage-throw honesty preserved | Satisfied — existing tests at lines 89, 98, 141, 205, 226 still pass (a truly-untouched firm has all four signals at zero, still hits em-dash branch) |
| All 22 pre-existing Recorder tests stay green (no behavioral regression on daily/Phase-10 contract) | Satisfied — 22 prior tests all green, only 1 new test added |

## Side-effect: DQOBS-02 cross-check unblocked

The "X firm flagged low-confidence" marker emitted in weekly step-summary can now be cross-checked against the in-table H/M/L column — operators get coherent observability where the marker count and the table cells agree, instead of marker-says-N but table-says-em-dash mismatch.

## Deviations from Plan

None — plan executed exactly as written. RED-then-GREEN gates fired in declared order; no Rule 1/2/3 auto-fixes needed; no Rule 4 architectural checkpoints triggered.

## Commits

- `04a572e` — `fix(13.1): DQOBS-01 isEmptyFirm predicate masks weekly observability rows` (2 files changed, 27 insertions, 3 deletions)

## Self-Check: PASSED

- src/observability/recorder.ts → FOUND (modified at line 157, now four-signal predicate)
- test/observability/recorder.test.ts → FOUND (new test added after `Mid-stage throw honesty` at line 230)
- Commit 04a572e → FOUND in `git log --oneline -3`
- runWeekly.ts unchanged → CONFIRMED (`git diff src/pipeline/runWeekly.ts` empty)
- All 23 tests pass; tsc --noEmit zero errors
