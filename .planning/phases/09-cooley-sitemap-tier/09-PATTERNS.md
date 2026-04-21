# Phase 9: Cooley Sitemap Tier - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 10 (6 MODIFY + 3 CREATE + 1 MOVE)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| CREATE `src/scrapers/sitemap.ts` | scraper (tier module) | request-response (browser.request.get + XML parse) | `src/scrapers/jsRender.ts` | exact (browser-injected scraper) |
| CREATE `test/scrapers/sitemap.test.ts` | test (fixture-based unit) | request-response | `test/scrapers/jsRender.test.ts` | exact (mock-browser pattern) |
| CREATE `test/fixtures/cooley-post-sitemap.xml` | fixture (XML) | static data | `test/fixtures/cooley.rss.xml` | role-match (tier data fixture) |
| MODIFY `src/config/schema.ts` | config validator | validate-on-load | (self — extend FirmSchema) | in-file pattern (Phase 4 superRefine) |
| MODIFY `src/pipeline/fetch.ts` | pipeline (tier dispatch) | request-response (switch) | (self — extend switch) | in-file pattern (js-render case) |
| MODIFY `src/pipeline/enrichBody.ts` | pipeline (detail gate) | request-response | (self — extend detail_tier branch) | in-file pattern (line 109 gate) |
| MODIFY `src/pipeline/run.ts` | composition root (hasJsRender gate) | orchestration | (self — extend line 161-163) | in-file pattern (gate extension) |
| MODIFY `src/types.ts` | type declaration | static | (self — extend FirmType union) | in-file pattern |
| MODIFY `src/audit/firmAudit.ts` | audit tier dispatch | request-response | (self — extend switch line 234 + hasJsRender line 210) | in-file pattern (mirrors fetch.ts) |
| MODIFY `config/firms.yaml` | config data | static | (self — replace Cooley block line 53-60) | in-file pattern |
| MOVE `.planning/backlog/cooley-cf-bypass.md` → `.planning/backlog/resolved/` | docs | static | new subdir convention | — |

## Pattern Assignments

### CREATE `src/scrapers/sitemap.ts` (scraper, request-response)

**Primary analog:** `src/scrapers/jsRender.ts` (browser-injected scraper with classifier-friendly error messages, context-owned-here discipline).

**Secondary analog:** `src/scrapers/rss.ts` (per-item parse loop, `canonicalizeUrl(loc, firm.url)` usage, minimal dependency imports).

**Header-comment pattern** (from `src/scrapers/jsRender.ts` lines 1-39):

```typescript
// JS-rendered scraper — Playwright-based tier-3 path (Phase 4, D-05 / D-12 / D-13).
//
// Sibling to src/scrapers/rss.ts and src/scrapers/html.ts. Consumes a FirmConfig
// where type='js-render' + wait_for is set (enforced by the zod superRefine in
// src/config/schema.ts after Phase 4 plan 01). Emits the same RawItem[] contract
// so downstream dedup / enrichBody / summarize / compose stay tier-agnostic.
//
// Browser lifecycle (D-05):
//   - browser is an INJECTED parameter, NOT a module singleton. The composition
//     root (src/pipeline/run.ts, plan 04) owns launch()+close(); we own only the
//     per-firm BrowserContext.
//   - browser.newContext({ userAgent }) per firm — cookies/storage isolated.
//
// Error message shapes (D-10, COUPLED to classifyError regex in
// src/compose/templates.ts; DO NOT modify without updating classifier in lockstep):
//   - 'scrapeJsRender {firm.id}: browser-launch-fail ...' — chromium launch failure
//   - 'scrapeJsRender {firm.id}: playwright-timeout waiting for {wait_for}' — selector timeout
//   - 'scrapeJsRender {firm.id}: zero items extracted (selector-miss)' — contract violation
```

Copy this docstring style verbatim — new error shapes for sitemap:
- `scrapeSitemap {id}: HTTP {status}` (non-OK fetch)
- `scrapeSitemap {id}: zero items extracted` (XML parsed but no usable entries)
- `scrapeSitemap {id}: malformed XML` (no `<urlset>` root)

**Imports pattern** (`src/scrapers/jsRender.ts` lines 40-43):

```typescript
import type { Browser } from 'playwright';
import { USER_AGENT } from '../util/logging.js';
import { parseListItemsFromHtml } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';
```

Sitemap equivalent: drop `parseListItemsFromHtml`, add `import * as cheerio from 'cheerio'` and `import { canonicalizeUrl } from './util.js'`.

**Function signature + browser-context lifecycle** (`src/scrapers/jsRender.ts` lines 61-115):

```typescript
const WAIT_TIMEOUT_MS = 15_000;
const GOTO_TIMEOUT_MS = 15_000;

export async function scrapeJsRender(
  firm: FirmConfig,
  browser: Browser,
): Promise<RawItem[]> {
  if (!firm.wait_for) {
    throw new Error(
      `scrapeJsRender ${firm.id}: wait_for is required for type='js-render' but was missing`,
    );
  }
  // ... (defense-in-depth schema guard) ...

  const context = await browser.newContext({ userAgent: USER_AGENT });
  let html: string;
  try {
    const page = await context.newPage();
    try {
      await page.goto(firm.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector(firm.wait_for, {
        timeout: WAIT_TIMEOUT_MS,
        state: 'attached',
      });
      html = await page.content();
    } catch (err) {
      // ... re-wrap with classifier-friendly prefix ...
    }
  } finally {
    // Always close context — prevents zombie browser contexts
    await context.close();
  }

  const items = parseListItemsFromHtml(html, firm);
  if (items.length === 0) {
    throw new Error(
      `scrapeJsRender ${firm.id}: zero items extracted (selector-miss) — ...`,
    );
  }
  return items;
}
```

**Sitemap adaptation (key differences):**
- Replace `page.goto → waitForSelector → page.content()` with `context.request.get(firm.url, { timeout: FETCH_TIMEOUT_MS })` (Playwright-HTTP, CF-bypass — per RESEARCH Pitfall 1 revision of D-16).
- Parse via `cheerio.load(xml, { xml: true })` instead of `parseListItemsFromHtml`.
- Preserve `finally { await context.close(); }` discipline verbatim.
- Preserve the "throw on zero items" stricter-than-html contract (jsRender.ts lines 117-124).

**RawItem emission pattern** (`src/scrapers/rss.ts` lines 89-96):

```typescript
items.push({
  firmId: firm.id,
  title: item.title ?? '(untitled)',
  url,                           // ← canonicalizeUrl(item.link, firm.url)
  publishedAt,                   // ← ISO UTC from absolute Date.toISOString()
  language: firm.language,
  description: item.description ?? item.summary ?? undefined,
});
```

**Canonicalize pattern** (`src/scrapers/rss.ts` line 83):

```typescript
const url = canonicalizeUrl(item.link ?? '', firm.url);
```

Apply **only to item `<loc>` URLs**, never to `firm.url` itself (preserves `www.` on sitemap fetch URL — RESEARCH Pitfall 4).

---

### CREATE `test/scrapers/sitemap.test.ts` (test, request-response)

**Primary analog:** `test/scrapers/jsRender.test.ts` (hand-rolled mock Browser/Context/Page cast to `never`).

**Header docstring** (`test/scrapers/jsRender.test.ts` lines 1-18):

```typescript
// Offline vitest coverage for src/scrapers/jsRender.ts.
//
// Deterministic by design — no real chromium binary required. A hand-rolled
// mock with the Browser / BrowserContext / Page API surface we actually use
// is cast to `never` at call sites to opt out of full-interface TS conformance.
// This is a test-scope disclaimer, not a runtime concern; production code
// (pipeline/run.ts, plan 04-04) will receive a real Browser.
```

**Fixture factory pattern** (`test/scrapers/jsRender.test.ts` lines 24-41):

```typescript
function makeFirm(overrides: Partial<FirmConfig> = {}): FirmConfig {
  return {
    id: 'lee-ko',
    name: '광장',
    language: 'ko',
    type: 'js-render',
    url: 'https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR',
    timezone: 'Asia/Seoul',
    enabled: true,
    wait_for: 'ul#contentsList > li',
    selectors: { list_item: 'ul#contentsList > li', title: '.title', link: 'a' },
    ...overrides,
  };
}
```

**Sitemap adaptation:**

```typescript
function makeFirm(overrides: Partial<FirmConfig> = {}): FirmConfig {
  return {
    id: 'cooley',
    name: 'Cooley',
    language: 'en',
    type: 'sitemap',
    url: 'https://www.cooleygo.com/post-sitemap.xml',
    timezone: 'America/Los_Angeles',
    enabled: true,
    latest_n: 10,
    ...overrides,
  };
}
```

**Mock-browser helper pattern** (`test/scrapers/jsRender.test.ts` lines 43-70) — swap `page.goto/content` for `context.request.get` response:

```typescript
function makeMockBrowser(opts: { xmlBody: string; status?: number }) {
  const response = {
    ok: vi.fn(() => (opts.status ?? 200) < 400),
    status: vi.fn(() => opts.status ?? 200),
    text: vi.fn().mockResolvedValue(opts.xmlBody),
  };
  const request = { get: vi.fn().mockResolvedValue(response) };
  const context = {
    request,
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = { newContext: vi.fn().mockResolvedValue(context) };
  return { browser, context, request, response };
}
```

**Cast-to-never invocation pattern** (jsRender.test.ts line 83):

```typescript
const items = await scrapeSitemap(makeFirm(), browser as never);
```

**Required test cases** (from RESEARCH Pattern 1 + jsRender.test.ts test structure):

1. Happy-path — fixture XML → top-N RawItem[] sorted by lastmod desc
2. `<url>` entries with missing `<lastmod>` are dropped (D-10)
3. Malformed XML (no `<urlset>` root) throws classifier-friendly message
4. Zero extractable entries throws `'scrapeSitemap {id}: zero items extracted'`
5. HTTP non-200 throws `'scrapeSitemap {id}: HTTP {status}'`
6. USER_AGENT sent via `newContext({ userAgent })` (assert substring `LegalNewsletterBot`)
7. `context.close()` called in finally (discipline preservation)
8. **Sitemap URL NOT canonicalized** — `request.get` invoked with verbatim `firm.url` preserving `www.` (RESEARCH Pitfall 4)

---

### CREATE `test/fixtures/cooley-post-sitemap.xml` (fixture, static data)

**Analog:** `test/fixtures/cooley.rss.xml` (role-match: per-firm per-tier offline fixture).

**Content sourcing:** Excerpt from live 2026-04-20 probe (RESEARCH "Live Cooley sitemap XML sample output: 41104 bytes, 233 `<url>` entries"). Target fixture size: ~10 `<url>` entries covering:
- ≥5 entries with valid `<lastmod>` spanning multiple dates (for sort verification)
- ≥1 entry with `<loc>` only, no `<lastmod>` (D-10 drop case)
- Preserve Yoast SEO namespace attrs on `<urlset>` for XML realism

**Expected lastmod format** (from RESEARCH): `2023-08-10T21:16:17+00:00` (ISO-8601 with offset, `new Date()` parseable).

---

### MODIFY `src/config/schema.ts` (config validator — FirmSchema extension)

**In-file analog pattern** (Phase 4 superRefine block, lines 110-128):

```typescript
.strict()
.superRefine((firm, ctx) => {
  if (firm.type === 'js-render') {
    if (!firm.wait_for || firm.wait_for.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firms[].wait_for is required when type === "js-render"',
        path: ['wait_for'],
      });
    }
  } else {
    if (firm.wait_for !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firms[].wait_for is only valid when type === "js-render"',
        path: ['wait_for'],
      });
    }
  }
});
```

**Changes to make (per RESEARCH Pattern 2):**

1. Line 60 `type` enum extension:
   ```typescript
   type: z.enum(['rss', 'html', 'js-render', 'sitemap']),
   ```

2. Add `latest_n` optional field (anywhere inside `.object({...})`):
   ```typescript
   latest_n: z.number().int().positive().optional(),
   ```

3. Extend superRefine with sitemap rules — preserve existing js-render branch; add:
   ```typescript
   if (firm.type === 'sitemap') {
     if (firm.wait_for !== undefined) { ctx.addIssue({ ... 'wait_for is only valid when type === "js-render"' ... }); }
     if (firm.selectors !== undefined) { ctx.addIssue({ ... 'selectors is not valid for type === "sitemap" (body hardcoded in Phase 9)' ... }); }
     if (firm.detail_tier !== undefined) { ctx.addIssue({ ... 'detail_tier is implicit for type === "sitemap"' ... }); }
   } else {
     if (firm.latest_n !== undefined) { ctx.addIssue({ ... 'latest_n is only valid when type === "sitemap"' ... }); }
   }
   ```

4. Restructure existing `else` for `wait_for` to accommodate the new sitemap branch (sitemap also forbids wait_for — but has its own issue message). Follow the existing if/else-if ladder style.

**Schema test pattern to mirror** (`test/config/schema.test.ts` lines 118-196 — Phase 4 js-render describe block):

```typescript
describe('FirmSchema (Phase 9 sitemap extensions)', () => {
  const sitemapBase = {
    id: 'cooley',
    name: 'Cooley',
    language: 'en' as const,
    type: 'sitemap' as const,
    url: 'https://www.cooleygo.com/post-sitemap.xml',
    timezone: 'America/Los_Angeles',
    enabled: true,
  };

  it('accepts type: sitemap with url and optional latest_n', () => { ... });
  it('accepts type: sitemap with latest_n absent (default at scraper level)', () => { ... });
  it('rejects sitemap firm with wait_for', () => { ... });
  it('rejects sitemap firm with selectors block', () => { ... });
  it('rejects sitemap firm with explicit detail_tier', () => { ... });
  it('rejects rss/html/js-render firm with latest_n', () => { ... });
  it('still enforces .strict() regression — unknown top-level field rejected', () => { ... });
});
```

---

### MODIFY `src/pipeline/fetch.ts` (pipeline — tier dispatch switch)

**In-file analog** — the existing `case 'js-render':` branch (lines 77-84) defines the browser-required-tier pattern:

```typescript
case 'js-render':
  if (!browser) {
    throw new Error(
      `firm ${firm.id}: js-render requires a launched Browser but none was provided — pipeline/run.ts should have passed one`,
    );
  }
  raw = await scrapeJsRender(firm, browser);
  break;
```

**Add after js-render case** (per RESEARCH "Updated fetch.ts tier dispatch"):

```typescript
case 'sitemap':
  if (!browser) {
    throw new Error(
      `firm ${firm.id}: sitemap tier requires a launched Browser but none was provided — pipeline/run.ts should have passed one`,
    );
  }
  raw = await scrapeSitemap(firm, browser);
  break;
```

**Import addition** (line 39 area):
```typescript
import { scrapeSitemap } from '../scrapers/sitemap.js';
```

**Default-branch upgrade** (lines 85-88, RESEARCH recommendation): swap `String(firm.type)` for TS `never` exhaustiveness:
```typescript
default: {
  const _exhaustive: never = firm.type;
  throw new Error(`firm ${firm.id}: unknown tier ${_exhaustive as string}`);
}
```

**Test pattern to mirror** (`test/pipeline/fetch.test.ts` lines 13-15, 56-60, 108-118):

```typescript
vi.mock('../../src/scrapers/sitemap.js', () => ({
  scrapeSitemap: vi.fn(),
}));

const sitemapFirm: FirmConfig = { ...rssFirm, id: 'sitemap-firm', type: 'sitemap', url: 'https://x/sitemap.xml', latest_n: 10 };

it('sitemap tier without browser → caught into error result', async () => {
  const out = await fetchAll([sitemapFirm]);
  expect(out[0].error!.message).toMatch(/sitemap tier requires a launched Browser/);
});
```

---

### MODIFY `src/pipeline/enrichBody.ts` (pipeline — detail_tier gate extension)

**In-file analog — existing gate** (line 109):

```typescript
if (r.firm.detail_tier === 'js-render' && browser) {
```

**Change to** (per RESEARCH Pattern 2 Option Y / Pitfall 6 fix):

```typescript
// Phase 9 D-05: sitemap tier is implicitly js-render detail (schema forbids
// explicit detail_tier on sitemap firms; OR-gate short-circuits zod's
// detail_tier='static' default firing for sitemap firms — see Pitfall 6).
const needsPlaywrightDetail =
  r.firm.detail_tier === 'js-render' || r.firm.type === 'sitemap';
if (needsPlaywrightDetail && browser) {
```

Rest of the branch body (lines 110-136) stays untouched — Playwright detail fetch, `extractBody(hydratedHtml, r.firm.selectors?.body)` (generic chain will hit `.post-content` for Cooley — RESEARCH Anti-Pattern "Hardcoding `.post-content`"), per-item try/catch, context.close in finally.

**Test addition** (in `test/pipeline/enrichBody.test.ts`):
- Sitemap firm → Playwright branch invoked even with `detail_tier` absent/unset.
- Sitemap firm body extraction uses generic `extractBody` chain (no `selectors.body` override needed).

---

### MODIFY `src/pipeline/run.ts` (composition root — hasJsRender gate)

**In-file analog** (lines 161-163):

```typescript
const hasJsRender = firms.some(
  (f) => f.type === 'js-render' || f.detail_tier === 'js-render',
);
```

**Change to** (RESEARCH Pattern 3):

```typescript
// Phase 9 D-05: sitemap tier also requires chromium (a) for CF-bypass on
// sitemap XML fetch via context.request.get, and (b) for js-render detail
// fetch in enrichBody (implicit per D-05 / Pitfall 6 OR-gate).
const hasJsRender = firms.some(
  (f) =>
    f.type === 'js-render' ||
    f.detail_tier === 'js-render' ||
    f.type === 'sitemap',
);
```

No other changes in `run.ts`. `fetchAll(firms, recorder, browser)` already threads browser (line 183); `enrichWithBody(fetched, browser)` already threads browser (line 195). Phase 9 only adds the launch-gate condition.

---

### MODIFY `src/types.ts` (type declaration)

**In-file analog** (line 24):

```typescript
export type FirmType = 'rss' | 'html' | 'js-render';
```

**Change to:**

```typescript
export type FirmType = 'rss' | 'html' | 'js-render' | 'sitemap';
```

**Also add to `FirmConfig` interface** (after line 51, near `wait_for`):

```typescript
latest_n?: number;  // sitemap tier only — top-N most-recent articles (default 10); schema superRefine enforces exclusivity
```

---

### MODIFY `src/audit/firmAudit.ts` (audit — tier dispatch + hasJsRender gate)

**In-file analog** — mirrors `fetch.ts` switch and `run.ts` gate.

**Gate extension** (line 210):

```typescript
// BEFORE
const hasJsRender = firms.some((f) => f.type === 'js-render');

// AFTER (Phase 9)
const hasJsRender = firms.some(
  (f) => f.type === 'js-render' || f.type === 'sitemap',
);
```

**Switch extension** (lines 234-242):

```typescript
switch (firm.type) {
  case 'rss':       return await probeRssFirm(firm);
  case 'html':      return await probeHtmlFirm(firm);
  case 'js-render': return await probeJsRenderFirm(firm, browser!);
  case 'sitemap':   return await probeSitemapFirm(firm, browser!);  // NEW
  default: {
    const _exhaustive: never = firm.type;
    throw new Error(`Unknown tier: ${_exhaustive as string}`);
  }
}
```

**New helper `probeSitemapFirm(firm, browser)`:** Mirror `probeJsRenderFirm` signature. Call `scrapeSitemap(firm, browser)` for list-phase audit, count items, return `AuditRow` via `makeRow` (same as `probeJsRenderFirm`). Without this, `pnpm audit:firms` crashes with `Unknown tier: sitemap` the moment Cooley re-enables.

---

### MODIFY `config/firms.yaml` (config data — Cooley block replacement)

**In-file analog** — the existing js-render firm blocks (e.g., lee-ko lines 224-244) demonstrate block shape; but the closer shape match is a minimal block without `selectors`.

**Current Cooley block** (lines 53-60, to be replaced):

```yaml
firms:
  - id: cooley
    name: Cooley
    language: en
    type: rss
    url: https://cooleygo.com/feed/
    timezone: America/Los_Angeles
    enabled: false  # disabled 2026-04-19 — cooleygo.com /feed/ CF-blocked (403). Restore after v1.1 sitemap tier lands. See .planning/backlog/cooley-cf-bypass.md
```

**Replacement** (RESEARCH Pattern 4):

```yaml
# ----- Sitemap-tier firm (1) — WordPress Cooley GO via post-sitemap.xml -----
# Phase 9 migration (2026-04-20): Cooley RSS endpoint (/feed/) was Cloudflare-
# challenge-blocked starting 2026-04-19. Phase 9 pivots to WordPress sitemap
# discovery: GET post-sitemap.xml via Playwright context.request.get →
# parse <url><lastmod> → top-N recent article URLs → Playwright detail fetch
# for .post-content body (generic extractBody chain). state key slug 'cooley'
# preserved (SeenState continuity — Phase 2 firms.yaml comment requirement).
# See .planning/backlog/resolved/cooley-cf-bypass.md for probe evidence.
  - id: cooley
    name: Cooley
    language: en
    type: sitemap
    url: https://www.cooleygo.com/post-sitemap.xml
    timezone: America/Los_Angeles
    enabled: true
    latest_n: 10  # top-N most-recent articles by <lastmod> (explicit per D-06)
```

**Preserve**: Header comment block lines 28-36 (Cooley main-site-vs-Cooley-GO rationale — still applicable).

**Header documentation update** (lines 13-16 — `type` field description): extend bullet list:

```yaml
#   type        : 수집 방식.
#                 - Phase 1: 'rss' 만 지원
#                 - Phase 2: 'html' 추가 (HTML 스크래핑)
#                 - Phase 4: 'js-render' 조건부 추가 (JS 렌더링 필요 시)
#                 - Phase 9: 'sitemap' 추가 (WordPress sitemap XML → top-N)
```

Add a new field description:

```yaml
#   latest_n    : (type: sitemap 전용) sitemap XML 에서 가져올 최신 article 수.
#                 생략 시 기본값 10.
```

---

### MOVE `.planning/backlog/cooley-cf-bypass.md` → `.planning/backlog/resolved/cooley-cf-bypass.md`

**Convention establishment:** `.planning/backlog/resolved/` doesn't exist yet (verified via `ls .planning/backlog/`). Create directory; move file; optional tiny README documenting convention ("files here are resolved backlog items — see git log for phase-completion reference"). Claude's Discretion per D-07.

---

## Shared Patterns

### Pattern A: Error Messages Coupled to classifyError

**Source:** `src/scrapers/jsRender.ts` lines 22-38 (header comment).

**Apply to:** `src/scrapers/sitemap.ts`.

Error messages MUST begin `scrapeSitemap {firm.id}: ...` so `classifyError` in `src/compose/templates.ts` can assign the correct `errorClass` label in the email footer + step-summary. **DO NOT modify without updating the classifier regex in lockstep.**

Specific shapes:

```typescript
throw new Error(`scrapeSitemap ${firm.id}: HTTP ${status}`);
throw new Error(`scrapeSitemap ${firm.id}: zero items extracted`);
throw new Error(`scrapeSitemap ${firm.id}: malformed XML (no <urlset> root)`);
```

### Pattern B: Per-firm Context Discipline (finally { context.close() })

**Source:** `src/scrapers/jsRender.ts` lines 77-115 (`context = await browser.newContext`; `try { ... } finally { await context.close(); }`).

**Apply to:** `src/scrapers/sitemap.ts`.

Every `browser.newContext()` MUST be balanced by `await context.close()` in a `finally` block. Prevents zombie-context accumulation across firms. Mirror this pattern exactly.

### Pattern C: RawItem Shape Invariant

**Source:** `src/scrapers/rss.ts` lines 89-96 + `src/types.ts` lines 68-75.

**Apply to:** `src/scrapers/sitemap.ts` return value.

Every scraper returns `RawItem[]` with shape:
```typescript
{
  firmId: string;
  title: string;          // MUST be non-empty (Pitfall 3/5)
  url: string;            // canonicalizeUrl(loc, firm.url)
  publishedAt?: string;   // ISO UTC
  language: 'ko' | 'en';  // inherited from firm.language
  description?: string;   // optional at list-phase; enrichBody fills later
}
```

**Title note (RESEARCH Open Question 1):** Sitemap XML lacks `<title>`. Options A/B/C in RESEARCH must be resolved by planner/user in plan-phase. Pattern mapper flags: whichever option is chosen, `title.length > 0` is mandatory to satisfy Pitfall 5 + downstream compose renderer.

### Pattern D: canonicalizeUrl Scope

**Source:** `src/scrapers/util.ts` lines 92-122 + RESEARCH Pitfalls 2, 4.

**Apply to:** `src/scrapers/sitemap.ts`.

- ✅ Call `canonicalizeUrl(loc, firm.url)` on each item `<loc>` URL — feeds dedup state.
- ❌ DO NOT call `canonicalizeUrl(firm.url)` before the sitemap XML fetch — `canonicalizeUrl` strips `www.`, which breaks TLS on Cooley's cert (same issue bit bkl/kim-chang in 07-05/06). Pass `firm.url` verbatim to `context.request.get()`.

### Pattern E: Browser Injection, Not Ownership

**Source:** `src/scrapers/jsRender.ts` header lines 8-15 ("Browser lifecycle D-05").

**Apply to:** `src/scrapers/sitemap.ts`, `src/audit/firmAudit.ts#probeSitemapFirm`.

Scrapers receive `browser: Browser` as an injected parameter. `run.ts` owns `chromium.launch()` / `browser.close()` via `hasJsRender` gate. Sitemap tier extends the gate (Pattern 3 in RESEARCH). Scrapers MUST NOT call `browser.close()`.

### Pattern F: Schema superRefine Chain (not discriminatedUnion)

**Source:** `src/config/schema.ts` lines 110-128 — Phase 4 locked decision.

**Apply to:** `src/config/schema.ts` FirmSchema extension.

Add branches to the existing superRefine callback rather than switching FirmSchema to `z.discriminatedUnion(...)`. Phase 4 rationale (avoid duplicating shared fields across 4 variants) applies with equal or greater force at 4 tiers. Keep schema test block (`describe('FirmSchema (Phase 9 sitemap extensions)')`) parallel to the Phase 4 describe block in `test/config/schema.test.ts` lines 118-196.

### Pattern G: Generic extractBody Chain — No Hardcoded Selector

**Source:** `src/scrapers/util.ts` lines 267-274 — BODY_SELECTOR_CHAIN includes `.post-content`.

**Apply to:** enrichBody.ts Playwright branch for sitemap firms.

**D-11's intent of "`.post-content` 하드코딩" is satisfied automatically** by the generic chain. Sitemap firms should NOT declare `selectors.body` in firms.yaml (schema forbids any `selectors` block for sitemap tier anyway). `extractBody(hydratedHtml, undefined)` walks the chain, hits `.post-content`, returns body text — no tier-specific code path required. RESEARCH Assumption A2 — probe-verified during plan-phase.

---

## No Analog Found

None. Every file touched has either an exact or in-file analog.

## Metadata

**Analog search scope:** `src/scrapers/`, `src/pipeline/`, `src/config/`, `src/audit/`, `test/scrapers/`, `test/config/`, `test/pipeline/`, `test/fixtures/`, `config/`, `.planning/backlog/`.

**Files scanned:** 22 (src + test + config).

**Pattern extraction date:** 2026-04-20.

**Canonical refs consumed:** `.planning/phases/09-cooley-sitemap-tier/09-CONTEXT.md`, `.planning/phases/09-cooley-sitemap-tier/09-RESEARCH.md` (including D-16 revision, Pitfall 6 OR-gate fix, Pattern 1/2/3/4, Code Examples).
