---
phase: 08-hallucination-guard
plan: "03"
subsystem: pipeline
tags: [hallucination-guard, cluster-detector, pipeline, phase-8]
dependency_graph:
  requires: [08-01]
  provides: [detectHallucinationClusters, ClusterMarker, DetectionResult]
  affects: [src/pipeline/run.ts, src/observability/summary.ts]
tech_stack:
  added: []
  patterns:
    - pure-function detector over FirmResult[]
    - immutable map+spread pipeline convention
    - hoisted let declaration above try for finally-block visibility
    - optional param with default for backward-compat signature extension
key_files:
  created:
    - src/pipeline/detectClusters.ts
  modified:
    - src/pipeline/run.ts
    - src/observability/summary.ts
decisions:
  - "GUARD-03 cluster threshold=3 hardcoded (D-07) — no parameterization per threat register T-08-03-02"
  - "jaccardTokenSimilarity (signals.ts) deliberately not reused — prefix comparison is spec-exact and faster"
  - "void markers placeholder in summary.ts suppresses unused-var until Plan 06 wires renderer"
  - "markers hoisted above outer try block (Pitfall 5) so finally-block writeStepSummary always sees current run's markers"
metrics:
  duration: ~10min
  completed: 2026-04-20T20:38:32Z
  tasks: 3
  files: 3
---

# Phase 8 Plan 03: Hallucination Cluster Detector Summary

**One-liner:** Pure `detectHallucinationClusters` function groups post-summarize items by `summary_ko.slice(0,50)` per firm, demotes 3+ clusters to `summaryConfidence='low'`/`isClusterMember=true`, emits `HALLUCINATION_CLUSTER_DETECTED` stderr markers, and is hooked into run.ts between the summarize Promise.all and newTotal reduce.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create detectClusters.ts pure function | de42fcf | src/pipeline/detectClusters.ts (114 lines, new) |
| 2 | Hook detector into run.ts + hoist markers + rename consumers | f0eeb25 | src/pipeline/run.ts (+20/-6) |
| 3 | Extend writeStepSummary signature (optional markers param) | 11f3075 | src/observability/summary.ts (+7) |

## New File: src/pipeline/detectClusters.ts

- **114 lines**, pure function
- Exports: `detectHallucinationClusters`, `ClusterMarker`, `DetectionResult`
- Internal constants: `CLUSTER_THRESHOLD = 3`, `SIGNATURE_LENGTH = 50`
- Groups by `summary_ko.slice(0, 50)` — no trim, no case-fold (D-07 exact spec)
- Skips: firms with `r.error`, firms with `r.summarized.length === 0`, items with `summary_ko === null`
- Cluster members demoted: `summaryConfidence: 'low' as const`, `isClusterMember: true as const`
- Stderr emission per cluster: `HALLUCINATION_CLUSTER_DETECTED: firm=<id> count=<n> signature="<first50chars>"`
- Immutable: returns new `FirmResult[]` via `.map + spread`

## Hook Insertion Point in run.ts

Inserted **between** the closing `));` of the summarize `Promise.all` (original line 268) and the `const newTotal = ...` reduce:

```
// Phase 8 D-06 — post-summarize hallucination cluster detection.
const clusterResult = detectHallucinationClusters(summarized);
const clusterAdjusted = clusterResult.firms;
markers = clusterResult.markers;

const newTotal = clusterAdjusted.reduce((n, r) => n + r.summarized.length, 0);
```

## Markers Hoisting Location

Hoisted **after** the `chromium.launch` block and **before** the outermost `try {`:

```typescript
// Phase 8 D-06 / Pitfall 5 — hoist markers above try so the finally-block
// writeStepSummary call at the end can see them even on early throw.
let markers: ClusterMarker[] = [];
```

## Symbol-Enumerated Consumer Renames (clusterAdjusted)

4 renames performed, verified by positive grep (count=6) and negative grep (count=0):

1. `const clusterAdjusted = clusterResult.firms` — declaration
2. `clusterAdjusted.reduce(...)` — newTotal computation
3. `clusterAdjusted.filter(r => r.firm.type === 'js-render' && r.error != null)` — jsRenderFailures count
4. `results: clusterAdjusted` — RunReport construction
5. `composeDigest(clusterAdjusted, ...)` — compose call
6. `writeState(seen, clusterAdjusted)` — state write

**Negative grep gate passed:** `grep -cE "summarized\.(reduce|filter|forEach|map|flatMap|some|every|find)\(" src/pipeline/run.ts` = **0**

## tsc Verification

- After Task 1: `pnpm exec tsc --noEmit` exits 0
- After Task 2: exits 2 (expected — writeStepSummary arity mismatch, fixed by Task 3)
- After Task 3: `pnpm exec tsc --noEmit` exits 0 — **wave-2 tree green**

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `void markers;` in `src/observability/summary.ts` — intentional placeholder. Plan 06 (wave-3) removes this line and wires the `## ⚠ Data Quality Warnings` markdown section renderer. Does not affect plan goal (cluster detection + demotion is fully wired; surfacing in step-summary is Plan 06 work).

## Upcoming Plans

- **Plan 05** (wave-3): Unit tests that prove `detectHallucinationClusters` semantics (immutability, threshold, null exclusion, empty input)
- **Plan 06** (wave-3): Full `writeStepSummary` markdown rendering of markers as `## ⚠ Data Quality Warnings` section; removes `void markers` placeholder

## Self-Check: PASSED

- `src/pipeline/detectClusters.ts` exists: FOUND
- `de42fcf` exists: FOUND
- `f0eeb25` exists: FOUND
- `11f3075` exists: FOUND
- `pnpm exec tsc --noEmit` exits 0: PASSED
- `grep clusterAdjusted >= 4`: 6 PASSED
- `grep summarized.<method>( == 0`: 0 PASSED
