# Deferred Items — Phase 7

Out-of-scope discoveries encountered during Phase 7 execution. Do not block Phase 7 closure; queued for future scoped cleanup (likely a Phase 10/11 lint-polish plan).

## Lint (eslint) pre-existing issues discovered in 07-06

Run: `pnpm eslint .` (2026-04-20T14:59Z)

| Severity | File | Line | Rule | Message |
|----------|------|------|------|---------|
| error | `test/audit/signals.test.ts` | 143:11 | `@typescript-eslint/no-unused-vars` | `'bodyB' is assigned a value but never used` |
| warning | `test/config/schema.test.ts` | 344:7 | `(eslint-disable-next-line)` | `Unused eslint-disable directive (no problems were reported from 'no-console')` |

**Why deferred (not auto-fixed in 07-06):**

- Both are pre-existing issues that landed during Phase 6 / Phase 7-01 test authoring — NOT caused by Plan 07-06's verification-sweep work (which is read-only: vitest + tsc + audit regen + VERIFICATION.md write).
- Plan 07-06's `files_modified` contract is `[.planning/phases/06-firm-audit-probe/06-AUDIT.md, .planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md]` — editing test/*.ts would exceed declared scope.
- Neither blocks type-checking (`pnpm tsc --noEmit` exits 0) nor vitest (`pnpm vitest run` = 326/326 green). They only surface at `pnpm eslint .`, which is not wired into CI.

**Suggested follow-up:** A future lint-polish plan can `--fix` these in a single commit. Low priority (lint, not runtime).
