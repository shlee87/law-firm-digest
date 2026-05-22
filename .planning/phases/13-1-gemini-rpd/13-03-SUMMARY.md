---
phase: 13-1-gemini-rpd
plan: 03
subsystem: pipeline
tags: [daily-mode, pending, cross-mode-invariant, d-01, d-12, d-19]

# Dependency graph
requires:
  - phase: 13-1-gemini-rpd
    provides: "src/state/pending.ts — toPendingItem + appendPending (plan 13-01)"
  - phase: 13-1-gemini-rpd
    provides: "src/summarize/gemini.ts — resetGeminiCallCount + getGeminiCallCount (plan 13-02)"
  - phase: 13-1-gemini-rpd
    provides: "src/observability/summary.ts — writeStepSummary 4th-arg geminiCallCount (plan 13-02)"
provides:
  - "src/pipeline/runDaily.ts — daily-mode entry function (canonical steps 1~9 + appendPending + writeState)"
  - "src/pipeline/runTypes.ts — shared Reporter / RunOptions / RunReport / noopReporter (consumable by runWeekly in plan 13-04)"
  - "D-01 cross-mode invariant enforcement at import level (zero imports from compose/mailer/archive/detect)"
  - "D-12 enforcement: cluster + low-confidence detection NOT called in daily path"
affects:
  - "13-04 (runWeekly): will import RunOptions/RunReport/Reporter/noopReporter from runTypes.ts (D-01 type-module reuse)"
  - "13-05 (main.ts mode dispatch): main() will call runDaily() when mode==='daily'; current run.ts entry stays until 13-05 swap"
  - "13-05 (checkFirm.ts swap): runPipeline import → runDaily import (D-03)"
  - "13-05 (run.ts deletion): run.ts retained until 13-05 cuts over main.ts + checkFirm.ts"

# Tech tracking
tech-stack:
  added: []  # No new deps — uses existing p-limit + playwright + zod ecosystem already in deps
  patterns:
    - "Shared-type module pattern: extract Reporter/RunOptions/RunReport to runTypes.ts so two entry functions reference one source of truth (D-01)"
    - "Compiler-enforced cross-mode invariant: forbidden imports listed in header comment + verified by grep gate (zero matches in code regions)"
    - "Counter reset at entry / read in finally: resetGeminiCallCount() inside try; getGeminiCallCount() inside finally so partial runs still report (D-19)"
    - "COMP-05 enforced via type system: appendPending signature is PendingItem[] — direct JSON.stringify(summarizedItem) would fail typecheck"

key-files:
  created:
    - src/pipeline/runDaily.ts
    - src/pipeline/runTypes.ts
  modified: []

key-decisions:
  - "Phase 13-03: runTypes.ts is dependency-free except for std types (FirmResult, FirmConfig, StalenessWarnings, Recorder, DataQualityMarker) — no import from run.ts to avoid cycle"
  - "Phase 13-03: forbidden imports documented as comment-only block at bottom of runDaily.ts imports — defensive in-source documentation that mirrors the grep gate"
  - "Phase 13-03: pendingItems filter pattern — summarized.filter((r) => !r.error).flatMap(...) skips error firms (no summarized items for them) before toPendingItem projection"
  - "Phase 13-03: layer3 guard counter is permanently 0 in daily path (D-12) — comment explicitly notes 'Detection runs in weekly' so future readers don't add layer3 here"
  - "Phase 13-03: outer finally browser.close() preserved verbatim from run.ts Phase 4 D-05 — runs unconditionally on throw so no zombie chromium across retries"

patterns-established:
  - "Forbidden-import grep gate: header comment lists forbidden modules + acceptance_criteria asserts zero comment-stripped matches"
  - "Dual finally nesting: inner finally for writeStepSummary (D-21 metric line); outer finally for browser.close (Phase 4 D-05)"
  - "RunReport.markers: [] literal on daily path: explicit zero-marker contract documents D-12 invariant at the report-construction site"

requirements-completed: [SPEC-1]

# Metrics
duration: ~3min
completed: 2026-05-22
---

# Phase 13 Plan 03: runDaily Pipeline Entry Summary

**`src/pipeline/runDaily.ts` performs the canonical sequence 1~9 + `appendPending` + `writeState`, importing zero compose/mailer/archive/detect modules — D-01 cross-mode invariant enforced by the compiler. `src/pipeline/runTypes.ts` extracts Reporter/RunOptions/RunReport so plan 13-04 runWeekly.ts can share them. 474/474 full suite green; zero forbidden imports verified via grep gate.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-22T17:25:00Z (post 13-02 SUMMARY commit)
- **Completed:** 2026-05-22T17:28:30Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- `src/pipeline/runTypes.ts` (44 lines) extracts Reporter, RunOptions, RunReport, noopReporter from run.ts verbatim — no import cycle (zero references to run.ts)
- `src/pipeline/runDaily.ts` (292 lines) executes canonical sequence steps 1~9 + appendPending + writeState
- D-01 cross-mode invariant verified by grep gate: ZERO imports from `../mailer/gmail.js`, `../archive/writer.js`, `../compose/digest.js`, `../compose/heartbeat.js`, `./detectClusters.js`, `./detectLowConfidence.js` in code regions (comment-stripped grep)
- D-12 verified: no detectHallucinationClusters / detectLowConfidence call in daily path; layer3 guard count permanently 0 with explicit comment
- Plan 13-01 wiring: `toPendingItem(s, now)` projection at line 270, `appendPending(pendingItems)` at line 271 — COMP-05 enforced at the type level (description/isClusterMember/isNew can't reach disk through this path)
- Plan 13-02 wiring: `resetGeminiCallCount()` at line 122 (top of try block, post-browser-launch); `getGeminiCallCount()` at line 296 inside inner finally (4th arg to `writeStepSummary`)
- Outer finally `browser.close()` preserved verbatim from run.ts Phase 4 D-05 — runs unconditionally on throw
- 474/474 full test suite green (no regressions in run.ts call sites — run.ts kept intact for 13-05 swap)
- typecheck 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: src/pipeline/runTypes.ts** — `f320016` (feat)
2. **Task 2: src/pipeline/runDaily.ts** — `ee43b52` (feat)

## Files Created/Modified

- `src/pipeline/runTypes.ts` (NEW, 44 lines) — shared type module exporting Reporter, RunOptions, RunReport, noopReporter
- `src/pipeline/runDaily.ts` (NEW, 292 lines) — daily-mode pipeline entry: 9-step canonical sequence + appendPending + writeState; cross-mode invariant enforced via import absence

## Decisions Made

See `key-decisions` frontmatter. Summary:

1. **runTypes.ts dependency-free w.r.t. run.ts** — chose to import only std types (FirmResult, FirmConfig, StalenessWarnings, Recorder, DataQualityMarker) rather than re-export from run.ts. Avoids a temporary import cycle and lets Plan 13-05 delete run.ts cleanly without renaming this file.

2. **Forbidden-import block as in-source documentation** — duplicated the acceptance_criteria forbidden list as a comment-only block at the bottom of imports. The grep gate already enforces the invariant mechanically; the comment serves as discoverable documentation for future readers ("why isn't sendMail here?"). Same defense-in-depth posture as Phase 1's Pattern 2 DRY_RUN containment annotation.

3. **pendingItems filter pattern** — `summarized.filter((r) => !r.error).flatMap((r) => r.summarized.map(...))` over `summarized.flatMap((r) => r.summarized.map(...))`. The filter is defensive: error firms have `r.summarized = []` by FirmResult construction (Phase 1/2 contract), so the filter is structurally redundant but documents intent. No behavioral difference under current contract; the filter survives any future contract change where errored firms could carry a partial summarized array.

4. **layer3 guard counter permanently 0 with explicit comment** — kept the H/M/L tally code structure identical to run.ts to minimize diff risk for the next reader, but stripped the layer3 contributor (cluster-demoted items) and added an inline `// D-12:` comment explaining the structural zero. Future maintainers extending Recorder won't accidentally add layer3 back here.

5. **Outer finally browser.close() preserved verbatim** — Phase 4 D-05 invariant: race-safe across throw paths. The inner `writeStepSummary` finally is nested inside, NOT replaced — both invariants coexist (metric line always written, browser always closed).

## Deviations from Plan

None. Plan 13-03 was executed exactly as written:
- Task 1 file body matches the plan's specified template byte-for-byte
- Task 2 file body matches the plan's specified template byte-for-byte
- All acceptance criteria gates passed on first run (no Rule 1/2/3 deviations triggered)
- No checkpoints in this plan; both tasks `type="auto"` and `tdd="false"`

## Issues Encountered

None. Both tasks landed clean; typecheck and existing tests green throughout.

## Verification Evidence

**Task 1 acceptance gates (runTypes.ts):**

```
$ pnpm typecheck
> tsc --noEmit
(no errors)

$ grep -c "export interface Reporter" src/pipeline/runTypes.ts        → 1
$ grep -c "export interface RunOptions" src/pipeline/runTypes.ts      → 1
$ grep -c "export interface RunReport" src/pipeline/runTypes.ts       → 1
$ grep -c "export const noopReporter" src/pipeline/runTypes.ts        → 1
$ grep -c "runPipeline" src/pipeline/runTypes.ts                      → 0 (no import or re-export)
```

**Task 2 acceptance gates (runDaily.ts):**

```
$ grep -c "export async function runDaily" src/pipeline/runDaily.ts   → 1
$ grep -c "appendPending" src/pipeline/runDaily.ts                    → 5 (≥2 required: import + call + comment + frontmatter)
$ grep -c "toPendingItem" src/pipeline/runDaily.ts                    → 4 (≥2 required: import + call + comments)
$ grep -c "resetGeminiCallCount" src/pipeline/runDaily.ts             → 3 (≥2 required: import + call + comment)
$ grep -c "getGeminiCallCount" src/pipeline/runDaily.ts               → 3 (≥2 required: import + call + comment)
$ grep -c "writeState" src/pipeline/runDaily.ts                       → 3 (≥2 required: import + call + comment)
$ grep -c "writeStepSummary" src/pipeline/runDaily.ts                 → 3 (≥2 required: import + call + comment)
```

**D-01 cross-mode invariant (forbidden imports — code regions only, comment-stripped):**

```
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runDaily.ts | grep -c "from '../mailer/gmail.js'"        → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runDaily.ts | grep -c "from '../archive/writer.js'"     → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runDaily.ts | grep -c "from '../compose/digest.js'"     → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runDaily.ts | grep -c "from '../compose/heartbeat.js'"  → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runDaily.ts | grep -c "from './detectClusters.js'"      → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runDaily.ts | grep -c "from './detectLowConfidence.js'" → 0
```

**Executor-level success criteria:**

```
$ grep -rE "from '(\.\.\/)?compose|email|state/archive" src/pipeline/runDaily.ts | wc -l  → 0
$ grep -n 'resetGeminiCallCount\|appendPending\|toPendingItem' src/pipeline/runDaily.ts | wc -l → 10 (≥3 required)
```

**Test suite:**

```
$ pnpm vitest run test/pipeline/
 Test Files  8 passed (8)
      Tests  105 passed (105)
   Duration  4.19s

$ pnpm test
 Test Files  33 passed (33)
      Tests  474 passed (474)
   Duration  40.25s

$ pnpm typecheck
> tsc --noEmit
(no errors)
```

## D-01 Verification (cross-mode invariant)

D-01 motivates this whole plan: "split runPipeline into runDaily + runWeekly so the compiler enforces cross-mode invariant via import absence." Verified at three levels:

1. **Comment documentation:** Header comment at top of runDaily.ts explicitly enumerates the forbidden modules ("this file DOES NOT IMPORT sendMail, writeArchive, composeDigest, composeHeartbeat, detectHallucinationClusters, or detectLowConfidence"). Forbidden-import block at the bottom of imports mirrors this list as a comment-only fence.

2. **Compiler:** Every type-level reference to the forbidden modules is absent — runDaily.ts cannot accidentally call `sendMail(payload)` because the name is not in scope. Adding the import would be visible in the diff and rejected at code review (acceptance gate auto-catches at grep level too).

3. **Grep gate:** Six grep counts all return 0 for the forbidden import patterns in code regions (comment-stripped). Future refactors that accidentally pull a forbidden module trigger the gate immediately.

## D-12 Verification (no cluster/low-conf detection in daily path)

D-12: daily firm-batch sizes (1~2 items/firm) are below the cluster threshold (3+) → detection is permanently no-op on daily; running it would waste cycles and risk false positives. Verified:

- No `detectHallucinationClusters` import in runDaily.ts (grep = 0 in code regions)
- No `detectLowConfidence` import in runDaily.ts (grep = 0 in code regions)
- layer3 guard counter (cluster-demoted items) is structurally 0 with explicit `// D-12:` comment at the call site
- RunReport.markers populated as `[]` literal with explicit comment "D-12: detection runs in weekly"

## Wiring Verification (Plan 13-01 + 13-02 integrated)

**Plan 13-01 (pending storage):** `toPendingItem` + `appendPending` called once each in runDaily:

```typescript
const pendingItems: PendingItem[] = summarized
  .filter((r) => !r.error)
  .flatMap((r) => r.summarized.map((s) => toPendingItem(s, now)));
await appendPending(pendingItems);
```

COMP-05 enforced at the type level — the only sanctioned construction path for PendingItem is `toPendingItem`, which omits description/isClusterMember/isNew. Direct `JSON.stringify(summarized)` would fail typecheck because `appendPending` expects `PendingItem[]` not `SummarizedItem[]`.

**Plan 13-02 (geminiCallCount):**

- `resetGeminiCallCount()` at top of try block (line 122) — clears any stale counter from prior worker reuse
- `getGeminiCallCount()` at line 296 inside inner finally — passes the accumulated count as 4th arg to `writeStepSummary`, producing the `[METRIC] geminiCallCount=N` line at the top of the GHA step-summary payload

The finally placement guarantees the metric line is emitted even on mid-pipeline throw (e.g., readState ZodError, fetchAll Promise.allSettled wrapping breach). SPEC AC-7 grep marker `[METRIC] geminiCallCount=N` reachable in every daily run, partial or complete.

## Note on run.ts persistence

`src/pipeline/run.ts` is unchanged in this plan — runDaily.ts coexists with run.ts during waves 2~4. Plan 13-05 will:
- Swap main.ts to dispatch `runDaily()` / `runWeekly()` based on `--mode` flag
- Swap checkFirm.ts from `runPipeline` → `runDaily` (D-03)
- Delete src/pipeline/run.ts after all call sites swap
- Update main.ts header comment "DRY_RUN check sites = 4" → "DRY_RUN check sites = 5" (Pattern 2 containment annotation, deferred from 13-01 per its SUMMARY)

## Next Phase Readiness

**Ready for plan 13-04 (runWeekly):**

- `src/pipeline/runTypes.ts` exports `Reporter`, `RunOptions`, `RunReport`, `noopReporter` — runWeekly.ts imports the same types so the dispatch contract in main.ts stays uniform
- `src/state/pending.ts` exports `readPending` + `truncatePending` (Plan 13-01) — ready for runWeekly to consume
- D-12 invariant ready to be implemented in reverse: runWeekly is the only place that calls `detectHallucinationClusters` + `detectLowConfidence`
- D-22 invariant ready: runWeekly will call `resetGeminiCallCount()` at entry; `getGeminiCallCount()` will always return 0 because runWeekly never calls `summarize()`. SPEC AC-7 "weekly run's geminiCallCount === 0" satisfied by construction.

**Ready for plan 13-05 (main.ts dispatch):**

- runDaily entry function signature matches runPipeline shape (RunOptions → Promise<RunReport>) so the dispatch site can call either uniformly
- All RunOptions fields are honored or harmless: firmFilter (used), skipStateWrite (used), skipGemini (used), reporter (used); skipEmail (unused — sendMail not imported), saveHtmlPath (unused — composeDigest not imported). Plan 13-05 can simplify RunOptions if both daily+weekly end up not using skipEmail.

**Ready for plan 13-06 (workflows):**

- daily.yml file_pattern can already group `state/pending.json state/seen.json` — runDaily.ts writes both in canonical order (appendPending then writeState), so the atomic commit invariant (D-23) is met by the runDaily.ts implementation.

## User Setup Required

None — no external service configuration required for this plan.

## Threat Flags

None introduced. runDaily.ts surface is entirely existing modules; no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Threat register T-13-03-01..05 from PLAN frontmatter all mitigated:

- **T-13-03-01** (Tampering, cross-mode invariant violation) → header comment FORBIDDEN list + grep-gate in acceptance asserts zero imports from forbidden modules
- **T-13-03-02** (Information Disclosure, SummarizedItem leaked) → toPendingItem projection is the only sanctioned write path; appendPending signature is PendingItem[] (typecheck-enforced)
- **T-13-03-03** (Repudiation, counter reset missed) → resetGeminiCallCount() at top of try block (defense-in-depth even though plan 13-05 will give each runDaily invocation a fresh process)
- **T-13-03-04** (DoS, browser dangling on throw) → outer finally `if (browser) await browser.close()` verbatim from run.ts Phase 4 D-05
- **T-13-03-05** (Tampering, mid-run crash between appendPending and writeState) → plan 13-06 daily.yml file_pattern groups pending.json + seen.json into atomic commit (next-run idempotent recovery — D-23)

## Self-Check: PASSED

- [x] File `src/pipeline/runTypes.ts` exists
- [x] File `src/pipeline/runDaily.ts` exists
- [x] Commit `f320016` (feat 13-03 runTypes) present in git log
- [x] Commit `ee43b52` (feat 13-03 runDaily) present in git log
- [x] `pnpm typecheck` → 0 errors
- [x] `pnpm vitest run test/pipeline/` → 105/105 pass
- [x] `pnpm test` → 474/474 pass
- [x] D-01 forbidden-import grep gates all return 0 (cross-mode invariant)
- [x] Required wirings (appendPending, toPendingItem, resetGeminiCallCount, getGeminiCallCount, writeState, writeStepSummary) all present (grep counts ≥2 each)
- [x] D-12 no cluster/low-conf detection (no import + layer3 = 0 + comment)

---
*Phase: 13-1-gemini-rpd*
*Completed: 2026-05-22*
