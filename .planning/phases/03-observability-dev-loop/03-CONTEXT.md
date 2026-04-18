# Phase 3: Observability + Dev Loop - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 targets **OPS-04, OPS-05, OPS-07, OPS-08, OPS-09** from REQUIREMENTS.md. It makes silent rot observable and gives the builder a dev loop that does not require pushing to `main` and waiting for cron.

**In scope:**
- Staleness detection + email banner (per-firm 30-day, last-run 30-hour)
- GitHub Actions step summary with per-firm run metrics
- Daily digest archive committed to `archive/YYYY/MM-DD.html`
- `pnpm check:firm <id>` CLI for single-firm end-to-end dry run
- Operational `README.md` sections (add-a-firm, secret rotation, manual dispatch, debugging)

**Out of scope (explicitly):**
- External observability platforms (Grafana/Datadog)
- Gemini quota/cost tracking (Phase 5 `QUOTA-01` triggered item)
- Retry policy tuning (Phase 2 owns failure classification)
- JS-rendered tier metrics (Phase 4)
- Project onboarding / architecture rewrites in README (separate documentation phase)

</domain>

<decisions>
## Implementation Decisions

### Staleness detection (OPS-04, OPS-05)
- **D-01:** Per-firm staleness threshold is **30 days, fixed across all firms**. No per-firm override in `firms.yaml`. If specific firms need different thresholds later, promote as a Phase 5 triggered item.
- **D-02:** New firms with `lastNewAt = null` get a **30-day bootstrap grace period**. The detector treats "enabled date" as the reference point; a firm recently added to `firms.yaml` does not produce a staleness warning until 30 days elapse. Claude decides where to source the "enabled date" from (state record vs. firm config — recommended: write a `enabledAt` marker to `state/seen.json` the first time a firm is processed).
- **D-03:** Last-run staleness threshold is **30 hours** (matches OPS-05). Triggers a "previous run missed — N hours since last run" banner.
- **D-04:** Staleness warnings render as a **single consolidated block at the top of the digest email**, not scattered per-firm section. When no staleness conditions are met, the block is omitted entirely.

### `pnpm check:firm <id>` CLI (OPS-07)
- **D-05:** Firm identifier accepts the **English `id` slug only** (e.g. `pnpm check:firm cooley`). No partial / Korean name matching in Phase 3. Unknown id → clear `"Firm not found: <id>"` error listing valid ids.
- **D-06:** Default output is **human-readable text**, stage-by-stage (robots → fetch → parse → filter → would-summarize → would-render). `--json` flag is **not** included in Phase 3. (Deferred to Phase 5 if test automation requires structured output.)
- **D-07:** CLI supports `--save-html <path>` flag to write the rendered digest HTML to disk for browser preview. Without the flag, no HTML file is written.
- **D-08:** CLI **always** uses live fetch — no fixture mode in Phase 3. (`--fixture` flag deferred.) Write + email are gated off regardless: `check:firm` must never mutate `state/seen.json` and never call `nodemailer.sendMail`. Gemini calls are **skipped** (would-summarize output) to conserve quota during debug sessions.
- **D-09:** `check:firm` shares the composition root with `main.ts`. The production pipeline must be refactored into a single reusable function (e.g. `runPipeline({ firmFilter, skipEmail, skipStateWrite, skipGemini, saveHtmlPath })`) so the CLI and cron paths cannot drift.

### GitHub Actions Step Summary (OPS-08)
- **D-10:** Step summary emits a **5-column markdown table**: `Firm | Fetched | New | Summarized | Errors | Duration`. No `Filtered` column (D-P2-17 makes filter defaults empty; all firms would show 0). No `Gemini time` split — `Duration` is total per-firm wall time.
- **D-11:** `Errors` column uses the Phase 2 `errorClass` taxonomy (`TIMEOUT`, `HTTP_5XX`, `PARSE_ERROR`, etc.). Dash (`—`) when no error.
- **D-12:** Writer is a no-op when `$GITHUB_STEP_SUMMARY` env var is unset (local runs, `check:firm` runs). Must not error.

### Archive (OPS-09)
- **D-13:** Sent digest HTML is archived to `archive/YYYY/MM-DD.html` using the **KST date** of the run (consistent with Phase 1 `parseDate` convention). Written after mailer success, before state commit, within the same run-transaction.
- **D-14:** No orphan branch, no separate `archive/main`. Archive files ride the existing `stefanzweifel/git-auto-commit-action@v6` commit. The resulting `git log` noise on `main` is accepted.
- **D-15:** If the same KST day has two runs (e.g. a manual `workflow_dispatch` after a scheduled run), the second run **overwrites** the archive file. This is acceptable because the second run's digest is the authoritative one (later `seen.json` diff).

### Operational README (part of OPS docs promise)
- **D-16:** Operational documentation lives in **the existing `README.md`** as new sections, not a separate `docs/OPERATIONS.md`. Language: **Korean only** (no English). Scope limited to the four operational procedures below — no project onboarding / tech stack / architecture rewrites.
- **D-17:** Required sections:
  1. `로펌 추가하기` — `firms.yaml` 편집 예시 + 셀렉터 뽑는 기본 절차 (DevTools)
  2. `시크릿 교체` — Gmail App Password / `GEMINI_API_KEY` 교체 순서
  3. `수동 실행` — GHA Actions 탭에서 `workflow_dispatch` 실행 경로
  4. `디버깅` — "메일 안 왔어요" 순서도 (GHA 로그 → `pnpm check:firm`)

### Claude's Discretion
- Staleness detection function location (recommended: `src/observability/staleness.ts` new module, as a pure function keyed by `SeenState` + `now`)
- Metrics accumulator shape (recommended: pass a `Recorder` through the pipeline; each stage calls `record.firm(id).fetched(n)`, `.new(n)`, etc.; serialize to markdown at end of `main.ts`)
- `enabledAt` source for bootstrap grace period (recommended: write to `state/seen.json` when a firm's entry is first created during the initial fetch; schema bump is **not** required — it's a new per-firm field, not a version change)
- Archive filename timezone edge cases (recommended: use same `parseDate` / KST helpers as Phase 1)
- Exact README tone and section order within the 4 required items

### Folded Todos
None — no pending todos matched Phase 3 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + Roadmap
- `.planning/ROADMAP.md` §"Phase 3: Observability + Dev Loop" — phase goal, success criteria, plan count target
- `.planning/REQUIREMENTS.md` §"Operations (OPS)" — OPS-04, OPS-05, OPS-07, OPS-08, OPS-09 full text
- `.planning/PROJECT.md` — $0 budget, GHA cron, Gmail SMTP constraints

### Prior phase decisions (carry-forward)
- `.planning/phases/01-foundation-vertical-slice/01-CONTEXT.md` — Phase 1 decisions: seed firm, recipient.yaml, minimal HTML digest, run-transaction ordering, KST `parseDate`, DRY_RUN containment pattern
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — Phase 2 decisions, especially D-P2-03 (`Promise.allSettled` failure isolation), D-P2-04 (failed-firm email footer + `errorClass` taxonomy — reused for step summary `Errors` column), D-P2-07 / D-P2-17 (keyword filter defaults empty — rationale for no `Filtered` column), D-P2-09 (tier dispatch — `check:firm` must handle RSS/HTML branches)

### Environment + tooling
- `.github/workflows/daily.yml` — where the new archive commit rides, where `$GITHUB_STEP_SUMMARY` is available, where `workflow_dispatch` is configured
- `stefanzweifel/git-auto-commit-action@v6` (existing step in `daily.yml`) — handles archive + state commit in one commit

### Code context
- `src/types.ts:87-88` — `SeenState` schema already has `lastUpdated` and per-firm `lastNewAt`; staleness detection reads from these, no schema change required beyond an optional `enabledAt` field
- `src/state/reader.ts`, `src/state/writer.ts` — atomic write, ENOENT cold-start semantics (from Phase 1)
- `src/compose/digest.ts`, `src/compose/templates.ts` — where the staleness banner renders
- `src/pipeline/fetch.ts` — `Promise.allSettled` boundary; where per-firm metrics are captured in a try/finally
- `src/pipeline/filter.ts`, `src/pipeline/enrichBody.ts` — metrics pass through these stages
- `src/mailer/gmail.ts` — archive write triggers on successful send, before state write
- `src/main.ts` — composition root; must be refactored into a reusable `runPipeline()` function so `check:firm` CLI can reuse it

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`SeenState` type** (`src/types.ts:87-88`) — already has per-firm `lastNewAt: string | null`. Staleness detector input is ready; only an `enabledAt` optional field needs to be added for D-02 bootstrap grace period.
- **`parseDate` KST helpers** (from Phase 1) — reuse for archive filename generation (`YYYY/MM-DD.html` in KST) and "30 days ago" / "30 hours ago" comparisons.
- **`readState` / `writeState`** (`src/state/reader.ts`, `src/state/writer.ts`) — atomic write, version guard. Bootstrap `enabledAt` writes go through `writeState`.
- **`Promise.allSettled` boundary** (`src/pipeline/fetch.ts`, D-P2-03) — natural place to wrap per-firm try/finally for metrics capture so a mid-pipeline throw still records partial `Fetched` / `New` counts.
- **`errorClass` taxonomy** (Phase 2 `classifyError`, used in D-P2-04 email footer) — reused as-is for the step summary `Errors` column. Do not re-invent.
- **Minimal HTML digest template** (`src/compose/templates.ts`) — add staleness banner as a conditional block at the top, rendered only when the detector returns non-empty warnings.

### Established Patterns
- **Run-transaction ordering** (Phase 1 OPS-03): fetch → dedup → summarize → email → state. Archive write slots **after mailer success, before state write**. If mailer fails, no archive is written (consistent with "no state write on email failure").
- **Pattern 2 DRY_RUN containment** (Phase 1/2): side-effect gates (email send, state write) live exactly in the places that perform them; other modules do not branch on `DRY_RUN`. Archive write follows the same rule — gate on `DRY_RUN` inside the archive writer only.
- **KST as canonical timezone** — archive filenames use KST, staleness comparisons use KST. Matches what the Korean reader sees.
- **Failure isolation via `Promise.allSettled`** (D-P2-03) — metrics accumulator must preserve per-firm isolation: one firm's throw does not corrupt another firm's metrics row.

### Integration Points
- **Staleness banner** → `src/compose/digest.ts` (conditional prepend in `renderDigestHtml`)
- **Last-run banner** → same place as staleness banner; reads `SeenState.lastUpdated`
- **Metrics accumulator** → `Recorder` instance instantiated in `src/main.ts`, threaded through `runPipeline()` stages, serialized to `$GITHUB_STEP_SUMMARY` at end
- **Archive writer** → new `src/archive/writer.ts`; called from `src/main.ts` after `mailer.sendMail` resolves and before `writeState`
- **`check:firm` CLI entrypoint** → new `src/cli/checkFirm.ts`, wired via `"check:firm": "tsx src/cli/checkFirm.ts"` in `package.json` scripts
- **`runPipeline()` refactor** → extract from `src/main.ts` into `src/pipeline/run.ts` (or similar); `main.ts` calls it with full side effects, `checkFirm.ts` calls it with `{ firmFilter, skipEmail: true, skipStateWrite: true, skipGemini: true, saveHtmlPath?: string }`

</code_context>

<specifics>
## Specific Ideas

- Staleness banner wording (Korean): `⚠ 30일 이상 새 글 없음: 김앤장, 태평양` format at the top of the digest
- Step summary table uses the same Korean firm display names as the digest body — user recognizes them instantly when checking GHA Actions UI
- `check:firm` CLI output should feel like `pg_dump` or `kubectl get` — terse, grep-friendly, one idea per line

</specifics>

<deferred>
## Deferred Ideas

- **Per-firm staleness threshold override** — if Phase 3 ops reveal that some firms publish monthly+ and 30-day warnings become noise, promote to Phase 5 as triggered item. Schema slot: `firms[].staleness_days: number` optional.
- **`check:firm --fixture <path>` flag** — offline mode using recorded HTML samples. Promote to Phase 5 if fixture-based selector debugging becomes necessary.
- **`check:firm --json` flag** — structured output for test automation. Promote to Phase 5 if CI integration needs it.
- **Step summary `Filtered` column** — activates when any firm starts using non-empty `include_keywords` / `exclude_keywords`. Trigger: first non-empty filter in `firms.yaml`.
- **Step summary `Gemini time` column** — splits `Duration` into Gemini vs. non-Gemini time. Trigger: Phase 5 `QUOTA-01` item (quota tracking).
- **Orphan archive branch** (`archive/main`) — reconsider only if `main` branch `git log` noise becomes painful enough that `git log -- src/` filtering is insufficient.
- **English README** — translate when / if project is open-sourced. Not in v1 scope.
- **README onboarding sections** (tech stack, architecture, "why this choice?") — separate documentation phase or `/gsd:docs-update` invocation.

</deferred>

---

*Phase: 03-observability-dev-loop*
*Context gathered: 2026-04-18*
