---
phase: 09-cooley-sitemap-tier
plan: 01
subsystem: config
tags: [sitemap, schema, zod, types, phase-9, SITEMAP-03]

# Dependency graph
requires:
  - phase: 04-js-rendered-tier-conditional
    provides: superRefine + wait_for exclusivity pattern that plan 09-01 extends to four-value type enum
  - phase: 07-spa-aware-detail-tier
    provides: detail_tier field on FirmSchema whose zod `.default('static')` shaped plan 09-01's sitemap superRefine narrowing (Rule 1 fix)
provides:
  - FirmType union widened to include 'sitemap'
  - FirmConfig.latest_n?: number optional field
  - FirmSchema.type enum accepts all four tier values
  - superRefine rejects illegal sitemap + wait_for / selectors / detail_tier(=js-render) / non-sitemap + latest_n combinations
  - Audit subsystem (AuditRow.tier, defaultRemediation, firmAudit switch) widened to FirmType — interim sitemap case returns list-fail pending plan 09-03 Task 4
affects: [09-02-PLAN (scraper import depends on FirmConfig), 09-03-PLAN (firms.yaml Cooley migration must pass schema validation), plan-09-03 audit Task 4 (completes the interim sitemap case seeded here)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Four-value type enum pattern (extended from Phase 4 three-value — confirms PATTERNS.md Pattern F: single-schema + superRefine chosen over discriminatedUnion)"
    - "Schema-default narrowing: when a field has zod `.default(X)`, superRefine checks that field via value-equality (=== 'js-render') not existence (!== undefined) to avoid rejecting zod-injected defaults"

key-files:
  created: []
  modified:
    - src/types.ts — FirmType union + FirmConfig.latest_n
    - src/config/schema.ts — FirmSchema.type enum + latest_n field + superRefine three-branch ladder
    - test/config/schema.test.ts — 7 new sitemap-extension test cases
    - src/audit/types.ts (Rule 3) — AuditRow.tier widened to full FirmType
    - src/audit/firmAudit.ts (Rule 3) — defaultRemediation tier param widened + interim sitemap switch case

key-decisions:
  - "09-01: superRefine detail_tier gate narrowed from '!== undefined' to '=== js-render' to survive zod's `.default(static)` injection — Plan PLAN's D-05 assumed the default only fires in enrichBody but it also fires at parse time"
  - "09-01: AuditRow.tier widened to full FirmType (Rule 3 auto-fix) because FirmType widening makes firm.type unassignable to the old narrow audit tier type. Real probeSitemapFirm lands in Plan 09-03 Task 4; interim switch case returns list-fail with a forward-pointing evidence string"
  - "09-01: latest_n default (10) deliberately NOT baked into schema — lives at scraper layer (sitemap.ts DEFAULT_LATEST_N per plan 09-02) so the `latest_n: 10` YAML line stays explicit per CONTEXT D-06"
  - "09-01: toThrow regex literals use `\\\\?\"sitemap\\\\?\"` tolerance to match both raw and JSON-escaped double-quote forms since ZodError.message is the JSON-stringified issues array"

patterns-established:
  - "Four-tier type enum + single superRefine ladder (three branches): js-render / sitemap / else (wait_for-allowed tiers). Plan 10+ should extend this ladder rather than splitting into discriminatedUnion."
  - "Schema-default aware superRefine: when rejecting a field that has `.default()`, check value not existence — otherwise the default injects the field on every parse and rejects every omitting firm."

requirements-completed: [SITEMAP-03]

# Metrics
duration: ~12 min
completed: 2026-04-20
---

# Phase 09 Plan 01: Sitemap Type + Schema Foundation Summary

**FirmType + FirmSchema extended to accept `type: sitemap` with optional `latest_n`, enforced exclusivity via three-branch superRefine, and audit subsystem widened in lockstep — 34/34 schema tests passing.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-20T21:33Z (approximate — first edit)
- **Completed:** 2026-04-20T21:37Z
- **Tasks:** 4 (all auto, one TDD-flagged)
- **Files modified:** 5

## Accomplishments
- `FirmType = 'rss' | 'html' | 'js-render' | 'sitemap'` on src/types.ts; `FirmConfig.latest_n?: number` optional field landed (SITEMAP-03 closed)
- `FirmSchema.type` enum widened to four values; `latest_n: z.number().int().positive().optional()` field added
- `superRefine` restructured as three-branch ladder — Phase 4 js-render rule preserved byte-for-byte, new sitemap branch rejects `wait_for`/`selectors`/`detail_tier='js-render'`, non-sitemap branch rejects `latest_n`
- Audit subsystem widened to full FirmType union so Plan 09-01 can commit with `tsc --noEmit = 0`; interim sitemap case in the audit switch returns list-fail until Plan 09-03 Task 4 delivers `probeSitemapFirm`
- 7 new test cases in `FirmSchema (Phase 9 sitemap extensions)` describe block; 34/34 tests passing in schema.test.ts

## Task Commits

Each task committed atomically:

1. **Task 1: Extend FirmType union + latest_n field in src/types.ts** — `d1453d7` (feat; included Rule 3 audit widening)
2. **Task 2: Extend FirmSchema + amend superRefine** — `d22f4dc` (feat)
3. **Task 3: Add Phase 9 sitemap extensions describe block (TDD)** — `51d7037` (test; included Rule 1 schema detail_tier gate fix + regex escape fix)
4. **Task 4: Full regression verification** — no code commit (verification-only task; `pnpm tsc --noEmit` = 0 and `pnpm vitest run test/config/schema.test.ts` = 0 both clean)

_Note: Task 3 was the TDD task — tests were written after Task 2 schema changes, so the cycle ran as a regression-lock (test-follows-implementation in a discriminator-only plan). Fail-fast exception: tests failed exactly as expected during first run (6/7 failed) because Task 2 missed the zod-default interaction and the regex escaping — both surfaced as Rule 1 auto-fixes._

## Files Created/Modified
- `src/types.ts` — `FirmType` union widened; `FirmConfig.latest_n?: number` inserted with Phase 9 reference comment
- `src/config/schema.ts` — `FirmSchema.type` four-value enum; `latest_n` optional field; three-branch superRefine with Phase 4 rule preserved + Phase 9 sitemap/latest_n gates
- `test/config/schema.test.ts` — `FirmSchema (Phase 9 sitemap extensions)` describe block (7 cases) inserted between Phase 4 js-render block and Phase 4.1 link-union block
- `src/audit/types.ts` — `AuditRow.tier` union widened to full `FirmType` (Rule 3)
- `src/audit/firmAudit.ts` — `FirmType` import added; `defaultRemediation` tier param widened; switch case `'sitemap'` returns list-fail interim row (Rule 3 — Plan 09-03 Task 4 replaces with real probe)

## Decisions Made
- superRefine detail_tier gate narrowed from `!== undefined` to `=== 'js-render'` — survives zod's `.default('static')` injection. See key-decisions frontmatter.
- Audit widening committed in Task 1 (Rule 3) rather than checkpointing — the widening is a pure type-level surface change to stay tsc-clean. Plan 09-03 Task 4 delivers the real probeSitemapFirm and reports this as expected.
- latest_n default (10) stays at scraper layer (planned for 09-02 DEFAULT_LATEST_N constant); schema only validates shape and positivity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Widened audit subsystem types to accept 'sitemap'**
- **Found during:** Task 1 (FirmType union widening)
- **Issue:** `FirmType` extension made `firm.type` unassignable to `AuditRow.tier: 'rss' | 'html' | 'js-render'` at three sites in `src/audit/firmAudit.ts` (lines 107, 111, 239). `pnpm tsc --noEmit` exited non-zero, blocking the plan 09-01 Task 1 acceptance gate.
- **Fix:** Widened `AuditRow.tier` to full `FirmType`; widened `defaultRemediation` tier parameter signature to `FirmType`; added interim `case 'sitemap'` in the firmAudit switch that returns `list-fail` with a forward-pointing evidence string. Plan 09-03 Task 4 replaces this with the real `probeSitemapFirm` helper.
- **Files modified:** `src/audit/types.ts`, `src/audit/firmAudit.ts`
- **Verification:** `pnpm tsc --noEmit` exits 0 post-fix.
- **Committed in:** `d1453d7` (Task 1 commit)

**2. [Rule 1 — Bug] superRefine detail_tier gate rejected every legal sitemap firm**
- **Found during:** Task 3 (first test run)
- **Issue:** Plan specified `if (firm.detail_tier !== undefined) { reject }` for sitemap tier. But `FirmSchema.detail_tier` has `z.enum(['js-render','static']).default('static').optional()`, so zod injects `detail_tier: 'static'` on every parse regardless of YAML author input — every `accepts type: sitemap` test failed because the default tripped the exclusivity check. Plan's D-05 decision note ("zod's default never fires for sitemap firms") was accurate for enrichBody routing but wrong for schema.parse.
- **Fix:** Narrowed the gate to `if (firm.detail_tier === 'js-render')`. Semantics: sitemap tier always routes through Playwright; a user-written `detail_tier: 'js-render'` is redundant and flagged; a user-written `detail_tier: 'static'` is indistinguishable from the zod default so cannot be detected and is accepted silently (no behavior impact since enrichBody gate keys on `firm.type === 'sitemap'` per plan 09-03 D-05).
- **Files modified:** `src/config/schema.ts`
- **Verification:** All 7 new sitemap tests pass; 34/34 schema tests pass.
- **Committed in:** `51d7037` (Task 3 commit)

**3. [Rule 1 — Bug] toThrow regex literals did not tolerate JSON-escaped double-quotes**
- **Found during:** Task 3 (first test run)
- **Issue:** ZodError thrown by `FirmsConfigSchema.parse` carries `message = JSON.stringify(issues, null, 2)`, so embedded double-quotes appear as `\"`. Plan-verbatim regex literals like `/wait_for is only valid when type === "js-render"/` missed this — matched neither raw nor escaped form. 4/7 Phase 9 tests failed.
- **Fix:** Replaced `"sitemap"` / `"js-render"` literals in all four `toThrow` regexes with `\\?"sitemap\\?"` / `\\?"js-render\\?"` to tolerate either quote-form. Added a comment at the top of the describe block explaining the pattern.
- **Files modified:** `test/config/schema.test.ts`
- **Verification:** All 7 Phase 9 tests pass.
- **Committed in:** `51d7037` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking type-propagation + 2 bugs in plan-prescribed code)
**Impact on plan:** Rule 3 audit widening is unavoidable tsc plumbing, scoped narrowly with a documented interim path. Rule 1 schema fix is a genuine plan-sayed semantics error around zod defaults; narrowing the gate is the least-invasive fix that preserves plan intent. Rule 1 regex fix is a test-literal escaping oversight. No scope creep — all fixes keep the plan's surface the same and pin the 09-03 follow-ups explicitly.

## Issues Encountered
None beyond the deviations above. The Task 4 regression run was clean on the first attempt once Task 3 landed.

## Self-Check

See Self-Check section at end of document.

## User Setup Required

None — pure type + schema extension plan. No new environment variables, dependencies, or external services.

## Next Phase Readiness

- Plan 09-02 (sitemap scraper module) can now import `FirmConfig` with the new `latest_n` field and `type === 'sitemap'` discriminator safely.
- Plan 09-03 (pipeline wiring + firms.yaml Cooley entry) can rely on `FirmsConfigSchema.parse` accepting `type: sitemap` at startup and rejecting illegal combinations per D-05 / D-11.
- **Plan 09-03 Task 4 must replace the interim `case 'sitemap':` in `src/audit/firmAudit.ts` (line ~237) with the real `probeSitemapFirm` helper.** The placeholder row text `"sitemap tier audit wiring lands in Phase 9 Plan 09-03 Task 4"` flags this explicitly.
- `FirmSchema.detail_tier` on sitemap firms is now silently tolerant of `detail_tier: 'static'` (indistinguishable from zod default) but actively rejects `detail_tier: 'js-render'`. If future audit / lint tooling wants stricter enforcement, it would need a schema refactor to drop the `.default()` and push default application to consumers — out of scope for Phase 9.

## Self-Check: PASSED

**Files verified:**
- FOUND: src/types.ts (FirmType line 24 matches, latest_n line 58 matches)
- FOUND: src/config/schema.ts (four-value enum line 60, latest_n line 112, sitemap branch line 135)
- FOUND: test/config/schema.test.ts ('FirmSchema (Phase 9 sitemap extensions)' describe block, sitemapBase ×7)
- FOUND: src/audit/types.ts (widened tier union)
- FOUND: src/audit/firmAudit.ts (FirmType import, widened defaultRemediation, interim sitemap case)

**Commits verified:**
- FOUND: d1453d7 (Task 1: FirmType + audit widening)
- FOUND: d22f4dc (Task 2: FirmSchema + superRefine)
- FOUND: 51d7037 (Task 3: schema test block + Rule 1 fixes)

**Acceptance gates verified:**
- `pnpm tsc --noEmit` exits 0
- `pnpm vitest run test/config/schema.test.ts` → 34/34 pass (27 pre-existing + 7 new)
- Verbose run confirms both `Phase 4 js-render extensions` (regression) and `Phase 9 sitemap extensions` (new) describe blocks executed

---
*Phase: 09-cooley-sitemap-tier*
*Completed: 2026-04-20*
