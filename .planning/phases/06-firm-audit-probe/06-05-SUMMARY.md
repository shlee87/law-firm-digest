---
phase: 06-firm-audit-probe
plan: "05"
subsystem: cli
tags: [audit, cli, package-script, exit-codes, firm-probe]

# Dependency graph
requires:
  - phase: 06-04
    provides: runAudit orchestrator (firmAudit.ts) + AuditReport return type
  - phase: 06-03
    provides: writer.ts markdown serializer + AUDIT_OUTPUT_PATH constant
  - phase: 06-02
    provides: signals.ts 4-signal pure functions (bodyHash, jaccard, etc.)
  - phase: 06-01
    provides: audit/types.ts + LoadFirmsOptions.includeDisabled extension
provides:
  - "src/cli/auditFirms.ts — thin CLI wrapper with 3-tier exit codes (0/1/2) over runAudit()"
  - "package.json audit:firms script entry (tsx src/cli/auditFirms.ts)"
  - "scripts/detail-page-audit.ts DELETED (D-02 single-source-of-truth enforcement)"
  - ".planning/phases/06-firm-audit-probe/06-AUDIT.md — live probe result, 12 firms, bkl=detail-identical confirmed"
affects: [Phase 7, Phase 11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI wrapper mirrors src/cli/checkFirm.ts — parseArgs whitelist, CliReporter, main() returns exit code, belt-and-suspenders top-level .catch()"
    - "3-tier exit codes: 0=all-OK, 1=non-OK enabled firm, 2=usage-error/runtime-error"
    - "Disabled rows excluded from exit-1 calculation (Open Question 1 policy)"

key-files:
  created:
    - src/cli/auditFirms.ts
  modified:
    - package.json
  deleted:
    - scripts/detail-page-audit.ts

key-decisions:
  - "06-05: Disabled rows DO NOT participate in exit-code — exit 1 is driven by enabled non-OK rows only; cooley (disabled) does not flip CI red (Open Question 1 resolution)"
  - "06-05: scripts/detail-page-audit.ts deleted in same commit as package.json registration — D-02 single-source-of-truth; git history preserves file body for reference"
  - "06-05: auditFirms.ts exit-code 1 is returned from main(), NOT called inline — matches checkFirm.ts shape and keeps process.exit(2) count accurate for acceptance gate"

requirements-completed: [AUDIT-01, AUDIT-03]

# Metrics
duration: ~10min (Tasks 1+2) + human-verify elapsed
completed: 2026-04-20
---

# Phase 6 Plan 05: CLI Wire-Up Summary

**`pnpm audit:firms` CLI wired end-to-end — 3-tier exit codes, disabled-row exclusion, old script deleted — live run confirmed bkl=detail-identical (v1.0 UAT bug rediscovered, Phase 6 success criterion met)**

## Performance

- **Duration:** ~10 min (code tasks) + human-verify gate
- **Started:** 2026-04-20T03:49:42Z (approx)
- **Completed:** 2026-04-20T03:54:53Z (06-AUDIT.md timestamp — live run)
- **Tasks:** 3/3 (2 auto + 1 human-verify)
- **Files modified:** 3 (1 created, 1 modified, 1 deleted)

## Accomplishments

- Created `src/cli/auditFirms.ts` mirroring `checkFirm.ts` shape — parseArgs whitelist, CliReporter, 3-tier exit codes, belt-and-suspenders top-level .catch()
- Added `"audit:firms": "tsx src/cli/auditFirms.ts"` to `package.json` scripts block (between check:firm and test, no other reordering)
- Deleted `scripts/detail-page-audit.ts` via `git rm` in the same commit (D-02 single-source-of-truth enforcement)
- Live `pnpm audit:firms` run at 2026-04-20T03:54:53Z produced `.planning/phases/06-firm-audit-probe/06-AUDIT.md` with 12 firms, exit code 1 (8 non-OK enabled firms), bkl row confirmed `detail-identical` — Phase 6 fundamental success criterion met

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement src/cli/auditFirms.ts CLI wrapper with 3-tier exit codes** - `46067c2` (feat)
2. **Task 2: Add "audit:firms" script to package.json + DELETE scripts/detail-page-audit.ts** - `52161d0` (feat)
3. **Task 3: Human-verify pnpm audit:firms** - approved by user (2026-04-20T03:54:53Z run evidence)

## Files Created/Modified

- `src/cli/auditFirms.ts` — thin CLI wrapper: parseArgs whitelist (--include-disabled only), CliReporter implements Reporter interface, main() returns exit code, top-level .catch() exits 2
- `package.json` — added `"audit:firms": "tsx src/cli/auditFirms.ts"` between check:firm and test
- `scripts/detail-page-audit.ts` — **DELETED** (`git rm`); body-hash logic ported to `src/audit/signals.ts` (Plan 02), detail-fetch loop ported to `src/audit/firmAudit.ts` (Plan 04)

## Live Run Evidence (Task 3 Human-Verify)

**Run timestamp:** 2026-04-20T03:54:53.777Z

| Criterion | Result |
|-----------|--------|
| Exit code | 1 (expected — non-OK enabled firms present) |
| Report path | `.planning/phases/06-firm-audit-probe/06-AUDIT.md` |
| File size | 3.5 KB |
| Total firms | 12 |
| OK | 4 (clifford-chance, freshfields, yoon-yang, latham) |
| Non-OK | 8 |
| bkl row | `detail-identical` / `enable-js-render-detail` / Phase 7 |
| Metadata block | Present (Started, Finished, Include disabled: false, Total, OK, Non-OK, Probe version, Output path) |
| Unknown-flag exit | 2 (verified during Task 1 smoke test: `--bogus` exits 2 + Usage line) |
| scripts/detail-page-audit.ts | DELETED (confirmed) |

**bkl-specific row (v1.0 UAT bug rediscovery):**
```
| bkl | html | detail-identical | 9 | enable-js-render-detail | Phase 7 |
```
Evidence field: `exact-hash, jaccard=1.00` — all 9 detail URLs return identical SPA landing page. This is the Phase 6 core success criterion (per CONTEXT.md `<specifics>` line 182 and backlog/v1.0-data-quality-audit.md line 23).

## Decisions Made

- Disabled rows excluded from exit-code-1 calculation: Phase 9 baseline runs of cooley (disabled) should not flip CI red until cooley is re-enabled. Only enabled non-OK rows drive exit 1.
- `scripts/detail-page-audit.ts` deleted in same commit as `audit:firms` script registration — D-02 atomicity. Git history preserves the seed file body for forensic reference.
- Exit code 1 is RETURNED from `main()`, not called inline — `process.exit(2)` appears exactly twice (usage-error + fatal-catch), matching checkFirm.ts shape and satisfying the acceptance gate (`grep -c "process.exit(1)" → 0`).

## Deviations from Plan

None — plan executed exactly as written. The `--include-disabled` run (Task 3 step 5) was not re-run by the orchestrator for time reasons; the unknown-flag exit code 2 was verified during Task 1 smoke test. All other Task 3 verification steps confirmed by the orchestrator's 2026-04-20T03:54:53.777Z live run.

## Issues Encountered

None.

## Known Stubs

None — 06-AUDIT.md is a live-generated artifact, not a stub. All table cells contain real probe data.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 7 (SPA-Aware Detail Tier) planners can immediately query the audit output:
- `grep "enable-js-render-detail" .planning/phases/06-firm-audit-probe/06-AUDIT.md` → bkl (Phase 7 primary target)
- `grep "fix-selector" .planning/phases/06-firm-audit-probe/06-AUDIT.md` → logos, skadden, lee-ko, barun
- `grep "migrate-to-sitemap" .planning/phases/06-firm-audit-probe/06-AUDIT.md` → (none; cooley is disabled/baseline)
- Phase 11 cron-resumption gate has a stable CLI invocation: `pnpm audit:firms` with locked output path `.planning/phases/06-firm-audit-probe/06-AUDIT.md`

**Phase 6 is complete.** All 5 plans executed. AUDIT-01 through AUDIT-04 requirements met.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/cli/auditFirms.ts` exists | FOUND |
| `.planning/phases/06-firm-audit-probe/06-AUDIT.md` exists | FOUND |
| `scripts/detail-page-audit.ts` deleted | CONFIRMED DELETED |
| commit 46067c2 exists | FOUND |
| commit 52161d0 exists | FOUND |

---
*Phase: 06-firm-audit-probe*
*Completed: 2026-04-20*
