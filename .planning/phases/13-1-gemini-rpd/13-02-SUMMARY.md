---
phase: 13-1-gemini-rpd
plan: 02
subsystem: observability

tags: [gemini, observability, step-summary, metrics, rpd]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: "src/summarize/gemini.ts (single sanctioned LLM boundary with p-retry + flash→flash-lite fallback)"
  - phase: 03
    provides: "src/observability/summary.ts writeStepSummary ($GITHUB_STEP_SUMMARY append boundary)"
  - phase: 08
    provides: "DataQualityMarker type + markers param threading"
  - phase: 10
    provides: "renderMarkersMarkdown helper + Recorder.toMarkdownTable"
provides:
  - "getGeminiCallCount() / resetGeminiCallCount() exported from src/summarize/gemini.ts"
  - "geminiCallCount module-level counter increments on every ai.models.generateContent attempt (retry + fallback included)"
  - "writeStepSummary(recorder, firms, markers, geminiCallCount=0) signature extended"
  - "[METRIC] geminiCallCount=N\\n\\n prepended as first line of GHA step-summary payload"
  - "SPEC AC-7 grep marker byte-for-byte: ^\\[METRIC\\] geminiCallCount=[0-9]+$"
affects:
  - "13-03 (runDaily): must call resetGeminiCallCount() at start + pass getGeminiCallCount() to writeStepSummary"
  - "13-04 (runWeekly): must call resetGeminiCallCount() at start; always emits N=0 (D-22)"
  - "13-05 (main.ts mode flag): emitDryRunStepSummary must mirror [METRIC] line for DRY_RUN parity"
  - "13-06 (workflows): downstream grep target for daily-average ≤15 / weekly ===0 acceptance"

# Tech tracking
tech-stack:
  added: []  # No new deps — uses existing @google/genai mock pattern from test/summarize/guard01Layer2.test.ts
  patterns:
    - "module-level mutable counter (sanctioned per D-20 single-process/single-run lifecycle + test isolation)"
    - "increment-before-await (count network attempts even on throw — D-18 threat T-13-02-01)"
    - "default-0 backwards-compat param (preserves existing run.ts call site)"
    - "single appendFile atomic payload preserved (Pitfall 5 — metric + table + markers in one write)"

key-files:
  created:
    - "test/summarize/geminiCallCount.test.ts"
  modified:
    - "src/summarize/gemini.ts"
    - "src/observability/summary.ts"
    - "test/observability/summary.test.ts"

key-decisions:
  - "Counter increments BEFORE the await on ai.models.generateContent so 429/timeout still count (D-18, threat T-13-02-01 mitigation)"
  - "Module-level let geminiCallCount sanctioned per D-20 — single sanctioned writer + 2 readers + reset in beforeEach"
  - "writeStepSummary signature extended with geminiCallCount: number = 0 default — sole existing run.ts call site compiles unchanged"
  - "[METRIC] line constructed at single literal template site in summary.ts — drift impossible without grep gate alarm"
  - "Marker emitted unconditionally (D-22) — weekly N=0 still produces grep-able marker"

patterns-established:
  - "Module-level observability counter: let X = 0; export getX(); export resetX(); X++ at sanctioned site"
  - "Increment-before-throw discipline: counter mutation precedes any await that may throw, so failure paths still count"
  - "Single-appendFile prepend invariant: payload = metric + table + markers concatenated, one write"

requirements-completed:
  - SPEC-7

# Metrics
duration: ~6 min
completed: 2026-05-22
---

# Phase 13 Plan 02: geminiCallCount Observability Summary

**Module-level `geminiCallCount` counter in `src/summarize/gemini.ts` increments at every `ai.models.generateContent` attempt (retries + flash→flash-lite fallback included), surfaced via `[METRIC] geminiCallCount=N` line prepended to the GitHub Step Summary for SPEC AC-7 grep validation.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-22T17:14:54Z (post 13-01 SUMMARY commit)
- **Completed:** 2026-05-22T17:20:39Z
- **Tasks:** 3 (Task 3 merged into Task 1 + Task 2 TDD pairs — tests written first, no separate test-only task needed)
- **Files modified:** 4

## Accomplishments

- `let geminiCallCount = 0` module-level counter + `getGeminiCallCount()` + `resetGeminiCallCount()` exported from `src/summarize/gemini.ts`
- Single sanctioned `geminiCallCount++` site immediately before `ai.models.generateContent` — counts EVERY attempt (p-retry retries + fallback swap), bypassed by missing-API-key AbortError path
- `writeStepSummary` signature extended with `geminiCallCount: number = 0` (default-0 backwards-compat — existing `run.ts:425` call site compiles unchanged)
- `[METRIC] geminiCallCount=N\n\n` prepended as FIRST line of GHA step-summary payload, BEFORE the markdown table — SPEC AC-7 grep target `^\[METRIC\] geminiCallCount=[0-9]+$` matches byte-for-byte
- Single `appendFile` Pitfall 5 invariant preserved (metric + table + markers concatenated into one payload string)
- 9 new tests across two files (5 counter + 4 metric-prepend); 474/474 full suite green

## Task Commits

Each TDD pair was committed atomically (RED → GREEN per task; no refactor needed):

1. **Task 1 RED:** `5b04e12` `test(13-02): add failing geminiCallCount counter tests` (5 tests)
2. **Task 1 GREEN:** `2c8c3a8` `feat(13-02): add module-level geminiCallCount + getter/reset to gemini.ts`
3. **Task 2 RED:** `19ad578` `test(13-02): add failing [METRIC] geminiCallCount prepend tests` (5 tests, 4 active + 1 env-gated)
4. **Task 2 GREEN:** `2b98e1d` `feat(13-02): prepend [METRIC] geminiCallCount=N to writeStepSummary payload`

_Task 3 (tests) was absorbed into Tasks 1 + 2 TDD cycles — single coherent RED commit per implementation surface rather than a third trailing test commit. The plan's Task 3 acceptance criteria are met by the RED commits 5b04e12 + 19ad578._

## Files Created/Modified

- **CREATED** `test/summarize/geminiCallCount.test.ts` — 5 tests: starts-at-0, reset-to-0, missing-key bypass, single-call counter=1, 429-retry counter≥2 + matches SDK invocation count
- **MODIFIED** `src/summarize/gemini.ts` — D-20 sanctioning comment block + counter init + getter + resetter + single increment site immediately before `generateContent` (35 insertions; no logic touched in pRetry / ZodError / AbortError paths)
- **MODIFIED** `src/observability/summary.ts` — D-21/D-22 header comment paragraph + 4th param `geminiCallCount: number = 0` + `metricLine` constant + `metricLine + table + '\n'` concat (13 insertions, 1 deletion)
- **MODIFIED** `test/observability/summary.test.ts` — new `Phase 13 D-21/D-22 [METRIC] geminiCallCount prepend` describe block with 5 tests (prepend-N>0, default-0, ordering [METRIC]→table→warnings, exact SPEC AC-7 regex match, env-gated no-op)

## Decisions Made

- **Counter at module level, not Recorder injection** (D-20 sanctioning) — threading recorder through every `summarize()` caller would touch runDaily, run.ts, checkFirm.ts for a counter with one writer + two readers. Module-level state is justified because: (1) single-process single-run cron lifecycle, (2) test isolation via `resetGeminiCallCount()` in `beforeEach`, (3) all production callers (runDaily, runWeekly per plans 13-03/04) will call reset+read at entry/exit. If counter ever grows (per-model breakdown, per-attempt timing), migrate to Recorder.

- **Increment BEFORE the await, not after** (D-18 / threat T-13-02-01) — network throws (429, 5xx, timeout) still consumed RPD/RPM budget. Post-await counting would under-report and break SPEC AC-7's daily-average ≤15 / weekly === 0 ceiling proximity. p-retry's `onFailedAttempt` re-enters `call` and increments again per retry — counter mirrors actual API attempt count.

- **AbortError (missing GEMINI_API_KEY) bypasses increment** — `throw new AbortError(...)` fires BEFORE SDK construction reaches the `ai.models.generateContent` line. This is intentional: missing-key is a config bug, not a quota event. Verified by test "missing GEMINI_API_KEY: counter does NOT increment" with `expect(mocks.generateContentMock).not.toHaveBeenCalled()`.

- **writeStepSummary 4th param defaults to 0, not required** — preserves backwards-compat with the existing sole call site `await writeStepSummary(recorder, allFirms, markers)` at `src/pipeline/run.ts:425`. Plans 13-03 / 13-04 will pass real `getGeminiCallCount()` values when they extract runDaily/runWeekly.

- **Marker emitted unconditionally (D-22)** — weekly runs that never invoke Gemini still produce `[METRIC] geminiCallCount=0\n\n` so the SPEC AC-7 grep marker matches in EVERY workflow log. If we only emitted when N>0, weekly runs would fail the grep gate (acceptance contract is presence + value, not just value).

- **Test 3 (geminiCallCount.test.ts) and test extension (summary.test.ts) merged into Task 1/2 TDD pairs** — the plan's Task 3 was bookkeeping; the RED commits 5b04e12 + 19ad578 already cover every Task 3 acceptance criterion (resetGeminiCallCount occurrences, GEMINI_API_KEY mentions, [METRIC] literal counts, startsWith assertions). No separate Task 3 commit needed.

## Deviations from Plan

### Minor Process Adjustment

**1. [Process] Task 3 (test file authoring) absorbed into Task 1 + Task 2 TDD RED commits**

- **Found during:** Plan execution start
- **Issue:** Plan structured Task 3 as a separate "create test files" task, but plan also marked Tasks 1 and 2 as `tdd="true"`, which requires writing failing tests BEFORE implementation per TDD execution flow. Following TDD discipline strictly produces RED test commits inside Tasks 1 and 2.
- **Resolution:** Wrote `test/summarize/geminiCallCount.test.ts` as the RED commit of Task 1 (`5b04e12`), and the new describe block in `test/observability/summary.test.ts` as the RED commit of Task 2 (`19ad578`). Task 3's content was fully delivered as part of those commits; no separate Task 3 commit was needed.
- **Verification:** All Task 3 acceptance gates satisfied by the RED commits — `grep -c resetGeminiCallCount test/summarize/geminiCallCount.test.ts` returns 5 (≥2 required), `grep -c GEMINI_API_KEY` returns 3 (≥2 required), `grep -cE "\[METRIC\] geminiCallCount=" test/observability/summary.test.ts` returns 7 (≥3 required), `grep -c startsWith` returns 3 (≥2 required).
- **Impact:** Zero — test coverage and grep gates match plan exactly; only commit boundary shifted. Bonus: each RED commit pairs with its GREEN commit, keeping `git bisect` clean (test-only commit → impl commit).

---

**Total deviations:** 1 process adjustment (TDD discipline takes precedence over plan task boundaries)
**Impact on plan:** None. All acceptance criteria met; test coverage identical; grep gates pass.

## Issues Encountered

None. All RED → GREEN cycles completed cleanly. typecheck clean throughout. No flaky tests.

## Verification Evidence

**SPEC AC-7 grep marker (byte-for-byte):**

```bash
$ echo "[METRIC] geminiCallCount=42" | grep -E '^\[METRIC\] geminiCallCount=[0-9]+$'
[METRIC] geminiCallCount=42
```

Matches. The exact string emitted by `writeStepSummary` (verified in test "SPEC AC-7 grep marker matches exact regex").

**Task 1 acceptance gates:**

```
grep -c "export function getGeminiCallCount" src/summarize/gemini.ts            → 1
grep -c "export function resetGeminiCallCount" src/summarize/gemini.ts          → 1
grep -c "let geminiCallCount = 0" src/summarize/gemini.ts                       → 1
grep -vE '^\s*(//|\*|/\*)' src/summarize/gemini.ts | grep -c "geminiCallCount++" → 1
grep -B1 "ai.models.generateContent" src/summarize/gemini.ts | grep -c "geminiCallCount++" → 1
```

**Task 2 acceptance gates:**

```
grep -c "geminiCallCount: number = 0" src/observability/summary.ts → 1
grep -cE "\[METRIC\] geminiCallCount=" src/observability/summary.ts → 3
grep -c "metricLine" src/observability/summary.ts                   → 2
grep -c "metricLine + table" src/observability/summary.ts           → 1
metricLine line: 79; table line: 85; metric-first? YES
```

**Task 3 acceptance gates:**

```
grep -c "resetGeminiCallCount" test/summarize/geminiCallCount.test.ts → 5 (≥2 required)
grep -c "GEMINI_API_KEY" test/summarize/geminiCallCount.test.ts        → 3 (≥2 required)
grep -cE "\[METRIC\] geminiCallCount=" test/observability/summary.test.ts → 7 (≥3 required)
grep -c "startsWith" test/observability/summary.test.ts               → 3 (≥2 required)
```

**Test suite:**

```
pnpm vitest run test/summarize/                       → 25/25 passed
pnpm vitest run test/observability/summary.test.ts    → 18/18 passed
pnpm vitest run (full suite)                          → 474/474 passed across 33 files
pnpm typecheck                                        → 0 errors
```

## Next Phase Readiness

**Ready for plan 13-03 (runDaily extraction):**

- `resetGeminiCallCount()` exported and ready to call at runDaily start
- `getGeminiCallCount()` exported and ready to read at runDaily end
- `writeStepSummary(recorder, firms, markers, getGeminiCallCount())` signature supports the 4-arg call shape
- All existing summarize behavior unchanged — runDaily won't see any regression in `summarize()` semantics

**Ready for plan 13-04 (runWeekly extraction):**

- Same counter primitives available — runWeekly will call `resetGeminiCallCount()` at entry and pass `getGeminiCallCount()` (always === 0 in weekly path) to `writeStepSummary`, satisfying SPEC AC-7 "weekly run's geminiCallCount === 0"

**Ready for plan 13-05 (main.ts mode flag + emitDryRunStepSummary parity):**

- The `[METRIC]` line template lives at a single literal site in `src/observability/summary.ts` — Plan 13-05 must mirror the exact same string (`[METRIC] geminiCallCount=${N}\n`) in `emitDryRunStepSummary` for DRY_RUN parity (Phase 10 D-07 byte-for-byte invariant extended to Phase 13)

## Threat Flags

None introduced. Counter increment surface is internal to `src/summarize/gemini.ts`; `[METRIC]` line emits a non-PII integer to a file path env var already trusted by GHA. Threat register T-13-02-01..05 from PLAN frontmatter all mitigated:

- **T-13-02-01** (Repudiation, under-report) → counter is BEFORE await
- **T-13-02-02** (Tampering, test pollution) → beforeEach/afterEach reset
- **T-13-02-03** (Repudiation, marker format drift) → single literal site + grep gate test
- **T-13-02-04** (DoS, concurrent mutation) → accepted (single-threaded Node + p-limit serializes)
- **T-13-02-05** (Info Disclosure, secrets in marker) → accepted (counter is integer only)

## Self-Check: PASSED

- [x] src/summarize/gemini.ts exists and contains counter + getter + resetter + single increment
- [x] src/observability/summary.ts exists and contains 4th param + metricLine prepend
- [x] test/summarize/geminiCallCount.test.ts exists (5 tests)
- [x] test/observability/summary.test.ts contains new Phase 13 describe block (5 tests)
- [x] Commits 5b04e12, 2c8c3a8, 19ad578, 2b98e1d all present in git log
- [x] pnpm vitest run → 474/474 pass
- [x] pnpm typecheck → 0 errors
- [x] All grep gates from Task 1/2/3 acceptance criteria pass

---

*Phase: 13-1-gemini-rpd*
*Completed: 2026-05-22*
