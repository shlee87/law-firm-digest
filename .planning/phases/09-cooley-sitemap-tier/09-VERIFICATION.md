---
phase: 09-cooley-sitemap-tier
verified: 2026-04-20T22:15:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 09: Cooley Sitemap Tier Verification Report

**Phase Goal:** Restore Cooley as an active monitored firm via a new `sitemap` tier that bypasses Cloudflare by fetching XML sitemaps directly, reusing the SPA-aware detail scraper from phase 7 for body extraction. The sitemap tier must be wired through the pipeline (fetch → enrich → run → audit), the Cooley firms.yaml entry must migrate to `type:sitemap`, and a live smoke test (`pnpm check:firm cooley`) must produce non-empty bodies without Cloudflare challenges.
**Verified:** 2026-04-20T22:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                 | Status     | Evidence                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/scrapers/sitemap.ts` parses `<url><loc><lastmod>` and returns top-N most recent URLs (desc)       | VERIFIED   | `src/scrapers/sitemap.ts:73` cheerio xml-mode load; `:82-90` loc+lastmod extraction; `:96-97` sort desc + slice(firm.latest_n ?? 10) |
| 2   | Sitemap-tier firms reuse the js-render detail path for body extraction                                 | VERIFIED   | `src/pipeline/enrichBody.ts:112-114` `needsPlaywrightDetail` OR-gate includes `firm.type === 'sitemap'`; routes through Playwright branch |
| 3   | FirmSchema accepts `type: sitemap` with `url` + optional `latest_n` (default 10 at scraper layer)      | VERIFIED   | `src/config/schema.ts:60` four-value enum; `:112` `latest_n: z.number().int().positive().optional()`; `src/scrapers/sitemap.ts:43` `DEFAULT_LATEST_N = 10` |
| 4   | Cooley migrated to `type: sitemap` in config/firms.yaml with CF-blocked RSS removed                    | VERIFIED   | `config/firms.yaml:67-74` id=cooley, type=sitemap, url=`https://www.cooleygo.com/post-sitemap.xml`, enabled=true, latest_n=10; no `/feed/` entries remain |
| 5   | `pnpm check:firm cooley` reports N>0 items with non-empty bodies and no CF challenges                  | VERIFIED   | `SITEMAP-05-smoke.txt`: "cooley: 10 items (636ms)", "cooley: 10/10 bodies"; no 403/Cloudflare signals in output             |
| 6   | Sitemap tier is wired through pipeline — fetch.ts dispatch case exists                                 | VERIFIED   | `src/pipeline/fetch.ts:86-93` case 'sitemap' with browser guard; imports `scrapeSitemap` line 40                            |
| 7   | run.ts hasJsRender gate launches chromium for sitemap-only runs                                        | VERIFIED   | `src/pipeline/run.ts:164-169` three-term OR predicate includes `f.type === 'sitemap'`                                       |
| 8   | firmAudit.ts has real `probeSitemapFirm` helper (replaces plan-01 interim stub) + switch case          | VERIFIED   | `src/audit/firmAudit.ts:204-245` probeSitemapFirm mirrors probeJsRenderFirm; `:285` switch case; `:256` hasJsRender OR-extension |
| 9   | Existing rss/html/js-render firms unaffected — full regression suite passes                            | VERIFIED   | `pnpm vitest run` → 394/394 pass across 29 files; `pnpm tsc --noEmit` exits 0                                              |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                                  | Expected                                                       | Status     | Details                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `src/types.ts`                                            | FirmType extended with 'sitemap'; FirmConfig.latest_n           | VERIFIED   | Line 24 `FirmType = 'rss' \| 'html' \| 'js-render' \| 'sitemap'`; line 58 `latest_n?: number`     |
| `src/config/schema.ts`                                    | Four-value enum + latest_n + three-branch superRefine           | VERIFIED   | Lines 60, 112, 115-169 (enum + field + superRefine with sitemap gates + latest_n exclusivity)     |
| `src/scrapers/sitemap.ts`                                 | scrapeSitemap + DEFAULT_LATEST_N; browser-HTTP + cheerio xml    | VERIFIED   | 128 lines; `context.request.get` line 61; `cheerio.load(xml, { xml: true })` line 73; finally block line 69 |
| `test/scrapers/sitemap.test.ts`                           | 11 offline vitest cases                                         | VERIFIED   | Confirmed by full-suite pass (394/394)                                                            |
| `test/fixtures/cooley-post-sitemap.xml`                   | 10 url entries, 9 with lastmod, Yoast namespaces                | VERIFIED   | File exists; fixture consumed by sitemap.test.ts                                                  |
| `src/pipeline/fetch.ts`                                   | `case 'sitemap'` dispatch + TS never exhaustiveness             | VERIFIED   | Line 40 import; lines 86-93 case; lines 94-99 never branch                                         |
| `src/pipeline/enrichBody.ts`                              | `needsPlaywrightDetail` OR-gate including `type === 'sitemap'`  | VERIFIED   | Lines 112-114                                                                                      |
| `src/pipeline/run.ts`                                     | hasJsRender OR-extended with sitemap                            | VERIFIED   | Lines 164-169                                                                                      |
| `src/audit/firmAudit.ts`                                  | probeSitemapFirm + hasJsRender extension + switch case          | VERIFIED   | Lines 204-245 (probe), 256 (gate), 285 (switch)                                                    |
| `config/firms.yaml`                                       | Cooley migrated to sitemap tier; latest_n:10; enabled:true       | VERIFIED   | Lines 67-74                                                                                        |
| `.planning/backlog/resolved/cooley-cf-bypass.md`          | Backlog file moved (D-07)                                       | VERIFIED   | File present at new path; absent from old path                                                    |
| `.planning/backlog/resolved/README.md`                    | Directory convention README                                     | VERIFIED   | File exists                                                                                        |
| `.planning/phases/09-cooley-sitemap-tier/SITEMAP-05-smoke.txt` | Live smoke evidence                                         | VERIFIED   | 14-line output: 10 items, 10/10 bodies, no CF signals                                             |

### Key Link Verification

| From                          | To                                    | Via                                                             | Status | Details                                                                      |
| ----------------------------- | ------------------------------------- | --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `src/pipeline/fetch.ts`       | `src/scrapers/sitemap.ts`             | `case 'sitemap' → scrapeSitemap(firm, browser)`                  | WIRED  | Line 92 `raw = await scrapeSitemap(firm, browser)`                           |
| `src/pipeline/enrichBody.ts`  | playwright detail fetch branch         | `needsPlaywrightDetail = detail_tier==='js-render' \|\| type==='sitemap'` | WIRED  | Lines 112-114                                                                |
| `src/pipeline/run.ts`         | chromium launch                        | `hasJsRender.some(f => f.type === 'sitemap' \|\| …)`             | WIRED  | Lines 164-169                                                                |
| `src/scrapers/sitemap.ts`     | playwright Browser                    | `browser.newContext({userAgent}).request.get(firm.url)`          | WIRED  | Lines 58-61                                                                  |
| `src/scrapers/sitemap.ts`     | cheerio xml parser                    | `cheerio.load(xml, { xml: true }) + $('url').each`               | WIRED  | Lines 73, 82                                                                 |
| `src/scrapers/sitemap.ts`     | canonicalizeUrl                        | `item loc → canonicalizeUrl(loc, firm.url)`                      | WIRED  | Line 102                                                                     |
| `src/audit/firmAudit.ts`      | `scrapeSitemap`                        | `case 'sitemap': probeSitemapFirm(firm, browser!)`               | WIRED  | Line 285 → probeSitemapFirm → scrapeSitemap call line 210                    |
| `config/firms.yaml` (Cooley)  | Cooley sitemap endpoint               | `type: sitemap + url: https://www.cooleygo.com/post-sitemap.xml` | WIRED  | Lines 70-71                                                                  |

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable                    | Source                                    | Produces Real Data   | Status   |
| ------------------------- | -------------------------------- | ----------------------------------------- | -------------------- | -------- |
| `sitemap.ts` → RawItem[]  | entries → topN slice              | Live XML via `context.request.get`         | Yes (10 items live)  | FLOWING  |
| `enrichBody.ts` → body    | `hydratedBody = extractBody(html)` | Playwright page.content() on detail URL    | Yes (10/10 bodies)   | FLOWING  |
| `firms.yaml` (Cooley)     | `url` + `latest_n`                | Static YAML                                 | Yes (real sitemap URL) | FLOWING  |

Live smoke evidence confirms end-to-end data flow: fetch 10 items (636ms) → enrich 10/10 bodies → filter 10 → dedup 6 new → would-summarize 6 items. No empty-body or CF-challenge fallback fired.

### Behavioral Spot-Checks

| Behavior                                    | Command                                  | Result                                            | Status |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------- | ------ |
| TypeScript compiles without errors          | `pnpm tsc --noEmit`                      | Exit code 0                                       | PASS   |
| Full test suite passes                      | `pnpm vitest run`                        | 394/394 tests pass across 29 files                | PASS   |
| Sitemap tier dispatches in fetch.ts         | Test: "sitemap tier dispatches to scrapeSitemap with browser threaded" | Passed | PASS   |
| Sitemap tier requires browser guard         | Test: "sitemap tier without browser → caught into error result" | Passed | PASS   |
| Sitemap tier routes to Playwright detail    | Test: "sitemap tier routes to Playwright detail path even without explicit detail_tier" | Passed | PASS   |
| Cooley live smoke produces non-empty bodies | `pnpm check:firm cooley`                  | "cooley: 10 items (636ms)", "cooley: 10/10 bodies" | PASS   |
| No CF-challenge signals in smoke output     | `grep -i "403\|Cloudflare" SITEMAP-05-smoke.txt` | Zero matches                            | PASS   |

### Requirements Coverage

| Requirement | Source Plan      | Description                                                                                              | Status     | Evidence                                                                                  |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| SITEMAP-01  | 09-02-PLAN       | `src/scrapers/sitemap.ts` parses `<url><loc><lastmod>` and returns top-N most recent URLs (desc)          | SATISFIED  | `src/scrapers/sitemap.ts:73-97` cheerio xml parse + sort desc + slice; 11 offline tests    |
| SITEMAP-02  | 09-03-PLAN       | Sitemap-tier firms reuse js-render detail path                                                            | SATISFIED  | `enrichBody.ts:112-114` OR-gate; test "sitemap tier routes to Playwright detail path"     |
| SITEMAP-03  | 09-01-PLAN       | Schema accepts `type: sitemap` with required `url` + optional `latest_n` (default 10)                     | SATISFIED  | `schema.ts:60,112,115-169`; `sitemap.ts:43` DEFAULT_LATEST_N = 10; 7 schema tests          |
| SITEMAP-04  | 09-03-PLAN       | Cooley migrated to `type: sitemap` at `https://www.cooleygo.com/post-sitemap.xml`, `enabled: true`, CF-blocked RSS removed | SATISFIED  | `firms.yaml:67-74`; `grep "cooleygo.com/feed/"` returns 0; enabled=true                   |
| SITEMAP-05  | 09-03-PLAN       | `pnpm check:firm cooley` reports N>0 items and non-empty body                                             | SATISFIED  | `SITEMAP-05-smoke.txt`: 10 items, 10/10 bodies, no CF challenge                           |

All 5 declared requirements SATISFIED. No orphaned requirements — REQUIREMENTS.md maps exactly these 5 IDs to Phase 9.

### Anti-Patterns Found

| File                          | Line | Pattern                             | Severity | Impact                                                                          |
| ----------------------------- | ---- | ----------------------------------- | -------- | ------------------------------------------------------------------------------- |
| —                             | —    | —                                   | —        | No blockers, warnings, or notable anti-patterns detected across modified files  |

File-by-file scan of the 6 production src files modified + `config/firms.yaml` produced no TODO/FIXME/PLACEHOLDER, no empty returns, no hardcoded empty props flowing to rendering, and no console.log-only handlers. The `try { return X } catch { return item }` patterns in enrichBody.ts are intentional per-item isolation (documented in header comment lines 28-34).

### Human Verification Required

None. All must-haves satisfied programmatically. The SITEMAP-05 live smoke already captured human-visible evidence (10/10 bodies, no CF challenges) in `SITEMAP-05-smoke.txt` committed as `872dec7`.

### Gaps Summary

No gaps. Phase 9 achieves its stated goal:

1. Cooley is restored as an active monitored firm — `enabled: true` in `config/firms.yaml`.
2. New `sitemap` tier bypasses Cloudflare via Playwright browser-HTTP (`context.request.get`) — D-16 revision confirmed by live smoke returning HTTP 200 with 10 items in 636ms.
3. SPA-aware detail scraper from Phase 7 is reused via `needsPlaywrightDetail` OR-gate in enrichBody.ts — no sitemap-specific detail logic per D-02.
4. Pipeline wiring complete across fetch → enrich → run → audit — four-tier symmetry maintained.
5. Live smoke `pnpm check:firm cooley` produced non-empty bodies (10/10) without Cloudflare challenges.
6. Full regression: 394/394 tests pass, `tsc --noEmit` clean. All 5 SITEMAP-* requirements satisfied.

Phase 9 is CLOSED.

---

_Verified: 2026-04-20T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
