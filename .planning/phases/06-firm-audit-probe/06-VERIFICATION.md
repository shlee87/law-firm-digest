---
phase: 06-firm-audit-probe
verified: 2026-04-19T23:15:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
overrides:
  - must_have: ".planning/phases/06-firm-audit/06-AUDIT.md exists"
    reason: "ROADMAP.md SC-3 contains a typo — directory is '06-firm-audit-probe', not '06-firm-audit'. The actual file exists at .planning/phases/06-firm-audit-probe/06-AUDIT.md, matching every other artifact in the phase. The AUDIT_OUTPUT_PATH constant in firmAudit.ts also uses the correct path. This is a documentation typo, not a missing deliverable."
    accepted_by: "verifier"
    accepted_at: "2026-04-19T23:15:00Z"
---

# Phase 6: Firm Audit + Probe Verification Report

**Phase Goal:** Every enabled firm's actual extraction quality is documented — which firms return real article body, which return SPA/generic content, which fail list fetch entirely — so subsequent phases fix the right things.
**Verified:** 2026-04-19T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth | Status | Evidence |
|-----|-------|--------|----------|
| 1   | Running the probe against all enabled firms reports item count and selector-match status for each firm's list page | ✓ VERIFIED | 06-AUDIT.md contains 12 rows (one per enabled firm) with item counts and Status values. Live run at 2026-04-20T03:54:53.777Z produced: clifford-chance 50 items OK, freshfields 40 items OK, shin-kim 0 items list-fail, logos 0 items selector-empty, etc. |
| 2   | Running the probe against bkl fetches 2+ detail URLs and flags identical extracted bodies across distinct URLs as SPA/hallucination risk | ✓ VERIFIED | 06-AUDIT.md row: `\| bkl \| html \| detail-identical \| 9 \| enable-js-render-detail \| Phase 7 \|`. Evidence field: "exact-hash, jaccard=1.00". signals.ts classifyDetailIdentity() triggered both exact-hash and jaccard=1.00 signals simultaneously on bkl's SPA detail pages. This is the core v1.0 UAT bug rediscovery. |
| 3   | 06-AUDIT.md exists and contains a per-firm diagnosis row for each enabled firm using the defined status vocabulary | ✓ VERIFIED | File at .planning/phases/06-firm-audit-probe/06-AUDIT.md (ROADMAP SC-3 has a typo listing '06-firm-audit' — overridden above). Contains all 6 status values in use: OK (4 firms), list-fail (1), selector-empty (2), detail-identical (1), detail-empty (2), detail-quality-unknown (2). Total firms: 12. |
| 4   | Each firm row with a non-OK status has an explicit remediation path recorded | ✓ VERIFIED | All 8 non-OK rows have Remediation and Target Phase populated: enable-js-render-detail → Phase 7 (bkl), fix-selector → Phase 7 (logos, skadden, lee-ko, barun), monitor → Phase 10/11 (shin-kim, yulchon, kim-chang). Enum-enforced via TypeScript never-exhaustiveness in writer.ts and firmAudit.ts. |

**Score:** 4/4 truths verified

### Deferred Items

None identified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audit/types.ts` | Type contracts (Status 6 values, Remediation 5 values, AuditRow, AuditReport, RunOptions) | ✓ VERIFIED | All exports present and substantive. Status union: OK/list-fail/selector-empty/detail-identical/detail-empty/detail-quality-unknown. Remediation union: enable-js-render-detail/fix-selector/disable-firm/migrate-to-sitemap/monitor. |
| `src/config/loader.ts` | LoadFirmsOptions + includeDisabled branch | ✓ VERIFIED | `export interface LoadFirmsOptions { includeDisabled?: boolean; }` present. `options.includeDisabled ? all : all.filter(f => f.enabled)` branch correctly implemented. Default `= {}` preserves backwards compat. |
| `src/audit/signals.ts` | 4 pure signal functions + classifyDetailIdentity | ✓ VERIFIED | bodyHash, exactHashMatch, tokenize, jaccardTokenSimilarity, extractTitleTokens, titleTokensPresentInBody, BODY_TOO_SHORT_THRESHOLD (100), bodyTooShort, classifyDetailIdentity, DetailSignalResult all exported. Pitfall 1 guard present: `totalTokensA > 0 && totalTokensB > 0`. Jaccard threshold 0.9 hardcoded. No I/O imports. |
| `src/audit/writer.ts` | renderAuditMarkdown + remediationToTargetPhase + enum never-exhaustiveness | ✓ VERIFIED | Both functions exported. Two `_exhaustive: never` exhaustiveness switches (Status + Remediation). No fs/writeFile imports (pure function). D-09 hybrid format: title → summary table → per-firm evidence → metadata. |
| `src/audit/firmAudit.ts` | runAudit() orchestrator + AUDIT_OUTPUT_PATH constant | ✓ VERIFIED | `export const AUDIT_OUTPUT_PATH = '.planning/phases/06-firm-audit-probe/06-AUDIT.md'`. `export async function runAudit(options: RunOptions)`. Promise.allSettled isolation, pLimit(3), robots.txt gate, tier dispatch (rss/html/js-render), Chromium launch IFF js-render in scope, browser.close() in outer finally, scrubSecrets on all error paths (≥3 sites), single writeFile call. |
| `src/cli/auditFirms.ts` | CLI wrapper with 3-tier exit codes | ✓ VERIFIED | parseArgs whitelist (--include-disabled only), exit 2 on unknown flag + usage line, disabled rows excluded from exit-1 calc (`filter((r) => !r.disabled)`), belt-and-suspenders top-level catch. |
| `package.json` | audit:firms script entry | ✓ VERIFIED | `"audit:firms": "tsx src/cli/auditFirms.ts"` present between check:firm and test. 6 scripts total, no other changes. |
| `scripts/detail-page-audit.ts` | DELETED | ✓ VERIFIED | File does not exist. Only debug-rss.ts and probe-js-render.ts remain in scripts/. No production imports of detail-page-audit remain. |
| `test/audit/types.test.ts` | 6 type-level invariant tests | ✓ VERIFIED | File exists. Tests cover all 6 Status values, all 5 Remediation values, exhaustiveness switches, AuditRow and AuditReport shape construction. |
| `test/audit/signals.test.ts` | 35 unit tests including Pitfall 1 guard | ✓ VERIFIED | File exists. Tests cover tokenize, extractTitleTokens, titleTokensPresentInBody, bodyHash+exactHashMatch, jaccardTokenSimilarity, bodyTooShort, classifyDetailIdentity (including vacuous-fire guard Test 34). |
| `test/audit/writer.test.ts` | Snapshot test + enum coverage | ✓ VERIFIED | File exists. 6 tests: snapshot, structural table-line count, null remediation renders n/a, disabled tag, row order preservation, remediationToTargetPhase all-5 values. |
| `test/audit/__snapshots__/writer.test.ts.snap` | Locked markdown output reference | ✓ VERIFIED | File exists in test/audit/__snapshots__/ directory. |
| `test/audit/firmAudit.test.ts` | 14 integration tests with mocked scrapers | ✓ VERIFIED | File exists. Covers allSettled isolation, HTML detail-identical, HTML OK, HTML detail-quality-unknown, RSS list-only (decodeCharsetAwareFetch not called), RSS selector-empty, RSS list-fail, robots disallow, defense-in-depth rejected branch, chromium short-circuit, includeDisabled forwarding, atomic writeFile, probeVersion env var, disabled firm row. |
| `.planning/phases/06-firm-audit-probe/06-AUDIT.md` | Live audit report with all 12 enabled firms | ✓ VERIFIED | File present, 132 lines. Generated 2026-04-20T03:54:53.777Z. 12 firms, 4 OK, 8 non-OK. bkl row confirmed detail-identical. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/audit/firmAudit.ts` | `src/audit/signals.ts` | `classifyDetailIdentity(bodies)` call | ✓ WIRED | Imported and called in both probeHtmlFirm and probeJsRenderFirm. |
| `src/audit/firmAudit.ts` | `src/audit/writer.ts` | `renderAuditMarkdown(report)` call | ✓ WIRED | Imported at L35, called at L283. Result passed to writeFile. |
| `src/audit/firmAudit.ts` | `src/config/loader.ts` | `loadFirms({includeDisabled})` call | ✓ WIRED | Imported at L24, called at L204 forwarding options.includeDisabled. |
| `src/audit/firmAudit.ts` | `src/scrapers/robots.ts` | `fetchRobots + isAllowed` gate | ✓ WIRED | Both imported and called before tier dispatch on every firm. |
| `src/audit/firmAudit.ts` | `src/scrapers/rss.ts` | `scrapeRss(firm)` | ✓ WIRED | Called in probeRssFirm. |
| `src/audit/firmAudit.ts` | `src/scrapers/html.ts` | `scrapeHtml(firm)` | ✓ WIRED | Called in probeHtmlFirm. |
| `src/audit/firmAudit.ts` | `src/scrapers/jsRender.ts` | `scrapeJsRender(firm, browser)` | ✓ WIRED | Called in probeJsRenderFirm. |
| `src/audit/firmAudit.ts` | `src/scrapers/util.ts` | `decodeCharsetAwareFetch + extractBody` | ✓ WIRED | Both imported, used in HTML detail fetch loop and JS-render detail extraction. |
| `src/audit/writer.ts` | `src/audit/types.ts` | `import type { AuditReport, AuditRow, Remediation, Status }` | ✓ WIRED | Import present at L17-22. |
| `src/cli/auditFirms.ts` | `src/audit/firmAudit.ts` | `runAudit({includeDisabled, reporter})` call | ✓ WIRED | Imported at L21, called at L51 inside main(). |
| `package.json scripts.audit:firms` | `src/cli/auditFirms.ts` | `tsx src/cli/auditFirms.ts` invocation | ✓ WIRED | Exact entry in scripts block confirmed. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `06-AUDIT.md` | `report.rows[]` | `runAudit()` → Promise.allSettled → per-tier probes → live network fetches | Yes — live run at 2026-04-20T03:54:53.777Z confirmed 12 rows with real item counts (e.g., clifford-chance 50 items, latham 16 items, bkl 9 items) and real evidence strings | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Evidence | Status |
|----------|----------|--------|
| pnpm audit:firms produces 06-AUDIT.md | File present, 132 lines, generated 2026-04-20T03:54:53.777Z, Total firms: 12, OK: 4, Non-OK: 8 | ✓ PASS |
| bkl row shows detail-identical (v1.0 UAT bug rediscovery) | 06-AUDIT.md line: `\| bkl \| html \| detail-identical \| 9 \| enable-js-render-detail \| Phase 7 \|` | ✓ PASS |
| Exit code semantics (disabled rows excluded from exit-1) | auditFirms.ts: `const enabledRows = report.rows.filter((r) => !r.disabled)` then `const nonOk = enabledRows.filter(r => r.status !== 'OK')` | ✓ PASS |
| CLI exit 2 on unknown flag | parseArgs whitelist loop: any arg other than `--include-disabled` → `process.exit(2)` + Usage line | ✓ PASS |
| Test suite: 323/323 passing | pnpm vitest run output: "Test Files 23 passed (23), Tests 323 passed (323)" | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| AUDIT-01 | 06-01, 06-04, 06-05 | Developer can run a firm-audit probe that fetches every enabled firm's list page and reports item count + selector match status per firm | ✓ SATISFIED | pnpm audit:firms CLI invokes runAudit() which fans out per-firm probes and produces 06-AUDIT.md with 12 rows including item counts and status values. |
| AUDIT-02 | 06-02, 06-04 | The probe fetches each firm's detail URLs for N≥2 items and cross-compares extracted body text — identical bodies across distinct URLs flag SPA/hallucination risk | ✓ SATISFIED | signals.ts 4-signal classifier (exactHashMatch, jaccardTokenSimilarity, titleTokensPresentInBody, bodyTooShort) wired into firmAudit.ts probeHtmlFirm and probeJsRenderFirm. bkl live run confirmed: detail-identical with exact-hash + jaccard=1.00. |
| AUDIT-03 | 06-01, 06-02, 06-03, 06-04, 06-05 | Probe output is written to 06-AUDIT.md with a per-firm diagnosis table using defined status vocabulary | ✓ SATISFIED | writer.ts renderAuditMarkdown() produces D-09 hybrid format. firmAudit.ts writes atomically via single writeFile. File exists with all 6 status values used. |
| AUDIT-04 | 06-01, 06-03, 06-04 | Each audit finding has an explicit remediation path recorded | ✓ SATISFIED | defaultRemediation() in firmAudit.ts maps Status × Tier → Remediation. TypeScript never-exhaustiveness in writer.ts and firmAudit.ts locks both enums. All 8 non-OK rows in 06-AUDIT.md have explicit Remediation and Target Phase. |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None detected | — | — | — |

Key checks performed:
- `firmAudit.ts`: `writeFile` count = 1 (no appendFile anti-pattern)
- `writer.ts`: no fs imports (pure function, Pitfall 6 compliant)
- `signals.ts`: no I/O imports (pure functions, testable in isolation)
- `firmAudit.ts`: scrubSecrets called at ≥3 error sites
- No TODO/FIXME/placeholder comments in production code
- No hardcoded empty returns in production paths
- `totalTokensA > 0 && totalTokensB > 0` Pitfall 1 guard present in signals.ts

### Human Verification Required

None — all required checks were verifiable programmatically. The live audit run output (06-AUDIT.md committed at 2026-04-20T03:54:53.777Z) serves as the end-to-end behavioral evidence, including:
- Exit code 1 confirmed in phase_context (non-OK firms present)
- bkl detail-identical row confirmed in 06-AUDIT.md
- Task 3 human checkpoint (Plan 06-05) was completed and approved by the developer before Phase 6 was marked Complete in ROADMAP.md

### ROADMAP Path Typo Note

ROADMAP.md Success Criterion 3 lists `.planning/phases/06-firm-audit/06-AUDIT.md` but the actual directory is `06-firm-audit-probe`. This is a documentation typo — every plan, summary, firmAudit.ts constant, and the actual file all use `06-firm-audit-probe`. The override above documents the accepted deviation so future re-verifications do not re-raise it.

### Gaps Summary

No gaps. All 4 roadmap success criteria are verified. All AUDIT-01 through AUDIT-04 requirements are satisfied. The phase's core success criterion — rediscovering the v1.0 bkl "detail-identical" bug — is confirmed by the live 06-AUDIT.md output.

---

_Verified: 2026-04-19T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
