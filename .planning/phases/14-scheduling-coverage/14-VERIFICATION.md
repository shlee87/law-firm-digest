---
phase: 14-scheduling-coverage
verified: 2026-05-27T15:30:00Z
status: human_needed
score: 11/11 code-verifiable must-haves verified (1 time-delayed roadmap SC requires post-deployment observation)
overrides_applied: 0
human_verification:
  - test: "Observe GHA daily.yml run history over one full week post-deploy (next 7 calendar days, including the first Monday: 2026-06-01 KST)"
    expected: "Every weekday (Mon–Sun) shows at least one successful `Daily Digest` run triggered by `schedule` (not just `workflow_dispatch`); no >24h gap between consecutive successful daily fetches in `gh run list --workflow=daily.yml --limit=20 --json event,conclusion,createdAt`"
    why_human: "Roadmap SC #1 is a time-delayed criterion that cannot be verified at code-merge time. Workflow_dispatch acceptance (already proven via run IDs 26513050608 + 26513052641) confirms GH Actions parser accepted the cron strings, but only natural schedule triggers across a 7-day window can prove the cron actually fires every weekday in production. SPEC §Out-of-scope and CONTEXT D-04 both explicitly defer this to a post-phase audit window — STATE.md line 57 acceptance note is the audit-trigger anchor."
  - test: "Run `gh run list --workflow=daily.yml --created '>=2026-05-27' --json event,conclusion,createdAt,databaseId` on 2026-06-03 (one week from deploy)"
    expected: "Output includes ≥1 run with `event: schedule` and `conclusion: success` for each of: Mon 2026-06-01, Tue 2026-05-27 or 2026-06-02, Wed, Thu, Fri, Sat, Sun. Monday entry is the new coverage. Time gaps between consecutive successful runs ≤ 24h + slack-for-runner-scheduling (i.e., ≤ ~25h)."
    why_human: "Same time-delayed criterion as above, phrased as the exact CLI command + expected output. The STATE.md note already documents the trigger date (2026-05-27) so a future audit can re-run this exact query on or after 2026-06-03."
---

# Phase 14: Scheduling Coverage Verification Report

**Phase Goal:** Pipeline fetches new items on every weekday (no >24h gap) and the `sync-schedule` tooling no longer silently regresses the Phase 13 daily/weekly cron split.
**Verified:** 2026-05-27T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status      | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| 1   | daily.yml cron triggers on every day of the week (Mon–Sun) at 21:00 KST                                        | ✓ VERIFIED  | `.github/workflows/daily.yml:28` → `- cron: '0 12 * * 0-6'` (day-of-week field 0-6 includes Mon=1; 12:00 UTC = 21:00 KST). Header comment line 28 says "Phase 14: 매일(월~일) 21:00 KST". |
| 2   | weekly.yml cron triggers on Mon 06:00 KST (= Sun 21:00 UTC), time-separated from daily Mon run                 | ✓ VERIFIED  | `.github/workflows/weekly.yml:30` → `- cron: '0 21 * * 0'`. Header at line 27 says "Mon 06:00 KST. daily.yml의 Mon 21:00 KST run과 시간 분리." 15h separation between weekly (Sun 21:00 UTC = Mon 06:00 KST) and daily Mon (Mon 12:00 UTC = Mon 21:00 KST). |
| 3   | `concurrency: digest-pipeline` lock is byte-identical in both yml files and blocks overlap                      | ✓ VERIFIED  | Both files contain identical `concurrency:` blocks: `group: digest-pipeline` + `cancel-in-progress: false`. Verified via `git show 2490c13:.github/workflows/daily.yml \| grep -E "concurrency:\|group:\|cancel-in-progress"` matches current state byte-for-byte. `git diff` filter on `'^[-+]\s+(group: digest-pipeline\|cancel-in-progress)'` returned 0 lines across the SCHED-01 commit boundary. |
| 4   | scripts/sync-schedule.ts no longer exists in the repo                                                          | ✓ VERIFIED  | `ls scripts/sync-schedule.ts` exits non-zero; `scripts/` directory listing shows no `sync-schedule.ts` (only the unrelated `debug-*.ts`, `probe-*.ts`, `reapply-gsd-local-patches.sh`, `seed-state-preview.ts`, `send-test-all-firms.ts`). |
| 5   | `pnpm sync-schedule` fails loudly with "Command not found" (aggressive failure detection)                       | ✓ VERIFIED  | `pnpm sync-schedule` exits 254 with stderr: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "sync-schedule" not found`. Phase 13 D-04 loud-fail principle satisfied. |
| 6   | src/config/loader.ts has no `toCron()` export (orphaned helper removed)                                        | ✓ VERIFIED  | `grep -c 'toCron' src/config/loader.ts` returns `0`. Repo-wide `grep -rn 'toCron\|sync-schedule' src/ scripts/` returns 0. `pnpm typecheck` exits 0 (no dangling imports). |
| 7   | config/settings.yaml schedule block remains zod-parseable and documents itself as "현재 미사용"                  | ✓ VERIFIED  | settings.yaml:22-30 shows "발송 일정 (현재 미사용)" header + "이 schedule 블록은 현재 사용되지 않습니다." comment + pointer to daily.yml/weekly.yml and CLAUDE.md "Workflow scheduling" section. `schedule:` block preserved at line 28 with `time_utc: '12:00'` + `days: weekly`. `grep -cE 'sync-schedule' config/settings.yaml` → 0. `pnpm typecheck` (which exercises SettingsSchema parse) → 0. |
| 8   | CLAUDE.md `## Conventions` section contains a `### Workflow scheduling (cron edit policy)` subsection INSIDE the GSD:conventions fence | ✓ VERIFIED  | CLAUDE.md line 190 (`<!-- GSD:conventions-start source:CONVENTIONS.md -->`) through line 208 (`<!-- GSD:conventions-end -->`). Subsection title at line 193. `awk '/GSD:conventions-start/,/GSD:conventions-end/' CLAUDE.md \| grep -c "Workflow scheduling"` returns 1. Fence-marker counts: start=1, end=1 (byte-identical). |
| 9   | CLAUDE.md subsection documents (a) direct-edit procedure for both yml files, (b) Phase 13 day-7/day-0 lesson, (c) time-separation rationale | ✓ VERIFIED  | (a) Lines 197-200: "daily.yml / weekly.yml의 schedule.cron 줄을 직접 편집한다 → Commit + push → `gh workflow run daily.yml` + `gh workflow run weekly.yml`". (b) Lines 202-203: "GH Actions는 같은 day-of-week 필드에서 `0`(Sun)과 `7`(Sun alias)이 동시에 등장하면 cron을 reject한다. ... `0-6`, `*`, 또는 `0,1,2-6`처럼 collision-free 표현을 사용한다." (c) Lines 205-206: "daily와 weekly cron의 발사 시각은 분리해 유지한다. `concurrency: digest-pipeline` lock이 동시 실행을 직렬화하긴 하지만, 동일 시각 트리거는 ... 슬롯 슬립을 만든다." |
| 10  | CLAUDE.md policy text contains NO literal cron values quoted (anti-footgun)                                    | ✓ VERIFIED  | `awk '/GSD:conventions-start/,/GSD:conventions-end/' CLAUDE.md \| grep -cE "'[0-9].*\*.*\*'"` returns `0`. Only literal token shown is `0-6` / `0,1,2-6` which are day-of-week patterns illustrating the lesson, not full cron expressions. CONTEXT §specifics line 146 anti-footgun rule satisfied. |
| 11  | STATE.md has a Phase 11 D-03 style acceptance note recording both Plan 14-01 workflow_dispatch run IDs         | ✓ VERIFIED  | STATE.md line 57: `- 2026-05-27 Phase 14 cron split: daily/weekly workflow_dispatch 검증 완료 — daily run ID 26513050608, weekly run ID 26513052641. 다음 자연 schedule trigger 확인은 1주 내 production history에서.` Both run IDs literal (not placeholders). Bundled into SCHED-02 commit 1903ca9 per D-01 (verified via `git show --stat HEAD` showed `.planning/STATE.md`). |

**Score:** 11/11 code-verifiable truths verified.

### Roadmap Success Criteria Coverage

ROADMAP.md Phase 14 lists 4 Success Criteria. Mapping to truths/human-verification:

| Roadmap SC | Mapped to | Status |
| ---------- | --------- | ------ |
| #1 (One-week observation: every weekday shows ≥1 successful daily fetch, no >24h gap) | Human verification items 1-2 | ⚠ time-delayed — cannot verify at code-merge time |
| #2 (daily.yml triggers on Mon + weekly.yml fires Mon at separated time + concurrency lock prevents overlap) | Truths 1, 2, 3 | ✓ VERIFIED |
| #3 (`pnpm sync-schedule` either no-ops or returns "command not found") | Truths 4, 5 | ✓ VERIFIED (option b: removed entirely) |
| #4 (Documented policy in CLAUDE.md or settings.yaml header) | Truths 7, 8, 9, 10 | ✓ VERIFIED (in CLAUDE.md inside GSD:conventions fence) |

### Required Artifacts

| Artifact                          | Expected                                                                      | Status      | Details |
| --------------------------------- | ----------------------------------------------------------------------------- | ----------- | ------- |
| `.github/workflows/daily.yml`     | cron `'0 12 * * 0-6'` + concurrency block unchanged                          | ✓ VERIFIED  | Line 28 cron matches; lines 31-33 concurrency byte-identical to pre-SCHED-01 state. |
| `.github/workflows/weekly.yml`    | cron `'0 21 * * 0'` + concurrency block unchanged                            | ✓ VERIFIED  | Line 30 cron matches; lines 33-35 concurrency byte-identical. |
| `scripts/sync-schedule.ts`        | MUST NOT EXIST                                                                | ✓ VERIFIED  | File absent from `scripts/` directory listing. |
| `package.json`                    | scripts dict without `sync-schedule` key; `audit:firms` + `typecheck` preserved | ✓ VERIFIED  | `jq '.scripts."sync-schedule"' package.json` → `null`. Other keys intact: dev, dev:weekly, dry-run, dry-run:weekly, check:firm, audit:firms, test, typecheck. |
| `src/config/loader.ts`            | No `toCron()` export; no sync-schedule references                            | ✓ VERIFIED  | `grep -c 'toCron'` → 0; `grep -c 'sync-schedule'` → 0. File now ends cleanly at line 99 with `loadTopics()` body. |
| `config/settings.yaml`            | `schedule:` block preserved with "현재 미사용" header pointing to yml + CLAUDE.md | ✓ VERIFIED  | Lines 21-30: new header + bare `schedule:` block with `time_utc: '12:00'` + `days: weekly`. No sync-schedule mention. |
| `CLAUDE.md`                       | `### Workflow scheduling` subsection inside GSD:conventions fence            | ✓ VERIFIED  | Subsection at line 193 inside fence (190-208). All three required elements present. No literal cron values. |
| `.planning/STATE.md`              | Acceptance note with daily + weekly run IDs, bundled into SCHED-02 commit    | ✓ VERIFIED  | Line 57 contains the D-04 format note. Both IDs literal. Bundled into commit 1903ca9 (verified via `git show --stat HEAD`). |

### Key Link Verification

| From                                            | To                              | Via                                                    | Status     | Details |
| ----------------------------------------------- | ------------------------------- | ------------------------------------------------------ | ---------- | ------- |
| `.github/workflows/daily.yml schedule.cron`     | GitHub Actions cron parser      | `workflow_dispatch` + natural schedule trigger         | ✓ WIRED    | Run ID 26513050608 confirmed acceptance. `gh workflow view daily.yml --yaml \| grep cron:` returned `- cron: '0 12 * * 0-6'` per Plan 14-01 Task 3 evidence. |
| `.github/workflows/weekly.yml schedule.cron`    | GitHub Actions cron parser      | `workflow_dispatch` + natural schedule trigger         | ✓ WIRED    | Run ID 26513052641 confirmed acceptance. Weekly dispatch run failed downstream (missing GEMINI_API_KEY by D-22 design — failure is post-parse, NOT cron-syntax rejection). Cron-acceptance scope passes. |
| CLAUDE.md `## Conventions`                      | `### Workflow scheduling` subsection | inside `GSD:conventions-start/end` HTML comment fence | ✓ WIRED    | Subsection physically located between lines 190 and 208 (fence markers). Regeneration-safe. |
| `config/settings.yaml schedule:`                | `src/config/schema.ts SettingsSchema.schedule` | zod parse at startup                          | ✓ WIRED    | `pnpm typecheck` exits 0; settings.yaml block preserved with required `time_utc` + `days` fields. Backwards-compat invariant per SPEC Constraint §Backwards compatibility holds. |

### Behavioral Spot-Checks

| Behavior                                          | Command                                                                                                                     | Result                                            | Status |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| `pnpm sync-schedule` fails loudly                 | `pnpm sync-schedule; echo $?`                                                                                               | exit=254, stderr `Command "sync-schedule" not found` | ✓ PASS |
| `pnpm typecheck` exits 0                          | `pnpm typecheck`                                                                                                            | exit=0, no output (tsc --noEmit silent success)  | ✓ PASS |
| daily.yml has Mon coverage                        | `grep "cron:" .github/workflows/daily.yml`                                                                                  | `- cron: '0 12 * * 0-6'`                          | ✓ PASS |
| weekly.yml shifted to Mon 06:00 KST               | `grep "cron:" .github/workflows/weekly.yml`                                                                                 | `- cron: '0 21 * * 0'`                            | ✓ PASS |
| No `toCron` references repo-wide (src/scripts)    | `grep -rn 'toCron' src/ scripts/`                                                                                           | 0 matches                                         | ✓ PASS |
| No `sync-schedule` in settings.yaml               | `grep -cE 'sync-schedule' config/settings.yaml`                                                                             | 0                                                 | ✓ PASS |
| Phase 14 commit-shape lock (2 functional commits) | `git log --oneline -10 \| grep -cE 'fix\(14\)\|chore\(14\)'`                                                                | 2 (2490c13 + 1903ca9)                             | ✓ PASS |
| No separate `docs(14)` commit before SCHED-02     | docs(14-01) and docs(14-02) exist as plan SUMMARY commits AFTER chore(14), not as STATE.md commits — `git log -1` HEAD shows the actual `docs(14): add code review report` 25dc178 is the post-cleanup REVIEW commit, separate from D-01 functional-commit scope | counted under reporting metadata, not functional surface | ✓ PASS |
| daily.yml concurrency block byte-identical        | `git diff 2490c13~1 2490c13 -- .github/workflows/daily.yml \| grep -E "^[-+]\s+(group:\|cancel-in-progress)" \| wc -l`     | 0                                                 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                       | Status      | Evidence |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------- | ----------- | -------- |
| SCHED-01    | 14-01-PLAN.md `requirements: [SCHED-01]` | Pipeline fetches new newsletter items at least once every 24 hours across all weekdays — add Monday daily fetch with daily/weekly time-separated when colliding | ✓ SATISFIED (code-side) | daily.yml cron `'0 12 * * 0-6'` covers Mon-Sun; weekly.yml cron `'0 21 * * 0'` runs Mon 06:00 KST, 15h separated from daily Mon. Concurrency lock preserved (T-14-03 mitigated). The "1 full week observation" half of acceptance is time-delayed — see human_verification. |
| SCHED-02    | 14-02-PLAN.md `requirements: [SCHED-02]` | `pnpm sync-schedule` does not silently overwrite the Phase 13 daily/weekly cron split. Either (a) rewrite to update both yml in lockstep, or (b) remove entirely with documented manual-edit policy | ✓ SATISFIED | Chose option (b): script + package.json entry deleted, toCron() removed, settings.yaml header rewritten to "현재 미사용", CLAUDE.md `### Workflow scheduling` subsection added inside GSD:conventions fence with edit procedure + Phase 13 lesson + time-separation principle. `pnpm sync-schedule` loud-fails as designed. |

REQUIREMENTS.md traceability table (lines 51-58) correctly marks both SCHED-01 and SCHED-02 as "Complete" mapped to Phase 14. No orphaned requirements — every requirement ID claimed in any 14-*-PLAN.md frontmatter is satisfied by code evidence.

### Anti-Patterns Found

Files inspected via grep: `.github/workflows/daily.yml`, `.github/workflows/weekly.yml`, `package.json`, `src/config/loader.ts`, `config/settings.yaml`, `CLAUDE.md`, `.planning/STATE.md`.

| File                         | Line | Pattern                                  | Severity | Impact |
| ---------------------------- | ---- | ---------------------------------------- | -------- | ------ |
| (none flagged)               | -    | -                                        | -        | No TODO/FIXME/HACK/PLACEHOLDER hits in Phase 14 modified files; no empty-array stubs that lack data-source backing; no stub returns. The only "deferred" marker is in `.planning/REQUIREMENTS.md` (CLOSURE/META rows = Pending), which is Phase 15/16 scope and out of Phase 14 verification surface. |

### Human Verification Required

Roadmap SC #1 is time-delayed and cannot be code-verified at merge time. Below are the exact steps to run on or after 2026-06-03 (one week post-deploy) to close out Phase 14 fully.

#### 1. One-week production observation: every weekday shows ≥1 successful daily fetch

**Test:**
```
gh run list --workflow=daily.yml --limit 20 --json event,conclusion,createdAt,databaseId | jq '[.[] | select(.event == "schedule" and .conclusion == "success")] | sort_by(.createdAt)'
```

**Expected:**
- Output contains ≥1 entry from each weekday from 2026-05-27 (the deploy day) through 2026-06-03 (one week later).
- Specifically, Mon 2026-06-01 KST shows a `schedule`-triggered `Daily Digest` run with `conclusion: success` — this is the new Monday coverage that did not exist pre-SCHED-01.
- Time gaps between consecutive entries are ≤ ~25h (allowing for runner-scheduling slack on top of the 24h cron cadence).

**Why human:** Time-delayed roadmap criterion. SPEC §Out-of-scope and CONTEXT D-04 explicitly defer this to a post-phase audit window. The STATE.md acceptance note (line 57, dated 2026-05-27) is the audit-trigger anchor — future audit pulls this line for the deploy timestamp and run IDs.

#### 2. Confirm the new Monday weekly run fired separately at Mon 06:00 KST

**Test:**
```
gh run list --workflow=weekly.yml --created '>=2026-05-31' --limit 5 --json event,conclusion,createdAt,databaseId
```

**Expected:**
- An entry with `event: schedule` and `createdAt` close to 2026-06-01T21:00:00Z (= Mon 2026-06-01 06:00 KST).
- The corresponding daily.yml schedule entry for Mon 2026-06-01 fires ~15h later (~2026-06-01T12:00:00Z = Mon 21:00 KST).
- Both runs have non-conflicting starts (concurrency lock would have serialized if they overlapped; in practice they're 15h apart).

**Why human:** Same time-delayed observation pattern as #1, but specifically validates the time-separation aspect of roadmap SC #2.

### Gaps Summary

No code-verifiable gaps. All 11 must-haves derived from PLAN frontmatter and ROADMAP Success Criteria are met:
- Both cron strings verified exactly (`'0 12 * * 0-6'` daily + `'0 21 * * 0'` weekly).
- Concurrency blocks byte-identical to pre-SCHED-01 state.
- `scripts/sync-schedule.ts` removed; `pnpm sync-schedule` loud-fails (exit 254) with "Command not found".
- `toCron()` cleaned out of loader.ts; `pnpm typecheck` green.
- `config/settings.yaml` schedule block neutralized to "현재 미사용" with pointer to yml + CLAUDE.md; zod parse compat preserved.
- CLAUDE.md `### Workflow scheduling` subsection inside GSD:conventions fence, covering edit procedure + Phase 13 day-7/day-0 lesson + time-separation, with no literal cron values.
- STATE.md acceptance note line 57 records both workflow_dispatch run IDs (26513050608 daily, 26513052641 weekly), bundled into SCHED-02 commit per D-01.
- Phase 14 produced exactly 2 functional commits (`fix(14)` 2490c13 + `chore(14)` 1903ca9) per D-01 commit-shape lock.
- REQUIREMENTS.md traceability rows for SCHED-01 and SCHED-02 both marked Complete.

The only outstanding item is roadmap SC #1's one-week production observation window, which is structurally time-delayed and tracked under `human_verification`. Phase 14 acceptance does NOT block on this 1-week window per CONTEXT D-04 + SPEC §Out-of-scope — the STATE.md note triggers a post-hoc audit on/after 2026-06-03.

---

_Verified: 2026-05-27T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
