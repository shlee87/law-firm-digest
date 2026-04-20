---
phase: 08-hallucination-guard
plan: 06
subsystem: observability
tags: [hallucination-guard, step-summary, d-15, guard-04, markers, pitfall-5]

requires:
  - phase: 08-03
    provides: writeStepSummary signature extended with markers param (void placeholder)
  - phase: 08-04
    provides: email-footer D-15 pattern (reused in step-summary side)

provides:
  - writeStepSummary renders ## ⚠ Data Quality Warnings section when markers non-empty
  - Single-appendFile transactional write (Pitfall 5)
  - 4 D-15 test cases locking format, clean-run posture, env-gate, and atomicity

affects: [08-final, phase-11-resume]

tech-stack:
  added: []
  patterns:
    - "D-15 single-payload pattern: build full string then ONE appendFile call (Pitfall 5)"
    - "Clean-run invisible posture: omit section entirely when markers.length===0"

key-files:
  created: []
  modified:
    - src/observability/summary.ts
    - test/observability/summary.test.ts

key-decisions:
  - "Pitfall 5 single-appendFile: table + markers concatenated into one payload string before write — half-success impossible"
  - "D-15 clean-run posture: markers.length===0 omits section entirely, not empty-section placeholder"
  - "ESM spy limitation workaround: Pitfall 5 test uses file-content assertion (both table + markers present) instead of vi.spyOn(fsPromises) which fails in ESM — static grep gate (await appendFile count=1) is the authoritative call-count invariant"

patterns-established:
  - "Markers section format locked: '- **<firmId>**: HALLUCINATION_CLUSTER_DETECTED — <count> items demoted'"
  - "Section header locked: '## ⚠ Data Quality Warnings'"

requirements-completed: [GUARD-04]

duration: 7min
completed: 2026-04-20
---

# Phase 08 Plan 06: Step-Summary D-15 Data Quality Warnings Summary

**writeStepSummary extended to render `## ⚠ Data Quality Warnings` markdown section after per-firm table when cluster markers detected, completing GUARD-04 (email footer done in Plan 04; step-summary side done here)**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T20:54:00Z
- **Completed:** 2026-04-20T21:01:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed `void markers` placeholder from `src/observability/summary.ts` (Plan 03 stub)
- Implemented D-15 markers section: `## ⚠ Data Quality Warnings\n\n- **{firmId}**: HALLUCINATION_CLUSTER_DETECTED — {count} items demoted` per marker
- Pitfall 5 enforced: table + markers built into single `payload` string, written in ONE `appendFile` call
- Clean-run posture: `markers.length === 0` → section absent entirely (no empty heading)
- 4 new D-15 tests added; all 8 summary tests pass

## Task Commits

1. **Task 1: Implement D-15 Data Quality Warnings section** - `91ec484` (feat)
2. **Task 2: Add 4 D-15 test cases** - `d7f86d8` (test)

## Files Created/Modified

- `src/observability/summary.ts` — void markers removed; single-payload D-15 rendering added
- `test/observability/summary.test.ts` — 4 new D-15 tests (non-empty markers, empty markers, unset env, Pitfall 5 atomicity)

## Decisions Made

- **Pitfall 5 single-appendFile:** Full payload string built before any I/O — `table + '\n'` then conditionally `+= markers section`. One `await appendFile(path, payload, 'utf8')` call. If write fails, both table and markers fail together (catch-block warns).
- **ESM spy limitation:** `vi.spyOn(fsPromises, 'appendFile')` fails in ESM (`Cannot redefine property`). Pitfall 5 test was rewritten to assert both table and markers present in file content — proves atomicity behaviorally. Static invariant (single `await appendFile` call) enforced via acceptance-criterion grep gate.
- **ClusterMarker.signature NOT rendered** in step-summary (matches plan threat register T-08-06-02: signature is debug-only, stays in stderr D-16 marker).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM vi.spyOn incompatibility for Pitfall 5 test**
- **Found during:** Task 2 (D-15 test cases)
- **Issue:** `vi.spyOn(fsPromises, 'appendFile')` throws `Cannot redefine property: appendFile` in ESM modules
- **Fix:** Rewrote Pitfall 5 test to assert file content contains both table header and warnings section after single `writeStepSummary` call. Added clarifying comment that the authoritative call-count invariant is the static grep gate.
- **Files modified:** test/observability/summary.test.ts
- **Verification:** `pnpm exec vitest run test/observability/summary.test.ts` → 8 passed
- **Committed in:** d7f86d8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — ESM spy bug)
**Impact on plan:** Zero scope change. Test coverage equivalent — behavioral assertion proves atomicity as effectively as spy count.

## Issues Encountered

None beyond ESM spy limitation (handled above).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `writeStepSummary` writes to `$GITHUB_STEP_SUMMARY` (existing surface from Plan 03). firmId comes from config/firms.yaml, validated by zod at startup — no markdown injection risk (T-08-06-01 mitigated by existing invariant).

## Known Stubs

None. D-15 rendering is fully wired: `detectHallucinationClusters` → markers → `writeStepSummary` payload.

## GUARD-04 Closure

GUARD-04 literal: "HALLUCINATION_CLUSTER_DETECTED surfaces in both the GHA step-summary and the email footer so the operator can act without reading logs."

- Email footer side: Plan 04 (08-04) — DONE
- Step-summary side: Plan 06 (this plan) — DONE

GUARD-04 is now fully closed.

## Next Phase Readiness

- Phase 8 all 6 plans complete
- GUARD-01 through GUARD-04 all implemented and tested
- Phase 11 (resume cron) entry: all Phase 6–10 success criteria must be demonstrably met

---

## Self-Check

**Commits exist:**
- `91ec484` feat(08-06): implement D-15 Data Quality Warnings in writeStepSummary ✓
- `d7f86d8` test(08-06): add 4 D-15 tests for Data Quality Warnings section ✓

**Files exist:**
- `src/observability/summary.ts` ✓
- `test/observability/summary.test.ts` ✓

**Acceptance criteria:**
- `grep -c "void markers" src/observability/summary.ts` → 0 ✓
- `grep -c "## ⚠ Data Quality Warnings" src/observability/summary.ts` → 1 ✓
- `grep -c "await appendFile" src/observability/summary.ts` → 1 ✓
- `pnpm exec vitest run test/observability/summary.test.ts` → 8 passed ✓

## Self-Check: PASSED

*Phase: 08-hallucination-guard*
*Completed: 2026-04-20*
