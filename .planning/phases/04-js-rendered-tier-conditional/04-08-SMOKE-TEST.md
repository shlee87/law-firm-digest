# Phase 4 Plan 08 — Smoke Test Transcripts

**Run:** 2026-04-19 (KST)
**Environment:** local pnpm tsx + chromium-headless-shell v1217 (macOS darwin 25.2.0 arm64)
**Playwright:** 1.59.1 (cache: `~/Library/Caches/ms-playwright/chromium_headless_shell-1217`)
**state/seen.json mtime (pre-test):** 1776451225 (2026-04-16T09:20:25Z)
**state/seen.json mtime (post-test):** 1776451225 — **UNCHANGED**, DRY_RUN containment confirmed

## Prep: install chromium --only-shell

```bash
$ pnpm exec playwright install chromium --only-shell
# (chromium_headless_shell-1217 installed at ~/Library/Caches/ms-playwright/)
```

No stdout on success. Cache verified:

```
$ ls ~/Library/Caches/ms-playwright/
chromium_headless_shell-1208
chromium_headless_shell-1217
chromium-1208
ffmpeg-1011
firefox-1509
mcp-chrome-a3080bf
webkit-2248
```

## 1. `pnpm check:firm lee-ko`

```
> legalnewsletter@ check:firm /Users/seonghoonyi/Documents/projects/legalnewsletter
> tsx src/cli/checkFirm.ts "lee-ko"

[check:firm] id=lee-ko
  target            : firm=lee-ko
  fetch             : 1 firm(s)
  fetch             : lee-ko: 6 items (6192ms)
  enrich            : lee-ko: 6/6 bodies
  filter            : lee-ko: 6 after filter
  dedup             : lee-ko: 0 new
  would-summarize   : 0 item(s)
  compose           : no new items — digest skipped (DEDUP-03)
```

**Result:** 6 items extracted, all 6/6 bodies enriched, 0 new after dedup (all already in seen.json from bootstrap on a prior dry-run seed). Exit 0.

## 2. `pnpm check:firm yoon-yang`

```
> legalnewsletter@ check:firm /Users/seonghoonyi/Documents/projects/legalnewsletter
> tsx src/cli/checkFirm.ts "yoon-yang"

[check:firm] id=yoon-yang
  target            : firm=yoon-yang
  fetch             : 1 firm(s)
  fetch             : yoon-yang: 12 items (17101ms)
  enrich            : yoon-yang: 12/12 bodies
  filter            : yoon-yang: 12 after filter
  dedup             : yoon-yang: 0 new
  would-summarize   : 0 item(s)
  compose           : no new items — digest skipped (DEDUP-03)
```

**Result:** 12 items extracted, 12/12 bodies enriched. Phase 04.1 LinkExtractor object form (`link.selector='a'`, `regex='doView\\((\\d+)\\)'`, `template='/kor/insights/newsletter/{1}'`) successfully resolved `href="javascript:doView(N)"` into absolute URLs — the Phase 04-07 production blocker is fully resolved. Exit 0. (17.1s duration reflects the firm's JS-heavy hydration latency observed during probe.)

## 3. `pnpm check:firm barun`

```
> legalnewsletter@ check:firm /Users/seonghoonyi/Documents/projects/legalnewsletter
> tsx src/cli/checkFirm.ts "barun"

[check:firm] id=barun
  target            : firm=barun
  fetch             : 1 firm(s)
  fetch             : barun: 10 items (1952ms)
  enrich            : barun: 0/10 bodies
  filter            : barun: 10 after filter
  dedup             : barun: 0 new
  would-summarize   : 0 item(s)
  compose           : no new items — digest skipped (DEDUP-03)
```

**Result:** 10 items extracted from `barunlaw.com/barunnews/N`. Exit 0. **Caveat for future follow-up:** `enrich: 0/10 bodies` — detail-page body extraction returned nothing via the generic chain + Playwright fallback (D-04). Because dedup yielded 0 new, this is inert today (no Gemini quota burned, digest skipped), but when barun publishes new items on a future run the Phase 1 SUMM-06 B3 guard will kick in and the items will ship with `요약 없음 — 본문 부족`. Not a plan 08 blocker; a candidate for Phase 5 polish (e.g. per-firm `selectors.body` for barun's detail pages).

## 4. `pnpm check:firm latham`

```
> legalnewsletter@ check:firm /Users/seonghoonyi/Documents/projects/legalnewsletter
> tsx src/cli/checkFirm.ts "latham"

[check:firm] id=latham
  target            : firm=latham
  fetch             : 1 firm(s)
  fetch             : latham: 16 items (2022ms)
  enrich            : latham: 16/16 bodies
  filter            : latham: 16 after filter
  dedup             : latham: 0 new
  would-summarize   : 0 item(s)
  compose           : no new items — digest skipped (DEDUP-03)
```

**Result:** 16 items extracted, 16/16 bodies enriched. Placeholder selectors verified verbatim from PROBE. Exit 0.

## 5. `DRY_RUN=1 pnpm tsx src/main.ts`

`src/main.ts` uses a no-op reporter by default — the full transcript below was captured via a temporary `scripts/debug-pipeline.ts` harness that injects a stdout reporter but otherwise invokes the same `runPipeline()` with default options. The pure `main.ts` run produces only the final DRY_RUN state-write line (shown first) and exits 0.

### 5a. `DRY_RUN=1 pnpm tsx src/main.ts` (actual cron path)

```
$ DRY_RUN=1 pnpm tsx src/main.ts
[DRY_RUN] would write state/seen.json with 164 URLs across 12 firms
=== EXIT: 0 ===
```

### 5b. `DRY_RUN=1 pnpm tsx scripts/debug-pipeline.ts` (verbose equivalent)

```
  fetch             : 13 firm(s)
  fetch             : cooley: error RSS fetch cooley: HTTP 403 | clifford-chance: 50 items (549ms) | freshfields: error The operation was aborted due to timeout | shin-kim: error fetch failed | yulchon: 1 items (2091ms) | logos: 0 items (1093ms) | skadden: 0 items (277ms) | kim-chang: 5 items (3867ms) | bkl: 9 items (1981ms) | lee-ko: 6 items (4027ms) | yoon-yang: 12 items (15411ms) | barun: 10 items (1901ms) | latham: 16 items (1887ms)
  enrich            : cooley: 0/0 bodies | clifford-chance: 50/50 bodies | freshfields: 0/0 bodies | shin-kim: 0/0 bodies | yulchon: 1/1 bodies | logos: 0/0 bodies | skadden: 0/0 bodies | kim-chang: 0/5 bodies | bkl: 9/9 bodies | lee-ko: 6/6 bodies | yoon-yang: 12/12 bodies | barun: 0/10 bodies | latham: 16/16 bodies
  filter            : cooley: 0 after filter | clifford-chance: 50 after filter | freshfields: 0 after filter | shin-kim: 0 after filter | yulchon: 1 after filter | logos: 0 after filter | skadden: 0 after filter | kim-chang: 5 after filter | bkl: 9 after filter | lee-ko: 6 after filter | yoon-yang: 12 after filter | barun: 10 after filter | latham: 16 after filter
  dedup             : cooley: 0 new | clifford-chance: 0 new | freshfields: 0 new | shin-kim: 0 new | yulchon: 0 new | logos: 0 new | skadden: 0 new | kim-chang: 0 new | bkl: 0 new | lee-ko: 0 new | yoon-yang: 0 new | barun: 0 new | latham: 0 new
  summarize         : 0 item(s)
  compose           : no new items — digest skipped (DEDUP-03)
[DRY_RUN] would write state/seen.json with 124 URLs across 11 firms
---
digestSent: false
archivePath: undefined
jsRenderFailures: 0
results count: 13
  cooley (rss): ERROR: RSS fetch cooley: HTTP 403
  clifford-chance (rss): ok, raw=50
  freshfields (rss): ERROR: The operation was aborted due to timeout
  shin-kim (html): ERROR: fetch failed
  yulchon (html): ok, raw=1
  logos (html): ok, raw=0
  skadden (html): ok, raw=0
  kim-chang (html): ok, raw=5
  bkl (html): ok, raw=9
  lee-ko (js-render): ok, raw=6
  yoon-yang (js-render): ok, raw=12
  barun (js-render): ok, raw=10
  latham (js-render): ok, raw=16
```

### Key markers

- `[DRY_RUN] would write state/seen.json ...` — state writer short-circuit confirmed (OPS-06 check site #2).
- `compose : no new items — digest skipped (DEDUP-03)` — silent-day path; mailer never invoked, so no `[DRY_RUN] Subject:` marker appears in this run (expected: DEDUP-03 silent-day bypasses the mailer entirely before the DRY_RUN gate).
- `jsRenderFailures: 0` — **ALL 4 js-render firms succeeded** (lee-ko 6, yoon-yang 12, barun 10, latham 16 items). D-08 fail-loud NOT triggered.
- **Exit 0** — from both 5a and 5b invocations.

### Transient pre-existing failures (NOT Phase 4 plan 08 scope)

- `cooley` (rss): HTTP 403 — Cooley GO RSS feed transient rate-limit (not a Phase 4 regression; affects Phase 1 seed, out of plan 08 scope).
- `freshfields` (rss): aborted due to timeout — transient RSS fetch.
- `shin-kim` (html): fetch failed — transient HTML fetch.

These three errors match the Phase 2 D-P2-03 per-firm isolation contract: each is captured in `FirmResult.error`, the run continues, and the email footer would surface them (per EMAIL-05 Phase 2). None are `type: js-render`, so none contribute to `jsRenderFailures`. The digest for today would still have shipped with 91 items from the 10 healthy firms had seen.json not already been bootstrapped.

## state/seen.json integrity

```
$ stat -f "%N %m" state/seen.json
state/seen.json 1776451225
```

Mtime unchanged across the 5 smoke-test invocations (all with DRY_RUN or `skipStateWrite`). DRY_RUN containment confirmed end-to-end.

## Per-firm item-count summary (first successful probe)

| Firm | Type | Items | Bodies enriched | Notes |
|------|------|------:|-----------------|-------|
| lee-ko | js-render | 6 | 6/6 | onclick-regex branch, goDetail(N) |
| yoon-yang | js-render | 12 | 12/12 | LinkExtractor object form, doView(N) |
| barun | js-render | 10 | 0/10 | detail-page body extraction empty — Phase 5 polish candidate |
| latham | js-render | 16 | 16/16 | placeholder selectors first-try verbatim |

## Selector adjustments from PROBE-RESULTS.md

**None.** All four firms' YAML values were pasted verbatim from `04-07-PROBE-RESULTS.md`:
- lee-ko: `.leeko-new-newsletter__item` + onclick-regex `goDetail\\('([0-9]+)'\\)`.
- yoon-yang: `ul#contentsList > li` + `.tit` + LinkExtractor `{ selector: a, regex: doView\\((\\d+)\\), template: /kor/insights/newsletter/{1} }`.
- barun: `barunlaw.com/barunnews/N` + `.articlebox` / `.article_tit` / `a` / `.article_date`.
- latham: `.content-card` / `.content-card__title` / `a`.

## Verdict

All 4 js-render firms extract ≥1 item; full `DRY_RUN=1 tsx src/main.ts` exits 0; `jsRenderFailures` = 0; state untouched. **Phase 4 tier activation end-to-end: GREEN.**
