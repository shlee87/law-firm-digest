---
phase: 07-spa-aware-detail-tier
plan: 02
subsystem: pipeline
tags: [phase-7, pipeline, playwright, enrich-body, detail-tier]

# Dependency graph
requires:
  - phase: 07-spa-aware-detail-tier (plan 01)
    provides: FirmSchema.detail_tier enum field (zod, 'static' default), FirmConfig.detail_tier optional TS property, DETAIL-01 schema surface
  - phase: 04-js-rendered-tier-conditional
    provides: shared chromium lifecycle (D-05), per-item BrowserContext pattern, hasJsRender short-circuit
  - phase: 02-multi-firm-html-tier-failure-isolation
    provides: per-item try/catch isolation idiom (D-P2-03), FirmResult.error pass-through contract
provides:
  - detail_tier-gated Playwright-ONLY branch in enrichBody.ts (D-05 + D-07 — skips static fetch entirely for detail_tier='js-render' firms)
  - Static branch preserved for detail_tier='static' (or undefined/zod-defaulted) — Phase 1-6 semantics intact
  - hasJsRender predicate extended in run.ts to cover both type='js-render' AND detail_tier='js-render' (D-06)
  - Per-item isolation: one failed Playwright detail fetch does NOT tank sibling items or set FirmResult.error
  - Phase 7 test block locking DETAIL-02/03 contract (replaces stale Phase 4 fallback block)
  - DETAIL-02 requirement (Playwright routes for detail_tier='js-render')
  - DETAIL-03 requirement (backwards compat — unset detail_tier → static behavior)
affects:
  - 07-03 (YAML migration — can now safely add detail_tier: 'js-render' to 6 firms; enrichBody + run.ts will honor it)
  - 07-04 (run.ts browser gate already extended — plan 04 may reuse this work)
  - 07-05 (kim-chang activation — Playwright path available for activation)
  - 07-06 (verification via pnpm audit:firms — production + audit semantics now aligned for detail_tier='js-render' firms)

# Tech tracking
tech-stack:
  added: []  # pure branch flip — no new libraries
  patterns:
    - "detail_tier-gated branch in pipeline stage: `if (r.firm.detail_tier === 'js-render' && browser) { playwright-only } else { static }`"
    - "Expanded predicate for shared chromium launch: `firms.some(f => f.type === 'js-render' || f.detail_tier === 'js-render')`"
    - "Test block replacement pattern: full describe-block swap (header comment + banner + block) to lock new contract while preserving mock-factory fixtures"
    - "Destructure-to-drop pattern for 'unset field' test case: `const { detail_tier: _dropped, ...firmWithoutField } = baseFirm` with eslint-disable-next-line"

key-files:
  created: []
  modified:
    - src/pipeline/enrichBody.ts (flipped type→detail_tier gate; deleted STATIC_BODY_MIN_CHARS; rewrote header comment + JSDoc; two-branch shape; unchanged outer Promise.all + pLimit(1) + 500ms politeness)
    - src/pipeline/run.ts (7-line predicate expansion — hasJsRender now triggers on either type='js-render' OR detail_tier='js-render'; lifecycle untouched)
    - test/pipeline/enrichBody.test.ts (replaced 7-test Phase 4 fallback block with 5-test Phase 7 detail_tier-gated block; reused makeMockBrowser factory; Phase 2 block untouched)

key-decisions:
  - "07-02: bklFirm fixture used in Phase 7 test block instead of jsRenderFirm — html-tier firm with detail_tier='js-render' is the motivating production case (v1.0 UAT hallucination); test semantics match D-07 exactly"
  - "07-02: Backwards-compat test (iii) uses destructure-to-drop to simulate pre-Phase-7 FirmConfig — produces a FirmConfig without detail_tier to verify the `&& browser` guard + static fallthrough path works when the field is literally absent (not just zod-defaulted)"
  - "07-02: Test (iv) per-item isolation uses contextCall counter rejecting on call #2 — exercises inner try/catch without relying on fetch mocks; proves FirmResult.error stays undefined even when Playwright throws mid-stream"
  - "07-02: JSDoc also rewritten (not just header comment) — original JSDoc referenced STATIC_BODY_MIN_CHARS + 'longer of static/hydrated wins' semantics that no longer exist; leaving stale would mislead future maintainers (Rule 1 preventive fix, covered by task commit)"
  - "07-02: STATIC_BODY_MIN_CHARS constant deleted in same commit as branch flip — no post-hoc cleanup PR required; eslint no-unused-vars stays satisfied at every commit boundary"

patterns-established:
  - "Production + test coupled commit: when a test block locks the OLD behavior that the production change invalidates, the test rewrite MUST ride in the SAME commit as the production flip — otherwise suite is red between commits (git bisect broken)"
  - "Fixture hoisting across rewrites: makeMockBrowser factory (mock browser/context/page shape) and HYDRATED(marker) HTML template remain stable — only the enclosing describe block + fixtures (bklFirm vs jsRenderFirm) change"

requirements-completed: [DETAIL-02, DETAIL-03]

# Metrics
duration: ~5min
completed: 2026-04-20
---

# Phase 7 Plan 02: enrichBody + run.ts — detail_tier-gated Playwright Summary

**Flipped `src/pipeline/enrichBody.ts` from type-gated threshold-based Playwright fallback to detail_tier-gated Playwright-ONLY branch, extended `hasJsRender` in `run.ts` to include detail_tier='js-render' firms, and replaced the stale Phase 4 test block with a 5-test Phase 7 block locking the DETAIL-02/03 contract.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-20T12:49:28Z
- **Completed:** 2026-04-20T12:55:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- enrichBody.ts now gates its Playwright branch on `r.firm.detail_tier === 'js-render'` (Phase 7 D-07) — for those firms, detail fetches route EXCLUSIVELY through Playwright with no prior static attempt. This is the mechanism that will eliminate the v1.0 UAT bkl hallucination incident once plan 07-03 migrates bkl/kim-chang YAML.
- Static branch preserved unchanged for `detail_tier === 'static'` (or unset, zod-defaulted to 'static'). Phase 1-6 firms continue behaving exactly as before (DETAIL-03 / SC-1 backwards compat).
- `hasJsRender` predicate in run.ts now triggers chromium launch for both `type='js-render'` (existing Phase 4 contract) AND `detail_tier='js-render'` (new Phase 7 contract). Browser lifecycle (try/finally + outer `browser.close()`) untouched — Phase 4 D-05 lock preserved.
- Test suite locks the new contract: 5 Phase 7 tests covering (i) Playwright-only + static skipped, (ii) static-only + Playwright skipped, (iii) unset → static backwards compat, (iv) per-item Playwright throw isolated with siblings unaffected and FirmResult.error undefined, (v) callable without a browser (js-render firms fall through to static).
- Unused `STATIC_BODY_MIN_CHARS` constant deleted — no dead code.
- Header comment + JSDoc rewritten to describe Phase 7 D-05/D-07 semantics. No stale references to "fallback" or "threshold" remain.
- Full test suite: 326 / 326 passing. TSC clean. Went from 327 → 326 (net -1: Phase 4 block had 7 tests, Phase 7 block has 5 tests, and one Phase 4 test `works without a browser argument` overlapped conceptually with the new Phase 7 test v).

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace type-gated fallback with detail_tier-gated Playwright-only branch in enrichBody.ts AND rewrite the Phase 4 fallback test block** — `99531a2` (refactor)
2. **Task 2: Extend hasJsRender predicate in run.ts** — `3535a25` (feat)

_Note: Task 1 is labeled `refactor` because it preserves the external contract of enrichWithBody (signature + return shape unchanged) while flipping the internal gate semantics. The test-block replacement rides in the same commit as the production change — required because the old tests would fail against the new code (git bisect clean at every commit boundary)._

## Files Created/Modified

- `src/pipeline/enrichBody.ts` — Flipped internal gate from `type === 'js-render'` to `detail_tier === 'js-render'`. Playwright branch is now **exclusive** (no prior static attempt when gate matches). Static branch runs for all other cases. Deleted `STATIC_BODY_MIN_CHARS` constant. Rewrote 14-line header comment block + 14-line JSDoc to Phase 7 semantics. Preserved: outer `Promise.all(results.map(...))`, `r.error` pass-through, `r.raw.length === 0` fast path, `perFirm = pLimit(1)`, 500ms `INTER_FETCH_DELAY_MS` politeness delay, per-item try/catch isolation, ctx.close() in finally, no `browser.close()` (owned by run.ts).
- `src/pipeline/run.ts` — Expanded `hasJsRender` predicate from `firms.some((f) => f.type === 'js-render')` to `firms.some((f) => f.type === 'js-render' || f.detail_tier === 'js-render')`. Added 3-line comment stanza describing Phase 7 DETAIL-02 extension. Browser launch/close lifecycle untouched.
- `test/pipeline/enrichBody.test.ts` — Replaced 193-line Phase 4 fallback block (lines 238-431) with 181-line Phase 7 detail_tier-gated block. Reused `makeMockBrowser` factory shape. Updated header invariants comment (lines 15-21) from "Phase 4 plan 06 additions" to "Phase 7 plan 02 replacement". Phase 2 describe block (lines 64-236) untouched.

## Decisions Made

- **bklFirm fixture over jsRenderFirm fixture for the Phase 7 block.** The motivating production case for Phase 7 is an html-tier firm (bkl, kim-chang) with SPA detail pages. Using `type: 'html' + detail_tier: 'js-render'` in the fixture matches the production shape the branch was built for and makes the intent legible.
- **Destructure-to-drop for the "unset field" test.** Simulates a literal pre-Phase-7 FirmConfig without detail_tier. More faithful than setting `detail_tier: undefined` (which is different semantically — the field is present, just undefined). Used `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on the `_dropped` binding.
- **Same-commit production + test rewrite.** Splitting would leave the suite red between commits (old tests assert behavior the new code no longer implements). This would break git bisect.
- **JSDoc rewritten in same commit as header comment.** The JSDoc still referenced `STATIC_BODY_MIN_CHARS` and "longer of (static, hydrated) wins" — leaving it would mislead future maintainers. Treated as Rule 1 preventive fix, included in the task commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug prevention] Updated stale JSDoc on enrichWithBody**
- **Found during:** Task 1 (post-edit review of enrichBody.ts)
- **Issue:** Plan specified EDIT 2 (header comment block lines 35-53) but JSDoc on enrichWithBody (lines 74-87) also referenced the old semantics — `STATIC_BODY_MIN_CHARS`, "A static extraction shorter than X triggers a Playwright re-fetch", "longer of (static, hydrated) wins". Left stale, it would mislead future maintainers and silently contradict the new behavior.
- **Fix:** Rewrote the JSDoc `@param browser` description to match Phase 7 D-07 semantics: "When present AND a firm has detail_tier === 'js-render' (Phase 7 D-07), detail fetches for that firm route through Playwright EXCLUSIVELY — the static fetch path is skipped."
- **Files modified:** src/pipeline/enrichBody.ts
- **Verification:** `grep -c STATIC_BODY_MIN_CHARS src/pipeline/enrichBody.ts` returns 0 (dead ref removed from JSDoc too); `pnpm tsc --noEmit` exits 0; all tests pass.
- **Committed in:** 99531a2 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug prevention — stale documentation)
**Impact on plan:** Minor consistency fix; no scope creep. All other edits performed byte-for-byte per plan's literal action blocks.

## Note on acceptance criterion imprecision (not a deviation)

The plan's acceptance criterion `grep -c "decodeCharsetAwareFetch" src/pipeline/enrichBody.ts returns 1` would have been unsatisfiable because the file has:
1. Import at line 61 (`import { decodeCharsetAwareFetch, extractBody } ...`)
2. Single call site in the static branch (line 141)
3. JSDoc reference I added in the Rule-1 fix (line 80)

That's 3 matches, not 1. The parenthetical gloss in the plan clarifies the semantic intent: "static branch still in one place — the else path", which IS satisfied (exactly one call site). Even the ORIGINAL file pre-plan had 2 matches (import + 1 call), so `== 1` was never achievable. Noting as plan-authoring imprecision for the checker — no code change required.

## Issues Encountered

None. Both tasks passed automated verification gates on first run:
- Task 1: `pnpm tsc --noEmit` exit 0; `pnpm vitest run test/pipeline/enrichBody.test.ts` → 12/12 pass (7 Phase 2 + 5 Phase 7); `pnpm vitest run` → 326/326 pass.
- Task 2: `pnpm tsc --noEmit` exit 0; `pnpm vitest run test/pipeline/run.test.ts` → 13/13 pass; `pnpm vitest run` → 326/326 pass.

## User Setup Required

None — no external service configuration required. No YAML changes yet (plan 07-03 owns migration). All 12 currently-enabled firms continue behaving exactly as they did before this plan, because zod defaults `detail_tier` to `'static'` for any firm that doesn't explicitly declare it.

## Threat Model Coverage

The plan's `<threat_model>` defined four threats on the Playwright detail-fetch surface:

- **T-07-03 (DoS via page.goto hang):** mitigate — `DETAIL_PAGE_TIMEOUT_MS = 15_000` passed to `page.goto()` in new branch (line 114 of enrichBody.ts). Per-item try/catch absorbs TimeoutError (line 129 catch block) so sibling items proceed. Test (iv) locks isolation.
- **T-07-04 (context leak):** mitigate — `finally { await ctx.close(); }` at line 127 of enrichBody.ts runs even when page.goto/content throws. The outer try/catch does NOT hold the context — only the inner try does, per PATTERNS.md "outer try swallows, inner finally always closes" idiom.
- **T-07-05 (SSRF-adjacent):** accept — all detail URLs originate from list-page scrape; no user-supplied URLs. Personal-tool threat model applies.
- **T-07-06 (cross-firm tampering via JS):** accept — per-item `browser.newContext({ userAgent: USER_AGENT })` gives each item cookie/storage isolation.

All `mitigate` dispositions are implemented in code. No new threat surface introduced beyond what the threat model anticipated.

## Self-Check: PASSED

**File presence:**
- `src/pipeline/enrichBody.ts` — FOUND (contains `r.firm.detail_tier === 'js-render'`, does NOT contain `STATIC_BODY_MIN_CHARS` or `r.firm.type === 'js-render'`)
- `src/pipeline/run.ts` — FOUND (contains `f.detail_tier === 'js-render'` on line 161)
- `test/pipeline/enrichBody.test.ts` — FOUND (contains `Phase 7 detail_tier-gated Playwright`, does NOT contain `Phase 4 Playwright fallback`)

**Commits:**
- `99531a2` — FOUND (refactor(07-02): flip enrichBody to detail_tier-gated Playwright-only branch)
- `3535a25` — FOUND (feat(07-02): extend hasJsRender predicate to include detail_tier gate)

**Verification gates:**
- `pnpm tsc --noEmit` — exit 0
- `pnpm vitest run test/pipeline/enrichBody.test.ts` — 12/12 pass
- `pnpm vitest run test/pipeline/run.test.ts` — 13/13 pass
- `pnpm vitest run` — 326/326 pass
- `grep -c "r.firm.detail_tier === 'js-render'" src/pipeline/enrichBody.ts` — 1
- `grep -c "r.firm.type === 'js-render'" src/pipeline/enrichBody.ts` — 0
- `grep -c "STATIC_BODY_MIN_CHARS" src/pipeline/enrichBody.ts` — 0
- `grep -c "f.detail_tier === 'js-render'" src/pipeline/run.ts` — 1
- `grep -c "Phase 7 detail_tier-gated Playwright" test/pipeline/enrichBody.test.ts` — 1
- `grep -c "Phase 4 Playwright fallback" test/pipeline/enrichBody.test.ts` — 0

## Next Phase Readiness

- **Plan 07-03 (YAML migration):** unblocked. Both `detail_tier: 'js-render'` (bkl, kim-chang, lee-ko, yoon-yang, barun, latham) and `detail_tier: 'static'` (explicit declaration) will flow through the correct branch. Pre-Phase-7 firms (no detail_tier field) continue going through static — DETAIL-03 / SC-1 covered.
- **Plan 07-04 (run.ts hasJsRender expansion):** **already done** by this plan's Task 2. Plan 07-04 should become a no-op documentation plan or be retired. Flagging for checker attention.
- **Plan 07-05 (kim-chang activation):** unblocked. When kim-chang's YAML flips `enabled: true` + `detail_tier: 'js-render'`, the Playwright detail path will activate. Root-cause investigation (D-10) depends on YAML migration (07-03) landing first.
- **Plan 07-06 (verification via pnpm audit:firms):** audit + production now use the same Playwright detail-fetch shape (per PATTERNS.md D-11 verification contract). After 07-03 migrates the YAML, `pnpm audit:firms` should see the expected `OK` status flips for bkl / kim-chang / etc.

No blockers. Foundation for the remaining Phase 7 plans is stable and test-locked.

---
*Phase: 07-spa-aware-detail-tier*
*Completed: 2026-04-20*
