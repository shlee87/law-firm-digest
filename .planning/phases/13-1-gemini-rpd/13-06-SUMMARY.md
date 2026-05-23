---
phase: 13-1-gemini-rpd
plan: 06
subsystem: workflows
tags: [gha-cron, workflow-split, daily-yml, weekly-yml, atomic-commit, shared-concurrency, d-23]

# Dependency graph
requires:
  - phase: 13-1-gemini-rpd
    provides: "src/main.ts parseMode + dispatch (plan 13-05) — workflows invoke `tsx src/main.ts --mode=daily|weekly`"
  - phase: 13-1-gemini-rpd
    provides: "src/pipeline/runDaily.ts + runWeekly.ts (plans 13-03/13-04) — actual mode entry points"
  - phase: 13-1-gemini-rpd
    provides: "src/state/pending.ts (plan 13-01) — pending.json reader/writer that daily appends + weekly truncates"
  - phase: 13-1-gemini-rpd
    provides: "src/summarize/gemini.ts geminiCallCount + writeStepSummary [METRIC] line (plan 13-02)"
provides:
  - ".github/workflows/daily.yml — cron `0 12 * * 0,2-6` (Tue-Sun 21:00 KST) + entry `tsx src/main.ts --mode=daily` + atomic commit `state/pending.json state/seen.json`"
  - ".github/workflows/weekly.yml — NEW; cron `0 12 * * 1` (Mon 21:00 KST) + entry `tsx src/main.ts --mode=weekly` + atomic commit `state/pending.json state/seen.json archive/**/*.html`"
  - "Shared concurrency group `digest-pipeline` declared on both workflows — Sun-overshoot vs Mon-weekly race lock"
  - "Cron expression hotfix: GitHub Actions cron parser rejects `2-7,0` because day 7 and day 0 both encode Sunday; valid form `0,2-6` covers same Tue-Sun set"
  - "Least-privilege env: weekly.yml omits GEMINI_API_KEY (D-22 — weekly never calls Gemini)"
affects:
  - "13-07 (e2e tests): workflows now exist and trigger via workflow_dispatch — final integration plan can assert pipeline behavior end-to-end against a live cron-fired run"
  - "Post-Phase-13 cron operation: natural daily (Tue-Sun) + weekly (Mon) cadence active once 13-07 closes; SPEC §AC-7 7-day observation can begin"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-workflow split sharing one concurrency group — first-trigger-wins serialization (cancel-in-progress: false) prevents Sun-overshoot + Mon-start race"
    - "Atomic file_pattern commit groups: daily commits `state/pending.json state/seen.json` (D-23), weekly commits `state/pending.json state/seen.json archive/**/*.html` (D-23 extended)"
    - "Cron expression literal hotfix pattern: GH Actions cron parser is stricter than Vixie cron — day-7 alias rejected even when paired with day-0; equivalent set must be expressed without overlap"
    - "Defense-in-depth parity: weekly.yml retains Playwright cache + Thawte cert install for diff-clean parity with daily.yml, idempotent on warm caches (~0s cost)"

key-files:
  created:
    - .github/workflows/weekly.yml
  modified:
    - .github/workflows/daily.yml

key-decisions:
  - "Phase 13-06: cron literal `0 12 * * 2-7,0` (plan-prescribed) rejected by GitHub Actions cron parser with HTTP 422 — day 7 and day 0 both encode Sunday and the GH parser refuses the overlap. Hotfix landed as `0 12 * * 0,2-6` which covers the same Tue-Sun set without the alias collision. Recorded as Rule 1 deviation."
  - "Phase 13-06: weekly.yml env block deliberately omits GEMINI_API_KEY — least-privilege per threat T-13-06-04. Weekly never calls Gemini (D-22 [METRIC] geminiCallCount=0 always). Runner image does not see the secret on weekly runs."
  - "Phase 13-06: weekly.yml keeps the Playwright cache step + Thawte cert install for parity with daily.yml. Both are idempotent on warm caches (~0s cost) and let the two workflows be diff'd as cleanly as possible; removal only justified once daily.yml's blocks also retire."
  - "Phase 13-06: concurrency group `digest-pipeline` SHARED across both files (verbatim string match). Threat T-13-06-06 (group-name typo splits the lock) mitigated by acceptance grep on both files."
  - "Phase 13-06: human-verify checkpoint executed via manual workflow_dispatch on 2026-05-22T20:13–20:18Z. Both runs succeeded; [METRIC] markers byte-for-byte match (daily=21, weekly=0); atomic commits land with the right file_pattern triples; concurrency confirmed."
  - "Phase 13-06: Gmail inbox arrival NOT independently verified by orchestrator (Gmail MCP connects to a different account than nks4860@gmail.com). Operator one-time confirmation outstanding — does not block plan closure because mailer step exit 0 + no failure-issue created implies SMTP success."

patterns-established:
  - "GitHub Actions cron literal validation: any cron expression with day-of-week 7 alongside day 0 (or any overlapping range like 2-7 + 0) is rejected by the GH Actions parser. Future workflow plans must express weekday sets without the 7/0 overlap (e.g., '0,2-6' instead of '2-7,0')."
  - "Workflow 2-file split with shared concurrency: when splitting a single workflow into multiple cron-time-disjoint workflows touching the same state, declare the SAME `concurrency.group` string on every file; cancel-in-progress: false serializes overlaps deterministically."

requirements-completed: [SPEC-4, SPEC-6, SPEC-7]

# Metrics
duration: ~12min (Task 1 + Task 2 + cron hotfix + manual verification window)
completed: 2026-05-23
---

# Phase 13 Plan 06: workflow 2-file split (daily.yml + weekly.yml) Summary

**`.github/workflows/daily.yml` retargeted to Tue-Sun cron + `--mode=daily` entry + atomic `pending+seen` commit; `.github/workflows/weekly.yml` newly created with Mon cron + `--mode=weekly` entry + atomic `pending+seen+archive` commit. Both workflows share `concurrency: digest-pipeline` for Sun-overshoot-vs-Mon-start race protection. Human-verify checkpoint executed on 2026-05-22 via two manual workflow_dispatch runs (daily run id 26309754807, weekly run id 26309956124); both succeeded with byte-for-byte `[METRIC]` matches and atomic commits landing the expected file_pattern triples. One Rule-1 deviation surfaced post-Task-1: GitHub Actions cron parser rejected the plan-prescribed literal `0 12 * * 2-7,0` with HTTP 422 (day-7/day-0 overlap); hotfixed as `0 12 * * 0,2-6` covering the same Tue-Sun set. SPEC §Requirement 6 + §AC-5 + §AC-6 + partial §AC-7 satisfied.**

## Performance

- **Duration:** ~12 min (Task 1 + Task 2 + post-merge cron hotfix + manual workflow_dispatch verification)
- **Started:** 2026-05-22 (Task 1 + Task 2 commit window)
- **Completed:** 2026-05-23 (post-verification close)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 2 (1 modified + 1 created)

## Accomplishments

- `.github/workflows/daily.yml` (modified): header doc comment retargeted to Tue-Sun cadence, cron switched from `0 12 * * 1` to `0 12 * * 0,2-6` (post-hotfix), run command appended `--mode=daily`, `git-auto-commit-action` `file_pattern` expanded from `state/seen.json` to `state/pending.json state/seen.json` (D-23 atomic invariant), commit message updated to `'chore(state): daily — update seen + pending [skip ci]'`. shin-kim Thawte cert block + Open Issue on failure block + `concurrency: digest-pipeline` + `workflow_dispatch: {}` + `[skip ci]` all preserved verbatim.
- `.github/workflows/weekly.yml` (NEW, 157 lines): Mon cron `0 12 * * 1`, `--mode=weekly` entry, atomic commit `state/pending.json state/seen.json archive/**/*.html`, commit message `'chore(state): weekly — sent digest, truncate pending [skip ci]'`. SHARED `concurrency: digest-pipeline` group declaration. Playwright cache step + Thawte cert install retained for diff-clean parity with daily.yml (idempotent on warm caches). Env block deliberately omits `GEMINI_API_KEY` (least-privilege per threat T-13-06-04 — weekly never calls Gemini). Bilingual Open Issue on failure block tailored to weekly failure modes (`pending.json` schema drift, SMTP 535, `RECIPIENT_EMAIL` malformed, `firms.yaml` malformed, `ENOENT pending.json` first-run case).
- Cron literal hotfix (`fix(13-06): daily.yml cron syntax — '0,2-6' instead of '2-7,0'`): GitHub Actions cron parser rejected the plan-prescribed `0 12 * * 2-7,0` with HTTP 422 ("day 7 and day 0 both encode Sunday — overlap rejected"). Same Tue-Sun set re-expressed as `0 12 * * 0,2-6` (Sun + Tue-Sat — Mon excluded by omission; weekly.yml owns Mon). Documented as Rule 1 (plan-text imprecision) deviation.
- Manual workflow_dispatch verification: both workflows fired successfully on 2026-05-22T20:13–20:18Z. Daily run 26309754807 (2m3s) emitted `[METRIC] geminiCallCount=21` at top of step summary; weekly run 26309956124 (21s) emitted `[METRIC] geminiCallCount=0`. Atomic commits landed with the expected file_pattern triples (`7f29113` daily, `a5041ad` weekly). Weekly auto-commit included `create mode 100644 archive/2026/05-23.html`. Post-weekly `pending.json` confirmed `items: []` (truncate happened post-send-post-archive per OPS-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: daily.yml cron + --mode=daily + atomic pending+seen commit** — `54a17e1` (chore) — `.github/workflows/daily.yml`
2. **Cron hotfix (Rule 1 deviation, post-Task-1 GH Actions rejection)** — `ace93f4` (fix) — `.github/workflows/daily.yml` (cron literal `2-7,0` → `0,2-6`)
3. **Task 2: weekly.yml new file** — `75de39f` (feat) — `.github/workflows/weekly.yml`
4. **Task 3: human-verify checkpoint** — N/A (manual; verification artifacts are the run logs + auto-commit hashes referenced below)

## Files Created/Modified

**Created:**

- `.github/workflows/weekly.yml` (NEW, 157 lines) — Mon cron + `--mode=weekly` entry + atomic `pending+seen+archive` commit + shared concurrency group + workflow_dispatch + bilingual Open Issue on failure

**Modified:**

- `.github/workflows/daily.yml` (header comment + cron + run command + file_pattern + commit message) — `2-7,0` (initial Task-1 commit) → `0,2-6` (hotfix). Other deltas: title block reworded to reflect Tue-Sun cadence; `run: pnpm tsx src/main.ts` → `run: pnpm tsx src/main.ts --mode=daily`; `file_pattern: 'state/seen.json'` → `file_pattern: 'state/pending.json state/seen.json'`; commit message updated.

## Decisions Made

See `key-decisions` frontmatter. Highlights:

1. **Cron literal hotfix `2-7,0` → `0,2-6`** — the GitHub Actions cron parser is stricter than Vixie cron; it rejects expressions where day 7 (Sunday alias) and day 0 (Sunday) appear in the same field with HTTP 422. The plan-prescribed `0 12 * * 2-7,0` looked syntactically clean when grepped (matched the plan's literal token), but failed at the GH validation gate. Hotfix `0 12 * * 0,2-6` expresses the same set (Sun, Tue, Wed, Thu, Fri, Sat — Mon excluded) without the alias collision. Captured as a Rule 1 deviation with full lesson for future workflow plans below.

2. **Weekly env block omits GEMINI_API_KEY** — threat T-13-06-04 (info disclosure from unused secret in env). Weekly never calls Gemini (D-22 [METRIC] geminiCallCount=0 always). Future plans that wire re-summarization into weekly must re-add the env entry explicitly; the runner image otherwise does not see the secret on weekly runs.

3. **Defense-in-depth parity retained on weekly.yml** — Playwright cache step + Thawte cert install kept on weekly even though weekly never fetches. Both are idempotent on warm caches (~0s cost on the second+ run) and let the two workflows be diff'd cleanly. Removal would create asymmetric setup paths that drift over time.

4. **Shared `concurrency: digest-pipeline` group as the sole race guard** — Sun-21:00-KST daily that runs long can collide with Mon-21:00-KST weekly. The named-group lock with `cancel-in-progress: false` serializes them deterministically (first-trigger-wins). Threat T-13-06-06 (group-name typo splits the lock) mitigated by acceptance grep asserting exact `group: digest-pipeline` in both files.

5. **Human-verify executed in-flight, not deferred** — plan's checkpoint was honored: manual workflow_dispatch on both files, [METRIC] line confirmation via GH UI step-summary, post-run inspection of auto-commit hashes and pending.json post-state. SPEC §AC-7's 7-day natural-cron observation is a separate downstream acceptance that begins after Plan 13-07 lands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] daily.yml cron literal rejected by GitHub Actions parser**
- **Found during:** Post-Task-1 manual workflow_dispatch (orchestrator pushed the branch, attempted to trigger daily.yml, GH UI rejected with HTTP 422)
- **Issue:** Plan-prescribed cron expression `'0 12 * * 2-7,0'` is a valid Vixie cron literal (day-of-week field uses 7 and 0 both as Sunday aliases, with 2-7 covering Tue-Sun and ,0 adding Sun redundantly). GitHub Actions' cron parser is stricter — it rejects the day-7/day-0 overlap with HTTP 422. Same set expressed without overlap: `0 12 * * 0,2-6` (Sun + Tue-Fri + Sat). Mon is excluded by omission (weekly.yml owns Mon at the same UTC slot).
- **Fix:** Replaced cron literal `'0 12 * * 2-7,0'` → `'0 12 * * 0,2-6'` in `.github/workflows/daily.yml`. Comment line preserved verbatim ("화~일 매일 21:00 KST (월요일은 weekly.yml 이 담당)"). Plan-text imprecision corrected; behavior unchanged.
- **Files modified:** `.github/workflows/daily.yml` (1-line cron literal change)
- **Commit:** `ace93f4` (`fix(13-06): daily.yml cron syntax — '0,2-6' instead of '2-7,0'`)
- **Lesson for future workflow plans:** Cron literal grep matches verify the token landed in the YAML byte-for-byte, but they do NOT verify the GH Actions cron parser accepts it. Plans that specify cron expressions should either (a) require a `workflow_dispatch` smoke test in the same plan as the cron edit (this plan already had Task 3 human-verify, which is what caught it), or (b) prescribe cron literals without the day-7/day-0 overlap from the start. The latter is cheaper.

### Human Verification (Task 3 checkpoint, executed in-flight)

Orchestrator executed the plan's `<how-to-verify>` matrix on 2026-05-22T20:13–20:18Z:

| Verification item | Result |
|-------------------|--------|
| daily.yml `workflow_dispatch` run (id 26309754807) | success, 2m3s |
| daily step-summary first line `[METRIC] geminiCallCount=21` | byte-for-byte match (visual confirmed via GH UI) |
| daily atomic commit groups `state/pending.json` + `state/seen.json` | commit `7f29113 chore(state): daily — update seen + pending [skip ci]` |
| daily pending.json items shape | COMP-05 compliant — no `description`, `isClusterMember`, `isNew` |
| weekly.yml `workflow_dispatch` run (id 26309956124) | success, 21s |
| weekly step-summary first line `[METRIC] geminiCallCount=0` | byte-for-byte match (visual confirmed via GH UI) |
| weekly atomic commit groups `pending+seen+archive` | commit `a5041ad chore(state): weekly — sent digest, truncate pending [skip ci]` with `create mode 100644 archive/2026/05-23.html` |
| weekly post-truncate pending.json | `items: []` verified |
| digest HTML composed (13 items across 7 firms with Korean summaries) | verified at `archive/2026/05-23.html` |
| nodemailer SMTP send | implicit success — pipeline step exit 0, no failure-issue created |
| shared `concurrency: digest-pipeline` declaration | grep-confirmed on both workflows |
| Gmail inbox arrival at nks4860@gmail.com | UNVERIFIABLE by orchestrator (Gmail MCP connects to different account); operator notified for one-time confirmation |

## Issues Encountered

One Rule-1 deviation (cron literal rejection — see above), fixed in-flight as `ace93f4`. No blockers; checkpoint passed on first triggered run after the hotfix landed.

## Verification Evidence

**Task 1 acceptance gates (daily.yml — post-hotfix):**

```
$ grep -c "cron: '0 12 \* \* 0,2-6'" .github/workflows/daily.yml          → 1
$ grep -c "cron: '0 12 \* \* 1'" .github/workflows/daily.yml              → 0  (old Mon-only cron gone)
$ grep -c "tsx src/main.ts --mode=daily" .github/workflows/daily.yml      → 1
$ grep -c "file_pattern: 'state/pending.json state/seen.json'" .github/workflows/daily.yml  → 1
$ grep -c "\[skip ci\]" .github/workflows/daily.yml                       → ≥1
$ grep -c "group: digest-pipeline" .github/workflows/daily.yml            → 1
$ grep -c "workflow_dispatch:" .github/workflows/daily.yml                → 1
```

Note: plan literally specified `'0 12 \* \* 2-7,0'` as the acceptance grep target, but the post-hotfix value is `'0 12 \* \* 0,2-6'` (Rule 1 deviation above). The grep gate spirit (cron is Tue-Sun, not Mon-only) is satisfied at the post-hotfix value.

**Task 2 acceptance gates (weekly.yml):**

```
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/weekly.yml'))" → exit 0
$ grep -c "cron: '0 12 \* \* 1'" .github/workflows/weekly.yml               → 1
$ grep -c "tsx src/main.ts --mode=weekly" .github/workflows/weekly.yml      → 1
$ grep -c "file_pattern: 'state/pending.json state/seen.json archive/\*\*/\*.html'" .github/workflows/weekly.yml → 1
$ grep -c "group: digest-pipeline" .github/workflows/weekly.yml             → 1
$ grep -c "workflow_dispatch:" .github/workflows/weekly.yml                 → 1
$ grep -c "\[skip ci\]" .github/workflows/weekly.yml                        → ≥1
$ grep -c "GEMINI_API_KEY" .github/workflows/weekly.yml                     → 0  (least-privilege — T-13-06-04)
$ grep -c "name: Weekly Digest" .github/workflows/weekly.yml                → 1
```

**Task 3 acceptance gates (human-verify):**

- daily run id 26309754807 → success (2m3s) with `[METRIC] geminiCallCount=21` at top of step summary
- weekly run id 26309956124 → success (21s) with `[METRIC] geminiCallCount=0`
- daily auto-commit `7f29113` includes `state/pending.json` + `state/seen.json` (atomic per D-23)
- weekly auto-commit `a5041ad` includes `state/pending.json` + `state/seen.json` + `archive/2026/05-23.html` (atomic per D-23 extended for weekly)
- post-weekly pending.json `items: []` confirmed
- digest HTML rendered with 13 items across 7 firms with Korean summaries (verified at archive/2026/05-23.html)
- shared concurrency group `digest-pipeline` declared on both files (grep-confirmed)

## SPEC §Requirement 6 Acceptance Criteria

Per `13-SPEC.md §Requirement 6`:

> `.github/workflows/daily.yml` 의 cron line grep = `'0 12 * * 2-7,0'`, `.github/workflows/weekly.yml` 의 cron line grep = `'0 12 * * 1'`, 두 파일 모두 `concurrency: digest-pipeline` 와 `workflow_dispatch: {}` 포함.

- **daily.yml cron** — Originally `'0 12 * * 2-7,0'` per plan; hotfixed to `'0 12 * * 0,2-6'` after GH Actions parser rejection. Both expressions select Tue-Sun (the SPEC literal is the same set with the day-7/day-0 alias overlap). The SPEC literal expression is a Rule-1 plan-text imprecision; the post-hotfix expression is the semantic equivalent that survives the GH parser. Spirit of §Requirement 6 satisfied.
- **weekly.yml cron** — `'0 12 * * 1'` verbatim. ✓
- **Both files `concurrency: digest-pipeline`** — verbatim string match on both. ✓
- **Both files `workflow_dispatch: {}`** — verbatim string match on both. ✓

SPEC §AC-5 (daily cron + entry + file_pattern) and §AC-6 (weekly cron + entry + concurrency group) PASSED with the cron-literal Rule-1 noted above. SPEC §AC-7 (7-day natural-cron observation of `[METRIC] geminiCallCount=` daily avg ≤ 15, weekly === 0) is partially satisfied — the manual workflow_dispatch single-run sample shows daily=21, weekly=0, within the SPEC's "daily max ≤ 50" envelope; the 7-day average will be observed once Plan 13-07 closes and natural cron runs accumulate.

## Wiring Verification (Plans 13-01..13-05 integrated)

- **Plan 13-01 (pending storage):** daily.yml commit step's `file_pattern: 'state/pending.json state/seen.json'` groups the new file alongside seen.json (D-23 atomic). Weekly.yml's `file_pattern` adds `archive/**/*.html` for the weekly-only archive write. Both verified via the manual-dispatch auto-commit diffs.
- **Plan 13-02 (geminiCallCount):** Both step summaries emit `[METRIC] geminiCallCount=N` as the first line; daily run showed `N=21`, weekly run showed `N=0`. D-22 uniform emission confirmed at the cron-runner-output layer (was previously only confirmed in tests).
- **Plan 13-03 (runDaily):** daily.yml runs `pnpm tsx src/main.ts --mode=daily` → main.ts parseMode → runDaily(). Run id 26309754807's pipeline step exit 0 + correct pending.json shape confirms the wiring.
- **Plan 13-04 (runWeekly):** weekly.yml runs `pnpm tsx src/main.ts --mode=weekly` → main.ts parseMode → runWeekly(). Run id 26309956124 sent the digest (13-item HTML composed), archived to archive/2026/05-23.html, truncated pending.json items to []. Heartbeat branch was NOT taken on this run (pending had items); the heartbeat path will be exercised the first weekly run after a quiet Tue-Sun.
- **Plan 13-05 (main.ts dispatch):** Both workflows pass `--mode=` explicitly; the fail-fast posture (`process.exit(2)` on missing/invalid mode) was not triggered on either run — both flags accepted cleanly.

## Run Log References

- Daily run: https://github.com/`<owner>`/`<repo>`/actions/runs/26309754807 (success, 2m3s, `[METRIC] geminiCallCount=21`)
- Weekly run: https://github.com/`<owner>`/`<repo>`/actions/runs/26309956124 (success, 21s, `[METRIC] geminiCallCount=0`)
- Daily auto-commit: `7f29113 chore(state): daily — update seen + pending [skip ci]`
- Weekly auto-commit: `a5041ad chore(state): weekly — sent digest, truncate pending [skip ci]`
- Cron-syntax hotfix: `ace93f4 fix(13-06): daily.yml cron syntax — '0,2-6' instead of '2-7,0'`

## Gmail Inbox Arrival Caveat (operator action)

The orchestrator could not independently verify the digest email arrived at `nks4860@gmail.com` because the Gmail MCP tool in this environment connects to a different account. The mailer step exited 0 and no failure-issue was auto-created (implying nodemailer accepted the SMTP transaction), but final inbox arrival is operator-confirmed only. The operator should check `nks4860@gmail.com` once for the `[법률 다이제스트] 2026-05-23 (7 firms, 13 items)` subject line; if absent, this is a follow-up debug ticket and does NOT block Phase 13 closure (the workflows themselves work — the SMTP→inbox path is a separate failure surface owned by GMAIL_APP_PASSWORD validity).

## Next Phase Readiness

**Ready for plan 13-07 (e2e tests + final integration):**

- Both workflow files exist and have been demonstrated to work end-to-end via workflow_dispatch
- pending.json + seen.json + archive HTML auto-commit invariants verified at the cron-runner-output layer
- runDaily + runWeekly entry functions wired to the dispatch path (main.ts parseMode → mode-specific runner)
- Plan 13-07 can lean on workflow_dispatch as the e2e fixture trigger if vitest-level integration tests are not enough; the GH UI run history is now a stable surface to query

**Ready for SPEC §AC-7 natural-cron observation (deferred to post-Phase-13 close):**

- Daily cron `0 12 * * 0,2-6` and weekly cron `0 12 * * 1` are LIVE on `main`
- Each natural daily run will leave a `[METRIC] geminiCallCount=N` marker grep-able in the Actions logs
- 7-day average ≤ 15 + weekly === 0 acceptance can be measured after the first full Tue-Sun + Mon cycle completes

## User Setup Required

None for this plan's deliverable. (Operator one-time inbox-arrival confirmation for the Gmail caveat above — not a blocker.)

## Threat Flags

None newly introduced. Threats from the PLAN frontmatter mitigated:

- **T-13-06-01** (cron typo → race with weekly) → grep gate + manual workflow_dispatch + GH UI cron rendering inspection confirmed cron is Tue-Sun (post-hotfix); Mon excluded. Verified.
- **T-13-06-02** (weekly file_pattern misses archive/**/*.html) → weekly.yml exact triple `'state/pending.json state/seen.json archive/**/*.html'` verified; weekly auto-commit `a5041ad` includes `create mode 100644 archive/2026/05-23.html`. Verified end-to-end.
- **T-13-06-03** (daily Sun-overshoot → Mon weekly race) → shared concurrency group declared on both files (grep-confirmed); manual back-to-back trigger queuing observed in GH UI (run-summary "Pending — Waiting for a previous run to complete" indicator).
- **T-13-06-04** (weekly env leaks GEMINI_API_KEY) → weekly.yml `grep -c "GEMINI_API_KEY"` returns 0. Least-privilege confirmed.
- **T-13-06-05** ([skip ci] missing → infinite loop) → both commit messages include `[skip ci]`; the daily + weekly auto-commits in the verification window did NOT re-trigger their parent workflows.
- **T-13-06-06** (concurrency group typo splits the lock) → exact `group: digest-pipeline` grep-confirmed on both files.
- **T-13-06-07** (weekly auto-issue leaks pending content) → auto-issue body references `ZodError ... pending.json` as a symptom only; no JSON content interpolated. EOF heredoc isolates GH Actions context variables from user data. Accept disposition retained.

## Self-Check: PASSED

- [x] File `.github/workflows/weekly.yml` exists (Task 2)
- [x] File `.github/workflows/daily.yml` modified (Task 1 + hotfix)
- [x] Commit `54a17e1` (chore 13-06 daily.yml swap) present in git log
- [x] Commit `ace93f4` (fix 13-06 daily.yml cron syntax) present in git log
- [x] Commit `75de39f` (feat 13-06 weekly.yml new) present in git log
- [x] daily.yml cron === `'0 12 * * 0,2-6'` (post-hotfix; SPEC `'0 12 * * 2-7,0'` would have been rejected by GH parser)
- [x] daily.yml run command === `pnpm tsx src/main.ts --mode=daily`
- [x] daily.yml file_pattern === `'state/pending.json state/seen.json'` (atomic per D-23)
- [x] weekly.yml exists with cron === `'0 12 * * 1'` (verbatim per SPEC)
- [x] weekly.yml run command === `pnpm tsx src/main.ts --mode=weekly`
- [x] weekly.yml file_pattern === `'state/pending.json state/seen.json archive/**/*.html'`
- [x] Both workflows declare `concurrency: digest-pipeline` (shared)
- [x] Both workflows declare `workflow_dispatch: {}`
- [x] Both commit messages include `[skip ci]`
- [x] weekly.yml omits GEMINI_API_KEY (least-privilege)
- [x] Human-verify checkpoint: both workflows successfully dispatched, `[METRIC]` markers byte-for-byte match (daily=21, weekly=0), atomic commits land with expected file_pattern triples
- [x] Run id 26309754807 (daily) and 26309956124 (weekly) accessible in Actions history
- [x] Auto-commits `7f29113` (daily) and `a5041ad` (weekly) present on main with [skip ci]

---
*Phase: 13-1-gemini-rpd*
*Completed: 2026-05-23*
