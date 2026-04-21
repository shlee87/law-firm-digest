---
phase: "10"
plan: "03"
subsystem: observability
tags: [dry-run, stdout-emission, run-report, approach-c, node-env-guard, pattern-2]
dependency_graph:
  requires: [10-01, 10-02]
  provides: [emitDryRunStepSummary, RunReport-markers-firms, Approach-C-guard]
  affects: [src/main.ts, src/pipeline/run.ts, test/main.test.ts]
tech_stack:
  added: []
  patterns: [Pattern-2-DRY_RUN-containment, Approach-C-NODE_ENV-test-guard, DQOBS-03-fourth-sanctioned-site]
key_files:
  created:
    - test/main.test.ts
  modified:
    - src/main.ts
    - src/pipeline/run.ts
decisions:
  - "Approach C: NODE_ENV !== 'test' guard prevents main().then(process.exit) from firing during vitest imports"
  - "emitDryRunStepSummary is the fourth and final sanctioned DRY_RUN site (Pattern 2 containment)"
  - "RunReport widened with markers: DataQualityMarker[] and firms: FirmConfig[] for DRY_RUN emission"
  - "toMarkdownTable called with report.firms so disabled-firm filter and deterministic order apply"
metrics:
  duration: "~1h"
  completed: "2026-04-21"
  tasks_completed: 2
  files_modified: 3
---

# Phase 10 Plan 03: DRY_RUN Stdout Emission + RunReport Widening Summary

Widened `RunReport` with `markers` and `firms` fields, exported `emitDryRunStepSummary` as the fourth sanctioned DRY_RUN site in `main.ts`, added Approach C `NODE_ENV !== 'test'` guard so test imports of `main.ts` do not trigger `process.exit`.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Widen RunReport with markers + firms | fbbb6d7 | src/pipeline/run.ts |
| 2 | DRY_RUN stdout emission + Approach C NODE_ENV guard | ed144a2 | src/main.ts, test/main.test.ts |

## What Was Built

### RunReport widening (`src/pipeline/run.ts`)

`RunReport` gained two new fields:
- `markers: DataQualityMarker[]` — populated from merged cluster + low-confidence markers
- `firms: FirmConfig[]` — populated from `allFirms` so `toMarkdownTable` can filter disabled firms

Imports widened: `DataQualityMarker` from `detectClusters.ts`, `detectLowConfidence` from `detectLowConfidence.ts`.

### DRY_RUN stdout emission (`src/main.ts`)

Exported `emitDryRunStepSummary(report: RunReport): void` — fourth sanctioned DRY_RUN site (Pattern 2 containment). Calls `report.recorder.toMarkdownTable(report.firms)` and `renderMarkersMarkdown(report.markers)`, emitting both to stdout prefixed with `[DRY_RUN] Step-summary`.

Approach C: `if (process.env.NODE_ENV !== 'test') { main().then((code) => process.exit(code)); }` — Vitest sets `NODE_ENV=test` by default (Vitest 1.x+ contract), so importing `main.ts` from tests does not trigger `process.exit`.

Pattern 2 header in `main.ts` updated to list all 4 sanctioned DRY_RUN check sites:
1. `src/mailer/gmail.ts` — skip SMTP send
2. `src/state/writer.ts` — skip disk write
3. `src/archive/writer.ts` — skip archive write
4. `src/main.ts` — DQOBS-03 step-summary stdout preview

### Tests (`test/main.test.ts`)

6 unit tests covering:
- `DRY_RUN=1` + empty markers → label + table, no markers block (D-15)
- `DRY_RUN=1` + non-empty markers → label + table + markers block
- `DRY_RUN` unset → no stdout emission
- `DRY_RUN=0` → no stdout emission
- `DRY_RUN=1` + cluster markers → D-05 Korean wording (`개 항목 demote됨`)
- Byte-for-byte parity: output matches `renderMarkersMarkdown` for markers block (D-07)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript implicit any in test/main.test.ts**
- **Found during:** Task 2 — `pnpm tsc --noEmit` reported TS7006 on `.map((c) => c.join(' '))`
- **Issue:** `logSpy.mock.calls` elements typed as `unknown[]` but lambda parameter `c` was unannotated
- **Fix:** Added explicit `(c: unknown[])` type annotation on all 6 `.map` calls
- **Files modified:** test/main.test.ts
- **Commit:** included in ed144a2

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes.

## Self-Check: PASSED

- `src/main.ts` exports `emitDryRunStepSummary` and has `NODE_ENV !== 'test'` guard
- `test/main.test.ts` exists with 6 tests
- Commits fbbb6d7 and ed144a2 exist in git log
- 443 tests pass (31 files) after this plan
