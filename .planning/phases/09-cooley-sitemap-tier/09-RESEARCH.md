# Phase 9: Cooley Sitemap Tier - Research

**Researched:** 2026-04-20
**Domain:** WordPress sitemap XML parsing + Cloudflare-bypassing detail fetch via Playwright
**Confidence:** HIGH (integration contract verified against live probes + existing code; one critical revision to CONTEXT D-16 flagged)

## Summary

Phase 9 introduces a new `type: sitemap` scraper tier that reads Cooley's WordPress `post-sitemap.xml` to discover recent article URLs, then reuses Phase 7's `detail_tier: 'js-render'` Playwright path to extract article body text. All surrounding infrastructure (robots gate, per-firm Promise.allSettled isolation, pLimit(3) cross-firm cap, pLimit(1)+500ms intra-firm delay, per-item BrowserContext, state key stability) is already in place and requires zero modification. The planner's job is primarily: (1) add one zod variant to FirmSchema, (2) add one switch case to `fetch.ts`, (3) add one new scraper module, (4) migrate the Cooley YAML block.

**ONE CRITICAL REVISION TO CONTEXT.md REQUIRED:** Decision D-16 states "sitemap XML fetch는 기존 `decodeCharsetAwareFetch` 재사용". This is **no longer correct as of 2026-04-20 live probe**. Cloudflare has extended the managed-challenge to the sitemap XML endpoint when hit via Node's native `undici` fetch (3-for-3 HTTP 403 on fresh probes). Playwright's browser-HTTP request stack (`context.request.get()`) reliably returns HTTP 200 + 233 `<url>` entries across 3 fresh probes with the project's `LegalNewsletterBot/1.0` User-Agent — same UA that gets 403 from undici. The sitemap tier MUST fetch XML through a Playwright browser context, not `decodeCharsetAwareFetch`. Planner should plumb the browser handle into `scrapeSitemap(firm, browser)` analogous to `scrapeJsRender(firm, browser)`, and the `run.ts` `hasJsRender` gate must also flip to true when `firm.type === 'sitemap'`.

**Primary recommendation:** Clone `src/scrapers/jsRender.ts` as the structural template for `src/scrapers/sitemap.ts` (browser-injected, context-per-firm, cheerio XML parse, throws with classifier-friendly error shapes); reuse every piece of Phase 7 detail infrastructure unchanged.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 접근법 1 채택 — `src/scrapers/sitemap.ts` 신규 모듈로 분리된 tier. `type: sitemap`은 discriminated union의 독립 variant. (접근법 2 "기존 js-render에 sitemap 모드 추가"는 단일 tier 내 2가지 fetch 로직으로 복잡도 증가 — 거부됨.)
- **D-02:** sitemap tier는 **list 획득 전용**. Article body는 `enrichBody.ts`의 js-render path를 그대로 재사용 — sitemap tier만의 전용 detail scraping 로직 금지.
- **D-03:** `config/schema.ts`의 `type` enum을 `['rss', 'html', 'js-render', 'sitemap']`으로 확장. discriminatedUnion 사용 시 `SitemapFirmSchema` variant 추가.
- **D-04:** sitemap firm 필수 필드: `url` (sitemap XML URL — 예: `https://www.cooleygo.com/post-sitemap.xml`). 선택 필드: `latest_n` (default 10 — firm당 top-N 최근 article).
- **D-05:** sitemap firm은 `detail_tier` 필드를 가지지 않음 — **sitemap tier는 항상 js-render detail path를 강제함** (schema 레벨에서 implicit, 별도 필드로 노출 안 함).
- **D-06:** `config/firms.yaml` Cooley 블록 치환: `type: rss → sitemap`, `url: https://cooleygo.com/feed/ → https://www.cooleygo.com/post-sitemap.xml`, `enabled: false → true`, `latest_n: 10` 신규 추가, timezone `America/Los_Angeles` 유지, state key slug `cooley` 유지.
- **D-07:** CF bypass 주석과 `cooley-cf-bypass.md` backlog 파일은 Phase 9 완료 시 삭제하지 않고 `.planning/backlog/resolved/` 로 이동.
- **D-08:** XML 파싱은 **cheerio with `xmlMode: true`** (또는 shorthand `xml: true`) 사용 — 이미 프로젝트 의존성이고 `util.ts#extractBody`에 사용 패턴 존재. 새로운 라이브러리 추가 금지.
- **D-09:** 최근 N개 선별: `<url>` 노드의 `<lastmod>`를 파싱 → ISO date 기준 desc sort → `slice(0, latest_n)`. 추가 시간 윈도우 필터 없음.
- **D-10:** lastmod 누락된 `<url>` entry는 **drop** (sort ordering을 망가뜨리지 않도록). 경고 로그 남김.
- **D-11:** Body selector는 **`.post-content` 하드코딩** (sitemap tier 내부 상수). Cooley 외 firm이 sitemap tier로 들어오면 별도 phase에서 firm config의 `body_selector` 필드 도입 — Phase 9 범위 아님.
- **D-12:** 기존 `src/scrapers/util.ts#extractBody`의 selector-chain fallback 재사용 가능 여부 검토 필요 — 만약 `.post-content`가 이미 체인에 있다면 하드코딩 대신 해당 체인 활용. (Research 단계 확인 항목 — **RESOLVED BELOW**)
- **D-13:** 기존 politeness pattern 재사용 — 변경 없음: `fetch.ts`의 outer pLimit(3), `enrichBody.ts`의 per-firm pLimit(1) + 500ms 간격.
- **D-14:** sitemap tier도 robots.txt gate 통과 — `fetchRobots` + `isAllowed`를 tier dispatch 전에 호출.
- **D-15:** sitemap XML fetch 자체가 실패 (404/403/timeout)하면 → 기존 per-firm try/catch가 `FirmResult.error`로 캡처. **별도 재시도 전략 없음**.
- **D-16:** sitemap XML fetch는 기존 `decodeCharsetAwareFetch` 재사용 — User-Agent, If-Modified-Since 등 프로젝트 표준 헤더 자동 적용. **⚠ THIS DECISION IS CONTRADICTED BY 2026-04-20 LIVE PROBE — see `## Common Pitfalls → Pitfall 1` below. Planner must escalate to discuss-phase for revision before locking.**
- **D-17:** `src/scrapers/sitemap.test.ts` 신규 — fixture 기반 단위 테스트.
- **D-18:** schema.ts / fetch.ts 변경에 대한 regression 테스트.
- **D-19:** `pnpm check:firm cooley` manual smoke test — SITEMAP-05 acceptance criteria.

### Claude's Discretion

- 실제 sitemap.ts 함수 시그니처 (export 구조)
- Fixture 데이터 size (몇 개 `<url>` entry를 포함할지)
- `latest_n` 기본값 상수 정의 위치 (schema.ts vs sitemap.ts)
- SitemapFirmSchema의 zod superRefine 상세 (예: URL 형식 검증 깊이)
- Backlog file 이동 vs 삭제 경로 세부 (resolved/ 디렉토리 레이아웃)

### Deferred Ideas (OUT OF SCOPE)

- **Body selector 설정화**: Cooley 외 firm이 sitemap tier로 들어올 때 firm config의 `body_selector` 필드 도입.
- **sitemap_index.xml 중첩 지원**: Yoast SEO 등이 제공하는 sitemap index에서 post-sitemap을 자동 선택하는 로직.
- **시간 윈도우 필터**: "최근 N일" 기준 추가 필터링.
- **CF bypass generalization**: Playwright로 `/feed/` endpoint도 통과할 수 있는지 재조사.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SITEMAP-01 | `src/scrapers/sitemap.ts` parses `<url><loc><lastmod>` from XML sitemap URL and returns top-N most recent URLs (sorted by lastmod desc) | Verified cheerio `xml:true` parse over 233-entry Cooley sitemap; lastmod format `2023-08-10T21:16:17+00:00` round-trips via native `new Date()`; desc sort trivial on `.getTime()`. Module structure: clone `scrapers/jsRender.ts` (browser-injected), use `context.request.get()` to bypass CF. |
| SITEMAP-02 | Sitemap-tier firms reuse js-render detail path (Playwright + `.post-content` or firm-configured body selector) for article body extraction | Phase 7's `enrichBody.ts` already has the `detail_tier === 'js-render'` branch operational. Planner has two implementation paths to choose from — see `## Architecture Patterns → Pattern 3`. |
| SITEMAP-03 | `config/firms.yaml` schema accepts `type: sitemap` with required `url` (sitemap URL) and optional `latest_n` (default 10) | `FirmSchema.type` enum extension + superRefine rules. See `## Architecture Patterns → Pattern 2` for exact zod pattern. |
| SITEMAP-04 | Cooley migrated to `type: sitemap` pointing at `https://www.cooleygo.com/post-sitemap.xml` with `enabled: true`; CF-blocked RSS config removed | Exact YAML block patch spec in `## Architecture Patterns → Pattern 4`. Existing Phase 1 `# Phase 1 seed firm 주석` header comment block (lines 28–36 of firms.yaml) is about the old RSS seed decision and can stay — but the **inline disable comment on line 60** must be removed. |
| SITEMAP-05 | `pnpm check:firm cooley` reports N>0 items and non-empty extracted body for each sampled item | Live probe (2026-04-20) confirms Cooley article pages return 114kb HTML with `.post-content` class present via Playwright. Acceptance evidence: `pnpm check:firm cooley --debug` output pasted into SUMMARY. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sitemap XML download | Scraper (`src/scrapers/sitemap.ts`) | — | Network I/O via Playwright browser context (CF bypass). Mirrors `scrapeJsRender`. |
| XML parsing (loc + lastmod extraction) | Scraper (`src/scrapers/sitemap.ts`) | — | Pure cheerio `xml:true` parse. No external I/O after XML bytes are in hand. |
| Top-N selection by lastmod | Scraper (`src/scrapers/sitemap.ts`) | — | Pure sort + slice. Done before returning RawItem[]. |
| Tier dispatch (type='sitemap' → scrapeSitemap) | Pipeline (`src/pipeline/fetch.ts`) | — | Single-line switch case addition; rest of orchestration inherits from Phase 2. |
| robots.txt gate before XML fetch | Pipeline (`src/pipeline/fetch.ts`) | — | Gate is OUTSIDE the switch — already applies to sitemap tier automatically once case is added. No change required. |
| Detail body extraction (article HTML → body text) | Pipeline (`src/pipeline/enrichBody.ts`) | Scraper (`util.ts#extractBody`) | Phase 7's `detail_tier === 'js-render'` branch already does this. Only plumbing question: does sitemap tier auto-route, or does YAML need explicit `detail_tier: 'js-render'`? (D-05 says implicit; see Pattern 3 below.) |
| Browser lifecycle (chromium launch/close) | Pipeline (`src/pipeline/run.ts`) | — | Phase 4 D-05 contract preserved; `hasJsRender` gate must be extended to also flip true when `firm.type === 'sitemap'`. |
| Per-firm failure isolation | Pipeline (`src/pipeline/fetch.ts`) | — | `Promise.allSettled` + per-firm try/catch already captures sitemap fetch failures as `FirmResult.error`. No change required. |
| Dedup / summarize / email / state | Pipeline (existing) | — | Tier-agnostic downstream. RawItem shape from scrapeSitemap is identical to rss/html/js-render. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cheerio` | **1.2.0** (pinned in package.json) | XML parsing via `cheerio.load(xml, { xml: true })` | Already a dependency; used in `util.ts#extractBody`. Ports to v1.x with both `xml: true` shorthand AND `xmlMode: true` option supported simultaneously. Verified against Cooley sitemap (233 entries, all parsed correctly). [VERIFIED: live probe 2026-04-20 + node_modules/cheerio/package.json] |
| `playwright` | **^1.58.0** (resolved 1.59.1 in node_modules) | Browser-HTTP XML fetch (CF bypass) + detail page rendering (reused from Phase 4/7) | Only reliable CF bypass for `*.cooleygo.com` as of 2026-04-20. `context.request.get(url)` gives raw response body without the `page.content()` HTML-wrapper artifact. [VERIFIED: live probe — 3/3 success with LegalNewsletterBot UA via Playwright; 0/3 via undici/curl] |
| `zod` | **^4.3.6** (resolved 4.3.6) | `FirmSchema.type` enum extension + superRefine for tier-specific fields | Existing pattern: Phase 4 uses single-schema + superRefine (not `discriminatedUnion`). The codebase has explicitly chosen `.superRefine` for one-conditional-field cases (`wait_for` for js-render) — see `## Architecture Patterns → Pattern 2` for the precedent. CONTEXT D-03 mentions discriminatedUnion as an option but Claude's Discretion says shape is the researcher's call. [VERIFIED: src/config/schema.ts lines 110-128 + PROJECT decision "Phase 04-01: Single schema + superRefine chosen over discriminatedUnion"] |

### Supporting (all reused, zero new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-limit` | ^7.3.0 | Cross-firm concurrency cap (already applied by `fetch.ts`) | No change needed — sitemap tier inherits the outer pLimit(3) |
| `date-fns-tz` | ^3.2.0 | lastmod → UTC ISO (already used by `util.ts#parseDate`) | **Not strictly required** — Cooley lastmod is already ISO with offset (`2023-08-10T21:16:17+00:00`), so native `new Date(str).toISOString()` suffices for sort. No timezone normalization needed for top-N logic; `firm.timezone` (`America/Los_Angeles`) is only relevant if we ever surface lastmod in the digest. |
| `yaml` | ^2.8.3 | Config parsing (no change) | — |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cheerio xmlMode | `fast-xml-parser`, `sax`, `htmlparser2` direct | All are pointless since cheerio ALREADY wraps htmlparser2 with xml mode. Adding a new parser is a dep hit for identical functionality. CONTEXT D-08 locks cheerio. |
| Playwright for XML fetch | undici native `fetch` with elaborate header spoofing (`Sec-CH-UA-*`, etc.) | CF explicitly demands client hints per the 403 `accept-ch` header, and the challenge body is JS-based. Headers alone won't pass; stateful TLS/JS evaluation is required. Playwright trivially provides both. |
| zod `discriminatedUnion` | Single-schema + `superRefine` (current codebase precedent) | discriminatedUnion gives better TS narrowing but forces duplicating shared fields across 4 branches. The Phase 4 rationale (locked decision) applies with greater force at 4 variants than at 3. Researcher recommendation: **stay with superRefine**. |

**Version verification (npm view as of 2026-04-20):**
No new npm installs are required. Pinned versions in `package.json` are up to date with what the codebase already uses.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │  runPipeline (src/pipeline/run.ts)                  │
                    │  -- launches ONE chromium if any firm needs it --   │
                    └─────────────┬───────────────────────────────────────┘
                                  │ Browser handle
                  ┌───────────────┼─────────────────────────────────────┐
                  ▼                                                     ▼
    ┌───────────────────────────────┐               ┌──────────────────────────────────┐
    │  fetchAll (fetch.ts)          │               │  enrichWithBody (enrichBody.ts)  │
    │  -- per-firm Promise.allSettled, pLimit(3) --│  -- per-item pLimit(1), 500ms -- │
    │  -- robots.txt gate --        │               │  -- detail_tier branch --        │
    │                               │               │                                  │
    │  switch(firm.type) {          │               │  if detail_tier === 'js-render'  │
    │    case 'rss':     scrapeRss  │               │       → Playwright page.goto +   │
    │    case 'html':    scrapeHtml │               │         extractBody              │
    │    case 'js-render': scrapeJsRender(browser)  │   else                           │
    │    case 'sitemap': scrapeSitemap(browser) ★  │       → decodeCharsetAwareFetch  │
    │  }                            │               │         + extractBody            │
    └──────────┬────────────────────┘               └──────────────┬───────────────────┘
               │ RawItem[] (list only, no body)                    │ RawItem[] (body filled)
               │                                                   │
               ▼                                                   ▼
                                    [...dedup → summarize → compose → email → state...]

                      ★ = NEW IN PHASE 9

    Inside scrapeSitemap(firm, browser):
      1. browser.newContext({ userAgent: USER_AGENT })  ← inherits CF-bypass credentials
      2. context.request.get(firm.url, { timeout })      ← XML fetch (NOT undici)
      3. cheerio.load(xmlBody, { xml: true })            ← parse
      4. $('url').each(...) → collect {loc, lastmod?}
      5. drop entries with missing/unparseable lastmod (log warn)
      6. sort desc by Date(lastmod).getTime()
      7. slice(0, firm.latest_n ?? 10)
      8. map to RawItem[] with canonicalizeUrl(loc, firm.url)  ← see Pitfall 2
      9. context.close() (in finally)
```

### Recommended Project Structure

No new directories. Files touched:

```
src/
├── config/schema.ts            # extend FirmSchema.type enum + superRefine + type union
├── scrapers/sitemap.ts         # NEW — scrapeSitemap(firm, browser)
├── pipeline/fetch.ts           # add case 'sitemap' to switch
├── pipeline/run.ts             # extend hasJsRender gate: || firm.type === 'sitemap'
└── types.ts                    # add 'sitemap' to FirmType union; add latest_n to FirmConfig

test/
├── fixtures/cooley.sitemap.xml # NEW — real 2026-04-20 probe output (abridged ~10 urls)
├── scrapers/sitemap.test.ts    # NEW — parse/sort/slice/missing-lastmod/malformed cases
├── pipeline/fetch.test.ts      # ADD test for case 'sitemap' dispatch
└── config/schema.test.ts       # ADD test block for type: sitemap + latest_n defaults

config/
└── firms.yaml                  # replace Cooley block (line 54-60 + header comment line 28-36)

.planning/
└── backlog/
    └── resolved/
        └── cooley-cf-bypass.md # MOVE from .planning/backlog/ (D-07)
```

### Pattern 1: Sitemap scraper module — clone jsRender.ts structure

**What:** A browser-injected scraper that fetches XML via Playwright's context.request, parses it with cheerio xmlMode, and returns RawItem[] with tier-standard shape.

**When to use:** Phase 9's `src/scrapers/sitemap.ts` — this is the only sitemap tier scraper.

**Reference implementation skeleton (verify against Context7 before copying verbatim):**

```typescript
// src/scrapers/sitemap.ts
// Clone of jsRender.ts structure: browser-injected, context-owned-here, classifier-friendly errors.
//
// Error message shapes (COUPLED to classifyError in compose/templates.ts):
//   - 'scrapeSitemap {firm.id}: HTTP {status}' — sitemap XML fetch non-OK
//   - 'scrapeSitemap {firm.id}: zero items extracted' — XML parsed but <url> empty
//   - 'scrapeSitemap {firm.id}: malformed XML' — cheerio load failed or no <urlset>
//
import type { Browser } from 'playwright';
import * as cheerio from 'cheerio';
import { USER_AGENT } from '../util/logging.js';
import { canonicalizeUrl } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';

const FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_LATEST_N = 10;

export async function scrapeSitemap(
  firm: FirmConfig,
  browser: Browser,
): Promise<RawItem[]> {
  const context = await browser.newContext({ userAgent: USER_AGENT });
  let xml: string;
  let status: number;
  try {
    const res = await context.request.get(firm.url, {
      timeout: FETCH_TIMEOUT_MS,
    });
    status = res.status();
    if (!res.ok()) {
      throw new Error(`scrapeSitemap ${firm.id}: HTTP ${status}`);
    }
    xml = await res.text();
  } finally {
    await context.close();
  }

  // Parse with cheerio xmlMode. Prefer `xml: true` shorthand — equivalent
  // behavior to `xmlMode: true` in cheerio 1.2.0.
  const $ = cheerio.load(xml, { xml: true });
  if ($('urlset').length === 0) {
    throw new Error(`scrapeSitemap ${firm.id}: malformed XML (no <urlset> root)`);
  }

  const entries: { loc: string; lastmodMs: number }[] = [];
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    const lastmodRaw = $(el).find('lastmod').first().text().trim();
    if (!loc) return;
    if (!lastmodRaw) {
      // D-10: drop entries missing lastmod; keep them out of sort.
      // Minimal log — a quiet counter is fine.
      return;
    }
    const t = new Date(lastmodRaw).getTime();
    if (Number.isNaN(t)) return; // drop unparseable dates too
    entries.push({ loc, lastmodMs: t });
  });

  if (entries.length === 0) {
    throw new Error(`scrapeSitemap ${firm.id}: zero items extracted`);
  }

  entries.sort((a, b) => b.lastmodMs - a.lastmodMs);
  const topN = entries.slice(0, firm.latest_n ?? DEFAULT_LATEST_N);

  return topN.map(({ loc, lastmodMs }) => ({
    firmId: firm.id,
    title: '', // sitemap XML doesn't carry titles; detail fetch will populate later OR
               // accept title = loc's last pathname segment. Title is REQUIRED by
               // downstream — see Pitfall 5.
    url: canonicalizeUrl(loc, firm.url),
    publishedAt: new Date(lastmodMs).toISOString(),
    language: firm.language,
    description: undefined,
  }));
}
```

**IMPORTANT:** The skeleton above has an unresolved title question — the sitemap XML does NOT carry article titles, only URLs. Downstream `RawItem.title` is consumed by `compose/digest.ts` as the email section header per item. Three planner-options to resolve:

- **Option A:** Fall back to slug-derived title from the URL (`cooleygo.com/share-incentives-employees-private-uk-companies/` → `share-incentives-employees-private-uk-companies`, title-cased). Cheap, no additional network I/O. Ugly titles for some slugs.
- **Option B:** Title is populated by `enrichBody.ts` during the Playwright detail fetch via `page.title()`. Requires adding a title-write branch to `enrichBody.ts` — conflicts with D-02 ("sitemap tier만의 전용 detail scraping 로직 금지") unless interpreted as "enrichBody already handles titles for all tiers via detail-page title tag extraction" which is false — current enrichBody only writes description.
- **Option C:** Empty title `''` is tolerated by downstream; `compose/digest.ts` and `summarize/prompt.ts` fall back to a placeholder. **This is NOT TRUE** — verified by reading templates; empty titles would produce blank section headers.

**Recommendation:** Option A (URL-slug-derived title) is the cleanest Phase 9 scope respect. Gemini summaries will use the actual article body text (via Phase 7 Playwright detail path), so title quality is mostly cosmetic for the digest section header. Downside: slug-formatted titles look ugly (`Share Incentives For Private Uk Company Employees` with lowercase `uk`). Planner should present options A/B/C in plan-phase for user choice.

**[ASSUMED]** — The title-derivation approach is not specified in CONTEXT.md. This is an open decision that escaped the discuss-phase pass.

### Pattern 2: FirmSchema extension — superRefine, not discriminatedUnion

**What:** Extend `type` enum to `['rss', 'html', 'js-render', 'sitemap']`, add optional `latest_n`, and use `superRefine` to enforce tier-specific invariants.

**When to use:** `src/config/schema.ts` FirmSchema patch.

**Example (patterned on existing Phase 4 superRefine block):**

```typescript
// In src/config/schema.ts FirmSchema:
.object({
  // ... existing fields unchanged ...
  type: z.enum(['rss', 'html', 'js-render', 'sitemap']),
  // ... existing fields ...
  latest_n: z.number().int().positive().optional(), // only meaningful for sitemap, enforced below
  // ... existing fields ...
})
.strict()
.superRefine((firm, ctx) => {
  // Existing js-render/wait_for rules unchanged.
  if (firm.type === 'js-render') {
    if (!firm.wait_for) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'firms[].wait_for is required when type === "js-render"', path: ['wait_for'] });
    }
  } else if (firm.type !== 'sitemap') {
    // wait_for is forbidden for rss/html (existing rule, preserved).
    if (firm.wait_for !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'firms[].wait_for is only valid when type === "js-render"', path: ['wait_for'] });
    }
  }

  // Phase 9 SITEMAP rules:
  if (firm.type === 'sitemap') {
    // Sitemap firms MUST NOT carry wait_for, selectors, detail_tier (D-05).
    if (firm.wait_for !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'firms[].wait_for is only valid when type === "js-render", not sitemap', path: ['wait_for'] });
    }
    if (firm.selectors !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'firms[].selectors is not valid for type === "sitemap" (body selector hardcoded to .post-content in Phase 9)', path: ['selectors'] });
    }
    if (firm.detail_tier !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'firms[].detail_tier is implicit for type === "sitemap" (always js-render detail) — do not declare explicitly', path: ['detail_tier'] });
    }
  } else {
    // latest_n is sitemap-only.
    if (firm.latest_n !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'firms[].latest_n is only valid when type === "sitemap"', path: ['latest_n'] });
    }
  }
});
```

Alternative — remove `.default('static')` from `detail_tier` schema entry for sitemap firms: the existing `detail_tier: z.enum(['js-render', 'static']).default('static').optional()` means every firm (including sitemap) will get `detail_tier === 'static'` after zod parse. The production routing check in `enrichBody.ts` currently reads `r.firm.detail_tier === 'js-render'`. **If the zod default fires, sitemap firms will NOT route through Playwright detail path** — this would be a silent functional regression. Planner must either:

- **Option X:** Explicitly set `detail_tier` to `'js-render'` in the zod layer post-parse for type='sitemap' (via `.transform()` or a post-parse callback).
- **Option Y:** Change the `enrichBody.ts` gate to `r.firm.type === 'sitemap' || r.firm.detail_tier === 'js-render'` (explicit OR — simpler, more readable, matches the `run.ts` hasJsRender pattern verbatim).

**Recommendation:** Option Y. It requires a one-line change in `enrichBody.ts` line 109 and matches the Phase 7 hasJsRender pattern already in `run.ts:161-163`. Zero surprises. Option X adds schema complexity for no observable benefit. See Pitfall 6.

### Pattern 3: hasJsRender gate extension in run.ts

**What:** Phase 7 gate `firm.type === 'js-render' || firm.detail_tier === 'js-render'` must be extended to include `firm.type === 'sitemap'`.

**Example:**

```typescript
// src/pipeline/run.ts line 161-163:
const hasJsRender = firms.some(
  (f) =>
    f.type === 'js-render' ||
    f.detail_tier === 'js-render' ||
    f.type === 'sitemap',
);
```

This is a one-line patch. It ensures chromium launches when ANY sitemap firm is in scope — because (a) sitemap list-fetch requires browser.context.request.get for CF bypass, and (b) sitemap tier's detail fetch (reusing enrichBody's Playwright branch per Pattern 2 Option Y) also requires a browser.

### Pattern 4: Cooley YAML block replacement

**What:** Replace `config/firms.yaml` lines 54–60 (the current Cooley RSS block) with a sitemap block. Also update the header comment block (lines 28–36) that documents the Cooley seed firm decision.

**Example:**

```yaml
# ----- Sitemap-tier firm (1) — WordPress Cooley GO via post-sitemap.xml -----
# Phase 9 migration (2026-04-21): Cooley RSS endpoint (/feed/) was Cloudflare-
# challenge-blocked starting 2026-04-19. Phase 9 pivots to WordPress sitemap
# discovery: GET post-sitemap.xml → parse <url><lastmod> → top-N recent article
# URLs → Playwright detail fetch for .post-content body. state key slug 'cooley'
# preserved (SeenState continuity). See .planning/backlog/resolved/
# cooley-cf-bypass.md for 2026-04-19 probe evidence and full rationale.
  - id: cooley
    name: Cooley
    language: en
    type: sitemap
    url: https://www.cooleygo.com/post-sitemap.xml
    timezone: America/Los_Angeles
    enabled: true
    latest_n: 10  # top-N most-recent articles by <lastmod> (default 10; explicit for self-documentation per D-06)
```

**Critical:** The old inline disable comment (`# disabled 2026-04-19 — ... cf-blocked ...`) must be REMOVED, not kept. D-07 moves the entire backlog context to `.planning/backlog/resolved/cooley-cf-bypass.md`.

Also: **Lines 28–36 header comment** about "Cooley 의 메인 사이트 www.cooley.com ... Option B 채택" is still relevant context — keep it (describes why Cooley GO subsite is used, not Cooley mothership). The Phase 9 replacement only touches the active firm block.

### Anti-Patterns to Avoid

- **Reusing `decodeCharsetAwareFetch` for sitemap XML:** Will get HTTP 403 from CF starting 2026-04-20. D-16 is wrong as written. Use `browser.newContext().request.get()` instead.
- **Auto-following sitemap_index.xml nesting:** Explicitly deferred (CONTEXT.md Deferred Ideas). Cooley's `post-sitemap.xml` is a flat `<urlset>`; don't add index-resolution logic "just in case".
- **Hardcoding `.post-content` inside `scrapeSitemap`:** CONTEXT D-11 says Cooley-specific hardcoding is allowed, but the actual body extraction happens in `enrichBody.ts` via `extractBody($, firm.selectors?.body)` which already checks `.post-content` in its generic chain (util.ts:270). **No hardcoding needed in sitemap.ts at all** — D-12's open question is resolved: `.post-content` is already in the generic chain. The sitemap firm just passes through `firm.selectors?.body === undefined` and `extractBody` finds it via the generic chain.
- **Adding `selectors` block to Cooley YAML:** The generic `extractBody` chain finds `.post-content` natively. Adding `selectors.body: .post-content` would work but is redundant and violates "minimal config" spirit. Leave `selectors` absent.
- **Trying to use `scrapeJsRender` for the sitemap list fetch:** scrapeJsRender hardcodes `page.goto → waitForSelector(firm.wait_for)` — the wait_for field is forbidden for sitemap firms (Pattern 2 superRefine). scrapeJsRender is only for HTML list pages that hydrate via JS. Sitemap XML isn't HTML and doesn't hydrate.
- **Stripping `www.` from Cooley sitemap URL via canonicalizeUrl:** CONTEXT code_context explicitly warns against this. The sitemap URL `https://www.cooleygo.com/post-sitemap.xml` must be fetched AS-IS. Only the **item URLs** extracted from `<loc>` get passed to `canonicalizeUrl()` for the state dedup key. Verification needed: does `cooleygo.com` (without www) also work for article fetches? **[ASSUMED]** — the probe tested `www.cooleygo.com/share-...` which succeeded, but canonicalizeUrl would strip to `cooleygo.com/share-...`. Same TLS-cert failure pattern as bkl/kim-chang (07-05/07-06) is possible. Verify in plan 9 task before locking. See Pitfall 4.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XML parsing | Regex over XML, hand-rolled DOM traversal | `cheerio.load(xml, { xml: true })` | Cheerio+htmlparser2 handles XML namespaces (`xmlns:image`), CDATA, entity escaping, attribute order — landmines you'd hit immediately on real sitemaps with WordPress YOAST extensions. |
| CF bypass | Custom header spoofing, TLS JA3 fingerprint manipulation | `browser.newContext().request.get()` | Playwright is already in the stack for Phase 4/7. Rolling a TLS fingerprint forger is a multi-week project with compliance implications. |
| Top-N selection | Custom heap, incremental sort | Array.sort().slice() | N ≤ 10, array size ≤ ~250. O(N log N) sort cost is microseconds. No fancy algorithm is warranted. |
| Date parsing | Manual regex on ISO-8601 offsets | `new Date(lastmodStr).getTime()` | lastmod format is ISO-8601 with offset (`2023-08-10T21:16:17+00:00`) — native Date handles it. `date-fns-tz` is NOT needed since we don't re-anchor to a local firm timezone (we only compare .getTime() values for sort). |

**Key insight:** Phase 9 is almost entirely plumbing. 95% of the work is wiring existing modules together. The only genuinely new code is ~60 lines in `src/scrapers/sitemap.ts`, ~15 lines of schema additions, and ~5 one-line patches across 3 files.

## Runtime State Inventory

(Rename/refactor/migration phase — Cooley is migrating tier type from `rss` to `sitemap`.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **state/seen.json**: `firms.cooley.urls[]` contains 0–500 URLs canonicalized from the OLD RSS feed (cooleygo.com/feed/*). These were last written when Cooley was enabled pre-2026-04-19. After disable, lastUpdated but no new URLs added. When Phase 9 re-enables Cooley with sitemap tier, the NEW scrapeSitemap will produce URLs like `https://cooleygo.com/share-incentives-employees-private-uk-companies` (canonicalized). These may or may not match the pre-disable URL shapes — RSS likely pointed at the same permalinks. **Verify in planning**: are Cooley RSS URLs `https://cooleygo.com/insights/...` vs sitemap URLs `https://cooleygo.com/share-incentives.../`? Different slug = no dedup overlap = first Phase-9-post-merge run floods digest with up to 10 "new" items. **Action:** either (a) accept the one-time flood, or (b) add bootstrap-seed logic so the first sitemap-tier run seeds state without emitting. DEDUP-05 requirement is for "newly added firm" — Cooley isn't newly added (slug stays), but the seen-URL shape is effectively reset. Planner decision. | Data migration question — decide before execution |
| Live service config | None — no external services store Cooley-specific config for this project. Gmail SMTP / GitHub Actions secrets are agnostic. | None |
| OS-registered state | None — no cron/launchd/Task Scheduler entries reference "cooley" by name. GHA workflow reads firms.yaml dynamically. | None |
| Secrets/env vars | None — `GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`, `RECIPIENT_EMAIL` are firm-agnostic. | None |
| Build artifacts / installed packages | None — no compiled outputs embed firm names. Test fixtures (test/fixtures/cooley.rss.xml) may become stale but that's test-only. Consider keeping the fixture for rss.test.ts (other firms still run rss tier). **Action:** decide whether to delete `test/fixtures/cooley.rss.xml` once Cooley is no longer `type: rss`. If rss.test.ts only uses it for testing the RSS parser (not Cooley-specific behavior), keep as an "rss parser fixture" (rename for clarity is optional). | Code edit — rename or retain fixture |

**The canonical question:** After `config/firms.yaml` ships the tier change, what runtime systems still think Cooley is RSS? Answer: only `state/seen.json` via the previously-stored URLs. No other caches, registrations, or external configs carry the old tier assumption.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22+ (native fetch, ESM) | Runtime | ✓ | 23.6.1 (local) / lts/* (CI) | — |
| playwright | scrapeSitemap (browser.newContext.request.get), enrichBody (existing) | ✓ | 1.59.1 (resolved) | — |
| playwright chromium binary | Same | ✓ (installed locally via `playwright install chromium --only-shell`) | — | — |
| cheerio | XML parsing | ✓ | 1.2.0 | — |
| GitHub Actions outbound to www.cooleygo.com | Live CF bypass in production | **UNVERIFIED** | — | If GHA IP range is blocked despite Playwright UA, Cooley will re-error 403 in production. See Pitfall 7. |
| Local dev network outbound to www.cooleygo.com | `pnpm check:firm cooley` (SITEMAP-05 acceptance) | ✓ | — | — |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None — but GHA IP range behavior against CF is an unverified production risk (Pitfall 7).

## Common Pitfalls

### Pitfall 1: D-16 is wrong — undici fetch cannot bypass CF on Cooley sitemap endpoint (HIGH confidence)

**What goes wrong:** Following CONTEXT D-16 literally and using `decodeCharsetAwareFetch` to download the sitemap XML results in HTTP 403 + Cloudflare "Just a moment..." challenge HTML (verified 3x back-to-back on 2026-04-20 with the project's standard `LegalNewsletterBot/1.0` User-Agent). The scraper returns `[]` items and Cooley appears in the email footer as an `http-403` error. Phase 9 ships "working" in unit tests (fixture-based) but the very first cron run fails.

**Why it happens:** Cloudflare has rolled out the managed-challenge to the sitemap XML endpoint since the CONTEXT D-16 decision was made. The backlog doc's 2026-04-19 probe (which showed sitemap.xml returning 200) captured a state that no longer holds; CF's policy is dynamic. Meanwhile, Playwright's browser-context HTTP request (not `page.goto`, but `context.request.get()`) carries enough chromium-identifying TLS fingerprint + headers to pass CF's fingerprint-based filter.

**How to avoid:** Use `await context.request.get(firm.url, { timeout })` from a fresh `browser.newContext({ userAgent: USER_AGENT })` — same pattern as enrichBody's detail fetch. **This requires plumbing the `browser` argument into `scrapeSitemap`**, which in turn requires `fetch.ts` to pass `browser` into the `case 'sitemap':` branch (same threading as `case 'js-render':` already does). Planner must escalate D-16 to discuss-phase for revision — OR accept the revision as a research-level determination if auto-mode permits.

**Warning signs:** Unit tests (fixture-mocked fetch) pass, but `pnpm check:firm cooley` hits HTTP 403. If this happens post-merge, immediate fix: swap `decodeCharsetAwareFetch(firm.url)` for `browser.newContext({userAgent:USER_AGENT}).request.get(firm.url)`.

### Pitfall 2: canonicalizeUrl strips `www.` on item URLs — may cause article fetch failures (MEDIUM confidence)

**What goes wrong:** Sitemap XML `<loc>` entries are `https://www.cooleygo.com/<slug>/`. After `canonicalizeUrl()`, they become `https://cooleygo.com/<slug>`. The item URL stored in RawItem.url and used by enrichBody's Playwright detail fetch may hit a non-www origin whose TLS cert only covers `www.cooleygo.com` — the same failure mode that killed kim-chang (07-05) and bkl (07-06).

**Why it happens:** `canonicalizeUrl` unconditionally strips `www.` (util.ts:96). This design choice served DEDUP-02 consistency (avoids `www.x.com/a` and `x.com/a` being double-counted) but creates a downstream fetch gotcha when the server's TLS cert is www-only.

**How to avoid:** During plan-phase, probe whether `https://cooleygo.com/<any-slug>` resolves (HTTP 200 with article body) or fails (ERR_CERT_COMMON_NAME_INVALID, or 302-redirect-strip to homepage). If it works: no action. If it fails: either (a) use the same `restoreFetchHost(itemUrl, firmUrl)` pattern recommended for bkl/kim-chang in 07-05/06 SUMMARYs (but that's still a pending follow-up plan — creates coupling), or (b) accept that Cooley's fetch URLs need the www-prefix restored somewhere in the Phase 9 scraper/enrichBody path.

**Warning signs:** Playwright detail fetch returns 0-char body or redirects to cooleygo.com homepage. Test: `curl -I https://cooleygo.com/share-incentives-employees-private-uk-companies/` and check HTTP status + redirect behavior.

**Probe recommendation (plan-phase):**

```bash
# Does bare-apex cooleygo.com resolve article URLs?
curl -sI "https://cooleygo.com/share-incentives-employees-private-uk-companies/" -A "LegalNewsletterBot/1.0"
# Expected: 200, 301 to www-version, or error
```

### Pitfall 3: Empty title from sitemap XML (HIGH confidence)

**What goes wrong:** Sitemap XML doesn't carry `<title>` elements for URLs. `RawItem.title` would be `''` or `loc` itself. Downstream `compose/digest.ts` renders the title as the email item header, producing blank or URL-as-title rows.

**Why it happens:** The sitemap spec only defines `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>`, and optional extension namespaces. Article titles aren't part of the sitemap data model.

**How to avoid:** Three options documented in Pattern 1 above. Recommend Option A (slug-derived title) with planner+user confirmation in plan-phase. If Option B (detail-page title via `page.title()`) is chosen, it requires modifying enrichBody.ts to populate `item.title` during Playwright detail fetch — but this is a clean extension since enrichBody already opens a Playwright page for these items.

**Warning signs:** Email digest renders Cooley section with blank or URL-formatted item headers.

### Pitfall 4: canonicalizeUrl on the sitemap URL itself vs. item URLs (MEDIUM confidence)

**What goes wrong:** If `canonicalizeUrl(firm.url)` is called anywhere in the sitemap fetch path (e.g., preceding the HTTP GET), `https://www.cooleygo.com/post-sitemap.xml` becomes `https://cooleygo.com/post-sitemap.xml` — and if bare-apex doesn't resolve (see Pitfall 2), XML fetch fails.

**Why it happens:** CONTEXT code_context explicitly warns about this for canonicalizeUrl. But it's easy to accidentally apply it — for example, a test that does `expect(firm.url).toBe(canonicalized)` inadvertently, or a future refactor that normalizes firm.url at config-load time.

**How to avoid:** Use `firm.url` as-is for the outbound fetch. Only call `canonicalizeUrl(loc, firm.url)` on extracted `<loc>` strings. Add a unit test: "the URL passed to context.request.get() is identical to firm.url (not canonicalized)".

**Warning signs:** XML fetch fails with DNS or TLS error when it worked in isolation.

### Pitfall 5: RawItem.title required by downstream (HIGH confidence)

**What goes wrong:** If scrapeSitemap returns `title: ''`, the Phase 1 item-title-verbatim fallback (`summary_ko: item.title` when body < 100 chars, in `run.ts:246-253`) produces empty strings, which then land in the digest email as invisible items.

**Why it happens:** Early Phase 1 assumptions: title is always non-empty from RSS feedparser / HTML selectors. No defensive empty-title check anywhere in the pipeline.

**How to avoid:** Enforce non-empty title in scrapeSitemap. Whether via Option A slug-derivation or Option B detail-page title-tag read, the scraper MUST emit `title.length > 0`. Fallback: use the URL string as title (ugly but non-empty).

**Warning signs:** Digest email renders Cooley section with blank item headers or missing items entirely (template conditional-render on `item.title` truthy).

### Pitfall 6: detail_tier default conflict for sitemap firms (HIGH confidence)

**What goes wrong:** `FirmSchema.detail_tier = z.enum(['js-render','static']).default('static').optional()` means every parsed FirmConfig has `detail_tier` populated. For a sitemap firm without an explicit `detail_tier:` in YAML, zod fills in `'static'`. Then `enrichBody.ts` line 109 checks `r.firm.detail_tier === 'js-render' && browser` — evaluates FALSE for sitemap → static fetch path used for detail → `decodeCharsetAwareFetch(item.url)` → HTTP 403 from CF on Cooley article pages (same bypass issue, now on detail).

**Why it happens:** zod's `.default()` + `.optional()` semantics conflict with D-05's "implicit js-render detail for sitemap tier". The default fires; the implicit routing never happens.

**How to avoid:** Pattern 2 Option Y: change enrichBody.ts line 109 to:

```typescript
const needsPlaywrightDetail =
  r.firm.detail_tier === 'js-render' || r.firm.type === 'sitemap';
if (needsPlaywrightDetail && browser) {
  // ... existing Playwright branch
}
```

This satisfies D-05 ("sitemap tier는 항상 js-render detail path를 강제함 — schema 레벨에서 implicit") at the code level — the schema stays simple; the routing code reads both flags. One line change.

Alternative (Pattern 2 Option X): add a `.transform()` or post-parse step that forces `detail_tier = 'js-render'` for `type === 'sitemap'`. More complex; harder to test; zero user-visible benefit.

**Warning signs:** First production Cooley run returns 10 items successfully but all have empty `description` (because `decodeCharsetAwareFetch` got HTTP 403). Email digest has Cooley section with only titles, no summaries.

### Pitfall 7: GHA runner IP range may be treated differently by CF than local dev (MEDIUM confidence, unverified)

**What goes wrong:** Local probes (from home IP) succeed via Playwright browser-request. GitHub Actions ubuntu-latest runners have known CIDR ranges that CF may fingerprint as "cloud IP, higher scrutiny". Production CI runs could fail 403 even with Playwright.

**Why it happens:** Cloudflare Managed Challenge has heuristics beyond TLS fingerprint — source IP reputation is a factor. Corporate/residential IPs are trusted by default; datacenter IPs are challenge-first.

**How to avoid:** **Cannot fully verify in research.** Only in-situ production test will reveal. Mitigation strategies if it fails:
- (a) Accept the failure: Cooley ends up in email footer as error, doesn't block the daily digest for other firms (FETCH-02 isolation holds).
- (b) Self-hosted GHA runner from a residential IP (beyond $0 budget scope — violates project constraints).
- (c) Retry pattern: run via Playwright but with a fresh context per attempt. Unlikely to help since CF's decision is IP-based, not session-based.

**Warning signs:** Unit tests green, local smoke test green, GHA cron fails 403. Workflow log shows `scrapeSitemap cooley: HTTP 403`.

**Validation plan:** After merging Phase 9, manually trigger `workflow_dispatch` once and inspect the Actions log for Cooley's fetch status before declaring SITEMAP-05 acceptance met.

### Pitfall 8: CF policy variance over time (MEDIUM confidence)

**What goes wrong:** CF challenge policies are mutable. What works today via `context.request.get()` may stop working in 1 week, 1 month. Backlog doc entry shows the sitemap XML was 200 OK via plain curl in April 19 but is 403 by April 20 even via Playwright's default chrome UA.

**Why it happens:** Cloudflare continuously evolves its bot-mitigation heuristics based on the attacks they see. There's no SLA.

**How to avoid:** 
- Design for graceful degradation: if scrapeSitemap fails, the error is isolated to Cooley and caught by FETCH-02 — other firms still run.
- Consider Phase 10 observability (next phase) surfacing a clear "Cooley data-quality degraded" flag when it starts failing.
- Document in `.planning/backlog/resolved/cooley-cf-bypass.md` how to re-investigate: try `page.goto` instead of `context.request.get`, try different UA, try actual `/feed/` endpoint (CF policy may have swung back), consider dropping Cooley again.

**Warning signs:** Was working fine, now getting 403. Re-investigate CF policy state.

## Code Examples

### XML parsing with cheerio xmlMode (verified against live Cooley sitemap)

```typescript
// Verified: 2026-04-20 live probe of www.cooleygo.com/post-sitemap.xml returned
// 41104 bytes of XML with 233 <url> entries, all parsed correctly.
import * as cheerio from 'cheerio';

function parseSitemap(xml: string): Array<{ loc: string; lastmodMs: number }> {
  const $ = cheerio.load(xml, { xml: true });
  if ($('urlset').length === 0) {
    throw new Error('malformed XML: no <urlset> root');
  }
  const entries: Array<{ loc: string; lastmodMs: number }> = [];
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    const lastmodRaw = $(el).find('lastmod').first().text().trim();
    if (!loc || !lastmodRaw) return; // D-10: drop entries missing lastmod
    const ms = new Date(lastmodRaw).getTime();
    if (Number.isNaN(ms)) return;
    entries.push({ loc, lastmodMs: ms });
  });
  return entries;
}

// Usage:
const entries = parseSitemap(xmlBody);
entries.sort((a, b) => b.lastmodMs - a.lastmodMs);
const topN = entries.slice(0, 10);
```

### Playwright context.request.get — CF bypass for sitemap XML

```typescript
// Verified: 2026-04-20 live probe — 3/3 fresh contexts returned HTTP 200 +
// 41104 bytes of XML with LegalNewsletterBot/1.0 UA. Same UA via undici
// returned HTTP 403. Same probe via default chrome UA also returned 403.
//
// Source: scripts/_tmp_probe_cooley_reliability.mjs (run during research, deleted post-probe)
import type { Browser } from 'playwright';

async function fetchSitemapXml(url: string, browser: Browser): Promise<string> {
  const context = await browser.newContext({
    userAgent: 'LegalNewsletterBot/1.0 (+https://github.com/...)',
  });
  try {
    const res = await context.request.get(url, { timeout: 20_000 });
    if (!res.ok()) {
      throw new Error(`HTTP ${res.status()}`);
    }
    return await res.text();
  } finally {
    await context.close();
  }
}
```

### Fixture-based test pattern (follow scrapers/html.test.ts convention)

```typescript
// test/scrapers/sitemap.test.ts
// Mock browser.newContext → context.request.get; NOT mock globalThis.fetch.
// Pattern derived from test/scrapers/jsRender.test.ts (makeMockBrowser)
// but swap page.goto/content for context.request.get response.

import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { scrapeSitemap } from '../../src/scrapers/sitemap.js';
import type { FirmConfig } from '../../src/types.js';

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
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
  };
  return { browser, context, request, response };
}

describe('scrapeSitemap', () => {
  it('parses <url><loc><lastmod> fixture, sorts desc, slices top-N', async () => {
    const xml = await readFile(
      new URL('../fixtures/cooley.sitemap.xml', import.meta.url),
      'utf8',
    );
    const { browser } = makeMockBrowser({ xmlBody: xml });
    const items = await scrapeSitemap(makeFirm({ latest_n: 3 }), browser as never);
    expect(items).toHaveLength(3);
    // Newest first — lastmod desc
    expect(new Date(items[0].publishedAt!).getTime())
      .toBeGreaterThan(new Date(items[1].publishedAt!).getTime());
  });

  it('drops <url> entries missing <lastmod> (D-10)', async () => { /* ... */ });

  it('throws on malformed XML', async () => { /* ... */ });

  it('throws on zero <url> entries after filtering', async () => { /* ... */ });

  it('throws scrapeSitemap {id}: HTTP {status} on non-OK', async () => { /* ... */ });

  it('sitemap URL passed to request.get is NOT canonicalized (preserves www.)', async () => {
    const xml = '<?xml version="1.0"?><urlset xmlns="..."><url><loc>https://x</loc><lastmod>2026-01-01T00:00:00Z</lastmod></url></urlset>';
    const { browser, request } = makeMockBrowser({ xmlBody: xml });
    await scrapeSitemap(makeFirm(), browser as never);
    expect(request.get).toHaveBeenCalledWith(
      'https://www.cooleygo.com/post-sitemap.xml', // verbatim, WITH www.
      expect.anything(),
    );
  });
});
```

### Updated fetch.ts tier dispatch

```typescript
// src/pipeline/fetch.ts line 70+ (update switch):
switch (firm.type) {
  case 'rss':
    raw = await scrapeRss(firm);
    break;
  case 'html':
    raw = await scrapeHtml(firm);
    break;
  case 'js-render':
    if (!browser) {
      throw new Error(`firm ${firm.id}: js-render requires a launched Browser ...`);
    }
    raw = await scrapeJsRender(firm, browser);
    break;
  case 'sitemap':                                                          // NEW
    if (!browser) {                                                        // NEW
      throw new Error(                                                     // NEW
        `firm ${firm.id}: sitemap tier requires a launched Browser ...`,   // NEW
      );                                                                   // NEW
    }                                                                      // NEW
    raw = await scrapeSitemap(firm, browser);                              // NEW
    break;                                                                 // NEW
  default: {
    const _exhaustive: never = firm.type;
    throw new Error(`firm ${firm.id}: unknown tier ${_exhaustive as string}`);
  }
}
```

Note: `fetch.ts` line 86–88 currently uses `String(firm.type)` for the default branch — change to TS `never` exhaustiveness check for compile-time safety when `FirmType` union is extended in `types.ts`. This forces the build to fail at the `case 'sitemap'` miss if someone adds a future tier without touching fetch.ts.

### audit/firmAudit.ts tier dispatch

`src/audit/firmAudit.ts` lines 234–242 also has a `switch(firm.type)` block. Phase 9 **must** add `case 'sitemap':` there too, or `pnpm audit:firms` will crash with `Unknown tier: sitemap` when Cooley is included. New case should call a new `probeSitemapFirm(firm, browser!)` that mirrors `probeJsRenderFirm` but uses `scrapeSitemap` for list fetch. Also: the `hasJsRender` gate on line 210 (`firms.some(f => f.type === 'js-render')`) needs the same extension as `run.ts`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cooley` firm via RSS `/feed/` | `cooley` firm via sitemap `/post-sitemap.xml` + Playwright detail | Phase 9 (this research) | Bypass CF block without losing Cooley from digest |
| Detail fetch via `decodeCharsetAwareFetch` for all tiers | Phase 7: detail_tier='js-render' → Playwright; Phase 9: sitemap tier → implicit js-render detail | Phase 7 (2026-04-20) + Phase 9 | bkl/kim-chang hallucination fix + Cooley CF bypass |
| Sitemap XML via native fetch (assumed in backlog doc + CONTEXT D-16) | Sitemap XML via Playwright `context.request.get` | **2026-04-20 research-level revision** | Live probe proves native undici is CF-blocked |

**Deprecated/outdated:**
- CONTEXT D-16 literal wording ("기존 `decodeCharsetAwareFetch` 재사용") — superseded by Pitfall 1 findings. Planner must revise.
- `backlog/cooley-cf-bypass.md` Table "sitemap.xml = Playwright status 200" implies static fetch works — was true 2026-04-19, no longer true 2026-04-20. The backlog doc's step-by-step recommends cheerio `xmlMode` which IS still correct; only the fetch mechanism needs updating.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Slug-derived title (Pattern 1 Option A) is acceptable UX for Cooley digest section headers | Pattern 1 | User could reasonably prefer Option B (page.title() via detail fetch) — affects enrichBody.ts vs sitemap.ts code placement. Email UX: slug-titles like "Share Incentives For Private Uk Company Employees" look uglier than real titles ("Share Incentives for Private UK Company Employees"). |
| A2 | Phase 7's existing `extractBody` generic chain (util.ts:270) already hits `.post-content` and will work for Cooley articles without adding `selectors.body: .post-content` to the YAML | Anti-Patterns | If the class-name matching or length-threshold (>120 chars) fails for some Cooley pages, body ends up empty → SUMM-06 B3 guard kicks in → summary is `item.title` verbatim. Degraded but not broken. Probe during plan-phase recommended. |
| A3 | Bare-apex `cooleygo.com` (without www) resolves article URLs with a valid TLS cert | Pitfall 2 | If false, same failure class as bkl/kim-chang — Cooley detail fetch fails; titles present but descriptions empty. Mitigation exists (restoreFetchHost helper), but it's a pending follow-up. Probe required in plan-phase. |
| A4 | GHA ubuntu-latest runners from GitHub's IP ranges can still bypass CF via Playwright `context.request.get` with bot UA | Pitfall 7 | If false, Cooley fails 403 in production only (not in local dev). Recovery: accept Cooley failure, or defer Phase 9 to v2 with paid tier. Validation requires actual cron run. |
| A5 | CF policy will not further tighten between research (2026-04-20) and production deploy (Phase 9 merge) such that even Playwright `context.request.get` is blocked | Pitfall 8 | If CF escalates again, Phase 9 ships broken. Mitigation: FETCH-02 isolation limits blast radius to Cooley alone. Validation: live probe on merge day. |
| A6 | No existing test in the suite asserts `firm.type === 'rss' | 'html' | 'js-render'` in an exhaustive way that will break when `'sitemap'` is added | Pattern 2 | Likely benign — tests usually test specific tier behavior, not exhaustive union coverage. Run `pnpm test` after schema change to verify; any broken test is on enum-exhaustive code paths that need `case 'sitemap'`. |
| A7 | D-11's "Body selector는 `.post-content` 하드코딩" intent is satisfied by the generic `extractBody` chain hitting `.post-content` naturally — no sitemap.ts-internal constant needed | Pattern 1 + Anti-Patterns | If the project team's interpretation of "hardcoded" was "literal constant in sitemap.ts", the planner's implementation will differ from expectations. Surface in plan-phase for user review. |

**If this table is empty:** Not empty — 7 assumptions flagged. Most are low-medium risk; A4 and A5 are high-impact but unverifiable in research. Planner should (a) add explicit plan-phase probes for A2, A3; (b) design fallback paths for A4, A5 (FETCH-02 isolation already provides one); (c) escalate A1, A7 to discuss-phase for user confirmation before locking.

## Open Questions

1. **Should RawItem.title for sitemap items be slug-derived (Option A), detail-page-title-derived (Option B), or URL-verbatim (Option C)?**
   - What we know: sitemap XML has no title data; downstream requires non-empty title.
   - What's unclear: user UX preference between slug-cased strings vs. extra enrichBody logic.
   - Recommendation: default to Option A (slug-derived, title-cased) as Phase 9 scope minimization; revisit in Phase 10 observability if ugly titles flag as data-quality concern.

2. **Does CONTEXT D-16 need explicit revision via discuss-phase before planning?**
   - What we know: D-16 literal says "use decodeCharsetAwareFetch"; 2026-04-20 live probe proves this fails CF challenge.
   - What's unclear: whether auto-mode permits researcher to assert the revision, or whether planner-phase should pause for user confirmation.
   - Recommendation: flag prominently (as done in this document). Planner can either proceed with `context.request.get` + document the deviation in PLAN.md, or ping user for confirmation. User memory preference "aggressive failure detection" suggests proceeding with the revision — failing silently in production is worse than deviating from a literally-wrong decision.

3. **State migration: does Phase 9 need bootstrap-seed logic on first run?**
   - What we know: Cooley state key preserves slug `cooley`; old RSS URLs are in `seen.json`; new sitemap URLs likely overlap via same permalinks but may have different paths or trailing-slash shapes.
   - What's unclear: byte-level comparison of what RSS `<link>` values were vs. sitemap `<loc>` values. Both likely canonicalize to the same strings, but unverified.
   - Recommendation: plan-phase task to (a) extract last-10 Cooley URLs from `state/seen.json` snapshot, (b) compare canonicalized shapes against sample sitemap entries, (c) if no overlap expected, add bootstrap logic (DEDUP-05 pattern) for first post-merge run. If overlap expected, no action.

4. **Does `.planning/backlog/resolved/` directory exist, or does Phase 9 need to create it?**
   - What we know: D-07 says move the backlog doc there; directory layout is Claude's Discretion.
   - What's unclear: whether the resolved/ convention is already established elsewhere in this repo.
   - Recommendation: `ls .planning/backlog/` in plan-phase; if `resolved/` doesn't exist, create it with a tiny README documenting the convention ("files here were active backlog items completed in a phase — see git log for phase reference").

## Sources

### Primary (HIGH confidence)

- `src/scrapers/rss.ts`, `src/scrapers/html.ts`, `src/scrapers/jsRender.ts`, `src/scrapers/util.ts`, `src/scrapers/robots.ts`, `src/pipeline/fetch.ts`, `src/pipeline/enrichBody.ts`, `src/pipeline/run.ts`, `src/config/schema.ts`, `src/audit/firmAudit.ts`, `src/types.ts` — canonical implementation code, read in full 2026-04-20
- `.planning/phases/09-cooley-sitemap-tier/09-CONTEXT.md` — locked decisions D-01..D-19
- `.planning/phases/07-spa-aware-detail-tier/07-CONTEXT.md` — Phase 7 detail_tier pattern precedent
- `.planning/backlog/cooley-cf-bypass.md` — original 2026-04-19 probe data (now partially stale per Pitfall 1)
- `config/firms.yaml` lines 52–60 — active Cooley block with disable comment
- `test/scrapers/jsRender.test.ts`, `test/scrapers/html.test.ts`, `test/scrapers/rss.test.ts`, `test/pipeline/enrichBody.test.ts`, `test/config/schema.test.ts`, `test/pipeline/fetch.test.ts` — test patterns for tier scrapers (mock browser, fixture-based parsing)
- `node_modules/cheerio/package.json` version 1.2.0 — verified xml mode API
- `node_modules/playwright/package.json` version 1.59.1 — verified context.request.get API
- `node_modules/zod/package.json` version 4.3.6 — verified superRefine API

### Secondary (MEDIUM confidence)

- Live 2026-04-20 probes of https://www.cooleygo.com endpoints via curl + undici native fetch + Playwright context.request.get + Playwright page.goto (temp probe scripts ran from /Users/seonghoonyi/Documents/projects/legalnewsletter/scripts/, deleted post-probe per clean-room discipline)
- Live Cooley sitemap XML sample output (41104 bytes, 233 `<url>` entries, 233 `<lastmod>`, sample format `2023-08-10T21:16:17+00:00`, sample loc `https://www.cooleygo.com/q4-2017-quarterly-vc-update-michael-ronen-state-of-venture-capital-investing/`)
- Live Cooley article page probe (https://www.cooleygo.com/share-incentives-employees-private-uk-companies/) returned 200 + 114kb HTML + `.post-content` class present via Playwright — verifies body extraction path

### Tertiary (LOW confidence, not used)

- None — all claims in this research are code-inspected or live-probed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already in use; cheerio/Playwright/zod versions verified against lock file
- Architecture: HIGH — every recommended patch point was read in source code; integration points are explicit
- Pitfalls: HIGH for Pitfall 1, 3, 5, 6 (directly verified); MEDIUM for Pitfall 2, 7, 8 (depend on unobservable production runtime or future-state assumptions)

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 for general architecture; **2026-04-27 for CF bypass specifics** (Cloudflare policy volatility — re-verify Pitfall 1 probe result if merge-to-main is delayed more than 7 days past research date)

---
*Phase: 09-cooley-sitemap-tier*
*Research completed: 2026-04-20*
