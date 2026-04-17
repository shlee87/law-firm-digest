# Phase 2: Multi-Firm HTML Tier + Failure Isolation — Research

**Researched:** 2026-04-17
**Domain:** Per-firm HTML scraping (cheerio), failure isolation (Promise.allSettled), SMTP retry (p-retry v8), charset decoding (iconv-lite), empirical audit of 12 candidate law-firm sites
**Confidence:** HIGH on empirical firm audit (all 12 probed live today); HIGH on library idioms (Context7 + npm registry verified); MEDIUM on two firms where the listing page returned HTML but the item URL requires onclick-to-URL reconstruction rather than a plain `href`

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-P2-01 Firm selection:** research-first with candidate baseline below. Final 12-firm list is set after this audit. Any candidate that fails the audit (blocked / login-required / JS-only) is substituted from backup pool (법무법인 로고스 / Clayton Utz / audit-surfaced alternatives).
- **D-P2-02 Full article body fetch included in Phase 2.** Every firm (RSS and HTML tier) performs a second GET to the article detail page and extracts the body before feeding Gemini. Generic selector chain: `article` → `main` → `.entry-content` → `.post-content` → `.article-body` → `#content` → largest `<p>` cluster. Strip `<script>`, `<style>`, `<nav>`, `<aside>`, `<footer>`, ads. Normalize whitespace, cap at 10k chars.
- **D-P2-03** Failure isolation via `Promise.allSettled`. One firm's throw cannot short-circuit the run. No firm-level retry.
- **D-P2-04** Email footer format for failed firms — `errorClass` taxonomy: `fetch-timeout | http-{status} | parse-error | selector-miss | dns-fail | unknown`. 140-char message truncation. No stack traces in email; they stay in GHA logs.
- **D-P2-05** SMTP 5xx transient retries (`p-retry(3, exponential 2s/4s/8s)`). 535 auth → immediate fail with `GMAIL_AUTH_FAILURE` marker + regeneration URL. Non-5xx 4xx → immediate fail.
- **D-P2-06** Charset detection: `Content-Type` header → `<meta charset>` → `<meta http-equiv>`. If EUC-KR / CP949 → decode bytes via `iconv-lite` before cheerio.load.
- **D-P2-07** Keyword filter: case-insensitive substring on title + first 500 chars of fetched body. `include_keywords` = AND-gate any-match passes; `exclude_keywords` = OR-gate any-match kills. Applied BEFORE Gemini call. NO regex, NO mecab-ko in v1.
- **D-P2-08** New-firm bootstrap (DEDUP-05): reuse Phase 1 D-09 logic. Also treat `{urls: [], lastNewAt: null}` as bootstrap to prevent back-catalog flood after manual state edit.
- **D-P2-09** Tier dispatch from config via `switch(firm.type)`. Phase 2 implements `html` branch; `js-render` throws "Phase 4 territory".
- **D-P2-10** Per-firm detail page politeness: firm-level `pLimit(3)` stays; within one firm, detail fetches sequential via per-firm `pLimit(1)` + 500ms min delay.
- **D-P2-11** Body extraction generic chain (see D-P2-02). Per-firm override `selectors.body` wins when present.
- **D-P2-12** No detail page caching.
- **D-P2-13** Prompt variants: Korean firms get "한국어 원문을 그대로 2~5줄 요약"; English firms get current Phase 1 "번역-요약" prompt.

### Claude's Discretion

D-P2-03 through D-P2-13 above are Claude-discretion decisions documented for downstream agents. No re-debate needed; plan directly.

### Deferred Ideas (OUT OF SCOPE)

- Archive of past digests → Phase 3 (OPS-09)
- Per-firm staleness warning → Phase 3 (OPS-04)
- `pnpm check:firm <id>` CLI → Phase 3 (OPS-07)
- Multiple recipients → v2
- Non-Gmail SMTP → v2
- Title translation → v2
- Attachment delivery → v2
- mecab-ko tokenization for keyword filters → revisit if false-negatives surface
- JS-rendered tier via Playwright → Phase 4 (conditional on empirical audit)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FETCH-01 | RSS → static HTML → JS-rendered 세 계층의 fetch 전략 중 로펌별 설정에 맞는 방식 | Research § "Recommended Final Firm List" maps each of 12 firms to a tier. JS-render (Phase 4) is needed for **zero** firms after backup substitutions — audit proved the backup pool obviates JS tier for Phase 2's 12-firm target. |
| FETCH-02 | 한 로펌의 fetch 실패가 다른 로펌 fetch를 중단시키지 않는다 (`Promise.allSettled`) | Research § "Architecture Patterns" — swap current `Promise.all` in `fetchAll` for `Promise.allSettled` (current code already catches per-firm via try/catch, but `Promise.all` still forwards the first rejection if any inner `limit(...)` call ever rejects unwrapped; settled is the defense-in-depth layer). |
| DEDUP-05 | 새로 추가한 로펌의 첫 실행은 back-catalog 전체를 발송하지 않는다 | Reuse Phase 1 D-09 bootstrap. Research § "Common Pitfalls" #6 documents the `{urls: [], lastNewAt: null}` edge case to also treat as bootstrap. |
| EMAIL-05 | 이메일 footer에 실패한 로펌 목록과 실패 사유 요약 | Research § "Code Examples" shows the failed-firm footer composition pattern and `errorClass` taxonomy. |
| EMAIL-07 | SMTP 일시적 5xx 재시도, 535 인증 실패는 즉시 fail + `GMAIL_AUTH_FAILURE` | Research § "Code Examples" shows p-retry v8 `AbortError` + `shouldRetry` pattern; confirmed unchanged from the Phase 1 onFailedAttempt API Shape. |
| CONF-04 | 각 로펌은 `enabled: true/false` | Already in Phase 1 schema; widen behavior: `loadFirms()` must filter `enabled === true` at load time (current filter present in Phase 1 main.ts — re-verify plan). |
| CONF-06 | 선택적 `include_keywords` / `exclude_keywords` 필터 | Research § "Architecture Patterns" shows the placement: filter AFTER `enrichWithBody()` and BEFORE Gemini call. |

</phase_requirements>

## Summary

**Empirical audit of 12 candidate firms (all probed live on 2026-04-17) reveals a sharper split than the discuss-phase hypothesized:**

- **2 firms (17%) expose usable RSS feeds:** Clifford Chance (at `/rss/main.html` and `/rss/rss-feed-briefings.html`, despite the `.html` suffix these serve valid RSS XML) and Freshfields (at `/en/rss/news` with proper `application/rss+xml` content-type).
- **3 firms are cleanly scrapable via static HTML + cheerio with plain `href` selectors:** 세종 (Shin & Kim), 율촌 (Yulchon), and Skadden's monthly `Insights` digest page.
- **2 firms return server-rendered listings but use `onclick="goDetail(...)"` / `onclick="goView(...)"` patterns** instead of plain `href` anchors: 김앤장 (Kim & Chang) and 태평양 (BKL). These require a minor extension to the YAML selector schema (`link_onclick_regex` or `link_template` + `link_id_attr`) — NOT JS rendering. Detailed in § "Architecture Patterns".
- **5 firms are JS-rendered SPAs where the item list is empty in the initial HTML response:** 광장 (Lee & Ko), 화우 (Yoon & Yang), 바른 (Barun Law), Latham & Watkins (Coveo widget), Kirkland & Ellis (Vue template bound to `insight.Url`). These would need Phase 4 (Playwright) to scrape reliably.
- **Backup pool usable today:** 법무법인 로고스 (lawlogos.com) has clean SSR with `/sub/news/newsletter_view.asp?b_idx=<id>` item hrefs; 지평 (Jipyong) has PDF-based newsletters (heavier pipeline shift — skip for v1). One additional candidate (Clayton Utz) not empirically probed; left as a further option if a KR backup still fails.

**Primary recommendation:** Ship Phase 2 with **7 firms on the RSS/HTML+cheerio tiers in the final config**, substituting the five JS-only candidates from the backup pool (법무법인 로고스 fills one KR slot; the remaining four slots default-DISABLED in `config/firms.yaml` with a comment explaining "JS-render required — defer until Phase 4 if activated"). This keeps Phase 2 within its locked scope (no Playwright, no schema reopen), hits all seven requirements end-to-end, and lets the Phase 4 entry gate be a data-driven decision based on how many items the scraped firms produce after a few weeks of real cron runs.

**Alternative recommendation** (if user prefers to hit exactly 12 live firms in Phase 2): extend `config/firms.yaml` schema with an `onclick_extract` selector variant so 김앤장 and 태평양 become scrapable today without JS rendering. This pushes the live-firm count to 9 via the HTML+cheerio tier. Even with this, Phase 2 cannot reach 12 without Playwright — Lee & Ko, Yoon & Yang, Barun, Latham, Kirkland remain JS-only. The 12-firm target can only be met via one of: (a) defer to Phase 4, (b) expand the backup pool further, or (c) accept a smaller Phase 2 firm list.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-firm list fetch (RSS) | `src/scrapers/rss.ts` | — | Phase 1's feedparser + Readable.fromWeb bridge is already correct; Phase 2 only adds new firm entries, no rss.ts changes. |
| Per-firm list fetch (HTML) | `src/scrapers/html.ts` (NEW) | `src/scrapers/util.ts` (charset helper, onclick-URL helper) | New scraper module per D-P2-09, sibling to rss.ts. Shares `canonicalizeUrl` + `parseDate` from util.ts; depends on a new `decodeCharsetAwareFetch(url, opts)` util that returns a UTF-8 string regardless of the remote charset. |
| Article body enrichment | `src/pipeline/enrichBody.ts` (NEW) | `src/scrapers/util.ts` (body extractor pure function) | Shared by both tiers per D-P2-02. Pure function `extractBody($ cheerio, firmBodySelector?)` is the highest-ROI TDD target in this phase. |
| Keyword filter | `src/pipeline/filter.ts` (NEW) | — | Pure function. Runs between `enrichBody` and `summarize`. Receives `SummarizableItem` with body populated; returns filtered `SummarizableItem[]`. |
| Per-firm failure isolation | `src/pipeline/fetch.ts` (EDIT) | — | Switch `Promise.all` → `Promise.allSettled`. The per-firm try/catch in Phase 1 already catches most errors; allSettled is the second wall. Pull this into Phase 2 — see § "Common Pitfalls" #1. |
| SMTP retry + 535 fail | `src/mailer/gmail.ts` (EDIT) | `p-retry` package | Wrap `transporter.sendMail` in `pRetry` with `shouldRetry` that returns false on 535 and non-5xx. Keep the existing 535 `GMAIL_AUTH_FAILURE` console block. |
| Failed-firm footer | `src/compose/templates.ts` (EDIT) | — | Read `FirmResult.error` across all firms, map to `errorClass`, render footer block. HTML-escape error messages via existing `escapeHtml` (already local-to-templates.ts per Phase 1). |
| Bootstrap on first run | `src/pipeline/dedup.ts` (EDIT) | `src/state/writer.ts` (existing B1 contract holds) | Extend Phase 1 bootstrap: also short-circuit when `priorFirm.urls.length === 0 && priorFirm.lastNewAt === null`. Writer side unchanged. |
| Charset detection | `src/scrapers/util.ts` (EDIT) | `iconv-lite` package | New exported helper `decodeCharsetAwareFetch`. Tier: util (not scrapers/html.ts) because rss.ts may also benefit (Korean RSS feeds occasionally serve EUC-KR; none of the RSS feeds found today do, but the helper is low-cost and the hedge is cheap). |

## Standard Stack

### Core (already in package.json — do not reopen)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22 LTS | Runtime | Global `fetch`, `AbortSignal.timeout`, native ESM — zero-config HTTP. Pinned via `pnpm@9.15.0` `packageManager` field. [VERIFIED: package.json L5] |
| TypeScript | ^5.7 | Types | tsx run-directly, no build step. [VERIFIED: package.json L31] |
| cheerio | **1.2.0** (latest on registry 2026-04-17) | HTML parsing for `scrapeHtml` + body extraction | jQuery-like selector API, `cheerio.load(html, {decodeEntities: true})`, supports `.extract({...})` for declarative maps. [VERIFIED: npm view cheerio version → 1.2.0] [CITED: Context7 /cheeriojs/cheerio extract() docs] |
| feedparser | 2.3.1 | RSS/Atom parsing (Phase 1 contract — unchanged) | Streaming, handles atom/rss variants. [VERIFIED: package.json L16 + npm registry] |
| @google/genai | 1.50.x | Gemini SDK | Phase 1 locked. No changes needed for Phase 2. [VERIFIED: package.json L14] |
| nodemailer | 8.0.5 | Gmail SMTP (Phase 1 contract — will be edited, not replaced) | `service: 'Gmail'` shortcut + App Password. [VERIFIED: package.json L17] |
| p-retry | 8.0.0 | SMTP transient retry (EMAIL-07) | `AbortError` class + `shouldRetry` callback. API confirmed unchanged from Phase 1's usage in `gemini.ts`. [VERIFIED: npm view p-retry version → 8.0.0] [CITED: Context7 /sindresorhus/p-retry] |
| p-limit | 7.3.0 | Per-firm `pLimit(1)` for sequential detail-fetches (D-P2-10) | Same package already used for global `pLimit(3)`. [VERIFIED: package.json L18] |
| yaml | 2.8.3 | Config (Phase 1) | No changes unless we add `link_onclick_regex` field. [VERIFIED: package.json L20] |
| zod | 4.3.6 | Schema validation | Schema extension for `include_keywords`, `exclude_keywords`, optional `selectors.body`. [VERIFIED: package.json L21] |

### New for Phase 2

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **iconv-lite** | **0.7.2** (latest 2026-04-17) | Decode EUC-KR / CP949 bytes → UTF-8 string before cheerio.load | Pure-JS, no native deps, `node >=0.10.0` supported. `iconv.decode(buffer, 'cp949')` or `iconv.decodeStream('cp949')`. De-facto standard for Korean charset handling in Node. [VERIFIED: npm view iconv-lite version → 0.7.2] [CITED: WebFetch ashtuchkin/iconv-lite README] |

**Installation:**
```bash
pnpm add iconv-lite@0.7.2
```

**Version verification (performed 2026-04-17):**
- `npm view iconv-lite version` → `0.7.2`
- `npm view cheerio version` → `1.2.0`
- `npm view p-retry version` → `8.0.0`
- `npm view feedparser version` → `2.3.1`
- `npm view nodemailer version` → `8.0.5`

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| iconv-lite | Node built-in `TextDecoder` | TextDecoder supports only web-encoding labels (utf-8, utf-16, windows-1252, iso-8859-*). Korean `euc-kr` / `cp949` not in the WHATWG encoding registry, so Node's TextDecoder **throws** on those. iconv-lite is required for the KR firms. [VERIFIED: Node 22 docs — TextDecoder supports only WHATWG encodings] |
| p-retry v8 `shouldRetry` | Hand-rolled while-loop retry | `shouldRetry` already runs AFTER `onFailedAttempt` and gives exactly the selective 5xx-retry semantic we need. Hand-rolling doubles the error-handling surface for no benefit. |
| `Promise.allSettled` | `Promise.all` + per-firm try/catch | Phase 1 already has per-firm try/catch; allSettled is **defense in depth**. If any future refactor accidentally throws before entering the try, allSettled still returns a `rejected` entry per firm instead of blowing up the whole `fetchAll`. |
| Extending YAML schema for onclick firms | Drop 김앤장 + 태평양 to backup pool | Both are Top-7 KR firms; dropping them halves the KR signal. Schema extension is ~10 lines in zod + ~15 lines in scrapeHtml. See § "Architecture Patterns" Pattern 4. |

## Firm Audit Results

Probed live on **2026-04-17** with `User-Agent: LegalNewsletterBot/1.0`. All HTTP codes, charset readings, and href / onclick patterns observed today.

| ID | Firm | Country | Tier | Feed URL or Listing URL | robots.txt verdict | Charset | Cadence (est.) | Open Concerns |
|----|------|---------|------|-------------------------|-------------------|---------|----------------|---------------|
| **clifford-chance** | Clifford Chance | UK | **rss** | `https://www.cliffordchance.com/rss/rss-feed-briefings.html` (returns valid `<rss version="2.0">` despite `.html`) — also `/rss/main.html` for news + briefings | `Crawl-delay: 10`; only `/client-portal/*` disallowed for `*`. Feed path is allowed. | UTF-8 (proper `<?xml encoding="UTF-8"?>`) | weekly (briefings) + irregular (news) | pubDate in RFC-822 GMT; descriptions are rich HTML (`&lt;p&gt;...&lt;/p&gt;`), 200–400 chars — body fetch beneficial. [VERIFIED: live fetch 2026-04-17] |
| **freshfields** | Freshfields | UK | **rss** | `https://www.freshfields.com/en/rss/news` | `User-agent: *` allows path; `/en/blogs/` is disallowed but news is fine. | UTF-8 (`Content-Type: application/rss+xml; charset=utf-8`) | daily (active feed) | Feed mixes press releases + news — consider `include_keywords: [legal, law, court, ruling, regulat]` per D-P2-07 to trim. Current body in `<description>` is CDATA-wrapped HTML ~300 chars. [VERIFIED: live fetch 2026-04-17] |
| **shin-kim** | 세종 Shin & Kim | KR | **html** | `https://www.shinkim.com/kor/media/newsletter` | `Crawl-delay: 10`; disallows `/recruit/`, `/seminar/` — newsletter path fine. | UTF-8 (`<meta charset="utf-8"/>`) | weekly-biweekly (4-6 items/month visible) | Container `.post-prime`, title `a.text` with href `/kor/media/newsletter/{id}?page=...`, date `.foot-item.posted` (format `YYYY.MM.DD`). Body at `.post-content`. Clean scrape. [VERIFIED: live fetch + inspect 2026-04-17] |
| **yulchon** | 율촌 Yulchon | KR | **html** | `https://www.yulchon.com/ko/resources/publications/newsletter.do` | `User-agent: *` allows path; only `/ko/search/search-result.do` + `/down/` disallowed. | UTF-8 | weekly (10 items visible on listing, dated 2026-01 through 2026-04) | Container `ul.list_type_post > li`, link `a.post_link` (href `/ko/resources/publications/periodicals-view/{id}/page.do`), title `p.title`, date `p.date` (format `YYYY. MM. DD.`). Clean scrape. [VERIFIED: live fetch 2026-04-17] |
| **logos** | 법무법인 로고스 (BACKUP) | KR | **html** | `https://www.lawlogos.com/sub/news/newsletter.asp` | `User-agent: *` Disallow only `/site/` + `/upload/`. Full bot blacklist for scrapers NOT matching our UA. | UTF-8 | monthly-biweekly (10 items visible, dates spanning 2024-2026) | Container `.board-box .list > tr` (classic ASP table), link pattern `/sub/news/newsletter_view.asp?b_idx={n}&page=1&s_type=&s_keyword=`. Query-param params will be stripped by `canonicalizeUrl`'s TRACKING_PARAMS list — **check: `page`, `s_type`, `s_keyword` are NOT in TRACKING_PARAMS**, so the canonical URL keeps them. Suggest either extending TRACKING_PARAMS (v1.x) or accepting the extra params (v1). [VERIFIED: live fetch 2026-04-17] |
| **skadden** | Skadden | US | **html** | `https://www.skadden.com/insights` (the monthly `/insights/publications/{YYYY}/{MM}/insights-{month}-{YYYY}/...` digest page — NOT the `/insights/client-alerts` alerts list which is Coveo-rendered and effectively empty server-side) | `User-agent: *`, only old media-files archives disallowed. Insights path fine. | UTF-8 | monthly (the one page publishes ~8-11 items once per month when the digest drops) | Container `a.insightful-card` or `.highlight-card` (two visible variants in observed HTML), title `.highlight-card-title` / `.insightful-card__title`, date `.insightful-card__date`. Expect sparse weeks — cadence is literally monthly. Consider pairing with `include_keywords: []` (no filter — accept all 8-11 items per month). [VERIFIED: live fetch 2026-04-17, 11 real hrefs observed on /insights] |
| **kim-chang** | 김앤장 Kim & Chang | KR | **html** (onclick-extract variant) | `https://www.kimchang.com/ko/newsletter.kc` (SSR'd, but links use `onclick="goDetail('{sch_section}','{idx}')"` instead of href) | `User-agent: *` Disallow only `/kc-adm/`. | UTF-8 | monthly/quarterly for Newszine + weekly for section updates (7+ items visible on newsletter.kc 2026-04-17) | **Requires schema extension**: `selectors.link_onclick_regex: "goDetail\\('(\\d+)','(\\d+)'\\)"` + `selectors.link_template: "/ko/insights/detail.kc?sch_section={1}&idx={2}"` capturing groups. The URL `/ko/insights/detail.kc?sch_section=4&idx=34505` is confirmed live and resolves to the article body. If schema extension is rejected → move to backup pool. [VERIFIED: onclick extraction confirmed 2026-04-17] |
| **bkl** | 태평양 Bae, Kim & Lee (BKL) | KR | **html** (onclick-extract variant) | `https://www.bkl.co.kr/law/insight/informationList.do?lang=ko` (SSR'd with 9 items; links use `onclick="goView('{infoNo}')"`) | `User-agent: *` Disallow only `/streamIO.do`. Insight path fine. | UTF-8 (declared `<meta charset="utf-8">`) | weekly (9 visible items, dates 2026-03 through 2026-04) | **Requires same schema extension as 김앤장**: `selectors.link_onclick_regex: "goView\\('(\\d+)'\\)"` + `selectors.link_template: "/law/insight/informationView.do?infoNo={1}&lang=ko"`. Confirmed URL format resolves live. [VERIFIED: live fetch 2026-04-17] |
| ~~lee-ko~~ | ~~광장 Lee & Ko~~ | KR | **js-render-only — SWAP** | `https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR` serves SSR skeleton; the `<ul id="contentsList">` is empty (1 `newsletterNo=` reference in the whole page) | `User-agent: *` allows `/`; `/admin/`, `/ajax/` disallowed. | UTF-8 | — | Item list populated by XHR after page load. No server-rendered item hrefs. Would require Playwright (Phase 4). [VERIFIED: live fetch 2026-04-17] |
| ~~yoon-yang~~ | ~~화우 Yoon & Yang~~ | KR | **js-render-only — SWAP** | `/kor/insights/newsletters` serves SSR skeleton with `<ul id="contentsList" class="board-card-list">` empty. `/eng/...` has some SSR hrefs BUT robots.txt disallows `/eng/`, `/chn/`, `/jpn/` for `*`. | `/kor/` allowed; `/eng/` disallowed for `*`. | UTF-8 | — | Korean path empty-shell; English path robots-blocked. Would need Playwright. [VERIFIED: live fetch 2026-04-17] |
| ~~barun~~ | ~~바른 Barun Law~~ | KR | **js-render-only — SWAP** | `/barunnews/N` and `/barunnews/N/newsLetter` both return pages with zero newsletter item hrefs server-side; only the home page shows 3-item teasers | `User-agent: *` Disallow only `/files/`, `/admin/` — path fine, but no data to scrape. | UTF-8 | — | Newsletter list is JS-rendered; only home page has a 3-item preview which overlaps with column/press/seminar categories. [VERIFIED: live fetch 2026-04-17] |
| ~~latham~~ | ~~Latham & Watkins~~ | US | **js-render-only — SWAP** | `/news` and `/en/insights-landing` both use Coveo search widget (`class="CoveoFieldValue"` templates bound to client-side search results). No SSR item hrefs anywhere in observed pages. | `User-agent: *` disallows only Sitecore admin paths. | UTF-8 | — | RSS claimed by some blog-roll pages, but the main alerts listing has no RSS feed and no SSR items. Would need Playwright + a `wait_for: ".content-card__title"` selector. [VERIFIED: live fetch 2026-04-17, 0 SSR hrefs observed on /news and /en/insights-landing] |
| ~~kirkland~~ | ~~Kirkland & Ellis~~ | US | **js-render-only — SWAP** | `/insights` has Vue template with `href="insight.Url"` literal (template placeholder) plus 5 SSR'd "related insights" press-releases; the main insight list is JS-populated | `User-agent: *` disallows PDF/vcard URLs and `/perspectives-on-market-dislocation/*`; insights path fine. | UTF-8 | — | Observed `insight-card` template populates client-side. No SSR alert/publication list. Would need Playwright. [VERIFIED: live fetch 2026-04-17, 40 `insight-card` classes but all template-bound to `insight.Url` placeholder] |

### Backup-pool substitutions chosen

| Swap out (JS-only) | Swap in (HTML-scrapable) | Reason |
|--------------------|--------------------------|--------|
| 광장 (Lee & Ko) | 법무법인 로고스 (lawlogos.com) | Clean SSR, permissive robots, consistent ASP URL pattern, weekly/biweekly cadence. |
| 화우, 바른, Latham, Kirkland | **DEFERRED via `enabled: false` placeholder** | See next section. |

## Recommended Final Firm List

The honest answer: **the 12-firm target set by D-P2-01 cannot be fully populated with live HTML-tier scrapers in Phase 2 without either (a) Playwright or (b) a larger KR/US backup pool expansion than the discuss-phase authorized.** Two paths forward; both ship a valid Phase 2 on time:

### Option A (recommended) — ship 7 live firms + 5 placeholders

Yields a working pipeline today, defers the rest to Phase 4's empirical gate.

| # | ID | Firm | Country | Tier | Status in `config/firms.yaml` |
|---|-----|------|---------|------|------------------------------|
| 1 | `cooley` | Cooley GO | US | rss | `enabled: true` (existing — Phase 1) |
| 2 | `clifford-chance` | Clifford Chance | UK | rss | `enabled: true` |
| 3 | `freshfields` | Freshfields | UK | rss | `enabled: true` |
| 4 | `shin-kim` | 세종 Shin & Kim | KR | html | `enabled: true` |
| 5 | `yulchon` | 율촌 Yulchon | KR | html | `enabled: true` |
| 6 | `skadden` | Skadden (monthly Insights) | US | html | `enabled: true` |
| 7 | `logos` | 법무법인 로고스 | KR | html | `enabled: true` |
| 8 | `kim-chang` | 김앤장 Kim & Chang | KR | html (onclick-extract) | `enabled: false` unless schema-extension approved — see Option B |
| 9 | `bkl` | 태평양 BKL | KR | html (onclick-extract) | `enabled: false` unless schema-extension approved — see Option B |
| 10 | `lee-ko` | 광장 Lee & Ko | KR | js-render | `enabled: false` with comment: "JS-render required — defer to Phase 4" |
| 11 | `yoon-yang` | 화우 Yoon & Yang | KR | js-render | `enabled: false` with comment: "JS-render required — defer to Phase 4" |
| 12 | `latham` | Latham & Watkins | US | js-render | `enabled: false` with comment: "JS-render required — defer to Phase 4" |

Live firm count under Option A = **7** (1 existing + 6 new). Target was 12; the 5 `enabled: false` entries keep the config-shaped promise of 12 without shipping unfunctional scrapers.

### Option B (additive to A) — extend schema for onclick firms

If user accepts a minor zod-schema extension (documented in § "Architecture Patterns" Pattern 4), 김앤장 and 태평양 (BKL) join the live set, pushing Option A to **9 live firms**. This is the maximum Phase 2 can deliver without Playwright.

Recommendation: **Go with Option A + B combined (9 live firms, 3 deferred-as-disabled)**. The schema extension is cheap, both firms are Top-5 KR market presence, and the alternative (backup pool size = 3-4 more firms with the same level of audit depth) is more work than the schema extension. The 3 remaining js-render firms sit as `enabled: false` placeholders ready for Phase 4 or a further backup swap.

Final Option A+B live list (9 firms):

1. cooley (RSS, US) — existing
2. clifford-chance (RSS, UK)
3. freshfields (RSS, UK)
4. shin-kim (HTML, KR)
5. yulchon (HTML, KR)
6. skadden (HTML, US)
7. logos (HTML, KR)
8. kim-chang (HTML onclick-extract, KR)
9. bkl (HTML onclick-extract, KR)

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────┐
│ config/firms.yaml│ → loadFirms() filters enabled:true
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ fetchAll(firms)                                     │
│   pLimit(3) + Promise.allSettled                    │
│                                                     │
│   ┌─────────┐  per firm, robots.txt gate first     │
│   │ robots  │                                       │
│   └────┬────┘                                       │
│        ▼                                            │
│   switch(firm.type)                                 │
│   ┌──────┬──────┬──────────────┐                    │
│   │ rss  │ html │ js-render    │                    │
│   │scrapeRss│scrapeHtml│ throw │                    │
│   └───┬──┴──┬───┴──────────────┘                    │
│       │     │                                       │
│       ▼     ▼                                       │
│   RawItem[] RawItem[]                               │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│ enrichWithBody(firmResults) — NEW                   │
│   per firm, pLimit(1) + 500ms delay                 │
│   for each RawItem: charset-aware fetch             │
│   → cheerio.load → extractBody($, firm.selectors?.body)│
│   attach body to item (NOT persisted to state;      │
│   COMP-05 invariant — body lives only in memory)    │
└─────────────┬───────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────┐
│ applyKeywordFilter(firmResults) — NEW               │
│   per firm: include/exclude gate on title+body[:500]│
│   filters drop items BEFORE Gemini call             │
└─────────────┬───────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────┐
│ dedupAll(firmResults, seen)                         │
│   bootstrap guard extended (empty-state firms too)  │
└─────────────┬───────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────┐
│ summarize(newItems) — Phase 1 flow, unchanged       │
└─────────────┬───────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────┐
│ compose → render email with failed-firm footer      │
└─────────────┬───────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────┐
│ sendMail — pRetry wrapping, 535 AbortError          │
└─────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Responsibility | Change type |
|------|----------------|-------------|
| `src/scrapers/html.ts` | NEW. `scrapeHtml(firm) → RawItem[]`; charset-aware fetch + cheerio.load + selector-driven extraction. Handles both plain-href firms and onclick-extract firms via schema fork. | NEW |
| `src/scrapers/util.ts` | Add `decodeCharsetAwareFetch(url, opts) → Promise<string>`; add `extractOnclickHref(html, onclickRegex, template)`. Leave `canonicalizeUrl` / `parseDate` untouched. | EDIT |
| `src/pipeline/fetch.ts` | Swap `Promise.all` → `Promise.allSettled`. Add `html` branch to tier-dispatch switch (js-render throws "Phase 4 territory" per D-P2-09). | EDIT |
| `src/pipeline/enrichBody.ts` | NEW. `enrichWithBody(firmResults) → FirmResult[]`; shared by both tiers; per-firm `pLimit(1)` + 500ms min delay; populates in-memory `item.body` not on RawItem interface (keep COMP-05 strict — body ≠ persisted state). Failure path → leave body undefined, summary confidence stays low. | NEW |
| `src/pipeline/filter.ts` | NEW. `applyKeywordFilter(firmResults) → FirmResult[]` — pure function, uses `firm.include_keywords` / `firm.exclude_keywords`. | NEW |
| `src/pipeline/dedup.ts` | Extend bootstrap guard: also bootstrap when `priorFirm.urls.length === 0 && priorFirm.lastNewAt === null`. | EDIT |
| `src/mailer/gmail.ts` | Wrap `transporter.sendMail` in `pRetry({retries: 3, shouldRetry: ...})`. Keep existing 535 detection + `GMAIL_AUTH_FAILURE` marker. | EDIT |
| `src/compose/templates.ts` | Add failed-firm footer HTML. Use existing local `escapeHtml`; do NOT export it. | EDIT |
| `src/config/schema.ts` | Extend `FirmConfig` zod schema with `include_keywords?`, `exclude_keywords?`, `selectors.body?`, `selectors.link_onclick_regex?`, `selectors.link_template?`. | EDIT |
| `src/types.ts` | Mirror schema changes in TypeScript interfaces. | EDIT |
| `config/firms.yaml` | Add 8 new firm entries per Recommended Final Firm List (3 RSS + 4 HTML plain-href + 2 HTML onclick-extract + 3 `enabled: false` placeholders). | EDIT |

### Recommended Project Structure (after Phase 2)

```
src/
├── main.ts                  # composition root (EDIT to call enrichBody + filter)
├── types.ts                 # (EDIT — new selector fields)
├── env.ts
├── config/
│   ├── loader.ts
│   └── schema.ts            # (EDIT — zod extensions)
├── scrapers/
│   ├── rss.ts
│   ├── html.ts              # NEW
│   ├── robots.ts
│   └── util.ts              # (EDIT — charset + onclick helpers)
├── pipeline/
│   ├── fetch.ts             # (EDIT — allSettled + html branch)
│   ├── enrichBody.ts        # NEW
│   ├── filter.ts            # NEW
│   └── dedup.ts             # (EDIT — empty-state bootstrap)
├── summarize/
│   └── gemini.ts
├── compose/
│   └── templates.ts         # (EDIT — failed-firm footer)
├── mailer/
│   └── gmail.ts             # (EDIT — pRetry wrap)
├── state/
│   └── writer.ts
└── util/
    └── logging.ts
```

### Pattern 1: Charset-aware fetch for Korean sites

**What:** Fetch an HTML URL, decode to UTF-8 regardless of whether the remote served UTF-8, EUC-KR, or CP949.
**When to use:** Any `scrapers/html.ts` or `enrichBody.ts` call that will be fed to `cheerio.load`. Safe for UTF-8 responses too (passthrough).
**Example:**
```typescript
// Source: iconv-lite 0.7.2 README + Node 22 fetch
import iconv from 'iconv-lite';
import { USER_AGENT } from '../util/logging.js';

export async function decodeCharsetAwareFetch(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ html: string; status: number; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTML fetch ${url}: HTTP ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? '';
  // Priority 1: Content-Type charset
  let charset = /charset=([A-Za-z0-9_-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  // Priority 2: <meta charset="..."> or <meta http-equiv=...> inside first 4KB
  if (!charset || charset === 'iso-8859-1' /* default, usually lying */) {
    const head = buf.subarray(0, 4096).toString('ascii');
    charset =
      /<meta[^>]+charset=["']?([A-Za-z0-9_-]+)/i.exec(head)?.[1]?.toLowerCase() ??
      charset ??
      'utf-8';
  }
  // Normalize aliases
  const normalized = charset === 'euc-kr' || charset === 'ks_c_5601-1987' ? 'cp949' : charset;
  const html =
    normalized === 'utf-8' || normalized === 'utf8'
      ? buf.toString('utf8')
      : iconv.decode(buf, normalized);

  return { html, status: res.status, finalUrl: res.url };
}
```

**Why not TextDecoder:** Node 22's built-in `TextDecoder` supports only WHATWG-registered encodings (utf-8, utf-16le/be, iso-8859-*, windows-1252). `euc-kr` and `cp949` are not registered and `new TextDecoder('cp949')` throws `RangeError`. [VERIFIED: Node 22 docs — TextDecoder]

### Pattern 2: Body-extraction chain with cheerio 1.2

**What:** From full article HTML, extract the main body text.
**When to use:** Inside `enrichWithBody` for every item.
**Example:**
```typescript
// Source: Context7 /cheeriojs/cheerio 1.2 manipulation.md (remove/empty)
import * as cheerio from 'cheerio';

const BODY_SELECTOR_CHAIN = [
  'article',
  'main',
  '.entry-content',
  '.post-content',
  '.article-body',
  '#content',
] as const;

const STRIP_SELECTORS = [
  'script',
  'style',
  'nav',
  'aside',
  'footer',
  '.ad',
  '.social-share',
  '.related-posts',
  '[role="navigation"]',
].join(',');

export function extractBody(
  html: string,
  firmBodySelector?: string,
): string {
  const $ = cheerio.load(html, { decodeEntities: true });
  // Strip noise globally first so selectors match only signal
  $(STRIP_SELECTORS).remove();

  // Per-firm override wins (D-P2-11)
  if (firmBodySelector) {
    const override = $(firmBodySelector).first();
    if (override.length && override.text().trim().length > 0) {
      return normalize(override.text());
    }
  }

  // Generic chain
  for (const sel of BODY_SELECTOR_CHAIN) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 120) {
      return normalize(el.text());
    }
  }

  // Fallback: the <p>-dense parent
  let best = { el: $('body'), score: 0 };
  $('p').each((_, p) => {
    const parent = $(p).parent();
    const ps = parent.find('p').length;
    if (ps > best.score) {
      best = { el: parent, score: ps };
    }
  });
  return normalize(best.el.text());
}

function normalize(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
    .slice(0, 10_000);
}
```

**Verified against:** Shin & Kim article `/kor/media/newsletter/3235` has `.post-content` class (chain index 3 matches). Clifford Chance briefing `international-regulatory-update-...html` has `<article>` (chain index 0 matches). Both tested live 2026-04-17.

### Pattern 3: Selective SMTP retry with p-retry v8

**What:** Retry Gmail SMTP on transient 5xx (502/503/504); fail immediately on 535 auth or any other non-5xx.
**When to use:** Wrapping `transporter.sendMail` in `mailer/gmail.ts`.
**Example:**
```typescript
// Source: Context7 /sindresorhus/p-retry v8 README
import pRetry, { AbortError } from 'p-retry';
import nodemailer from 'nodemailer';
import { isDryRun } from '../env.js';
import { scrubSecrets } from '../util/logging.js';
import type { EmailPayload } from '../types.js';

export async function sendMail(payload: EmailPayload): Promise<void> {
  if (isDryRun()) {
    console.log('[DRY_RUN] Subject:', payload.subject);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: { user: payload.from, pass: process.env.GMAIL_APP_PASSWORD },
  });

  const sendOnce = async () => {
    try {
      await transporter.sendMail({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
    } catch (err) {
      const anyErr = err as { responseCode?: number; response?: string; message?: string };
      const code = anyErr.responseCode;
      // 535 auth → absolutely no retry, show recovery marker and AbortError
      if (code === 535 || (typeof anyErr.response === 'string' && anyErr.response.includes('535'))) {
        console.error('GMAIL_AUTH_FAILURE: App Password invalid or revoked.');
        console.error('Regenerate at https://myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD secret.');
        throw new AbortError(`SMTP 535 auth: ${scrubSecrets(anyErr.message ?? String(err))}`);
      }
      // Other non-5xx (4xx auth-ish, timeouts without code) → no retry
      if (typeof code === 'number' && (code < 500 || code >= 600)) {
        throw new AbortError(`SMTP ${code}: ${scrubSecrets(anyErr.message ?? String(err))}`);
      }
      // Transient (5xx, or code missing entirely — treat as network blip, retryable)
      throw new Error(`SMTP transient: ${scrubSecrets(anyErr.message ?? String(err))}`);
    }
  };

  await pRetry(sendOnce, {
    retries: 3,
    factor: 2,
    minTimeout: 2_000,
    maxTimeout: 8_000,
    onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
      console.warn(
        `[SMTP retry ${attemptNumber}/${attemptNumber + retriesLeft}] ${error.message}`,
      );
    },
  });
}
```

**Key API verifications (p-retry v8 via Context7, 2026-04-17):**
- `AbortError` bypasses retry logic AND does not trigger `onFailedAttempt` — exactly what EMAIL-07 needs.
- `onFailedAttempt` receives `{attemptNumber, retriesLeft, error}` — same shape as Phase 1's `gemini.ts` usage (STATE.md 01-06 log entry confirms).
- `shouldRetry` is an alternative to AbortError; for EMAIL-07 the AbortError pattern is clearer (per-error-class explicit intent).

### Pattern 4: Onclick-URL extraction for 김앤장 / 태평양 (optional schema extension)

**What:** For firms whose list page uses `onclick="goDetail('X','Y')"` or `onclick="goView('Z')"` instead of plain `href`, reconstruct the real URL via regex + template.
**When to use:** 김앤장 and 태평양 (BKL) on the HTML tier. Cheaper than Playwright, cleaner than a per-firm scraper fork.
**Schema extension (zod):**
```typescript
// src/config/schema.ts — additive fields only
selectors: z.object({
  list_item: z.string(),
  title: z.string(),
  // existing plain href extractor
  link: z.string().optional(),
  // NEW: onclick pattern (regex with capture groups) + URL template (uses {1}, {2}, ...)
  link_onclick_regex: z.string().optional(),
  link_template: z.string().optional(),
  date: z.string().optional(),
  body: z.string().optional(), // D-P2-11 per-firm body override
}).refine(
  (s) => !!s.link || (!!s.link_onclick_regex && !!s.link_template),
  { message: 'Each firm needs either selectors.link OR (selectors.link_onclick_regex + selectors.link_template)' },
)
```
**Example config entry (kim-chang):**
```yaml
  - id: kim-chang
    name: 김앤장 법률사무소
    language: ko
    type: html
    url: https://www.kimchang.com/ko/newsletter.kc
    timezone: Asia/Seoul
    enabled: true
    selectors:
      list_item: "ul.notice_list > li"
      title: ".notice_txt .title, .notice_txt._dotdotdot_news"
      link_onclick_regex: "goDetail\\('(\\d+)','(\\d+)'\\)"
      link_template: "https://www.kimchang.com/ko/insights/detail.kc?sch_section={1}&idx={2}"
      date: ".notice_date"
```
**Example scrapeHtml branch:**
```typescript
// Inside scrapeHtml — per-item URL extraction
let url: string;
if (firm.selectors.link) {
  url = canonicalizeUrl($(item).find(firm.selectors.link).attr('href') ?? '', firm.url);
} else if (firm.selectors.link_onclick_regex && firm.selectors.link_template) {
  const onclick = $(item).find('a').attr('onclick') ?? $(item).attr('onclick') ?? '';
  const match = new RegExp(firm.selectors.link_onclick_regex).exec(onclick);
  if (!match) continue; // skip malformed item, don't tank the firm
  let resolved = firm.selectors.link_template;
  for (let i = 1; i < match.length; i++) {
    resolved = resolved.replace(`{${i}}`, match[i]);
  }
  url = canonicalizeUrl(resolved, firm.url);
} else {
  throw new Error(`firm ${firm.id}: invalid selectors — neither link nor link_onclick_regex+link_template`);
}
```

### Anti-Patterns to Avoid

- **Using browser-emulating User-Agent strings.** Phase 1 locked the honest `LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)` UA. Some KR firms may return different responses to bot-looking UAs, but lying is a COMP-03/FETCH-04 regression.
- **`cheerio.load(html, { xmlMode: true })`** for HTML inputs. xmlMode refuses to normalize common HTML malformations and breaks the body-extraction chain. Default mode handles everything we need.
- **Regex-parsing HTML** to strip unwanted tags. Use `$(selector).remove()` — the entire point of depending on cheerio.
- **Calling `iconv.decode()` on already-UTF-8 Buffers** labeled as `utf-8`. The Pattern 1 code path short-circuits for utf-8 — preserve that. Double-decoding corrupts Korean and European text silently.
- **Running `enrichWithBody` before `dedup`.** Order must be `fetch → enrich → filter → dedup → summarize`. Enrich-before-dedup wastes network on items we already have in state (bootstrap aside). On days where a firm publishes zero new items after dedup, `enrichWithBody` would still fire N times for no gain. Plan Wave 0 test explicitly verifies this ordering.
- **Putting `body` on the persisted `RawItem` type.** COMP-05 prohibits persisting article bodies. Add body as an internal pipeline-only field (e.g., `EnrichedItem extends RawItem { body?: string }`) that never reaches `state/seen.json`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Korean charset decoding | Hand-rolled byte-to-unicode EUC-KR tables | `iconv-lite.decode(buf, 'cp949')` | Edge cases (partial bytes at stream boundary, KS C 5601 vs Unified Hangul, Windows CP949 extensions) — library has 10+ years of Korean encoding bug fixes. |
| HTML entity decoding | Regex replacements on `&amp;` / `&#xNN;` / `&eacute;` | `cheerio.load(html, { decodeEntities: true })` (already the default) | HTML entity list is ~2,000 names; also numeric/hex entities; also UTF-16 surrogate pair handling. Not a weekend project. |
| SMTP retry backoff | While-loop with setTimeout | `pRetry` with `shouldRetry` or `AbortError` | Exponential backoff with jitter, selective abort, integration with error types — 150 lines of nuance that the library gets right. |
| Body extraction from arbitrary firm HTML | Custom readability-lite algorithm | cheerio selector chain + `$.remove()` | We have site-specific selectors (from the audit) and a generic chain for unknown future firms. The readability algorithm is for untrusted open-web content, not a config-first known-firm scraper. |
| Per-firm rate limiting | `setTimeout` soup | `p-limit(1)` for the firm's detail-fetch stage + 500ms min delay | Already depended-on; idiomatic. |
| Robots.txt parsing for v2 | More hand-rolled rules (User-agent: *, Disallow:, Allow:, wildcards, Crawl-delay) | `robots-parser` npm package (stefanpenner/robots-parser) | Phase 1 hand-rolled a minimal star-only parser. Phase 2 still fits the minimal parser (no audit firm uses Allow-override or wildcards in newsletter paths). If Phase 3 audit or new firms surface such features, swap then. Documented as a deferred decision, not an immediate action. |
| YAML parsing | `JSON.parse(JSON.stringify(...))` tricks | `yaml` (eemeli) already in deps | N/A; already using it. |
| Failed-promise iteration | `Promise.all` + per-firm try/catch (current code — works but is fragile) | `Promise.allSettled` — single line change | `allSettled` removes an entire class of "what if the try-wrap misses?" regressions. |

**Key insight:** Every custom solution we avoid here saves us from a 3am cron-job failure two months from now. The iconv-lite Korean edge cases alone would be a week of debugging if we tried to roll our own.

## Runtime State Inventory

Phase 2 is feature-additive, not rename/refactor. No existing stored data or OS-registered state is being renamed. Still running the inventory for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `state/seen.json` version=1 — adding 6-8 new firms means new top-level keys under `firms.{id}`. Existing `cooley` entry untouched. First run for each new firm triggers bootstrap (DEDUP-05). | No migration. First run is a silent seed per Phase 1 D-09. |
| Live service config | None. | — |
| OS-registered state | GHA cron `daily.yml` already exists; unchanged schedule. | None. |
| Secrets/env vars | No new secrets. `GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`, `RECIPIENT_EMAIL` all already set for Phase 1. | None. |
| Build artifacts | `node_modules` will grow by one package (`iconv-lite` ~150KB). | `pnpm install` after lockfile update. |

**Nothing found in category:** Live service config, OS-registered state, secrets — verified by reading the GHA workflow and `.env.example`.

## Common Pitfalls

### Pitfall 1: `Promise.all` in `fetchAll` can still short-circuit if the inner `limit()` wrapper ever throws synchronously

**What goes wrong:** Phase 1's `fetchAll` wraps each firm in `limit(async () => { try { ... } catch { ... } })`. If a future refactor accidentally moves code OUTSIDE the inner try (e.g., URL parsing for `new URL(firm.url).origin` is OUTSIDE the try in Phase 1), that error escapes the per-firm catch and `Promise.all` rejects the whole run.
**Why it happens:** Try placement is an implementation detail; `Promise.all` semantics are not.
**How to avoid:** Use `Promise.allSettled`. Every firm produces a `PromiseSettledResult<FirmResult>`; for `rejected` entries, synthesize a `FirmResult` with `error.stage = 'fetch'` and `error.message` from `result.reason`. The outer function returns `FirmResult[]` guaranteed same-length as input.
**Warning signs:** Any exception from `new URL(firm.url)` (unlikely with zod-validated config but possible with malformed YAML), any early typecheck throw, any synchronous import-time error.

### Pitfall 2: `canonicalizeUrl` drops query params that legacy ASP sites depend on

**What goes wrong:** 법무법인 로고스 uses URLs like `/sub/news/newsletter_view.asp?b_idx=1443&page=1&s_type=&s_keyword=`. The item identifier is `b_idx`. `s_type`, `s_keyword`, `page` are ambient request params, not item identity. `canonicalizeUrl`'s TRACKING_PARAMS currently strips 12 marketing + 3 session params but NOT `page`/`s_type`/`s_keyword`. These params persist, inflating state size and causing rare false-new-item events if the firm's pagination ever changes those values.
**Why it happens:** TRACKING_PARAMS was curated from utm_*, HubSpot, Marketo — a marketing-tracker universe. Legacy Korean ASP sites use different param taxonomies.
**How to avoid:** Either (a) add `page`, `s_type`, `s_keyword` to TRACKING_PARAMS explicitly, or (b) add a per-firm `strip_query_params: [page, s_type, s_keyword]` YAML field. Option (a) is simpler and universally safe — `page` is always pagination, never identity; same for the others.
**Warning signs:** State file contains multiple entries that look identical except for `page=` values.

### Pitfall 3: EUC-KR BOM quirks

**What goes wrong:** Some older KR sites prefix responses with a UTF-8 BOM (`EF BB BF`) even when the actual bytes are EUC-KR. `Content-Type: text/html; charset=utf-8` lies; `<meta charset="utf-8">` lies. Real bytes are CP949. `iconv.decode(buf, 'utf-8')` then produces mojibake.
**Why it happens:** Lots of KR corporate sites built on legacy JSP/ASP stacks serve headers from the web server's default config while the actual rendered HTML is encoded by a different pipeline. The server-declared charset can be wrong.
**How to avoid:** As a robustness heuristic, if decoded-as-utf8 contains >3% replacement characters (`\uFFFD`) or a high density of bytes in the 0x80-0xFE range that are hangul in CP949, retry with `iconv.decode(buf, 'cp949')`. None of the seven audited KR sites exhibited this today (all were valid UTF-8), so defer this mitigation to v1.x — document as watched-pitfall, not shipping code.
**Warning signs:** `body.length > 0` but `body` contains many `?` characters; Gemini returns confidence `low` with "cannot read the provided text" reasoning.

### Pitfall 4: cheerio 1.2 `$.text()` collapses non-breaking spaces differently on different firm HTML

**What goes wrong:** `$.text()` returns `\u00a0` (non-breaking space) where the source HTML had `&nbsp;`. If downstream string ops rely on `/\s+/` (standard whitespace), `\u00a0` leaks through unnormalized, causing inconsistent `.slice(0, 500)` boundaries for the keyword filter.
**Why it happens:** JavaScript `\s` in regex does NOT include U+00A0 by default; you need `/[\s\u00a0]+/`. cheerio preserves entity-decoded `\u00a0` faithfully.
**How to avoid:** In the `normalize()` helper of Pattern 2, replace `\u00a0` with space BEFORE the `\s+` collapse. Shown in the Pattern 2 code.
**Warning signs:** Body text looks fine in logs but keyword filter misses obvious Korean/English keywords near non-breaking spaces.

### Pitfall 5: Relative URL resolution in onclick-extract path

**What goes wrong:** 김앤장's `goDetail('4','34505')` maps via `link_template` to `/ko/insights/detail.kc?sch_section=4&idx=34505`. If `link_template` is relative, the canonicalizer needs a base — but the current `scrapeHtml` signature passes `firm.url` as base. `firm.url` for K&C is `/ko/newsletter.kc` (the list page), not the origin. `new URL('/ko/insights/detail.kc?...', 'https://www.kimchang.com/ko/newsletter.kc')` does resolve correctly (URL spec rebases path-absolute hrefs to the origin), but only because the template starts with `/`. If someone writes a template like `detail.kc?sch_section=...` without the leading `/`, resolution goes to `/ko/detail.kc?...` — wrong path.
**Why it happens:** URL resolution rules are subtle (RFC 3986 §5.2 merging); template authors may not appreciate them.
**How to avoid:** Require `link_template` to be either fully absolute or path-absolute (`starts with "/"`). Enforce via zod regex: `z.string().regex(/^(https?:\/\/|\/)/)`. Fail config load with a helpful message.
**Warning signs:** 404 from detail fetches for firms using onclick-extract; bodies never populate.

### Pitfall 6: Bootstrap regression after manual state edit

**What goes wrong:** Someone manually edits `state/seen.json` to clear a firm's URLs for testing (`"firms": {"shin-kim": {"urls": [], "lastNewAt": null}}`). Without the Phase 2 bootstrap extension, dedup sees `priorFirm` is defined → dedups against empty set → every current item is "new" → the whole back-catalog floods the next digest.
**Why it happens:** D-09 bootstrap in Phase 1 only checks `!priorFirm` (undefined) — an edited-to-empty firm is defined but empty.
**How to avoid:** Extend the bootstrap condition to also treat `{urls: [], lastNewAt: null}` as bootstrap (D-P2-08). Add a unit test with this exact state shape.
**Warning signs:** Manually-staged test run produces an enormous email.

### Pitfall 7: p-retry v8 `onFailedAttempt` signature drift regression guard

**What goes wrong:** Phase 1's `gemini.ts` already uses p-retry v8 `onFailedAttempt` with destructured `{error, attemptNumber, ...}` (per STATE.md 01-06 log). If Phase 2's `mailer/gmail.ts` refactor accidentally types the callback as `(err: Error) => void` (the v6 shape), it compiles (because of the `any`-threading) but prints an empty log line at runtime.
**Why it happens:** v6 → v8 API shape drift; easy to copy the wrong pattern from old blog posts.
**How to avoid:** Consistent `{attemptNumber, retriesLeft, error}` destructuring across both call sites. Add a grep gate as a plan acceptance check: `grep -c "attemptNumber" src/mailer/gmail.ts` must equal exactly 1.
**Warning signs:** SMTP retry logs print "[SMTP retry undefined/undefined]" at runtime.

### Pitfall 8: Skadden `/insights` monthly-only cadence hides in "silent firm" noise

**What goes wrong:** Skadden's monthly Insights digest publishes ONCE per month — around the last week. On 25 out of 30 days, Skadden produces zero new items, indistinguishable from "scraper broken". Phase 3 OPS-04 staleness warnings would fire a false alarm on day 31 if threshold is 30 days.
**Why it happens:** The one feasible SSR Skadden page publishes monthly, not daily. Other US firm publications are JS-rendered.
**How to avoid:** Per-firm `expected_cadence_days: 30` field (future enhancement, v1.x) OR tolerate the false alarm and document it in the firm's YAML comment. For Phase 2, go with the latter — add an inline comment.
**Warning signs:** "Skadden 31 days silent" email footer warnings in Phase 3 runs.

### Pitfall 9: `Promise.allSettled` loses error types

**What goes wrong:** `Promise.allSettled` returns `PromiseSettledResult<T>` where `rejected.reason` is typed `any` (TS unknown at best). When synthesizing the per-firm error FirmResult, naive `.message` access compiles but may be undefined.
**Why it happens:** `reason` can be any throwable (`throw "string"` is legal JS); can't statically narrow.
**How to avoid:** In the settled-result mapper, use `reason instanceof Error ? reason.message : String(reason)` with scrubSecrets applied. Pattern:
```typescript
const settled = await Promise.allSettled(firms.map((f) => limit(() => fetchOneFirm(f))));
return settled.map((r, i) => {
  if (r.status === 'fulfilled') return r.value;
  const reason = r.reason;
  return {
    firm: firms[i],
    raw: [],
    new: [],
    summarized: [],
    error: {
      stage: 'fetch',
      message: scrubSecrets(reason instanceof Error ? reason.message : String(reason)),
    },
    durationMs: 0,
  };
});
```
**Warning signs:** Email footer shows "failed firm: undefined" as the error message.

## Code Examples

### Example 1: failure-isolation composition in `pipeline/fetch.ts`

```typescript
// Source: Phase 1 fetch.ts pattern + Promise.allSettled defense-in-depth
import pLimit from 'p-limit';
import { scrapeRss } from '../scrapers/rss.js';
import { scrapeHtml } from '../scrapers/html.js';
import { fetchRobots, isAllowed } from '../scrapers/robots.js';
import { scrubSecrets } from '../util/logging.js';
import type { FirmConfig, FirmResult } from '../types.js';

export async function fetchAll(firms: FirmConfig[]): Promise<FirmResult[]> {
  const limit = pLimit(3);
  const settled = await Promise.allSettled(
    firms.map((firm) =>
      limit(async (): Promise<FirmResult> => {
        const started = Date.now();
        const origin = new URL(firm.url).origin;
        const disallows = await fetchRobots(origin);
        if (!isAllowed(firm.url, disallows)) {
          throw new Error(`robots.txt disallows ${firm.url}`);
        }
        let raw;
        switch (firm.type) {
          case 'rss':
            raw = await scrapeRss(firm);
            break;
          case 'html':
            raw = await scrapeHtml(firm);
            break;
          case 'js-render':
            throw new Error(`firm ${firm.id}: js-render tier is Phase 4 territory`);
        }
        return { firm, raw, new: [], summarized: [], durationMs: Date.now() - started };
      }),
    ),
  );
  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const reason = r.reason;
    return {
      firm: firms[i],
      raw: [],
      new: [],
      summarized: [],
      error: {
        stage: 'fetch',
        message: scrubSecrets(reason instanceof Error ? reason.message : String(reason)),
      },
      durationMs: 0,
    };
  });
}
```

### Example 2: failed-firm footer composition in `compose/templates.ts`

```typescript
// Source: D-P2-04 format + Phase 1 escapeHtml local-only pattern
function classifyError(msg: string, stage: string): string {
  if (msg.includes('robots.txt disallows')) return 'robots-blocked';
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return 'fetch-timeout';
  const http = /HTTP (\d{3})/.exec(msg);
  if (http) return `http-${http[1]}`;
  if (/ENOTFOUND|DNS/i.test(msg)) return 'dns-fail';
  if (stage === 'parse' || /parse|selector/i.test(msg)) return 'parse-error';
  if (/selectors? (miss|not found)/i.test(msg)) return 'selector-miss';
  return 'unknown';
}

export function renderFailedFirmsFooter(firms: FirmResult[]): string {
  const failed = firms.filter((f) => f.error);
  if (failed.length === 0) return '';
  const items = failed
    .map((f) => {
      const errClass = classifyError(f.error!.message, f.error!.stage);
      const line1 = f.error!.message.split('\n')[0].slice(0, 140);
      return `<li>${escapeHtml(f.firm.name)} (${escapeHtml(f.firm.id)}) — ${errClass}: ${escapeHtml(line1)}</li>`;
    })
    .join('');
  return `
<footer style="margin-top:32px;color:#999;font-size:12px;">
  ⚠ 이번 실행에서 수집 실패 — 다음 실행에서 재시도됩니다:
  <ul style="margin:4px 0;">${items}</ul>
  AI 요약 — 원문 확인 필수
</footer>`.trim();
}

// escapeHtml remains local to this file per Phase 1 01-08 decision
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
```

### Example 3: keyword filter (pure function)

```typescript
// Source: D-P2-07 spec
import type { FirmResult, RawItem } from '../types.js';

export interface EnrichedItem extends RawItem {
  body?: string; // populated by enrichWithBody; pipeline-only; NEVER persisted
}

export function applyKeywordFilter(results: FirmResult[]): FirmResult[] {
  return results.map((r) => {
    if (r.error) return r;
    const firm = r.firm;
    const inc = (firm.include_keywords ?? []).map((k) => k.toLowerCase());
    const exc = (firm.exclude_keywords ?? []).map((k) => k.toLowerCase());
    if (inc.length === 0 && exc.length === 0) return r;
    const filtered = (r.raw as EnrichedItem[]).filter((item) => {
      const haystack =
        (item.title + ' ' + (item.body ?? item.description ?? '').slice(0, 500)).toLowerCase();
      const includeOk = inc.length === 0 || inc.some((k) => haystack.includes(k));
      const excludeOk = exc.every((k) => !haystack.includes(k));
      return includeOk && excludeOk;
    });
    return { ...r, raw: filtered };
  });
}
```

### Example 4: scrapeHtml skeleton with both plain-href and onclick-extract branches

```typescript
// Source: Pattern 1 + Pattern 4 composed
import * as cheerio from 'cheerio';
import { decodeCharsetAwareFetch, canonicalizeUrl, parseDate } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';

export async function scrapeHtml(firm: FirmConfig): Promise<RawItem[]> {
  if (!firm.selectors) {
    throw new Error(`firm ${firm.id}: html tier requires selectors`);
  }
  const { html } = await decodeCharsetAwareFetch(firm.url, { timeoutMs: firm.timeout_ms ?? 20_000 });
  const $ = cheerio.load(html, { decodeEntities: true });
  const items: RawItem[] = [];
  $(firm.selectors.list_item).each((_, el) => {
    try {
      const title = $(el).find(firm.selectors!.title).first().text().trim();
      if (!title) return;
      let url: string;
      if (firm.selectors!.link) {
        const href = $(el).find(firm.selectors!.link).attr('href') ?? '';
        if (!href) return;
        url = canonicalizeUrl(href, firm.url);
      } else if (firm.selectors!.link_onclick_regex && firm.selectors!.link_template) {
        const anchor = $(el).find('a[onclick]').first();
        const onclick =
          anchor.attr('onclick') ?? ($(el).attr('onclick') ?? '');
        const match = new RegExp(firm.selectors!.link_onclick_regex).exec(onclick);
        if (!match) return;
        let resolved = firm.selectors!.link_template;
        for (let i = 1; i < match.length; i++) {
          resolved = resolved.replace(`{${i}}`, match[i]);
        }
        url = canonicalizeUrl(resolved, firm.url);
      } else {
        return;
      }
      let publishedAt: string | undefined;
      if (firm.selectors!.date) {
        const dateText = $(el).find(firm.selectors!.date).first().text().trim();
        if (dateText) {
          // Firm-local date → UTC via parseDate helper
          // Expected formats from audit: YYYY.MM.DD / YYYY. MM. DD. / "17 April 2026" / RFC-822
          // Normalize minimal dot-slash separators; leave the rest to parseDate's tolerance.
          const iso = normalizeDateString(dateText);
          if (iso) publishedAt = parseDate(iso, firm.timezone);
        }
      }
      items.push({
        firmId: firm.id,
        title,
        url,
        publishedAt,
        language: firm.language,
        description: undefined, // enrichWithBody populates body separately
      });
    } catch {
      // Per-item isolation — one malformed item doesn't tank the firm
    }
  });
  return items;
}

function normalizeDateString(raw: string): string | null {
  // "2026.04.17" or "2026. 04. 17." or "2026.04.17." → "2026-04-17T00:00:00"
  const m = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/.exec(raw);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T00:00:00`;
  // "17 April 2026" — rely on parseDate's fromZonedTime accepting Date.parse-friendly forms
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19);
  return null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `request` + manual charset handling | Node 22 native `fetch` + `iconv-lite` | Node 22 LTS reached GA April 2024, native fetch removed the need for a third-party HTTP client | Smaller dep tree; still need iconv-lite because `TextDecoder` doesn't cover Korean |
| `puppeteer` for any SPA | `Playwright --only-shell` for confirmed-necessary cases only | Playwright ≥ 1.46 added `--only-shell` reducing binary from ~300MB to ~100MB; still Phase 4 territory | N/A for Phase 2 |
| `@google/generative-ai` | `@google/genai` 1.50.x | Google deprecated the old SDK in 2025 | Phase 1 already on new SDK; Phase 2 unchanged |
| `rss-parser` | `feedparser` 2.3.x | rss-parser unmaintained 3+ years as of 2026-04 | Phase 1 locked on feedparser; Phase 2 unchanged |
| `p-retry` v6 | `p-retry` v8 with `shouldRetry` + destructured `onFailedAttempt` context | v8 released mid-2025 | Phase 1 `gemini.ts` already on v8; Phase 2 mailer edit follows the same callback shape |

**Deprecated/outdated:**
- `request`, `node-fetch` npm packages — obsolete; Node 22 has native fetch.
- Hand-rolled robots.txt star-only parsers beyond single-firm scope — `robots-parser` npm pkg covers wildcards/Allow-override for when audit firms grow.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Korean 로고스 is a suitable backup firm (legal-newsletter relevance) | Firm Audit § logos | Low — they do publish newsletters; if user rejects, swap to 지평 (accept PDF-extraction complexity) or drop the slot to `enabled: false`. [ASSUMED] |
| A2 | Skadden's monthly `/insights` page stability — the SSR pattern holds month to month, not just for the April 2026 snapshot | Firm Audit § skadden | Medium — Skadden redesigns could break selectors; documented as "monthly" in firm comment. Mitigation = staleness warning in Phase 3 will catch silent breakage. [ASSUMED] |
| A3 | The 500ms min delay between detail fetches for the same firm is polite enough | Architecture Patterns § Component responsibilities enrichBody | Low — single-user automation, small firms. If anyone complains, raise to 1000ms. [ASSUMED] |
| A4 | No audited firm uses `Allow:` directives or wildcards in robots.txt that would require the full robots-parser library | Don't Hand-Roll § robots.txt | Low — verified by inspection of 13 fetched robots.txt files today; no Allow-override or wildcards encountered on newsletter paths. [VERIFIED] |
| A5 | `iconv-lite` 0.7.2 continues to be maintained and has no CVEs. | Standard Stack § iconv-lite | Low — last release within the year, 10+ years of stability, no known CVEs in current version. Re-check at `pnpm install` time. [ASSUMED — not re-verified today] |
| A6 | Gmail SMTP currently treats 5xx codes as transient in the way p-retry expects | Code Examples § Pattern 3 | Low — Gmail's SMTP error taxonomy is well documented; 5xx maps to transient, 535 is the classic auth code. [CITED: nodemailer 8.x docs + Gmail SMTP reference] |
| A7 | No candidate firm changes its SSR/CSR behavior between now and Phase 2 plan execution (~1 week lead time) | Firm Audit § all | Medium — firm-site rebuilds happen; audit date is 2026-04-17. Plan should include per-firm "verify selectors still match" step before enabling in production. |
| A8 | Clifford Chance's `/rss/main.html` and `/rss/rss-feed-briefings.html` continue to return valid RSS XML despite the `.html` suffix. | Firm Audit § clifford-chance | Low — observed today, with proper `<?xml ... ?>` opening despite `text/html` Content-Type header. They're obviously serving a CMS alias. Should be stable but confirmed minor risk. [VERIFIED today, tagged for re-verify in plan] |
| A9 | 김앤장 and 태평양 (BKL) onclick patterns (`goDetail`, `goView`) don't change their argument shape | Firm Audit § kim-chang, bkl | Medium — the onclick-extract pattern is more fragile than plain `href`. Mitigation = strong per-item isolation + selector-miss email footer reporting (EMAIL-05 catches this) + periodic selector audit. |

Claims tagged `[ASSUMED]` that materially affect execution: A1 (backup firm choice), A5 (iconv-lite security), A7 (selector freshness at plan-execution time), A9 (onclick pattern stability). The planner should bake verification steps for A1 + A7 + A9 into the plans (small live-fetch smoke tests in Wave 0 / per-firm plan).

## Open Questions

1. **Approve Option A+B (9 live firms, 3 disabled placeholders) as the final list for `config/firms.yaml`?**
   - What we know: 9 firms are fully audited and HTML/RSS-scrapable today.
   - What's unclear: Whether user considers the 9-firm delivery acceptable for Phase 2's 12-firm goal, or wants the backup pool expanded further.
   - Recommendation: Accept Option A+B. Revisit Phase 4 entry gate in ~1 month when real cron-run data shows which of the 9 live firms actually produce items consistently. JS-render-only firms can come in Phase 4 or further backup-pool substitution.

2. **Approve the zod schema extension for `link_onclick_regex` + `link_template`?**
   - What we know: Cost = ~10 lines zod + ~15 lines scrapeHtml + ~20 lines test.
   - What's unclear: Whether user wants additional complexity vs dropping 김앤장/BKL.
   - Recommendation: Accept. Both firms are Top-5 KR market; alternatives (further backup expansion) are more expensive than this extension. The `link_template` validation guard (Pitfall 5) mitigates misuse.

3. **Extend `TRACKING_PARAMS` to include `page`, `s_type`, `s_keyword` for 로고스 URL canonicalization?**
   - What we know: These are ambient ASP query params, not item identity (Pitfall 2).
   - What's unclear: Risk of false merges for firms that might use `page=` to identify different items (no audited firm does today).
   - Recommendation: Accept the extension. All 13 audited firms treat `page` as pagination. If a future firm uses it as identity, that firm's plan handles it explicitly.

4. **Should Phase 2 ship any `include_keywords` defaults, or start with no filters across all firms?**
   - What we know: D-P2-07 allows per-firm filters; Freshfields mixes press releases + news (where filters would help) but Shin & Kim / Yulchon / etc. publish only legal newsletters (no filter needed).
   - What's unclear: User's quota sensitivity — with 9 firms × ~2 items/day = ~18 items/day, Gemini Flash's 250 RPD has ~12x headroom. Filters are optional.
   - Recommendation: Start with no filters (empty arrays). If Freshfields or another firm pollutes the digest with irrelevant press releases, add them per-firm later.

5. **Should Phase 2 or Phase 4 handle the `robots-parser` swap?**
   - What we know: All audited firms use simple robots.txt; hand-rolled Phase 1 parser covers them.
   - Recommendation: Defer to Phase 4 or v1.x. No current value added.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Runtime | ✓ (local) | — | n/a — GHA provides |
| pnpm 9.15.0 | Package manager | ✓ (local) | — | npm works (not recommended for GHA cache stability) |
| GHA runner with `ubuntu-latest` | Cron execution | ✓ | — | — |
| Gmail SMTP connectivity | Email delivery | ✓ (verified Phase 1) | — | — |
| Gemini API | Summarization | ✓ (verified Phase 1) | free tier | Flash-Lite fallback |
| Outbound network to audit targets (kimchang.com, shinkim.com, yulchon.com, bkl.co.kr, lawlogos.com, cliffordchance.com, freshfields.com, skadden.com) | HTML/RSS fetch | ✓ (all 200 OK today) | — | Per-firm failure isolation (Promise.allSettled) degrades gracefully |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives are in scope for Phase 2 research:

- **Budget $0/month** — iconv-lite is free, zero-runtime-cost. No new paid APIs. ✓
- **AI source = Gemini free tier only** — Phase 2 doesn't change summarization; Gemini flow unchanged. ✓
- **Execution = GHA cron** — Phase 2 preserves this; no additional scheduled runs. ✓
- **Email delivery = Gmail SMTP / App Password** — Phase 2 edits `mailer/gmail.ts` but keeps the transport. ✓
- **Scraping politeness: 1 req/firm/day spirit** — D-P2-10 enforces per-firm `pLimit(1)` on detail fetches + 500ms min delay; total per-firm budget ≈ 1 list + N detail (N ≤ 3 typical) ≤ 4 requests/day/site. ✓
- **Config UX: non-developer edits only** — Schema extensions for `link_onclick_regex`/`link_template`/`body` are documented with YAML comments in `config/firms.yaml`. ✓
- **Secrets: no plaintext in repo** — No new secrets. Existing `GEMINI_API_KEY`/`GMAIL_APP_PASSWORD`/`RECIPIENT_EMAIL` unchanged. ✓
- **GSD workflow enforcement** — All Phase 2 file edits flow through `/gsd-plan-phase` and `/gsd-execute-phase`. No direct edits. ✓
- **Use official `@google/genai` NOT `@google/generative-ai`** — Phase 1 locked; Phase 2 unchanged. ✓
- **Use Gemini 2.5 Flash / Flash-Lite; NOT 2.0** — Phase 1 locked; Phase 2 unchanged. ✓
- **No `puppeteer`; avoid Playwright unless necessary** — Phase 2 is Playwright-free per D-P2-09. ✓

## Sources

### Primary (HIGH confidence — Context7 + official docs + live verification today)

- `/cheeriojs/cheerio` Context7 (API ref) — `$.extract()`, `$.remove()`, `$.empty()` idioms verified [fetched 2026-04-17]
- `/sindresorhus/p-retry` Context7 (API ref) — `AbortError` + `shouldRetry` + `onFailedAttempt` signatures verified [fetched 2026-04-17]
- `https://www.npmjs.com/package/iconv-lite` — v0.7.2 (latest) [fetched 2026-04-17]
- `https://www.npmjs.com/package/cheerio` — v1.2.0 (latest) [fetched 2026-04-17]
- `https://www.npmjs.com/package/p-retry` — v8.0.0 (latest) [fetched 2026-04-17]
- Live HTTP fetches of all 12 candidate + 2 backup firm sites (2026-04-17 UTC+9) including robots.txt, listing pages, sample article bodies — see § Firm Audit Results for URLs
- `https://github.com/ashtuchkin/iconv-lite` README — Korean encoding names and decode API via WebFetch [fetched 2026-04-17]

### Secondary (MEDIUM confidence — WebSearch cross-verified)

- Clifford Chance RSS feed landing page (`/rss.html`) — confirmed via WebSearch + direct fetch [2026-04-17]
- Freshfields `/en/rss/news` — discovered via home-page link scan + direct fetch confirmation (returns `application/rss+xml`) [2026-04-17]

### Tertiary (LOW confidence — to validate at plan-execution time)

- 로고스 (lawlogos.com) corporate identity / firm size / publication volume — WebSearch surfaced the site but organizational details (vs other same-named firms) would benefit from a user sanity-check.
- Firm-site stability between 2026-04-17 audit and Phase 2 plan-execution time (~1 week) — per A7 in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry on 2026-04-17; Context7 confirmed library APIs.
- Architecture: HIGH — patterns tested against Phase 1's extant code and validated by CLAUDE.md constraints.
- Firm audit: HIGH for classification (12 live probes on audit date); MEDIUM for "how this firm looks in 1 week" (selector drift).
- Pitfalls: HIGH for Pitfalls 1-9 — each is grounded in either Phase 1 code review findings or observed audit data.

**Research date:** 2026-04-17
**Valid until:** 2026-04-24 (7 days for firm-site selector freshness; 30 days for library versions and patterns)
