---
phase: 08-hallucination-guard
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/types.ts
  - src/summarize/prompt.ts
  - src/summarize/gemini.ts
  - src/pipeline/run.ts
  - src/pipeline/detectClusters.ts
  - src/compose/templates.ts
  - src/observability/summary.ts
  - test/summarize/gemini.test.ts
  - test/summarize/prompt.test.ts
  - test/pipeline/run.test.ts
  - test/pipeline/clusterDetection.test.ts
  - test/compose/digest.test.ts
  - test/observability/summary.test.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-04-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 8 adds a three-layer hallucination guard (Layer 1 short-circuit in `run.ts`, Layer 2 prompt-level sentinel in `prompt.ts` + `gemini.ts`, Layer 3 post-summarize cluster detection in `detectClusters.ts`) with UI surfacing in `templates.ts` (fold-UI + data-quality footer) and `summary.ts` (step-summary markers). The implementation is generally high quality:

- Immutability is carefully preserved in `detectHallucinationClusters` (spread + `.map`, no in-place mutation).
- XSS posture is consistent — every user-controlled string crosses through `escapeHtml`/`escapeAttr`. Cluster footer and fold-UI paths pass the XSS snapshot tests.
- Pattern 2 DRY_RUN containment is respected — `run.ts` does not import any env-dry-run helper.
- The SUMM-06 "title never in prompt" invariant is preserved across both Layer 1 (short-circuit bypasses Gemini) and Layer 2 (Gemini returns `''`, caller substitutes title post-hoc). Tests assert this.
- Step-summary write is a single `appendFile` call (Pitfall 5) and the finally block in `run.ts` still fires on throw.

Issues found are non-blocking but should be addressed: one duplicated/drift-prone derivation path in `templates.ts`, one input-contract drift between `detectClusters.ts` and its comments, and several smaller quality items. No security vulnerabilities detected.

## Warnings

### WR-01: ClusterMarker reconstruction in templates.ts drifts from detector's authoritative output

**File:** `src/compose/templates.ts:105, 206-219`
**Issue:** `renderHtml` calls `deriveMarkersFromFirms(firms)` to reconstruct `ClusterMarker[]` by scanning `isClusterMember` flags, rather than receiving the authoritative markers produced by `detectHallucinationClusters`. This creates two problems:

1. **Signature drift.** `deriveMarkersFromFirms` uses `demoted[0].summary_ko?.slice(0, 50) ?? ''` — but if multiple prefix-clusters exist in the same firm (all members share `isClusterMember: true` but have different 50-char prefixes), they are collapsed into one marker with an arbitrary first-item signature and an aggregated count. The detector would emit two separate markers in this case, so the footer and step-summary would disagree on cluster count/identity.
2. **Double source of truth.** Plan 06 (per the header comment referencing "Option 2") accepted the tradeoff, but the invariant "one firm = at most one cluster" is not enforced by the type system or asserted in tests. A future change that produces multi-cluster-per-firm output would silently mis-report.

**Fix:** Either (a) thread `markers: ClusterMarker[]` through `composeDigest → renderHtml` explicitly (Option 1 from the plan), or (b) add an explicit code comment + runtime assertion in `detectHallucinationClusters` guaranteeing "at most one cluster per firm" so the reconstruction is provably safe. Preferred: thread markers — the current reconstruction is silently lossy.

```typescript
// Option A (preferred) — templates.ts
export function renderHtml(
  firms: FirmResult[],
  dateKst: string,
  failed: FirmResult[] = [],
  warnings?: StalenessWarnings,
  markers: ClusterMarker[] = [], // accept authoritative markers
): string {
  // ...
  const dataQualityFooter = renderDataQualityFooter(markers);
```

### WR-02: Input contract comment in detectClusters.ts contradicts real-run invariant

**File:** `src/pipeline/detectClusters.ts:11-13, 65-69`
**Issue:** The header comment says `summary_ko === null items are excluded from signature calculation (possible only on cli-skipped debugging path post-Plan-01; real-run paths now produce title-verbatim)`, but `run.ts:234-238` emits `summary_ko: null` with `summaryModel: 'cli-skipped'` on the `skipGemini` branch, which is reachable from `pnpm check:firm --skip-gemini` — a developer-invoked but real code path. The code correctly handles it (line 69 `continue`), but the comment misleads a future reader into thinking the `null` branch is unreachable in production. Worse, any regression that causes a real-run null (e.g., a new refactor that re-introduces the pre-Phase-8 null placeholder) would silently bypass cluster detection instead of being clustered.

**Fix:** Tighten the comment to match runtime reality, or add a `summaryModel`-based assertion so a real-run `summary_ko === null` (any `summaryModel` other than `'cli-skipped'`) is surfaced as a warning:

```typescript
for (const item of r.summarized) {
  if (item.summary_ko === null) {
    // Defense-in-depth: the only sanctioned null path is the debug
    // cli-skipped branch. Any other null is a pre-Phase-8 regression.
    if (item.summaryModel !== 'cli-skipped') {
      console.warn(
        `[detectClusters] unexpected null summary_ko on non-cli path: firm=${r.firm.id} model=${item.summaryModel}`,
      );
    }
    continue;
  }
  const sig = item.summary_ko.slice(0, SIGNATURE_LENGTH);
  // ...
}
```

### WR-03: Template literal in cluster stderr log is not escaped against quote injection

**File:** `src/pipeline/detectClusters.ts:90-92`
**Issue:** `console.error(\`HALLUCINATION_CLUSTER_DETECTED: firm=${r.firm.id} count=${group.length} signature="${sig}"\`)` — the `sig` is an arbitrary 50-char slice of model output. If the model ever emits a literal `"` or newline in the first 50 chars (Gemini can produce Korean quotes `"`, but also ASCII `"` if echoing English source text), the log line's structured format (`key="value"`) becomes unparseable by downstream log-tail tooling. Test 9 in `clusterDetection.test.ts` asserts the regex `^HALLUCINATION_CLUSTER_DETECTED: firm=\S+ count=\d+ signature=".+"$` matches, which would fail on a model-emitted embedded quote.

This is not a security bug (stderr is not a trust boundary), but it is a log-parseability bug with "aggressive failure detection" implications — a malformed marker line will look the same as a real emission to a grep.

**Fix:** Escape `sig` for the log format only — preserve the underlying signature in the ClusterMarker object:

```typescript
const safeSig = sig.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
console.error(
  `HALLUCINATION_CLUSTER_DETECTED: firm=${r.firm.id} count=${group.length} signature="${safeSig}"`,
);
```

## Info

### IN-01: Schema description in prompt.ts references an "" sentinel but summary_ko type is "string | null"

**File:** `src/summarize/prompt.ts:30-45`
**Issue:** `summarySchema.properties.summary_ko.type` is `['string', 'null']`, but the description instructs Gemini to return `''` (empty string) for the generic-boilerplate case, and the zod validator (`gemini.ts:33`) accepts `z.string().max(800).nullable()` — so three distinct semantic values are funneled through two type slots:
- `null` → "content is completely empty/meaningless"
- `''` → GUARD-01 Layer 2 "generic boilerplate, caller substitutes title"
- `non-empty string` → normal summary

The structured-output endpoint may or may not honor the "return empty string" instruction consistently if it interprets empty as the null case. A safer schema might add an enum-valued sentinel field (e.g. `kind: 'summary' | 'boilerplate' | 'empty'`), but this is a larger design change out of scope for Phase 8. At minimum, add a test asserting Gemini's `''` return is reproducible.

**Fix:** Document the tri-state explicitly in the schema description, or add `confidence: 'low'` + `summary_ko: ''` as the canonical pair and rely on it (test (c) in `gemini.test.ts` already exercises this — keep that test as the lock).

### IN-02: p-retry retry storm on non-transient errors burns quota silently

**File:** `src/summarize/gemini.ts:96-105`
**Issue:** `pRetry(call, { retries: 3 })` retries on ANY thrown error except `AbortError` (which is only raised for ZodError). HTTP 400 "bad request" (malformed prompt), HTTP 401/403 (auth failure), HTTP 404 (model retired) will all retry 3× — wasting 4 Gemini calls against a daily quota ceiling of ~250 RPD on flash. Only HTTP 429 has a specific branch (fallback to flash-lite). The onFailedAttempt hook sees the error but does not abort for permanent-failure status codes.

**Fix:** Add explicit AbortError promotion for non-retriable status codes:

```typescript
onFailedAttempt: ({ error }) => {
  const anyErr = error as unknown as { status?: number; name?: string; message: string };
  // Non-retriable permanent failures — don't burn quota.
  if (anyErr.status && [400, 401, 403, 404].includes(anyErr.status)) {
    throw new AbortError(anyErr.message);
  }
  if (anyErr.status === 429 && model === 'gemini-2.5-flash') {
    model = 'gemini-2.5-flash-lite';
  }
  if (anyErr.name === 'ZodError') throw new AbortError(anyErr.message);
},
```

### IN-03: `JSON.parse(res.text ?? '{}')` may silently bypass schema validation

**File:** `src/summarize/gemini.ts:73`
**Issue:** When `res.text` is `undefined` or `null` (SDK edge case on safety-blocked response), `JSON.parse('{}')` returns `{}`, which then fails `SummaryZ.parse` (missing required `summary_ko` and `confidence`). The ZodError is then promoted to `AbortError` in `onFailedAttempt` — correct behavior, but the error message surfaced upstream ("Required" from zod) is uninformative. A safety-block is materially different from a malformed-response parse error and should be classifiable for triage.

**Fix:** Detect the empty-response case before `JSON.parse`:

```typescript
if (!res.text) {
  throw new AbortError(`Gemini returned empty response (likely safety-blocked) for url=${item.url}`);
}
const parsed = SummaryZ.parse(JSON.parse(res.text));
```

### IN-04: `firms` parameter shadowed in run.ts narrows filter scope by accident

**File:** `src/pipeline/run.ts:144-153`
**Issue:** `let firms = allFirms; if (firmFilter) { ... firms = [match]; }` — the reassigned `firms` is then used at `fetchAll(firms, ...)`. The `hasJsRender` gate at line 161 uses the *filtered* `firms`, not `allFirms`. This is correct for js-render (no need to launch chromium if the filtered firm doesn't need it), but combined with `detectStaleness(seen, allFirms, now)` at line 179 (explicitly uses `allFirms`), there's an inconsistency that a reader must chase: some downstream calls use `firms` (filter-scoped), some use `allFirms` (global). Not a bug, but the variable naming could be sharper.

**Fix:** Rename to make scoping explicit:

```typescript
let scopedFirms = allFirms;
if (firmFilter) { /* ... */ scopedFirms = [match]; }
// Downstream: use scopedFirms for fetching, allFirms for observability.
```

### IN-05: Test file declares unused import `ClusterMarker` from test/pipeline/clusterDetection.test.ts

**File:** `test/pipeline/clusterDetection.test.ts:6-9`
**Issue:** `import { detectHallucinationClusters, type ClusterMarker } from '../../src/pipeline/detectClusters.js';` — `ClusterMarker` is imported but never referenced in this file. Minor lint noise; eslint with `@typescript-eslint/no-unused-vars` (if configured with `{ types: true }`) would flag it.

**Fix:** Drop the type import:

```typescript
import { detectHallucinationClusters } from '../../src/pipeline/detectClusters.js';
```

---

_Reviewed: 2026-04-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
