---
phase: 07-spa-aware-detail-tier
plan: 01
subsystem: config
tags: [phase-7, schema, zod, detail-tier, typescript]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: FirmSchema base (zod .strict() + .default() pattern), FirmConfig TS interface, path-qualified zod error behavior (CONF-02)
  - phase: 04-js-rendered-tier-conditional
    provides: Phase 4 js-render extensions test block pattern (analog for Phase 7 describe block), superRefine precedent
  - phase: 06-firm-audit-probe
    provides: 06-AUDIT.md routing (bkl, kim-chang, logos, skadden, lee-ko, barun → Phase 7), detail-identity classifier as verification channel
provides:
  - FirmSchema.detail_tier enum field (zod) with 'static' default
  - FirmConfig.detail_tier optional typed property (TS shadow)
  - DETAIL-01 schema surface (the foundation interface consumed by Phase 7 plans 02/03)
  - DETAIL-03 backwards-compat literal (unset → 'static')
  - DETAIL-05 path-qualified zod error on invalid enum value
  - 4-test suite locking the schema contract
affects:
  - 07-02 (enrichBody.ts branch flip — will read firm.detail_tier)
  - 07-03 (YAML migration — will set detail_tier on 6 firms)
  - 07-04 (run.ts hasJsRender predicate expansion)
  - 07-05 (kim-chang activation + root-cause)
  - 07-06 (verification via pnpm audit:firms)

# Tech tracking
tech-stack:
  added: []  # pure reuse of existing zod + TS
  patterns:
    - "Optional-with-default enum field via z.enum([...]).default('x').optional() (mirror of timeout_ms pattern)"
    - "Hand-maintained TS interface shadow of zod enum shape (matches existing wait_for?: string convention)"
    - ".strict() + z.enum produces path-qualified error automatically — no manual error construction needed"

key-files:
  created: []
  modified:
    - src/config/schema.ts (added detail_tier field to FirmSchema, 6 lines incl. comment)
    - src/types.ts (added detail_tier?: 'js-render' | 'static' to FirmConfig)
    - test/config/schema.test.ts (added Phase 7 detail_tier extension describe block — 4 tests)

key-decisions:
  - "07-01: detail_tier placed as sibling of exclude_keywords (last field before .strict()) — matches D-03 insert site specified in plan"
  - "07-01: No superRefine rule added for detail_tier per D-05 (type and detail_tier are orthogonal; wait_for superRefine untouched)"
  - "07-01: Test describe block placed after Phase 4 js-render extensions, before Phase 4.1 selectors.link union — matches file's chronological describe-block ordering"
  - "07-01: .strict() regression coverage for detail_tier intentionally not duplicated — Phase 4 block already covers unknown-field rejection universally"

patterns-established:
  - "Phase 7 detail_tier extension describe block: mirror of Phase 4 js-render extensions structure with htmlBase fixture + 4 tests (accept js-render / accept static / defaults to static / rejects invalid)"

requirements-completed: [DETAIL-01, DETAIL-05]

# Metrics
duration: ~2min
completed: 2026-04-20
---

# Phase 7 Plan 01: Schema + Type Extension Summary

**Added zod `detail_tier: z.enum(['js-render', 'static']).default('static').optional()` to FirmSchema and mirrored as `detail_tier?: 'js-render' | 'static'` on FirmConfig, locked by 4-test suite covering accept/default/reject behavior.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-20T12:44Z (approximate — plan execution started ~12:43 per STATE.md last_updated)
- **Completed:** 2026-04-20T12:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `FirmSchema` in `src/config/schema.ts` now accepts and defaults the `detail_tier` field (DETAIL-01 + DETAIL-03 landed in one declaration via `z.enum(...).default('static').optional()`).
- `FirmConfig` TS interface in `src/types.ts` carries `detail_tier?: 'js-render' | 'static'` so downstream Phase 7 plans 02 (enrichBody branch flip) and 03 (YAML migration) can reference `firm.detail_tier` without `as any` or type errors.
- DETAIL-05 (path-qualified zod error on invalid enum value) satisfied automatically via `z.enum` + `.strict()` — no manual error-message construction needed.
- 4 new schema tests lock the behavioral contract: accept `'js-render'`, accept `'static'`, default to `'static'` when omitted, reject `'invalid-value'` with error string containing `detail_tier`.
- Full test suite: 327 / 327 green (was 323, +4 new). TSC clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add detail_tier to FirmSchema + FirmConfig** — `0b75db0` (feat)
2. **Task 2: Add Phase 7 detail_tier schema test block** — `c48c617` (test)

_Note: Task 1 is the TDD GREEN step (implementation); Task 2 is the contract-locking test block. The plan opted for this ordering (schema first, tests after) because Task 1's compile-time TS integrity gate (`pnpm tsc --noEmit`) is itself a regression signal, and the new tests in Task 2 cannot fail at the RED stage without first unwinding Task 1's schema change. Both tasks committed sequentially; suite stays green at every commit boundary._

## Files Created/Modified

- `src/config/schema.ts` — Added `detail_tier: z.enum(['js-render', 'static']).default('static').optional()` as sibling of `exclude_keywords`, before `.strict()`. 6-line diff including 5-line Phase 7 comment header.
- `src/types.ts` — Added `detail_tier?: 'js-render' | 'static';` on `FirmConfig` interface between `wait_for?` and `selectors?` (1-line diff + inline comment).
- `test/config/schema.test.ts` — Added `describe('FirmSchema (Phase 7 detail_tier extension)', ...)` block between the Phase 4 js-render extensions block and the Phase 4.1 selectors.link union block. 36-line addition, 4 tests.

## Decisions Made

None beyond what the plan specified. Plan's `<action>` blocks prescribed exact literal inserts for both schema.ts and types.ts, and exact test block verbatim. Execution followed those literals byte-for-byte.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both tasks passed their automated verification gates on first run:
- Task 1: `pnpm tsc --noEmit` exited 0; `grep -c "detail_tier: z.enum..."` schema.ts = 1; `grep -c "detail_tier?:"` types.ts = 1.
- Task 2: `pnpm vitest run test/config/schema.test.ts -t "Phase 7 detail_tier extension"` exited 0 with 4/4 passing; full file 27/27 passing; full suite 327/327 passing.

## User Setup Required

None — no external service configuration required.

## Threat Model Coverage

The plan's `<threat_model>` defined two threats on the YAML → zod boundary:

- **T-07-01 (Tampering, FirmSchema detail_tier field):** mitigated. `z.enum(['js-render', 'static'])` rejects any other string; `.strict()` at FirmSchema level rejects forged sibling fields like `detail_tier_x`. Test "rejects detail_tier: 'invalid-value'" (Task 2) locks the mitigation.
- **T-07-02 (Information Disclosure, echoed invalid value):** accepted. zod's default behavior echoes the invalid string in the issue message; for a personal tool, the echoed value is the user's own typo. Not mitigated; documented as accept.

No new threat surface introduced by this plan (pure schema/type extension at an existing trust boundary).

## Self-Check: PASSED

**File presence:**
- `src/config/schema.ts` — FOUND (contains `detail_tier: z.enum(['js-render', 'static'])`)
- `src/types.ts` — FOUND (contains `detail_tier?:`)
- `test/config/schema.test.ts` — FOUND (contains `Phase 7 detail_tier extension`)

**Commits:**
- `0b75db0` — FOUND (feat(07-01): add detail_tier enum field ...)
- `c48c617` — FOUND (test(07-01): add Phase 7 detail_tier extension test block)

**Verification gates:**
- `pnpm tsc --noEmit` — exit 0
- `pnpm vitest run test/config/schema.test.ts -t "Phase 7 detail_tier extension"` — 4/4 pass
- `pnpm vitest run` — 327/327 pass (was 323 pre-plan, +4)

## Next Phase Readiness

- Plan 07-02 (enrichBody.ts branch flip from type-gated to detail_tier-gated Playwright fetch) can now read `firm.detail_tier` as a typed field with `'static'` default guaranteed. No additional schema work needed.
- Plan 07-03 (YAML migration — 6 firms get `detail_tier: 'js-render'` + comment-block docs) can declare the field under zod acceptance. `FirmsConfigSchema` regression test (lines 299-313 of test/config/schema.test.ts) will catch any YAML error after the migration.
- Plan 07-04 (run.ts `hasJsRender` predicate expansion to include `detail_tier === 'js-render'`) has `firm.detail_tier` available on the typed FirmConfig now.

No blockers. Schema foundation is stable and locked by tests.

---
*Phase: 07-spa-aware-detail-tier*
*Completed: 2026-04-20*
