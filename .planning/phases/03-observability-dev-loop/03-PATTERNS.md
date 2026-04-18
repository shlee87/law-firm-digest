# Phase 3: Observability + Dev Loop — Pattern Map

**Generated:** 2026-04-18
**Purpose:** For each file Phase 3 creates or modifies, identify the closest existing analog in the codebase, capture concrete code excerpts, and enumerate the conventions the executor must mirror (module docstring style, error semantics, pure-function discipline, DRY_RUN gates, test layout).

---

## File-by-File Pattern Map

### NEW: `src/observability/staleness.ts` (Pattern 1, OPS-04/OPS-05)

**Closest analog:** `src/pipeline/filter.ts`

**Why this analog:** Pure function, no I/O, no side effects, module-level invariants documented in a leading comment block, tested with synthetic inputs. `filter.ts` is the canonical "pure pipeline stage" template in the repo.

**Excerpt to mirror (from `src/pipeline/filter.ts` L1-35):**

```typescript
// Pure-function keyword filter — runs between enrichWithBody and dedupAll.
//
// Design invariants (contract locked by test/pipeline/filter.test.ts):
//
//   1. PURE — no I/O, no env reads, no clock access. Same inputs always
//      yield same outputs. Mirror of dedup.ts's invariant #1.
//
//   2. ERROR PASS-THROUGH — ...
//
//   3. NO MUTATION — ...
```

**Conventions to replicate:**

- Top-of-file docstring block starting with the module purpose + numbered invariants list.
- Explicit `NO I/O` / `NO MUTATION` claims in invariant list.
- Single default export function; helpers stay unexported.
- Takes `now: Date = new Date()` as last param for clock injection (mirror of `src/compose/digest.ts`'s `now: Date = new Date()` signature).
- No `isDryRun` import (Pattern 2 DRY_RUN containment).

**Test analog:** `test/pipeline/filter.test.ts`

Excerpt (from `test/pipeline/filter.test.ts` convention — verified by Glob list above):

```typescript
import { describe, it, expect } from 'vitest';
import { applyKeywordFilter } from '../../src/pipeline/filter.js';
// ... baseFirm fixture + describe block per invariant
```

**Conventions:**
- Fixture helpers (`baseFirm`, `makeResult`) at top of file.
- One `describe` block per invariant from the module docstring.
- Fixed-clock tests use `const NOW = new Date('2026-04-18T00:00:00Z');`.

---

### NEW: `src/observability/recorder.ts` (Pattern 4, OPS-08)

**Closest analog:** `src/state/reader.ts` (class-like module with a single entry-point)

**Why this analog:** Single-file, single-responsibility, immutable input/mutable internal state. No analog of a class-based recorder exists in the repo, so we lean on `reader.ts`'s structural shape for consistency.

**Excerpt to mirror (from `src/state/reader.ts` L1-18):**

```typescript
// Single-boundary reader for state/seen.json.
//
// Cold-start / ENOENT semantics: ...
//
// Why silent fallback is confined to ENOENT: ...
```

**Conventions to replicate:**

- Top-level module docstring with "single-boundary" language.
- All types exported alongside the class for downstream imports.
- No I/O, no env access — the recorder is pure state.
- Deterministic iteration order for output (input `firms: FirmConfig[]` array order drives table row order).

**Test analog:** `test/state/writer.test.ts` (nearest class-ish test surface)

**Conventions:**
- `describe('Recorder', () => { ... })` with sub-describes per method (`firm().fetched()`, `toMarkdownTable()`).
- Table snapshot tests use `expect(table).toBe(\`|Firm|...\n|---|...\`)` with backticks, not snapshot files (no existing snapshot setup).

---

### NEW: `src/observability/summary.ts` (Pattern 6, OPS-08)

**Closest analog:** `src/mailer/gmail.ts`

**Why this analog:** Fire-and-forget side-effect boundary with env-var gate, tolerant of missing infrastructure, never-throws contract.

**Excerpt to mirror (from `src/mailer/gmail.ts` L46-54):**

```typescript
export async function sendMail(payload: EmailPayload): Promise<void> {
  // OPS-06 DRY_RUN check site #1 of 2. Must be FIRST — no transporter
  // creation, no SMTP connection, no outbound bytes in DRY_RUN mode.
  if (isDryRun()) {
    console.log('[DRY_RUN] Subject:', payload.subject);
    console.log('[DRY_RUN] HTML body:\n', payload.html);
    return;
  }
  ...
}
```

**Convention to apply (adapted for `summary.ts`):**

```typescript
export async function writeStepSummary(recorder: Recorder, firms: FirmConfig[]): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;  // D-12 no-op
  ...
}
```

**Conventions to replicate:**

- Env var check at top of function, return early on missing.
- `try/catch` around the actual write with `console.warn` on failure (NEVER throw — step-summary failure must not break the workflow).
- `scrubSecrets` applied to error messages before logging (mirror of gmail.ts line 141).

**Test analog:** `test/mailer/gmail.test.ts`

**Conventions:**
- Env var mocking via `vi.stubEnv('GITHUB_STEP_SUMMARY', '/tmp/summary-abc.md')`.
- Temp-file paths generated per test; cleanup in `afterEach`.

---

### NEW: `src/archive/writer.ts` (Pattern 5, OPS-09)

**Closest analog:** `src/state/writer.ts`

**Why this analog:** Direct file write with DRY_RUN gate, atomic-ish semantics, and a module-level docstring that enumerates invariants (especially the DRY_RUN gate + why it exists).

**Excerpt to mirror (from `src/state/writer.ts` L1-43):**

```typescript
// Single-boundary writer for state/seen.json — run-transaction "commit"
// half of the dedup machinery. Called by main.ts AFTER the digest email
// has been successfully sent (or after DRY_RUN short-circuit).
//
// Three invariants this file exists to enforce:
//
//   1. DEDUP-04: MAX_PER_FIRM = 500 — ...
//
//   2. OPS-06: DRY_RUN check site #2 of 2 ...
//
//   3. D-09 / B1: first-run bootstrap MUST seed from r.raw ...
```

**Conventions to replicate:**

- Opening docstring with "Single-boundary writer for <path>" language.
- Numbered invariants list at the top.
- Phase-specific invariant IDs (e.g., "OPS-09 archive writer — DRY_RUN check site #3 of 3").
- `isDryRun()` guard before any disk write.
- `writeFile + rename` pattern (for state); for archive, simpler `mkdir({recursive}) + writeFile` is acceptable because archive files are idempotently overwritable (D-15).

**Test analog:** `test/state/writer.test.ts`

**Conventions:**
- Temp directory per test with `tmpdir() + mkdtemp(...)`.
- `afterEach` cleans up.
- Assert file contents via `readFile` + `toContain` / `toBe`.
- DRY_RUN test asserts NO file exists after the call.

---

### NEW: `src/pipeline/run.ts` (Pattern 2, OPS-07 prerequisite)

**Closest analog:** `src/main.ts` (its source — `run.ts` is the extracted version)

**Why this analog:** `run.ts` IS the extraction of `main.ts`. The executor's job is mechanical: move the composition logic into a parameterized function.

**Excerpt to mirror (from `src/main.ts` L54-142, full composition block):**

```typescript
import pLimit from 'p-limit';
import { loadFirms, loadRecipient } from './config/loader.js';
// ... all imports ...

async function main(): Promise<number> {
  try {
    const firms = await loadFirms();
    const recipient = await loadRecipient();
    const fromAddr = process.env.GMAIL_FROM_ADDRESS ?? ...;
    const seen = await readState();

    const fetched = await fetchAll(firms);
    const enriched = await enrichWithBody(fetched);
    const filtered = applyKeywordFilter(enriched);
    const deduped = dedupAll(filtered, seen);

    const summarizeLimit = pLimit(3);
    const summarized: FirmResult[] = await Promise.all(
      deduped.map(async (r) => { ... }),
    );

    const newTotal = summarized.reduce((n, r) => n + r.summarized.length, 0);
    if (newTotal > 0) {
      const payload = composeDigest(summarized, recipient, fromAddr);
      await sendMail(payload);
    }
    await writeState(seen, summarized);
    return 0;
  } catch (err) {
    console.error('FATAL:', scrubSecrets((err as Error).message));
    return 1;
  }
}
```

**Conventions to replicate:**

- Preserve the full `main.ts` leading docstring (the run-transaction ordering + Pitfall 1 notes) as the leading docstring of `run.ts`. This docstring is load-bearing for future readers.
- `main.ts` after refactor shrinks to ~15 lines: load firms+recipient, call `runPipeline()`, return exit code.
- Option fields in `RunOptions` default to `false` / `undefined` for side-effecting toggles. Safe default = full pipeline behavior (current `main.ts`).
- New side-effect branches (archive write, step-summary write) are gated inside `run.ts`, not outside.

**Test analog:** None yet — no existing integration-style test for `main.ts`. Phase 3 adds `test/pipeline/run.test.ts` exercising `runPipeline` with mocked stages (unit-integration hybrid).

---

### NEW: `src/cli/checkFirm.ts` (Pattern 3, OPS-07)

**Closest analog:** `src/main.ts` (at the "argv parse + invoke main" level)

**Why this analog:** `main.ts`'s structure (top-level async invoke + `process.exit(code)`) is exactly what `checkFirm.ts` needs. No prior CLI-with-argv exists in the repo.

**Excerpt to mirror (from `src/main.ts` L144):**

```typescript
main().then((code) => process.exit(code));
```

**Conventions to apply:**

- Single `main()` async function at module scope.
- `process.exit(code)` at the very end.
- Argv parsing: explicit `process.argv.slice(2)`, no external `commander` or `yargs` dependency (keep dep footprint zero per Phase 3 Research Standard Stack).
- Print `Usage: pnpm check:firm <id> [--save-html <path>]` on missing args + `process.exit(2)`.

**Package.json wiring analog:** existing scripts block:

```json
"scripts": {
  "dev": "tsx src/main.ts",
  "dry-run": "DRY_RUN=1 tsx src/main.ts",
  "test": "vitest run",
  "typecheck": "tsc --noEmit"
}
```

**Pattern:** new entry `"check:firm": "tsx src/cli/checkFirm.ts"` — same `tsx <path>` shape as `dev` / `dry-run`.

**Test analog:** None. The CLI is tested indirectly via `runPipeline` tests + a manual smoke step in the plan.

---

### MODIFY: `src/compose/templates.ts` (Pattern 1 banner render)

**Existing structure (live):**

```typescript
export function renderHtml(
  firms: FirmResult[],
  dateKst: string,
  failed: FirmResult[] = [],
): string {
  const sections = firms.map(...).join('');
  const failedFooter = renderFailedFirmsFooter(failed);
  return `<!doctype html><html><body ...>
    <h1 style="font-size:22px;">법률 다이제스트 ${escapeHtml(dateKst)}</h1>
    ${sections}
    ${failedFooter}
    <footer style="margin-top:32px;color:#888;font-size:12px;">AI 요약 — 원문 확인 필수</footer>
  </body></html>`;
}
```

**Pattern to apply:** Add optional `warnings?: StalenessWarnings` param to `renderHtml`, compose a `stalenessBanner` string from it, insert **between** `<h1>` and `${sections}`. Follow the existing `renderFailedFirmsFooter` pattern — a private helper that returns `''` when there's nothing to show.

**Excerpt to mirror (from `renderFailedFirmsFooter` L96-114):**

```typescript
function renderFailedFirmsFooter(failed: FirmResult[]): string {
  const filtered = failed.filter((f) => !!f.error);
  if (filtered.length === 0) return '';
  // ... compose HTML ...
  return `<footer style="...">...</footer>`;
}
```

**Pattern for new helper:**

```typescript
function renderStalenessBanner(warnings?: StalenessWarnings): string {
  if (!warnings) return '';
  const parts: string[] = [];
  if (warnings.staleFirms.length > 0) { ... }
  if (warnings.lastRunStale) { ... }
  if (parts.length === 0) return '';
  return `<div style="...">...</div>`;
}
```

**Conventions to replicate:**

- Helper stays private (`function` not `export function`). Only `renderHtml` is exported.
- Return `''` when there's nothing to render (consistent with `renderFailedFirmsFooter`).
- Reuse `escapeHtml` (already private to this file — D-P1 invariant: stays LOCAL to templates.ts per 01-08 lock).

**Composer call site (`src/compose/digest.ts`):** extend `composeDigest` signature to accept optional `warnings` and forward to `renderHtml`:

```typescript
export function composeDigest(
  results: FirmResult[],
  recipient: string | string[],
  fromAddr: string,
  warnings?: StalenessWarnings,   // NEW optional param
  now: Date = new Date(),
): EmailPayload {
  // ... existing logic ...
  const html = renderHtml(firmsWithNew, dateKst, firmsWithErrors, warnings);
  return { subject, html, to: recipient, from: fromAddr };
}
```

**Test analog:** `test/compose/digest.test.ts` already exists and tests digest output. Extend with new describe block for staleness banner rendering.

---

### MODIFY: `src/main.ts` (thin wrapper after refactor)

**Before (current, L54-142):** 90 lines of composition logic.

**After (Phase 3):** ~15 lines that:

1. Call `runPipeline()` with full side-effects enabled (`{}` — all defaults).
2. Print `FATAL:` on throw.
3. Return exit code.

**Convention:** Preserve the leading docstring (L1-52). It documents the canonical run-transaction sequence + Pitfall 1 + Pattern 2 DRY_RUN containment. Those notes apply to `run.ts` too, but keeping them on `main.ts` as the *public* entry point is the right reader surface.

---

### MODIFY: `src/types.ts` (add optional `enabledAt` per-firm field)

**Existing (L85-89):**

```typescript
export interface SeenState {
  version: 1;
  lastUpdated: string | null;
  firms: Record<string, { urls: string[]; lastNewAt: string | null }>;
}
```

**After:**

```typescript
export interface SeenState {
  version: 1;
  lastUpdated: string | null;
  firms: Record<string, {
    urls: string[];
    lastNewAt: string | null;
    enabledAt?: string;   // NEW (Phase 3 D-02 bootstrap grace period). Written on first run.
  }>;
}
```

**Convention:** Add a sub-bullet to the leading invariant list (L8-15) documenting the new field:

```
//   - SeenState.firms[].enabledAt is optional — written the first time a firm
//     is processed by the state writer (Phase 3 D-02). Absent on pre-Phase-3
//     state entries, which get implicit backwards-compat treatment in the
//     staleness detector.
```

---

### MODIFY: `src/state/writer.ts` (populate `enabledAt` on bootstrap)

**Existing bootstrap branch (L77-83):**

```typescript
if (isBootstrap) {
  const seededUrls = r.raw.map((x) => x.url).slice(0, MAX_PER_FIRM);
  const lastNewAt =
    r.raw.length > 0 ? r.raw[0]?.publishedAt ?? new Date().toISOString() : null;
  nextFirms[r.firm.id] = { urls: seededUrls, lastNewAt };
  continue;
}
```

**After (Phase 3 D-02):**

```typescript
if (isBootstrap) {
  const seededUrls = r.raw.map((x) => x.url).slice(0, MAX_PER_FIRM);
  const lastNewAt =
    r.raw.length > 0 ? r.raw[0]?.publishedAt ?? new Date().toISOString() : null;
  nextFirms[r.firm.id] = {
    urls: seededUrls,
    lastNewAt,
    enabledAt: new Date().toISOString(),   // NEW (D-02): bootstrap = this firm's enable date
  };
  continue;
}
```

**Non-bootstrap branch:** preserve existing `priorFirm.enabledAt` untouched on subsequent-run merges:

```typescript
const existing = new Set(priorFirm.urls);
const newUrls = r.summarized.map((it) => it.url).filter((u) => !existing.has(u));
const merged = [...newUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM);
const lastNewAt = newUrls.length > 0 ? ... : priorFirm.lastNewAt ?? null;
nextFirms[r.firm.id] = {
  urls: merged,
  lastNewAt,
  ...(priorFirm.enabledAt ? { enabledAt: priorFirm.enabledAt } : {}),  // preserve if present
};
```

**Convention:** Pitfall 9 from RESEARCH.md — do NOT retrofit `enabledAt` onto pre-existing entries that lack it. Only bootstrap branches write the field.

---

### MODIFY: `src/pipeline/fetch.ts` (Recorder integration)

**Existing per-firm try/catch (L47-99):** captures success/failure into `FirmResult`.

**After (Phase 3):** add `recorder: Recorder` parameter, record inside the try and the catch:

```typescript
export async function fetchAll(
  firms: FirmConfig[],
  recorder?: Recorder,   // NEW optional — tests that don't care pass nothing
): Promise<FirmResult[]> {
  ...
  const settled = await Promise.allSettled(
    firms.map((firm) =>
      limit(async (): Promise<FirmResult> => {
        const started = Date.now();
        try {
          ...
          recorder?.firm(firm.id).fetched(raw.length).durationMs(Date.now() - started);
          return { firm, raw, new: [], summarized: [], durationMs: Date.now() - started };
        } catch (err) {
          const errClass = classifyError(/*...*/);  // or just 'fetch-error' placeholder
          recorder?.firm(firm.id).errorClass(errClass).durationMs(Date.now() - started);
          return { firm, raw: [], new: [], summarized: [], error: {...}, durationMs: Date.now() - started };
        }
      }),
    ),
  );
  ...
}
```

**Conventions:**

- Optional parameter — backward-compatible, all existing tests still pass.
- `recorder?.` optional-chain; no crash when undefined.
- Error class uses the SAME `classifyError` helper as `templates.ts` (re-exported per RESEARCH.md A9).

---

### MODIFY: `.github/workflows/daily.yml` (archive file_pattern widening)

**Existing step (L63-66):**

```yaml
- uses: stefanzweifel/git-auto-commit-action@v7
  with:
    commit_message: 'chore(state): update seen items [skip ci]'
    file_pattern: 'state/seen.json'
```

**After:**

```yaml
- uses: stefanzweifel/git-auto-commit-action@v7
  with:
    commit_message: 'chore(state): update seen items and archive [skip ci]'
    file_pattern: 'state/seen.json archive/**/*.html'
```

**Conventions:**

- `[skip ci]` preserved in commit message (Pitfall: infinite workflow loop).
- Space-separated multi-pattern (per git-auto-commit-action v7 docs).
- Commit message mentions both files for audit clarity.

---

### MODIFY: `README.md` (D-16/D-17 four new Korean sections)

**Existing README structure:**

1. Title + description (Korean)
2. `## Setup`
3. `## DRY_RUN`
4. `## Adding a firm` (will be REPLACED with richer D-17 `## 로펌 추가하기`)
5. `## GMAIL_AUTH_FAILURE recovery`
6. `## Copyright and compliance`
7. `## Secrets`

**Phase 3 changes:**

- REPLACE `## Adding a firm` with `## 로펌 추가하기` (richer content per D-17: yaml edit example + DevTools selector extraction procedure).
- ADD `## 시크릿 교체` after Setup (before DRY_RUN is fine — section order is Claude discretion per D-17).
- ADD `## 수동 실행` (workflow_dispatch instructions).
- ADD `## 디버깅` (메일 안 왔어요 flowchart: GHA logs → `pnpm check:firm`).

**Convention:**

- Korean-only prose (D-16) — but fenced code blocks stay English (yaml, bash).
- Follow existing `##` heading level.
- Existing `## Setup`, `## DRY_RUN`, `## GMAIL_AUTH_FAILURE recovery`, `## Copyright and compliance`, `## Secrets` sections STAY UNCHANGED.
- Each new section ≤ 400 words (keeps README scannable).

---

## Cross-cutting Conventions

### Error class taxonomy

**Source of truth:** `src/compose/templates.ts :: classifyError` (currently non-exported at L83-92).

**Phase 3 requirement:** promote to `export function classifyError(...)` so `src/observability/recorder.ts` can re-use it. Rationale (from RESEARCH A9): minimal-diff refactor, no semantic change. Tests for `templates.ts` still assert the footer renders the correct classes; tests for `recorder.ts` assert the same classifier feeds the table.

### DRY_RUN check sites (Pattern 2)

Phase 1 locked this at 2 sites (`mailer/gmail.ts`, `state/writer.ts`). Phase 3 adds #3 in `src/archive/writer.ts` (per R-02 decision). The plan must explicitly update any "DRY_RUN sites = 2" grep gate to 3 and add a new gate confirming `archive/writer.ts` contains the `isDryRun()` check.

### Test file layout

All tests live under `test/<module>/`. Mirror of `src/` tree:

- `test/observability/staleness.test.ts`
- `test/observability/recorder.test.ts`
- `test/observability/summary.test.ts`
- `test/archive/writer.test.ts`
- `test/pipeline/run.test.ts` (new — integration-style test for `runPipeline`)

`check:firm` CLI (`src/cli/checkFirm.ts`) does NOT get a dedicated test — its logic is argv parsing + a single `runPipeline` call. Smoke coverage via a plan-level manual probe.

### Module docstring style

Every new module gets a leading comment block with:

1. One-sentence purpose.
2. Numbered invariants list (why this module exists, what it protects).
3. Explicit mention of any DRY_RUN / Pattern 2 / run-transaction ordering implications.
4. Link back to the requirement IDs (OPS-04, OPS-05, OPS-07, OPS-08, OPS-09).

This is the Phase 1/2 convention — every module in `src/pipeline/`, `src/state/`, `src/mailer/` follows it.

### Import extension rule

All internal imports use `.js` extension despite source files being `.ts` (Node 22 ESM + TypeScript convention used throughout the repo — verified in `src/main.ts`, `src/pipeline/*.ts`, etc.).

### `formatInTimeZone` usage

When forming KST-derived strings (archive path, banner text dates), use `formatInTimeZone(now, 'Asia/Seoul', <format>)` from `date-fns-tz`. Never call `.toLocaleString` — it varies by runtime locale. Existing call sites: `src/compose/digest.ts` L35.

---

## Integration Points Summary

| New/Modified File | Called By | Calls Into |
|-------------------|-----------|------------|
| `src/observability/staleness.ts` (new) | `src/pipeline/run.ts` (step 4) | — (pure) |
| `src/observability/recorder.ts` (new) | `src/pipeline/fetch.ts`, `src/pipeline/run.ts` | — (pure state) |
| `src/observability/summary.ts` (new) | `src/pipeline/run.ts` (finally block) | `fs.promises.appendFile` |
| `src/archive/writer.ts` (new) | `src/pipeline/run.ts` (after mailer success) | `fs.promises.mkdir + writeFile`, `isDryRun` |
| `src/pipeline/run.ts` (new) | `src/main.ts`, `src/cli/checkFirm.ts` | everything above + existing pipeline stages |
| `src/cli/checkFirm.ts` (new) | `pnpm check:firm` script | `loadFirms`, `runPipeline` |
| `src/compose/templates.ts` (mod) | existing + new `runPipeline` | new `renderStalenessBanner` private helper |
| `src/compose/digest.ts` (mod) | existing + new `runPipeline` | extended signature with `warnings?` |
| `src/main.ts` (mod) | `node main.ts` | `runPipeline()` |
| `src/types.ts` (mod) | everywhere | — |
| `src/state/writer.ts` (mod) | `runPipeline` final step | — |
| `src/pipeline/fetch.ts` (mod) | `runPipeline` step 5 | optional `recorder` |
| `.github/workflows/daily.yml` (mod) | GHA runtime | — |
| `README.md` (mod) | humans | — |
| `package.json` (mod) | `pnpm check:firm` | — |

---

## Reference Line Numbers (accurate as of 2026-04-18)

| Reference | File | Lines |
|-----------|------|-------|
| Run-transaction ordering docstring | `src/main.ts` | 1-52 |
| Full main.ts composition block | `src/main.ts` | 54-142 |
| `renderHtml` function | `src/compose/templates.ts` | 43-75 |
| `classifyError` function (to be exported) | `src/compose/templates.ts` | 83-92 |
| `renderFailedFirmsFooter` (analog for banner) | `src/compose/templates.ts` | 98-114 |
| `composeDigest` signature | `src/compose/digest.ts` | 27-40 |
| `sendMail` DRY_RUN gate (analog for archive) | `src/mailer/gmail.ts` | 47-54 |
| `writeState` bootstrap branch (for enabledAt retrofit) | `src/state/writer.ts` | 73-83 |
| `writeState` DRY_RUN gate | `src/state/writer.ts` | 106-117 |
| `fetchAll` Promise.allSettled + per-firm try/catch | `src/pipeline/fetch.ts` | 41-124 |
| `applyKeywordFilter` pure function template | `src/pipeline/filter.ts` | 38-63 |
| `SeenState` interface | `src/types.ts` | 85-89 |
| `readState` ENOENT behavior (analog for resilient reads) | `src/state/reader.ts` | 25-38 |
| Existing git-auto-commit step | `.github/workflows/daily.yml` | 63-66 |
| Existing scripts block (for `check:firm`) | `package.json` | 6-11 |
