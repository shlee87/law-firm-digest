---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 02
status: complete
files_modified:
  - src/scrapers/util.ts
  - test/scrapers/util.test.ts
  - test/fixtures/korean-cp949.html
  - test/fixtures/article-generic.html
  - test/fixtures/article-override.html
  - test/fixtures/article-fallback.html
  - package.json
  - pnpm-lock.yaml
---

# Plan 02-02 Summary: Scraper util helpers — iconv charset fetch + body extraction

## What was built

Two new exported helpers added to `src/scrapers/util.ts`:
- `decodeCharsetAwareFetch(url, opts)` — charset-aware HTML fetch with
  Content-Type + `<meta charset>` priority and iconv-lite decode for
  EUC-KR / CP949 responses (Korean firm sites). UTF-8 responses
  short-circuit through `Buffer.toString('utf8')`.
- `extractBody(html, firmBodySelector?)` — pure function that pulls
  article body text using (1) firm override, (2) 6-step generic selector
  chain with 120-char length gate, (3) fallback to largest `<p>`-cluster
  parent. Pitfall 4 (U+00A0 normalization) is enforced before `\s+`
  collapse. 10k-char length cap enforced.

TRACKING_PARAMS extended from 15 → 18 entries with D-P2-16 additions
(`page`, `s_type`, `s_keyword`) for the Logos ASP site.

## Dependencies installed
- `iconv-lite@0.7.2` (runtime) — ships its own TS types, no @types needed
- `cheerio@1.2.0` (runtime) — was NOT previously installed despite plan
  claiming "already a dep"; added without objection as it's required for
  extractBody AND for plan 02-03.

## Verification evidence

```
pnpm typecheck → exit 0
pnpm vitest run test/scrapers/util.test.ts → 31/31 pass
  (13 canonicalizeUrl + 2 D-P2-16 = 15 + 5 parseDate + 5 decodeCharsetAwareFetch + 6 extractBody)
pnpm vitest run (full suite) → 64/64 pass (no regressions)

grep -c "^export async function decodeCharsetAwareFetch" src/scrapers/util.ts → 1
grep -c "^export function extractBody" src/scrapers/util.ts → 1
grep -c "import iconv from 'iconv-lite'" src/scrapers/util.ts → 1
grep -c "HTML fetch \${url}: HTTP \${res.status}" src/scrapers/util.ts → 1
grep -c "replace(/\\u00a0/g" src/scrapers/util.ts → 1
grep -c "slice(0, 10_000)" src/scrapers/util.ts → 1
pnpm tsx -e "..." → TRACKING_PARAMS length: 18
```

## Deviations from plan

1. **cheerio was not in the existing package.json** despite the plan
   saying "it is — verified via package.json L13 lock". Added
   `cheerio@1.2.0` alongside `iconv-lite@0.7.2`. No downstream impact
   expected; plan 02-03 (HTML tier scraper) needed cheerio anyway.

2. **Removed `decodeEntities: true` from `cheerio.load()` call** — that
   option is not in cheerio 1.2's TS `CheerioOptions` type (caused
   TS2353). Default behavior is equivalent for our purposes. No runtime
   behavior change; all tests still pass.

3. **Inlined `bestEl` / `bestScore` locals** (instead of `{ el, score }`
   object with `cheerio.Cheerio<any>`) — cleaner without `any`, equivalent
   semantics, avoids a typecheck waiver.

4. **`Object.assign(new Response(...), { url })` replaced with
   `Object.defineProperty` for url override in the redirect-follow test —
   vitest's `Response` getter for `url` is read-only under `Object.assign`
   in Node 22's undici; `defineProperty` correctly overrides it.

## Coupling contracts locked

- Error message shape: `HTML fetch {url}: HTTP {status}` — plan 02-05's
  failed-firm footer `classifyError` regex depends on this exact format.
- `TRACKING_PARAMS` length: 18 — any future shrink risks DEDUP-02 breakage.

## Requirements touched

- FETCH-01 (HTML fetch with charset handling) — decodeCharsetAwareFetch
  exported; plan 02-03 will consume.
