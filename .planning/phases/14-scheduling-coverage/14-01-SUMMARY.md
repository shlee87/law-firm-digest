---
phase: 14-scheduling-coverage
plan: 01
subsystem: infra
tags: [scheduling, github-actions, cron, ops, workflow_dispatch]

# Dependency graph
requires:
  - phase: 13-1-gemini-rpd
    provides: "Daily/weekly cron split with shared concurrency: digest-pipeline lock; day-7/day-0 collision lesson"
  - phase: 11-cron-resumption-gate
    provides: "STATE.md acceptance note pattern (D-03) — single-line dispatch verification record"
provides:
  - "daily.yml cron extended to all 7 days (0-6) — closes 일–화 ~48h fetch gap"
  - "weekly.yml cron shifted to Sun 21:00 UTC (= Mon 06:00 KST) — time-separated from daily Mon 21:00 KST run"
  - "Header comments rewritten in both yml files: direct-edit procedure + Phase 13 cron-collision lesson + workflow_dispatch verification step"
  - "GH Actions parser acceptance evidence for both new cron strings (workflow_dispatch run IDs captured)"
affects: [14-02, 16-meta]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct yml edit + commit + `gh workflow run` verification (no intermediate config-sync script)"
    - "Cron arithmetic documented inline: 'Mon 06:00 KST = Sun 21:00 UTC' makes timezone conversion auditable in the file"

key-files:
  created: []
  modified:
    - .github/workflows/daily.yml
    - .github/workflows/weekly.yml

key-decisions:
  - "daily cron written as '0 12 * * 0-6' (range), not '0,1,2-6' (enumerated) — both are collision-free per Phase 13 lesson, range is shorter + clearer"
  - "weekly time-of-day chosen as Mon 06:00 KST (= Sun 21:00 UTC) for 15h separation from daily Mon 21:00 KST — concurrency lock still serializes if hosting delay collides them"
  - "Header comments describe procedure not literal values — per CONTEXT specifics line 146, quoting cron strings in comments would create a new sync footgun"
  - "Plan boundary = 1 atomic commit (CONTEXT D-01): SCHED-01 functional change isolated from SCHED-02 mechanical cleanup (Plan 14-02) for git-bisect cleanliness"

patterns-established:
  - "Cron-edit verification protocol: edit → commit → push → `gh workflow run {name}.yml` → `gh workflow view {name}.yml --yaml | grep cron:` confirms GH Actions parser accepted the new string. Documented in Plan 14-02 (CLAUDE.md update)."
  - "Concurrency block byte-identity invariant: `git diff <yml> | grep -E '^[-+]\\s+(group: digest-pipeline|cancel-in-progress)'` must return zero lines after any cron edit. Enforced in Phase 14 SPEC R-03 + verified pre-commit here."

requirements-completed: [SCHED-01]

# Metrics
duration: 3min
completed: 2026-05-27
---

# Phase 14 Plan 01: Scheduling Coverage Summary

**daily.yml cron extended to all 7 days at 21:00 KST and weekly.yml shifted to Mon 06:00 KST via two single-line cron edits + header comment rewrites; concurrency lock and all step bodies byte-identical.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-27T13:07:43Z
- **Completed:** 2026-05-27T13:10:43Z
- **Tasks:** 3 (2 auto edits + 1 human-verify checkpoint executed via gh CLI)
- **Files modified:** 2

## Accomplishments

- **Monday daily fetch added** — `.github/workflows/daily.yml` cron `'0 12 * * 0,2-6'` → `'0 12 * * 0-6'`. Pipeline now fetches every weekday at 21:00 KST, closing the 일–화 ~48h gap identified in v1.1 close.
- **Weekly time-slot shifted** — `.github/workflows/weekly.yml` cron `'0 12 * * 1'` → `'0 21 * * 0'`. Weekly digest now fires Mon 06:00 KST (= Sun 21:00 UTC), 15h separated from the new daily Mon 21:00 KST run.
- **Concurrency invariant preserved** — `concurrency: digest-pipeline` blocks in both files byte-identical pre/post (`git diff | grep -E '^[-+]\s+(group: digest-pipeline|cancel-in-progress)'` returned 0 lines).
- **GH Actions parser acceptance proven** — Both workflows dispatched successfully (run IDs `26513050608` + `26513052641`); GH Actions accepted both new cron strings.

## Task Commits

Per CONTEXT D-01, Plan 14-01 is a **single atomic commit** covering both Task 1 and Task 2 (functional change boundary for git-bisect cleanliness):

1. **Task 1 + Task 2 (bundled): daily/weekly cron split** — `2490c13` (`fix(14)`)
   - daily.yml cron + header comment update
   - weekly.yml cron + header comment update
   - Single commit per CONTEXT D-01 commit-shape decision
3. **Task 3: workflow_dispatch verification** — no commit; CLI-executed evidence (run IDs captured below)

**Plan metadata (this commit):** to be created when this SUMMARY + STATE/ROADMAP updates land.

## Files Modified

- `.github/workflows/daily.yml`
  - Lines 22-28 only: cron expression + 4-line header comment block (was 3 lines + sync-schedule footnote).
  - Lines 30-32 (concurrency block) + lines 34+ (permissions, jobs, steps, Issue-on-failure) untouched.
- `.github/workflows/weekly.yml`
  - Lines 26-31 only: cron expression + 2-line header comment block.
  - Lines 33-35 (concurrency block) + lines 37+ (permissions, jobs, steps, Issue-on-failure) untouched.

## Workflow Dispatch Verification (Task 3 evidence)

| Workflow | Run ID | Event | Status (at capture time) | Cron seen by GH Actions parser |
|----------|--------|-------|--------------------------|-------------------------------|
| daily.yml | 26513050608 | workflow_dispatch | in_progress | `'0 12 * * 0-6'` |
| weekly.yml | 26513052641 | workflow_dispatch | pending | `'0 21 * * 0'` |

Both `gh workflow view <name>.yml --yaml | grep cron:` returned exactly the new cron strings — GH Actions parser accepted both. Per Phase 14 SPEC §AC#10 + Task 3 acceptance: dispatch creating a run (vs syntax-rejection) IS the parser-acceptance signal.

These run IDs will be embedded into the STATE.md acceptance note created in Plan 14-02 Task 4 (per CONTEXT D-04 + Phase 11 D-03 pattern).

## Diff Summary

```diff
diff --git a/.github/workflows/daily.yml b/.github/workflows/daily.yml
@@ -20,11 +20,12 @@
 on:
-  # 발송 일정 — config/settings.yaml의 schedule.cron과 동일하게 유지하세요.
-  # 변경 방법: 아래 cron 값을 수정한 뒤 config/settings.yaml도 동일하게 맞춰주세요.
+  # 발송 일정 — cron은 이 파일과 weekly.yml에서 직접 관리합니다.
+  # 변경 절차: 아래 cron 줄을 수정 → commit → push → `gh workflow run daily.yml`로 검증.
+  # Phase 13 lesson: day-of-week 필드에서 0(Sun)과 7(Sun alias) 동시 사용 금지 (GH Actions reject).
   # 형식: '분 시(UTC) 일 월 요일' (KST = UTC+9)
   schedule:
-    - cron: '0 12 * * 0,2-6'  # Phase 13: 화~일 매일 21:00 KST (월요일은 weekly.yml 이 담당)
+    - cron: '0 12 * * 0-6'  # Phase 14: 매일(월~일) 21:00 KST

diff --git a/.github/workflows/weekly.yml b/.github/workflows/weekly.yml
@@ -24,10 +24,10 @@
 on:
-  # Phase 13 cadence — config/settings.yaml decoupling tracked separately
-  # (SPEC §Out-of-scope §1 / §2).
+  # 발송 일정 — Mon 06:00 KST. daily.yml의 Mon 21:00 KST run과 시간 분리.
+  # 변경 절차: 아래 cron 줄을 수정 → commit → push → `gh workflow run weekly.yml`로 검증.
   schedule:
-    - cron: '0 12 * * 1'  # 월요일 21:00 KST = 12:00 UTC
+    - cron: '0 21 * * 0'  # Phase 14: 월요일 06:00 KST = 일요일 21:00 UTC
```

Stat: `2 files changed, 7 insertions(+), 6 deletions(-)`.

## Decisions Made

- **Commit bundling (CONTEXT D-01):** Plan 14-01 = 1 commit, not 2-per-task. Tasks 1 and 2 are tightly coupled (both alter the same SCHED-01 functional surface — cron coverage) and CONTEXT D-01 explicitly groups them. Per-task commits would create a transient mid-state where daily.yml has Mon but weekly.yml still runs at the colliding slot.
- **Cron range form (`0-6`) chosen over enumeration (`0,1,2-6`) or wildcard (`*`):** PATTERNS.md offers all three as Phase 13–compliant. Range is shortest, clearest, and matches the "every day" intent. Wildcard `*` would work but is implicit and could mask future intent.
- **Header comment rewrite scope:** Dropped the "config/settings.yaml과 동일하게 유지" line from daily.yml because settings.yaml is no longer the source of truth (formalized in Plan 14-02 via SCHED-02 cleanup). Added Phase 13 day-7/day-0 lesson directly into daily.yml header so future cron-editing sessions see the lesson at edit time, not after parser rejection.

## Deviations from Plan

None — plan executed exactly as written.

(No Rule 1/2/3 deviations triggered. Task 3 — `checkpoint:human-verify` — was executed via `gh` CLI rather than pausing for user input, per the spawn-prompt's checkpoint protocol: "If the checkpoint task is something you can perform yourself via the `gh` CLI ... prefer that over pausing — autonomous:false here means 'user-attended' not 'user-required-for-tooling'.")

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **Push rejected on first attempt** — local main was 3 commits behind origin/main (auto-state commits `chore(state): daily — update seen + pending [skip ci]` and `chore(state): weekly — sent digest, truncate pending [skip ci]` had landed from production schedule triggers between plan-phase and execute-phase). Resolved by stashing the pre-existing uncommitted `.planning/STATE.md` edit + untracked `.planning/telemetry/` dir, running `git pull --rebase origin main`, then restoring the stash. The Plan 14-01 commit cleanly rebased on top of the remote auto-state commits — final SHA is `2490c13` (originally `a54231f` pre-rebase). Concurrency block byte-identity verified again post-rebase via the same diff filter.

## Threat Flags

None. The plan's `<threat_model>` covered all threat surface; no new surface introduced. T-14-01 (daily cron DoS), T-14-02 (weekly cron DoS), T-14-03 (concurrency tampering), T-14-04 (atomic-commit step tampering) all mitigated as designed and verified pre-commit.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 14-02 (SCHED-02 mechanical cleanup) is unblocked** — depends on this functional change landing. 14-02 will delete `scripts/sync-schedule.ts`, remove the `package.json` script entry, drop `toCron()` from `src/config/loader.ts`, rewrite `config/settings.yaml` schedule-block header, add CLAUDE.md `### Workflow scheduling (cron edit policy)` subsection, and append the STATE.md acceptance note embedding the two run IDs captured above.
- **Production observation window:** Next natural daily.yml schedule trigger (Mon 2026-06-01 21:00 KST) is the first independent signal that the Mon-added cron fires as expected. Phase 14 acceptance does NOT block on this 1-week window per CONTEXT D-04 + SPEC out-of-scope — it's tracked as a passive STATE.md note for post-hoc audit.

## Self-Check: PASSED

- File `.github/workflows/daily.yml` — modified at commit `2490c13`, cron value `'0 12 * * 0-6'` confirmed via `grep` + `gh workflow view --yaml`.
- File `.github/workflows/weekly.yml` — modified at commit `2490c13`, cron value `'0 21 * * 0'` confirmed via `grep` + `gh workflow view --yaml`.
- Commit `2490c13` — present on `origin/main` (push successful: `2660ff4..2490c13  main -> main`).
- Workflow dispatch runs `26513050608` (daily) + `26513052641` (weekly) — both registered as `workflow_dispatch` events, both accepted by GH Actions parser (cron strings appear in `gh workflow view --yaml` output).
- Concurrency blocks — `git diff` filter returned 0 lines (byte-identical pre/post).

---
*Phase: 14-scheduling-coverage*
*Plan: 14-01*
*Completed: 2026-05-27*
