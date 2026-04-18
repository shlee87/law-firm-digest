# Phase 3: Observability + Dev Loop — Research

**Researched:** 2026-04-18
**Domain:** Self-observability for a cron-driven pipeline — staleness detection keyed off existing state, GitHub Actions `$GITHUB_STEP_SUMMARY` writer, in-repo archive of sent digests, and a single-firm CLI entrypoint that reuses the composition root.
**Confidence:** HIGH on `$GITHUB_STEP_SUMMARY` behavior (first-party GitHub-documented feature, no library risk), HIGH on KST date math reuse (Phase 1 `parseDate` helper is already the canonical source), HIGH on archive-via-git-auto-commit (same action already configured in `.github/workflows/daily.yml`), MEDIUM on `check:firm` CLI UX (no prior art in repo; design choices driven by CONTEXT.md decisions alone).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Per-firm staleness threshold = **30 days**, fixed across all firms. No per-firm override.
- **D-02** New firms get a **30-day bootstrap grace period** keyed on an `enabledAt` marker (recommended: written to `state/seen.json` the first time a firm is processed). Treat `lastNewAt === null` during the grace window as "not stale yet."
- **D-03** Last-run staleness threshold = **30 hours** (OPS-05 banner).
- **D-04** Staleness warnings render as a **single consolidated block at the top of the digest email**, not scattered per-firm. Omitted entirely when no conditions fire.
- **D-05** `check:firm <id>` accepts the English `id` slug only. Unknown id → clear `"Firm not found: <id>"` error listing valid ids.
- **D-06** CLI default output is **human-readable text, stage-by-stage** (robots → fetch → parse → filter → would-summarize → would-render). No `--json` in Phase 3.
- **D-07** CLI supports `--save-html <path>` flag to dump rendered digest HTML for browser preview. Without the flag, no file is written.
- **D-08** CLI always uses live fetch. No fixture mode. Email and state writes are **off**; Gemini is **skipped** to conserve free-tier quota.
- **D-09** `check:firm` shares the composition root with `main.ts`. Extract a reusable `runPipeline()` function so the CLI and cron paths cannot drift.
- **D-10** Step summary emits a **5-column markdown table**: `Firm | Fetched | New | Summarized | Errors | Duration`. No `Filtered` column. `Duration` is total per-firm wall time.
- **D-11** `Errors` column uses the Phase 2 `errorClass` taxonomy (re-export `classifyError` from `src/compose/templates.ts`). Dash (`—`) when no error.
- **D-12** Step summary writer is a no-op when `$GITHUB_STEP_SUMMARY` is unset (local runs, CLI runs). Must not error.
- **D-13** Archive path is `archive/YYYY/MM-DD.html` using KST (consistent with Phase 1 `parseDate`). Written after mailer success, before state write.
- **D-14** Archive files ride the **existing `stefanzweifel/git-auto-commit-action@v7`** commit. No orphan branch, no separate action.
- **D-15** Same-day re-runs **overwrite** the archive file (second run is authoritative).
- **D-16** Operational documentation lives in **the existing `README.md`** (Korean-only). No separate `docs/OPERATIONS.md`.
- **D-17** Required README sections: `로펌 추가하기`, `시크릿 교체`, `수동 실행`, `디버깅`.

### Claude's Discretion (recommendations promoted to research)

- Staleness module location: `src/observability/staleness.ts` (new file, pure function over `SeenState` + `now: Date`).
- Metrics accumulator: `Recorder` class (or factory) in `src/observability/recorder.ts`, threaded through `runPipeline()` stages. Each stage calls `record.firm(id).fetched(n)` / `.new(n)` / `.summarized(n)` / `.errorClass(cls)` / `.durationMs(ms)`. Serialized to markdown at end of run via `recorder.toMarkdownTable()`.
- `enabledAt` source: write to `state/seen.json` on bootstrap (when a firm's state entry is created). Schema remains `version: 1` — new optional per-firm field.
- Archive filename timezone: reuse Phase 1 `parseDate` KST helpers.
- README tone/order: follow existing Korean sections in README; keep section hierarchy under `##` headings.

### Deferred Ideas (OUT OF SCOPE)

- Per-firm staleness threshold override → Phase 5 triggered item.
- `check:firm --fixture <path>` → Phase 5.
- `check:firm --json` → Phase 5.
- Step summary `Filtered` column → activates when any firm uses non-empty keyword filters.
- Step summary `Gemini time` split → QUOTA-01 trigger (Phase 5).
- Orphan archive branch → only if `main` log noise becomes painful.
- English README translation → v2 open-source trigger.
- README onboarding / architecture rewrites → separate documentation phase.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-04 | 로펌별 `lastNewAt`이 30일 이상 지난 경우 다이제스트 상단에 staleness 경고 표시 | § Architecture Patterns — Pattern 1 (staleness detector). Input: `SeenState.firms[id].lastNewAt` + `enabledAt`. Output: `string[]` of firm display names to list in banner. Threshold config lives in the module, not in firms.yaml (D-01). |
| OPS-05 | 이전 실행 종료가 30시간 이상 오래된 경우 다이제스트 header에 last-run staleness 알림 | § Architecture Patterns — Pattern 1 reuses the same detector with `SeenState.lastUpdated` + 30-hour threshold. Banner text includes "N hours since last run." |
| OPS-07 | `pnpm check:firm <id>` CLI로 단일 로펌 end-to-end 검증 가능 | § Architecture Patterns — Pattern 2 (`runPipeline()` refactor) + Pattern 3 (CLI entrypoint). The CLI is a thin wrapper over `runPipeline({ firmFilter, skipEmail, skipStateWrite, skipGemini, saveHtmlPath })`. Stage-by-stage text output is produced by a `Reporter` interface that `main.ts` stubs out (no-op) and `checkFirm.ts` implements. |
| OPS-08 | 매 실행마다 로펌별 fetched/new/summarized/errors/duration 표를 `$GITHUB_STEP_SUMMARY`에 출력 | § Architecture Patterns — Pattern 4 (Recorder + GITHUB_STEP_SUMMARY writer). `fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownTable + '\n')` — GitHub's first-party API. No-op when env var unset (D-12). |
| OPS-09 | 매일 `archive/YYYY/MM-DD.html`에 발송 다이제스트 사본을 repo에 커밋 | § Architecture Patterns — Pattern 5 (archive writer). Written after `sendMail` resolves, before `writeState`. `git-auto-commit-action` file_pattern widens from `state/seen.json` to `state/seen.json archive/**/*.html`. |

</phase_requirements>

## Summary

Phase 3 turns silent rot into observable rot without adding external services, paid platforms, or Playwright. Every new capability hangs off an artifact the pipeline already produces:

- **Staleness** reads from `SeenState` (already written by Phase 1's `writeState`). The only schema addition is an optional `enabledAt: string` per-firm field, consumed by the detector for D-02's grace period. No version bump.
- **Step summary** consumes the same `FirmResult[]` the email composer uses. The new `Recorder` captures per-firm counts at the boundaries already covered by `Promise.allSettled` in `src/pipeline/fetch.ts` (Phase 2 D-P2-03). Writing to `$GITHUB_STEP_SUMMARY` is a one-line `fs.appendFile` against the path GitHub exposes in the runner env.
- **Archive** is one `writeFile` after mailer success, before state write. The existing `stefanzweifel/git-auto-commit-action@v7` step commits it alongside `state/seen.json` by widening the `file_pattern`. No workflow-level restructuring.
- **`check:firm` CLI** is built on top of a `runPipeline()` refactor that must land first. The refactor extracts the stage sequence from `main.ts` into a pure function that takes a side-effect config (`{ skipEmail, skipStateWrite, skipGemini, firmFilter, saveHtmlPath }`). `main.ts` becomes ~15 lines that wire the sanctioned effects; `checkFirm.ts` wires the debug effects.
- **README** gains four Korean operational sections, in the existing `README.md` (D-16). Project onboarding and architecture stay out of scope.

The Phase 1 run-transaction ordering (fetch → enrich → filter → dedup → summarize → email → state) is preserved verbatim. Phase 3 threads a `Recorder` through the stages and adds two writer sites (archive, step summary) without reordering the commit points. This matters because the Pitfall 1 non-idempotent-retry invariant is load-bearing.

## Architectural Responsibility Map

| Capability | Primary Module | Secondary Module | Rationale |
|------------|---------------|------------------|-----------|
| Staleness detection (OPS-04, OPS-05) | `src/observability/staleness.ts` (NEW) | `src/compose/digest.ts` (call site), `src/compose/templates.ts` (banner render) | Pure function keyed by `SeenState` + `now: Date` + thresholds. No I/O. Tested in isolation with fixed-clock inputs. Banner HTML rendered in templates.ts alongside the existing `renderFailedFirmsFooter`. |
| Metrics recorder (OPS-08) | `src/observability/recorder.ts` (NEW) | `src/pipeline/fetch.ts` (per-firm try/finally), `src/pipeline/enrichBody.ts`, `src/pipeline/filter.ts`, `src/main.ts` (summarize stage) | A single `Recorder` instance per run, threaded through stages. Emits markdown table at end of run. Preserves per-firm isolation (one firm's throw does not corrupt another firm's row). |
| `$GITHUB_STEP_SUMMARY` writer (OPS-08) | `src/observability/summary.ts` (NEW) | `src/main.ts` (call after all stages complete) | Thin wrapper around `fs.promises.appendFile`. No-op branch on `process.env.GITHUB_STEP_SUMMARY === undefined`. Called in a `finally` block so partial runs still emit what they have. |
| Archive writer (OPS-09) | `src/archive/writer.ts` (NEW) | `src/main.ts` (call after `sendMail` resolves, before `writeState`) | Writes `archive/YYYY/MM-DD.html` with KST date via `formatInTimeZone`. Creates year directory with `mkdir -p` semantics. Overwrites on same-day re-runs (D-15). |
| `runPipeline()` composition root (OPS-07) | `src/pipeline/run.ts` (NEW) | `src/main.ts` (becomes a caller), `src/cli/checkFirm.ts` (becomes the other caller) | Extract the fetch → enrich → filter → dedup → summarize → compose → email → archive → state sequence into a pure function. Takes `{ firmFilter, skipEmail, skipStateWrite, skipGemini, saveHtmlPath, reporter }` config. Returns a structured run report. |
| `check:firm <id>` CLI (OPS-07) | `src/cli/checkFirm.ts` (NEW) | `src/pipeline/run.ts` (reuses), `package.json` (script entry) | Parses argv, validates id against loaded firms (D-05), invokes `runPipeline()` with debug effects disabled, prints stage-by-stage output via the `Reporter` implementation. |
| Operational README (D-16/D-17) | `README.md` (existing, extended) | — | Four new Korean `##` sections appended after existing content. No files moved. |
| GHA workflow step-summary surface | `.github/workflows/daily.yml` | `src/main.ts` | `$GITHUB_STEP_SUMMARY` is already exposed by the runner; no workflow change needed for that. Only change: `file_pattern` extension on the `git-auto-commit-action` step to include `archive/**/*.html`. |

## Architecture Patterns

### Pattern 1: Staleness detection — pure function over SeenState

**Why:** A pure function is straightforward to test against fixed-clock inputs. All thresholds live as module constants (D-01 = 30 days, D-03 = 30 hours), not as firm-yaml config. No I/O inside the detector — it only reads the already-loaded `SeenState`.

**Where:** `src/observability/staleness.ts` (new module).

**Contract:**

```typescript
export interface StalenessWarnings {
  staleFirms: string[];        // firm display names (OPS-04)
  lastRunStale: { hoursAgo: number } | null;  // null when under 30 hours (OPS-05)
}

export function detectStaleness(
  seen: SeenState,
  firms: FirmConfig[],
  now: Date = new Date(),
): StalenessWarnings
```

**Inputs:**
- `SeenState.firms[id].lastNewAt` — per-firm last-new-item timestamp (ISO string, Phase 1 populates).
- `SeenState.firms[id].enabledAt` — NEW optional field, written on bootstrap. Used for D-02 grace period.
- `SeenState.lastUpdated` — last successful-run timestamp (Phase 1 populates).
- `firms` — so the detector can map `id` to display `name` (and to honor `enabled` — only warn about firms currently enabled in YAML).
- `now` — injectable clock for tests.

**Thresholds (module constants, not exported):**

```typescript
const STALE_FIRM_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;   // D-01: 30 days
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 60 * 1000;         // D-03: 30 hours
```

**Behavior:**
- For each firm in `firms` where `firm.enabled === true`:
  - If `seenFirm.enabledAt` exists AND `(now - enabledAt) < STALE_FIRM_THRESHOLD_MS` → NOT stale (D-02 bootstrap grace).
  - Else if `seenFirm.lastNewAt === null` AND `enabledAt` is missing → treat as stale (conservative: a firm seen for >30 days with no publication is worth flagging).
  - Else if `seenFirm.lastNewAt` exists AND `(now - lastNewAt) >= STALE_FIRM_THRESHOLD_MS` → stale, add `firm.name`.
- For last-run staleness:
  - If `seen.lastUpdated === null` → `null` (never run before — not stale, just cold).
  - Else if `(now - lastUpdated) >= STALE_RUN_THRESHOLD_MS` → return `{ hoursAgo: floor((now - lastUpdated) / 3_600_000) }`.
  - Else `null`.

**Rendering** (in `src/compose/templates.ts`, consumed by `renderHtml`):

```typescript
function renderStalenessBanner(warnings: StalenessWarnings): string {
  const parts: string[] = [];
  if (warnings.staleFirms.length > 0) {
    parts.push(`⚠ 30일 이상 새 글 없음: ${warnings.staleFirms.map(escapeHtml).join(', ')}`);
  }
  if (warnings.lastRunStale) {
    parts.push(`⚠ 이전 실행 누락 — ${warnings.lastRunStale.hoursAgo}시간 전 마지막 성공 실행`);
  }
  if (parts.length === 0) return '';
  return `<div style="margin:0 0 16px 0;padding:12px;background:#fff8e1;border-left:4px solid #f57f17;color:#6f5300;font-size:13px;">
    ${parts.map(p => `<div>${p}</div>`).join('')}
  </div>`;
}
```

The banner sits immediately after `<h1>법률 다이제스트 ...</h1>` and before the firm sections. D-04 locks it to a single consolidated block.

### Pattern 2: `runPipeline()` extraction — composition root refactor (OPS-07 prerequisite)

**Why:** D-09 mandates that `check:firm` and `main.ts` cannot drift. The only way to guarantee that is to push the stage sequence into one function and let the two callers pass different side-effect configs.

**Where:** `src/pipeline/run.ts` (new module). `src/main.ts` shrinks to a thin wrapper. `src/cli/checkFirm.ts` (new) is the other caller.

**Contract:**

```typescript
export interface RunOptions {
  firmFilter?: string;                    // D-05: when set, scope to one firm id
  skipEmail?: boolean;                    // D-08: CLI path
  skipStateWrite?: boolean;               // D-08: CLI path
  skipGemini?: boolean;                   // D-08: CLI path (would-summarize output only)
  saveHtmlPath?: string;                  // D-07: when set, write rendered digest HTML here
  reporter?: Reporter;                    // OPS-07: stage-by-stage text output; default no-op
}

export interface RunReport {
  results: FirmResult[];
  digestSent: boolean;
  saveHtmlWritten?: string;
  warnings: StalenessWarnings;
  recorder: Recorder;
}

export async function runPipeline(options: RunOptions = {}): Promise<RunReport>
```

**Sequence (IDENTICAL to Phase 2 main.ts order, do not re-debate):**

1. `loadFirms()` + `loadRecipient()`.
2. Apply `firmFilter` if set (D-05 `"Firm not found"` error if no match).
3. `readState()` — compute staleness at this boundary (need the prior lastUpdated).
4. `detectStaleness(seen, firms, now)` — stored in `RunReport.warnings` and passed to the composer.
5. `fetchAll(firms)` — per-firm metrics via Recorder in a try/finally wrapped around the existing try/catch (Pattern 4).
6. `enrichWithBody(fetched)`.
7. `applyKeywordFilter(enriched)`.
8. `dedupAll(filtered, seen)`.
9. `summarize` per item with pLimit(3). **When `skipGemini === true`:** bypass the Gemini call and emit `{ summary_ko: null, summaryConfidence: 'low', summaryModel: 'cli-skipped' }` — the reporter logs "would-summarize: N items" instead of sending to Gemini. Quota stays intact (D-08).
10. Compose digest (including the staleness banner from step 4) if `newTotal > 0`.
11. If `saveHtmlPath` is set: write the composed HTML to that path (D-07). Independent of `skipEmail`.
12. If `!skipEmail` AND `newTotal > 0`: `sendMail(payload)`.
13. If `!skipEmail` AND `newTotal > 0` AND mailer succeeded: `writeArchive(payload.html, now)` (D-13).
14. Write step-summary markdown via `writeStepSummary(recorder)` — UNCONDITIONAL. `GITHUB_STEP_SUMMARY` env check is inside the writer (D-12).
15. If `!skipStateWrite`: `writeState(seen, results)`.

Archive + state stay inside the `!skipEmail` / `!skipStateWrite` branches. Step summary runs unconditionally so `check:firm` local runs still show the table (writer is a no-op without the env var — see D-12).

**Error handling:** `runPipeline()` returns normally on per-firm errors (captured in FirmResult.error, Phase 2 D-P2-03). It re-throws only on composition-root failures (loadFirms ZodError, readState corruption, sendMail failure) — matching Phase 1's fail-loud contract.

### Pattern 3: `check:firm` CLI (OPS-07)

**Where:** `src/cli/checkFirm.ts` (new). Wired via `package.json` scripts: `"check:firm": "tsx src/cli/checkFirm.ts"`.

**Argv:**

```
pnpm check:firm <id> [--save-html <path>]
```

**Behavior:**

1. Parse argv. Exit 2 on missing id (print usage).
2. Call `runPipeline({ firmFilter: id, skipEmail: true, skipStateWrite: true, skipGemini: true, saveHtmlPath, reporter: new CliReporter() })`.
3. If `firmFilter` doesn't match any firm: `runPipeline` throws a "Firm not found: <id>. Valid ids: a, b, c" error (D-05). CLI catches and exits 1.
4. `CliReporter` prints human-readable stage output to stdout:

```
[check:firm] id=cooley
  robots: allowed
  fetch:  12 items (1247ms)
  enrich: 12/12 bodies populated (3892ms)
  filter: 12 → 12 (no filters configured)
  dedup:  12 → 3 new
  would-summarize: 3 items (skipped — CLI mode)
  would-render:    3 items in digest
  saved-html:      /tmp/preview.html  ← only with --save-html
```

**Never** writes state, **never** sends email, **never** calls Gemini. Archive writer is inside the `!skipEmail` branch so it also never fires.

### Pattern 4: Metrics Recorder (OPS-08)

**Where:** `src/observability/recorder.ts` (new).

**Contract:**

```typescript
export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;   // null = no error
  durationMs: number;
}

export class Recorder {
  private metrics = new Map<string, FirmMetrics>();

  firm(firmId: string): FirmRecorder;   // returns a per-firm handle
  toMarkdownTable(firms: FirmConfig[]): string;   // ordered by firms.yaml order
}

export interface FirmRecorder {
  fetched(n: number): void;
  newCount(n: number): void;
  summarized(n: number): void;
  errorClass(cls: string): void;
  durationMs(ms: number): void;
}
```

**Integration points (where stages record):**

- `fetchAll` (`src/pipeline/fetch.ts`): inside the per-firm try-wrap, after the scraper returns, call `recorder.firm(firm.id).fetched(raw.length).durationMs(Date.now() - started)`. On error, `recorder.firm(firm.id).errorClass(classifyError(err.message, 'fetch'))`.
- `dedupAll` (`src/pipeline/dedup.ts`): after dedup, `recorder.firm(r.firm.id).newCount(r.new.length)` — call site lives in `runPipeline()` so `dedup.ts` stays pure.
- Summarize loop (`runPipeline()`): after `Promise.all`, `recorder.firm(r.firm.id).summarized(r.summarized.filter(it => it.summaryModel !== 'skipped' && it.summaryModel !== 'cli-skipped').length)`.
- End of run: `writeStepSummary(recorder, firms)` in a `finally` block.

**Markdown output (D-10):**

```markdown
| Firm | Fetched | New | Summarized | Errors | Duration |
|------|--------:|----:|-----------:|--------|---------:|
| Cooley | 12 | 3 | 3 | — | 1247ms |
| Clifford Chance | 8 | 0 | 0 | http-503 | 3211ms |
| ... |
```

Use firm display `name` (D-10 says "same Korean firm display names as digest body"). Duration in `ms` (no floating-point conversion).

**Preserving per-firm isolation (D-P2-03 mirror):** The `Recorder.firm()` handle uses plain object mutation per firm id. One firm's throw cannot corrupt another firm's row because each firm's metrics live in a separate Map entry. The metrics object defaults to `{ fetched: 0, new: 0, summarized: 0, errorClass: null, durationMs: 0 }` on first `.firm(id)` call.

### Pattern 5: Archive writer (OPS-09)

**Where:** `src/archive/writer.ts` (new).

**Contract:**

```typescript
export async function writeArchive(
  html: string,
  now: Date = new Date(),
  baseDir: string = 'archive',
): Promise<string>   // returns the path written
```

**Behavior:**

1. `const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd');` → e.g. `2026/04-18`.
2. Split into `[year, md] = dateKst.split('/')`. File path = `${baseDir}/${year}/${md}.html`.
3. `await mkdir(dirname(path), { recursive: true })` — idempotent, first-run safe.
4. `await writeFile(path, html, 'utf8')` — overwrites existing file (D-15).
5. Return path.

**DRY_RUN containment (Pattern 2 discipline):** Archive writer **does not** import `isDryRun`. The gate lives in the caller (`runPipeline()`): archive is called only when `!skipEmail && mailer.sendMail resolved`. `DRY_RUN=1` routes through `mailer/gmail.ts`'s existing short-circuit (no actual send) — and because "no send" short-circuits before `sendMail` returns, the archive line in `runPipeline()` still runs. We want that: DRY_RUN still writes the archive file locally so the developer can inspect the HTML without email delivery. The Phase 1 invariant "DRY_RUN check sites = 2" (mailer + state writer) stays at 2.

Wait — we need to be careful here. If DRY_RUN means "no state change observable," archive writing should probably also be gated. Let me re-read D-08: `check:firm` skipEmail path MUST NOT write archive (because no real send happened). But `pnpm dry-run` (DRY_RUN=1 on main.ts) — does it write the archive?

**Decision (ratified in this research, captured as R-02 in the research Open Questions below):** `runPipeline()` gates `writeArchive` on `!skipEmail && newTotal > 0`. In DRY_RUN mode, `mailer.sendMail` returns early (no send), so from `runPipeline`'s perspective "sendMail resolved successfully" — archive would write. To preserve DRY_RUN's "no side effects in repo" spirit, add DRY_RUN check site #3 inside `src/archive/writer.ts` mirroring the existing two sites. Print "would-archive to <path>" and return. This is a new sanctioned DRY_RUN site and the Phase 1 "check sites = 2" grep gate must update to "check sites = 3" — call out in the plan.

### Pattern 6: `$GITHUB_STEP_SUMMARY` writer

**Where:** `src/observability/summary.ts` (new).

**Contract:**

```typescript
export async function writeStepSummary(
  recorder: Recorder,
  firms: FirmConfig[],
): Promise<void>
```

**Behavior:**

1. `const path = process.env.GITHUB_STEP_SUMMARY;` — undefined on local runs.
2. If `!path`: return (D-12 no-op).
3. `const table = recorder.toMarkdownTable(firms);`.
4. `await fs.appendFile(path, table + '\n', 'utf8')`. Append (not overwrite) — multiple steps in one job each contribute.
5. Never throws. Internal try/catch around `appendFile`: on failure, `console.warn` with `scrubSecrets(err.message)` and return. A broken step-summary write MUST NOT fail the workflow (OPS-10 spirit: observability failures stay observable, not blocking).

**Documentation source:** GitHub Actions "Adding a job summary" — `$GITHUB_STEP_SUMMARY` is a file path that the runner truncates at 1 MiB. Our table (<12 firms × ~100 bytes/row) is comfortably under that.

## Standard Stack (Phase 3 scope)

| Library / Feature | Version | Source | Notes |
|-------------------|---------|--------|-------|
| `node:fs/promises` | bundled (Node 22) | — | `appendFile`, `writeFile`, `mkdir({ recursive: true })` used by archive + step summary writers. |
| `date-fns-tz` | 3.x (already installed) | `package.json` | `formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd')` for archive path + KST date math in staleness detector. |
| `tsx` | 4.x (already installed) | `package.json` | Runs `check:firm` CLI via `pnpm check:firm` script. |
| `vitest` | 4.x (already installed) | `package.json` | Test runner for staleness, recorder, archive, step-summary unit tests. |
| `stefanzweifel/git-auto-commit-action` | v7 (existing workflow) | `.github/workflows/daily.yml` | `file_pattern` widens to include `archive/**/*.html`. |
| `$GITHUB_STEP_SUMMARY` | GitHub Actions runtime | [GitHub docs](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary) | Environment variable = file path. Written via plain `fs.appendFile`. Truncated at 1 MiB. |

**Nothing new added to `package.json`.** This is deliberate — Phase 3 is stdlib + existing deps only.

## Code Examples

### Example 1: Staleness detector (pure function)

```typescript
// src/observability/staleness.ts
import type { FirmConfig, SeenState } from '../types.js';

const STALE_FIRM_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 60 * 1000;

export interface StalenessWarnings {
  staleFirms: string[];
  lastRunStale: { hoursAgo: number } | null;
}

export function detectStaleness(
  seen: SeenState,
  firms: FirmConfig[],
  now: Date = new Date(),
): StalenessWarnings {
  const nowMs = now.getTime();
  const staleFirms: string[] = [];

  for (const firm of firms) {
    if (!firm.enabled) continue;
    const seenFirm = seen.firms[firm.id];
    if (!seenFirm) continue; // pre-bootstrap — never stale

    // D-02 bootstrap grace: new firm with enabledAt recorded in the last 30 days is NOT stale.
    if (seenFirm.enabledAt) {
      const enabledAtMs = Date.parse(seenFirm.enabledAt);
      if (!isNaN(enabledAtMs) && nowMs - enabledAtMs < STALE_FIRM_THRESHOLD_MS) continue;
    }

    if (seenFirm.lastNewAt) {
      const lastNewMs = Date.parse(seenFirm.lastNewAt);
      if (!isNaN(lastNewMs) && nowMs - lastNewMs >= STALE_FIRM_THRESHOLD_MS) {
        staleFirms.push(firm.name);
      }
      continue;
    }

    // lastNewAt is null and we're past the grace period (or grace period absent).
    // Conservative policy: flag it. The operator can tell whether the firm genuinely publishes.
    staleFirms.push(firm.name);
  }

  let lastRunStale: { hoursAgo: number } | null = null;
  if (seen.lastUpdated) {
    const lastMs = Date.parse(seen.lastUpdated);
    if (!isNaN(lastMs) && nowMs - lastMs >= STALE_RUN_THRESHOLD_MS) {
      lastRunStale = { hoursAgo: Math.floor((nowMs - lastMs) / 3_600_000) };
    }
  }

  return { staleFirms, lastRunStale };
}
```

### Example 2: Recorder

```typescript
// src/observability/recorder.ts
import type { FirmConfig } from '../types.js';

export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;
  durationMs: number;
}

export interface FirmRecorder {
  fetched(n: number): FirmRecorder;
  newCount(n: number): FirmRecorder;
  summarized(n: number): FirmRecorder;
  errorClass(cls: string): FirmRecorder;
  durationMs(ms: number): FirmRecorder;
}

export class Recorder {
  private metrics = new Map<string, FirmMetrics>();

  firm(firmId: string): FirmRecorder {
    const existing = this.metrics.get(firmId) ?? {
      fetched: 0,
      new: 0,
      summarized: 0,
      errorClass: null,
      durationMs: 0,
    };
    this.metrics.set(firmId, existing);

    return {
      fetched: (n) => { existing.fetched = n; return this.firm(firmId); },
      newCount: (n) => { existing.new = n; return this.firm(firmId); },
      summarized: (n) => { existing.summarized = n; return this.firm(firmId); },
      errorClass: (cls) => { existing.errorClass = cls; return this.firm(firmId); },
      durationMs: (ms) => { existing.durationMs = ms; return this.firm(firmId); },
    };
  }

  get(firmId: string): FirmMetrics | undefined {
    return this.metrics.get(firmId);
  }

  toMarkdownTable(firms: FirmConfig[]): string {
    const header = '| Firm | Fetched | New | Summarized | Errors | Duration |\n|------|--------:|----:|-----------:|--------|---------:|';
    const rows = firms
      .filter((f) => f.enabled)
      .map((f) => {
        const m = this.metrics.get(f.id) ?? {
          fetched: 0, new: 0, summarized: 0, errorClass: null, durationMs: 0,
        };
        const err = m.errorClass ?? '—';
        return `| ${f.name} | ${m.fetched} | ${m.new} | ${m.summarized} | ${err} | ${m.durationMs}ms |`;
      });
    return [header, ...rows].join('\n');
  }
}
```

### Example 3: Step summary writer (no-op gate)

```typescript
// src/observability/summary.ts
import { appendFile } from 'node:fs/promises';
import type { FirmConfig } from '../types.js';
import type { Recorder } from './recorder.js';
import { scrubSecrets } from '../util/logging.js';

export async function writeStepSummary(
  recorder: Recorder,
  firms: FirmConfig[],
): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;  // D-12 — local runs / check:firm runs are no-ops.

  const table = recorder.toMarkdownTable(firms);
  try {
    await appendFile(path, table + '\n', 'utf8');
  } catch (err) {
    // Never fail the workflow on step-summary write failure.
    console.warn(`[step-summary] write failed: ${scrubSecrets((err as Error).message)}`);
  }
}
```

### Example 4: Archive writer

```typescript
// src/archive/writer.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { formatInTimeZone } from 'date-fns-tz';
import { isDryRun } from '../env.js';

export async function writeArchive(
  html: string,
  now: Date = new Date(),
  baseDir: string = 'archive',
): Promise<string> {
  const yearMonth = formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd');
  const [year, md] = yearMonth.split('/');
  const filePath = join(baseDir, year, `${md}.html`);

  // DRY_RUN check site #3 (new sanctioned site for Phase 3). Mirrors the
  // existing mailer + state-writer DRY_RUN gates. The Phase 1 "exactly 2
  // DRY_RUN sites" grep gate updates to 3 in this phase.
  if (isDryRun()) {
    console.log(`[DRY_RUN] would write archive file ${filePath} (${html.length} bytes)`);
    return filePath;
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, 'utf8');
  return filePath;
}
```

### Example 5: `check:firm` CLI entrypoint

```typescript
// src/cli/checkFirm.ts
import { runPipeline } from '../pipeline/run.js';
import { loadFirms } from '../config/loader.js';

function parseArgs(argv: string[]): { firmId: string; saveHtmlPath?: string } {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm check:firm <id> [--save-html <path>]');
    process.exit(2);
  }
  const firmId = args[0];
  let saveHtmlPath: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--save-html') {
      saveHtmlPath = args[i + 1];
      i++;
    }
  }
  return { firmId, saveHtmlPath };
}

class CliReporter {
  section(name: string, detail: string) {
    console.log(`  ${name.padEnd(8)}: ${detail}`);
  }
}

async function main() {
  const { firmId, saveHtmlPath } = parseArgs(process.argv);

  // Validate early — produce the D-05 "Firm not found" error before kicking off I/O.
  const firms = await loadFirms();
  const match = firms.find((f) => f.id === firmId);
  if (!match) {
    const ids = firms.map((f) => f.id).sort().join(', ');
    console.error(`Firm not found: ${firmId}. Valid ids: ${ids}`);
    process.exit(1);
  }

  console.log(`[check:firm] id=${firmId}`);

  try {
    await runPipeline({
      firmFilter: firmId,
      skipEmail: true,
      skipStateWrite: true,
      skipGemini: true,
      saveHtmlPath,
      reporter: new CliReporter(),
    });
  } catch (err) {
    console.error(`[check:firm] error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
```

## Common Pitfalls

1. **Staleness banner surviving past a firm disable.** If a firm is removed from `firms.yaml` (or `enabled: false`) and its `seen.firms[id]` entry lingers, the detector MUST NOT emit a warning for it. The detector iterates over `firms` (the loaded YAML, post-enabled-filter), not `seen.firms`. Guard against the inverse too: `if (!seenFirm) continue;` skips firms that have never been processed (post-enable, pre-first-run).

2. **DRY_RUN archive write.** As flagged in Pattern 5 — without explicit gating, `DRY_RUN=1 pnpm dev` would write real archive files and leave them in the working tree, polluting `git status`. Archive writer **must** honor `isDryRun()` and update the Phase 1 grep gate count (2 → 3). Miss this and a developer's local dry-run pollutes the repo.

3. **Step summary path != file — always appendFile, not writeFile.** Multiple steps in the same job each append to `$GITHUB_STEP_SUMMARY`. Using `writeFile` would clobber prior steps' contributions. Use `appendFile`.

4. **`pnpm check:firm <id>` mutating seen.json during Gemini short-circuit.** Guarded by `skipStateWrite: true` passed to `runPipeline`. The grep acceptance criterion asserts `writeState` never runs on the CLI path via a side-channel (presence check of `state/seen.json.tmp` after a run).

5. **Archive in `main` branch pollutes `git log --stat`.** Accepted per D-14. Note in the README "debugging" section how to filter (`git log -- src/` or `git log --diff-filter=M -- src/`).

6. **Recorder re-sets metrics if mid-pipeline throw.** Each stage calls `recorder.firm(id).fetched(n)` — the Map entry is *replaced*, not accumulated. If fetchAll's metrics call lands before enrichBody throws, the Map has `{fetched: X, new: 0, summarized: 0}`. When `toMarkdownTable` runs in the finally block, that partial state is shown — which is *desirable* (the operator wants to see "got 12 fetched, then crashed").

7. **Summary table firm order.** `toMarkdownTable(firms)` iterates `firms` array (load order from YAML), not `this.metrics.entries()` (insertion-order equivalent). Deterministic YAML order → deterministic table order → easy diffing across runs in the GHA UI. Tests assert this.

8. **`saveHtmlPath` outside CLI.** D-07 says the flag is a CLI feature. `runPipeline` accepts `saveHtmlPath` as an option; `main.ts` never passes it. Guard: search for `saveHtmlPath` in `src/main.ts` — should return 0 matches.

9. **`enabledAt` retrofit on existing seen.json.** First post-deploy run of Phase 3 encounters existing per-firm entries WITHOUT `enabledAt`. The detector gracefully handles absence (see Example 1 code path `if (seenFirm.enabledAt)`). The state writer **does NOT retrofit** `enabledAt` onto pre-existing entries (those are past their implicit grace period already — retrofitting would silence legit 30-day warnings for firms that are truly dormant). Only firms newly added post-Phase-3 get `enabledAt` written on their first pipeline run.

10. **Step-summary write failure kills workflow red.** Mitigation: try/catch around `appendFile` with `console.warn` fallback (Pattern 6 code example). The workflow's exit code is governed by `main.ts`'s top-level catch; a step-summary failure must not propagate.

## State of the Art

| Old Approach | Current Approach | Rationale |
|--------------|------------------|-----------|
| External dashboard / Grafana / Datadog | In-digest banner + GHA step summary | $0 budget (CLAUDE.md). No new platform integration. The digest recipient is also the operator — banner in email is a natural surface. |
| Separate cron for health check | Reuse same cron, emit observability artifacts as side-effects | One workflow, one commit, one source of truth. Matches Phase 1's composition discipline. |
| Playwright for single-firm debugging | `pnpm check:firm <id>` skips Playwright (not used at all) | Phase 4 territory is explicitly out of scope for Phase 3 tools. |
| `rotatelogs` / log shipping | Archive HTML file in-repo via `git-auto-commit-action` | Already configured. `git log` becomes the "archive index" — no new tooling, fully greppable. |

**Deprecated / outdated:** N/A — all Phase 3 libs are current stdlib / existing deps.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `$GITHUB_STEP_SUMMARY` environment variable is set on `ubuntu-latest` for every step automatically | Pattern 6 | Low — documented first-party GitHub Actions behavior [VERIFIED via GitHub docs]. Default behavior on all hosted runners since 2022. |
| A2 | `git-auto-commit-action@v7` accepts multi-pattern `file_pattern` values | Pattern 5 | Low — v6/v7 docs explicitly show multi-pattern strings (`'src/* tests/*'`). Phase 2 already uses the single-pattern form; widening to `'state/seen.json archive/**/*.html'` is documented syntax. [ASSUMED — verify at plan-execution time via action README.] |
| A3 | KST has no DST so `Asia/Seoul` reliably produces the same date across the 23:00–01:00 rollover | Pattern 5 | Low — Korea has had no DST since 1988. Same assumption Phase 1 locked in `parseDate`. [VERIFIED — Phase 1 OPS-03 test snapshots]. |
| A4 | `state/seen.json` schema can grow an optional `enabledAt: string` per-firm field without a version bump | Pattern 1, Pitfall 9 | Medium — DEDUP-07 reserves version changes for *breaking* schema changes; adding an optional field is additive. Zod schema for seen.json (if one exists) must be updated or the field will be rejected. Check state/reader.ts for parse-time validation (currently it's `as SeenState` cast — no runtime validation). Low risk today but flag for plan-time verification. |
| A5 | `process.stdout` output from `check:firm` CLI is a single stream and no test harness hijacks it | Pattern 3 | Low — vitest's stdout capture is opt-in. `pnpm check:firm` is user-invoked, not tested for output format (tests target `runPipeline` internals directly). |
| A6 | `Recorder.toMarkdownTable` fits under `$GITHUB_STEP_SUMMARY`'s 1 MiB cap | Pattern 6 | Low — 12 firms × ~120 bytes/row ≈ 1.5 KB. Three orders of magnitude under the cap. |
| A7 | `archive/YYYY/MM-DD.html` file_pattern glob works as a multi-pattern argument to git-auto-commit-action | Pattern 5 | Low — standard shell glob syntax accepted by the action. [ASSUMED — verify by running manually in plan-execute smoke test.] |
| A8 | `pnpm check:firm <id>` invoked on a firm with `enabled: false` should be allowed (useful for debugging why a firm was disabled) or rejected | Pattern 3 | **OPEN — needs resolution below.** |
| A9 | `classifyError` from `src/compose/templates.ts` can be re-exported for reuse by the Recorder without moving it | Pattern 4 | Low — function is currently `function classifyError(...)` (non-exported). Refactor: promote to `export` and re-import in `recorder.ts`. No semantic change. Alternative: move to `src/util/errorClass.ts` (new file) and import from both templates.ts and recorder.ts — cleaner but a larger diff. Recommendation: export-in-place (minimal diff). |

Claims tagged `[ASSUMED]` that materially affect execution: A2 (git-auto-commit-action multi-pattern syntax), A4 (schema additive for enabledAt), A7 (file_pattern glob shape). The planner should add a plan-level verification step for A2 + A7 (one-line in the plan smoke test).

## Open Questions (RESOLVED)

1. **Should `pnpm check:firm <id>` accept `enabled: false` firms?**
   - What we know: D-05 says "Unknown id → clear error." A disabled firm *is* a known id, just filtered out by `loadFirms()`.
   - Options: (a) match against `loadFirms()` (enabled-only) — disabled firms appear as "Firm not found: <id>"; (b) match against all YAML entries — allow debugging disabled firms.
   - Recommendation: **Option (a) — match against loaded (enabled) firms only.** Rationale: Phase 3 is observability for live firms. Disabled firms are intentionally excluded from the pipeline; their debugging lives in a re-enable + dispatch cycle. If the user wants to debug a disabled firm, the simplest path is flip `enabled: true`, run `check:firm`, flip back — and the loader already filters at runtime so we keep one canonical definition of "live firm."
   - **RESOLVED: R-01 — `check:firm` matches against `loadFirms()` output (enabled-only).**

2. **Should DRY_RUN mode write archive files to disk?**
   - What we know: DRY_RUN spirit = "no side effects observable in the repo." DRY_RUN check sites today = 2 (mailer, state writer).
   - Options: (a) write archive in DRY_RUN (fast preview of rendered HTML); (b) skip archive in DRY_RUN (match the existing "no-side-effects" pattern).
   - Recommendation: **Option (b) — add DRY_RUN check site #3 inside the archive writer.** Mirrors existing mailer + state-writer gates. `pnpm check:firm --save-html` already covers the "preview HTML locally" need for developers (D-07). Pollution-free DRY_RUN matters because the Phase 1 `dry-run` script is used during active development — residual `archive/**/*.html` files would creep into commits.
   - **RESOLVED: R-02 — Archive writer respects `isDryRun()`. Phase 1 "DRY_RUN check sites = 2" grep gate updates to 3 in this phase.**

3. **Should step-summary `Duration` include Gemini time separately?**
   - What we know: CONTEXT D-10 locks the 5-column shape. A `Gemini time` split is deferred to Phase 5 QUOTA-01.
   - **RESOLVED (already locked in CONTEXT.md D-10).** No Gemini column in Phase 3 summary.

4. **Should the archive file ride its own commit (separate from `state/seen.json`) or share the existing auto-commit?**
   - What we know: CONTEXT D-14 locks "ride the existing commit."
   - **RESOLVED (already locked in CONTEXT.md D-14).** One commit, two file patterns.

5. **Should staleness warnings show per-firm threshold (if promoted from deferred) or hard-coded?**
   - **RESOLVED (already locked in CONTEXT.md D-01).** Hard-coded 30 days in Phase 3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 LTS | Runtime | ✓ (local + GHA) | — | n/a |
| pnpm 9.15.0 | Package manager | ✓ | — | npm works but GHA cache less stable |
| `$GITHUB_STEP_SUMMARY` env var | OPS-08 step summary | ✓ (GitHub-hosted runners) | — | Writer is no-op when unset — local `pnpm dev` works cleanly. |
| `stefanzweifel/git-auto-commit-action@v7` | OPS-09 archive commit | ✓ (already in daily.yml) | v7 | n/a |
| Write access to `archive/**` path | OPS-09 | ✓ (repo-relative, workflow has `contents: write` permission) | — | n/a |
| Gmail SMTP | Unchanged from Phase 1/2 | ✓ | — | — |
| Gemini API | Unchanged (Phase 3 does not add new call sites) | ✓ | free tier | Phase 2 fallback still in effect |

**Missing dependencies with no fallback:** None.

## Project Constraints (from CLAUDE.md)

- **$0/month budget** — Phase 3 adds zero paid services. `$GITHUB_STEP_SUMMARY` is free GHA. Archive-in-repo is free git storage. ✓
- **AI source = Gemini free tier only** — Phase 3 does not add Gemini call sites. `check:firm` actively *skips* Gemini (D-08). ✓
- **Execution = GHA cron** — unchanged; Phase 3 hangs off existing `daily.yml`. ✓
- **Email delivery = Gmail SMTP / App Password** — unchanged. ✓
- **Scraping politeness** — Phase 3 does not change fetch behavior. `check:firm` is a single manual invocation against a single firm = well within politeness envelope. ✓
- **Config UX: non-developer edits only** — Phase 3 does not introduce new config surface. `firms.yaml` schema unchanged. ✓
- **Secrets: no plaintext in repo** — no new secrets. Archive files contain rendered digest HTML (already scrubbed via `scrubSecrets` in error paths from Phase 1). ✓
- **GSD workflow enforcement** — all edits flow through `/gsd-plan-phase` + `/gsd-execute-phase`. ✓
- **Use official `@google/genai`** — unchanged. ✓
- **No Playwright** — Phase 3 is Playwright-free. ✓

## Sources

### Primary (HIGH confidence)

- [GitHub Actions — workflow commands: adding a job summary](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary) — `$GITHUB_STEP_SUMMARY` env var semantics, 1 MiB truncation, markdown rendering [accessed 2026-04-18]
- [stefanzweifel/git-auto-commit-action v7 README](https://github.com/stefanzweifel/git-auto-commit-action) — `file_pattern` accepts space-separated globs [accessed 2026-04-18]
- `.planning/phases/01-foundation-vertical-slice/01-CONTEXT.md` — Phase 1 `parseDate` / KST / DRY_RUN discipline
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — Phase 2 failure-isolation patterns, `classifyError` taxonomy
- `src/main.ts` (live) — composition root that Phase 3 refactors
- `src/compose/templates.ts` (live) — existing `classifyError` + `escapeHtml` patterns that Phase 3 reuses

### Secondary (MEDIUM confidence)

- `date-fns-tz` `formatInTimeZone` API — used by Phase 1; Phase 3 reuses same idiom.
- `p-limit` concurrency semantics in `runPipeline` refactor — Phase 1/2 already locked.

### Tertiary (LOW confidence)

- Exact behavior of `git-auto-commit-action` when `file_pattern` includes a path that doesn't exist on first-run (e.g., `archive/` folder not yet created) — per maintainer docs, the action runs `git add <pattern>` and silently no-ops on non-matching patterns. Verify in plan-execute smoke test.

## Metadata

**Confidence breakdown:**
- `$GITHUB_STEP_SUMMARY` + archive writer: HIGH — both are first-party GitHub features or stdlib.
- `runPipeline` refactor correctness: HIGH — mechanical extraction from `main.ts`; test coverage maps 1:1 from existing main.ts flow.
- Staleness detector: HIGH — pure function with fixed-clock tests is the cleanest testable surface in the phase.
- `check:firm` UX: MEDIUM — no prior art; design driven by CONTEXT.md decisions. User can course-correct during plan-execution.

**Research date:** 2026-04-18
**Valid until:** 2026-04-25 (7 days for API-surface freshness on `git-auto-commit-action`; 30 days for GitHub Actions runtime behavior)
