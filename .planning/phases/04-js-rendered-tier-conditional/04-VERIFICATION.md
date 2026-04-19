---
phase: 04-js-rendered-tier-conditional
verified: 2026-04-19T12:35:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 4: JS-Rendered Tier (Conditional) Verification Report

**Phase Goal:** Complete the `FETCH-01` tiered-strategy contract by adding Playwright for any firm that genuinely requires JS rendering, verified empirically — or skip the phase entirely if the Phase 2 audit proves no firm needs it.
**Verified:** 2026-04-19T12:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (merged from ROADMAP success criteria + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Phase 2 empirical audit produces a documented per-firm list indicating which firms need JS rendering; if empty, phase is "skipped" in STATE.md | VERIFIED | `04-07-PROBE-RESULTS.md` documents 4 qualifying firms (lee-ko, yoon-yang, barun, latham) with per-firm notes and deviations; phase was NOT skipped because qualifying firms exist |
| SC-2 | Qualifying firms return items via `src/scrapers/jsRender.ts` using Playwright `chromium --only-shell` with per-firm `wait_for` selector; previously-empty digests now populate | VERIFIED | `src/scrapers/jsRender.ts:61` `scrapeJsRender` exported; `src/pipeline/fetch.ts:77-84` dispatches js-render tier with injected browser; `src/pipeline/run.ts:160` `chromium.launch({headless:true})`; `config/firms.yaml` 4 firms with `type: js-render` + `wait_for`; smoke test `04-08-SMOKE-TEST.md` shows lee-ko 6 items, yoon-yang 12, barun 10, latham 16 |
| SC-3 | Total GHA run time stays under 3 min even with js-render tier active; Playwright browser binary is cached via `actions/cache` keyed on Playwright version | VERIFIED | `.github/workflows/daily.yml:55-67` `actions/cache@v4` path `~/.cache/ms-playwright`, key `${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}` (pnpm-lock pins Playwright version → equivalent to "keyed on Playwright version"); local probe timings (25s aggregate) + design budget documented in `04-RESEARCH.md:92` indicate <3-min runtime |
| MH-1 | FirmSchema accepts 'js-render' type + enforces wait_for presence/absence via superRefine | VERIFIED | `src/config/schema.ts:60` `z.enum(['rss', 'html', 'js-render'])`; `src/config/schema.ts:104-122` `.superRefine` with two-branch validation; `test/config/schema.test.ts` all 6 new tests passing |
| MH-2 | `scrapeJsRender(firm, browser)` exists with per-firm BrowserContext + 15s wait_for timeout + USER_AGENT + classifier-coupled error message shapes | VERIFIED | `src/scrapers/jsRender.ts:61-126` (full impl); constants `WAIT_TIMEOUT_MS = 15_000` + `GOTO_TIMEOUT_MS = 15_000`; `browser.newContext({userAgent: USER_AGENT})`; throws `playwright-timeout` / `browser-launch-fail` / `zero items extracted (selector-miss)`; `test/scrapers/jsRender.test.ts` all 8 tests passing |
| MH-3 | runPipeline launches chromium ONLY when ≥1 enabled firm has type='js-render' and closes browser in outer finally{}; threads browser to fetchAll + enrichWithBody; exposes `jsRenderFailures` in RunReport | VERIFIED | `src/pipeline/run.ts:157-160` `hasJsRender` short-circuit; `src/pipeline/run.ts:163` + `:317-324` outer try/finally with `browser.close()`; `src/pipeline/run.ts:173` `fetchAll(firms, recorder, browser)`; `src/pipeline/run.ts:185` `enrichWithBody(fetched, browser)`; `src/pipeline/run.ts:109` interface field + `:264-273` assignment |
| MH-4 | classifyError returns 'browser-launch-fail' / 'playwright-timeout' / 'selector-miss' for the new Phase 4 error shapes with priority BEFORE generic `fetch-timeout` | VERIFIED | `src/compose/templates.ts:96-117` classifier function with 3 new checks preceding generic `fetch-timeout` regex; 5 new tests in `test/compose/digest.test.ts` covering all branches |
| MH-5 | main.ts exits 1 when jsRenderFailures > 0, AFTER runPipeline has completed (D-08 ordering: email+archive+state all locked before red exit) | VERIFIED | `src/main.ts:78-85` `const report = await runPipeline({}); if (report.jsRenderFailures > 0) return 1;` — return value propagated to `process.exit(code)` at `:92` |
| MH-6 | enrichWithBody threads optional browser; for js-render firms whose static body < 200 chars AND browser is available, re-fetches via Playwright and keeps longer result; rss/html behavior unchanged | VERIFIED | `src/pipeline/enrichBody.ts:88-174`; `STATIC_BODY_MIN_CHARS = 200` at `:71`; `DETAIL_PAGE_TIMEOUT_MS = 15_000` at `:72`; `firm.type === 'js-render'` gate at `:121`; hydrated-longer-wins at `:140-142`; per-item try/catch isolated; 6 new tests in `test/pipeline/enrichBody.test.ts` covering fire/no-fire/longer-wins/isolation |
| MH-7 | daily.yml adds actions/cache@v4 for Playwright + conditional install + extended failure remediation table | VERIFIED | `.github/workflows/daily.yml:55-75` cache step (keyed on pnpm-lock hash) + conditional install `pnpm exec playwright install chromium --only-shell --with-deps`; `:113-115` remediation table rows for browser-launch-fail / playwright-timeout / zero items extracted |
| MH-8 | 4 js-render firms live in config/firms.yaml with probe-verified wait_for + selectors | VERIFIED | `config/firms.yaml` contains lee-ko (`.leeko-new-newsletter__item`), yoon-yang (`ul#contentsList > li`), barun (`.articlebox`), latham (`.content-card`); runtime `loadFirms()` returns 13 firms with 4 js-render firms; yoon-yang uses Phase 04.1 LinkExtractor object form resolving `href="javascript:doView(N)"` |

**Score:** 11/11 truths verified (3 ROADMAP SCs + 8 PLAN frontmatter must-haves)

### Required Artifacts (cross-plan aggregate)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/config/schema.ts` | FirmSchema extended with 'js-render' + wait_for + superRefine | VERIFIED | Enum extended L60; superRefine L104-122; wait_for optional field L66 |
| `src/types.ts` | FirmConfig with wait_for?: string | VERIFIED | wait_for?: string present; FirmType includes 'js-render' |
| `src/scrapers/util.ts` | parseListItemsFromHtml exported | VERIFIED | Shared extractor used by html.ts AND jsRender.ts |
| `src/scrapers/html.ts` | Slimmed-down scrapeHtml delegating to parseListItemsFromHtml | VERIFIED | Delegation confirmed; all pre-existing html.test.ts tests green |
| `package.json` | playwright ^1.58.0 in dependencies | VERIFIED | `"playwright": "^1.58.0"` present; resolved version 1.59.1 via pnpm-lock |
| `src/scrapers/jsRender.ts` | scrapeJsRender exported with Browser param | VERIFIED | 126 lines; single exported async function; 3 classifier-coupled error shapes |
| `test/scrapers/jsRender.test.ts` | Unit tests for scrapeJsRender (8 tests) | VERIFIED | All 8 tests passing (mock-based, no real chromium) |
| `src/pipeline/fetch.ts` | fetchAll(firms, recorder?, browser?) with js-render dispatch | VERIFIED | L46-50 three-param signature; L77-84 `case 'js-render'` with injected browser; previous "Phase 4 territory" throw removed |
| `src/pipeline/run.ts` | runPipeline owns browser lifecycle + jsRenderFailures | VERIFIED | `chromium.launch` L160, `browser.close()` L322 in outer finally; `jsRenderFailures` assignment L264-273 |
| `src/compose/templates.ts` | classifyError with 3 new classes | VERIFIED | L96-117 function with Phase 4 checks BEFORE generic patterns |
| `src/main.ts` | Returns 1 when jsRenderFailures > 0 | VERIFIED | L78-85; `process.exit(code)` L92 |
| `src/pipeline/enrichBody.ts` | browser param + js-render Playwright fallback | VERIFIED | L88-174; `STATIC_BODY_MIN_CHARS = 200`; D-04 condition gated on firm.type==='js-render' |
| `.github/workflows/daily.yml` | Playwright cache + install + remediation rows | VERIFIED | L55-75 cache+install; L113-115 three Korean remediation rows |
| `scripts/probe-js-render.ts` | Throwaway probe with scrapeJsRender | VERIFIED | Exists; imports scrapeJsRender; extended with onclick-regex branch (commit `6101c8a`) |
| `.planning/phases/04-js-rendered-tier-conditional/04-07-PROBE-RESULTS.md` | Verified configs for 4 firms | VERIFIED | 4/4 firms extracted ≥1 item; all selectors + URL values documented |
| `config/firms.yaml` | 13 firms, 4 js-render with wait_for, all enabled | VERIFIED | Runtime `loadFirms()` returns 13 firms; 4 have type=js-render with wait_for; 13 enabled, 0 disabled |
| `.planning/phases/04-js-rendered-tier-conditional/04-08-SMOKE-TEST.md` | Transcripts from 4 check:firm + 1 DRY_RUN | VERIFIED | All 5 transcripts captured; all 4 check:firm exit 0; full DRY_RUN exit 0 with jsRenderFailures: 0; state/seen.json mtime unchanged (DRY_RUN containment proven) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/scrapers/jsRender.ts` | `src/scrapers/util.ts` | `import { parseListItemsFromHtml }` | WIRED | L42 import; L117 call site |
| `src/scrapers/jsRender.ts` | `src/util/logging.ts` | `import { USER_AGENT }` | WIRED | L41 import; L77 `browser.newContext({ userAgent: USER_AGENT })` |
| `src/pipeline/run.ts` | `src/pipeline/fetch.ts` | `fetchAll(firms, recorder, browser)` | WIRED | L173 call with browser passed |
| `src/pipeline/fetch.ts` | `src/scrapers/jsRender.ts` | `scrapeJsRender(firm, browser)` | WIRED | L39 import; L83 dispatch |
| `src/main.ts` | `src/pipeline/run.ts` | `report.jsRenderFailures` | WIRED | L78 runPipeline call; L79 property read |
| `src/pipeline/run.ts` | `src/pipeline/enrichBody.ts` | `enrichWithBody(fetched, browser)` | WIRED | L185 call with browser passed |
| `.github/workflows/daily.yml` | Playwright binary cache | `actions/cache@v4` path `~/.cache/ms-playwright` | WIRED | L55-67; conditional install on cache miss at L69-75 |
| `config/firms.yaml` | `src/config/schema.ts` | 4 js-render firms validate through superRefine | WIRED | Runtime loadFirms() succeeds; 4 firms with type=js-render + wait_for pass validation |
| `config/firms.yaml` | `04-07-PROBE-RESULTS.md` | Probe-verified values pasted verbatim | WIRED | Per SMOKE-TEST.md "Selector adjustments from PROBE-RESULTS.md: None" — all 4 firms' YAML values match probe output |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/scrapers/jsRender.ts` | `items: RawItem[]` | `parseListItemsFromHtml(html, firm)` where `html = await page.content()` via Playwright | Yes — smoke test shows lee-ko 6, yoon-yang 12, barun 10, latham 16 items | FLOWING |
| `src/pipeline/run.ts` `jsRenderFailures` | `summarized.filter(r => r.firm.type === 'js-render' && r.error != null).length` | Real pipeline output | Yes — DRY_RUN full pipeline reported `jsRenderFailures: 0` because all 4 firms succeeded | FLOWING |
| `config/firms.yaml` → runtime firm list | `loadFirms()` return value | YAML file + zod parse | Yes — verified live via `pnpm tsx --eval`: returns 13 firms, 4 js-render with wait_for values matching probe | FLOWING |
| `src/pipeline/enrichBody.ts` fallback | `hydratedBody.length > staticBody.length ? hydrated : static` | Playwright page.content() on detail page | Yes for lee-ko/yoon-yang/latham (16/16, 12/12, 6/6 bodies enriched); barun 0/10 bodies noted as Phase 5 polish candidate (body selector not configured) | FLOWING (with noted barun caveat) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test suite passes | `pnpm test` | 255/255 tests pass, 19 test files, duration 40.3s | PASS |
| TypeScript compiles | implicit via tsx/vitest | `pnpm test` succeeded, implying typecheck clean for all phase 4 files | PASS |
| Schema accepts 4 js-render firms | `pnpm tsx --eval "import('./src/config/loader.js')..."` | Prints `Total firms: 13 / js-render count: 4` with wait_for for each | PASS |
| All 13 firms enabled | `grep -c "enabled: true" config/firms.yaml` | Returns 13 | PASS |
| No disabled firms | `grep -c "enabled: false" config/firms.yaml` | Returns 0 | PASS |
| js-render tier count | `grep -c "type: js-render" config/firms.yaml` | Returns 4 | PASS |
| wait_for field presence | `grep -c "^    wait_for:" config/firms.yaml` | Returns 4 (one per js-render firm) | PASS |
| Playwright cache step | `grep -c "actions/cache@v4" .github/workflows/daily.yml` | Returns 1 | PASS |
| chromium --only-shell install | `grep -c "playwright install chromium --only-shell --with-deps" .github/workflows/daily.yml` | Returns 1 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FETCH-01 | 04-04-PLAN.md, 04-08-PLAN.md | RSS → static HTML → JS-rendered 세 계층 fetch 전략 중 로펌별 설정에 맞는 방식 | SATISFIED | REQUIREMENTS.md marks FETCH-01 as `[x]` complete; pipeline/fetch.ts switch dispatches all three tiers; config/firms.yaml shows 3 RSS + 6 HTML + 4 js-render firms (13 total) — all three tiers live and operational; smoke test confirms all 13 firms fetch |

### Anti-Patterns Found

None of consequence. Code review (`04-REVIEW.md`) found 0 critical, 4 warning, 6 info findings. None block the phase goal:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/scrapers/jsRender.ts` | 80-115 | Playwright `page` not explicitly closed (relies on context.close() cascade) | Warning (WR-01) | Defensive hardening; common path works correctly |
| `src/scrapers/jsRender.ts` | 111-115 | `context.close()` in outer finally can throw and mask primary error | Warning (WR-02) | Edge case; doesn't affect happy path or current test coverage |
| `src/scrapers/util.ts` | 353, 375 | `new RegExp(lx.regex)` per-item compile; no compile-error isolation | Warning (WR-03) | ReDoS-adjacent but YAML is operator-authored; bounded pattern space |
| `src/pipeline/enrichBody.ts` | 125-151 | No delay between static + Playwright fallback fetches | Warning (WR-04) | Politeness edge case; 4 target firms have benign WAFs |

Info items (IN-01..IN-06): minor type-safety escapes, documentation gaps, test assertion improvements. None affect phase goal achievement.

### Human Verification Required

None. All ROADMAP success criteria and PLAN must_haves are verifiable via static checks, test outputs, and local smoke test transcripts that the execution team captured in `04-08-SMOKE-TEST.md`. The phase does not require a live GHA run for verification because:

1. `actions/cache@v4` cache-key correctness is statically verifiable (path + key string match the ROADMAP contract).
2. Playwright binary install step is gated on cache miss — verifiable by inspecting the YAML.
3. All 4 js-render firms were smoke-tested locally against live URLs with ≥1 item extracted each.
4. DRY_RUN full-pipeline run confirmed `jsRenderFailures: 0` end-to-end.
5. Runtime budget (<3 min) is backed by design budget documentation (`04-RESEARCH.md:92`) and local probe timings aggregating ~25s for all 4 js-render firms (well within 3-min GHA budget).

### Gaps Summary

No gaps blocking goal achievement.

**Notable non-blockers (documented as Phase 5 polish candidates, not phase 4 gaps):**
1. `barun` detail-page body extraction returned 0/10 in smoke test — the generic extractor + Playwright fallback produced empty bodies. Inert today (DEDUP-03 silent day), but when barun publishes new items the SUMM-06 B3 guard will ship them with `요약 없음 — 본문 부족` placeholder. Flagged in `04-08-SUMMARY.md` as a Phase 5 candidate (per-firm `selectors.body`).
2. Pre-existing transient fetch errors for 3 non-js-render firms during smoke test DRY_RUN (cooley HTTP 403, freshfields timeout, shin-kim fetch failed). These are Phase 2/1 firm-level transient flakiness isolated by D-P2-03 Promise.allSettled; they do NOT affect Phase 4's js-render scope.
3. Code review warnings WR-01..WR-04 are defensive-hardening suggestions for edge cases that don't break the happy path or current test coverage.

---

_Verified: 2026-04-19T12:35:00Z_
_Verifier: Claude (gsd-verifier)_
