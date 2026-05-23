---
phase: 13-1-gemini-rpd
fixed_at: 2026-05-23T00:50:00Z
review_path: .planning/phases/13-1-gemini-rpd/13-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-05-23T00:50:00Z
**Source review:** .planning/phases/13-1-gemini-rpd/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR=0, WR=3 — Info findings out of scope per fix_scope=critical_warning)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-03: writeArchive failure after sendMail success will resend on next weekly run

**Files modified:** `src/pipeline/runWeekly.ts`, `test/pipeline/runWeekly.e2e.test.ts`
**Commit:** 0f8ae8c
**Applied fix:** Applied Option 1 from REVIEW.md — reordered so `writeArchive` runs BEFORE `sendMail` inside the `!skipEmail` branch. Archive failure now aborts before network egress, closing the duplicate-send window on the next weekly run. The reorder broke two existing assertions in `runWeekly.e2e.test.ts` that asserted the old (broken) contract: (a) the AC-2 ordering assertion `sendOrder < archiveOrder` was flipped to `archiveOrder < sendOrder`, and (b) the AC-2 atomicity assertion `expect(mocks.writeArchiveMock).not.toHaveBeenCalled()` was updated to `toHaveBeenCalledTimes(1)` because archive now runs first. The truncate-not-called invariant on the failure path is preserved (sendMail throws before reaching truncatePending). Documented the trade-off in code comments: a successful archive no longer implies a successful send.

### WR-01: runWeekly truncates pending even when skipEmail=true (potential silent data loss)

**Files modified:** `src/pipeline/runWeekly.ts`
**Commit:** 29243a8
**Applied fix:** Moved `truncatePending()` (and its reporter section) inside the `!skipEmail` branch. Added a `would-truncate` reporter line on the dry-run branch so the skip is observable. Production caller (`src/main.ts`) does not pass `skipEmail`, so behavior on the normal path is unchanged. Added a code comment explaining the W-01 gate and preserving the D-09 truncate-after-send invariant on the live path. Did NOT adopt the alternative (removing `skipEmail` entirely) since the field is declared on `RunOptions` and the runTypes comment promises weekly honors it — the surgical fix is to actually honor it.

### WR-02: jsRenderFailures misses detail_tier='js-render' firms

**Files modified:** `src/pipeline/runDaily.ts`
**Commit:** 4cf4cd7
**Applied fix:** Extended the `jsRenderFailures` filter to count failures from firms with `detail_tier === 'js-render'` in addition to `type === 'js-render'`. This mirrors the browser launch decision on lines 104-109 so the fail-loud exit gate matches the surface that triggered the browser. Per the user's scope decision, `type === 'sitemap'` was NOT added to the filter even though it triggers the same browser launch — that's a separate scope decision to defer rather than collapse into a fix.

## Verification

- All 3 fixes verified via Tier 1 (re-read modified file sections) and Tier 2 (`pnpm typecheck` — clean across the codebase).
- Per-fix test verification: `pnpm test test/pipeline/runWeekly.e2e.test.ts` (3 passed) after WR-03 and WR-01; `pnpm test test/pipeline/runDaily.e2e.test.ts` (3 passed) after WR-02.
- Full suite sanity check: `pnpm test` → 35 test files, 476 tests, all passing.

---

_Fixed: 2026-05-23T00:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
