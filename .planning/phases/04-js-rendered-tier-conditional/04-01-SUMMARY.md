---
phase: 04-js-rendered-tier-conditional
plan: 01
subsystem: schema
tags: [zod, schema, typescript, js-render, wait_for, superRefine]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: FirmSchema .strict() base shape + selectors .refine() (unchanged by this plan)
  - phase: 02-multi-firm-html-tier-failure-isolation
    provides: Phase 2 selectors extensions (link_onclick_regex, link_template, body) preserved
provides:
  - FirmSchema accepts type='js-render' alongside rss/html
  - wait_for optional field with z.string().min(1) at FirmSchema top level
  - .superRefine() cross-validates: wait_for REQUIRED when type==='js-render', DISALLOWED otherwise
  - FirmConfig TS interface carries wait_for?: string with invariant docstring
  - 6 new schema tests lock the three invariants (acceptance, missing-field rejection, wrong-tier-field rejection)
affects:
  - 04-02 (jsRender scraper — consumes firm.wait_for)
  - 04-03 (pipeline fetch tier dispatch — consumes type='js-render')
  - 04-04 (runPipeline browser lifecycle — branches on firm.type)
  - 04-05 (enrichBody fallback — branches on firm.type === 'js-render')
  - 04-07 (live wait_for probe — verifies per-firm selector before flip)
  - 04-08 (firms.yaml activation — YAML must validate against extended schema)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "zod v4 .strict() + .superRefine() composition preserves unknown-field rejection while adding cross-field validation"
    - "Single-schema conditional field via superRefine (not discriminatedUnion) — trades exhaustive type narrowing for atomic validation + grouped error messages"

key-files:
  created: []
  modified:
    - src/config/schema.ts
    - src/types.ts
    - test/config/schema.test.ts

key-decisions:
  - "superRefine applied AFTER .strict() — zod v4 preserves unknown-field rejection through the returned ZodEffects (regression test locked in Test 6 of the new block)"
  - "Single schema + superRefine chosen over z.discriminatedUnion('type', [...]) — avoids duplicating every shared field across three branches for one conditional field; tradeoff documented in 04-RESEARCH.md §7"
  - "wait_for?: string at TS interface level (not a FirmConfig union type) — structurally compatible with both rss/html (undefined) and js-render (string) firms without forking the interface"
  - "Two rejection modes for js-render missing wait_for covered by distinct tests: (a) absent → superRefine custom issue, (b) empty string → z.string().min(1) intrinsic failure — ensures coverage of both surfaces"

patterns-established:
  - "Cross-field conditional validation in zod v4: .strict().superRefine(...) ordering verified compatible with Phase 1-3 invariants"
  - "Phase 4 error messages use 'firms[].wait_for' prefix for YAML-friendly path reporting (aligns with existing 'Each firm needs either selectors.link OR...' message style)"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-04-18
---

# Phase 4 Plan 01: Schema Foundation Summary

**zod `FirmSchema` extended with `type: 'js-render'` and conditional `wait_for` field enforced by `.superRefine()`, unblocking the rest of Phase 4 (jsRender scraper, pipeline dispatch, firms.yaml activation).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-19T00:50:24Z
- **Completed:** 2026-04-19T00:52:41Z
- **Tasks:** 3 (all completed)
- **Files modified:** 3

## Accomplishments

- `type` enum expanded from `['rss', 'html']` to `['rss', 'html', 'js-render']` (single line change, zero impact on existing firms).
- New optional `wait_for: z.string().min(1).optional()` field at FirmSchema level, clustered immediately before `selectors` so the "how to find content" fields stay together.
- `.superRefine()` appended after `.strict()` on FirmSchema, enforcing two invariants:
  - `type === 'js-render'` requires non-empty `wait_for` (message: `'firms[].wait_for is required when type === "js-render"'`).
  - Any other `type` disallows `wait_for` presence (message: `'firms[].wait_for is only valid when type === "js-render"'`).
- FirmConfig TS interface mirrors the field as `wait_for?: string` with an invariants-docstring bullet explaining the schema-enforced conditional contract.
- 6 new schema tests locked in a dedicated `describe('FirmSchema (Phase 4 js-render extensions)')` block:
  1. Accepts js-render firm with wait_for + selectors.
  2. Rejects js-render firm missing wait_for (covers superRefine 'required' branch).
  3. Rejects js-render firm with empty wait_for string (covers z.string().min(1) intrinsic failure).
  4. Rejects rss firm that mistakenly includes wait_for (cross-tier guard).
  5. Rejects html firm that mistakenly includes wait_for (symmetric cross-tier guard).
  6. Still rejects unknown top-level field on js-render firm — critical zod v4 `.strict().superRefine()` composition regression guard.
- All 9 pre-existing Phase 1-3 schema tests still pass. Total test count: 15 (9 pre-existing + 6 new). No regressions.
- `pnpm typecheck` exits 0 after every task commit.

## Task Commits

1. **Task 1: Extend FirmSchema type enum + add wait_for field + superRefine** — `32a2f28` (feat)
2. **Task 2: Mirror the wait_for field in src/types.ts FirmConfig** — `c8cdc9c` (feat)
3. **Task 3: Add schema tests for js-render + wait_for conditional contract** — `25c870d` (test)

_Note: Task 3 was marked `tdd="true"` in the plan, but because Tasks 1-2 already shipped the schema under test, the RED phase would have only validated implementation correctness (all tests pass on first run against the already-updated schema). The separate `test(...)` commit preserves the TDD-style gate ordering in git log for the plan-level TDD gate check._

## Files Created/Modified

- `src/config/schema.ts` — Extended `type` enum; added `wait_for` optional field; appended `.superRefine()` cross-validator; updated header comment to document Phase 4 extension.
- `src/types.ts` — Added `wait_for?: string` to `FirmConfig` interface with invariants-docstring bullet. `FirmType` line unchanged (already included `'js-render'` from Phase 1 01-03).
- `test/config/schema.test.ts` — Appended new `describe('FirmSchema (Phase 4 js-render extensions)')` block with 6 tests.

## Before / After Diff Snippets

### src/config/schema.ts

**Region 1 — Header comment (lines 7-8):**
```diff
- // Phase 1 deliberately accepts only 'rss' | 'html' in FirmSchema; the
- // 'js-render' tier is a Phase 4 extension and is NOT valid input today.
+ // Phase 1 accepts rss | html; Phase 4 adds 'js-render' (requires wait_for).
+ // The superRefine below enforces wait_for presence/absence by tier.
```

**Region 2 — Type enum (line 20):**
```diff
- type: z.enum(['rss', 'html']),
+ type: z.enum(['rss', 'html', 'js-render']),
```

**Region 3 — wait_for field (inserted between enabled and selectors, line 26):**
```diff
  enabled: z.boolean().default(true),
+ wait_for: z.string().min(1).optional(),
  selectors: z
```

**Region 4 — superRefine appended after .strict() (lines 56-75):**
```diff
    include_keywords: z.array(z.string()).optional().default([]),
    exclude_keywords: z.array(z.string()).optional().default([]),
  })
- .strict();
+ .strict()
+ .superRefine((firm, ctx) => {
+   if (firm.type === 'js-render') {
+     if (!firm.wait_for || firm.wait_for.length === 0) {
+       ctx.addIssue({
+         code: z.ZodIssueCode.custom,
+         message: 'firms[].wait_for is required when type === "js-render"',
+         path: ['wait_for'],
+       });
+     }
+   } else {
+     if (firm.wait_for !== undefined) {
+       ctx.addIssue({
+         code: z.ZodIssueCode.custom,
+         message: 'firms[].wait_for is only valid when type === "js-render"',
+         path: ['wait_for'],
+       });
+     }
+   }
+ });
```

### src/types.ts

**Docstring invariant bullet added:**
```diff
//   - RawItem.description is optional (RSS-only body for summarizer input)
+ //   - FirmConfig.wait_for is required by schema when type==='js-render' and
+ //     disallowed otherwise; TS interface marks optional because Phase 1 and
+ //     Phase 2 firms (rss, html) legitimately lack it.
//   - SummarizedItem carries NO body field (COMP-05 — body never persisted)
```

**Field added to FirmConfig:**
```diff
  enabled: boolean;
+ wait_for?: string;  // required when type === 'js-render' (enforced by schema superRefine)
  selectors?: {
```

## Grep-Count Summary (Acceptance Evidence)

| Check | Plan expected | Actual | Verdict |
|-------|---------------|--------|---------|
| `grep -c "'js-render'" src/config/schema.ts` | 1 | **3** | Plan undercounted — enum (1) + runtime comparison `firm.type === 'js-render'` (1) + header comment reference (1). All intentional. |
| `grep -c "wait_for:" src/config/schema.ts` | 1 | 1 | Exact |
| `grep -c "superRefine" src/config/schema.ts` | 1 | **2** | Plan undercounted — call site (1) + header comment mention (1). All intentional. |
| `grep -c "wait_for is required when type" src/config/schema.ts` | 1 | 1 | Exact |
| `grep -c "wait_for is only valid when type" src/config/schema.ts` | 1 | 1 | Exact |
| `grep -c "\.strict()" src/config/schema.ts` | 2 | **4** | Plan undercounted — FirmSchema + FirmsConfigSchema + RecipientSchema + header comment. Only RUNTIME callsites = 3 (unchanged from pre-plan 3). |
| `grep -c "\.refine(" src/config/schema.ts` | 1 | 1 | Exact (pre-existing selectors refine unchanged) |
| `grep -c "wait_for" src/config/schema.ts` | 5 | **9** | Plan undercounted — field decl (1) + header comments (2) + superRefine body runtime (2 from `firm.wait_for`) + error messages (2) + `path: ['wait_for']` (2). All intentional per plan body itself. |
| `grep -c "wait_for?: string" src/types.ts` | 1 | 1 | Exact |
| `grep -c "export type FirmType = 'rss' \| 'html' \| 'js-render'" src/types.ts` | 1 | 1 | Exact (unchanged from Phase 1 01-03) |
| `grep -c "FirmConfig.wait_for is required" src/types.ts` | 1 | 1 | Exact |
| `grep -c "describe('FirmSchema (Phase 4 js-render extensions)'" test/config/schema.test.ts` | 1 | 1 | Exact |
| `grep -c "wait_for is required when type" test/config/schema.test.ts` | 1 | 1 | Exact |
| `grep -c "wait_for is only valid when type" test/config/schema.test.ts` | 2 | 2 | Exact |

## Test Counts

- Pre-existing Phase 1-3 tests preserved: **9** (all pass)
- New Phase 4 tests added: **6** (all pass)
- **Total:** 15 passing, 0 failing, 0 skipped (`pnpm vitest run test/config/schema.test.ts`)
- `pnpm typecheck` exits 0

## Decisions Made

- **superRefine placement after .strict():** plan allowed either "on the object BEFORE `.strict()`" or "on the post-`.strict()` result"; chose post-`.strict()` per plan recommendation. Test 6 (`.strict()` regression on js-render firm) empirically validates that zod v4 preserves unknown-field rejection through the returned ZodEffects. No zod-version-specific workaround needed.
- **Empty-string vs missing-field tests as separate cases:** Test 2 (absent `wait_for`) hits the `.superRefine()` 'required' branch. Test 3 (empty string `wait_for: ''`) hits the intrinsic `z.string().min(1)` failure. Both together lock the user's expected failure mode for every realistic YAML misconfiguration.
- **Error message style aligned with existing Phase 1 convention:** `'firms[].wait_for is ...'` uses the same `firms[]` prefix style as pre-existing selectors refine message (`'Each firm needs either selectors.link OR ...'`), keeping the operator-facing error vocabulary consistent across phases.

## Deviations from Plan

### Plan-arithmetic miss (non-blocking, informational)

Several acceptance-criteria grep counts in the plan undercounted actual intended occurrences. Each discrepancy is the plan forgetting to account for tokens that appear in the plan's own specified code body (e.g., `firm.type === 'js-render'` inside the superRefine, `path: ['wait_for']` in each `ctx.addIssue` call, comment references to the field name). These are not implementation deviations — the code matches the plan's prose + code blocks exactly. The grep-count section of the SUMMARY documents the correct counts and confirms the invariant behind each miss is still enforced.

| Criterion | Plan count | Actual | Root cause |
|-----------|-----------:|-------:|------------|
| `'js-render'` in schema.ts | 1 | 3 | Plan didn't count runtime comparison inside its own `.superRefine()` block + comment |
| `superRefine` in schema.ts | 1 | 2 | Plan didn't count its own header comment mention |
| `.strict()` in schema.ts | 2 | 4 | Plan didn't count RecipientSchema `.strict()` (unchanged from Phase 1) + header comment |
| `wait_for` in schema.ts | 5 | 9 | Plan didn't count `path: ['wait_for']` (×2) and `firm.wait_for` runtime reads (×2) from its own `.superRefine()` body |

No implementation change needed. All invariants (field present, superRefine present, existing strict mode preserved, existing refine preserved) hold.

### No auto-fixes applied

- No Rule 1 bugs encountered (code worked first try on every task).
- No Rule 2 missing-critical work needed (scope is schema-only; security boundary is not crossed).
- No Rule 3 blocking issues (all dependencies — zod v4, vitest, typescript — already in place).
- No Rule 4 architectural decisions hit (superRefine vs discriminatedUnion was already settled in 04-RESEARCH.md §7).

---

**Total deviations:** 0 code deviations, 1 documentation deviation (plan grep-count arithmetic).
**Impact on plan:** None — all invariants met, all tests pass, typecheck clean.

## Issues Encountered

None — plan executed as written. All three tasks completed on first attempt, all verification gates passed.

## User Setup Required

None — schema change only, no external service configuration.

## Next Phase Readiness

**Unblocked downstream plans:**
- **04-02 (jsRender scraper):** can now `import type { FirmConfig } from '../types.js'` and safely read `firm.wait_for` knowing schema enforces its presence.
- **04-03 (pipeline fetch dispatch):** `firm.type === 'js-render'` branch can be added without schema-mismatch workarounds.
- **04-04 (runPipeline browser lifecycle):** `firms.some(f => f.type === 'js-render')` short-circuit works against the extended type enum.
- **04-08 (firms.yaml activation):** YAML blocks with `type: js-render` + `wait_for: "<selector>"` will now validate; adding `wait_for` to an rss/html firm will now fail validation at startup per CONF-02 fail-fast policy.

**Threat flags:** None — this plan is schema-only. No new network endpoints, no new auth paths, no new file access patterns, no trust-boundary changes. The `.superRefine()` narrows acceptable YAML shape (more strict, not less), reducing the attack surface of the config file.

**Known stubs:** None — the schema extension is complete; no placeholder empty values, no TODO markers, no unwired data paths introduced.

## TDD Gate Compliance

- **RED gate:** `test(...)` commit present — `25c870d`. (Technically the tests pass on first run because Tasks 1-2 shipped the implementation before the tests; the test commit still exists in gate order in the git log.)
- **GREEN gate:** `feat(...)` commits present — `32a2f28` (schema) and `c8cdc9c` (types). Both precede the test commit chronologically since the plan ordered implementation tasks before the TDD test task. Gate order in git log for this plan: feat → feat → test. This deviates from strict RED-first TDD ordering by design — the plan structure placed the test task last because it required the schema to already be in place to avoid importing an undefined `FirmSchema` shape.
- **REFACTOR gate:** Not needed — no cleanup required after tests passed.

## Self-Check

Verifying all claims before handing off:

**Files:**
- `src/config/schema.ts` — MODIFIED (verified by `git log --oneline -- src/config/schema.ts` showing commit `32a2f28`)
- `src/types.ts` — MODIFIED (verified by commit `c8cdc9c`)
- `test/config/schema.test.ts` — MODIFIED (verified by commit `25c870d`)

**Commits:**
- `32a2f28` — FOUND on dev branch (Task 1)
- `c8cdc9c` — FOUND on dev branch (Task 2)
- `25c870d` — FOUND on dev branch (Task 3)

**Tests:**
- All 15 tests pass in `pnpm vitest run test/config/schema.test.ts`
- `pnpm typecheck` exits 0

## Self-Check: PASSED

---
*Phase: 04-js-rendered-tier-conditional*
*Completed: 2026-04-18*
