---
phase: 03-observability-dev-loop
verified: 2026-04-18T11:03:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 3: Observability + Dev Loop — Verification Report

**Phase Goal:** Silent rot (one firm quietly returning zero items for weeks) becomes observable — in the digest itself, in GHA step summary, and via a single-firm CLI probe. The builder can diagnose and fix a firm without pushing to main and waiting for cron.
**Verified:** 2026-04-18T11:03:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Artificially setting a firm's `lastNewAt` back 31 days causes the next digest to display a staleness warning at the top of the email with that firm listed | VERIFIED | `src/observability/staleness.ts:44-82` — `detectStaleness` computes 30-day threshold (`STALE_FIRM_THRESHOLD_MS = 30*24*60*60*1000` at L36); `src/compose/templates.ts:141-156` — `renderStalenessBanner` emits `⚠ 30일 이상 새 글 없음: <names>` between `<h1>` and `${sections}` at L74; `src/pipeline/run.ts:148,248` wires `detectStaleness → composeDigest(warnings)`. Tests: `test/observability/staleness.test.ts` (20/20 pass) + `test/compose/digest.test.ts` banner test (stale-firm 31d → banner). |
| 2 | If the previous successful run is more than 30 hours old, the next digest's header shows a "previous run missed — N hours since last run" banner | VERIFIED | `src/observability/staleness.ts:37,85-91` — `STALE_RUN_THRESHOLD_MS = 30*60*60*1000`; emits `lastRunStale: { hoursAgo: Math.floor(...) }`. `src/compose/templates.ts:148-151` — Korean banner `⚠ 이전 실행 누락 — N시간 전 마지막 성공 실행`. Tests cover 29h (no fire), 30h (fire), 31h (fire), 72h (floor). |
| 3 | `pnpm check:firm <id>` runs a single firm end-to-end (raw fetch → parsed items → would-summarize → would-render) and prints each stage's output without sending an email or writing state | VERIFIED | `package.json:9` — `"check:firm": "tsx src/cli/checkFirm.ts"`; `src/cli/checkFirm.ts:65-72` — `runPipeline({ firmFilter, skipEmail: true, skipStateWrite: true, skipGemini: true, saveHtmlPath, reporter: new CliReporter() })`. Behavioral spot-check (invalid id): exit 1 with `Firm not found: ... Valid ids: bkl, clifford-chance, ...`. Empty args exits 2 with usage message. `CliReporter.section` logs each stage (fetch/enrich/filter/dedup/would-summarize/would-render). |
| 4 | Each GHA run publishes a markdown table to `$GITHUB_STEP_SUMMARY` listing per-firm fetched / new / summarized / errors / duration | VERIFIED | `src/observability/recorder.ts:109-120` — `toMarkdownTable` emits exact 5-column D-10 header: `\| Firm \| Fetched \| New \| Summarized \| Errors \| Duration \|`. `src/observability/summary.ts:35-53` — `writeStepSummary` appends to `$GITHUB_STEP_SUMMARY`, env-gated no-op when unset, never-throws (Pitfall 10). `src/pipeline/run.ts:280-284` wires it in a `finally` block so partial runs still emit the snapshot. Recorder threaded through `fetchAll` (`src/pipeline/run.ts:152`), `dedup` newCount (L183), `summarize` summarized (L223-228). Tests: `test/observability/recorder.test.ts` (13 pass) + `test/observability/summary.test.ts` (4 pass). |
| 5 | Every sent digest is committed to `archive/YYYY/MM-DD.html` in-repo so the history is greppable via `git log` | VERIFIED | `src/archive/writer.ts:47-76` — `writeArchive(html, now?, baseDir?)`: KST path via `formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd')`; `mkdir({ recursive: true })` bootstraps missing year directory; `writeFile` overwrites (D-15); DRY_RUN gate is check site #3 of 3. `src/pipeline/run.ts:258-265` — `writeArchive(payload.html)` runs AFTER `sendMail` resolves (consistency invariant: no orphan archive). `.github/workflows/daily.yml:68` — `file_pattern: 'state/seen.json archive/**/*.html'` commits HTML alongside state. Tests: `test/archive/writer.test.ts` (10 pass). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types.ts` | `SeenState.firms[id].enabledAt?: string` | VERIFIED | L89-100: optional `enabledAt?: string` field present with Phase 3 D-02 inline comment and leading invariant docstring bullet. |
| `src/state/writer.ts` | enabledAt written on bootstrap, preserved on merge, no retrofit | VERIFIED | L87-96 bootstrap writes `enabledAt: new Date().toISOString()`; L115-118 preserves via conditional spread `...(priorFirm.enabledAt ? { enabledAt: priorFirm.enabledAt } : {})`; Pitfall 9 no-retrofit invariant intact. |
| `src/compose/templates.ts` | `classifyError` exported + `renderStalenessBanner` private helper | VERIFIED | L92 `export function classifyError`; L141-156 private `function renderStalenessBanner` (NOT exported — preserves Phase 1 01-08 LOCKED escape boundary); L70,74 banner interpolated between `<h1>` and sections. |
| `src/observability/recorder.ts` | `Recorder` class + `toMarkdownTable` | VERIFIED | L62-121: class with chainable `firm(id)` handle (fetched/newCount/summarized/errorClass/durationMs), `get()`, and `toMarkdownTable(firms)` emitting D-10 5-column table. Disabled-firm filter at L113. |
| `src/observability/summary.ts` | `writeStepSummary` env-gated + never-throws | VERIFIED | L35-53: env-gated no-op (L40-41), try/catch with `[step-summary]` warn prefix (L47-52). Zero `throw` statements; zero `writeFile` calls (append-only). |
| `src/observability/staleness.ts` | Pure `detectStaleness(seen, firms, now?)` | VERIFIED | L44-94: pure function, no I/O, no env reads. Constants L36-37 hard-code D-01 (30 days) and D-03 (30 hours). D-02 grace period at L63-68; Pitfall 1 disabled-firm filter at L54; cold-start at L86. |
| `src/archive/writer.ts` | `writeArchive` with KST path + DRY_RUN gate | VERIFIED | L47-76: KST via `formatInTimeZone`, `mkdir recursive` bootstrap, `writeFile` overwrite, `isDryRun()` gate #3 prints `[DRY_RUN] would write archive` and returns path without disk write. |
| `src/compose/digest.ts` | `composeDigest` extended with `warnings?` | VERIFIED | L28-42: `warnings?: StalenessWarnings` param inserted BEFORE `now` (Pattern 2 contract); forwarded to `renderHtml` at L40. |
| `src/pipeline/run.ts` | `runPipeline` composition root | VERIFIED | L110-287: single composition root with `RunOptions { firmFilter, skipEmail, skipStateWrite, skipGemini, saveHtmlPath, reporter }`; orchestrates all 15 canonical steps; `writeStepSummary` in finally block at L280-284; `writeArchive` after sendMail at L264. |
| `src/cli/checkFirm.ts` | CLI wrapper with skip flags | VERIFIED | L49-81: calls `runPipeline` with `skipEmail: true, skipStateWrite: true, skipGemini: true`. Exit codes: 0 success, 1 error, 2 usage. |
| `src/main.ts` | Thin wrapper over runPipeline | VERIFIED | L57-71: `await runPipeline({})` + top-level catch. |
| `.github/workflows/daily.yml` | file_pattern widened | VERIFIED | L68: `file_pattern: 'state/seen.json archive/**/*.html'`. |
| `package.json` | check:firm script | VERIFIED | L9: `"check:firm": "tsx src/cli/checkFirm.ts"`. |
| `README.md` | D-17 four Korean sections | VERIFIED | L45 `## 시크릿 교체`, L68 `## 로펌 추가하기`, L109 `## 수동 실행`, L126 `## 디버깅` — all four present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/state/writer.ts` | `src/types.ts` | SeenState extension used | WIRED | L118 uses `priorFirm.enabledAt`, types match at L95. |
| `src/compose/templates.ts` | `src/observability/recorder.ts` (classifyError) | Recorder consumes classifyError via export | WIRED | `classifyError` exported at templates.ts:92; Recorder stores errorClass strings (set from `classifyError` by callers in pipeline/fetch.ts). |
| `src/observability/summary.ts` | `src/observability/recorder.ts` | `recorder.toMarkdownTable(firms)` | WIRED | summary.ts:43 calls `recorder.toMarkdownTable(firms)`. |
| `src/pipeline/run.ts` | `src/observability/staleness.ts` | `detectStaleness(seen, allFirms)` | WIRED | run.ts:148 — `const warnings = detectStaleness(seen, allFirms);` |
| `src/pipeline/run.ts` | `src/compose/digest.ts` | `composeDigest(summarized, recipient, fromAddr, warnings)` | WIRED | run.ts:248 passes `warnings` 4th arg. |
| `src/compose/templates.ts` | `src/observability/staleness.ts` | StalenessWarnings type + renderStalenessBanner | WIRED | templates.ts:41 imports `StalenessWarnings`; renderHtml signature at L44-49 accepts `warnings?`; banner rendered at L70,74. |
| `src/pipeline/run.ts` | `src/archive/writer.ts` | `writeArchive(payload.html)` | WIRED | run.ts:264 after sendMail at L259; gated on `!skipEmail && newTotal > 0`. |
| `src/pipeline/run.ts` | `src/observability/summary.ts` | `writeStepSummary(recorder, allFirms)` in finally | WIRED | run.ts:283 in try/finally block; recorder instance from L120, threaded through all stages. |
| `src/archive/writer.ts` | `src/env.ts` | `isDryRun()` check site #3 | WIRED | writer.ts:60 — `if (isDryRun()) { ... return filePath; }`. Repo-wide aggregate: exactly 3 `isDryRun()` sites (mailer + state writer + archive writer). |
| `.github/workflows/daily.yml` | `src/archive/writer.ts` | git-auto-commit file_pattern includes archive/**/*.html | WIRED | L68: `file_pattern: 'state/seen.json archive/**/*.html'`. |
| `package.json` | `src/cli/checkFirm.ts` | `check:firm` script | WIRED | L9. Verified via behavioral spot-check (pnpm check:firm nonexistent-firm → exit 1 with firm list). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderStalenessBanner(warnings)` | `warnings.staleFirms` / `warnings.lastRunStale` | `detectStaleness(seen, allFirms)` over real `SeenState` from `readState()` | Yes — iterates loaded firms × seen.firms, applies 30d/30h thresholds with D-02 grace. 20 unit tests lock determinism. | FLOWING |
| `Recorder.toMarkdownTable(firms)` | `this.metrics` Map | Populated by `fetchAll` per-firm writes (fetched/durationMs/errorClass), `runPipeline` dedup loop (newCount L183), summarize loop (summarized L223-228) | Yes — recorder instance flows from runPipeline L120 through all stages; real metrics accumulate. | FLOWING |
| `writeStepSummary(recorder, firms)` | `recorder.toMarkdownTable(firms)` output appended to `$GITHUB_STEP_SUMMARY` | Env var set by GHA runner (real path) OR empty locally (no-op) | Yes in CI / intentional no-op locally — append-only semantics confirmed by `test/observability/summary.test.ts` "appends (does not clobber)" test. | FLOWING |
| `writeArchive(html)` | `payload.html` from `composeDigest` → actual rendered HTML including banner + sections + failed footer | `composeDigest(summarized, recipient, fromAddr, warnings)` | Yes — real composed HTML written to `archive/YYYY/MM-DD.html`. | FLOWING |
| `detectStaleness(seen, firms)` output | `{ staleFirms: string[], lastRunStale: { hoursAgo } | null }` | Inputs from `readState()` (seen) + `loadFirms()` (firms) — both real at runtime | Yes — pure function over real SeenState that carries per-firm lastNewAt and enabledAt. | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| check:firm CLI rejects missing arg with usage message | `pnpm check:firm` | `Usage: pnpm check:firm <id> [--save-html <path>]` | PASS |
| check:firm CLI rejects unknown firm id with valid-ids listing | `pnpm check:firm nonexistent-firm` | `Firm not found: nonexistent-firm. Valid ids: bkl, clifford-chance, cooley, freshfields, kim-chang, logos, shin-kim, skadden, yulchon` (exit 1) | PASS |
| Typecheck is clean | `pnpm typecheck` | exit 0, no errors | PASS |
| Full test suite is green | `pnpm vitest run` | **18 test files passed, 202 tests passed** | PASS |
| DRY_RUN discipline holds (three sanctioned sites) | `grep -rc "isDryRun()" src/ \| awk ...` | `3` — exactly the three canonical sites (mailer + state writer + archive writer) | PASS |
| D-17 README has four Korean operational sections | `grep -c "^## " README.md` and section names | 시크릿 교체, 로펌 추가하기, 수동 실행, 디버깅 all present | PASS |
| daily.yml commits archive HTML | `grep file_pattern .github/workflows/daily.yml` | `file_pattern: 'state/seen.json archive/**/*.html'` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OPS-04 | 03-01, 03-03 | 로펌별 `lastNewAt` 30일↑ → 다이제스트 상단 staleness 경고 | SATISFIED | `detectStaleness` 30-day threshold + `renderStalenessBanner` at top of email. 20 staleness tests + 7 digest banner tests. |
| OPS-05 | 03-03 | 이전 실행 30시간↑ → digest header last-run staleness | SATISFIED | `lastRunStale: { hoursAgo }` computed from `seen.lastUpdated`; banner "이전 실행 누락 — N시간 전 마지막 성공 실행". Tests cover 29/30/31/72h boundaries. |
| OPS-07 | 03-05 | `pnpm check:firm <id>` CLI single-firm end-to-end | SATISFIED | `package.json` script + `src/cli/checkFirm.ts` + `runPipeline` with skip flags. Behavioral spot-check confirms. |
| OPS-08 | 03-02, 03-05 | $GITHUB_STEP_SUMMARY per-firm markdown table | SATISFIED | `Recorder.toMarkdownTable` + `writeStepSummary` in finally block. 13 recorder tests + 4 summary tests. |
| OPS-09 | 03-04, 03-05 | archive/YYYY/MM-DD.html committed to repo | SATISFIED | `writeArchive` with KST path + daily.yml file_pattern widening. 10 archive writer tests. |

All 5 Phase 3 requirements (OPS-04, OPS-05, OPS-07, OPS-08, OPS-09) are SATISFIED. No orphaned requirements found — REQUIREMENTS.md Phase 3 mapping exactly matches plan-declared requirement IDs.

### Anti-Patterns Found

None identified. Notes:
- `src/observability/summary.ts` contains zero `throw` statements (Pitfall 10 discipline).
- `src/archive/writer.ts` is the only new `isDryRun()` site; the repo-wide aggregate is exactly 3 sanctioned sites.
- `escapeHtml` / `escapeAttr` remain file-local in `src/compose/templates.ts` (Phase 1 01-08 LOCKED invariant preserved — confirmed via `grep -c "^export function escapeHtml" = 0`).
- `renderStalenessBanner` is NOT exported — preserves the render boundary.
- Hardcoded empty arrays in `Recorder` defaults (`fetched: 0, new: 0, ...`) are initial state overwritten by pipeline writes; not stubs.
- Phase 3 REVIEW.md lists 3 warnings + 5 info items (0 critical) — advisory follow-ups explicitly flagged as non-blocking.

### Human Verification Required

None. All five ROADMAP success criteria are verifiable programmatically via code inspection + unit tests. The pipeline composition root (`runPipeline`) is integration-tested with mocked stage boundaries (test/pipeline/run.test.ts) confirming ordering and finally-block execution. No UI/visual/real-time behaviors that require a human.

### Gaps Summary

No gaps found. All five ROADMAP success criteria are met in actual source code:

1. **Firm staleness banner (SC-1):** `detectStaleness` flags firms with `lastNewAt` ≥ 30 days ago (excluding D-02 bootstrap-grace and disabled firms); `renderStalenessBanner` emits the warning between `<h1>` and sections; `runPipeline` wires the full path.

2. **Last-run staleness banner (SC-2):** `detectStaleness` emits `lastRunStale: { hoursAgo }` when `seen.lastUpdated` is ≥ 30 hours old; banner wording matches ROADMAP spec.

3. **check:firm CLI (SC-3):** `package.json` script + `src/cli/checkFirm.ts` runs single firm through full pipeline with email/state/Gemini skipped; stage output via `CliReporter`. Behavioral spot-check confirms usability.

4. **Step summary table (SC-4):** `Recorder` + `toMarkdownTable` emits the exact 5-column format; `writeStepSummary` appends to `$GITHUB_STEP_SUMMARY` with env-gated no-op and never-throw discipline; wired in finally block.

5. **Archive commit (SC-5):** `writeArchive` writes KST-derived `archive/YYYY/MM-DD.html`; `runPipeline` calls it after `sendMail` success; daily.yml `file_pattern` commits the HTML.

All 202 tests in 18 test files pass. Typecheck is clean. DRY_RUN discipline preserved at 3 canonical sites. D-17 README Korean sections complete.

Phase 3 REVIEW.md advisory items (0 critical, 3 warnings, 5 info) are explicitly non-blocking per the verification context.

---

_Verified: 2026-04-18T11:03:00Z_
_Verifier: Claude (gsd-verifier)_
