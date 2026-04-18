---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 03
status: complete
files_modified:
  - src/scrapers/html.ts
  - test/scrapers/html.test.ts
  - test/fixtures/shin-kim.list.html
  - test/fixtures/yulchon.list.html
  - test/fixtures/bkl.list.html
---

# Plan 02-03 Summary: HTML-tier scraper (plain-href + onclick-extract)

## What was built

`src/scrapers/html.ts` — sibling to `scrapeRss`. Single export: `scrapeHtml(firm)
: Promise<RawItem[]>`. Local helper `normalizeDateString` (not exported).

### Two selector variants
- **Plain href** — `firm.selectors.link` → `$(el).find(link).attr('href')`.
  Used by shin-kim, yulchon, logos, skadden.
- **Onclick extract** — `firm.selectors.link_onclick_regex` +
  `firm.selectors.link_template` — `new RegExp(...).exec(onclick)` matches the
  `<a onclick="goView('N')">` / `goDetail('X','Y')` attribute, then
  `{1}`/`{2}`/... get substituted into the template. Used by kim-chang, bkl.

### Shape contract with rss.ts
RawItem fields match scrapeRss 1:1:
- `firmId`: firm.id
- `title`: `.text().trim()` from `selectors.title`
- `url`: canonicalized via `canonicalizeUrl(href | resolved, firm.url)`
- `publishedAt`: UTC ISO via `parseDate(normalizeDateString(text), firm.timezone)`
- `language`: firm.language
- `description`: **undefined** (plan 04 enrichBody owns body population)

### Error contract
- Throws `scrapeHtml {firm.id}: HTTP {status}` on non-OK fetch (locked shape
  coupled to plan 02-05's `classifyError` regex `/HTTP (\d{3})/`).
- Throws `firm {id}: html tier requires selectors` when `selectors` is undefined.
- Per-item try/catch swallows row-level errors (no-throw isolation matching
  rss.ts L82-101 discipline).

### DRY_RUN containment (Pattern 2)
```
grep -c "isDryRun" src/scrapers/html.ts → 0
```
Only mailer/gmail.ts + state/writer.ts remain DRY_RUN check sites.

### Date normalization
Recognized formats (audit-verified):
- `2026.04.17` (Shin-Kim)
- `2026. 04. 17.` / `2026. 04. 17` (Yulchon spaced)
- Native `Date.parse` fallback (English: `17 April 2026`, `April 17, 2026`).

## Tests (9, all pass)

1. Plain-href parses 3 RawItems from shin-kim fixture, canonicalization
   strips utm_source from item 2.
2. YYYY.MM.DD KST date → UTC via parseDate.
3. Yulchon "YYYY. MM. DD." spaced date → UTC via parseDate.
4. Onclick regex + template → 2 items (row 2 malformed is silently skipped).
5. Pitfall 5 origin-anchor: path-absolute template does NOT merge against
   list page path (no `informationList.do` in resolved URL).
6. Non-OK 503 → throws `scrapeHtml shin-kim: HTTP 503`.
7. Missing selectors → throws `html tier requires selectors`.
8. Per-item isolation (no throw on malformed row).
9. `description: undefined` for every returned item.

## Verification evidence

```
pnpm typecheck → exit 0
pnpm vitest run test/scrapers/html.test.ts → 9/9 pass

grep -c "^export async function scrapeHtml" src/scrapers/html.ts → 1
grep -c "^export " src/scrapers/html.ts → 1
grep -c "isDryRun" src/scrapers/html.ts → 0
grep -c "scrapeHtml \${firm.id}: HTTP \${" src/scrapers/html.ts → 1
grep -c "firm \${firm.id}: html tier requires selectors" src/scrapers/html.ts → 1
grep -c "description: undefined" src/scrapers/html.ts → 1
ls test/fixtures/{shin-kim,yulchon,bkl}.list.html → all exist
```

## Deviations from plan

1. **Removed `{ decodeEntities: true }` from `cheerio.load()`** — option not
   accepted by cheerio 1.2's `CheerioOptions` TS type. Default is equivalent
   for text-extraction purposes. Same deviation as plan 02-02 extractBody.

2. **Hoisted `const selectors = firm.selectors;`** into the function body
   after the null-check — cleaner than repeated `firm.selectors!` non-null
   assertions through the inner loop, and TypeScript narrows the type
   correctly after the explicit guard.

3. **`description: undefined`** appears exactly 1x (the literal RawItem
   push). The plan's acceptance criterion said "exactly 1" — matches.

## Note for plan 02-08

Switch-case body for the tier dispatch:
```typescript
case 'html':
  raw = await scrapeHtml(firm);
  break;
```

## Requirements touched

- FETCH-01 (HTML tier scraper for all 6 HTML firms) — implemented; plan 08
  wires via `switch(firm.type)` in pipeline/fetch.ts.
