---
phase: 06-firm-audit-probe
plan: "01"
subsystem: audit-foundation
tags: [audit, types, loader, foundation, tdd]
dependency_graph:
  requires: []
  provides:
    - src/audit/types.ts (Status/Remediation/AuditRow/AuditReport/RunOptions)
    - src/config/loader.ts (LoadFirmsOptions / loadFirms({includeDisabled}))
  affects:
    - Plans 02/03/04 import src/audit/types.js
    - Plan 04 uses loadFirms({includeDisabled:true})
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN per task
    - Closed union + never-exhaustiveness for fail-loud enum extension
    - Default-parameter backwards compat for additive loader option
key_files:
  created:
    - src/audit/types.ts
    - test/audit/types.test.ts
  modified:
    - src/config/loader.ts
    - test/config/loader.test.ts
decisions:
  - "LoadFirmsOptions default = {} — three existing call sites (main.ts/checkFirm.ts/run.ts) use loadFirms() with no args; backwards compat is zero-touch"
  - "options.includeDisabled ? all : all.filter(f => f.enabled) branch — Pitfall 4 mitigation; explicit conditional avoids subtle filter-always bug"
  - "Status and Remediation unions are CLOSED — header comment + never-exhaustiveness in test prove downstream writers will fail-build on new value without case coverage"
metrics:
  duration: "~4 min"
  completed_date: "2026-04-20"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 6 Plan 01: Audit Foundation — Types and Loader Extension Summary

**One-liner:** LoadFirmsOptions + includeDisabled branch in loader; closed Status(6)/Remediation(5) type vocab with never-exhaustiveness for fail-loud downstream enforcement.

## What Was Built

### Task 1: Extend loadFirms() with LoadFirmsOptions

**Final signature:**

```typescript
export interface LoadFirmsOptions {
  includeDisabled?: boolean;
}

export async function loadFirms(
  options: LoadFirmsOptions = {},
): Promise<FirmConfig[]>
```

The implementation selects `options.includeDisabled ? all : all.filter((f) => f.enabled)` — when `includeDisabled` is falsy (default), returns only enabled firms exactly as before. When true, returns all firms including disabled ones (e.g. cooley).

**Call site confirmation:** All three production call sites remain unchanged:
- `src/main.ts`: loadFirms() (via run.ts)
- `src/cli/checkFirm.ts:73`: `await loadFirms()` — no-args
- `src/pipeline/run.ts:132`: `await loadFirms()` — no-args

Both typecheck (`pnpm typecheck`) and full suite pass confirm backwards compatibility.

### Task 2: Create src/audit/types.ts

**Status union (6 values — locked per SC-3/D-07):**
- `'OK'`
- `'list-fail'`
- `'selector-empty'`
- `'detail-identical'`
- `'detail-empty'`
- `'detail-quality-unknown'`

**Remediation union (5 values — locked per D-10):**
- `'enable-js-render-detail'`
- `'fix-selector'`
- `'disable-firm'`
- `'migrate-to-sitemap'`
- `'monitor'`

**Interfaces exported:** `AuditRow`, `AuditReport`, `RunOptions`

## Test Count Delta

| File | Before | After | Delta |
|------|--------|-------|-------|
| test/config/loader.test.ts | 4 (loadRecipient) | 10 (4 + 6 loadFirms) | +6 |
| test/audit/types.test.ts | 0 (new file) | 6 | +6 |
| **Total suite** | 261 | 267 | **+6** |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 1f54731 | test(06-01) | RED — failing tests for loadFirms({includeDisabled}) |
| fba7aec | feat(06-01) | GREEN — LoadFirmsOptions + extended loadFirms |
| 33b111c | test(06-01) | RED — failing type tests for src/audit/types.ts |
| 350627d | feat(06-01) | GREEN — src/audit/types.ts created |

## Deviations from Plan

None — plan executed exactly as written.

The Task 2 RED state was confirmed via `pnpm typecheck` (TS2307 + TS2322) rather than vitest run failure, because `import type` statements are erased at runtime. This is the correct RED gate for type-only modules — typecheck failure == compilation RED, which is the meaningful signal for type contracts.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `src/audit/types.ts` is pure type definitions (no I/O). `src/config/loader.ts` change adds no new file reads — same `config/firms.yaml` path, same safeParse validation gate (T-06-01 mitigated as planned).

## Self-Check: PASSED

| Item | Result |
|------|--------|
| src/audit/types.ts | FOUND |
| src/config/loader.ts | FOUND |
| test/audit/types.test.ts | FOUND |
| test/config/loader.test.ts | FOUND |
| commit 1f54731 | FOUND |
| commit fba7aec | FOUND |
| commit 33b111c | FOUND |
| commit 350627d | FOUND |
