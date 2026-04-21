# Phase 10: Data-Quality Observability — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 10 (7 src modify + 1 src new + 5 test modify/new, scoped down to active edit surfaces)
**Analogs found:** 10 / 10 — every new file has a direct in-repo precedent from Phase 3 or Phase 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/observability/recorder.ts` (MODIFY) | observability / state accumulator | pure-state aggregation, REPLACE-NOT-ACCUMULATE | `src/observability/recorder.ts` (self — extend in-place) | exact (same file) |
| `src/observability/summary.ts` (MODIFY) | observability / side-effect boundary | env-gated append, single-appendFile | `src/observability/summary.ts` (self — extend in-place) | exact (same file) |
| `src/pipeline/detectClusters.ts` (MODIFY) | pipeline detector | pure function over FirmResult[] → markers | `src/pipeline/detectClusters.ts` (self — discriminator add) | exact (same file) |
| `src/pipeline/detectLowConfidence.ts` (NEW) | pipeline detector | pure function over FirmResult[] → LowConfidenceMarker[] | `src/pipeline/detectClusters.ts` | exact (same module shape) |
| `src/pipeline/run.ts` (MODIFY) | composition root | sequence orchestrator with Recorder write-sites + marker merge + RunReport | `src/pipeline/run.ts` line 219-221 (newCount write-site), line 265-272 (summarized write-site) | exact (same file) |
| `src/compose/templates.ts` (MODIFY) | compose / HTML renderer | switch on marker.kind | `src/compose/templates.ts` line 207-221 (existing cluster footer) | exact (same function) |
| `src/compose/digest.ts` (MODIFY) | compose / passthrough | type-only widen (ClusterMarker[] → DataQualityMarker[]) | `src/compose/digest.ts` line 27, 35 (import + default param) | exact (same file) |
| `src/main.ts` (MODIFY) | CLI entry / DRY_RUN emitter | conditional stdout emission post-runPipeline | `src/mailer/gmail.ts:50-54` (DRY_RUN stdout pattern), `src/archive/writer.ts:60-65` (label-prefix pattern) | role-match (different module) |
| `test/pipeline/detectLowConfidence.test.ts` (NEW) | test / pure-function | boundary coverage | `test/pipeline/clusterDetection.test.ts` (same pattern 1:1) | exact |
| `test/observability/recorder.test.ts` + `summary.test.ts` + `pipeline/run.test.ts` + `compose/digest.test.ts` (MODIFY) | test / integration + unit | widening column/row assertions + marker union fixtures | each file (self-extend) | exact |

---

## Pattern Assignments

### `src/observability/recorder.ts` (observability / REPLACE-NOT-ACCUMULATE aggregator)

**Analog:** same file — extend in place. Headers at `src/observability/recorder.ts:1-32` document the five invariants that ALL new fields MUST honor:
1. PURE STATE (no I/O, no env, no clock)
2. REPLACE-NOT-ACCUMULATE
3. PER-FIRM ISOLATION
4. DETERMINISTIC OUTPUT ORDER
5. DISABLED-FIRM FILTER

**FirmMetrics shape pattern** (`src/observability/recorder.ts:36-42`):
```typescript
export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;
  durationMs: number;
}
```
Phase 10 appends fields to the same interface — do NOT create a `FirmMetricsV2` or subtype. Widen in place.

**FirmRecorder fluent-method pattern** (`src/observability/recorder.ts:44-50`):
```typescript
export interface FirmRecorder {
  fetched(n: number): FirmRecorder;
  newCount(n: number): FirmRecorder;
  summarized(n: number): FirmRecorder;
  errorClass(cls: string): FirmRecorder;
  durationMs(ms: number): FirmRecorder;
}
```
Each method returns `FirmRecorder` for chaining. Phase 10 adds `bodyLengths(lengths: number[])`, `guardCount(n: number)`, `confidence(h, m, l)` — same return-type-this pattern.

**defaultMetrics factory pattern** (`src/observability/recorder.ts:52-60`):
```typescript
function defaultMetrics(): FirmMetrics {
  return {
    fetched: 0,
    new: 0,
    summarized: 0,
    errorClass: null,
    durationMs: 0,
  };
}
```
Phase 10 widens: `bodyLengths: []` (empty array → render as `—`), `guardCount: 0`, `confidenceH/M/L: 0`. Empty array for bodyLengths is the load-bearing "no-data" sentinel per Pitfall 4 (mid-stage throw honesty).

**firm() mutator closure pattern** (`src/observability/recorder.ts:65-94`):
```typescript
firm(firmId: string): FirmRecorder {
  let existing = this.metrics.get(firmId);
  if (!existing) {
    existing = defaultMetrics();
    this.metrics.set(firmId, existing);
  }
  const handle: FirmRecorder = {
    fetched: (n) => {
      existing!.fetched = n;     // REPLACE, not +=
      return handle;
    },
    // ...
  };
  return handle;
}
```
Phase 10 adds three cases inside the same `handle` closure — keep the `existing!.field = value; return handle;` shape. NEVER write `existing!.bodyLengths.push(...)` — that's accumulate, which breaks Pitfall 6.

**toMarkdownTable disabled-firm filter + iteration pattern** (`src/observability/recorder.ts:109-120`):
```typescript
toMarkdownTable(firms: FirmConfig[]): string {
  const header = '| Firm | Fetched | New | Summarized | Errors | Duration |';
  const separator = '|------|--------:|----:|-----------:|--------|---------:|';
  const rows = firms
    .filter((f) => f.enabled)                               // DISABLED-FIRM FILTER
    .map((f) => {
      const m = this.metrics.get(f.id) ?? defaultMetrics();  // never-touched-firm zero row
      const err = m.errorClass ?? '—';
      return `| ${f.name} | ${m.fetched} | ${m.new} | ${m.summarized} | ${err} | ${m.durationMs}ms |`;
    });
  return [header, separator, ...rows].join('\n');
}
```
Phase 10 extension MUST stay inside the single `.map((f) => { ... })` closure — adding a parallel loop would leak disabled firms into new columns (Pitfall 5). New columns `AvgBody | GUARD | H/M/L` are appended to the template literal return.

---

### `src/observability/summary.ts` (observability / env-gated append boundary)

**Analog:** same file — extend in place. Headers at `src/observability/summary.ts:1-28` document four invariants: ENV-GATED, NEVER-THROWS, APPEND-ONLY, 1 MiB truncation awareness.

**Single-appendFile payload assembly pattern** (`src/observability/summary.ts:42-62`):
```typescript
export async function writeStepSummary(
  recorder: Recorder,
  firms: FirmConfig[],
  markers: ClusterMarker[] = [],
): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;                                // ENV-GATED no-op

  const table = recorder.toMarkdownTable(firms);
  let payload = table + '\n';
  if (markers.length > 0) {                         // D-15 clean-run invisible
    const lines = markers
      .map((m) => `- **${m.firmId}**: HALLUCINATION_CLUSTER_DETECTED — ${m.count} items demoted`)
      .join('\n');
    payload += `\n## ⚠ Data Quality Warnings\n\n${lines}\n`;
  }

  try {
    await appendFile(path, payload, 'utf8');        // SINGLE appendFile (Pitfall 5)
  } catch (err) {
    console.warn(`[step-summary] write failed: ${scrubSecrets((err as Error).message)}`);
  }
}
```
Phase 10 extensions:
1. Widen `markers: ClusterMarker[]` → `markers: DataQualityMarker[]` (same parameter name, widened type).
2. Replace the inline `.map` with a call to a new exported `renderMarkersMarkdown(markers)` helper so DRY_RUN and GHA paths share one renderer (D-07 byte-for-byte parity).
3. Preserve ONE `await appendFile` — payload concatenation discipline is load-bearing per Pitfall 3 and enforced by `test/observability/summary.test.ts:137-158`.

**Error-swallow + scrubSecrets pattern** (`src/observability/summary.ts:63-68`):
```typescript
catch (err) {
  console.warn(
    `[step-summary] write failed: ${scrubSecrets((err as Error).message)}`,
  );
}
```
Phase 10 does not touch this — observability failures must stay best-effort (NEVER-THROWS). No new catch sites needed.

---

### `src/pipeline/detectClusters.ts` (pipeline detector → discriminator add)

**Analog:** same file. The existing `ClusterMarker` gains a `kind: 'cluster'` discriminator and is unioned with a new `LowConfidenceMarker` in the same file.

**Existing marker type pattern** (`src/pipeline/detectClusters.ts:38-52`):
```typescript
export interface ClusterMarker {
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}

export interface DetectionResult {
  firms: FirmResult[];
  markers: ClusterMarker[];
}
```
Phase 10 widens:
```typescript
export interface ClusterMarker {
  kind: 'cluster';        // NEW discriminator
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}

export interface LowConfidenceMarker {
  kind: 'low-confidence'; // NEW
  firmId: string;
  firmName: string;       // mirror ClusterMarker shape so templates don't branch
  lowCount: number;
  totalCount: number;
}

export type DataQualityMarker = ClusterMarker | LowConfidenceMarker;
```

**Marker emission pattern** (`src/pipeline/detectClusters.ts:93-121`):
```typescript
for (const [sig, group] of groups) {
  if (group.length >= CLUSTER_THRESHOLD) {
    markers.push({
      firmId: r.firm.id,
      firmName: r.firm.name,
      count: group.length,
      signature: sig,
    });
    // stderr marker (D-16, mirrors GMAIL_AUTH_FAILURE shape)
    console.error(
      `HALLUCINATION_CLUSTER_DETECTED: firm=${r.firm.id} count=${group.length} signature="${safeSig}"`,
    );
  }
}
```
Phase 10 ONLY adds `kind: 'cluster'` to the literal:
```typescript
markers.push({
  kind: 'cluster',        // NEW
  firmId: r.firm.id,
  firmName: r.firm.name,
  count: group.length,
  signature: sig,
});
```
No new stderr emission for this file. Low-confidence detector does NOT emit stderr (research §"detectLowConfidence" confirms: footer is the primary alarm surface).

**Immutable update pattern** (`src/pipeline/detectClusters.ts:129-138`):
```typescript
const demoted = r.summarized.map((it) =>
  clusteredUrls.has(it.url)
    ? { ...it, summaryConfidence: 'low' as const, isClusterMember: true as const }
    : it,
);
return { ...r, summarized: demoted };
```
Phase 10 detectLowConfidence is READ-ONLY — no mutation of summarized. Only emits markers. This contrasts with detectHallucinationClusters which both emits markers AND demotes items.

---

### `src/pipeline/detectLowConfidence.ts` (NEW pure detector)

**Analog:** `src/pipeline/detectClusters.ts` — mirror the signature style, header comment structure, `LOW_CONF_THRESHOLD` + `MIN_TOTAL_FLOOR` constants at top, single `for…of` loop with `if (r.error) continue` skip.

**Module header + constants pattern** (mirror `src/pipeline/detectClusters.ts:1-55`):
```typescript
// Phase 10 D-04 — low-confidence marker detector.
//
// Pure function over FirmResult[]. For each firm with total ≥ 3 summarized
// items, emits a LowConfidenceMarker when the fraction of items with
// summaryConfidence === 'low' meets or exceeds 50%.
//
// MUST run AFTER detectHallucinationClusters so Layer-3 cluster demotes
// (confidence='low') are counted (see Phase 10 Pitfall 2).
//
// No stderr emission — step-summary + email footer is the surface per D-05.
// No suppression of cluster-firm overlap per D-04 (see Pitfall 8).

import type { FirmResult } from '../types.js';
import type { LowConfidenceMarker } from './detectClusters.js';

const LOW_CONF_THRESHOLD = 0.5;   // D-04
const MIN_TOTAL_FLOOR = 3;        // D-04 — sparse-firm protection

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

Analog specifics copied:
- `if (r.error) continue` skip (mirrors `src/pipeline/detectClusters.ts:68`).
- `r.summarized.length === 0` / `< floor` skip (mirrors same line).
- Constants at top of file (mirrors `CLUSTER_THRESHOLD`/`SIGNATURE_LENGTH` at `src/pipeline/detectClusters.ts:54-55`).
- Pure function — no stderr, no mutation.

---

### `src/pipeline/run.ts` (composition root — 3 new write-sites + marker merge + RunReport surface)

**Analog:** same file. Phase 10 inserts new sites between existing stage boundaries. Each new site mirrors an established Recorder-threading idiom.

**Existing stage-boundary Recorder write pattern** (`src/pipeline/run.ts:219-221`):
```typescript
const deduped = dedupAll(filtered, seen);
for (const r of deduped) {
  recorder.firm(r.firm.id).newCount(r.new.length);  // REPLACE at stage boundary
}
```
This is the canonical shape — loop over stage output, call `recorder.firm(id).method(value)` ONCE per firm per stage.

**Phase 10 Site 1: body-length record** (insert after `src/pipeline/run.ts:201`):
```typescript
const enriched = await enrichWithBody(fetched, browser);
// Phase 10 DQOBS-01 Site 1 — body lengths recorded at stage boundary
// post-enrich. REPLACE-NOT-ACCUMULATE: pass full array per firm per stage.
// Fetched=0 firm has r.error set → skip, defaultMetrics bodyLengths=[] stays.
for (const r of enriched) {
  if (r.error) continue;
  const lengths = r.raw.map((item) => (item.description ?? '').length);
  recorder.firm(r.firm.id).bodyLengths(lengths);
}
```

**Existing post-summarize Recorder write pattern** (`src/pipeline/run.ts:265-272`):
```typescript
recorder
  .firm(r.firm.id)
  .summarized(
    out.filter(
      (it) => it.summaryModel !== 'skipped' && it.summaryModel !== 'cli-skipped',
    ).length,
  );
```
This shows the chained-fluent style for a filter-then-count aggregate.

**Phase 10 Site 2: guardCount + confidence record** (insert after `src/pipeline/run.ts:281` `markers = clusterResult.markers;`):
```typescript
// Phase 10 DQOBS-01 Site 2 — GUARD union + H/M/L after cluster-detect
// so Layer-3 demotes land in L (Pitfall 2).
for (const r of clusterAdjusted) {
  if (r.error) continue;
  // Layer 1: summaryModel === 'skipped' (body empty/short → Gemini bypassed)
  const layer1 = r.summarized.filter((it) => it.summaryModel === 'skipped').length;
  // Layer 2: Gemini returned '' → title-verbatim substituted (gemini.ts:106-112)
  // Discriminator heuristic (Pitfall 1 Option A): summary_ko===title + non-sentinel model
  const layer2 = r.summarized.filter((it) =>
    it.summary_ko === it.title
    && it.summaryModel !== 'skipped'
    && it.summaryModel !== 'failed'
    && it.summaryModel !== 'cli-skipped'
  ).length;
  // Layer 3: cluster-demoted (detectClusters.ts sets isClusterMember=true)
  const layer3 = r.summarized.filter((it) => it.isClusterMember === true).length;
  recorder.firm(r.firm.id).guardCount(layer1 + layer2 + layer3);

  const h = r.summarized.filter((it) => it.summaryConfidence === 'high').length;
  const m = r.summarized.filter((it) => it.summaryConfidence === 'medium').length;
  const l = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
  recorder.firm(r.firm.id).confidence(h, m, l);
}
```

**Phase 10 Site 3: low-confidence marker merge** (same insertion point):
```typescript
// Phase 10 DQOBS-02 — append low-confidence markers to existing cluster markers.
// No suppression (D-04 / Pitfall 8): both can fire for the same firm by design.
const lowConfMarkers = detectLowConfidence(clusterAdjusted);
markers = [...markers, ...lowConfMarkers];
```

**Existing markers hoist pattern** (`src/pipeline/run.ts:175-177`):
```typescript
// Phase 8 D-06 / Pitfall 5 — hoist markers above try so the finally-block
// writeStepSummary call at the end can see them even on early throw.
let markers: ClusterMarker[] = [];
```
Phase 10 widens to `let markers: DataQualityMarker[] = [];` — same hoist site, widened type. The finally-block `writeStepSummary(recorder, allFirms, markers)` at `src/pipeline/run.ts:351` stays byte-identical; type flows through.

**RunReport shape pattern** (`src/pipeline/run.ts:103-111`):
```typescript
export interface RunReport {
  results: FirmResult[];
  digestSent: boolean;
  saveHtmlWritten?: string;
  archivePath?: string;
  warnings: StalenessWarnings;
  recorder: Recorder;
  jsRenderFailures: number;
}
```
Phase 10 adds two REQUIRED fields (every code path produces them, Pitfall 9 verified only 1 prod consumer + 1 test):
```typescript
export interface RunReport {
  // ... existing fields ...
  markers: DataQualityMarker[];   // NEW — exposed for DRY_RUN stdout emission
  firms: FirmConfig[];            // NEW — allFirms, for Recorder.toMarkdownTable in main.ts
}
```
Populate at the `const report: RunReport = { ... }` construction site (`src/pipeline/run.ts:297-303`) — add `markers` and `firms: allFirms` to the object literal.

**Imports update pattern** (`src/pipeline/run.ts:76`):
```typescript
import { detectHallucinationClusters, type ClusterMarker } from './detectClusters.js';
```
Widen to:
```typescript
import {
  detectHallucinationClusters,
  type DataQualityMarker,
} from './detectClusters.js';
import { detectLowConfidence } from './detectLowConfidence.js';
```

---

### `src/compose/templates.ts` (HTML renderer — discriminated-union switch)

**Existing cluster footer pattern** (`src/compose/templates.ts:197-221`):
```typescript
/**
 * Render the Phase 8 data-quality warning footer (D-14). Mirrors the
 * renderFailedFirmsFooter shape exactly — same <footer> outer styles,
 * same margin:4px 0; <ul>, same ⚠-prefixed Korean heading. Returns ''
 * on clean runs so visually unchanged without clusters detected.
 */
function renderDataQualityFooter(markers: ClusterMarker[]): string {
  if (markers.length === 0) return '';

  const items = markers
    .map(
      (m) =>
        `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): HALLUCINATION_CLUSTER_DETECTED (${m.count} items, 요약 숨김)</li>`,
    )
    .join('');

  return `<footer style="margin-top:32px;color:#999;font-size:12px;">
  <div>⚠ 데이터 품질 경고 — 요약 신뢰도 의심:</div>
  <ul style="margin:4px 0;">${items}</ul>
</footer>`;
}
```

**Phase 10 switch-on-kind pattern**:
```typescript
function renderDataQualityFooter(markers: DataQualityMarker[]): string {
  if (markers.length === 0) return '';
  const items = markers
    .map((m) => {
      if (m.kind === 'cluster') {
        return `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): HALLUCINATION_CLUSTER_DETECTED (${m.count} items, 요약 숨김)</li>`;
      }
      // m.kind === 'low-confidence' — exhaustiveness narrowing
      return `<li>${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): ${m.lowCount}/${m.totalCount} items 품질 의심 (confidence=low 과반)</li>`;
    })
    .join('');
  return `<footer style="margin-top:32px;color:#999;font-size:12px;">
  <div>⚠ 데이터 품질 경고 — 요약 신뢰도 의심:</div>
  <ul style="margin:4px 0;">${items}</ul>
</footer>`;
}
```

**XSS-escape posture pattern** (`src/compose/templates.ts:1-50`, `255-264`):
Header comment locks: "EVERY user-controlled string crossing into HTML or attribute context passes through escapeHtml or escapeAttr." Phase 10 preserves this — `firmName` and `firmId` still passed through `escapeHtml`. Numbers (`lowCount`, `totalCount`) don't need escaping. `escapeHtml` stays LOCAL to this file per Phase 1 lock (`src/compose/templates.ts:47-49`).

**renderHtml signature propagation pattern** (`src/compose/templates.ts:56-62`):
```typescript
export function renderHtml(
  firms: FirmResult[],
  dateKst: string,
  failed: FirmResult[] = [],
  warnings?: StalenessWarnings,
  markers: ClusterMarker[] = [],
): string {
```
Phase 10 widens `markers: DataQualityMarker[]`. Import at `src/compose/templates.ts:54`:
```typescript
import type { ClusterMarker } from '../pipeline/detectClusters.js';
```
Becomes:
```typescript
import type { DataQualityMarker } from '../pipeline/detectClusters.js';
```

---

### `src/compose/digest.ts` (compose / passthrough — type-only widen)

**Existing passthrough pattern** (`src/compose/digest.ts:27-43`):
```typescript
import type { ClusterMarker } from '../pipeline/detectClusters.js';

export function composeDigest(
  results: FirmResult[],
  recipient: string | string[],
  fromAddr: string,
  warnings?: StalenessWarnings,
  now: Date = new Date(),
  markers: ClusterMarker[] = [],
): EmailPayload {
  // ...
  const html = renderHtml(firmsWithNew, dateKst, firmsWithErrors, warnings, markers);
  return { subject, html, to: recipient, from: fromAddr };
}
```

**Phase 10 widening** — pure type change, no logic change:
```typescript
import type { DataQualityMarker } from '../pipeline/detectClusters.js';
// ...
markers: DataQualityMarker[] = [],
```

The 6-param positional signature is unchanged (`composeDigest(results, recipient, from, warnings, now, markers)`). Call-site at `src/pipeline/run.ts:307-314` stays byte-identical.

---

### `src/main.ts` (CLI entry / DRY_RUN stdout emission — NEW fourth sanctioned site)

**Analog for DRY_RUN stdout idiom:** `src/mailer/gmail.ts:50-54` (first sanctioned DRY_RUN site).

**Established DRY_RUN label-prefix pattern** (`src/mailer/gmail.ts:47-54`):
```typescript
export async function sendMail(payload: EmailPayload): Promise<void> {
  // OPS-06 DRY_RUN check site #1 of 2. Must be FIRST — no transporter
  // creation, no SMTP connection, no outbound bytes in DRY_RUN mode.
  if (isDryRun()) {
    console.log('[DRY_RUN] Subject:', payload.subject);
    console.log('[DRY_RUN] HTML body:\n', payload.html);
    return;
  }
  // ...
}
```

**Established DRY_RUN "would-write" pattern** (`src/archive/writer.ts:58-65`):
```typescript
// DRY_RUN check site #3 of 3 (Phase 3 R-02). Do NOT import isDryRun
// anywhere except mailer/gmail.ts, state/writer.ts, and this file.
if (isDryRun()) {
  console.log(
    `[DRY_RUN] would write archive ${filePath} (${html.length} bytes)`,
  );
  return filePath;
}
```

**Established DRY_RUN state-preview pattern** (`src/state/writer.ts:128-139`):
```typescript
// OPS-06 DRY_RUN check site #2. Merge already computed above so
// DRY_RUN exercises the same arithmetic; we only skip the disk write.
if (isDryRun()) {
  const total = Object.values(next.firms).reduce(
    (n, f) => n + f.urls.length,
    0,
  );
  console.log(
    `[DRY_RUN] would write ${path} with ${total} URLs across ${Object.keys(next.firms).length} firms`,
  );
  return;
}
```

**Existing main.ts Pattern 2 containment header** (`src/main.ts:57-61`):
```typescript
// Pattern 2 (DRY_RUN containment): this file does NOT import the env dry-run
// helper. The two sanctioned DRY_RUN check sites are mailer/gmail.ts and
// state/writer.ts. Any DRY_RUN branch here would be a Pattern 2 regression.
```
Phase 10 REVISES this header — main.ts becomes the fourth sanctioned DRY_RUN site, and the header comment must be updated to reflect the new invariant (research §"DRY_RUN emission site" Option A).

**Phase 10 DRY_RUN emission at main.ts** (insert after `src/main.ts:87`):
```typescript
import { isDryRun } from './env.js';
import { renderMarkersMarkdown } from './observability/summary.js';

// ... existing imports ...

async function main(): Promise<number> {
  try {
    const report = await runPipeline({});

    // Phase 10 DQOBS-03 — fourth sanctioned DRY_RUN site. stdout only,
    // byte-for-byte parity with GHA step-summary via shared
    // renderMarkersMarkdown helper. No file writes.
    if (isDryRun()) {
      const table = report.recorder.toMarkdownTable(report.firms);
      console.log('[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):');
      console.log(table);
      const markersBlock = renderMarkersMarkdown(report.markers);
      if (markersBlock.length > 0) {
        console.log(markersBlock.trimEnd());  // trim trailing \n
      }
    }

    if (report.jsRenderFailures > 0) {
      console.error(`FATAL: ${report.jsRenderFailures} js-render firm(s) failed — see email footer; state + archive have already been committed`);
      return 1;
    }
    return 0;
  } catch (err) {
    console.error('FATAL:', scrubSecrets((err as Error).message));
    return 1;
  }
}
```

---

### `test/pipeline/detectLowConfidence.test.ts` (NEW)

**Analog:** `test/pipeline/clusterDetection.test.ts` — mirror signature style, fixture-factory helpers, per-boundary `it()` blocks.

**Fixture-factory pattern** (`test/pipeline/clusterDetection.test.ts:32-60`):
```typescript
function makeItem(
  firmId: string,
  url: string,
  title: string,
  summary: string | null,
  extras: Partial<SummarizedItem> = {},
): SummarizedItem {
  return {
    firmId, title, url,
    language: 'ko',
    isNew: true,
    summary_ko: summary,
    summaryConfidence: 'high',
    summaryModel: 'gemini-2.5-flash',
    ...extras,
  };
}

function makeFirm(firm: FirmConfig, items: SummarizedItem[]): FirmResult {
  return {
    firm,
    raw: [],
    new: [],
    summarized: items,
    durationMs: 100,
  };
}
```
Phase 10 reuses these helpers almost verbatim — the low-confidence detector consumes `FirmResult[]` with `summaryConfidence` on each item, no summary_ko concern.

**Boundary test pattern** (`test/pipeline/clusterDetection.test.ts:109-125`):
```typescript
it('2: 2 items with identical prefix → NOT triggered (threshold is 3); no markers, no demotion', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const input = [
    makeFirm(bklConfig, [
      makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
      makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
    ]),
  ];
  const { firms, markers } = detectHallucinationClusters(input);
  expect(markers).toHaveLength(0);
  // ...
});
```
Phase 10 boundary tests (per RESEARCH §"Test Strategy Hints"):
- N=2 low / N=2 total → NO marker (below floor)
- N=3 low / N=3 total → marker fires
- N=2 low / N=3 total → marker fires (66%)
- N=1 low / N=3 total → NO marker (33%)
- N=3 low / N=6 total → marker fires (50% inclusive)
- N=2 low / N=5 total → NO marker (40%)
- firm with error set → skipped entirely

No `vi.stubEnv('GEMINI_API_KEY', ...)` needed — detectLowConfidence is pure, consumes FirmResult[] fixtures directly, does not import gemini.ts (Pitfall 11).

---

### `test/observability/recorder.test.ts` (MODIFY)

**Analog:** same file — all existing tests remain, header-assertion lines and row-assertion lines update to 9-col format.

**Existing 6-col header assertion pattern** (`test/observability/recorder.test.ts:73-77`):
```typescript
const table = r.toMarkdownTable(firms);
const lines = table.split('\n');
expect(lines[0]).toBe('| Firm | Fetched | New | Summarized | Errors | Duration |');
expect(lines[1]).toBe('|------|--------:|----:|-----------:|--------|---------:|');
expect(lines[2]).toBe('| Cooley | 12 | 3 | 3 | — | 1247ms |');
```
Phase 10 widens to 9-col:
```typescript
expect(lines[0]).toBe('| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |');
expect(lines[1]).toBe('|------|--------:|----:|-----:|--------|---------:|--------:|------:|------:|');
expect(lines[2]).toBe('| Cooley | 12 | 3 | 3 | — | 1247ms | 1234 | 2 | 5/1/0 |');
```

**Existing disabled-firm filter test pattern** (`test/observability/recorder.test.ts:96-111`):
```typescript
it('skips firms where enabled: false', () => {
  // ...
  expect(table).not.toContain('광장');
  expect(table).not.toContain('99');
});
```
Phase 10 MUST keep this test green — new columns inherit the existing `.filter((f) => f.enabled)` at line 113. Add a regression assertion that `99` doesn't leak into AvgBody/GUARD/H-M-L either.

**New Phase 10 tests to add:**
- `bodyLengths` fluent method: replace-not-accumulate on repeat call
- `guardCount` fluent method: REPLACE semantics
- `confidence(h, m, l)` fluent method: triple REPLACE
- AvgBody integer rounding (e.g., `[100, 200, 301]` → `200`)
- AvgBody `—` on empty `bodyLengths`
- GUARD / H/M/L `—` on Fetched=0 + empty bodyLengths
- Mid-stage throw honesty: firm A records, firm B doesn't → A shows real avg, B shows `—`

---

### `test/observability/summary.test.ts` (MODIFY)

**Existing cluster-marker assertion pattern** (`test/observability/summary.test.ts:95-107`):
```typescript
const markers: ClusterMarker[] = [
  { firmId: 'bkl', firmName: '법무법인 태평양', count: 5, signature: 'sig1' },
  { firmId: 'kim-chang', firmName: '김앤장', count: 3, signature: 'sig2' },
];
await writeStepSummary(r, firms, markers);
const content = await readFile(path, 'utf8');
expect(content).toContain('## ⚠ Data Quality Warnings');
expect(content).toContain('- **bkl**: HALLUCINATION_CLUSTER_DETECTED — 5 items demoted');
```

**Phase 10 updates** (per Pitfall 10):
- Fixture literals add `kind: 'cluster'` discriminator.
- Assertion string updates from `5 items demoted` → `5개 항목 demote됨` (D-05 Korean).
- New test: low-confidence marker fixture renders `4/6 items 품질 의심 (confidence=low 과반)`.
- New test: mixed markers (1 cluster + 1 low-confidence) both render.
- Pitfall 5 SINGLE appendFile test at `test/observability/summary.test.ts:137-158` stays green after widening.

**Environment stubbing pattern** (`test/observability/summary.test.ts:25-33`):
```typescript
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'step-summary-test-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});
```
Phase 10 unchanged — no GEMINI_API_KEY stub needed (writeStepSummary does not import gemini.ts).

---

### `test/pipeline/run.test.ts` (MODIFY)

**Existing vi.hoisted + vi.mock factory pattern** (`test/pipeline/run.test.ts:13-65`):
```typescript
const mocks = vi.hoisted(() => {
  return {
    loadFirmsMock: vi.fn(),
    fetchAllMock: vi.fn(),
    enrichWithBodyMock: vi.fn(),
    // ...
  };
});

vi.mock('../../src/config/loader.js', () => ({
  loadFirms: mocks.loadFirmsMock,
  loadRecipient: mocks.loadRecipientMock,
}));
// ... etc
```
Phase 10 stays inside this pattern — no new mocks needed unless a test explicitly requires detectLowConfidence to be mocked (it's pure — prefer letting it run).

**Existing Recorder-threaded assertion pattern** (`test/pipeline/run.test.ts:260-279`):
```typescript
it('Recorder is threaded and toMarkdownTable reflects metrics', async () => {
  const report = await runPipeline({
    skipEmail: true,
    skipStateWrite: true,
    skipGemini: true,
  });
  const table = report.recorder.toMarkdownTable([{ id: 'cooley', ... enabled: true }]);
  expect(table).toContain('| Cooley |');
  expect(table).toContain('1'); // fetched=1 from the mock.
});
```

**Phase 10 new assertions at this block:**
- Table contains 9-col header + row with AvgBody/GUARD/H/M/L populated.
- `report.markers` is a `DataQualityMarker[]` (type at runtime — check shape on fixtures that trigger low-confidence).
- `report.firms` equals `allFirms` (new RunReport field).

**Existing RunReport shape test pattern** (`test/pipeline/run.test.ts:290-305`):
```typescript
it('RunReport shape — results, digestSent, warnings, recorder populated', async () => {
  const report = await runPipeline({ skipEmail: true, skipStateWrite: true, skipGemini: true });
  expect(report.results).toBeDefined();
  expect(report.recorder).toBeDefined();
  expect(report.jsRenderFailures).toBe(0);
});
```
Phase 10 appends `expect(report.markers).toBeDefined()` and `expect(report.firms).toBeDefined()` (new required fields).

**Environment stubbing for run.test.ts** (`test/pipeline/run.test.ts:183-186`):
```typescript
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});
```
For any new Phase 10 test that exercises summarize (not strictly needed if mocks cover it), add `vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real')` in `beforeEach` per Pitfall 11.

---

### `test/compose/digest.test.ts` (MODIFY)

**Existing markers-threaded-through-composeDigest pattern** (`test/compose/digest.test.ts:321-337`):
```typescript
// WR-01: markers are now threaded explicitly through composeDigest (Option A).
const markers = [
  {
    firmId: 'cooley',
    firmName: 'Cooley',
    count: 5,
    signature: '법무법인 태평양은 1980년에 설립된...',
  },
];
const payload = composeDigest(
  [clusteredFirm],
  'u@e.com',
  'u@e.com',
  undefined,
  fixedDate,
  markers,
);
expect(payload.html).toContain('⚠ 데이터 품질 경고 — 요약 신뢰도 의심');
expect(payload.html).toContain('HALLUCINATION_CLUSTER_DETECTED (5 items, 요약 숨김)');
```

**Phase 10 updates:**
- Existing fixture literal adds `kind: 'cluster'` per discriminated-union migration.
- New test at same block: low-confidence marker fixture + `expect(payload.html).toContain('4/6 items 품질 의심 (confidence=low 과반)')`.
- "No clusters → footer NOT rendered" test (`test/compose/digest.test.ts:347-350`) stays green; add sibling "no markers of any kind" test to lock D-15 across union.

---

## Shared Patterns

### Pattern: DRY_RUN stdout emission
**Source:** `src/mailer/gmail.ts:50-54`, `src/state/writer.ts:128-139`, `src/archive/writer.ts:58-65`
**Apply to:** `src/main.ts` (new fourth sanctioned site)
```typescript
if (isDryRun()) {
  console.log('[DRY_RUN] <label>:', <value>);
  // ...optional additional preview lines...
  return;  // or skip side-effecting branch
}
```
All three existing sites use `[DRY_RUN]` uppercase bracket prefix. Phase 10 label: `[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):` per D-07.

### Pattern: REPLACE-NOT-ACCUMULATE Recorder write
**Source:** `src/observability/recorder.ts:71-92` (handle closure) + `src/pipeline/run.ts:219-221, 265-272` (call sites)
**Apply to:** all 3 new Phase 10 Recorder write-sites in `src/pipeline/run.ts`
```typescript
for (const r of <stageOutput>) {
  if (r.error) continue;  // error-firm skip — defaults stay
  const value = /* aggregate from r */;
  recorder.firm(r.firm.id).<newMethod>(value);  // REPLACE at stage boundary
}
```
The `.bodyLengths(lengths)` method receives the full array, not per-item-push.

### Pattern: Discriminated-union exhaustiveness switch
**Source:** new pattern — first occurrence in this codebase. Closest precedent is single-if-else chains without discriminators.
**Apply to:** `src/compose/templates.ts#renderDataQualityFooter`, `src/observability/summary.ts#renderMarkersMarkdown`
```typescript
markers.map((m) => {
  if (m.kind === 'cluster') {
    return <cluster-row-template>;
  }
  // m.kind === 'low-confidence' — narrowed by exhaustion
  return <low-confidence-row-template>;
});
```
TypeScript's exhaustiveness narrowing on `m.kind` prevents the accidental third-case bug if the union is extended later. Do NOT use `typeof m === 'object' && 'signature' in m` property-probing — anti-pattern per RESEARCH "Don't Hand-Roll".

### Pattern: Shared rendering helper for byte-for-byte parity
**Source:** Implicit in `src/observability/summary.ts:51-59` — the marker-rendering block is currently inlined. Phase 10 extracts it.
**Apply to:** new `renderMarkersMarkdown(markers: DataQualityMarker[]): string` export in `src/observability/summary.ts`
```typescript
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
`writeStepSummary` calls this to build its payload suffix. `main.ts` DRY_RUN branch calls the same helper. D-07 byte-for-byte parity is enforced by code-level sharing, not discipline.

### Pattern: Single-appendFile atomic payload assembly
**Source:** `src/observability/summary.ts:49-62`
**Apply to:** `src/observability/summary.ts` (extend, do NOT add second appendFile)
```typescript
const table = recorder.toMarkdownTable(firms);
let payload = table + '\n';
if (markers.length > 0) {
  payload += renderMarkersMarkdown(markers);  // concat
}
await appendFile(path, payload, 'utf8');      // ONE call (Pitfall 3)
```
Grep gate: `grep -c "await appendFile" src/observability/summary.ts` MUST equal `1` after Phase 10 changes. Test at `test/observability/summary.test.ts:137-158` enforces.

### Pattern: Clean-run invisibility (D-15)
**Source:** `src/observability/summary.ts:51` (`if (markers.length > 0)`), `src/compose/templates.ts:208` (`if (markers.length === 0) return ''`), `src/compose/templates.ts:180` (`if (filtered.length === 0) return ''`)
**Apply to:** all new render functions that emit footer/marker blocks
```typescript
if (markers.length === 0) return '';           // renderer
// OR
if (markers.length > 0) { payload += ...; }    // composer
```
Empty markers → zero output bytes. Verified by `test/compose/digest.test.ts:347-350` and `test/observability/summary.test.ts:110-119`.

### Pattern: Test file — vitest vi.hoisted + vi.mock + vi.stubEnv
**Source:** `test/pipeline/run.test.ts:13-65, 183-186` (established since commit `0493c5a`)
**Apply to:** any Phase 10 test that drives runPipeline end-to-end
```typescript
const mocks = vi.hoisted(() => ({ /* ... */ }));
vi.mock('../../src/foo.js', () => ({ fn: mocks.fnMock }));

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
```
Pure-function tests (`detectLowConfidence.test.ts`) do NOT need the env stub — they consume FirmResult[] fixtures directly.

---

## No Analog Found

None. Every Phase 10 file has a direct in-repo precedent.

**Notable "first occurrence" caveat:**
- **Discriminated union with `kind` discriminator.** No prior file in `src/` uses a TypeScript discriminated union with a string literal `kind` field. ClusterMarker is the first type to be widened this way. Closest precedent is `FirmConfig.type: 'rss' | 'html' | 'js-render' | 'sitemap'` (`src/types.ts:24`) which is a discriminator-on-the-config-shape but not a union. Phase 10 introduces the full discriminated-union-with-exhaustive-narrowing pattern; planner should document this in a header comment on `detectClusters.ts` when widening so future readers see the rationale.

---

## Metadata

**Analog search scope:**
- `src/observability/**` (Recorder, summary writer)
- `src/pipeline/**` (composition root, cluster detector)
- `src/compose/**` (HTML renderer, digest composer)
- `src/mailer/**`, `src/state/**`, `src/archive/**` (DRY_RUN sanctioned sites)
- `src/main.ts`, `src/env.ts`
- `test/observability/**`, `test/pipeline/**`, `test/compose/**`

**Files scanned:** 13 source files + 5 test files = 18 total, covering every touch-point in Phase 10 scope.

**Pattern extraction date:** 2026-04-20

**Confidence:** HIGH. Every pattern cited is codebase-anchored with file:line. Zero external references needed. All widenings are strict supersets of existing structures (RunReport field additions, ClusterMarker kind addition, toMarkdownTable column additions) — no rewrites or replacements.
