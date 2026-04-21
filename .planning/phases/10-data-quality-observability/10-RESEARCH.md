# Phase 10: Data-Quality Observability - Research

**Researched:** 2026-04-20
**Domain:** Observability extension — Recorder aggregate math + DataQualityMarker union + DRY_RUN stdout emission
**Confidence:** HIGH (every finding is verified against the codebase at specific file:line anchors; zero WebSearch dependencies — this is a pure internal extension over stable Phase 3 + Phase 8 infrastructure)

## Summary

Phase 10 extends two already-shipped observability layers (Phase 3 `Recorder`/`writeStepSummary` and Phase 8 `ClusterMarker`/`renderDataQualityFooter`) without introducing new I/O boundaries, new cron surface, or new persisted state. All three new surfaces (AvgBody column, GUARD union count, H/M/L distribution) are pure in-process aggregations over data that already flows through the pipeline — `enrichBody` item.description length, `summaryModel === 'skipped' | 'failed' | cluster-demoted`, and `summaryConfidence` values. The DQOBS-02 low-confidence marker is a sibling of `ClusterMarker` generated post-summarize and rendered through the existing `renderDataQualityFooter` switch.

The design space is already locked by CONTEXT.md D-01 through D-08. This research documents HOW to implement each locked decision, identifies the exact file:line edit targets, surfaces the non-obvious pitfalls (REPLACE-NOT-ACCUMULATE vs. per-item aggregation, DRY_RUN site count, summaryModel discriminators, disabled-firm filter coverage), and recommends a three-plan breakdown for the planner.

**Primary recommendation:** Three plans — (1) Recorder extension + FirmMetrics shape widening + toMarkdownTable 9-column render, (2) DataQualityMarker union type + low-confidence detector + renderDataQualityFooter/writeStepSummary marker switch, (3) DRY_RUN emission wiring via a new fourth sanctioned check site in main.ts guarded by a narrow escape hatch OR (preferred) expose markers on RunReport and emit from main.ts post-runPipeline. Tests mirror `test/observability/recorder.test.ts`, `test/observability/summary.test.ts`, `test/pipeline/clusterDetection.test.ts`, `test/compose/digest.test.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Extend the existing `Recorder.toMarkdownTable()` 6-column table by appending 3 new columns. Final 9-column shape: `| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |`. No second table, no section split — single scan, single header row, consistent with current UI affordance.

**D-02:** `AvgBody` is the per-firm average of `item.body.length` (UTF-16 code unit) across all items the firm produced in the current run, measured **after `enrichBody` completes** (pre-GUARD, pre-skip-guard, pre-summarize). Skipped items (body trimmed < 100, Phase 8 D-02 Layer 1 short-circuit) are INCLUDED in the average — their low length IS the signal we are trying to surface. Integer format (no decimals). Fetched=0 firm → displayed as `—`.

**D-03:** Extend the existing Phase 8 `ClusterMarker` into a discriminated union `DataQualityMarker`. Two kinds: `{ kind: 'cluster', firmId, count }` (existing, unchanged behaviorally) and `{ kind: 'low-confidence', firmId, lowCount, totalCount }` (new). Single `markers: DataQualityMarker[]` array flows through `renderHtml` and `writeStepSummary` — call-site signatures unchanged except the type widens.

**D-04:** Low-confidence flag triggers when `lowCount / totalCount >= 0.5` AND `totalCount >= 3`. Minimum floor of 3 prevents false positives on sparse-item firms (1/1 and 2/2 low-confidence are too noisy a signal for a flag, though they still show in the H/M/L column).

**D-05:** Render in the existing `renderDataQualityFooter` ("⚠ Data Quality Warnings" block, Phase 8 D-14) — alongside cluster warnings. Not inline with the firm section header. Example footer rows:
  - `- bkl: HALLUCINATION_CLUSTER_DETECTED — 3개 항목 demote됨`  (cluster, existing)
  - `- yulchon: 4/6 items 품질 의심 (confidence=low 과반)`  (low-confidence, new)
  Empty `markers[]` → footer block omitted entirely (D-15 clean-run invisible invariant preserved).

**D-06:** `GUARD` column is a **union count** across all three Phase 8 guard layers per firm:
  - Layer 1: items with `summaryModel === 'skipped'` (body empty / short → Gemini call bypassed)
  - Layer 2: items where Gemini returned `summary_ko === ''` (generic-boilerplate recognized by the model itself) → title-verbatim substitution applied
  - Layer 3: items demoted by the cluster detector (first-50-chars match threshold N≥3 → confidence overwritten to `'low'`)
  Single scalar per firm. Layer-level breakdown (S/E/C) is out of scope for the table — detailed forensics live in GHA logs and post-mortem analysis of `archive/YYYY/MM-DD.html` + `state/seen.json`.

**D-07:** `DRY_RUN=1` mode emits the **same markdown table** that would be written to `$GITHUB_STEP_SUMMARY` on GHA runs, prefixed with `[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):` label line. Table content is byte-for-byte what GHA would see — zero divergence between local and production rendering. Same pattern applies to the markers block (`## ⚠ Data Quality Warnings` section when markers are non-empty).

**D-08:** Output goes to stdout only (mirrors existing DRY_RUN lines for Subject / HTML body / would-write archive / would-write state). No file write in DRY_RUN mode.

### Claude's Discretion
- Formatting micro-choices: whether H/M/L column uses `5/1/0` or `5 / 1 / 0` or `H:5 M:1 L:0`. Keep terse — `5/1/0` preferred unless a Phase 10 plan surfaces a specific readability reason to expand.
- Emoji usage: none unless user opts in. Phase 8 footer uses `⚠` heading; inherit that, no new icons.
- Test-fixture body lengths for unit tests — pick values that clearly cross the 100-char Layer 1 threshold and the 50% low-confidence threshold so boundaries are regression-locked.
- How to handle a firm that errored out at fetch (Fetched=0): keep existing `Errors` column behavior; AvgBody/GUARD/H-M-L render as `—` / `—` / `—` since there's nothing to average.

### Deferred Ideas (OUT OF SCOPE)
- **Historical trending** (DQOBS would become "Cooley's avg body dropped from 8200 to 500 over 7 runs") — requires persistent time-series store beyond state/seen.json. $0 budget constraint and snapshot-based observability posture rule it out for v1.1. Candidate for a future v2 phase if operator signals demand.
- **Per-item confidence badges in the main digest body** — Phase 8 D-04 already handles the template's rendering layer by hiding per-item status; adding per-item H/M/L badges to every article would clutter the primary reading experience. Explicitly deferred per Phase 8 CONTEXT "Phase 10 선택 사항, NOT 선택".
- **Config-driven threshold** (user tunable 50% → 40% / 60% / etc.) — v2 candidate only. v1.1 hardcodes 50% + N≥3 floor per D-04.
- **Step-summary visual styling** (colors, emoji, bold formatting beyond plain markdown) — GitHub's markdown renderer supports emoji/bold but we don't need them. Stay minimal; upgrade only if a demonstrated readability gap emerges.
- **Layer-level breakdown in GUARD column** (S/E/C split like 2/1/0) — deferred per D-06 discussion; if operators later report they need to distinguish Layer 1 vs Layer 3 at a glance, a follow-up plan can split the column.
- **GHA workflow annotation emission** (`::warning file=...::` lines to turn low-confidence firms into PR annotations) — interesting for automated alerting but v1.1 is cron-only (no PRs), not useful today.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DQOBS-01 | GHA step-summary table adds per-firm columns — average body length, generic-body count (GUARD triggers), confidence distribution (high/medium/low) | §"Recorder Extension" (field shape, REPLACE-NOT-ACCUMULATE with per-item append for body lengths), §"toMarkdownTable 9-column render" (format contract), §"GUARD union count" (three-layer detection sites) |
| DQOBS-02 | If a firm's most recent run produces ≥50% `confidence: 'low'` summaries, the email footer and step-summary flag it as a data-quality concern | §"DataQualityMarker union" (discriminated union widening), §"Low-confidence detector" (post-summarize pure function), §"renderDataQualityFooter marker switch" (HTML side), §"writeStepSummary marker switch" (step-summary side) |
| DQOBS-03 | `DRY_RUN=1` mode prints the same DQOBS metrics without writing state or sending email, so the operator can diagnose before unpausing cron | §"DRY_RUN emission site" (new fourth sanctioned site OR main.ts wiring via RunReport), §"Byte-for-byte parity" (invoke Recorder.toMarkdownTable + marker renderer with console.log sink) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-item body length measurement | Pipeline stage (`src/pipeline/enrichBody.ts` write-site OR `src/pipeline/run.ts` post-enrich loop) | Observability (`Recorder`) | enrichBody is the deterministic moment `item.description` is known final; Recorder records it. Keep write-site at the loop consumer (run.ts) for consistency with existing Recorder call pattern (see src/pipeline/run.ts:220 `.newCount(r.new.length)` post-dedup). |
| GUARD layer counting | Pipeline (Layer 1 in `run.ts`, Layer 2 substitution detection in `gemini.ts`+`run.ts`, Layer 3 in `detectClusters.ts`) | Observability (`Recorder`) aggregates | Three detection sites already exist; Phase 10 only ADDS `recorder.firm(id).guard(+1)` calls — no logic change to the guards themselves |
| Confidence distribution tally | Pipeline (`run.ts` post-summarize + post-cluster-detect loop) | Observability | Cluster detection mutates confidence (Layer 3 → 'low'). Tally MUST happen AFTER `detectHallucinationClusters` so Layer-3 demotions are counted as Low, not their pre-demote value |
| Low-confidence marker generation | Pipeline (new `src/pipeline/detectLowConfidence.ts` OR add to `detectClusters.ts`) | None | Pure function over `FirmResult[]`; produces `DataQualityMarker[]` |
| Marker rendering (email) | Compose (`src/compose/templates.ts#renderDataQualityFooter`) | — | D-05 locks this location |
| Marker rendering (step summary) | Observability (`src/observability/summary.ts`) | — | D-05 locks this location |
| DRY_RUN emission | CLI entry (`src/main.ts`) | Observability (reused `Recorder.toMarkdownTable`) | Pattern 2 "scattered DRY_RUN forbidden" allows 3 sanctioned sites (mailer/state/archive). DQOBS-03 requires a FOURTH site — see Pitfall Register |

## Standard Stack

All dependencies are already present — Phase 10 uses zero new packages.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Type safety for discriminated union widening | CLAUDE.md mandates types [VERIFIED: CLAUDE.md line "TypeScript 5.7.x"] |
| vitest | existing | Unit + integration tests for Recorder and markers | Existing project convention [VERIFIED: test/**/*.test.ts exists at 25+ files] |
| Node 22 LTS built-in `fs/promises.appendFile` | bundled | writeStepSummary file I/O | Already in use at src/observability/summary.ts:30 [VERIFIED: existing import] |

### Supporting
None. No new dependencies needed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Array-of-lengths in Recorder (aggregate at render time) | Running sum + count | Array preserves mid-stage-throw honesty trivially (average = 0 if no items recorded); running sum requires divide-by-zero guard. Array also survives Pitfall 6 better (if pipeline throws mid-enrich, array has what we got so far, sum/count stays coherent). Pick whichever feels cleaner to the planner — both satisfy the invariants. |
| New `src/pipeline/detectLowConfidence.ts` module | Add branch inside `detectHallucinationClusters` | Sibling module (separate file) has clearer "one detector per concern" story and makes the unit test boundary crisper. Inline branch saves ~30 LoC but couples two unrelated signals. **Research recommends: sibling module** — matches existing `test/pipeline/clusterDetection.test.ts` mirror pattern. |

**Installation:**
```bash
# Zero new packages needed — Phase 10 is pure in-repo code addition.
```

## Architecture Patterns

### System Architecture Diagram

```
                                       ┌──────────────────────────┐
                                       │  fetchAll                │
                                       │  [recorder.fetched()]    │
                                       │  [recorder.durationMs()] │
                                       │  [recorder.errorClass()] │
                                       └────────────┬─────────────┘
                                                    │ FirmResult[] with raw items
                                                    ▼
                                       ┌──────────────────────────┐
                                       │  enrichWithBody          │
                                       │  (body populated in-place│
                                       │   on item.description)   │
                                       └────────────┬─────────────┘
                                                    │ FirmResult[] with bodies
                                                    ▼
                                       ┌──────────────────────────┐    ★ NEW Phase 10 write site #1
                                       │  (in run.ts, between     │
                                       │   enrichWithBody and     │    recorder.firm(id).bodyLengths(
                                       │   dedupAll)              │      r.raw.map(i =>
                                       │                          │        (i.description ?? '').length
                                       │                          │      ))
                                       └────────────┬─────────────┘    — REPLACE invariant: array set once per firm
                                                    │                     per stage (Pitfall 6 honest snapshot)
                                                    ▼
                                       ┌──────────────────────────┐
                                       │  dedupAll + filter       │
                                       │  [recorder.newCount()]   │
                                       └────────────┬─────────────┘
                                                    │
                                                    ▼
                                       ┌──────────────────────────┐
                                       │  summarize loop          │    ★ NEW Phase 10 write sites #2a, #2b
                                       │                          │
                                       │  per-item pLimit(3)      │    2a. Layer 1 branch (body < 100):
                                       │                          │        recorder.firm(id).guardInc() #1
                                       │  Layer 1 short-circuit:  │        after summaryModel='skipped' set
                                       │    summaryModel=         │
                                       │      'skipped'           │    2b. Layer 2 branch (Gemini returns ''):
                                       │                          │        summarize() returns title-verbatim
                                       │  Gemini call             │        with summaryModel=model (NOT skipped)
                                       │                          │        — Phase 10 post-loop MUST detect
                                       │  Layer 2: summary_ko==='' │        this branch via summary_ko===title
                                       │    handled inside        │        + summaryConfidence==='low' OR add
                                       │    summarize()           │        a `wasEmptyBoilerplate` discriminator
                                       │    → substitute title    │        (see Pitfall: Layer 2 detection)
                                       └────────────┬─────────────┘
                                                    │ FirmResult[] summarized
                                                    ▼
                                       ┌──────────────────────────┐
                                       │  detectHallucination     │    (existing Phase 8)
                                       │  Clusters                │    Layer 3: demotes to 'low' +
                                       │                          │    isClusterMember=true
                                       │                          │    emits ClusterMarker[]
                                       └────────────┬─────────────┘
                                                    │ FirmResult[] + ClusterMarker[]
                                                    ▼
                                       ┌──────────────────────────┐    ★ NEW Phase 10 aggregation sites
                                       │  (in run.ts, post-       │
                                       │   cluster loop — BEFORE  │    for each firm r:
                                       │   composeDigest)         │      guard = count summaryModel==='skipped'
                                       │                          │            + count Layer-2 substitutions
                                       │                          │            + count isClusterMember===true
                                       │                          │      recorder.firm(r.firm.id).guard(guard)
                                       │                          │
                                       │                          │      H = count summaryConfidence==='high'
                                       │                          │      M = count summaryConfidence==='medium'
                                       │                          │      L = count summaryConfidence==='low'
                                       │                          │      recorder.firm(r.firm.id).confidence(H,M,L)
                                       │                          │
                                       │                          │    ★ NEW Phase 10 detector:
                                       │                          │      lowConfMarkers = detectLowConfidence(
                                       │                          │        firms)
                                       │                          │      markers = [...clusterMarkers,
                                       │                          │                 ...lowConfMarkers]
                                       └────────────┬─────────────┘
                                                    │ FirmResult[] + DataQualityMarker[]
                                        ┌───────────┴────────────┐
                                        ▼                        ▼
                         ┌──────────────────────┐    ┌──────────────────────┐
                         │ composeDigest        │    │ writeStepSummary     │
                         │ renderDataQuality    │    │ SAME marker switch   │
                         │ Footer (switch on    │    │ on marker.kind       │
                         │ marker.kind)         │    │ (append to           │
                         │                      │    │ $GITHUB_STEP_SUMMARY)│
                         └──────────────────────┘    └──────────────────────┘
                                    │                           │
                                    ▼                           │
                              sendMail                          │
                                                                │
                         ★ NEW Phase 10 DRY_RUN emission:       │
                         in main.ts after runPipeline returns,  │
                         if isDryRun(): ─────────────────────────┘
                           console.log('[DRY_RUN] Step-summary...')
                           console.log(recorder.toMarkdownTable(firms))
                           console.log(renderMarkersMarkdown(markers))
                         (requires RunReport to expose markers — see §Integration Points)
```

### Recommended Project Structure (edits only — no new directories)

```
src/
├── observability/
│   ├── recorder.ts          ★ MODIFY: FirmMetrics widens + 3 new fluent methods + 9-column toMarkdownTable
│   ├── summary.ts           ★ MODIFY: markers type widens to DataQualityMarker[] + switch on marker.kind
│   └── staleness.ts         (untouched)
├── pipeline/
│   ├── run.ts               ★ MODIFY: add 3 new Recorder write-sites + call detectLowConfidence + merge markers + expose markers in RunReport
│   ├── detectClusters.ts    ★ MODIFY: widen ClusterMarker → DataQualityMarker union (add kind:'cluster' discriminator)
│   ├── detectLowConfidence.ts ★ NEW: pure detector, mirror detectClusters.ts signature style
│   ├── enrichBody.ts        (untouched — body already lands on item.description)
│   └── fetch.ts             (untouched)
├── compose/
│   ├── templates.ts         ★ MODIFY: renderDataQualityFooter switch on marker.kind for low-confidence row format
│   └── digest.ts            ★ MODIFY: markers param type widens from ClusterMarker[] to DataQualityMarker[]
└── main.ts                  ★ MODIFY: DRY_RUN emission post-runPipeline (see DRY_RUN §)

test/
├── observability/
│   ├── recorder.test.ts     ★ MODIFY: 9-column header assertion + new fluent method tests + disabled-firm filter still works
│   └── summary.test.ts      ★ MODIFY: DataQualityMarker union test + low-confidence rendering + Pitfall 5 single-appendFile preserved
├── pipeline/
│   ├── run.test.ts          ★ MODIFY: end-to-end guard count + H/M/L tally + marker merging assertions
│   ├── clusterDetection.test.ts (existing pattern mirror — likely no edits)
│   └── detectLowConfidence.test.ts ★ NEW: threshold boundary tests (N=2 no fire, N=3 50% fire, N=3 50%-1 item no fire)
└── compose/
    └── digest.test.ts       ★ MODIFY: new WR-01-style low-confidence marker in composeDigest test
```

### Pattern 1: REPLACE-NOT-ACCUMULATE (preserve via array-append at one stage boundary)

**What:** Recorder scalar fields replace on re-call. For Phase 10's new aggregate fields, use the same discipline at the STAGE BOUNDARY — do not call `.bodyLengths(…)` per-item; call it ONCE per firm per stage with the full array.

**When to use:** Any time you extend Recorder with a new aggregate field.

**Example:**
```typescript
// Source: src/pipeline/run.ts pattern at line 220 — existing REPLACE semantics
// for (const r of deduped) {
//   recorder.firm(r.firm.id).newCount(r.new.length);   // REPLACE at stage boundary
// }

// Phase 10 — same pattern for body lengths (array or sum+count, both honor
// REPLACE-NOT-ACCUMULATE at the stage boundary):
for (const r of enriched) {
  const bodyLengths = r.raw.map((item) => (item.description ?? '').length);
  recorder.firm(r.firm.id).bodyLengths(bodyLengths);  // REPLACE at stage boundary
}
```

### Pattern 2: Discriminated Union Widening (ClusterMarker → DataQualityMarker)

**What:** Add a `kind` discriminator to the existing `ClusterMarker`, keep the field shape identical for backward compat, define `LowConfidenceMarker` with same `firmId` + `kind` pattern, union them.

**When to use:** D-03 locks this approach.

**Example (type-level):**
```typescript
// Source: src/pipeline/detectClusters.ts:38 current shape
// export interface ClusterMarker {
//   firmId: string;
//   firmName: string;
//   count: number;
//   signature: string;
// }

// Phase 10 — widen to discriminated union. Preserve every existing field
// on ClusterMarker so the writeStepSummary marker-rendering at summary.ts:51
// and the renderDataQualityFooter loop at templates.ts:207 need minimal edits.
export interface ClusterMarker {
  kind: 'cluster';                   // NEW: discriminator
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}

export interface LowConfidenceMarker {
  kind: 'low-confidence';            // NEW
  firmId: string;
  firmName: string;                  // same shape as ClusterMarker for unified rendering access
  lowCount: number;
  totalCount: number;
}

export type DataQualityMarker = ClusterMarker | LowConfidenceMarker;
```

**Migration cost audit (verified via grep):**
- `src/pipeline/detectClusters.ts:76` `import type { ClusterMarker }` — existing export widened in-place; external callers keep importing same name.
- `src/observability/summary.ts:34` `import type { ClusterMarker }` — parameter type widens to `DataQualityMarker[]`; one line change.
- `src/compose/templates.ts:54` `import type { ClusterMarker }` — same widening.
- `src/compose/digest.ts:27` `import type { ClusterMarker }` — same widening.
- `src/pipeline/run.ts:76` `import { …, type ClusterMarker }` — same widening.
- `test/observability/summary.test.ts:8` `import type { ClusterMarker }` — test fixtures add `kind: 'cluster'` literal.
- `test/pipeline/clusterDetection.test.ts:8` `import type { ClusterMarker }` — same.
- `test/compose/digest.test.ts:322` `markers = [...]` literal needs `kind: 'cluster'` added.

All 8 call sites need `kind: 'cluster'` appended to existing literals (6 for tests, 2 for production emitter at `detectClusters.ts:96-101` + `deriveMarkersFromFirms` if the latter exists).

### Anti-Patterns to Avoid

- **Anti-pattern: Calling `.bodyLengthAdd(n)` per-item in a loop** — this would accumulate, not replace, breaking Recorder invariant 2. Instead record the full array once per firm at the stage boundary.
- **Anti-pattern: Computing AvgBody inside Recorder.firm() method** — stage boundary is the right place to decide "this is the final array for this run." Let toMarkdownTable compute the average at render time.
- **Anti-pattern: Adding a Layer 2 "generic boilerplate" flag to SummarizedItem runtime shape** — Layer 2 substitution produces `summary_ko === item.title` with `summaryConfidence === 'low'` and `summaryModel === <model-name>` (NOT 'skipped'). That's indistinguishable from a title-that-happens-to-match-a-real-summary unless you add a discriminator. See Pitfall: Layer 2 detection.
- **Anti-pattern: Parallel appendFile calls for table + markers block** — Pitfall 5 forbids this; existing `summary.ts:49-62` already concatenates into one payload. Preserve that discipline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Markdown table row emission" | Custom column-formatter class | Reuse `toMarkdownTable`'s template literal style at `src/observability/recorder.ts:117` | Consistency with existing row format; every existing test asserts on the exact format — new format must follow the same idiom |
| "Discriminated union runtime type guard" | `typeof marker === 'object' && 'signature' in marker` | `marker.kind === 'cluster'` vs `marker.kind === 'low-confidence'` | TypeScript's built-in narrowing on the discriminator is the standard pattern; ad-hoc property-probing breaks on future union extensions |
| "DRY_RUN output formatter for markdown" | New helper function in main.ts | `Recorder.toMarkdownTable(allFirms)` directly on the stdout sink | D-07 mandates byte-for-byte parity with what $GITHUB_STEP_SUMMARY would receive. Using the same function as writeStepSummary is the only way to guarantee that — any format drift between the two means DRY_RUN isn't actually previewing production output |
| "Re-derive cluster markers from SummarizedItem.isClusterMember flags" | Scan firms post-detect to rebuild markers | Return markers directly from detectHallucinationClusters (already done) + detectLowConfidence | This was the Phase 8 WR-01 fix — thread markers explicitly through `composeDigest(…, markers)`. Phase 10 must NOT regress to re-derivation; see test/compose/digest.test.ts:321 "markers are now threaded explicitly" |

**Key insight:** Every piece of the Phase 10 design has a reusable precedent in Phase 3 or Phase 8. The risk is creating parallel infrastructure (new helpers, new formatters) that drifts from existing patterns. Extend in place.

## Runtime State Inventory

Not applicable. Phase 10 is a greenfield feature addition — no rename, refactor, or migration. No stored data, live service config, OS-registered state, secrets, or build artifacts carry pre-existing "Phase 9 shape" that needs updating.

## Integration Points

### Recorder extension (src/observability/recorder.ts)

**Current `FirmMetrics` shape** (recorder.ts:36-42):
```typescript
export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;
  durationMs: number;
}
```

**New fields needed:**
```typescript
export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;
  durationMs: number;
  // Phase 10 additions:
  bodyLengths: number[];              // REPLACE at stage boundary; average computed at render time
  guardCount: number;                 // Union scalar: Layer 1 + Layer 2 + Layer 3
  confidenceH: number;                // post-cluster-detect tally
  confidenceM: number;
  confidenceL: number;
}
```

**New FirmRecorder fluent methods** (recorder.ts:44-50 additions):
```typescript
export interface FirmRecorder {
  fetched(n: number): FirmRecorder;
  newCount(n: number): FirmRecorder;
  summarized(n: number): FirmRecorder;
  errorClass(cls: string): FirmRecorder;
  durationMs(ms: number): FirmRecorder;
  // Phase 10:
  bodyLengths(lengths: number[]): FirmRecorder;   // REPLACE
  guardCount(n: number): FirmRecorder;             // REPLACE (caller sums before passing)
  confidence(h: number, m: number, l: number): FirmRecorder;  // REPLACE triple
}
```

**defaultMetrics update** (recorder.ts:52-60):
```typescript
function defaultMetrics(): FirmMetrics {
  return {
    fetched: 0, new: 0, summarized: 0, errorClass: null, durationMs: 0,
    bodyLengths: [],       // empty array → avgBody renders as '—' per D-02 (Fetched=0 firm)
    guardCount: 0,
    confidenceH: 0, confidenceM: 0, confidenceL: 0,
  };
}
```

### Recorder write sites (src/pipeline/run.ts)

**Site 1: Post-enrichBody, for bodyLengths** (NEW — insert after run.ts:201 `const enriched = await enrichWithBody(fetched, browser);`):
```typescript
for (const r of enriched) {
  if (r.error) continue;  // Fetched=0 firm has nothing to measure — defaultMetrics [] stays
  const lengths = r.raw.map((item) => (item.description ?? '').length);
  recorder.firm(r.firm.id).bodyLengths(lengths);
}
```

Note: This MUST happen before the existing `for (const r of deduped) { recorder.firm(r.firm.id).newCount(r.new.length); }` block at run.ts:219 so the pipeline order remains: fetch → enrich → [body-length-record] → filter → dedup → [new-count-record] → summarize.

**Site 2: Post-summarize + post-cluster-detect, for guardCount + confidence** (NEW — insert after run.ts:281 `markers = clusterResult.markers;`):
```typescript
for (const r of clusterAdjusted) {
  if (r.error) continue;

  // GUARD union: Layer 1 + Layer 2 + Layer 3
  const layer1 = r.summarized.filter((it) => it.summaryModel === 'skipped').length;
  // Layer 2 detection: summary_ko === title AND summaryModel is a Gemini model (not 'skipped' and not 'failed' and not 'cli-skipped').
  // See Pitfall: "Layer 2 detection ambiguity" for caveats.
  const layer2 = r.summarized.filter((it) =>
    it.summary_ko === it.title
    && it.summaryModel !== 'skipped'
    && it.summaryModel !== 'failed'
    && it.summaryModel !== 'cli-skipped'
  ).length;
  const layer3 = r.summarized.filter((it) => it.isClusterMember === true).length;
  recorder.firm(r.firm.id).guardCount(layer1 + layer2 + layer3);

  // Confidence distribution — AFTER cluster detection so Layer-3 demotes land in L
  const h = r.summarized.filter((it) => it.summaryConfidence === 'high').length;
  const m = r.summarized.filter((it) => it.summaryConfidence === 'medium').length;
  const l = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
  recorder.firm(r.firm.id).confidence(h, m, l);
}
```

**Site 3: Low-confidence marker generation** (NEW — insert right after site 2):
```typescript
const lowConfMarkers = detectLowConfidence(clusterAdjusted);
markers = [...markers, ...lowConfMarkers];
```

### `toMarkdownTable` 9-column rewrite (recorder.ts:109-120)

**Current 6-column** (from recorder.ts:110-111):
```
'| Firm | Fetched | New | Summarized | Errors | Duration |'
'|------|--------:|----:|-----------:|--------|---------:|'
```

**Phase 10 9-column** (per D-01, note `Summ` abbreviation to keep row-width sensible):
```
'| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |'
'|------|--------:|----:|-----:|--------|---------:|--------:|------:|------:|'
```

**Per-row formatting:**
```typescript
const rows = firms
  .filter((f) => f.enabled)
  .map((f) => {
    const m = this.metrics.get(f.id) ?? defaultMetrics();
    const err = m.errorClass ?? '—';

    // AvgBody: integer average, '—' when no body lengths recorded (Fetched=0 firm per D-02)
    const avgBody = m.bodyLengths.length === 0
      ? '—'
      : Math.round(m.bodyLengths.reduce((s, x) => s + x, 0) / m.bodyLengths.length).toString();

    // GUARD / H/M/L: '—' on Fetched=0 firm (user discretion in CONTEXT.md)
    const isEmptyFirm = m.fetched === 0 && m.bodyLengths.length === 0;
    const guard = isEmptyFirm ? '—' : m.guardCount.toString();
    const hml = isEmptyFirm ? '—' : `${m.confidenceH}/${m.confidenceM}/${m.confidenceL}`;

    return `| ${f.name} | ${m.fetched} | ${m.new} | ${m.summarized} | ${err} | ${m.durationMs}ms | ${avgBody} | ${guard} | ${hml} |`;
  });
```

**Test impact (src/test/observability/recorder.test.ts):** Every existing test that asserts on the 6-column header row (line 75, 77, 85, 93, 133-134) needs updating. The `disabled-firm filter` test (line 96-111) MUST still pass — new columns inherit the existing `firms.filter((f) => f.enabled)` at line 113.

### `DataQualityMarker` type widening (src/pipeline/detectClusters.ts)

**Current** (detectClusters.ts:38-43):
```typescript
export interface ClusterMarker {
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}
```

**Phase 10** (keep file name; add discriminator + new interface + union alias):
```typescript
export interface ClusterMarker {
  kind: 'cluster';     // NEW
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}

export interface LowConfidenceMarker {
  kind: 'low-confidence';
  firmId: string;
  firmName: string;     // keep firmName at same shape as ClusterMarker so template/summary code doesn't branch on shape
  lowCount: number;
  totalCount: number;
}

export type DataQualityMarker = ClusterMarker | LowConfidenceMarker;
```

**Emitter update** (detectClusters.ts:97-102):
```typescript
markers.push({
  kind: 'cluster',    // NEW
  firmId: r.firm.id,
  firmName: r.firm.name,
  count: group.length,
  signature: sig,
});
```

**Backward compat note:** `signature` field is unique to `ClusterMarker` and NOT on `LowConfidenceMarker`. Any consumer that accesses `marker.signature` directly (without `kind` narrowing) will need a TS error resolution — search is necessary. Verified callers of `.signature`: `console.error` at detectClusters.ts:118 (inside cluster-branch, safe). No other accesses found — grep `\.signature` in src/ returns only detectClusters.ts self-reference + scrapers/sitemap.ts which is unrelated.

### Low-confidence detector (src/pipeline/detectLowConfidence.ts — NEW)

**Recommended shape** (mirrors detectHallucinationClusters signature pattern):
```typescript
import type { FirmResult } from '../types.js';
import type { LowConfidenceMarker } from './detectClusters.js';

const LOW_CONF_THRESHOLD = 0.5;   // D-04
const MIN_TOTAL_FLOOR = 3;         // D-04 — sparse firm protection

/**
 * Pure function. For each firm with error=undefined AND totalCount >= 3,
 * emit a LowConfidenceMarker when lowCount / totalCount >= 0.5.
 *
 * IMPORTANT: run AFTER detectHallucinationClusters so Layer-3 demoted items
 * count as 'low' (per Phase 10 Pitfall: confidence timing).
 *
 * D-04: NO cluster suppression — a firm can fire BOTH cluster marker AND
 * low-confidence marker (cluster is a subset signal; low-confidence is a
 * superset). Emitting both is by-design per layered detection.
 */
export function detectLowConfidence(firms: FirmResult[]): LowConfidenceMarker[] {
  const markers: LowConfidenceMarker[] = [];
  for (const r of firms) {
    if (r.error) continue;
    const total = r.summarized.length;
    if (total < MIN_TOTAL_FLOOR) continue;
    const low = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
    if (low / total >= LOW_CONF_THRESHOLD) {
      markers.push({
        kind: 'low-confidence',
        firmId: r.firm.id,
        firmName: r.firm.name,
        lowCount: low,
        totalCount: total,
      });
    }
  }
  return markers;
}
```

**No stderr emission.** Unlike `detectHallucinationClusters` which logs `HALLUCINATION_CLUSTER_DETECTED` to stderr per cluster (detectClusters.ts:118), the low-confidence signal is quieter — existence in the step-summary + email footer is sufficient. This is consistent with the D-10 user preference (aggressive detection) balanced with the D-05 "footer is the primary alarm surface" rule.

### `renderDataQualityFooter` switch (src/compose/templates.ts)

**Current** (templates.ts:207-221):
```typescript
function renderDataQualityFooter(markers: ClusterMarker[]): string {
  if (markers.length === 0) return '';
  const items = markers
    .map(
      (m) =>
        `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): HALLUCINATION_CLUSTER_DETECTED (${m.count} items, 요약 숨김)</li>`,
    )
    .join('');
  return `<footer …>…<ul>${items}</ul></footer>`;
}
```

**Phase 10 widened** (switch on marker.kind):
```typescript
function renderDataQualityFooter(markers: DataQualityMarker[]): string {
  if (markers.length === 0) return '';
  const items = markers
    .map((m) => {
      if (m.kind === 'cluster') {
        return `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): HALLUCINATION_CLUSTER_DETECTED (${m.count} items, 요약 숨김)</li>`;
      }
      // m.kind === 'low-confidence' (exhaustiveness narrows)
      return `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): ${m.lowCount}/${m.totalCount} items 품질 의심 (confidence=low 과반)</li>`;
    })
    .join('');
  return `<footer …>…<ul>${items}</ul></footer>`;
}
```

XSS posture preserved (every user-derived string passes through `escapeHtml`). Numbers (`lowCount`, `totalCount`) are integers so they don't need escaping.

### `writeStepSummary` marker switch (src/observability/summary.ts)

**Current** (summary.ts:51-59):
```typescript
if (markers.length > 0) {
  const lines = markers
    .map(
      (m) => `- **${m.firmId}**: HALLUCINATION_CLUSTER_DETECTED — ${m.count} items demoted`,
    )
    .join('\n');
  payload += `\n## ⚠ Data Quality Warnings\n\n${lines}\n`;
}
```

**Phase 10 widened** (match D-05 example rows verbatim):
```typescript
if (markers.length > 0) {
  const lines = markers
    .map((m) => {
      if (m.kind === 'cluster') {
        return `- **${m.firmId}**: HALLUCINATION_CLUSTER_DETECTED — ${m.count}개 항목 demote됨`;
      }
      return `- **${m.firmId}**: ${m.lowCount}/${m.totalCount} items 품질 의심 (confidence=low 과반)`;
    })
    .join('\n');
  payload += `\n## ⚠ Data Quality Warnings\n\n${lines}\n`;
}
```

**Single-appendFile preserved** — the concatenation into one `payload` string before the `await appendFile(path, payload, 'utf8')` at summary.ts:62 stays. Pitfall 5 satisfied.

Note: The existing test at test/observability/summary.test.ts:102-103 asserts the *exact* old format (`HALLUCINATION_CLUSTER_DETECTED — 5 items demoted`). Phase 10 changes this wording to match D-05's Korean form. That test needs updating. See Test Strategy §.

### DRY_RUN emission site (src/main.ts or a new boundary — see Pitfall)

**Current sanctioned DRY_RUN sites** (per Pattern 2):
1. `src/mailer/gmail.ts:50` — `if (isDryRun()) { console.log('[DRY_RUN] Subject:', …); console.log('[DRY_RUN] HTML body:\n', …); return; }`
2. `src/state/writer.ts:130` — `if (isDryRun()) { … console.log('[DRY_RUN] would write …'); return; }`
3. `src/archive/writer.ts:60` — `if (isDryRun()) { console.log('[DRY_RUN] would write archive …'); return filePath; }`

**Phase 10 DQOBS-03 requires a fourth DRY_RUN-aware output.** Two candidate sites:

**Option A (recommended): main.ts after runPipeline returns**
- Expose `markers: DataQualityMarker[]` on `RunReport` (new field — backward-compat optional)
- Expose `firms: FirmConfig[]` on `RunReport` (already flows via the Recorder internally — can add a field or read via the `allFirms` param that the Recorder already filters by)
- In main.ts (after `const report = await runPipeline({});` at main.ts:87), add:
```typescript
if (isDryRun()) {
  const table = report.recorder.toMarkdownTable(report.firms /* or pass via allFirms */);
  console.log('[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):');
  console.log(table);
  if (report.markers.length > 0) {
    // Reuse the SAME line-builder as writeStepSummary — extract to a shared helper
    // in src/observability/summary.ts (e.g. `renderMarkersMarkdown(markers): string`)
    // so the DRY_RUN stdout and GHA step-summary are byte-for-byte identical.
    console.log(renderMarkersMarkdown(report.markers));
  }
}
```
- **Pro:** Zero new DRY_RUN check site inside deep modules (main.ts is the entry point, not a module). Keeps Pattern 2 posture clean. Matches D-08 (stdout only, no file write).
- **Con:** Requires adding `markers` + `firms` (or `allFirms`) to `RunReport`. Small API surface change.

**Option B: Branch inside writeStepSummary**
- `writeStepSummary` checks `isDryRun()` — if true, emits to stdout; if false, emits to $GITHUB_STEP_SUMMARY as today.
- **Pro:** Zero RunReport shape change.
- **Con:** Violates Pattern 2 "three sanctioned sites" — Phase 10 would introduce a fourth site inside an observability module. This is a real Pattern 2 regression and would need a Phase 10 CONTEXT-level exception.

**Recommendation: Option A.** Main.ts is the entry point where side-effects orchestration belongs, and adding `markers` + `firms` to RunReport is a strict superset of the existing `recorder` field already exposed. Pattern 2 stays intact.

**Byte-for-byte parity requirement:** the markers block renderer MUST be a shared function between `writeStepSummary` (GHA path) and main.ts DRY_RUN emission (stdout path). Recommended: extract the marker-rendering block from summary.ts:51-59 into an exported `renderMarkersMarkdown(markers: DataQualityMarker[]): string` and reuse in both sites. This is the only mechanism that enforces D-07's "zero divergence" guarantee through code-level structure, not discipline.

### Helper function: `renderMarkersMarkdown` (new export in src/observability/summary.ts)

```typescript
/**
 * Phase 10 D-07: shared renderer so DRY_RUN stdout output at main.ts and
 * $GITHUB_STEP_SUMMARY append at writeStepSummary are byte-for-byte identical.
 * Returns an empty string when markers is empty (D-15 clean-run invisibility).
 */
export function renderMarkersMarkdown(markers: DataQualityMarker[]): string {
  if (markers.length === 0) return '';
  const lines = markers
    .map((m) => {
      if (m.kind === 'cluster') {
        return `- **${m.firmId}**: HALLUCINATION_CLUSTER_DETECTED — ${m.count}개 항목 demote됨`;
      }
      return `- **${m.firmId}**: ${m.lowCount}/${m.totalCount} items 품질 의심 (confidence=low 과반)`;
    })
    .join('\n');
  return `\n## ⚠ Data Quality Warnings\n\n${lines}\n`;
}
```

## Common Pitfalls

### Pitfall 1: Layer 2 detection ambiguity — `summary_ko === title` may fire on non-Layer-2 items

**What goes wrong:** Layer 2 is the branch where Gemini recognized generic boilerplate and returned empty string, and the caller (gemini.ts:106-112) substitutes `summary_ko: item.title`. The resulting SummarizedItem has `summaryModel: <model-name>` (NOT 'skipped', NOT 'failed') and `summaryConfidence: 'low'` forced. If Phase 10 counts GUARD Layer 2 via `summary_ko === title`, it may also match:
- A legitimately-short summary that happens to equal the title (unlikely but possible)
- Summarize errors that the Phase 8 D-08 fix repurposed to title-verbatim (Phase 8 RESEARCH "Open-Q #2 resolution" — but those have `summaryModel === 'failed'`, caught by the explicit exclusion)

**Why it happens:** No explicit discriminator exists on SummarizedItem for "Gemini returned empty → title substituted." The three distinct title-verbatim code paths are:
1. Layer 1 short-circuit: `summaryModel === 'skipped'` (run.ts:258)
2. Layer 2 Gemini empty-string: `summaryModel === <model>` (gemini.ts:111)
3. Post-fail catch: `summaryModel === 'failed'` (gemini.ts:151)

**How to avoid:**
- **Option A (simplest, recommended):** Use `(summaryModel !== 'skipped' && summaryModel !== 'cli-skipped' && summaryModel !== 'failed' && summary_ko === title)` as the Layer 2 discriminator. False positives are rare (Korean legal summary equaling the Korean title exactly is very unusual). Document the heuristic in the code comment.
- **Option B (more robust, adds API surface):** Extend `SummarizedItem` with `summaryWasBoilerplate?: true` flag set in gemini.ts:106-112. Then Layer 2 count is `filter(it => it.summaryWasBoilerplate === true)`. Cleaner but adds a runtime-only field (ensure state/writer.ts does not persist it — COMP-05 invariant mirror).

**Warning signs:** The GUARD column jumping unexpectedly high on a firm that shows no obvious quality issues — investigate whether the summarize path made a legitimate short summary that accidentally matched the title.

**Recommendation for planner:** Pick Option A for v1.1 (one plan's worth of work); revisit if false positives observed in production.

### Pitfall 2: Confidence tally timing — Layer 3 cluster demotes MUST be counted post-detect

**What goes wrong:** If the H/M/L tally runs BEFORE `detectHallucinationClusters`, a firm with 3 cluster-demoted items shows H/M/L = 3/0/0 (their pre-demote confidence). After detect, those same items have confidence='low', so the correct tally is 0/0/3.

**Why it happens:** `detectHallucinationClusters` returns a NEW FirmResult[] with the demoted items (detectClusters.ts:137 `return { ...r, summarized: demoted };`). Tallying against `summarized` (pre-detect result) vs `clusterAdjusted` (post-detect result) gives different answers.

**How to avoid:** Place the confidence tally site AFTER run.ts:279-281 (`const clusterResult = detectHallucinationClusters(summarized); const clusterAdjusted = clusterResult.firms; markers = clusterResult.markers;`) and iterate `clusterAdjusted`, not `summarized`.

**Warning signs:** Test case — a cluster-triggering firm shows H=3 in a scenario where all 3 items are cluster members. If that's observed, the tally is running pre-detect.

### Pitfall 3: Pitfall 5 regression — new appendFile if payload assembly splits

**What goes wrong:** If the Phase 10 marker rendering is added as a SECOND `appendFile` call after the existing table-append, a failure between the two calls leaves a partial file. Phase 3 Pitfall 5 explicitly forbids this.

**Why it happens:** Naive extension pattern — "add a new marker block, use a new appendFile call."

**How to avoid:** Current summary.ts:49-62 uses ONE `payload` string and ONE `await appendFile(path, payload, 'utf8')`. Phase 10 must preserve this. The locked pattern is:
```typescript
let payload = table + '\n';
if (markers.length > 0) {
  payload += renderMarkersMarkdown(markers);   // CONCATENATE, don't appendFile
}
await appendFile(path, payload, 'utf8');        // ONE call
```

**Warning signs:** test/observability/summary.test.ts:137-158 "Pitfall 5: SINGLE appendFile call for table + markers" will catch this regression — if it passes after Phase 10 code changes, the discipline is preserved. The plan-check verifier should also assert `grep -c "await appendFile" src/observability/summary.ts === 1`.

### Pitfall 4: Mid-stage throw honesty — AvgBody must not back-fill

**What goes wrong:** If `enrichWithBody` throws mid-firm (e.g., enrichment of firm 3 fails after firm 1 and firm 2 have recorded body lengths), the finally-block `writeStepSummary` at run.ts:351 emits whatever state the Recorder has. Phase 3 Pitfall 6 mandates this be an HONEST snapshot — firm 1 and firm 2 show real AvgBody values, firm 3 shows `—` (empty bodyLengths array, Fetched=0 or partial).

**Why it happens:** Temptation to retroactively compute "what would the average have been if the full enrichment completed" — wrong. The snapshot is whatever the Recorder observed.

**How to avoid:** The recommended Recorder pattern (store `number[]` and average at render time) makes this trivially correct — a never-called `.bodyLengths([…])` leaves the array as `[]`, and toMarkdownTable renders `—` via the `bodyLengths.length === 0` guard. No special logic needed.

**Warning signs:** A test scenario where `enrichWithBody` is mocked to throw after recording 2 firms — the 3rd firm's AvgBody should be `—`, not 0 or a backfilled estimate.

### Pitfall 5: Disabled-firm filter must cover new columns

**What goes wrong:** `Recorder.toMarkdownTable` already filters `firms.filter((f) => f.enabled)` at recorder.ts:113 — disabled firms (lee-ko, yoon-yang, latham per Phase 2 D-P2-14) don't render. But a naive extension that adds rows to the table *before* the filter would leak disabled firms into the new columns.

**Why it happens:** Extension code sometimes adds new rendering logic in a parallel path. Stay inside the existing `.map((f) => { … })` at recorder.ts:114 — it's already post-filter.

**How to avoid:** Add new column rendering inside the existing `.map((f) => { ... })` template literal at recorder.ts:114-118. Don't add a separate loop.

**Warning signs:** test/observability/recorder.test.ts:96-111 "skips firms where enabled: false" will catch this if the new column rendering loops over unfiltered firms.

### Pitfall 6: UTF-16 surrogate pairs on body.length

**What goes wrong:** `String.prototype.length` returns UTF-16 code units. Emoji and non-BMP characters (rare in legal newsletters but possible in modern firm content) count as 2. `'😀'.length === 2` not 1. This is the same concern as Phase 8 RESEARCH line 89: "BMP Hangul is 1 code unit per syllable" — Korean is safe, but emoji in firm bodies would inflate the count.

**Why it happens:** Body text rarely contains non-BMP characters in legal content, but a copy-pasted tweet or emoji-laden marketing post could distort the signal.

**How to avoid:** Accept UTF-16 as the locked semantic per D-02. Document in AvgBody column comment that "lengths are UTF-16 code units, matching `String.prototype.length`; surrogate pairs count as 2." Do NOT switch to `Array.from(str).length` (code-point count) — the extra complexity isn't worth it and the bias is statistically negligible for legal firm bodies.

**Warning signs:** A firm's AvgBody suddenly spiking on a single emoji-heavy article. Visual inspection will surface it; no automated defense recommended.

### Pitfall 7: `summaryConfidence` undefined when no Gemini call — does this surface?

**What goes wrong:** Could `summaryConfidence` ever be `undefined` at the tally site? Checking types.ts:87-91:
```typescript
export interface SummarizedItem extends NewItem {
  summary_ko: string | null;
  summaryConfidence: 'high' | 'medium' | 'low';    // REQUIRED, not optional
  summaryModel: string;
  ...
}
```
Required field — never undefined at the type level. Every code path that produces a `SummarizedItem` supplies it:
- run.ts:241 `summaryConfidence: 'low' as const` (cli-skipped)
- run.ts:257 `summaryConfidence: 'low' as const` (Layer 1)
- gemini.ts:117 `summaryConfidence: parsed.confidence` (Gemini success)
- gemini.ts:110 `summaryConfidence: 'low' as const` (Layer 2)
- gemini.ts:150 `summaryConfidence: 'low'` (catch block)

**Conclusion:** No defensive `?? 'low'` needed. If a future regression introduces an undefined path, TypeScript will catch it at compile time.

### Pitfall 8: Marker overlap — cluster-triggering firm may also fire low-confidence

**What goes wrong:** A firm with 5 items all in a cluster will have:
- 1 ClusterMarker (count=5)
- Also 5/5 items at confidence='low' post-demote → satisfies 50% threshold with N≥3 → 1 LowConfidenceMarker (5/5)

Both markers render, appearing redundant.

**Why it happens:** Layered detection — cluster is a subset of "low-confidence firm," by design. CONTEXT.md D-03/D-04 does not say to suppress one when the other fires.

**How to avoid (open question for planner):**
- **Option 1 (strict reading of CONTEXT.md):** Emit both. The email/step-summary will show one cluster warning and one low-confidence warning for the same firm. This is explicit information.
- **Option 2 (suppression):** In `detectLowConfidence`, skip firms that have a ClusterMarker. Requires passing `existingClusterFirmIds: Set<string>` into the detector. More info-dense but less duplicate.

**Recommendation for planner:** Option 1 per D-04 literal reading — no suppression clause exists. The plan should explicitly call this out in a note so a future reader doesn't mistake it for a bug.

**Warning signs:** Test case for a 5-item cluster firm should assert both markers fire (not one).

### Pitfall 9: `RunReport` backward compat when exposing markers + firms

**What goes wrong:** `RunReport` is exported from run.ts:103-111 and consumed in main.ts:87. Adding required fields (`markers`, `firms`) could break any external callers.

**Why it happens:** New fields to pass DRY_RUN data out of runPipeline.

**How to avoid:** Make new fields required (not optional) since every real code path produces them. Verify with `grep -rn 'RunReport\b' src/ test/`:
- `src/pipeline/run.ts:103` (definition)
- `src/main.ts:87` (only consumer)
- `test/pipeline/run.test.ts:290-305` (test assertions)

Only 1 production consumer (`main.ts`) + 1 test file. Adding required fields is safe — both call sites can be updated in the same plan.

### Pitfall 10: `writeStepSummary` current test uses old wording — plan must update D-05 string

**What goes wrong:** `test/observability/summary.test.ts:102` asserts:
```typescript
expect(content).toContain('- **bkl**: HALLUCINATION_CLUSTER_DETECTED — 5 items demoted');
```

D-05 locks the new wording to `3개 항목 demote됨` (Korean). This test WILL break on Phase 10 code changes unless updated.

**Why it happens:** Phase 8 used English ("items demoted"); D-05 shifts to Korean ("개 항목 demote됨") to align with the email footer aesthetic.

**How to avoid:** Phase 10 plan must include updating test/observability/summary.test.ts:102-103 wording. Also the email-side test test/compose/digest.test.ts:338 current assertion `HALLUCINATION_CLUSTER_DETECTED (5 items, 요약 숨김)` stays consistent with the email-side rendering which is unchanged.

Note: D-05 specifies step-summary row format for cluster markers: `- bkl: HALLUCINATION_CLUSTER_DETECTED — 3개 항목 demote됨`. Verify whether `**bkl**` bold-markdown stays (D-05 shows plain `bkl`) — **this is a minor format nit requiring planner clarification: bold the firmId in markdown or leave plain?** Recommendation: keep **bold** per existing Phase 8 convention at summary.ts:55; D-05 appeared to drop the bold for brevity but the planner should re-assert.

**Resolution (2026-04-21):** RESOLVED. Plans 10-02 Task 3 keep the bold `**firmId**` form. D-05's plain example (`- bkl:`) is illustrative, not prescriptive — the existing Phase 8 convention at `src/observability/summary.ts:55` is preserved for both cluster and low-confidence row kinds, giving readability consistency across the two marker types. The `renderMarkersMarkdown` helper (Plan 10-02 Task 3 Step 1.1) emits `- **${m.firmId}**: ...` for both branches. Open Question #1 below is closed by this resolution.

### Pitfall 11: Test environment — GEMINI_API_KEY stubbing required if low-confidence test exercises summarize path

**What goes wrong:** Any Phase 10 test that imports `summarize()` from gemini.ts (even transitively) without stubbing `GEMINI_API_KEY` will throw `AbortError('GEMINI_API_KEY is not set …')` per gemini.ts:85-89. This was added in commit `344b65d`.

**Why it happens:** Local dev safety check surfaces when tests run without dotenv loading.

**How to avoid:** Follow the pattern established in commit `0493c5a`:
```typescript
beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
```
Phase 10 unit tests for `detectLowConfidence` are PURE (operate on FirmResult[] fixtures) and do NOT need the stub. Only tests that drive runPipeline end-to-end need it — see `test/pipeline/run.test.ts:184` `vi.unstubAllEnvs()` afterEach.

## Code Examples

### Example 1: Layer 2 detection (post-summarize, per-firm)

```typescript
// Source: derived from src/pipeline/run.ts post-cluster-detect insertion point (after line 281)
// Count Layer 2 (Gemini returned empty → title-verbatim substituted).
// Discriminator heuristic per Pitfall 1 Option A:
const layer2 = r.summarized.filter((it) =>
  it.summary_ko === it.title
  && it.summaryModel !== 'skipped'       // Layer 1 — already counted
  && it.summaryModel !== 'failed'         // post-fail catch branch — not Layer 2
  && it.summaryModel !== 'cli-skipped'    // debug CLI path — not a guard trigger
).length;
```

### Example 2: Discriminated union switch (renderDataQualityFooter)

```typescript
// Source: src/compose/templates.ts#renderDataQualityFooter after Phase 10 widening
function renderDataQualityFooter(markers: DataQualityMarker[]): string {
  if (markers.length === 0) return '';
  const items = markers
    .map((m) => {
      if (m.kind === 'cluster') {
        return `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): HALLUCINATION_CLUSTER_DETECTED (${m.count} items, 요약 숨김)</li>`;
      }
      // m.kind === 'low-confidence' narrowed by exhaustiveness
      return `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): ${m.lowCount}/${m.totalCount} items 품질 의심 (confidence=low 과반)</li>`;
    })
    .join('');
  return `<footer style="margin-top:32px;color:#999;font-size:12px;">
  <div>⚠ 데이터 품질 경고 — 요약 신뢰도 의심:</div>
  <ul style="margin:4px 0;">${items}</ul>
</footer>`;
}
```

### Example 3: toMarkdownTable 9-column row

```typescript
// Source: src/observability/recorder.ts#toMarkdownTable after Phase 10 widening
const avgBody = m.bodyLengths.length === 0
  ? '—'
  : Math.round(m.bodyLengths.reduce((s, x) => s + x, 0) / m.bodyLengths.length).toString();
const isEmptyFirm = m.fetched === 0 && m.bodyLengths.length === 0;
const guard = isEmptyFirm ? '—' : m.guardCount.toString();
const hml = isEmptyFirm ? '—' : `${m.confidenceH}/${m.confidenceM}/${m.confidenceL}`;

return `| ${f.name} | ${m.fetched} | ${m.new} | ${m.summarized} | ${err} | ${m.durationMs}ms | ${avgBody} | ${guard} | ${hml} |`;
```

### Example 4: DRY_RUN emission (main.ts post-runPipeline)

```typescript
// Source: proposed src/main.ts addition after line 87
import { isDryRun } from './env.js';
import { renderMarkersMarkdown } from './observability/summary.js';

// ... after const report = await runPipeline({});

if (isDryRun()) {
  const table = report.recorder.toMarkdownTable(report.firms);
  console.log('[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):');
  console.log(table);
  const markersBlock = renderMarkersMarkdown(report.markers);
  if (markersBlock.length > 0) {
    console.log(markersBlock.trimEnd());   // trim trailing \n to avoid double blank line
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Step-summary 6-col (Firm/Fetched/New/Summ/Errors/Duration) | 9-col adding AvgBody/GUARD/H/M/L | Phase 10 (this phase) | Operator sees body-quality signal at-a-glance in GHA UI |
| `ClusterMarker[]` only for data-quality footer | `DataQualityMarker[]` discriminated union for layered detection | Phase 10 | Single footer handles multiple signal types; low-confidence adds to existing surface |
| No DRY_RUN preview of step-summary | DRY_RUN emits byte-for-byte identical stdout via shared renderMarkersMarkdown helper | Phase 10 | Operator can verify observability output before unpausing cron (RESUME-01 prerequisite) |

**Deprecated/outdated:** None — Phase 10 is strictly additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Layer 2 detection via `summary_ko === title && summaryModel` discriminator suffices for v1.1 | Pitfall 1 | Over/undercounting GUARD — fallback is to add explicit `summaryWasBoilerplate` flag. Mitigated by Option B available. |
| A2 | No external caller of `ClusterMarker` exists outside the 8 grep-verified sites | Pattern 2 migration | A missed caller produces a compile error on union widening — TypeScript catches it. Low risk. |
| A3 | `summaryConfidence` is never undefined at tally site | Pitfall 7 | Defensive `?? 'low'` would be needed — would produce silent bias toward L. Mitigated: types.ts:89 makes it required. |
| A4 | Array-of-lengths approach cleaner than running sum+count | Standard Stack Alternatives | Running sum+count saves memory but requires divide-by-zero guard. Both are correct; trivial tradeoff. |
| A5 | Option A (marker suppression off) is correct interpretation of D-04 | Pitfall 8 | If user actually wants suppression, plan-check or discuss-phase would surface this before execution. Low risk; explicit D-04 reading supports no-suppression. |
| A6 | Planner can reasonably pick main.ts-as-emission-site (Option A) without re-opening CONTEXT.md | DRY_RUN Integration Points | If planner prefers Option B (writeStepSummary branch), Pattern 2 exception needs discussion — one iteration cost. |

## Open Questions

1. **Markdown row format — bold firmId or plain?** (Pitfall 10)
   - What we know: Phase 8 current code at summary.ts:55 uses `**${m.firmId}**`. CONTEXT.md D-05 example uses plain `bkl:` (no bold). Test test/observability/summary.test.ts:102 asserts bold.
   - What's unclear: Is D-05's plain-text example prescriptive or illustrative?
   - Recommendation: Keep **bold** per existing convention; the D-05 example appears illustrative rather than a format mandate. Test passes on minimal change. Planner confirm.

2. **Step-summary `Korean vs English` wording for cluster marker** (Pitfall 10)
   - What we know: D-05 shifts cluster marker row from `5 items demoted` (English, current Phase 8) to `3개 항목 demote됨` (mixed Korean). Email footer at templates.ts:214 uses `(5 items, 요약 숨김)` (English count + Korean parenthetical).
   - What's unclear: Is the inconsistency intentional (step-summary = mixed; email = English-heavy)?
   - Recommendation: Honor D-05 verbatim for step-summary. Email side stays per templates.ts:214 unchanged (Phase 8 D-14 locked).

3. **DRY_RUN emission site — main.ts vs writeStepSummary branch?** (Integration Points)
   - What we know: Pattern 2 prefers sanctioned sites. main.ts is not a module; adding DRY_RUN there doesn't violate Pattern 2. writeStepSummary branch would add a fourth check site inside an observability module.
   - What's unclear: Would planner prefer the smaller API change (Option B) at the cost of Pattern 2 discipline?
   - Recommendation: **Option A.** Plan that exposes `markers` + `firms` on RunReport and emits from main.ts. Discuss-phase left this as Claude's discretion ("reuse existing functions with console.log destination" at CONTEXT.md line 112).

4. **Marker overlap suppression — cluster firm also firing low-confidence marker?** (Pitfall 8)
   - What we know: CONTEXT.md D-04 specifies the low-confidence threshold (`lowCount / totalCount >= 0.5 AND totalCount >= 3`) but does NOT mention suppression.
   - What's unclear: Strictly additive (both markers fire) vs suppression (skip LCM if firm already has CM).
   - Recommendation: Emit both (Option 1 — strict D-04 reading). Plan should call this out so reviewer doesn't mistake it for a bug.

## Environment Availability

Not applicable. Phase 10 is pure in-repo code change — no external tool/service dependencies beyond what's already installed (Node 22 LTS, vitest, TypeScript 5.x — all used by existing Phase 1-9 code).

## Project Constraints (from CLAUDE.md)

| Constraint | Impact on Phase 10 |
|------------|-------------------|
| **$0/month budget, $20 Claude Pro + $20 ChatGPT Plus only** | No external metric store (rules out Datadog, Honeycomb). Snapshot-only observability preserved. |
| **Node.js 22 LTS, TypeScript 5.7.x, tsx runner** | Type-level discriminated union widening is zero-runtime-cost. TS 5.x exhaustiveness narrowing on `marker.kind` works as expected. |
| **pnpm 9.x, ESM, no build step** | No bundler changes needed — file additions are picked up at next `pnpm tsx src/main.ts` invocation. |
| **Secrets never in repo** | No new secrets. DQOBS-01/02/03 read existing state only (FirmResult shape), no external API calls. |
| **GitHub Actions cron-only execution** | DQOBS metrics computed in-process during the single cron run. No background worker. No persisted time-series. Enables DQOBS-03 DRY_RUN parity for operator diagnostics. |
| **Scraping politeness (1 req/firm/day)** | No new outbound HTTP. Phase 10 is observability-only — reads already-fetched state. |
| **Gemini free-tier rate limits (10 RPM / 250 RPD on 2.5-flash)** | No new Gemini calls. Phase 10 does NOT touch summarize.ts beyond a possible Layer-2 discriminator addition (Pitfall 1 Option B — deferred recommendation). |
| **GSD workflow (no edits outside a GSD command)** | This RESEARCH.md produced by `/gsd-plan-phase`-integrated flow; plan + execution steps follow. Direct edits forbidden. |

## Test Strategy Hints

### Nearest-neighbor test files to mirror

| New/Changed test | Mirror pattern | Why |
|------------------|----------------|-----|
| `test/observability/recorder.test.ts` (MODIFY) | Existing file — keep all invariant tests; update header assertions to 9-col + add 3 new-method tests (`bodyLengths`, `guardCount`, `confidence`) + 3 render-path tests (AvgBody integer, `—` on Fetched=0, H/M/L format) | Same file, strict superset of existing assertions |
| `test/observability/summary.test.ts` (MODIFY) | Existing file — update wording at line 102-103 for new Korean cluster marker format + add 2 new tests for low-confidence marker rendering (kind='low-confidence' renders "`4/6 items 품질 의심`" line; empty markers still omits section) | Same file, test for Pitfall 5 (line 137-158) stays green |
| `test/pipeline/detectLowConfidence.test.ts` (NEW) | `test/pipeline/clusterDetection.test.ts` (pattern 1:1) | Pure function with 3-5 boundary tests: N=2 no fire, N=3 no fire (1/3), N=3 fires (2/3), N=6 fires (3/6), errored firm skipped, summary_ko===null items NOT excluded (they count to totalCount), overlap with cluster detector preserved |
| `test/pipeline/run.test.ts` (MODIFY) | Existing file pattern at line 260-279 ("Recorder is threaded and toMarkdownTable reflects metrics") | Add tests for end-to-end GUARD + H/M/L + low-confidence marker surfacing + DataQualityMarker[] merging |
| `test/compose/digest.test.ts` (MODIFY) | Line 309 "Phase 8 D-14: renderDataQualityFooter emits ⚠ 데이터 품질 경고 footer" | Add new test at same block: low-confidence marker via composeDigest(…, markers=[{kind:'low-confidence',…}]) renders "4/6 items 품질 의심" string |

### Assertion style

- **Markdown table:** Use `.toContain('| Cooley | 12 | 3 | 3 | — | 1247ms | 1234 | 2 | 5/1/0 |')` for exact row assertions; split on `\n` for header assertion (mirrors recorder.test.ts:73-77 style).
- **Marker rendering:** Use `.toContain('HALLUCINATION_CLUSTER_DETECTED')` + `.toContain('품질 의심 (confidence=low 과반)')` for resilient substring matching. Avoid `.toBe` on full HTML blobs except snapshots.
- **Snapshots:** `toMatchSnapshot('digest-with-low-confidence-marker')` for email side — existing pattern at digest.test.ts:254.
- **Environment stubbing:** Any test that touches `runPipeline` end-to-end needs `vi.stubEnv('GEMINI_API_KEY', 'test-stub')` in beforeEach + `vi.unstubAllEnvs()` in afterEach (per commit `0493c5a` pattern, also present at run.test.ts:184 and summary.test.ts:30).
- **Threshold boundaries (critical):**
  - N=2 low/N=2 total (100%) → NO marker (below floor)
  - N=3 low/N=3 total (100%) → marker fires
  - N=2 low/N=3 total (66.7%) → marker fires
  - N=1 low/N=3 total (33.3%) → NO marker (below 50%)
  - N=3 low/N=6 total (50%) → marker fires (boundary inclusive)
  - N=2 low/N=5 total (40%) → NO marker (below 50%)

### Zero-body edge case (mid-stage throw honesty test)

- Synthesize a firm where `enrichWithBody` mock throws AFTER the body-length write site would have recorded firm A's lengths but BEFORE firm B.
- Assert `toMarkdownTable(allFirms)` renders firm A's real average and firm B's `—`.
- This locks in Pitfall 4 and Pitfall 6 (mid-stage throw honesty).

## Plan Breakdown Recommendation

The planner may shape tasks however best fits, but the research suggests three plans clustered by coupling:

### Plan 10-01: Recorder 9-column extension (D-01, D-02, D-06 wiring)
- **Scope:** Widen FirmMetrics, add 3 FirmRecorder methods, rewrite toMarkdownTable, add 3 write-sites in run.ts (body lengths after enrichBody; guardCount + confidence after cluster-detect).
- **Files:** `src/observability/recorder.ts`, `src/pipeline/run.ts` (write-sites only — no marker logic), `test/observability/recorder.test.ts`, `test/pipeline/run.test.ts` (assertions only).
- **Deps:** none (this is the foundation).
- **Verification:** Existing 6-col tests pass after migration to 9-col; disabled-firm filter intact; mid-stage-throw honesty preserved.

### Plan 10-02: DataQualityMarker union + low-confidence detector (D-03, D-04, D-05)
- **Scope:** Widen ClusterMarker to union, create detectLowConfidence.ts, update detectClusters.ts emitter, update renderDataQualityFooter switch, update writeStepSummary switch, update all type-import call sites.
- **Files:** `src/pipeline/detectClusters.ts` (widen), `src/pipeline/detectLowConfidence.ts` (new), `src/pipeline/run.ts` (merge markers), `src/compose/templates.ts` (renderer), `src/compose/digest.ts` (type passthrough), `src/observability/summary.ts` (renderer + extract renderMarkersMarkdown export), `test/pipeline/detectLowConfidence.test.ts` (new), `test/compose/digest.test.ts` (low-confidence marker render), `test/observability/summary.test.ts` (wording fix + low-confidence marker render).
- **Deps:** Plan 10-01 (for clusterAdjusted marker timing).
- **Verification:** All 8 migrated call sites compile; low-confidence boundary tests pass; no suppression (A5/Pitfall 8 explicit).

### Plan 10-03: DRY_RUN emission + RunReport surface (D-07, D-08)
- **Scope:** Add `markers` + `firms` (or `allFirms`) to `RunReport`. Add isDryRun() branch in main.ts that calls Recorder.toMarkdownTable + renderMarkersMarkdown and prints to stdout. Label line `[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):`.
- **Files:** `src/pipeline/run.ts` (RunReport shape), `src/main.ts` (emission), `test/pipeline/run.test.ts` (RunReport shape assertion).
- **Deps:** Plans 10-01 + 10-02 (needs full table + markers).
- **Verification:** `pnpm dry-run` stdout contains 9-col header row + any markers block; no file writes beyond existing sanctioned ones (verified by unit test that stubs GITHUB_STEP_SUMMARY and asserts no write during DRY_RUN).

**Alternative 2-plan split:** Combine 10-01 and 10-02 into one large plan if the planner prefers fewer atomic units. The tradeoff is a larger reviewable diff vs cleaner plan-scope boundaries.

## Sources

### Primary (HIGH confidence — verified against codebase)
- `src/observability/recorder.ts:1-121` — FirmMetrics shape, REPLACE-NOT-ACCUMULATE invariant at line 9-15, DISABLED-FIRM FILTER at line 25-27, toMarkdownTable at line 109-120
- `src/observability/summary.ts:1-70` — ENV-GATED at line 7-11, single-appendFile at line 49-62, markers block at line 51-59, Pitfall 5 compliance at line 62
- `src/compose/templates.ts:56-122` — renderHtml 5-param signature, markers threaded at line 61, renderDataQualityFooter at line 207-221, escapeHtml at line 255
- `src/compose/digest.ts:29-44` — composeDigest 6-param signature, markers=[] default at line 35, passed to renderHtml at line 42
- `src/pipeline/run.ts:76, 177, 220, 265-272, 279-281, 347-352` — ClusterMarker import, markers variable hoist, newCount write-site, summarized write-site, detectHallucinationClusters call, writeStepSummary call in finally
- `src/pipeline/detectClusters.ts:38-52, 61-142` — ClusterMarker type, detector signature, signature derivation, demotion loop, marker emission
- `src/pipeline/enrichBody.ts:93-177` — enrichWithBody signature, item.description mutation site (line 139, 161)
- `src/summarize/gemini.ts:73-155` — summarize signature, Layer 2 substitution at line 106-112, error fallback at line 147-153
- `src/types.ts:87-99` — SummarizedItem shape, summaryConfidence required, isClusterMember optional flag
- `src/main.ts:70-102` — entry point structure, runPipeline invocation, jsRenderFailures check
- `src/mailer/gmail.ts:50-54`, `src/state/writer.ts:130-139`, `src/archive/writer.ts:60-65` — three sanctioned DRY_RUN sites
- `src/env.ts:1` — isDryRun() implementation
- `test/observability/recorder.test.ts:1-146` — existing test shape to mirror/extend
- `test/observability/summary.test.ts:1-160` — existing test shape; Pitfall 5 at line 137-158
- `test/pipeline/clusterDetection.test.ts:1-322` — detector test pattern to mirror for detectLowConfidence
- `test/pipeline/run.test.ts:1-558` — integration test pattern; GEMINI_API_KEY stubbing at line 184 (unstubAllEnvs); Recorder threading at line 260-279
- `test/compose/digest.test.ts:1-350` — WR-01 markers threaded through composeDigest at line 321-337
- `.planning/phases/10-data-quality-observability/10-CONTEXT.md:1-142` — locked decisions D-01 through D-08 + canonical refs + prior phase context
- `.planning/phases/10-data-quality-observability/10-DISCUSSION-LOG.md:1-135` — audit trail of discarded options
- `.planning/REQUIREMENTS.md:131-135` — DQOBS-01/02/03 spec
- `.planning/ROADMAP.md:188-196` — Phase 10 goal + success criteria + dependency on Phase 8

### Secondary (MEDIUM confidence — cross-references)
- `.planning/phases/08-hallucination-guard/08-CONTEXT.md` — D-04, D-08, D-14, D-15 (referenced in Phase 10 CONTEXT.md canonical refs)
- `.planning/phases/03-observability-dev-loop/` — Recorder design lineage (Pitfall 5 single-appendFile; Pitfall 6 mid-stage-throw honesty)
- Commit `344b65d` — GEMINI_API_KEY fail-loud guard (affects test stubbing)
- Commit `0493c5a` — vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real') beforeEach pattern
- Commit `3bc05f3` — tls-cert-fail classifier (adds no constraint to Phase 10 but shows disabled-firm filter is load-bearing)

### Tertiary (LOW confidence)
None. All claims in this research are codebase-anchored at file:line.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all dependencies verified present
- Architecture: HIGH — every integration point anchored at file:line with working imports
- Pitfalls: HIGH — each pitfall has a reproducible test case or grep-verified signal
- DRY_RUN emission site: MEDIUM — Option A vs Option B recommendation is research judgment; CONTEXT.md leaves this to Claude's discretion. Plan may re-adjudicate.
- Layer 2 detection heuristic: MEDIUM — Option A (summary_ko === title + summaryModel guard) is the simplest discriminator; Option B (add runtime flag) is more robust but deferred. Documented in Pitfall 1.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stable infrastructure, no ecosystem volatility; invalidation triggers: changes to Phase 3 Recorder invariants, Phase 8 ClusterMarker shape, or Phase 10 CONTEXT.md re-discussion)
