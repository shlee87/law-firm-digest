---
phase: 08-hallucination-guard
fixed_at: 2026-04-20T16:35:00Z
review_path: .planning/phases/08-hallucination-guard/08-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-04-20T16:35:00Z
**Source review:** .planning/phases/08-hallucination-guard/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — critical_warning scope; 5 Info findings deferred)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: ClusterMarker reconstruction in templates.ts drifts from detector's authoritative output

**Files modified:** `src/compose/templates.ts`, `src/compose/digest.ts`, `src/pipeline/run.ts`, `test/compose/digest.test.ts`
**Commit:** b0e2a87
**Applied fix:** Applied Option A (reviewer's preferred fix) — threaded `markers: ClusterMarker[]` through the full call chain:
- `renderHtml(...)` now accepts `markers: ClusterMarker[] = []` as its 5th parameter.
- `composeDigest(...)` now accepts `markers: ClusterMarker[] = []` as its 6th parameter and passes it to `renderHtml`.
- `run.ts` passes the authoritative `markers` (from `detectHallucinationClusters`) into `composeDigest`.
- `deriveMarkersFromFirms` (the lossy reconstruction helper) has been removed from `templates.ts`.
- Two digest tests that exercised the D-14 footer via fixture `isClusterMember: true` flags were updated to pass explicit markers alongside the fixture — mirroring real-run data flow. The fold-UI test (D-11/D-12) remains unchanged because fold UI still derives from the per-item `isClusterMember` flag; only the footer now has a single source of truth.

Verification: `npx tsc --noEmit` clean, full test suite (373/373) passes.

### WR-02: Input contract comment in detectClusters.ts contradicts real-run invariant

**Files modified:** `src/pipeline/detectClusters.ts`
**Commit:** 889df26
**Applied fix:** Tightened the INPUT CONTRACT header comment to accurately describe the `--skip-gemini` / `cli-skipped` null path as sanctioned-but-real, and added a runtime `console.warn` guard inside the null branch that fires when `summaryModel !== 'cli-skipped'`. A non-sanctioned null now surfaces as a stderr warning rather than silently bypassing cluster detection — matches the project's "aggressive failure detection" preference.

Verification: `npx tsc --noEmit` clean, 12/12 clusterDetection tests pass (existing null-path test at case 5 still green because it uses `summaryModel: 'cli-skipped'`, which suppresses the new warning as expected).

### WR-03: Template literal in cluster stderr log is not escaped against quote injection

**Files modified:** `src/pipeline/detectClusters.ts`
**Commit:** ea826c3
**Applied fix:** Escaped `sig` for the `console.error` log line only — replaced `\`, `"`, and `\n` with their escaped forms (`\\`, `\"`, `\\n`) before interpolating into the `signature="..."` field. The underlying `ClusterMarker.signature` field is preserved unchanged, so email-footer and step-summary consumers still see the original prefix. Existing Test 9's regex `^HALLUCINATION_CLUSTER_DETECTED: firm=\S+ count=\d+ signature=".+"$` still matches because the escaped output is still a valid quoted string.

Verification: `npx tsc --noEmit` clean, 12/12 clusterDetection tests pass.

## Skipped Issues

None — all in-scope findings were fixed.

## Out-of-Scope (Info) Findings Deferred

The following 5 Info-severity findings were out of the `critical_warning` scope and are intentionally NOT addressed in this iteration:
- IN-01: Schema tri-state (null / '' / string) documentation
- IN-02: p-retry quota burn on non-transient HTTP errors
- IN-03: `JSON.parse(res.text ?? '{}')` classifiability
- IN-04: `firms` vs `allFirms` variable shadowing
- IN-05: Unused `ClusterMarker` type import in `test/pipeline/clusterDetection.test.ts`

---

_Fixed: 2026-04-20T16:35:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
