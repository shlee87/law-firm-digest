---
phase: 06-firm-audit-probe
plan: "04"
subsystem: audit-orchestrator
tags: [audit, orchestrator, playwright, allSettled, tier-dispatch, integration-tests]
dependency_graph:
  requires: [06-01, 06-02, 06-03]
  provides: [runAudit, AUDIT_OUTPUT_PATH]
  affects: [06-05-cli, Phase 11 cron-gate]
tech_stack:
  added: []
  patterns: [Promise.allSettled per-firm isolation, Chromium IFF js-render, single-writeFile atomic, Status×Tier remediation mapping]
key_files:
  created:
    - src/audit/firmAudit.ts
    - test/audit/firmAudit.test.ts
  modified: []
decisions:
  - "AUDIT_OUTPUT_PATH hardcoded as '.planning/phases/06-firm-audit-probe/06-AUDIT.md' (Phase 11 gate contract)"
  - "defaultRemediation: html+detail-identical → enable-js-render-detail; js-render+detail-identical → monitor (RESEARCH Pattern 5)"
  - "probeJsRenderFirm opens per-firm BrowserContext for detail (Phase 4 D-05 pattern); inner context.close() in finally"
  - "PLAYWRIGHT_GOTO_TIMEOUT_MS re-declared locally (15_000) to decouple audit from production scraper constants"
  - "probeVersion reads process.env.GITHUB_SHA (no execSync git overhead; detached-worktree safe per RESEARCH A6)"
metrics:
  duration: "~3m 38s"
  completed_date: "2026-04-20"
  tasks: 2
  files: 2
---

# Phase 6 Plan 04: runAudit Orchestrator Summary

Implemented the `runAudit` orchestrator that composes Plan 01 (loader+types), Plan 02 (signals), and Plan 03 (writer) into the actual diagnostic tool — Promise.allSettled per-firm fan-out, tier dispatch (rss/html/js-render), 4-signal classifier, atomic AUDIT.md write.

## Public Surface

```typescript
export const AUDIT_OUTPUT_PATH = '.planning/phases/06-firm-audit-probe/06-AUDIT.md';
export async function runAudit(options: RunOptions): Promise<AuditReport>;
```

Plan 05 CLI imports both: `import { runAudit, AUDIT_OUTPUT_PATH } from '../audit/firmAudit.js'`.

## Per-Tier Probe Behavior

| Tier | Probe | Detail Check | Signal |
|------|-------|-------------|--------|
| rss | `scrapeRss(firm)` | None (D-06) | item count → OK / selector-empty |
| html | `scrapeHtml(firm)` + `decodeCharsetAwareFetch` ×N=2 | `extractBody` → `classifyDetailIdentity` | 4-signal (Plan 02) |
| js-render | `scrapeJsRender(firm, browser)` + Playwright detail via shared browser | `page.content()` → `extractBody` → `classifyDetailIdentity` | 4-signal (Plan 02) |

## Status × Tier Remediation Mapping (RESEARCH Pattern 5)

| Status | html | js-render | rss |
|--------|------|-----------|-----|
| OK | null | null | null |
| list-fail | monitor | monitor | monitor |
| selector-empty | fix-selector | fix-selector | fix-selector |
| detail-identical | enable-js-render-detail | monitor | — |
| detail-empty | fix-selector | fix-selector | — |
| detail-quality-unknown | monitor | monitor | — |

## Pitfall Lock-Down

**Pitfall 5 (silent green on catastrophic throw):** Test 9 covers the Promise.allSettled `.status === 'rejected'` defense-in-depth branch — a non-Error string reject reason still synthesizes a valid `list-fail` row. Regression test ensures the audit never silently produces N-1 rows.

**Pitfall 6 (atomic write, no streaming):** Single `writeFile(AUDIT_OUTPUT_PATH, markdown, 'utf8')` call after building the full markdown string in memory. Test 12 asserts the mock was called exactly once with the locked constant path. No `appendFile` invocations anywhere in the file.

## Integration Test Results (15/15 passed)

| # | Test | Status |
|---|------|--------|
| 1 | Per-firm isolation: firm B throws → 3 rows, B=list-fail | PASS |
| 2 | HTML detail-identical → enable-js-render-detail | PASS |
| 3 | HTML distinct bodies → OK, remediation null | PASS |
| 4 | HTML both detail fetches throw → detail-quality-unknown | PASS |
| 5 | RSS list-only: decodeCharsetAwareFetch NOT called, OK | PASS |
| 6 | RSS selector-empty → selector-empty | PASS |
| 7 | RSS list-fail (throws) → list-fail | PASS |
| 8 | robots.txt disallow → list-fail with evidence | PASS |
| 9 | Defense-in-depth: non-Error reject synthesizes row | PASS |
| 10a | Chromium NOT launched for rss-only | PASS |
| 10b | Chromium launched once for js-render + closes | PASS |
| 11 | includeDisabled forwarded to loadFirms | PASS |
| 12 | writeFile called once with AUDIT_OUTPUT_PATH + markdown | PASS |
| 13 | probeVersion: GITHUB_SHA pickup + 'unknown' fallback | PASS |
| 14 | Disabled firm row carries disabled:true | PASS |

Full suite: **323/323 tests pass** (zero regressions).

## Deviations from Plan

None — plan executed exactly as written. The test suite has 15 tests (Tests 10a and 10b are two separate `it()` blocks for chromium not-launched vs. launched, which matches the plan's intent in Test 10).

## Known Stubs

None — all integration wiring is live (mocked at the test boundary only).

## Threat Flags

None discovered beyond the threat model in the plan frontmatter (T-06-11 through T-06-16 all mitigated by implementation).

## Next

Plan 05 adds the CLI wrapper (`pnpm audit:firms`), `package.json` script, and deletes the legacy `scripts/detail-page-audit.ts` that this orchestrator supersedes.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/audit/firmAudit.ts` exists | FOUND |
| `test/audit/firmAudit.test.ts` exists | FOUND |
| Commit `6c6cf54` (Task 1) exists | FOUND |
| Commit `1be8f31` (Task 2) exists | FOUND |
