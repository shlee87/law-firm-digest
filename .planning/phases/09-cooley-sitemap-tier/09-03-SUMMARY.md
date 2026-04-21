---
phase: 09-cooley-sitemap-tier
plan: 03
subsystem: pipeline
tags: [sitemap, pipeline, firms-yaml, enrichBody, audit, phase-9, SITEMAP-02, SITEMAP-04, SITEMAP-05]

# Dependency graph
requires:
  - phase: 09-cooley-sitemap-tier/01
    provides: FirmType='sitemap' + FirmConfig.latest_n + interim audit switch stub (now replaced)
  - phase: 09-cooley-sitemap-tier/02
    provides: scrapeSitemap(firm, browser) + DEFAULT_LATEST_N + offline test fixture
provides:
  - fetch.ts dispatch for type='sitemap' via scrapeSitemap with browser threading
  - enrichBody.ts OR-gate (needsPlaywrightDetail) routing sitemap firms through Playwright
  - run.ts hasJsRender gate extended to launch chromium for sitemap-only runs
  - firmAudit.ts probeSitemapFirm + switch case replacing Plan 09-01 interim stub
  - config/firms.yaml Cooley block migrated to sitemap tier (enabled, latest_n=10)
  - .planning/backlog/resolved/ directory with cooley-cf-bypass.md + README
  - SITEMAP-05 live smoke evidence (.planning/phases/09-.../SITEMAP-05-smoke.txt)
affects:
  - Phase 9 now END-TO-END wired — all three Phase 9 success criteria met

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OR-gate with local boolean (needsPlaywrightDetail) for multi-condition Playwright routing — sitemap OR detail_tier='js-render'; extends Phase 7 single-condition gate in enrichBody.ts"
    - "Audit probe clone-and-substitute — probeSitemapFirm mirrors probeJsRenderFirm byte-for-byte with only scrapeJsRender→scrapeSitemap + selectors→undefined swap; keeps detail-path discipline consistent across tiers"
    - "Disabled-firm fixture indirection — loader test DISABLED_FIRM_ID constant (currently bkl) decouples tests from which specific firm happens to be disabled at a given time (Rule-1 fix)"

key-files:
  created:
    - .planning/backlog/resolved/README.md — resolved backlog directory conventions
    - .planning/phases/09-cooley-sitemap-tier/SITEMAP-05-smoke.txt — Cooley live smoke evidence
  modified:
    - src/pipeline/fetch.ts — case 'sitemap' dispatch + TS never exhaustiveness
    - src/pipeline/enrichBody.ts — needsPlaywrightDetail OR-gate
    - src/pipeline/run.ts — hasJsRender extended with sitemap tier
    - src/audit/firmAudit.ts — probeSitemapFirm + switch extension + hasJsRender extension
    - config/firms.yaml — Cooley sitemap migration + header docs
    - test/pipeline/fetch.test.ts — Phase 9 sitemap dispatch describe block
    - test/pipeline/enrichBody.test.ts — sitemap OR-gate regression test
    - test/config/loader.test.ts — Rule-1 fix: DISABLED_FIRM_ID indirection
  moved:
    - .planning/backlog/cooley-cf-bypass.md → .planning/backlog/resolved/cooley-cf-bypass.md

key-decisions:
  - "09-03: Rule 1 fix — test/config/loader.test.ts hardcoded cooley=disabled (4 tests failed) after flipping Cooley to enabled in firms.yaml. Introduced DISABLED_FIRM_ID constant (=bkl, still disabled per Phase 7-06) to decouple fixture from whichever firm is disabled. Tests now track config drift without churn."
  - "09-03: probeSitemapFirm extractBody called with undefined selector — sitemap firms have no selectors block (schema superRefine rejects selectors on sitemap tier). The generic extractBody chain hits .post-content on Cooley articles (verified by SITEMAP-05 smoke: 10/10 bodies)."
  - "09-03: enrichBody OR-gate via named boolean (Pattern B) over inline OR (Pattern A). The needsPlaywrightDetail local documents WHY the branch activates; matches PATTERNS.md 398-405 guidance."
  - "09-03: fetch.ts default branch upgraded to TS never-exhaustiveness (mirrors firmAudit.ts pattern). Prevents future tier additions from silently falling through to runtime error — compile-time catch."

patterns-established:
  - "Multi-tier Playwright routing gate — when N tier conditions require Playwright, prefer a named boolean (needsPlaywrightDetail = condA || condB || condC) over an ever-growing inline predicate"
  - "Disabled-firm test indirection — never hardcode a specific firm id as 'the disabled firm'; keep a DISABLED_FIRM_ID constant at describe block top and update it when config drifts"

requirements-completed: [SITEMAP-02, SITEMAP-04, SITEMAP-05]

# Metrics
duration: ~9 min
completed: 2026-04-21
---

# Phase 09 Plan 03: Pipeline Wiring + Cooley Sitemap Migration Summary

**Sitemap tier wired end-to-end through fetch.ts / enrichBody.ts / run.ts / firmAudit.ts; Cooley migrated to `type: sitemap` with live `pnpm check:firm cooley` reporting 10/10 bodies; SITEMAP-02 / SITEMAP-04 / SITEMAP-05 all closed; 394/394 tests pass.**

## Performance

- **Duration:** ~9 min (2026-04-21T02:49:12Z → 2026-04-21T02:58:10Z)
- **Tasks:** 8 (all auto; Task 8 surfaced live smoke evidence)
- **Files created:** 2 (resolved/README.md, SITEMAP-05-smoke.txt)
- **Files modified:** 8 (4 src + 3 test + 1 config)
- **Files moved:** 1 (cooley-cf-bypass.md → resolved/)

## Accomplishments

- `src/pipeline/fetch.ts` case `'sitemap'` dispatches to `scrapeSitemap(firm, browser)` with browser-required check mirroring js-render; default branch upgraded to TS never-exhaustiveness
- `src/pipeline/enrichBody.ts` `needsPlaywrightDetail` OR-gate routes sitemap firms through Playwright regardless of zod's `detail_tier: 'static'` default (Pitfall 6 fix)
- `src/pipeline/run.ts` `hasJsRender` extended with `|| f.type === 'sitemap'` so chromium launches for sitemap-only runs (CF-bypass XML fetch needs browser-HTTP + detail fetch needs Playwright)
- `src/audit/firmAudit.ts` `probeSitemapFirm` helper mirrors `probeJsRenderFirm` structure; extractBody uses undefined selector (generic chain); switch case replaces Plan 09-01 interim list-fail stub; hasJsRender extended for audit chromium launch
- `config/firms.yaml` Cooley block migrated: `type: sitemap`, `url: https://www.cooleygo.com/post-sitemap.xml`, `enabled: true`, `latest_n: 10`; header comment block extended with Phase 9 tier + `latest_n` field docs
- `.planning/backlog/resolved/` directory seeded with README (D-07 history convention); `cooley-cf-bypass.md` moved via `git mv`
- **SITEMAP-05 live smoke:** `pnpm check:firm cooley` returned `fetch: 10 items (636ms)`, `enrich: 10/10 bodies`, `dedup: 6 new`, `would-summarize: 6 item(s)`. No HTTP 403 / CF challenge. Gate PASSED.

## Task Commits

Each task committed atomically:

1. **Task 1: fetch.ts sitemap dispatch** — `0bc0796` (feat)
2. **Task 2: enrichBody.ts OR-gate** — `2ba6188` (feat)
3. **Task 3: run.ts hasJsRender extension** — `97fe860` (feat)
4. **Task 4: firmAudit.ts probeSitemapFirm + switch + hasJsRender** — `d5305b5` (feat)
5. **Task 5: firms.yaml Cooley migration + loader test fix** — `3cb0e36` (feat)
6. **Task 6: fetch/enrichBody test coverage** — `ea0f249` (test)
7. **Task 7: resolved backlog move + README** — `1495df7` (chore)
8. **Task 8: SITEMAP-05 live smoke evidence** — `872dec7` (test)

## Files Created/Modified

- `src/pipeline/fetch.ts` — +13 lines: scrapeSitemap import, case 'sitemap' block, TS never default
- `src/pipeline/enrichBody.ts` — +11 / -6 lines: Pattern B OR-gate with explanatory comment
- `src/pipeline/run.ts` — +8 / -2 lines: three-term OR predicate + D-05 extension comment
- `src/audit/firmAudit.ts` — +49 / -13 lines: probeSitemapFirm helper (39 lines) + hasJsRender OR + switch case
- `config/firms.yaml` — +18 / -2 lines: header latest_n doc + Phase 9 migration block (Cooley only)
- `test/pipeline/fetch.test.ts` — +59 lines: Phase 9 describe block (2 tests, vi.mock scrapeSitemap)
- `test/pipeline/enrichBody.test.ts` — +55 lines: sitemap OR-gate test (mock Browser/Context/Page)
- `test/config/loader.test.ts` — +14 / -14 lines: DISABLED_FIRM_ID constant + 4 test rewrites
- `.planning/backlog/resolved/README.md` — NEW (7 lines, directory convention note)
- `.planning/phases/09-cooley-sitemap-tier/SITEMAP-05-smoke.txt` — NEW (13 lines, live smoke output)

## Decisions Made

- `enrichBody.ts` OR-gate lifted to named local (`needsPlaywrightDetail`) for readability — documents multi-tier Playwright routing intent. Pattern B from PATTERNS.md.
- `probeSitemapFirm` `extractBody` argument is `undefined` (not `firm.selectors?.body`) — sitemap firms have no selectors per schema; generic chain handles Cooley's `.post-content` shape.
- `fetch.ts` default branch upgraded to TS never exhaustiveness (not plan-mandated but consistent with firmAudit pattern; surfaced during Task 1 for future-tier compile-time catch).
- Loader test disabled-firm fixture indirection — tests now use `DISABLED_FIRM_ID = 'bkl'` constant rather than assuming cooley is disabled. Self-documenting migration path when firms get enabled/disabled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] loader.test.ts hardcoded `cooley = disabled` assumption**

- **Found during:** Task 5 (full-suite regression after firms.yaml edit)
- **Issue:** `test/config/loader.test.ts` Tests 1-5 asserted `firms.find((f) => f.id === 'cooley')` behavior based on Cooley being the only disabled firm. Plan's Task 5 flipped Cooley to `enabled: true`, breaking 4 out of 10 loader tests with assertion errors ("expected { id: 'cooley' } to be undefined" / "expected true to be false").
- **Fix:** Introduced `DISABLED_FIRM_ID = 'bkl'` constant at describe-block top (bkl is disabled since Phase 7-06 pending the canonicalize/www URL-handling follow-up). Replaced hardcoded cooley references in Tests 1-5. Added block comment explaining the indirection and recovery path if bkl re-enables.
- **Files modified:** `test/config/loader.test.ts`
- **Verification:** `pnpm vitest run test/config/loader.test.ts` → 10/10 pass; full suite 394/394 pass.
- **Committed in:** `3cb0e36` (bundled with firms.yaml Task 5 commit)
- **Why inline and not a separate commit:** the yaml flip directly caused the test breakage; bundling keeps the commit boundary green (git bisect clean) — a separate yaml-only commit would leave HEAD broken.

---

**Total deviations:** 1 auto-fixed (test-level coupling to pre-Phase-9 config state)
**Impact on plan:** Zero — the fix is test-scoped, no production code changed, loader.test.ts now tracks config drift without churn.

## Issues Encountered

None beyond the single deviation above. All Task acceptance criteria gates met as written. Task 8 live smoke returned clean on the first attempt — no 403, no CF challenge, 10/10 bodies extracted.

## Threat Model Verification

All 7 threats in the plan's threat register (T1-T7) were LOW or MEDIUM with config-trust-model mitigations that remain intact. No new security surface introduced by this plan — it's a wiring-level integration.

## Self-Check

See Self-Check section at end of document.

## User Setup Required

None. All changes landed in code + config + tests. No new environment variables, secrets, or GitHub Actions workflow changes. The next scheduled cron run will include Cooley in the digest automatically.

## Next Phase Readiness

- **Phase 9 closed.** All three success criteria from the plan's `<verification>` block met:
  1. scrapeSitemap parses top-N lastmod-sorted URLs (Plan 09-02)
  2. Cooley appears in the digest (Task 5 yaml + Task 8 smoke prove it)
  3. `pnpm check:firm cooley` returns N>0 with non-empty bodies (Task 8 evidence)
- **SITEMAP-01 / 02 / 03 / 04 / 05 all closed** across Plans 09-01, 09-02, 09-03.
- **Phase 10+ readiness:** sitemap tier is first-class sibling of rss/html/js-render. Adding a second sitemap firm is a YAML-only operation (no code change). Audit subsystem supports all four tiers uniformly.
- **Outstanding from prior phases (unchanged by this plan):**
  - bkl + kim-chang remain disabled pending the canonicalize/www URL-handling helper (Phase 7-05, 7-06 deferred)
  - Phase 8 hallucination guard is fully in place — Cooley summaries will run through Layer 1-3 defenses on the next cron
- **Phase 10/11 candidates:**
  - Generalize sitemap tier beyond WordPress/Yoast XML shape (some firms may use different sitemap schemas)
  - Monitor Cooley CF policy changes — if CF extends challenge to post-sitemap.xml, fallback strategy needed
  - Consider making latest_n default observable (current is silent 10 via scraper constant)

## Self-Check: PASSED

**Files verified:**
- FOUND: src/pipeline/fetch.ts (scrapeSitemap import line 40, case 'sitemap' line 86, TS never line 95)
- FOUND: src/pipeline/enrichBody.ts (needsPlaywrightDetail lines 112-113)
- FOUND: src/pipeline/run.ts (three-term OR predicate line 165-168)
- FOUND: src/audit/firmAudit.ts (scrapeSitemap import line 29, probeSitemapFirm line 204, hasJsRender extension line 256, switch case line 285)
- FOUND: config/firms.yaml (type: sitemap Cooley block; enabled: true; latest_n: 10; old /feed/ URL removed)
- FOUND: test/pipeline/fetch.test.ts (Phase 9 sitemap dispatch describe)
- FOUND: test/pipeline/enrichBody.test.ts (sitemap OR-gate regression)
- FOUND: test/config/loader.test.ts (DISABLED_FIRM_ID constant)
- FOUND: .planning/backlog/resolved/cooley-cf-bypass.md (moved)
- FOUND: .planning/backlog/resolved/README.md (seeded)
- FOUND: .planning/phases/09-cooley-sitemap-tier/SITEMAP-05-smoke.txt (live evidence)
- MOVED: .planning/backlog/cooley-cf-bypass.md (confirmed absent via git mv rename)

**Commits verified:**
- FOUND: 0bc0796 (Task 1: fetch.ts dispatch)
- FOUND: 2ba6188 (Task 2: enrichBody OR-gate)
- FOUND: 97fe860 (Task 3: run.ts hasJsRender)
- FOUND: d5305b5 (Task 4: firmAudit probeSitemapFirm)
- FOUND: 3cb0e36 (Task 5: firms.yaml + loader test fix)
- FOUND: ea0f249 (Task 6: pipeline test coverage)
- FOUND: 1495df7 (Task 7: resolved backlog move)
- FOUND: 872dec7 (Task 8: SITEMAP-05 live smoke)

**Acceptance gates verified:**
- `pnpm tsc --noEmit` exits 0
- `pnpm vitest run` → 394/394 pass across 29 files (391 Phase 9-02 baseline + 3 new: 2 fetch sitemap + 1 enrichBody sitemap OR-gate)
- `pnpm check:firm cooley` → 10 items, 10/10 bodies, 6 new, zero 403/CF signals

---
*Phase: 09-cooley-sitemap-tier*
*Completed: 2026-04-21*
