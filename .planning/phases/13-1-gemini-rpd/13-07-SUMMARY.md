---
phase: 13-1-gemini-rpd
plan: 07
subsystem: testing
tags: [vitest, e2e-fixture, ac-1, ac-2, ac-3, mock-boundary, comp-05, ops-03, atomicity]

# Dependency graph
requires:
  - phase: 13-1-gemini-rpd
    provides: "src/pipeline/runDaily.ts (plan 13-03) — entry under AC-1 test"
  - phase: 13-1-gemini-rpd
    provides: "src/pipeline/runWeekly.ts (plan 13-04) — entry under AC-2 + AC-3 test"
  - phase: 13-1-gemini-rpd
    provides: "src/state/pending.ts readPending/appendPending/truncatePending (plan 13-01) — used unmocked against tmp dir"
  - phase: 13-1-gemini-rpd
    provides: "src/compose/heartbeat.ts composeHeartbeat (plan 13-04) — pure function used unmocked for AC-3 subject assertion"
  - phase: 13-1-gemini-rpd
    provides: "geminiCallCount module-level counter (plan 13-02) — reset/get mocked in both e2e fixtures"
provides:
  - "test/pipeline/runDaily.e2e.test.ts — AC-1 e2e: 3 raw items → pending.json items.length === 3, COMP-05 description absent, sendMail/writeArchive never invoked, D-09 windowStart preservation, SUMM-06 Layer 1 short-circuit"
  - "test/pipeline/runWeekly.e2e.test.ts — AC-2 digest e2e (5 pending → sendMail 1x + writeArchive 1x + truncate, OPS-03 ordering locked) + AC-3 heartbeat e2e (0 pending → heartbeat subject + minimal body)"
  - "test/pipeline/run.test.disabled.ts deletion — Plan 13-05 deferred item resolved; replacement coverage delivered by the two new e2e fixtures"
  - "Atomicity invariant locked: sendMail throws → writeArchive NOT called + pending preserved (idempotent recovery on next workflow_dispatch)"
affects:
  - "Phase 13 close: SPEC AC-1/2/3 acceptance gates now have automated regression coverage; AC-7 (7-day natural cron average ≤ 15) remains a post-merge operational observation"
  - "Future runDaily/runWeekly refactors: the e2e fixtures act as load-bearing contract tests for the daily/weekly transaction sequence"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.hoisted mock pattern: factory closures and test bodies share the same vi.fn() instances so per-test mockResolvedValue overrides reach the run-under-test"
    - "Hybrid mock + real-fs e2e: I/O boundaries mocked at module level, but the on-disk side effects under test (pending.json append, truncate, windowStart reset) run against the real readPending against a tmp dir chdir'd per test"
    - "Mock factory omission as invariant proof: runWeekly.e2e.test.ts intentionally omits `summarize` from the gemini module mock factory — if a future regression adds the import, the runtime fails with 'undefined is not a function' rather than silently calling Gemini"
    - "OPS-03 ordering assertion via invocationCallOrder: sendMail < writeArchive enforces the transaction ordering at the runtime mock level (complementing the source-code ordering in runWeekly.ts)"
    - "Atomicity assertion via rejection: sendMail.mockRejectedValueOnce + writeArchive NOT called + pending unchanged proves the idempotent-recovery contract locked into runWeekly.ts try/catch ordering"

key-files:
  created:
    - test/pipeline/runDaily.e2e.test.ts
    - test/pipeline/runWeekly.e2e.test.ts
  modified:
    - .planning/phases/13-1-gemini-rpd/deferred-items.md
  deleted:
    - test/pipeline/run.test.disabled.ts

key-decisions:
  - "Phase 13-07: hybrid mock + real-fs e2e style chosen over pure-mock — sendMail/writeArchive/loadFirms mocked at module level, but readPending/truncatePending operate on real on-disk pending.json under a tmp dir. This makes the COMP-05 (no description on pending items) + D-09 (windowStart preservation across appends + reset on truncate) invariants observable at the actual storage boundary, not at the function-boundary signature."
  - "Phase 13-07: composeDigest + composeHeartbeat are intentionally NOT mocked. They are pure functions used by runWeekly, and the subject/body content shape contributes to AC-2 (subject prefix + negation of heartbeat marker) and AC-3 (heartbeat subject contains 이번 주 신규 없음 + body matches D-17 minimal markers). Mocking them would force test-only stand-ins that drift from the production output."
  - "Phase 13-07: runWeekly gemini mock factory deliberately exposes only resetGeminiCallCount + getGeminiCallCount, NOT summarize. This makes AC-3 cross-mode invariant ('weekly never calls Gemini') a runtime gate — any future regression that adds the summarize import surfaces as 'undefined is not a function' rather than silently invoking the real (or mocked) summarize function."
  - "Phase 13-07: AC-2 digest subject assertion softened from the original PLAN.md regex (which hardcoded '(1 firms, 5 items)') to a prefix-only match + negation of heartbeat marker. composeDigest may pluralize '1 firm' vs '1 firms' in the future, and the brittle exact-match would block that without test-of-test value; the EMAIL-04 prefix `[법률 다이제스트] YYYY-MM-DD` + 'not 이번 주 신규 없음' is the load-bearing AC-2 signal."
  - "Phase 13-07: Added a third AC-2 test ('atomicity: sendMail throws → pending NOT truncated') beyond the original PLAN.md two scenarios. The OPS-03 transaction-ordering invariant (send → archive → truncate, with failure rolling back the truncate) is what makes the next manual workflow_dispatch a clean idempotent retry — locking it down with a fixture prevents future refactors from accidentally moving truncatePending above sendMail."
  - "Phase 13-07: run.test.disabled.ts deleted outright rather than split. The disabled file's 14 describe/it blocks map cleanly to: (a) two new e2e files for orchestration flow, (b) existing sibling unit tests (guard01Layer1.test.ts for Layer 1, clusterDetection.test.ts for DQOBS-03 markers, scrapers/jsRender.test.ts for browser lifecycle, recorder.test.ts for DQOBS-01 metrics). The RunOptions surface tests (firmFilter / saveHtmlPath / skipStateWrite) are noted in deferred-items.md as a non-blocking follow-up — runDaily/runWeekly option contracts are better tested in focused unit tests than re-litigated in e2e."
  - "Phase 13-07: AC-7 (7-day natural cron operation: daily-avg geminiCallCount ≤ 15 + weekly === 0) is NOT covered by automated tests in this plan. It requires real cron cycles to verify. Plan 13-06 already executed a manual workflow_dispatch smoke (daily run 26309754807 emitted [METRIC] geminiCallCount=21, weekly run 26309956124 emitted [METRIC] geminiCallCount=0). Post-merge operational tracking begins when natural cron fires."

patterns-established:
  - "vi.hoisted mock pattern for orchestration-root e2e: vi.hoisted captures the vi.fn() instances + factory closures reference them so beforeEach overrides reach the run under test. Avoids the trap where vi.mock factories execute before the test file's top-level variables initialize."
  - "Module-mock-with-omission as compile-time + runtime invariant: leave a forbidden symbol OUT of the mock factory so any future code change that adds the import fails at run rather than passing tests against a stub."

requirements-completed: [SPEC-1, SPEC-2, SPEC-5]

# Metrics
duration: 6min
completed: 2026-05-23
---

# Phase 13 Plan 07: e2e Fixtures for SPEC AC-1/AC-2/AC-3 Summary

**Two vitest e2e fixtures (runDaily.e2e.test.ts + runWeekly.e2e.test.ts) locking down SPEC AC-1 (daily appends pending, no send, no archive), AC-2 (5 pending → digest + truncate with OPS-03 ordering), and AC-3 (0 pending → heartbeat with 이번 주 신규 없음 marker); Plan 13-05 deferred run.test.disabled.ts deleted, replaced by the two new fixtures.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-23T05:21:40Z
- **Completed:** 2026-05-23T05:27:37Z
- **Tasks:** 3
- **Files created:** 2 (runDaily.e2e.test.ts, runWeekly.e2e.test.ts)
- **Files modified:** 1 (deferred-items.md)
- **Files deleted:** 1 (run.test.disabled.ts)
- **Full suite:** 35 test files / 476 tests pass (was 33 / 470 baseline; +2 files, +6 tests net)

## Accomplishments

- **AC-1 automated regression coverage** — `test/pipeline/runDaily.e2e.test.ts` asserts 3 raw items → `pending.json` items.length === 3, `sendMail`/`writeArchive` never invoked (compile-time guarantee from runDaily's import absence, runtime counterpart via `report.digestSent === false` + `report.archivePath === undefined`), COMP-05 `description` field absent on every persisted PendingItem, SUMM-06 Layer 1 short-circuit (body < min_body_chars → summarize NOT called), D-09 windowStart preservation across appends, W2 AC-7 per-run cap (`geminiCallCount ≤ 50`).
- **AC-2 + AC-3 automated regression coverage** — `test/pipeline/runWeekly.e2e.test.ts` asserts: AC-2 digest path (5 pending → sendMail 1x with `[법률 다이제스트] YYYY-MM-DD` prefix subject + heartbeat-marker negation + writeArchive 1x + truncate to items === [] + windowStart reset + OPS-03 ordering via `invocationCallOrder`), AC-3 heartbeat path (0 pending → sendMail 1x with `이번 주 신규 없음` subject + D-17 minimal body markers + writeArchive 1x + truncate still resets windowStart), cross-mode invariant (`getGeminiCallCount() === 0` always), and an atomicity case (sendMail throws → writeArchive NOT called + pending preserved with original windowStart).
- **Plan 13-05 deferred item resolved** — `test/pipeline/run.test.disabled.ts` deleted; `.planning/phases/13-1-gemini-rpd/deferred-items.md` updated to mark the deferral as resolved + document the residual non-blocking follow-up (RunOptions surface unit tests).

## Task Commits

1. **Task 2: runDaily e2e fixture (AC-1)** — `54866bb` (test)
2. **Task 3: runWeekly e2e fixture (AC-2 + AC-3)** — `79d9905` (test)
3. **Task 1: delete run.test.disabled.ts + update deferred-items.md** — `a374da7` (chore)

_Note: Plan tasks were executed out of plan-listed order (2 → 3 → 1) so each commit kept the full vitest suite green at the boundary. Task 1's PLAN.md decision tree explicitly required the new e2e fixtures (Tasks 2 + 3) to land first before the disabled file could be safely deleted — execution order respects that data dependency._

## Files Created/Modified

- `test/pipeline/runDaily.e2e.test.ts` (CREATED) — 3 vitest cases covering SPEC AC-1: pending append + no send/archive + COMP-05 + SUMM-06 Layer 1 + D-09 windowStart preservation.
- `test/pipeline/runWeekly.e2e.test.ts` (CREATED) — 3 vitest cases covering SPEC AC-2 (digest), AC-3 (heartbeat), and an OPS-03 atomicity invariant.
- `.planning/phases/13-1-gemini-rpd/deferred-items.md` (MODIFIED) — Plan 13-05 deferral marked RESOLVED; residual follow-up documented as non-blocking.
- `test/pipeline/run.test.disabled.ts` (DELETED) — obsolete; runPipeline target no longer exists (Plan 13-05); replacement coverage in the two new e2e files + sibling unit tests.

## Decisions Made

See `key-decisions` in frontmatter. Notable choices:

- **Hybrid mock + real-fs e2e** chosen over pure-mock or full integration. Module-level I/O boundaries (sendMail, writeArchive, loadFirms, etc.) are mocked, but `readPending`/`truncatePending` operate against a real on-disk `pending.json` under a per-test tmp dir. This puts the COMP-05 (no `description` on pending items) and D-09 (windowStart preservation across appends + reset on truncate) invariants under genuine on-disk observation rather than function-signature inspection.
- **composeDigest + composeHeartbeat unmocked** because they are pure functions and their subject/body content is precisely what AC-2 (subject prefix + heartbeat negation) and AC-3 (heartbeat marker + D-17 body markers) assert. Mocking them would force test-only stand-ins that drift from production output.
- **Gemini mock factory omits `summarize`** in `runWeekly.e2e.test.ts`. The omission encodes the AC-3 cross-mode invariant ("weekly never calls Gemini") as a runtime gate: any future regression that imports `summarize` into runWeekly surfaces as `undefined is not a function` rather than silently invoking a mock.
- **AC-2 subject regex softened** from the PLAN.md hardcoded `(1 firms, 5 items)` to a `^[법률 다이제스트] YYYY-MM-DD` prefix + negation of `이번 주 신규 없음`. composeDigest may pluralize `firms`→`firm` in the future; the EMAIL-04 prefix + heartbeat-marker negation is the load-bearing signal.
- **Added a third AC-2 atomicity test** beyond the two PLAN.md scenarios. OPS-03 transaction ordering (sendMail → writeArchive → truncatePending) is what makes the next manual `workflow_dispatch` a clean idempotent retry; locking it with `sendMail.mockRejectedValueOnce` + `writeArchive` not called + pending unchanged prevents future refactors from accidentally moving truncatePending above sendMail.
- **run.test.disabled.ts deleted outright** (not split). The disabled file's 14 describe/it blocks map cleanly to (a) the two new e2e fixtures for orchestration flow and (b) sibling unit tests (guard01Layer1.test.ts, clusterDetection.test.ts, scrapers/jsRender.test.ts, recorder.test.ts). RunOptions surface tests (firmFilter / saveHtmlPath / skipStateWrite) noted in deferred-items.md as non-blocking follow-up.

## AC Coverage Matrix

| AC | What it asserts (from SPEC) | Test file | Test case | Status |
|----|-----------------------------|-----------|-----------|--------|
| AC-1 | `--mode=daily`: sendMail mock 0, writeArchive mock 0, pending.json items grow by N, seen.json urls grow by N | runDaily.e2e.test.ts | `appends 3 PendingItems to pending.json and does not send or archive` | PASS |
| AC-1 ext | SUMM-06 Layer 1: short body → summarize NOT called, still flows to pending with model='skipped' | runDaily.e2e.test.ts | `skips summarize call entirely when body is shorter than min_body_chars` | PASS |
| AC-1 ext | D-09 windowStart preservation across appends | runDaily.e2e.test.ts | `appendPending preserves existing pending items` | PASS |
| AC-2 | 5 pending → sendMail 1x + writeArchive 1x + items → 0 + windowStart reset | runWeekly.e2e.test.ts | `AC-2: 5 pending → sendMail 1x (digest), writeArchive 1x, pending truncated` | PASS |
| AC-3 | 0 pending → sendMail 1x with `이번 주 신규 없음` subject + writeArchive 1x | runWeekly.e2e.test.ts | `AC-3: 0 pending → sendMail 1x (heartbeat subject), writeArchive 1x, pending stays empty post-truncate` | PASS |
| AC-2 atomicity | sendMail throws → writeArchive NOT called, pending preserved with original windowStart | runWeekly.e2e.test.ts | `AC-2 atomicity: when sendMail throws, pending is NOT truncated` | PASS |
| AC-3 invariant | weekly NEVER calls Gemini at runtime (`getGeminiCallCount() === 0`) | runWeekly.e2e.test.ts | covered inside the two scenarios above | PASS |
| AC-7 | Natural cron 7-day operation: daily-avg ≤ 15, weekly === 0 | (operational, not automated) | Plan 13-06 manual smoke proved one-shot values (daily=21, weekly=0); ≤15 average awaits natural cron | OUTSTANDING |

## Deviations from Plan

None - plan executed exactly as written, with three sanctioned micro-elaborations within plan scope:

1. **AC-2 subject regex softened** (PLAN.md acknowledged this as W4 "softened regex"): hardcoded `(1 firms, 5 items)` replaced by prefix-only match + heartbeat-marker negation. Not a deviation — PLAN.md explicitly notes the brittleness and provides the softer assertion. Implementation matched plan guidance verbatim.
2. **Added a third AC-2 atomicity test** beyond the two PLAN.md cases. Within plan scope (locks an OPS-03 invariant the SPEC §Constraints implicitly require for idempotent recovery); not a Rule 2 since the original tests pass without it, but worth keeping per the plan's frontmatter `must_haves: vitest fixtures cover SPEC AC-1/2/3`.
3. **Task execution order: 2 → 3 → 1** instead of 1 → 2 → 3. PLAN.md Task 1's decision tree required the new e2e fixtures to exist before the disabled file could be safely deleted — execution order respects that data dependency. Each commit keeps the full suite green at the boundary.

## Issues Encountered

None. The PLAN.md sample code was used as a starting reference, then simplified to drop `vi.spyOn(loaderMock, ...)` hybrid pattern in favor of pure `vi.mock` factories (vi.hoisted), which sidesteps the spyOn/hoist ordering trap and produced green tests on the first run.

## Self-Check

- `test/pipeline/runDaily.e2e.test.ts` — **FOUND** (12,025 bytes)
- `test/pipeline/runWeekly.e2e.test.ts` — **FOUND** (10,338 bytes)
- `test/pipeline/run.test.disabled.ts` — **GONE** (deleted via `git rm` in commit `a374da7`)
- `.planning/phases/13-1-gemini-rpd/deferred-items.md` — **UPDATED** (Plan 13-05 deferral marked RESOLVED)
- Commit `54866bb` — **FOUND** in `git log --oneline -5`
- Commit `79d9905` — **FOUND** in `git log --oneline -5`
- Commit `a374da7` — **FOUND** in `git log --oneline -5`
- `pnpm typecheck` — exits 0
- `pnpm vitest run` — 35 files / 476 tests / all pass

## Self-Check: PASSED

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 13 closure ready.** All 7 plans complete; SPEC AC-1/2/3 covered by automated regression; AC-4 (atomic pending+seen commit) verified in Plan 13-06 manual smoke; AC-5/6 (workflow cron + entry + concurrency) verified by Plan 13-06 grep gates + checkpoint; AC-7 (7-day natural cron operation) is an operational observation that begins when natural cron fires post-merge.
- **Outstanding follow-ups (non-blocking for phase close):**
  - **AC-7 operational tracking:** First natural Tue-Sun + Mon cycle after merge will produce the [METRIC] geminiCallCount logs for daily-avg ≤ 15 / weekly === 0 verification. Plan 13-06 manual smoke produced one-shot values (daily=21, weekly=0); daily=21 is well under the 50 per-run cap but the 7-day average ≤ 15 invariant needs the actual cron cadence to compute.
  - **RunOptions surface unit tests (deferred-items.md §1 residual):** Recovery coverage for `firmFilter` (D-05 Firm-not-found), `saveHtmlPath` (compose preview), and `skipStateWrite` not carried by the new e2e fixtures. Cheap to add as focused unit tests if a regression surfaces; not blocking phase close.
  - **Gmail inbox arrival confirmation (carried from Plan 13-06):** Operator one-time visual confirmation that the manual workflow_dispatch heartbeat (run 26309956124) actually landed at nks4860@gmail.com. Mailer step exit 0 implies SMTP success, but inbox-level verification awaits the operator.

---
*Phase: 13-1-gemini-rpd*
*Completed: 2026-05-23*
