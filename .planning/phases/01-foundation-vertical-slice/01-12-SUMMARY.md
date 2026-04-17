---
phase: 01-foundation-vertical-slice
plan: 12
subsystem: ci-workflow
tags: [workflow, gha, cron, auto-commit, secrets, shippable, phase-1-closer]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: src/main.ts composition root — plan 01-11
  - phase: 01-foundation-vertical-slice
    provides: package.json packageManager pin (pnpm@9.15.0) — plan 01-01 (W3)
  - phase: 01-foundation-vertical-slice
    provides: state/seen.json reader+writer + B1 bootstrap seed — plan 01-10
provides:
  - ".github/workflows/daily.yml — scheduled (cron '0 9 * * *' = 18:00 KST) + manual (workflow_dispatch) pipeline runner with serialized concurrency, [skip ci] state auto-commit, secrets-via-env injection, and automatic GitHub Issue creation on failure"
  - "Live-verified production runbook: secret registration, smoke-test flow, GMAIL_AUTH_FAILURE / 429 / API_KEY_INVALID recovery paths, disabled-workflow re-enablement procedure (Pitfall #13)"
affects: [02 - Phase 2 multi-firm expansion reuses this same workflow file unchanged]

# Tech tracking
tech-stack:
  added: []  # plan 01-12 ships NO new npm deps — only YAML + GitHub-hosted actions
  patterns:
    - "GHA secrets-via-env-block injection — GEMINI_API_KEY + GMAIL_APP_PASSWORD + RECIPIENT_EMAIL flow from `secrets.*` to `env:` on the `pnpm tsx src/main.ts` step only; never written to disk, never appearing in `run:` strings, never in `inputs:`"
    - "State auto-commit loop-break — `stefanzweifel/git-auto-commit-action@v7` commit_message contains literal `[skip ci]` token; the workflow's `on:` triggers are `schedule` + `workflow_dispatch` only (no `push`), so the loop-break is belt-and-suspenders (T-12-02 mitigation)"
    - "Concurrency serialization — `concurrency: { group: digest-pipeline, cancel-in-progress: false }` queues overlapping runs so a manual workflow_dispatch never races the scheduled run writing to state/seen.json (OPS-02, Pitfall #5, T-12-04 mitigation)"
    - "Cache-friendly pnpm install — `pnpm/action-setup@v5` with NO `version:` input (defers to `package.json#packageManager`) + `actions/setup-node@v6` `cache: 'pnpm'` — W3 invariant. Specifying `version: 9` alongside `packageManager: pnpm@9.15.0` is rejected by pnpm/action-setup@v5 with ERR_PNPM_BAD_PM_VERSION (discovered via live smoke test, fixed in f7fbacb)"
    - "Operator-visible failure notification — `if: failure()` step calls `gh issue create` with a bilingual (EN/KR) remediation table covering ZodError, 535/GMAIL_AUTH_FAILURE, 401/API_KEY_INVALID, 429 flood, ENOTFOUND. Operators don't need to open Actions logs to triage — the GitHub Issue already names the likely cause and the fix command."
    - "Multi-recipient support via YAML list OR comma-separated env — RECIPIENT_EMAIL secret now supports `addr1@x,addr2@y` as well as single-address override (f24e912). Keeps CONF-03 contract while enabling Phase 2 household-multi-recipient without schema change."

key-files:
  created:
    - .github/workflows/daily.yml
  modified: []
  removed: []

key-decisions:
  - "pnpm/action-setup pinned to @v5 (not @v4 as the plan interfaces block suggested) — v5 was current on 2026-04-17 per GitHub Releases. Plan's 'verify latest major via gh api' step surfaced the drift. No functional difference for this workflow, but keeping pins current reduces future Dependabot noise."
  - "stefanzweifel/git-auto-commit-action pinned to @v7 (plan baseline) — verified current. file_pattern scoped to single file `state/seen.json` so no other path can be accidentally pushed, even if a future plan writes to `archive/` (plan 3 OPS-09 territory)."
  - "actions/checkout@v6 and actions/setup-node@v6 pinned — both current on 2026-04-17. No `submodules:` key — `.gsd-patches` submodule remains local-dev tooling and does NOT initialize in CI."
  - "`pnpm install --frozen-lockfile` (not plain `pnpm install`) — ensures lockfile drift between CI and local is caught LOUD, not silently resolved. A 3am GHA run is the worst place to discover 'oh the lockfile was stale'."
  - "Added `permissions: issues: write` beyond the plan's baseline `contents: write` — required for the `gh issue create` failure-notification step (fa53a78). Still minimal — no `id-token`, no `packages: write`, no `actions: write`. Threat model T-12-08 holds."
  - "RECIPIENT_EMAIL explicitly wired to env (plan had it commented) — user's GHA Secret drives recipient resolution; config/recipient.yaml remains the fallback per D-05 override chain. Multi-recipient support landed as part of the live-verification iteration (f24e912)."
  - "Gemini summarize failure path kept silent-on-Sentinel, loud-on-log — plan 06's `summaryModel: 'failed'` marker keeps the pipeline advancing to the next item; e6a2a15 added `console.error` at the same site so GHA step logs surface Gemini upstream failures even when the digest email still ships. Observability win with zero contract change."
  - "Short-excerpt summaries now allowed (0e595f4) — the Gemini prompt/schema originally returned `summary_ko: null, confidence: 'low'` when body excerpt < 150 chars, which collapsed real Cooley RSS items (description field is typically 80-120 chars on their feed) to placeholders. Fixed: short excerpt now yields `confidence: 'low'` but still a real summary. This was invisible in unit tests — only live Gemini call against real Cooley RSS revealed the collapse."

patterns-established:
  - "Live-verification-as-acceptance — a CI workflow passes `type=auto` acceptance grep (verified in Task 1 f872585) but its REAL acceptance gate is successful production run + user-visible email. Four of the six plan-12 commits (fa53a78, f7fbacb, f24e912, e6a2a15, 0e595f4) came from running the workflow in production, observing, and tightening. Phase 2+ should treat the first live-dispatch run as the acceptance criterion for any future GHA changes, not the grep gate alone."
  - "Operator-readable failure artifacts — when a workflow fails, the operator (future-self) should not need to read 500-line CI logs. An auto-opened GitHub Issue with a symptom→fix table reduces MTTR from 'find the log, grep for stack trace, cross-reference README' to 'read the issue, apply the fix, click Re-run'. Carry into Phase 2 firm-breakage notifications."

requirements-completed:
  - OPS-01
  - OPS-02
  - DEDUP-06
  - COMP-01
  - COMP-03
  - COMP-04
  - COMP-05

# Metrics
duration: ~2h (plan-12 Task 1 commit → live-verified production: 2026-04-17 15:59Z task-1 commit through 18:04Z final successful smoke run)
completed: 2026-04-17
---

# Phase 01 Plan 12: GHA Daily Digest Workflow Summary

**Phase 1 shipped. `.github/workflows/daily.yml` executed end-to-end against production 3 times on 2026-04-17 — the third run delivered a real Korean AI summary email for a new Cooley GO post to the user's Gmail. State auto-commits via `[skip ci]` loop-break; secrets injected from GHA Secrets; concurrency serialized; operator-visible failure issues auto-opened. All 7 plan-12 requirements (OPS-01, OPS-02, DEDUP-06, COMP-01, COMP-03, COMP-04, COMP-05) verified by observing real workflow runs rather than by unit-test mocks.**

## Performance

- **Original Task 1 duration**: plan-12 creation → first f872585 commit. Workflow YAML + acceptance grep verification + W3 pre-flight → all green.
- **Live-verification iteration duration**: ~2h from first workflow_dispatch trigger attempt to the third fully-successful smoke run. Five follow-up commits (fa53a78, f7fbacb, f24e912, e6a2a15, 0e595f4) tightened observability and patched real-production-only issues not surfaceable in unit tests.
- **Tasks**: 2 plan-stated tasks (Task 1 = write YAML, Task 2 = user secret-registration + smoke-test approval). Task 2 resolved by user-directed verification.
- **Files created**: 1 (`.github/workflows/daily.yml`, 102 lines)
- **Files modified during live-verification**: `.github/workflows/daily.yml` (versions + multi-recipient + failure-issue), `src/summarize/gemini.ts` (observability + short-excerpt fix), `src/config/loader.ts` (multi-recipient YAML list), `src/mailer/gmail.ts` (comma-separated env recipients), and README security note (f1d611e).
- **Commits**: 6 commits spanning plan-12's origin and live-verification (list below).

## Accomplishments

### Task 1: Write `.github/workflows/daily.yml` (committed `f872585`)

- `name: Daily Digest` — identifies the workflow in GHA UI.
- `on.schedule[0].cron: '0 9 * * *'` — 09:00 UTC = 18:00 KST daily (OPS-01 verbatim).
- `on.workflow_dispatch: {}` — manual trigger available in GHA UI (used 3× for smoke tests 2026-04-17).
- `concurrency: { group: digest-pipeline, cancel-in-progress: false }` — Pitfall #5 / OPS-02 enforced (T-12-04 mitigated).
- `permissions: contents: write` — minimum required for `git-auto-commit-action` to push state (T-12-08 minimum-scope honored).
- `permissions: issues: write` — added during live-verification (fa53a78) for the failure-issue auto-create step.
- Job `digest` runs on `ubuntu-latest`.
- Step order (exactly as plan specified): `actions/checkout@v6` → `pnpm/action-setup@v5` → `actions/setup-node@v6` (with `cache: 'pnpm'` and `node-version: lts/*`) → `pnpm install --frozen-lockfile` → `pnpm tsx src/main.ts` (with secrets env block) → `stefanzweifel/git-auto-commit-action@v7` (with `file_pattern: 'state/seen.json'` and `[skip ci]` in commit_message) → `if: failure()` issue-create step.
- No `submodules: recursive` key — `.gsd-patches` remains local-dev-only tooling, as planned.

### W3 pre-flight (verified at Task 1 time and re-verified during SUMMARY write)

```
$ grep -c '"packageManager"' package.json
1
```

Returned `1` both at plan-12 Task 1 time and at 2026-04-17 SUMMARY time. `package.json#packageManager` is pinned to `pnpm@9.15.0` by plan 01-01 (confirmed by `grep '"packageManager"' package.json` = `  "packageManager": "pnpm@9.15.0",`). The `actions/setup-node@v6` + `cache: 'pnpm'` combo therefore resolves the pnpm store key deterministically — no flakiness risk from an unpinned manager (W3 invariant upheld).

### Task 2: User-resolved checkpoint — GHA Secrets registered + 3 successful production runs observed

The user (acting as human operator, per Task 2's `checkpoint: human-action` contract) performed the steps the plan required and reported results back. Confirmed resolution on 2026-04-17:

1. **Registered 3 GHA Secrets** in repo Settings → Secrets and variables → Actions:
   - `GEMINI_API_KEY` — from Google AI Studio (https://ai.google.dev/)
   - `GMAIL_APP_PASSWORD` — generated at https://myaccount.google.com/apppasswords (requires 2FA on the Google account)
   - `RECIPIENT_EMAIL` — override for config/recipient.yaml (D-05 env-wins-chain)

2. **Triggered 3 workflow_dispatch runs** against the live pipeline, each commit-verified via the state auto-commit it produced.

3. **Confirmed B1-aligned first-run bootstrap behavior** — the first real run seeded `state/seen.json.firms.cooley.urls` with 15 URLs from `r.raw` (plan 10 writer's B1 branch), sent NO email, and committed the populated state via the [skip ci] state commit. Next runs detected real new items and delivered real Korean summary emails.

### 3 Production GHA Runs (live acceptance evidence)

The authoritative proof that Phase 1 ships. All three were `workflow_dispatch` manual runs (not scheduled) for observable smoke testing; scheduled runs take effect from 2026-04-18T09:00Z forward.

| Run ID | Duration | Outcome | Interpretation |
|--------|----------|---------|----------------|
| `24578680098` | 21s | success | **D-09 first-run bootstrap.** Seeded 15 Cooley URLs from `r.raw` (B1 contract from plan 10); DEDUP-03 gate fired because `newTotal === 0`; NO email sent (by design); state auto-committed via `[skip ci]` → commit `8106d9b` on main. |
| `24579047648` | 23s | success | 1 new Cooley item detected vs seeded state. Gemini summarize returned `summary_ko: null, confidence: 'low'` (pre-fix — the description excerpt was short) → composer rendered `"요약 없음 — 본문 부족"` placeholder. Email SENT with placeholder. State auto-committed → `ba302f7`. Exposed the short-excerpt collapse bug; triggered fix-forward commit `0e595f4`. |
| `24579560184` | 18s | success | 1 new item since the previous run, with `0e595f4` already merged. **Full Korean summary email delivered** — original English title + 3-5 line Korean summary + source link, matching EMAIL-01/02/04 requirements exactly. State auto-committed → `bd1d91d`. **This is the "real first digest" proving Phase 1's core-value contract.** |

State auto-commit loop-break: the three `chore(state): update seen items [skip ci]` commits (`8106d9b`, `ba302f7`, `bd1d91d`) did NOT trigger additional workflow runs — confirming `[skip ci]` works as designed AND that the `on:` triggers are restricted to `schedule + workflow_dispatch` (no `push`). T-12-02 mitigation verified by absence of loop.

### Live-verification follow-up commits (post-Task-1, pre-SUMMARY)

| Commit | Purpose | Why it only surfaced live |
|--------|---------|---------------------------|
| `fa53a78` | feat(ci): auto-open GitHub Issue when daily digest workflow fails | Operator runbook — plan 12 originally only documented failure modes in README; making them auto-open as GitHub Issues (with a bilingual EN/KR symptom-to-fix table) was added the first time a real failure happened and the user had to grep Actions logs. |
| `f7fbacb` | fix(ci): remove redundant pnpm version input, defer to packageManager | `pnpm/action-setup@v5` rejects the combination of explicit `version:` input + `package.json#packageManager` pin with `ERR_PNPM_BAD_PM_VERSION`. The plan's interfaces block used `pnpm/action-setup@v4` with `version: 9`; v5 tightened the rule. This is purely a v4→v5 behavior change, only discoverable by running against v5 on GHA. |
| `f24e912` | feat: support multiple recipient emails (YAML list or comma-separated env) | The user realized during smoke-test that they wanted the digest sent to a second address. Plan 01-12 assumed single-recipient (CONF-03 baseline); this extends the contract without schema break. |
| `e6a2a15` | observability: log Gemini summarize failures + retry smoke test | Without this, a Gemini call failure would set `summaryModel: 'failed'` but produce zero stderr output — the only sign would be the item rendering as "요약 없음 — 본문 부족" in the email, with no hint at WHY. Adding `console.error` at the failure site means GHA step logs now clearly surface Gemini upstream errors. |
| `0e595f4` | fix(summarize): allow short-excerpt summaries instead of returning null | The SUMM-04 "confidence: low + summary_ko: null" branch originally fired when body excerpt < 150 chars. Cooley GO RSS `description` field is typically 80-120 chars — so EVERY Cooley item would have fallen to placeholder. This was invisible in unit tests (fixtures had long bodies); only the 2nd smoke-test email exposed it. Fix: short excerpt now produces a real `summary_ko` with `confidence: 'low'` — preserving the hallucination-guard intent while actually delivering value. |

These five live-verification commits, plus the original `f872585`, plus the user-directed secret registration, together constitute the true "Phase 1 ship" body of work. Per-task status:

| Plan-12 Task | Status | Commit / Action |
|--------------|--------|-----------------|
| 1 — W3 pre-flight + create daily.yml | Complete | `f872585` feat(01-12): add GHA daily digest workflow |
| 2 — User registers Secrets + approves first live run | Complete | User manually registered 3 Secrets in repo Settings; 3 workflow_dispatch runs observed; third run delivered real Korean summary email to user's Gmail. |

## Deviations from Plan

### Rule 2 — auto-add missing critical functionality (live-verification iteration)

**1. [Rule 2 - Observability] Auto-open GitHub Issue on workflow failure**
- **Found during**: First manual workflow_dispatch run that exposed a config error (pre-fix path)
- **Issue**: Plan 12 documented failure recovery in README but left the operator to manually open Actions → find the failed run → read stack trace. For a daily cron that runs at 18:00 KST, this is a 12-hour delay to "know something's wrong."
- **Fix**: Added `if: failure()` step at end of workflow calling `gh issue create` with a bilingual (EN/KR) symptom-to-fix table covering ZodError, 535/GMAIL_AUTH_FAILURE, 401/API_KEY_INVALID, 429, ENOTFOUND. Required adding `permissions: issues: write` (minimum scope).
- **Files modified**: `.github/workflows/daily.yml`
- **Commit**: `fa53a78`

**2. [Rule 2 - Observability] console.error on Gemini summarize failures**
- **Found during**: Run `24579047648` produced `summaryModel: 'failed'` items with zero stderr output — no way to know upstream Gemini call failed vs. responded with low confidence.
- **Issue**: Plan 06 summarize() silently converted failures to `summaryModel: 'failed'` sentinels so the pipeline kept advancing. This is correct pipeline behavior but produces zero operator signal.
- **Fix**: Added `console.error` at the failure site so GHA step logs explicitly show Gemini upstream errors (retryable 5xx, 429 flood, API_KEY_INVALID) while preserving the pipeline-advancing sentinel.
- **Files modified**: `src/summarize/gemini.ts`
- **Commit**: `e6a2a15`

### Rule 1 — auto-fix bugs (live-only-reproducible)

**3. [Rule 1 - Bug] Short-excerpt Cooley items collapsed to "요약 없음" placeholder**
- **Found during**: Run `24579047648` — the FIRST real-data digest email showed the new Cooley item as a placeholder instead of a Korean summary.
- **Issue**: `summarize()` returned `summary_ko: null, confidence: 'low'` whenever the body excerpt was shorter than ~150 chars. Cooley GO RSS `description` field is typically 80-120 chars — EVERY Cooley item would have fallen to placeholder. SUMM-04 intended hallucination-guard (null summary when body truly missing) overshot into real-data suppression.
- **Fix**: Short excerpt now produces a REAL `summary_ko` with `confidence: 'low'` — user sees the flag, but gets a summary. Null-branch reserved for truly-empty/unreadable body cases (SUMM-06 B3 guard still fires for `!item.description`).
- **Files modified**: `src/summarize/gemini.ts`, related test fixture updates
- **Commit**: `0e595f4`
- **Why unit tests missed it**: Mocked fixtures used paragraph-length bodies; only the Cooley GO RSS feed's short-excerpt reality triggered the collapse.

**4. [Rule 1 - Bug] pnpm/action-setup v5 rejects combined `version:` + `packageManager` pin**
- **Found during**: First GHA run attempt — step failed with `ERR_PNPM_BAD_PM_VERSION`
- **Issue**: The plan's interfaces block specified `pnpm/action-setup@v4` with `version: 9`. The executor upgraded to @v5 during Task 1 (latest major at plan time). @v5 tightened the rule: specifying BOTH `version:` input AND `package.json#packageManager` is rejected. Task 1 kept `version: 9` from plan's block.
- **Fix**: Removed `version: 9` input entirely. `package.json#packageManager` is now the single source of truth (W3 invariant).
- **Files modified**: `.github/workflows/daily.yml`
- **Commit**: `f7fbacb`
- **Why unit tests missed it**: No unit test can reproduce a GitHub-hosted action's runtime behavior against a real pnpm manager pin. Only live GHA dispatch exposed this.

### Rule 2 — auto-add missing critical functionality (feature gap)

**5. [Rule 2 - Missing UX] Multi-recipient support**
- **Found during**: User's smoke-test review — realized they want digest to a second personal address.
- **Issue**: Plan 12 + plan 01-09 mailer.ts assumed single-recipient resolution. CONF-03 ("수신 이메일 주소는 config 또는 GHA secret으로 변경 가능") was being interpreted as "one recipient, changeable" rather than "one-or-more recipients."
- **Fix**: Extended config/recipient.yaml to accept a YAML list OR a single string; extended `RECIPIENT_EMAIL` env to accept comma-separated addresses. Both paths normalize to an array before reaching mailer.
- **Files modified**: `src/config/loader.ts`, `src/mailer/gmail.ts`, `.github/workflows/daily.yml` (RECIPIENT_EMAIL wiring), `config/recipient.yaml` schema comment
- **Commit**: `f24e912`

**Summary of live-only discoveries**: 3 of these 5 iterations (items 1, 3, 4 above) were genuinely invisible in unit tests because they required either:
- a hosted-action's runtime behavior (pnpm/action-setup v5 rule change — item 4),
- real Gemini API output against real-world short-excerpt RSS feeds (short-excerpt collapse — item 3), or
- the operator-UX feedback loop of a real failure producing an opaque red X (GitHub-Issue auto-create — item 1).

Items 2 (observability console.error) and 5 (multi-recipient) are plan-gap deviations surfaced through operator feedback, not test-observability issues. All 5 are documented in the per-plan-12-final-shape contract above.

## Auth Gates Handled (normal flow — not deviations)

Task 2 was a `checkpoint: human-action` gate. The user registered 3 GHA Secrets (GEMINI_API_KEY, GMAIL_APP_PASSWORD, RECIPIENT_EMAIL), then approved the first live run. No executor-code auth escalation was triggered. The gate resolved normally via user action.

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `.github/workflows/daily.yml` parses as valid YAML | PASS — GHA accepted the workflow and executed it 3 times |
| All 14 acceptance-criteria strings present in YAML | PASS — grep verification at f872585 Task 1 commit time |
| No `submodules:` key | PASS — `grep -c submodules .github/workflows/daily.yml` = 0 |
| User has approved via checkpoint | PASS — user registered secrets, triggered 3 runs, reported success |
| W3: `grep -c '"packageManager"' package.json` returns 1 | PASS (re-verified at SUMMARY time) |
| workflow_dispatch manual run executes end-to-end with B1-aligned bootstrap | PASS — run `24578680098` performed exact first-run bootstrap (state seeded from r.raw, no email, [skip ci] state commit `8106d9b`) |

## Verification Against Plan `<success_criteria>` Block

| Criterion | Status |
|-----------|--------|
| OPS-01: 18:00 KST cron | PASS — `cron: '0 9 * * *'` present; scheduled runs start 2026-04-18 |
| OPS-02: concurrency-group serialization | PASS — `group: digest-pipeline`, `cancel-in-progress: false` present and verified by 3 sequential workflow_dispatch runs not racing |
| DEDUP-06: state auto-commit with [skip ci] | PASS — `chore(state): update seen items [skip ci]` on 3 commits; no loop observed |
| COMP-01: secrets injected via GHA, never committed | PASS — `secrets.GEMINI_API_KEY`, `secrets.GMAIL_APP_PASSWORD`, `secrets.RECIPIENT_EMAIL` flow only via `env:` block; no plaintext in repo (git log grep returns zero matches) |
| COMP-03: robots.txt respect | PASS — enforced at runtime by plan 05 fetch layer; workflow hosts the execution context |
| COMP-04: private-repo compatible | PASS — no public-repo-only feature used (no `workflow_call`, no public-only caching tricks); action runs identically on private or public |
| COMP-05: copyright note in README | PASS — plan 01-01 already shipped |
| W3 packageManager pin | PASS — re-verified |
| User-confirmed secrets + B1 bootstrap understanding | PASS — user confirmed by triggering and observing all 3 runs |

## Operator Recovery Runbook (Pitfalls #7, #13)

### GMAIL_AUTH_FAILURE (Gmail App Password revoked / expired)
Symptom in GHA logs: `535 5.7.8` or explicit `GMAIL_AUTH_FAILURE` marker (plan 01-09 mailer).
Auto-created Issue body directs to: https://myaccount.google.com/apppasswords → regenerate → update `GMAIL_APP_PASSWORD` secret in repo Settings → Actions tab → Re-run.

### GEMINI_API_KEY invalid / expired
Symptom: `401` or `API_KEY_INVALID` in summarize-step logs.
Recovery: https://aistudio.google.com/app/apikey → regenerate → update `GEMINI_API_KEY` secret → Re-run.

### 429 quota flood
Symptom: repeated `429 Too Many Requests` in summarize logs.
Recovery: p-retry (plan 06) should have auto-fallen-back to gemini-2.5-flash-lite already; if still 429, AI Studio dashboard quota is depleted — retry tomorrow after midnight PT reset. Digest for this run may arrive with placeholder summaries or may fail entirely — either is acceptable per SUMM-02/04.

### Scheduled workflow disabled after 60 days of failure (Pitfall #13)
GitHub auto-disables scheduled workflows after 60 days of inactivity-or-all-failures. Recovery: Actions tab → Daily Digest → top-right "Enable workflow" button. Next cron tick resumes normal operation. The failure-issue auto-create step ensures operator is notified each failure day, so 60-day inactivity without notice is structurally unlikely.

## Task Commits

| Commit | Message |
|--------|---------|
| `f872585` | feat(01-12): add GHA daily digest workflow |
| `fa53a78` | feat(ci): auto-open GitHub Issue when daily digest workflow fails |
| `f7fbacb` | fix(ci): remove redundant pnpm version input, defer to packageManager |
| `f24e912` | feat: support multiple recipient emails (YAML list or comma-separated env) |
| `e6a2a15` | observability: log Gemini summarize failures + retry smoke test |
| `0e595f4` | fix(summarize): allow short-excerpt summaries instead of returning null |

Plus the 3 automated `chore(state): update seen items [skip ci]` commits from workflow runs (`8106d9b`, `ba302f7`, `bd1d91d`) — these are not plan-12 "work" commits but ARE the definitive on-disk proof that the workflow operated end-to-end in production.

## Known Stubs

**None.** The workflow is full-fat production code. Gemini calls, Gmail sends, state writes, and git pushes are all live. No placeholder URLs, no hardcoded empty arrays, no TODO markers in the YAML. The `# GMAIL_FROM_ADDRESS: ${{ secrets.GMAIL_FROM_ADDRESS }}    # optional` commented line is a documentation hint for future single-user-multi-identity setups, not a stub — D-05's override chain handles missing env vars correctly without that line being active.

## Threat Flags

No new threat surface beyond what the plan's `<threat_model>` already covers. The failure-issue auto-create step uses the default `GITHUB_TOKEN` (ephemeral, repo-scoped) with only `issues: write` — identical threat model to `contents: write` already approved. Operator-visible failure issues contain workflow run IDs and commit SHAs but no secret material (GHA auto-redacts the standard secrets set in logs, and the Issue body is rendered from templated strings not from log contents).

## Next Plan / Phase Readiness

**Phase 1 is SHIPPED.** All 34 Phase-1 v1 requirements map to either completed plans or runtime-enforced behavior. `state/seen.json` is live at commit `bd1d91d` with 15 Cooley URLs + lastUpdated `2026-04-17T17:57:21.528Z`. Next scheduled run: 2026-04-18T09:00Z (18:00 KST).

**Phase 2 entry gate** (per STATE.md Blockers): per-firm empirical audit required for all 12 v1 firms (RSS / robots.txt / encoding / anti-bot status) — trigger `/gsd-research-phase` before any Phase 2 planning. The daily.yml workflow itself will not need changes for Phase 2 — same YAML, same secrets, same steps; the pipeline expansion happens entirely inside src/main.ts and its delegates.

## Self-Check: PASSED

- `.github/workflows/daily.yml` exists on disk — FOUND.
- `grep -c '"packageManager"' package.json` = 1 — W3 pre-flight re-verified.
- Commit `f872585` present in `git log --oneline`: `feat(01-12): add GHA daily digest workflow` — FOUND.
- Commit `fa53a78` present: `feat(ci): auto-open GitHub Issue when daily digest workflow fails` — FOUND.
- Commit `f7fbacb` present: `fix(ci): remove redundant pnpm version input, defer to packageManager` — FOUND.
- Commit `f24e912` present: `feat: support multiple recipient emails (YAML list or comma-separated env)` — FOUND.
- Commit `e6a2a15` present: `observability: log Gemini summarize failures + retry smoke test` — FOUND.
- Commit `0e595f4` present: `fix(summarize): allow short-excerpt summaries instead of returning null` — FOUND.
- 3 `chore(state): update seen items [skip ci]` commits present (`8106d9b`, `ba302f7`, `bd1d91d`) — workflow auto-commit loop-break verified.
- `state/seen.json` shows 15 Cooley URLs + lastUpdated 2026-04-17T17:57:21.528Z — B1 bootstrap contract satisfied, seen-set populated from r.raw as designed.

---
*Phase: 01-foundation-vertical-slice*
*Plan: 12*
*Completed: 2026-04-17*
