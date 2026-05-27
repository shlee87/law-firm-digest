---
phase: 14-scheduling-coverage
plan: 02
subsystem: infra
tags: [scheduling, cleanup, docs, ops, conventions]

# Dependency graph
requires:
  - phase: 14-scheduling-coverage
    plan: 01
    provides: "daily.yml cron 0-6 + weekly.yml cron Sun-21-UTC + workflow_dispatch run IDs (daily 26513050608, weekly 26513052641) captured"
  - phase: 11-cron-resumption-gate
    provides: "STATE.md acceptance note pattern (D-03 single-line dispatch verification record) — reused here as Phase 14 acceptance note"
  - phase: 13-1-gemini-rpd
    provides: "Aggressive failure detection principle (D-04) — justifies pnpm sync-schedule loud-fail after removal"
provides:
  - "scripts/sync-schedule.ts deleted permanently (footgun eliminated)"
  - "package.json scripts dict free of sync-schedule key (pnpm sync-schedule loud-fails)"
  - "src/config/loader.ts free of orphaned toCron() helper (YAGNI cleanup)"
  - "config/settings.yaml schedule block kept (zod compat) with '현재 미사용' header pointing to daily.yml/weekly.yml + CLAUDE.md"
  - "CLAUDE.md ### Workflow scheduling (cron edit policy) subsection INSIDE GSD:conventions fence — direct-edit procedure + Phase 13 day-7/day-0 lesson + time separation principle, NO literal cron values"
  - "STATE.md Phase 14 acceptance note with both workflow_dispatch run IDs (bundled into SCHED-02 commit per D-01)"
affects: [16-meta]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-commit cleanup with embedded STATE.md note (D-01 commit-shape lock — 5 cleanup files + STATE.md staged together, no separate docs commit)"
    - "Procedure-not-values documentation pattern in CLAUDE.md (per CONTEXT §specifics line 146 — quoting literal cron in policy would create new doc-sync footgun)"

key-files:
  created: []
  modified:
    - package.json
    - src/config/loader.ts
    - config/settings.yaml
    - CLAUDE.md
    - .planning/STATE.md
  deleted:
    - scripts/sync-schedule.ts

key-decisions:
  - "All 5 cleanup files + STATE.md note bundled into ONE commit (CONTEXT D-01) — Phase 14 ships exactly 2 commits total (fix(14) SCHED-01 + chore(14) SCHED-02-with-STATE-note)"
  - "toCron() helper deleted alongside sync-schedule.ts (pre-removal grep confirmed only consumer was the script) — YAGNI per SPEC §In-scope"
  - "settings.yaml schedule block PRESERVED (time_utc + days fields) with '현재 미사용' header — zod compat per SPEC Constraint §Backwards compatibility; full removal deferred to v1.3+ (out of scope)"
  - "CLAUDE.md subsection uses procedure-only text (no quoted cron values) per CONTEXT §specifics line 146 — prevents new doc-sync footgun"
  - "Subsection title chosen as '### Workflow scheduling (cron edit policy)' (Claude's Discretion per CONTEXT line 75) — Phase 16 META-02 will add sibling subsection here for audit:firms freshness policy"

requirements-completed: [SCHED-02]

# Metrics
duration: 4min
completed: 2026-05-27
---

# Phase 14 Plan 02: Scheduling Coverage Cleanup Summary

**Eliminated the sync-schedule footgun permanently — script + package.json entry + toCron() helper deleted, settings.yaml schedule block neutralized to "현재 미사용" placeholder, CLAUDE.md ### Workflow scheduling (cron edit policy) subsection added inside GSD:conventions fence, and Phase 14 acceptance note appended to STATE.md with both Plan 14-01 workflow_dispatch run IDs — all bundled into a single SCHED-02 commit per CONTEXT D-01 (Phase 14 = exactly 2 commits total).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-27T13:15:05Z
- **Completed:** 2026-05-27T13:18:49Z
- **Tasks:** 4 (3 auto edits + 1 human-verify checkpoint executed inline via git CLI)
- **Files modified:** 5
- **Files deleted:** 1

## Accomplishments

- **sync-schedule script deleted** — `scripts/sync-schedule.ts` (37 lines) removed via `git rm`. The footgun that regex-overwrote `daily.yml` cron while ignoring `weekly.yml` is gone.
- **package.json entry removed** — `"sync-schedule"` key dropped from scripts block. `pnpm sync-schedule` now non-zero exits with `Command "sync-schedule" not found` (Phase 13 D-04 aggressive failure detection).
- **toCron() helper deleted** — orphaned after sync-schedule.ts removal (only consumer). `src/config/loader.ts` lost 17 lines (function body + 2-line comment header). `pnpm typecheck` green.
- **settings.yaml schedule header rewritten** — old 14-line header (sync-schedule pointer + time_utc/days option tables) replaced with 6-line "현재 미사용" header pointing to daily.yml/weekly.yml + CLAUDE.md. `schedule:` block kept (`time_utc: '12:00'`, `days: weekly`) for zod parse compat. Trailing inline comments on time_utc/days lines stripped. Verified `loadSettings()` still parses cleanly via `pnpm tsx`.
- **CLAUDE.md ### Workflow scheduling (cron edit policy) subsection added INSIDE the GSD:conventions-start/end fence** — replaces "Conventions not yet established" placeholder. Documents (a) direct-edit procedure for both yml files (commit → push → `gh workflow run`), (b) Phase 13 day-7/day-0 cron syntax collision lesson, (c) time separation principle (`concurrency: digest-pipeline` lock + slot-sleep avoidance). NO literal cron values quoted (per CONTEXT §specifics line 146 anti-footgun rule).
- **STATE.md Phase 14 acceptance note appended** — single-line entry under `## Accumulated Context` → `### Decisions` (line 57) with both Plan 14-01 workflow_dispatch run IDs (daily `26513050608`, weekly `26513052641`). Format matches CONTEXT D-04 exact specification (Phase 11 D-03 pattern). `last_updated` frontmatter refreshed to `2026-05-27T13:16:52.000Z`.
- **Single bundled commit (D-01 commit-shape lock)** — all 6 files (5 cleanup + STATE.md) committed together. Phase 14 total = 2 commits on main: SCHED-01 functional + SCHED-02 cleanup-with-STATE-note. NO separate `docs(14)` commit.

## Task Commits

Per CONTEXT D-01, Plan 14-02 ships as a **single bundled commit** covering all 4 tasks (mechanical-cleanup boundary + STATE.md acceptance note):

1. **Tasks 1–4 (bundled): SCHED-02 mechanical cleanup + STATE.md acceptance note** — `1903ca9` (`chore(14)`) [post-rebase SHA; pre-rebase `2355915`]
   - `scripts/sync-schedule.ts` deletion
   - `package.json` sync-schedule entry removal
   - `src/config/loader.ts` toCron() function + comment removal
   - `config/settings.yaml` schedule header rewrite to "현재 미사용"
   - `CLAUDE.md` ### Workflow scheduling subsection added inside GSD:conventions fence
   - `.planning/STATE.md` Phase 14 acceptance note + last_updated refresh
   - Single commit per CONTEXT D-01 commit-shape decision

**Plan metadata commit:** This SUMMARY.md + STATE/ROADMAP/REQUIREMENTS metadata updates land in a separate `docs(14-02)` commit per standard GSD pattern. This is the SUMMARY metadata commit, NOT a functional/cleanup commit, so it does not count against the D-01 `fix(14)|chore(14)` commit-shape lock (verified via `grep -cE 'fix\(14\)|chore\(14\)'` = 2).

## Files Modified

- `scripts/sync-schedule.ts` — **DELETED** (37 lines removed)
- `package.json`
  - Line 14 removed: `"sync-schedule": "tsx scripts/sync-schedule.ts",`
  - All other keys (dev, dev:weekly, dry-run, dry-run:weekly, check:firm, audit:firms, test, typecheck) preserved
  - Dependencies / devDependencies / packageManager / name / type / private untouched
- `src/config/loader.ts`
  - Lines 85-101 removed: `// toCron: …` comment header + `export function toCron(...)` body (17 lines total)
  - Adjacent `loadSettings()` (above) and `loadTopics()` (below) untouched
  - `grep -c 'toCron' src/config/loader.ts` returns 0
  - `grep -rn 'toCron' src/ scripts/` returns 0
- `config/settings.yaml`
  - Lines 21-38 (schedule header block) rewritten: 18-line header → 10-line "현재 미사용" header
  - Trailing inline comments on time_utc/days lines stripped (`# UTC 기준 …`, `# daily / weekdays / …`)
  - `schedule:` key + `time_utc: '12:00'` + `days: weekly` preserved for zod compat
  - `recipient:`, `gemini:`, `digest:`, `prompt:` sections, header banner untouched
- `CLAUDE.md`
  - GSD:conventions-start / GSD:conventions-end fence markers preserved byte-identical (`grep -c` = 1 each)
  - Placeholder line `Conventions not yet established. Will populate as patterns emerge during development.` removed
  - Added `### Workflow scheduling (cron edit policy)` subsection (~15 lines) INSIDE the fence with:
    - Source-of-truth statement (daily.yml + weekly.yml schedule.cron lines; settings.yaml is placeholder)
    - 3-step 변경 절차 (edit → commit + push → gh workflow run for both yml)
    - Phase 13 lesson (day-7 + day-0 Sun-alias collision; use 0-6 / `*` / 0,1,2-6)
    - 시간 분리 원칙 (concurrency: digest-pipeline lock + slot-sleep)
  - NO literal cron values quoted in policy text (verified via `awk` + `grep -qE "'[0-9].*\*.*\*'"` returns non-zero)
  - All other sections (`## Project`, `## Technology Stack`, `## Architecture`, `## Project Skills`, `## GSD Workflow Enforcement`, `## Developer Profile`) untouched (control checks pass)
- `.planning/STATE.md`
  - Line 57: new bullet appended at top of `Recent decisions affecting current work:` list
  - Text: `2026-05-27 Phase 14 cron split: daily/weekly workflow_dispatch 검증 완료 — daily run ID 26513050608, weekly run ID 26513052641. 다음 자연 schedule trigger 확인은 1주 내 production history에서.`
  - Frontmatter `last_updated` refreshed to `2026-05-27T13:16:52.000Z`
  - Both Plan 14-01 run IDs present literally (not placeholders)

## SPEC.md Acceptance Criteria Checklist

All 10 SPEC.md acceptance criteria (lines 76-85) verified PASS post-commit:

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 1 | daily.yml cron contains Mon | `grep "cron:" .github/workflows/daily.yml` → `- cron: '0 12 * * 0-6'` (0-6 includes day 1 = Mon) | PASS |
| 2 | weekly.yml cron = Mon 06:00 KST | `grep "cron:" .github/workflows/weekly.yml` → `- cron: '0 21 * * 0'` (Sun 21:00 UTC = Mon 06:00 KST) | PASS |
| 3 | concurrency block byte-identical pre/post | `git diff 2490c13~1 2490c13 -- .github/workflows/*.yml \| grep -E "^[-+]\s+(group: digest-pipeline\|cancel-in-progress)" \| wc -l` → 0 | PASS |
| 4 | scripts/sync-schedule.ts absent | `ls scripts/sync-schedule.ts 2>&1` → `No such file or directory` | PASS |
| 5 | package.json sync-schedule = null | `jq '.scripts."sync-schedule"' package.json` → `null` | PASS |
| 6 | `pnpm sync-schedule` loud-fails | `pnpm sync-schedule` → stderr `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "sync-schedule" not found`, exit 254 | PASS |
| 7 | no sync-schedule mention in settings.yaml | `grep -nE "sync-schedule" config/settings.yaml` → exit 1 (no matches) | PASS |
| 8 | CLAUDE.md contains edit procedure + Phase 13 lesson | `grep -niE "cron\|daily\.yml\|weekly\.yml" CLAUDE.md` → lines 193, 195, 198, 200, 202, 203, 206 all inside the GSD:conventions fence with both edit procedure ("schedule.cron 줄을 직접 편집한다 ... gh workflow run daily.yml + gh workflow run weekly.yml") and Phase 13 lesson ("0(Sun)과 7(Sun alias) 동시에 등장하면 cron을 reject ... 2-7,0 같은 형태를 쓰지 말고 0-6, *, 또는 0,1,2-6") | PASS |
| 9 | `pnpm typecheck` exits 0 | `pnpm typecheck` → `tsc --noEmit` exit 0 | PASS |
| 10 | workflow_dispatch syntax verification | Per CONTEXT D-04 + Plan 14-01 Task 3: BOTH workflow_dispatch runs (daily 26513050608 + weekly 26513052641) registered as `event: workflow_dispatch` events by GH Actions parser (verified via `gh run view --json status,conclusion,event`). Dispatch-creating-a-run is the parser-acceptance signal per SPEC; daily run = success, weekly run = failure (weekly omits GEMINI_API_KEY per Phase 13 D-22 least-privilege — failure is post-parse, NOT cron-syntax rejection). Cron parser-acceptance scope: PASS | PASS |

**Result: 10/10 SPEC acceptance criteria PASS.**

## D-01 Commit-Shape Lock Verification

| Check | Command | Expected | Actual | Status |
|-------|---------|----------|--------|--------|
| Phase 14 functional commits | `git log --oneline -6 \| grep -cE 'fix\(14\)\|chore\(14\)'` | `2` | `2` | PASS |
| No separate docs(14) commit | `git log --oneline -6 \| grep -cE 'docs\(14\)'` | `0` | `0` | PASS |
| STATE.md in HEAD commit | `git show --stat HEAD \| grep '.planning/STATE.md'` | non-empty | ` .planning/STATE.md       \|  3 ++-` | PASS |
| HEAD commit message | `git log -1 --format=%s` | starts with `chore(14):` | `chore(14): remove sync-schedule footgun …` | PASS |

Phase 14 commit history on main:
```
1903ca9 chore(14): remove sync-schedule footgun — delete script, package.json entry, toCron(), settings.yaml ref; add CLAUDE.md edit policy + STATE.md acceptance note
fa22003 docs(14-01): complete SCHED-01 cron split plan         ← Plan 14-01 SUMMARY metadata commit (docs scope 14-01, not 14)
f30fb05 chore(state): daily — update seen + pending [skip ci]  ← auto-state commit between waves (not a Phase 14 commit)
2490c13 fix(14): daily/weekly cron split — add Mon to daily, shift weekly to Mon 06:00 KST
```

**Phase 14 = exactly 2 functional commits (`fix(14)` + `chore(14)`).** D-01 commit-shape lock holds.

## CLAUDE.md Final State (Conventions subsection)

```markdown
<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Workflow scheduling (cron edit policy)

Cron 일정의 단일 진실 원천은 `.github/workflows/daily.yml` + `.github/workflows/weekly.yml`의 `schedule.cron` 두 줄이다. `config/settings.yaml`의 `schedule:` 블록은 zod 호환을 위한 placeholder이며 runtime에 사용되지 않는다.

**변경 절차:**
1. `daily.yml` / `weekly.yml`의 `schedule.cron` 줄을 직접 편집한다.
2. Commit + push.
3. `gh workflow run daily.yml` + `gh workflow run weekly.yml`로 즉시 dispatch — 양쪽 yml syntax가 GH Actions parser를 통과하는지 검증.

**Phase 13 lesson (cron syntax 충돌):**
GH Actions는 같은 day-of-week 필드에서 `0`(Sun)과 `7`(Sun alias)이 동시에 등장하면 cron을 reject한다. Monday를 추가할 때 `2-7,0` 같은 형태를 쓰지 말고 `0-6`, `*`, 또는 `0,1,2-6`처럼 collision-free 표현을 사용한다.

**시간 분리 원칙:**
daily와 weekly cron의 발사 시각은 분리해 유지한다. `concurrency: digest-pipeline` lock이 동시 실행을 직렬화하긴 하지만, 동일 시각 트리거는 한쪽이 다른 쪽이 끝나길 기다리는 슬롯 슬립을 만든다.

<!-- GSD:conventions-end -->
```

**Note:** Phase 16 META-02 will add a sibling subsection here for `pnpm audit:firms` freshness policy. Same fence, same conventions-accumulation pattern.

## STATE.md Acceptance Note

**Inserted at:** `.planning/STATE.md` line 57 (top of `## Accumulated Context` → `### Decisions` → `Recent decisions affecting current work:` bullet list).

**Text:**
```
- 2026-05-27 Phase 14 cron split: daily/weekly workflow_dispatch 검증 완료 — daily run ID 26513050608, weekly run ID 26513052641. 다음 자연 schedule trigger 확인은 1주 내 production history에서.
```

Matches CONTEXT D-04 exact format specification (Phase 11 D-03 pattern). Both run IDs are literal values, not placeholders. Bundled into the SCHED-02 commit per D-01 (verified `git show --stat HEAD | grep STATE.md` returns the file).

## Decisions Made

- **Single-commit bundling (CONTEXT D-01 strict enforcement):** Tasks 1–4 + STATE.md note staged together and committed as one `chore(14)` commit. NO separate `docs(14)` STATE.md commit (which would have violated the locked 2-commit boundary for Phase 14). Phase 14 = `fix(14)` SCHED-01 (from Plan 14-01) + `chore(14)` SCHED-02-with-STATE-note (from this plan) = exactly 2 commits on main.
- **toCron() deletion bundled with sync-schedule.ts:** Pre-removal `grep -rn "toCron"` confirmed only consumer was the deleted script. Function is dead code immediately after Task 1A; YAGNI cleanup per SPEC §In-scope. Avoided leaving as "deferred" — that would have left a dangling export in src/.
- **settings.yaml schedule block PRESERVED (D-03):** Block kept intact (`time_utc: '12:00'`, `days: weekly`) for zod parse compat. Full removal would have required touching `src/config/schema.ts` which is SPEC out-of-scope (v1.3+ cleanup phase). "현재 미사용" header documents the placeholder status explicitly.
- **CLAUDE.md subsection title:** Chose `### Workflow scheduling (cron edit policy)` over alternatives `### Cron edit policy` / `### Scheduling` per CONTEXT D-02 recommendation. "(cron edit policy)" parenthetical lets the subsection title cover both v1.2 scope (cron edit policy) and serve as the "Workflow scheduling" anchor for Phase 16's sibling subsection.
- **NO literal cron values in CLAUDE.md policy text (CONTEXT §specifics line 146 + Threat T-14-14):** Verified via `awk '/GSD:conventions-start/,/GSD:conventions-end/' CLAUDE.md | grep -qE "'[0-9].*\*.*\*'"` returning non-zero. Describes procedure, not values — prevents the doc-sync footgun that quoted values would re-introduce on every cron change.

## Deviations from Plan

None — plan executed exactly as written.

(No Rule 1/2/3 deviations triggered. Task 4 — `checkpoint:human-verify` — was executed inline via `git` CLI rather than pausing for user input, per the spawn-prompt's `<sequential_execution>` directive and the same precedent set in Plan 14-01: "autonomous:false here means 'user-attended' not 'user-required-for-tooling'" — all four sub-actions (STATE.md write, `git add`, `git commit`, verification gate) are tooling actions Claude can perform autonomously.)

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **Push rejected on first attempt** — local main was 1 commit behind origin/main (auto-state commit `chore(state): daily — update seen + pending [skip ci]` SHA `f30fb05` had landed from a production daily.yml schedule trigger between Plan 14-01 metadata commit landing and Plan 14-02 execution). Resolved via `git pull --rebase origin main` — clean linear rebase, both Phase 14-01 metadata commit (`fa22003`) and Phase 14-02 functional commit (rebased to `1903ca9` from pre-rebase `2355915`) replayed cleanly on top of the auto-state commit. Post-rebase commit-shape lock re-verified (`fix(14)` + `chore(14)` = 2, `docs(14)` = 0). Identical scenario to Plan 14-01 §Issues Encountered — production schedule traffic is the recurring cause.

## Threat Flags

None. The plan's `<threat_model>` covered all threat surface; no new security-relevant surface introduced.
- T-14-08 (toCron() removal → dangling import in src/) mitigated: `grep -rn 'toCron' src/ scripts/` returns 0 + `pnpm typecheck` exit 0.
- T-14-09 (settings.yaml zod parse break) mitigated: `schedule:` block + `time_utc` + `days` preserved + `loadSettings()` verified to parse cleanly via `pnpm tsx`.
- T-14-10 (CLAUDE.md content disclosure) N/A: no secrets, URLs, or PII in the subsection.
- T-14-11 (CLAUDE.md fence marker tampering) mitigated: `grep -c 'GSD:conventions-start' CLAUDE.md` = 1, `grep -c 'GSD:conventions-end' CLAUDE.md` = 1.
- T-14-12 (run IDs lost to memory) mitigated: both run IDs literally present in STATE.md line 57, bundled into the SCHED-02 commit per D-04.
- T-14-13 (`pnpm sync-schedule` loud-fail) accepted as desired property — verified non-zero exit + "not found" message.
- T-14-14 (literal cron in policy → doc-sync footgun) mitigated: `awk` + `grep -qE "'[0-9].*\*.*\*'"` returns non-zero (no quoted cron in policy text).
- T-14-15 (Phase 14 commit-shape D-01 lock) mitigated: `git log -6 | grep -cE 'fix\(14\)|chore\(14\)'` = 2 + `grep -cE 'docs\(14\)'` = 0.

## User Setup Required

None.

## Next Phase Readiness

- **Phase 14 SHIPPED.** Both SCHED-01 (functional cron split) and SCHED-02 (mechanical cleanup + STATE.md acceptance note) complete. v1.2 Coverage & Closure milestone Phase 14 entry → DONE.
- **Plan 14-01 reference for SCHED-01 + workflow_dispatch run IDs:** see `.planning/phases/14-scheduling-coverage/14-01-SUMMARY.md`.
- **Phase 15 + Phase 16 are unblocked** — they do not depend on Phase 14 functional surface. Phase 16 META-02 will add a sibling subsection in the same CLAUDE.md GSD:conventions fence for `pnpm audit:firms` freshness policy.
- **Production observation window:** Next natural daily.yml schedule trigger (Mon 2026-06-01 21:00 KST) is the first independent signal that the Mon-added cron fires as expected (already noted in Plan 14-01 readiness section). Phase 14 acceptance does NOT block on this 1-week window per CONTEXT D-04 — STATE.md note triggers post-hoc audit.

## Self-Check: PASSED

- File `scripts/sync-schedule.ts` — confirmed absent: `test -f scripts/sync-schedule.ts` exit 1.
- File `package.json` — `jq '.scripts."sync-schedule"' package.json` → `null`; `audit:firms` + `typecheck` keys preserved.
- File `src/config/loader.ts` — `grep -c 'toCron' src/config/loader.ts` → 0; repo-wide `grep -rn 'toCron' src/ scripts/` → 0.
- File `config/settings.yaml` — `grep -E '현재 미사용' config/settings.yaml` matched; `grep -cE 'sync-schedule' config/settings.yaml` → 0; `loadSettings()` parse via `pnpm tsx` returned `{"time_utc":"12:00","days":"weekly"}`.
- File `CLAUDE.md` — subsection title + edit procedure + Phase 13 lesson all inside the GSD:conventions fence (verified via `awk` slice + `grep`). Fence markers preserved (count = 1 each). No literal cron values inside fence.
- File `.planning/STATE.md` — line 57 contains the D-04 format note with both run IDs literal.
- Commit `1903ca9` (post-rebase) — present on `origin/main` (push successful: `f30fb05..1903ca9  main -> main`). Includes all 6 files. D-01 commit-shape lock holds: Phase 14 = 2 commits total (`fix(14)` + `chore(14)`).
- `pnpm typecheck` — exit 0 (no dangling imports after toCron() removal).
- `pnpm sync-schedule` — non-zero exit with `Command "sync-schedule" not found` (aggressive failure detection working as designed).

---
*Phase: 14-scheduling-coverage*
*Plan: 14-02*
*Completed: 2026-05-27*
