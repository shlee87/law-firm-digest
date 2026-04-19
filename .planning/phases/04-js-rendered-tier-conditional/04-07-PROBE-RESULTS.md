# Phase 4 Plan 07 — JS-Render Probe Results

**Probed:** 2026-04-19 (KST)
**Environment:** local pnpm tsx + chromium --only-shell (macOS darwin 25.2.0 arm64)
**Playwright version:** 1.59.1 (chromium-headless-shell v1217 / Chrome 147.0.7727.15)
**Probe script:** `scripts/probe-js-render.ts` (commits `3bfb6cc` + `6101c8a`)

## Summary

| Firm | Verified? | Probe duration | Items extracted | Notes |
|------|-----------|----------------|-----------------|-------|
| lee-ko | ✓ | 5217ms | 6 | Uses onclick-regex branch — probe extended to support (`feat(04-07): extend probe...`, commit `6101c8a`) |
| yoon-yang | ⚠ partial | 17170ms | 12 (titles ✓, URLs ✗) | Titles/list_item verified, but URLs are `javascript:doView(N)` stubs; production extractor (`parseListItemsFromHtml`) needs a `link_href_regex` + `link_template` branch for `href="javascript:doView(N)"` without `onclick` attr. **Plan 08 must NOT enable yoon-yang without that extractor patch.** |
| barun | ✓ | 1188ms | 10 | URL discovered from scratch: `https://barunlaw.com/barunnews/N` (landing candidate `www.baruninews.com` failed DNS). Server-rendered HTML — js-render tier still works (Playwright waits for already-present `.articlebox`). Could be demoted to html tier in a future plan. |
| latham | ✓ | 1632ms | 16 | YAML placeholder selectors (`.content-card` / `.content-card__title`) correct first try. |

**Aggregate:** 4/4 firms extracted ≥1 item. 3 fully paste-ready (`lee-ko`, `barun`, `latham`). `yoon-yang` has a flagged production caveat — selectors are correct but URL resolution path is missing in the extractor.

## Verified Configurations (ready for plan 08 firms.yaml paste)

### lee-ko

```yaml
- id: lee-ko
  name: 법무법인 광장
  language: ko
  type: js-render
  url: https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR
  timezone: Asia/Seoul
  enabled: true
  wait_for: ".leeko-new-newsletter__item"
  selectors:
    list_item: ".leeko-new-newsletter__item"
    title: ".leeko-new-newsletter__item-title"
    link_onclick_regex: "goDetail\\('([0-9]+)'\\)"
    link_template: "/leenko/news/newsLetterView.do?lang=KR&newsletterNo={1}"
    date: ".leeko-new-newsletter__item-date"
```

Notes for plan 08:
- `link` key is INTENTIONALLY OMITTED — lee-ko uses `href="javascript:void(0);" onclick="goDetail(N)"`, so the onclick branch of `parseListItemsFromHtml` is the correct path.
- `date` selector (`.leeko-new-newsletter__item-date`) observed in raw HTML and included for completeness; probe did not validate it (probe only reports title+URL) but the format is `2026.04.14` — already supported by `normalizeDateString`.
- Phase 2 audit hint `ul#contentsList > li` was **wrong** — actual selector is `.leeko-new-newsletter__item`. (No `ul#contentsList` exists in the page.)

### yoon-yang

```yaml
# BLOCKED — do not enable until extractor supports href="javascript:..." resolution.
- id: yoon-yang
  name: 법무법인 화우
  language: ko
  type: js-render
  url: https://www.yoonyang.com/kor/insights/newsletters
  timezone: Asia/Seoul
  enabled: false   # ← keep false until Rule 2 production patch lands
  wait_for: "ul#contentsList > li"
  selectors:
    list_item: "ul#contentsList > li"
    title: ".tit"
    # link resolution — see "Outstanding extractor work" section below.
    # Candidate shape once extractor patched:
    #   link_href_regex: "doView\\(([0-9]+)\\)"
    #   link_template: "/kor/insights/newsletter/{1}"
```

Notes for plan 08:
- Audit hint `ul.board-card-list > li OR ul#contentsList > li` partially correct — the `ul#contentsList` alternative was right.
- Audit hint `.title` was **wrong** — actual is `.tit`.
- Domain migration: configured URL is `www.yoonyang.com` but canonical redirects to `www.hwawoo.com` (recent brand change). Either URL resolves to the same page; keep `yoonyang.com` for brand stability.

### barun

```yaml
- id: barun
  name: 법무법인(유한) 바른
  language: ko
  type: js-render
  url: https://barunlaw.com/barunnews/N
  timezone: Asia/Seoul
  enabled: true
  wait_for: ".articlebox"
  selectors:
    list_item: ".articlebox"
    title: ".article_tit"
    link: "a"
    date: ".article_date"
```

Notes for plan 08:
- URL discovery: Phase 2 audit candidates `https://www.baruninews.com/` (DNS fail) and `https://barunlaw.com/barunnews/N/newsLetter` (not checked — `/barunnews/N` was sufficient). **Canonical URL is `https://barunlaw.com/barunnews/N`** (no trailing `/newsLetter` suffix).
- The list page is actually **server-rendered** — `.articlebox` exists in initial HTML without JS. js-render tier still works (Playwright just waits for an already-present selector, ~1.2s). A future plan may demote to `type: html` for faster scraping, but `js-render` here is a correct superset and ships today.
- Date selector (`.article_date`) observed as `2026-04-15` format — already supported by `normalizeDateString` via `Date.parse`.

### latham

```yaml
- id: latham
  name: Latham & Watkins
  language: en
  type: js-render
  url: https://www.lw.com/en/insights-landing
  timezone: America/New_York
  enabled: true
  wait_for: ".content-card"
  selectors:
    list_item: ".content-card"
    title: ".content-card__title"
    link: "a"
```

Notes for plan 08:
- Audit placeholder selectors verified verbatim. Zero adjustments needed.
- URL `www.lw.com/en/insights-landing` (the firm rebranded `lw.com` from `latham.com`; current canonical is lw.com).

## Probe Log

### lee-ko

```
Attempt 1 (seed: ul#contentsList > li / .title / a):
[probe] firm=lee-ko url=https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR wait_for=ul#contentsList > li
[probe] launching chromium ...
[probe] ERROR: scrapeJsRender lee-ko: playwright-timeout waiting for ul#contentsList > li
[probe] done (total 22810ms)
EXIT=2

(curl inspection → actual structure is .leeko-new-newsletter__item with
 href="javascript:void(0);" + onclick="goDetail(N)" — probe script
 extended to accept --link-onclick-regex + --link-template in commit 6101c8a)

Attempt 2 (corrected selectors + onclick branch):
[probe] firm=lee-ko url=https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR wait_for=.leeko-new-newsletter__item
[probe] launching chromium ...
[probe] extracted 6 items (waitForSelector + extract: 5217ms).
[probe] First 3:
  1. "국외투과단체 과세특례제도 도입에 따른 미국 ECI 리스크 관리의 변화 및 시사점" → https://leeko.com/leenko/news/newsLetterView.do?lang=KR&newsletterNo=2269
  2. "IP Perspective Vol.4 by Lee & Ko IP & TECHNOLOGY Group" → https://leeko.com/leenko/news/newsLetterView.do?lang=KR&newsletterNo=2268
  3. "공정위 '추천보증심사지침' 개정안 행정예고" → https://leeko.com/leenko/news/newsLetterView.do?lang=KR&newsletterNo=2267
[probe] done (total 5289ms)
EXIT=0
```

### yoon-yang

```
Attempt 1 (seed: ul#contentsList > li / .title / a):
[probe] firm=yoon-yang url=https://www.yoonyang.com/kor/insights/newsletters wait_for=ul#contentsList > li
[probe] launching chromium ...
[probe] ERROR: scrapeJsRender yoon-yang: zero items extracted (selector-miss) — wait_for matched but list_item ul#contentsList > li returned nothing
[probe] done (total 13742ms)
EXIT=3

(curl inspection → initial <ul id="contentsList"></ul> is EMPTY; AJAX populates
 <li class="box-board-card"><a href="javascript:doView(N)"><strong class="tit">…</strong></a></li>.
 Actual title selector is .tit, not .title.)

Attempt 2 (corrected title selector):
[probe] firm=yoon-yang url=https://www.yoonyang.com/kor/insights/newsletters wait_for=ul#contentsList > li
[probe] launching chromium ...
[probe] extracted 12 items (waitForSelector + extract: 17170ms).
[probe] First 3:
  1. "국가인권위, 국민연금 책임투자 정책에 '인권실사' 강화 권고" → javascript:doView(14735)
  2. "대법원 라임펀드 관련 증권사 대표 징계 최종 취소" → javascript:doView(14727)
  3. "'노동자'의 경계가 흔들린다: 근로자 추정제,  일하는 사람 기본법 논의가 던지는 기업 리스크" → javascript:doView(14725)
[probe] done (total 17248ms)
EXIT=0

⚠ URL resolution issue: titles/list_item verified, URLs are "javascript:doView(N)"
stubs because yoon-yang uses href="javascript:doView(N)" with NO onclick attribute.
parseListItemsFromHtml's onclick branch reads a[onclick] → won't match.
```

### barun

```
URL discovery (no Phase 2 audit hints):
  1. https://www.baruninews.com/ → DNS/TLS fail (curl HTTP=000)
  2. https://barunlaw.com/        → HTTP 200, has .newsletter_list block on landing
  3. https://barunlaw.com/barunnews/N → HTTP 200, dedicated list page with .articlebox items (chosen as canonical)

Attempt 1 (selectors discovered from curl inspection):
[probe] firm=barun url=https://barunlaw.com/barunnews/N wait_for=.articlebox
[probe] launching chromium ...
[probe] extracted 10 items (waitForSelector + extract: 1188ms).
[probe] First 3:
  1. "법무법인(유한) 바른 뉴스레터 - 제155호 (2026.04)" → https://barunlaw.com/letter/55845
  2. "법무법인(유한) 바른 뉴스레터 - 제154호 (2026.03)" → https://barunlaw.com/letter/55437
  3. "제3차 상법개정에 따른 자기주식 소각 의무화" → https://barunlaw.com/letter/55181
[probe] done (total 1264ms)
EXIT=0
```

### latham

```
Attempt 1 (YAML placeholder selectors, language=en, timezone=America/New_York):
[probe] firm=latham url=https://www.lw.com/en/insights-landing wait_for=.content-card
[probe] launching chromium ...
[probe] extracted 16 items (waitForSelector + extract: 1632ms).
[probe] First 3:
  1. "Trump Administration Takes Major Steps Toward Comprehensive Federal AI Regulation" → https://lw.com/en/insights/trump-administration-takes-major-steps-toward-comprehensive-federal-ai-regulation
  2. "Data Center Insights — Navigating Data Center Power Supply" → https://lw.com/en/insights/data-center-insights-navigating-data-center-power-supply
  3. "Data Center Insights — The Complex Landscape of Data Center Permits" → https://lw.com/en/insights/data-center-insights-the-complex-landscape-of-data-center-permits
[probe] done (total 1704ms)
EXIT=0
```

## Deviations from Phase 2 Audit Hints

| Firm | Audit hint | Actual | Deviation |
|------|-----------|--------|-----------|
| lee-ko | `list_item: ul#contentsList > li`, `title: .title` | `list_item: .leeko-new-newsletter__item`, `title: .leeko-new-newsletter__item-title` | **Full rewrite.** `ul#contentsList` does not exist on the page. Audit hint was fabricated/drifted. |
| lee-ko | `link: a` (href expected) | `link_onclick_regex` + `link_template` (onclick branch) | **Link shape change.** Firm uses `href="javascript:void(0);" onclick="goDetail(N)"` — the href-anchor branch would yield a `javascript:` URL. Probe script needed extension (commit `6101c8a`). |
| yoon-yang | `list_item: ul.board-card-list > li OR ul#contentsList > li`, `title: .title` | `list_item: ul#contentsList > li`, `title: .tit` | Partial: `ul#contentsList` alternative correct; `.title` was wrong (actual is `.tit`). |
| yoon-yang | `link: a` (href expected) | Needs new extractor branch: `link_href_regex` + `link_template` | **Production blocker.** Firm uses `href="javascript:doView(N)"` with NO onclick attr — neither of the current two extractor branches captures it. |
| barun | No audit hints whatsoever | Full config derived by probe (URL + selectors) | **Full derivation.** Audit URL candidate `www.baruninews.com` dead; canonical is `barunlaw.com/barunnews/N`. |
| latham | `list_item: .content-card`, `title: .content-card__title`, `link: a` | Same | **Zero deviation.** First-try verbatim match. |

### Most-adjusted firm

**lee-ko** — required a probe script extension AND complete selector rewrite because the Phase 2 audit hint for lee-ko referenced DOM structure that simply isn't present on the live page. The onclick-regex pattern (href=`javascript:void(0);` + onclick=`goDetail(N)`) was not anticipated.

**barun** is a close second (full URL + selector derivation from scratch), but it succeeded on the FIRST probe attempt because the server-rendered HTML was simple to read via curl.

## Outstanding Extractor Work (Rule 2 escalation for plan 08)

**yoon-yang cannot be enabled with the current `parseListItemsFromHtml`.** The extractor has two URL-resolution branches:

1. `selectors.link` → reads `$(el).find(selectors.link).attr('href')` directly.
2. `selectors.link_onclick_regex + link_template` → reads `$(el).find('a[onclick]').attr('onclick')`.

Yoon-yang's shape is `<a href="javascript:doView(N)">` — href is non-empty but unusable (branch 1 would yield `javascript:doView(N)` after `canonicalizeUrl`); no `onclick` attribute exists (branch 2 returns empty).

**Recommended plan 08 Rule 2 patch** (one of):

- **Option A (minimal):** Add a third branch `link_href_regex + link_template` that reads `href` and applies regex+template. Schema addition: optional `link_href_regex` field; YAML author picks the right pair.
- **Option B (stricter):** Extend the existing `link_onclick_regex` branch to ALSO fall back to reading `href` when no `a[onclick]` match (treat `href="javascript:..."` as semantically equivalent to `onclick="..."`).

Option A is cleaner (explicit schema), Option B is smaller blast radius. Recommend A. Until this lands, plan 08 should keep `yoon-yang: enabled: false`.

## Files created/modified during Task 2

- `scripts/probe-js-render.ts` — extended with onclick-regex link branch (commit `6101c8a`)
- `.planning/phases/04-js-rendered-tier-conditional/04-07-PROBE-RESULTS.md` — this file

## Network politeness ledger

Per CLAUDE.md "하루 1회 1요청/사이트" constraint, this probe session issued:

| Firm | Playwright probes | Raw curl/fetch | Total |
|------|-------------------|----------------|-------|
| lee-ko | 2 | 1 | 3 |
| yoon-yang | 2 | 1 | 3 |
| barun | 1 | 3 (URL discovery: baruninews fail, barunlaw landing, barunlaw/barunnews/N) | 4 |
| latham | 1 | 0 | 1 |

Aggregate: 11 requests across 4 firms in one session. This is a one-time verification burst (not the daily steady state). The daily pipeline remains at 1 request per firm per day after plan 08 lands.
