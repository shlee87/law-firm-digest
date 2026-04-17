---
phase: 01-foundation-vertical-slice
plan: 05
subsystem: scrapers
tags: [scrapers, fetch, rss, robots, isolation, plimit, feedparser, b2-timezone-contract]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: pnpm skeleton + feedparser/p-limit/p-retry deps (plan 01-01)
  - phase: 01-foundation-vertical-slice
    provides: config/firms.yaml seeded with Cooley RSS (plan 01-02)
  - phase: 01-foundation-vertical-slice
    provides: FirmConfig/RawItem/FirmResult contracts + USER_AGENT/scrubSecrets (plan 01-03)
  - phase: 01-foundation-vertical-slice
    provides: canonicalizeUrl from src/scrapers/util.ts (plan 01-04)
provides:
  - "src/scrapers/robots.ts: fetchRobots(origin) + isAllowed(url, disallows) — hand-rolled User-agent:* parser with run-lifetime Map cache"
  - "src/scrapers/rss.ts: scrapeRss(firm) — feedparser stream scraper, B2 absolute-time pass-through (no zone-aware re-anchor)"
  - "src/pipeline/fetch.ts: fetchAll(firms) — pLimit(3) orchestrator with per-firm robots gate + try/catch isolation"
  - "test/fixtures/cooley.rss.xml: fabricated 3-item RSS 2.0 fixture for offline determinism"
  - "test/scrapers/rss.test.ts: 3-assertion vitest suite covering shape, B2 regression guard, and 503 failure"
affects: [01-07, 01-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "COMP-03 pre-fetch gate centralized in src/scrapers/robots.ts — every scraper path in Phase 1 flows through fetchRobots + isAllowed before emitting any scrape traffic; Phase 2 html scraper will reuse the same gate"
    - "B2 absolute-time pass-through — feedparser's item.pubdate.toISOString() is used VERBATIM; the zone-aware helper from util.js (parseDate) is deliberately NOT imported in rss.ts, enforced by a `grep -c parseDate src/scrapers/rss.ts == 0` machine-verifiable gate"
    - "Per-firm failure isolation via Promise.all + per-firm try/catch — fetchAll NEVER throws; one firm's failure cannot kill sibling firms; failure captured into FirmResult.error with scrubSecrets applied"
    - "pLimit(3) concurrency cap baked in at Phase 1 even with only one firm, so Phase 2's additional firms drop in without scaffolding changes"
    - "Stream bridge pattern for Node 22: Readable.fromWeb(res.body as unknown as WebReadableStream).pipe(parser) — single-line adapter from WHATWG fetch stream to Node Transform; no buffering"
    - "Hand-rolled robots.txt parser (not robots-parser npm pkg) per RESEARCH.md L613 endorsement — Phase 1 scope is User-agent:* Disallow rules only; Phase 2 may swap to pkg when firm count grows past one"

key-files:
  created:
    - src/scrapers/robots.ts
    - src/scrapers/rss.ts
    - src/pipeline/fetch.ts
    - test/fixtures/cooley.rss.xml
    - test/scrapers/rss.test.ts
  modified: []
  removed: []

key-decisions:
  - "Fabricated RSS fixture chosen over live-recorded Cooley feed for test determinism. The plan's <interfaces> block accepts either (fabricated fallback explicitly authorized). Fabricated gives deterministic GMT pubDates (Tue, 15 Apr 2026 12:00:00 GMT) that let the B2 regression test assert the exact string '2026-04-15T12:00:00.000Z'; a live capture's pubDates change over time and couldn't support that assertion."
  - "FeedParser.Item type is accessible as a namespace member via `FeedParser.Item` under the default import (feedparser's own index.d.ts uses `export = FeedParser` with merged namespace). No synthetic @types/feedparser needed — the feedparser package ships its own types, and @types/feedparser is a deprecated stub that exists only to satisfy older transitives. PATTERNS.md flagged `this`-typing as [CONFIRM AT PLAN]; the real index.d.ts already declares `on(event:'readable', listener:(this: FeedParser)=>void)`, so the this-type flows from the library correctly without a cast."
  - "B2 regression gate uses literal token count, not behavioral assertion alone. Two defenses in depth: (a) runtime test that 12:00 GMT → 12:00:00.000Z despite firm.timezone=America/Los_Angeles, (b) grep gate that src/scrapers/rss.ts contains zero occurrences of the token 'parseDate' anywhere (even in comments). The comment text in rss.ts deliberately avoids the token — uses 'zone-aware helper from util.js' instead — so the grep-count invariant is robust against future editors who might re-import out of habit."
  - "Live Cooley feed URL resolves https://cooleygo.com/feed/ → 301 → https://www.cooleygo.com/feed/. Followed via curl -L during the probe for SUMMARY record-keeping. config/firms.yaml keeps the non-www form; fetch() follows the redirect automatically at runtime. No change to firms.yaml needed in this plan."
  - "Cooley (www.cooleygo.com) robots.txt User-agent:* disallows are only /wp-admin/ and /wp-includes/ — neither is a prefix of /feed/, so isAllowed('https://cooleygo.com/feed/', ['/wp-admin/','/wp-includes/']) returns true. COMP-03 gate passes for Phase 1."
  - "Fetch orchestrator uses Promise.all (not Promise.allSettled) because per-firm try/catch already converts throws into FirmResult.error. allSettled would force an extra .map to unwrap PromiseSettledResult<T> for no correctness benefit."

requirements-completed:
  - FETCH-03
  - FETCH-04
  - COMP-03

# Metrics
duration: ~5 min
completed: 2026-04-17
---

# Phase 01 Plan 05: HTTP fetch layer (robots gate + RSS scraper + orchestrator) Summary

**External network boundary baked with FETCH-04 honest UA, COMP-03 robots.txt gate, and B2 absolute-time pass-through — Phase 1 Pitfall 9 (Saramin) mitigation complete in three files and one regression-guarded test.**

## Performance

- **Duration:** ~5 min (304 seconds wall-clock from plan start to SUMMARY completion)
- **Started:** 2026-04-17T15:44:50Z
- **Completed:** 2026-04-17T15:49:54Z
- **Tasks:** 4
- **Files created:** 5 (3 source, 1 fixture, 1 test)
- **Commits:** 4 task commits

## Accomplishments

- Three source files (robots.ts 91 LoC, rss.ts 108 LoC, fetch.ts 78 LoC) land under strict lint + typecheck with zero warnings.
- Test count rises 34 → 37 (+3 from new rss scraper suite). All 5 test files green in 563ms.
- FETCH-04 honest USER_AGENT enforcement verified: exactly 1 `export` site (src/util/logging.ts) and 2 import sites (robots.ts, rss.ts) — single source of truth preserved.
- COMP-03 robots gate live-probed against www.cooleygo.com/robots.txt: only `/wp-admin/` and `/wp-includes/` are in the User-agent:* Disallow list, so scraping `/feed/` is allowed.
- B2 no-double-zone invariant is machine-verifiable: `grep -c "parseDate" src/scrapers/rss.ts` returns 0; runtime test asserts `Tue, 15 Apr 2026 12:00:00 GMT` round-trips to `2026-04-15T12:00:00.000Z` (NOT shifted by the firm's America/Los_Angeles 7h/8h offset).
- DRY_RUN is NOT checked in any plan-05 file — only the mailer (plan 09) and state writer (plan 10) gate on it, as prescribed.
- Per-firm failure isolation invariant holds by construction: `fetchAll` wraps each firm in `limit(async () => try { ... } catch (err) { return { ..., error: { stage: 'fetch', message: scrubSecrets(err.message) } } })` — the outer Promise.all never sees a rejected inner promise because the catch converts.

## Cooley Robots.txt Evidence

Fetched `https://www.cooleygo.com/robots.txt` during plan execution with honest UA:

```
User-agent: *
Disallow: /wp-admin/
Disallow: /wp-includes/
```

**Conclusion:** `/feed/` is NOT a prefix of either disallow path. `isAllowed('https://cooleygo.com/feed/', ['/wp-admin/', '/wp-includes/'])` returns `true`. COMP-03 pre-fetch gate is satisfied for Phase 1's single firm. (Supplementary record: the non-www seed URL in config/firms.yaml 301-redirects to the www form automatically; runtime fetch follows the redirect.)

## Fixture Origin

`test/fixtures/cooley.rss.xml` is **fabricated**, not live-recorded.

Rationale: the B2 regression test asserts an exact UTC round-trip (`'2026-04-15T12:00:00.000Z'`) — a live Cooley feed's pubDates change over time and couldn't support the assertion. The fabricated fixture has three items with deterministic GMT pubDates covering the three canonical URL edge cases (trailing-slash, no-slash, utm-suffixed).

The live feed WAS fetched as a sanity check (HTTP 200, 15 items, `application/rss+xml; charset=UTF-8`, most recent pubDate Fri, 20 Mar 2026 18:35:28 +0000 — same evidence as plan 01-02 SUMMARY). This confirms the seed URL still works; the choice to use a fabricated fixture in the test is orthogonal to feed health.

## FeedParser This-Typing Resolution

PATTERNS.md (L393-438) flagged `parser.on('readable', function() { ... this.read() ... })` as `[CONFIRM AT PLAN]` for `this` typing. No cast was needed at implementation time.

Reason: the feedparser package (v2.3.1) ships its own TypeScript definitions (`node_modules/feedparser/index.d.ts`) declaring:

```typescript
on(event: 'readable', listener: (this: FeedParser) => void): this;
```

The `this: FeedParser` annotation flows from the library's type signature, so `this.read()` inside the listener resolves to `FeedParser.read(): FeedParser.Item | null` without any executor-side type assertion. The `@types/feedparser` package at version 2.3.0 is a deprecated stub that re-exports feedparser's types — installing it is a no-op; feedparser provides its own.

## USER_AGENT Single-Source Invariant

Grep evidence after all four tasks:

```
src/util/logging.ts:12:export const USER_AGENT =
src/scrapers/robots.ts:19:import { USER_AGENT } from '../util/logging.js';
src/scrapers/robots.ts:45:    headers: { 'User-Agent': USER_AGENT },
src/scrapers/rss.ts:33:import { USER_AGENT } from '../util/logging.js';
src/scrapers/rss.ts:41: *   - Outbound GET uses the honest USER_AGENT (FETCH-04 / Pitfall 9).
src/scrapers/rss.ts:64:    headers: { 'User-Agent': USER_AGENT },
```

- `export.*USER_AGENT` count: **1** (only in `src/util/logging.ts`) — single source of truth.
- `import.*USER_AGENT` count: **2** (robots.ts + rss.ts) — both outbound HTTP sites.
- No re-declaration or string-literal copy of the UA appears anywhere in src/ — plan 01-03's single-source invariant (FETCH-04) holds.

## B2 Regression Gate Evidence

```
$ grep -c "parseDate" src/scrapers/rss.ts
0
```

Comment text in `src/scrapers/rss.ts` deliberately refers to the zone-aware helper by description ("zone-aware helper from util.js", "zone-aware re-anchor") and NOT by its literal identifier — this keeps the grep-count invariant robust against maintainer drift.

The runtime test (`test/scrapers/rss.test.ts it('publishedAt is absolute UTC (no zone re-apply)')`) asserts the exact string `'2026-04-15T12:00:00.000Z'` for the first fixture item, and also asserts non-match against PDT-shifted (`T19:00` / `T20:00`) and PST-shifted (`T04:00` / `T05:00`) outputs — three defenses layered on one behavior.

## Files Created

### src/scrapers/robots.ts (91 lines)

Two exports:

- `fetchRobots(origin: string): Promise<string[]>` — module-level `Map<origin, string[]>` cache keeps the list for the run lifetime. GET with `User-Agent: USER_AGENT`. Parse strategy: line-by-line, strip `#comments`, track `User-agent: *` section entry/exit on User-agent lines and blank lines, collect `Disallow: /path` values in-section.
- `isAllowed(url: string, disallows: string[]): boolean` — prefix-match against `new URL(url).pathname`.

Intentional scope limits (Phase 1):
- Only `User-agent: *` section is respected. A `User-agent: LegalNewsletterBot` section (if ever encountered) is ignored. This is acceptable because no real firm is singling out this bot, and the conservative default is "treat star rules as ours too".
- No wildcard (`*` in paths) or `Allow:` override support. Both are rare; if encountered Phase 2's switch to `robots-parser` will handle them.

### src/scrapers/rss.ts (108 lines)

One export: `scrapeRss(firm: FirmConfig): Promise<RawItem[]>`.

- Outbound GET with `User-Agent: USER_AGENT` and `AbortSignal.timeout(firm.timeout_ms ?? 20000)`.
- Non-OK → throws `RSS fetch ${firm.id}: HTTP ${res.status}`.
- Empty body → throws `RSS fetch ${firm.id}: empty body`.
- Stream adapter: `Readable.fromWeb(res.body as unknown as WebReadableStream).pipe(parser)`.
- `parser.on('readable', function() { while ((item = this.read())) { ... } })` — feedparser's own types annotate the listener's `this` as `FeedParser`, so no cast is needed.
- Per-item try/catch around the canonicalization + push step — a single malformed item (unparseable URL) is silently skipped so the feed keeps flowing.
- `publishedAt = item.pubdate ? item.pubdate.toISOString() : undefined` — verbatim, no `parseDate`.
- `canonicalizeUrl(item.link ?? '', firm.url)` — plan 04's DEDUP-02 function, invoked at the item boundary. Relative URLs resolve against firm.url base.
- `description: item.description ?? item.summary ?? undefined` — SUMM-06 summarizer input (Pitfall 4 hallucination defense).

### src/pipeline/fetch.ts (78 lines)

One export: `fetchAll(firms: FirmConfig[]): Promise<FirmResult[]>`.

- `pLimit(3)` — concurrency cap (politeness + GHA network friendliness).
- Per-firm flow: start timer → `origin = new URL(firm.url).origin` → `disallows = await fetchRobots(origin)` → `if (!isAllowed(firm.url, disallows)) throw` → `raw = await scrapeRss(firm)` → return `FirmResult` with populated `raw`, empty `new`/`summarized`, `durationMs`.
- Catch branch: `{ firm, raw: [], new: [], summarized: [], error: { stage: 'fetch', message: scrubSecrets((err as Error).message) }, durationMs }`.
- Outer `Promise.all` of limit-wrapped firm promises — never rejects because the catch converts.
- Phase 2 extension point: marked in comment `// Phase 1: only 'rss' strategy. Phase 2 dispatch point.` — when html.ts / js-render tier lands, add `switch (firm.type) { case 'rss': ... case 'html': ... }` at that line only; the pLimit + try/catch + robots scaffolding stays untouched.

### test/fixtures/cooley.rss.xml (17 lines)

Fabricated RSS 2.0 with three items:
- Item 1: `https://www.cooley.com/news/insight/2026/2026-04-15-ai-reg?utm_source=rss`, `Tue, 15 Apr 2026 12:00:00 GMT`, with description — exercises www-strip, utm_source-strip, and absolute-UTC round-trip.
- Item 2: `https://cooley.com/news/insight/2026/2026-04-10-ma-memo`, `Thu, 10 Apr 2026 09:00:00 GMT`, no description — exercises the undefined-description branch.
- Item 3: `https://cooley.com/news/insight/2026/2026-04-05-privacy/`, `Sat, 05 Apr 2026 15:30:00 GMT`, no description — exercises trailing-slash strip.

### test/scrapers/rss.test.ts (107 lines)

One `describe('scrapeRss')`, three `it` assertions:

1. **shape/canonical-URL** — length > 0; first item matches `{ firmId: 'cooley', language: 'en' }`; URL has no `utm_source` and no leading `www.`.
2. **B2 no-double-zone guard** — first item's `publishedAt` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`, equals `'2026-04-15T12:00:00.000Z'` exactly, and does NOT match the PDT-shifted or PST-shifted forms.
3. **HTTP 503 throws** — `globalThis.fetch` mocked to return 503 Response; `scrapeRss(cooley)` rejects with `/HTTP 503/`.

Mocking strategy: `beforeEach` saves original `globalThis.fetch`, each test sets `globalThis.fetch = vi.fn().mockResolvedValue(new Response(xml, ...))`, `afterEach` restores the original. No network touched.

## Task Commits

| Task | Hash | Message |
|------|------|---------|
| 1: robots.ts | `e8575a0` | feat(01-05): add src/scrapers/robots.ts (COMP-03 pre-fetch gate) |
| 2: rss.ts | `2a6695a` | feat(01-05): add src/scrapers/rss.ts (feedparser stream, B2 absolute-time pass-through) |
| 3: fetch.ts | `fcb285a` | feat(01-05): add src/pipeline/fetch.ts (pLimit(3) + per-firm isolation) |
| 4: fixture + test | `fbae71d` | test(01-05): add offline rss scraper test + fabricated Cooley fixture |

## Decisions Made

See frontmatter `key-decisions` block for the full list. Headline:

1. **Fabricated fixture over live-recorded** — enables exact-string B2 round-trip assertion that a shifting live feed can't support.
2. **FeedParser.Item via default import + namespace merging** — the feedparser package (not @types/feedparser) provides the types, and the `this: FeedParser` listener annotation is built in — no cast needed.
3. **Two-layer B2 defense** — grep-count gate (token never appears in rss.ts) plus runtime test (absolute UTC round-trip) so both static and dynamic regressions fail loudly.
4. **Hand-rolled robots parser stays in Phase 1** — per RESEARCH.md L613, the one-firm vertical slice doesn't need robots-parser npm pkg; Phase 2 will reconsider when firms multiply.
5. **Live Cooley URL 301-redirects www** — fetch auto-follows at runtime, no firms.yaml edit needed.

## Deviations from Plan

**None of the Rule 1–3 deviation categories fired.** All three source files landed verbatim from the plan's `<interfaces>` blocks (modulo one documentation-only edit: the comment inside `rss.ts` was reworded to avoid the literal token `parseDate`, because the plan's verification gate `grep -c "parseDate" src/scrapers/rss.ts == 0` required the source file to not even mention the identifier in comments — this is a comment-only change consistent with the plan's explicit invariant, not a behavioral deviation).

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `pnpm typecheck` clean | PASS — tsc --noEmit exits 0 |
| `pnpm test` green (plan-04 + plan-05 suites) | PASS — 37/37 assertions, 5 files, 563ms |
| `USER_AGENT` single source of truth (1 export in src/) | PASS — export count = 1 (src/util/logging.ts) |
| `USER_AGENT` imported by both robots.ts and rss.ts | PASS — 2 import sites |
| `DRY_RUN` NOT checked in any plan-05 file | PASS — 0 matches in robots.ts/rss.ts/fetch.ts |
| `grep -c "parseDate" src/scrapers/rss.ts` returns 0 (B2) | PASS — count = 0 |
| Fixture file begins with `<?xml` and contains ≥1 `<item>` | PASS — 3 items |

## Success Criteria

| Criterion | Status |
|-----------|--------|
| FETCH-03 pLimit(3) scaffolding present | PASS — `pLimit(3)` at src/pipeline/fetch.ts:42 |
| FETCH-04 honest USER_AGENT sent with every outbound request | PASS — both robots.ts and rss.ts attach the header |
| COMP-03 robots.txt gate runs before each scrape | PASS — fetch.ts calls fetchRobots + isAllowed BEFORE scrapeRss |
| publishedAt is correct absolute UTC (B2 no-double-zone) | PASS — grep=0 gate + runtime test asserting `12:00:00.000Z` |

## Known Stubs

**None.** All three source files have complete implementations. No TODO/FIXME/placeholder markers. No empty return arrays that mask broken behavior (the `new: []` and `summarized: []` in `FirmResult` construction are intentional — these fields get populated by plan 07 dedup and plan 08 summarizer, respectively, and their emptiness here is a type-contract requirement, not a stub).

## Threat Flags

No new security-relevant surface introduced beyond the plan's declared threat model. The three files match the registered threats (T-05-01 through T-05-06) exactly:

- T-05-01 (SSRF via firm.url) mitigated by zod `z.string().url()` in plan 03 schema + `new URL().origin` for robots check.
- T-05-02 (XXE / XML bomb) mitigated by feedparser's default safe-parsing behavior + AbortSignal.timeout time-bound.
- T-05-03 (err.message secret leak) mitigated by `scrubSecrets` in fetch.ts catch branch.
- T-05-04 (slow-firm DoS) mitigated by per-firm `AbortSignal.timeout(firm.timeout_ms ?? 20000)` + pLimit(3) cap.
- T-05-05 (UA spoofing / robots bypass) mitigated by USER_AGENT single-source + fetchRobots+isAllowed gate before every scrape.
- T-05-06 (gigabyte robots.txt) accepted as Phase 1 risk; no explicit guard.

## Next Phase Readiness

Plan 11 (main composition) can now:
- `import { fetchAll } from '../pipeline/fetch.js'` and feed it `loadFirms()` output directly.
- Assume `fetchAll` never throws — the outer await always resolves to `FirmResult[]`.
- Filter `result.error?` at the aggregate layer without worrying about unhandled-rejection noise.
- Count on `publishedAt` being a correct UTC ISO string for any item where `item.pubdate` was present in the source feed — downstream dedup/state storage can treat it as the canonical timestamp.

Plan 07 (dedup) can now:
- Already consumes `FirmResult.raw` — no new dependency to wire.
- Can trust `r.raw[i].url` is canonicalized (plan 04's `canonicalizeUrl` flows through at the rss.ts item boundary) before the dedup set-operation.

## Self-Check: PASSED

- `src/scrapers/robots.ts` exists on disk.
- `src/scrapers/rss.ts` exists on disk.
- `src/pipeline/fetch.ts` exists on disk.
- `test/fixtures/cooley.rss.xml` exists on disk.
- `test/scrapers/rss.test.ts` exists on disk.
- All 4 task commits (`e8575a0`, `2a6695a`, `fcb285a`, `fbae71d`) present in `git log --oneline`.
- `pnpm typecheck` exits 0.
- `pnpm test` exits 0 with 37/37 assertions passing across 5 test files.
- `grep -c "parseDate" src/scrapers/rss.ts` = 0 (B2 gate).
- `grep -c "export.*USER_AGENT" src/util/logging.ts` = 1; `USER_AGENT` imported in exactly two other src/ files (robots.ts + rss.ts).
- No `DRY_RUN` references in any plan-05 file.

---
*Phase: 01-foundation-vertical-slice*
*Plan: 05*
*Completed: 2026-04-17*
