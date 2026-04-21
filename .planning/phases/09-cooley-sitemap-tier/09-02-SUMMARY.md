---
phase: 09-cooley-sitemap-tier
plan: 02
subsystem: scraper
tags: [sitemap, scraper, playwright, cheerio, xml, phase-9, SITEMAP-01]

# Dependency graph
requires:
  - phase: 09-cooley-sitemap-tier/01
    provides: FirmType='sitemap' + FirmConfig.latest_n?: number + schema superRefine gates — scrapeSitemap imports FirmConfig with the new discriminant safely
  - phase: 04-js-rendered-tier-conditional/03
    provides: Browser-injection + per-firm context close discipline in jsRender.ts — sitemap.ts clones the try/finally structure verbatim
provides:
  - scrapeSitemap(firm, browser) — browser-injected XML fetcher, sibling of rss/html/jsRender
  - DEFAULT_LATEST_N=10 constant (default cap when firm.latest_n omitted)
  - test/fixtures/cooley-post-sitemap.xml — 10-entry real-format fixture (9 with lastmod, 1 missing-lastmod drop case)
  - Offline vitest coverage (11 cases) for classifier-coupled error shapes + finally discipline + URL-verbatim + USER_AGENT + title derivation
affects:
  - 09-03-PLAN (pipeline wire-up + firms.yaml Cooley migration): imports scrapeSitemap from src/scrapers/sitemap.ts into fetch.ts dispatch + replaces the interim audit stub from 09-01

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Browser-injection pattern cloned from jsRender.ts: composition root owns Browser lifecycle, scraper owns only per-firm BrowserContext; finally { await context.close() } is unconditional"
    - "cheerio xml-mode parsing: cheerio.load(xml, { xml: true }) with lowercase selectors ($('url'), .find('loc'), .find('lastmod')) — case-sensitive XML mode"
    - "Playwright browser-HTTP XML fetch (D-16 revision): context.request.get replaces undici fetch for CF-protected endpoints; same USER_AGENT yields HTTP 200 where undici returns 403"
    - "Silent drop-and-filter pattern: missing-lastmod + Number.isNaN(Date.parse) both short-circuit without logging — volume observability deferred to Phase 10"
    - "Title derivation via URL slug: Option A (pathname last segment → hyphen-split → Title-Case) — zero extra I/O, detail body lands via enrichBody Playwright branch downstream"

key-files:
  created:
    - src/scrapers/sitemap.ts — scrapeSitemap + DEFAULT_LATEST_N + titleFromUrl helper
    - test/scrapers/sitemap.test.ts — 11 offline vitest cases with hand-rolled mock Browser/Context/Request
    - test/fixtures/cooley-post-sitemap.xml — 10-entry Yoast-style fixture
  modified: []

key-decisions:
  - "09-02: USER_AGENT value (logging.ts line 13) is 'LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)' — PLAN.md interface block cited a different github path, but module imports the constant so the value divergence is invisible; tests assert via stringContaining('LegalNewsletterBot') so no regression vector"
  - "09-02: D-16 comment reworded (Rule 1 preventive fix) — plan acceptance criterion required grep('decodeCharsetAwareFetch') == 0, but plan-provided module template contained the literal in a header comment. Reworded to 'the undici-based charset-aware HTML helper (from util.js)' — preserves the historical why without self-invalidating the grep gate. Same pattern as 01-11 'DRY_RUN env dry-run helper' rewording"

patterns-established:
  - "Single scraper tier = single file + single test file + (optional) single fixture — established across rss.ts/html.ts/jsRender.ts/sitemap.ts; plan 10+ tier additions should follow the same triple structure"
  - "Browser-injection lifecycle invariant: all browser-dependent scrapers accept Browser as parameter, own only newContext/close; NEVER call browser.close() from within a scraper (Phase 4 D-05 lock preserved through Phase 9)"
  - "Classifier-coupled error-message shapes documented inline at the top of each scraper module: firm.id prefix + tier keyword + canonical failure mode — compose/templates.ts classifyError consumes these regex-free"

requirements-completed: [SITEMAP-01]

# Metrics
duration: ~4 min
completed: 2026-04-21
---

# Phase 09 Plan 02: Sitemap Tier Scraper Summary

**`scrapeSitemap(firm, browser)` lands in src/scrapers/sitemap.ts — browser-injected XML fetcher via Playwright context.request.get (D-16 CF bypass), cheerio xml-mode parsing with lastmod-sorted top-N slice, 11 offline tests passing, zero regressions across 391 total tests.**

## Performance

- **Duration:** ~4 min 21 sec
- **Started:** 2026-04-21T02:41:19Z
- **Completed:** 2026-04-21T02:45:40Z
- **Tasks:** 4 (3 auto code + 1 TDD-flagged test + 1 verification-only)
- **Files created:** 3 (sitemap.ts, sitemap.test.ts, cooley-post-sitemap.xml)
- **Files modified:** 0

## Accomplishments

- `src/scrapers/sitemap.ts` delivered — `scrapeSitemap(firm, browser)` + `DEFAULT_LATEST_N = 10` + private `titleFromUrl` helper. 128 lines, matches the jsRender.ts structural template (header-comment block + import pattern + try/finally discipline).
- Playwright browser-HTTP fetch via `context.request.get(firm.url, { timeout })` — D-16 revision enforced (no undici / decodeCharsetAwareFetch path for CF-protected sitemap endpoints).
- cheerio xml-mode parsing: `cheerio.load(xml, { xml: true })` + `$('url').each` + lowercase lastmod/loc selectors. Malformed-XML branch (no `<urlset>` root) throws classifier-friendly message.
- Entries filter: missing-lastmod OR unparseable-date entries silently dropped; remaining sorted descending by lastmod, sliced to `firm.latest_n ?? 10`.
- Title derivation (Option A from RESEARCH): URL pathname last segment → hyphen-split → Title-Case per word. `https://www.cooleygo.com/share-incentives-uk/` → `'Share Incentives Uk'`. No extra I/O.
- Error message shapes coupled to classifyError: `scrapeSitemap {id}: HTTP {status}` / `malformed XML (no <urlset> root)` / `zero items extracted`.
- `test/scrapers/sitemap.test.ts` — 11 vitest cases covering happy path + sort + latest_n + DEFAULT_LATEST_N fallback + HTTP non-200 + malformed XML + zero-items + context.close on both happy and throw paths + firm.url verbatim preservation + USER_AGENT + title derivation.
- `test/fixtures/cooley-post-sitemap.xml` — 10 `<url>` entries (9 with ISO-8601-offset `<lastmod>`, 1 missing-lastmod), Yoast SEO namespace attributes preserved, 3+ distinct calendar dates for sort-validity.
- SITEMAP-01 closed. No pipeline wiring done (plan 09-03 owns fetch.ts dispatch + firms.yaml migration + audit replacement).

## Task Commits

Each task committed atomically:

1. **Task 1: Capture Cooley sitemap XML fixture** — `7dfcfd0` (test)
2. **Task 2: Create src/scrapers/sitemap.ts module** — `e8fb49a` (feat)
3. **Task 3: Create test/scrapers/sitemap.test.ts with mock-browser coverage** — `f93b78d` (test; TDD gate — test follows implementation per plan 09-01 pattern for regression-lock plans)
4. **Task 4: Full type + test regression sanity pass** — no code commit (verification-only: `pnpm tsc --noEmit` exit 0, `pnpm vitest run` 391/391 across 29 files)

_Note: Task 3 TDD semantics — because the scraper-module assertions are tightly coupled to the exact error-message strings declared in Task 2's header comment (classifyError coupling), Task 3 tests are best authored AFTER Task 2 module exists, then run to prove the module satisfies them. This is the same regression-lock pattern used in Plan 09-01 Task 3; no accidental implementation-in-tests, just assertion authoring after module stabilization._

## Files Created/Modified

- `src/scrapers/sitemap.ts` — new. `scrapeSitemap` + `DEFAULT_LATEST_N = 10` + module-local `titleFromUrl`. Imports: `playwright.Browser` (type-only), `cheerio`, `USER_AGENT` from logging, `canonicalizeUrl` from scrapers/util, `FirmConfig`/`RawItem` from types.
- `test/scrapers/sitemap.test.ts` — new. 11 `it(...)` cases inside `describe('scrapeSitemap (Phase 9)')`. Hand-rolled Browser/Context/Request mocks cast to `never` at call sites.
- `test/fixtures/cooley-post-sitemap.xml` — new. 10 `<url>` entries, Yoast SEO namespace (`xmlns:xhtml`, `xmlns:image`), 9 with `<lastmod>` + 1 missing, 4 distinct calendar dates (2025-04 / 2025-03 / 2024-{12,09,08} / 2023-11). Placeholder-free: real Cooley GO style slugs.

## Decisions Made

- USER_AGENT value divergence from plan text is inert — module imports the constant (no hardcoded UA); tests assert `stringContaining('LegalNewsletterBot')` so value changes don't cascade. See key-decisions frontmatter.
- D-16 comment reworded to remove literal `decodeCharsetAwareFetch` token from sitemap.ts — plan acceptance criterion grep required `== 0` occurrences but plan-supplied module template contained the literal in the header-comment narrative. Reworded to "the undici-based charset-aware HTML helper (from util.js)" — preserves the historical context for future readers while satisfying the acceptance gate. Same self-invalidating-grep-mitigation pattern as `01-09 'catch-open tokens'` and `01-11 'DRY_RUN env dry-run helper'`.
- Test-follows-implementation cycle is acceptable for regression-lock plans where test assertions are byte-level coupled to module decisions (classifier string shapes). Plan 09-01's TDD Task 3 ran the same way; no accidental implementation-in-tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Header comment self-invalidated the `grep decodeCharsetAwareFetch == 0` acceptance gate**
- **Found during:** Task 2 acceptance-criteria verification
- **Issue:** Plan-supplied module template contained a header-comment sentence "`decodeCharsetAwareFetch is NOT viable for Cooley`" explaining why the tier uses Playwright instead of undici. Plan acceptance criterion required `grep -n "decodeCharsetAwareFetch" src/scrapers/sitemap.ts` to return ZERO matches. Plan body and acceptance gate were contradictory as written.
- **Fix:** Reworded the relevant comment from `"decodeCharsetAwareFetch is NOT viable for Cooley"` to `"the undici-based charset-aware HTML helper (from util.js) is not viable for Cooley — see .planning/backlog/cooley-cf-bypass.md"`. Preserves the historical D-16 context (and points readers to the backlog file with the full probe evidence) while removing the literal token that the grep gate checks.
- **Files modified:** `src/scrapers/sitemap.ts` (comment lines 12-13)
- **Verification:** `grep -c "decodeCharsetAwareFetch" src/scrapers/sitemap.ts` returns 0; `pnpm tsc --noEmit` exit 0; `pnpm vitest run test/scrapers/sitemap.test.ts` 11/11 pass.
- **Committed in:** `e8fb49a` (Task 2 commit — fix bundled with module creation)

---

**Total deviations:** 1 auto-fixed (plan-internal contradiction between body text and acceptance gate)
**Impact on plan:** Zero — the rewording is a pure documentation micro-edit that preserves semantic intent. No code behavior changed, no additional tests needed.

## Issues Encountered

None beyond the deviation above. Task 4 regression run was clean on first attempt: `pnpm tsc --noEmit` exit 0, `pnpm vitest run` 391/391 passing across 29 files (373 pre-Phase-9 baseline + 7 Phase 9-01 schema + 11 Phase 9-02 sitemap = 391, arithmetic checks out).

## Self-Check

See Self-Check section at end of document.

## User Setup Required

None — pure scraper-module addition plan. No new environment variables, dependencies, external services, or runtime integration. Plan 09-03 owns the pipeline wiring + `firms.yaml` Cooley migration.

## Next Phase Readiness

- Plan 09-03 can import `scrapeSitemap` from `src/scrapers/sitemap.js` and wire it into `src/pipeline/fetch.ts` dispatch (`case 'sitemap'`) without any other prep.
- Plan 09-03 Task 4 must replace the interim `case 'sitemap':` stub in `src/audit/firmAudit.ts` (seeded by plan 09-01) with a real `probeSitemapFirm` helper that invokes `scrapeSitemap` against the configured Cooley URL and returns a probe row based on item count + first item URL.
- `DEFAULT_LATEST_N = 10` is exported from `src/scrapers/sitemap.ts` — `firms.yaml` Cooley entry can explicitly set `latest_n: 10` per CONTEXT D-06 (keep the field visible to non-developer editors) or omit it and inherit the scraper-layer default. Plan 09-03 D-05 should pick one.
- Error-message shapes are stable and classifier-coupled — `compose/templates.ts classifyError` does not need changes for Phase 9 (the sitemap error strings use the existing `HTTP {status}` / `no items` phrasing family).
- Threat model (T1-T8 in plan 09-02) shows no HIGH-severity residual risks; T1 (XXE) mitigation is cheerio-default-dependent but cheerio 1.2.0 is pinned in package.json.

## Self-Check: PASSED

**Files verified:**
- FOUND: src/scrapers/sitemap.ts (`scrapeSitemap` export, `DEFAULT_LATEST_N`, `context.request.get`, `cheerio.load(xml, { xml: true })`, `canonicalizeUrl(loc, firm.url)`, finally block; `decodeCharsetAwareFetch` occurrences = 0)
- FOUND: test/scrapers/sitemap.test.ts (11 `it(...)` cases; `scrapeSitemap cooley: HTTP 403`, `LegalNewsletterBot`, `Share Incentives Employees Uk` all present)
- FOUND: test/fixtures/cooley-post-sitemap.xml (10 `<url>`, 9 `<lastmod>`, 10 `https://www.cooleygo.com/`)

**Commits verified:**
- FOUND: 7dfcfd0 (Task 1: fixture)
- FOUND: e8fb49a (Task 2: sitemap.ts + Rule 1 rewording bundled)
- FOUND: f93b78d (Task 3: tests)

**Acceptance gates verified:**
- `pnpm tsc --noEmit` exits 0
- `pnpm vitest run test/scrapers/sitemap.test.ts test/scrapers/jsRender.test.ts test/config/schema.test.ts` → 53/53 pass (11 sitemap + 8 jsRender + 34 schema)
- `pnpm vitest run` full-suite regression → 391/391 pass across 29 files (exactly 380 pre-plan-02 baseline + 11 new sitemap tests)

---
*Phase: 09-cooley-sitemap-tier*
*Completed: 2026-04-21*
