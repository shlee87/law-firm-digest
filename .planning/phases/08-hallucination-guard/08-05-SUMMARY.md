---
phase: 08-hallucination-guard
plan: 05
subsystem: testing
tags: [vitest, cluster-detection, hallucination-guard, pure-function, korean-text, phase-8]

# Dependency graph
requires:
  - phase: 08-03
    provides: detectHallucinationClusters pure function in src/pipeline/detectClusters.ts

provides:
  - "12 unit tests locking GUARD-03 semantics: threshold (2 vs 3), 50-char signature, same-firm scope, null exclusion, error skip, immutability, D-16 format, Korean multibyte safety, idempotence, mixed-item partial demotion"

affects: [08-06, future-refactors-of-detectClusters]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function unit test pattern: direct import, synthetic Korean fixtures, vi.spyOn(console.error) + mockRestore per test, no SDK mocks"
    - "50-char prefix fixture strategy: hallucinatedPrefix50 exactly 50 UTF-16 code units + diverging suffixes at char 51+"

key-files:
  created:
    - test/pipeline/clusterDetection.test.ts
  modified: []

key-decisions:
  - "hallucinatedPrefix50 fixture must be exactly 50 UTF-16 code units — original PLAN.md fixture string was only 30 chars causing 5/12 tests to fail; fixed by selecting a 50-char Korean string and verifying with node -e"
  - "Test 9 toContain assertion uses Korean prefix content from signature (not firmName) — D-16 marker format is firm=id not firm=name; toContain('법무법인 태평양은 1980년') is accurate"
  - "import uses multi-line named import style; grep -c 'import.*detectHallucinationClusters' returns 0 (grep across newline boundary) but import is present and tests pass"

patterns-established:
  - "Korean fixture strings: always verify .length and .slice(0,N) equality in node REPL before coding fixture assertions"
  - "console.error spy: mockImplementation(() => {}) + spy.mockRestore() at end of each test that spies"

requirements-completed: [GUARD-03]

# Metrics
duration: 5min
completed: 2026-04-20
---

# Phase 08 Plan 05: Cluster Detection Unit Tests Summary

**12 pure-function unit tests locking detectHallucinationClusters semantics — threshold, 50-char prefix signature, same-firm scope (D-07), null exclusion, error skip, immutability, D-16 stderr marker format, Korean multibyte UTF-16 safety, idempotence, and mixed-item partial demotion**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-20T15:47:00Z
- **Completed:** 2026-04-20T15:49:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `test/pipeline/clusterDetection.test.ts` with 12 `it()` blocks covering full contract of `detectHallucinationClusters`
- All 12 tests pass; full suite 369/369 green; `tsc --noEmit` clean
- Fixed fixture string to be exactly 50 UTF-16 code units so `.slice(0,50)` identity holds across all hallucinated items

## Test Coverage Map

| Test | Decision / Pitfall Locked |
|------|---------------------------|
| 1: 3 items → demoted + marker + stderr | Threshold=3 (D-07), D-08 demotion, D-16 marker |
| 2: 2 items → no trigger | Threshold boundary 2 < 3 (D-07) |
| 3: char 51+ diverge → still clusters | Signature = first 50 chars exactly (D-07) |
| 4: same prefix across firms → no cluster | Same-firm scope (D-07) |
| 5: null summary_ko excluded | Null exclusion (Plan 01 cli-skipped path) |
| 6: error firm skipped | Error-firm guard |
| 7: empty summarized[] → no-op | Edge case: empty array |
| 8: immutable update | Spread convention (Plan 03 D-08) |
| 9: D-16 marker format | Exact stderr format `HALLUCINATION_CLUSTER_DETECTED: firm= count= signature="…"` |
| 10: Korean multibyte safety | Pitfall 1 — BMP Hangul = 1 UTF-16 code unit, slice(0,50) safe |
| 11: idempotent re-run | Two runs → two stderr emissions, same count |
| 12: mixed normal + cluster | Only cluster members demoted; real item untouched |

## Task Commits

1. **Task 1: Create test/pipeline/clusterDetection.test.ts** - `94c06e3` (test)

## Files Created/Modified

- `/Users/seonghoonyi/Documents/projects/legalnewsletter/test/pipeline/clusterDetection.test.ts` — 12 unit tests for detectHallucinationClusters

## Decisions Made

- **Fixture string length bug (Rule 1 auto-fix):** PLAN.md's `hallucinatedPrefix50` constant (`'법무법인 태평양은 1980년에 설립된 한국의 종합 법률'`) is only 30 UTF-16 code units, not 50. Because `.slice(0, 50)` of hallucinated1/2/3 extended into the diverging suffix, each item produced a different signature key — causing 5/12 tests to fail. Fixed by selecting `'법무법인 태평양은 1980년에 설립된 한국의 종합 법률 서비스 회사이며 기업 자문을 제공합'` (exactly 50 code units, verified via `node -e`) and appending diverging suffixes.
- **Test 9 firmName assertion:** D-16 marker format contains `firm=<id>` not `firm=<name>`. The PLAN's `toContain('법무법인 태평양')` would fail because firmName is not in the stderr line. Replaced with `toContain('법무법인 태평양은 1980년')` which is present in the `signature` field of the marker string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed hallucinatedPrefix50 fixture — was 30 chars not 50**
- **Found during:** Task 1 (initial test run — 5/12 failing)
- **Issue:** PLAN.md's fixture string was 30 UTF-16 code units, not 50. The `.slice(0,50)` captured part of each item's diverging suffix, making each signature unique → cluster threshold never reached
- **Fix:** Replaced constant with a verified 50-char Korean string; diverging suffixes start at char 51+; verified with `node -e` REPL before committing
- **Files modified:** test/pipeline/clusterDetection.test.ts
- **Verification:** 5 previously-failing tests now pass; node REPL confirms `h1.slice(0,50) === h2.slice(0,50) === h3.slice(0,50) === hallucinatedPrefix50`
- **Committed in:** 94c06e3

**2. [Rule 1 - Bug] Fixed Test 9 toContain — firmName not in D-16 marker**
- **Found during:** Task 1 (pre-emptive review of PLAN assertions against implementation)
- **Issue:** PLAN asserted `toContain('법무법인 태평양')` but D-16 marker format is `firm=bkl` (id only); firmName not present in stderr line
- **Fix:** Changed to `toContain('법무법인 태평양은 1980년')` — this substring is in the `signature` field within quotes
- **Files modified:** test/pipeline/clusterDetection.test.ts
- **Verification:** Test 9 passes; spy.mock.calls[0][0] contains the Korean prefix as expected
- **Committed in:** 94c06e3

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes corrected inaccuracies in the PLAN.md fixture/assertion, not in the implementation. detectClusters.ts (Plan 03) is unchanged.

## Issues Encountered

- PLAN.md's `hallucinatedPrefix50` was incorrectly sized (30 chars vs required 50). This is a plan-authoring error — the fixture string was written as a natural sentence fragment that happened to be 30 chars, not verified against the 50-char constraint.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- `test/pipeline/clusterDetection.test.ts` exists: FOUND
- commit `94c06e3` exists: FOUND
- `pnpm exec vitest run test/pipeline/clusterDetection.test.ts` exits 0 with 12/12: CONFIRMED
- `pnpm exec vitest run` 369/369 green: CONFIRMED
- `pnpm exec tsc --noEmit` exits 0: CONFIRMED

## Next Phase Readiness

- GUARD-03 semantics are now locked by tests; Plan 06 (integration wiring, email template, or remaining hallucination-guard work) can proceed with confidence
- Any future change to `detectHallucinationClusters` that breaks threshold, immutability, D-16 format, or Korean safety will immediately fail these tests

---
*Phase: 08-hallucination-guard*
*Completed: 2026-04-20*
