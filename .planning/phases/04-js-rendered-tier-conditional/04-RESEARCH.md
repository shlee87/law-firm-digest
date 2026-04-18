# Phase 4: JS-Rendered Tier (conditional) — Research

**Researched:** 2026-04-18
**Status:** Research complete
**Researcher:** gsd plan-phase workflow (inline — subagent spawning unavailable in this session)

## Entry-Gate Verdict

**Phase 4 PROCEEDS — does NOT skip.**

Phase 2's empirical audit (`.planning/phases/02-multi-firm-html-tier-failure-isolation/02-RESEARCH.md` lines 147-151) verified 4 firms that return empty server-rendered item lists:

| Firm | List URL | Server-rendered item count | Proof point |
|------|----------|----------------------------|-------------|
| `lee-ko` (광장) | `https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR` | 0 — `<ul id="contentsList">` is empty | Only 1 `newsletterNo=` reference in whole SSR HTML |
| `yoon-yang` (화우) | `https://www.yoonyang.com/kor/insights/newsletters` | 0 — `<ul id="contentsList" class="board-card-list">` empty. `/eng/` robots-blocked | Confirmed SSR skeleton 2026-04-17 |
| `barun` (바른) | `/barunnews/N/newsLetter` | 0 item hrefs SSR | Only home page shows 3-item teasers |
| `latham` (Latham & Watkins) | `/en/insights-landing` | 0 SSR hrefs — Coveo widget | 40 `insight-card` template nodes, all bound to `insight.Url` JS placeholder |

All four return cheerio-scrapable item count = 0 and have JS-injected DOM. Phase 4 success criterion #1 is empirically met. The success criterion for skip ("list is empty") is NOT met; Phase 4 must execute.

Phase 2 explicitly excluded Kirkland from Phase 4 activation per CONTEXT D-02 (US coverage satisfied by Cooley + Skadden). Final Phase 4 firm roster = 4 firms.

## What the Planner Needs to Know

### 1. Dependency surface is well-defined

Every downstream consumer is already tier-agnostic:

- `src/pipeline/fetch.ts:74-77` — `case 'js-render': throw new Error('Phase 4 territory')` is the **single** hook point. Swap to `raw = await scrapeJsRender(firm, browser); break;` and Phase 4 is wired at the tier-dispatch level.
- `src/pipeline/dedup.ts`, `src/pipeline/filter.ts`, `src/summarize/gemini.ts`, `src/compose/digest.ts`, `src/state/writer.ts` — all consume `RawItem[]` / `FirmResult`, both shared contracts. **Zero changes required downstream** if `scrapeJsRender` returns the same `RawItem[]` shape as `scrapeRss` and `scrapeHtml`.
- `src/types.ts:21` — `FirmType = 'rss' | 'html' | 'js-render'` already includes `js-render` (intentional TS/zod mismatch from Phase 1 01-03). Removing that mismatch is part of this phase's schema extension.
- `src/pipeline/run.ts:127` — `runPipeline()` is the composition root. Browser lifecycle (`chromium.launch()` / `browser.close()`) attaches here, thread-through argument to `fetchAll(firms, recorder, browser?)` and `enrichWithBody(firms, browser?)`.

### 2. Playwright API surface — minimum viable footprint

For Phase 4's scope, only five Playwright APIs are needed:

```typescript
import { chromium, type Browser, type BrowserContext } from 'playwright';

const browser: Browser = await chromium.launch({ headless: true });
const ctx: BrowserContext = await browser.newContext({
  userAgent: 'LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)',
});
const page = await ctx.newPage();
await page.goto(firm.url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
await page.waitForSelector(firm.wait_for, { timeout: 15_000 });
const html: string = await page.content();
await ctx.close();
// ... later ...
await browser.close();
```

No evaluate/click/fill/cookies/networking interception needed — we hydrate the page, read `page.content()`, and feed to the existing cheerio-based list-item extractor.

**`chromium --only-shell` compatibility:** The Playwright shell binary (~100MB, headless-only) supports `launch()`, `newContext()`, `newPage()`, `goto()`, `waitForSelector()`, `content()`, and `close()`. It does NOT support headed mode, video recording, tracing, or mobile emulation — none of which we need. Confirmed in PROJECT.md stack lock.

### 3. Four firms — audit recap + per-firm selector hints

Source: `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-RESEARCH.md` lines 147-151 and the current `config/firms.yaml` placeholder blocks.

| Firm | List URL | Seed `wait_for` hint | `list_item` | `title` | `link` | Timezone |
|------|----------|----------------------|-------------|---------|--------|----------|
| `lee-ko` | `https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR` | `ul#contentsList > li` (audit L147) | same | `.title` | `a` | `Asia/Seoul` |
| `yoon-yang` | `https://www.yoonyang.com/kor/insights/newsletters` | `ul#contentsList > li` (audit L148 — same class name as leeko, identical Vue template family hint) | same | `.title` | `a` | `Asia/Seoul` |
| `barun` | `https://www.baruninews.com/` (home — only JS-hydrated page with items per audit L149) **OR** firm-confirmed list path | UNKNOWN from audit — plan must verify at plan-time via live DevTools | UNKNOWN | UNKNOWN | UNKNOWN | `Asia/Seoul` |
| `latham` | `https://www.lw.com/en/insights-landing` | `.content-card__title` (audit L150) — each card element; list_item candidate `.content-card` (existing YAML placeholder, L198) | `.content-card` | `.content-card__title` | `a` | `America/New_York` |

**Wait_for verification plan (D-03):** The planner MUST include a live-probe task for each of the four firms BEFORE locking the selector in `config/firms.yaml`. Recommended approach: run a one-shot Playwright probe (`scripts/probe-wait-for.ts` temporary script) that takes `--firm <id> --url <url> --wait-for <selector>` and reports (a) how long `waitForSelector` took, (b) how many items cheerio extracts from `page.content()`, (c) the first extracted `(title, url)` pair. Plan 04-07 locks the selectors AFTER the probe confirms.

**Barun special case (D-01 new addition):** Barun has ZERO existing `firms.yaml` block. Phase 4 must ADD the block from scratch, not just flip `enabled: true`. Audit hint (L149) says "only home page shows 3-item teasers" — the planner must live-verify whether the home page OR a `/newsletter` sub-path is the cleanest JS-rendered source.

### 4. Browser lifecycle — one launch, per-firm context

Decision source: `04-CONTEXT.md` D-05.

```
runPipeline():
  ├─ chromium.launch()              # ONCE per run (or skipped if 0 js-render firms enabled)
  ├─ fetchAll(firms, rec, browser)
  │    └─ per js-render firm:
  │         ├─ browser.newContext({ userAgent })
  │         ├─ scrapeJsRender(firm, ctx)
  │         └─ ctx.close()
  ├─ enrichWithBody(results, browser)   # Playwright fallback reuses per-firm ctx
  └─ browser.close()                 # ALWAYS, in finally {}
```

**Why per-firm context:** BrowserContexts are isolated storage scopes — cookies, localStorage, caches don't bleed across firms. Cheaper than one-browser-per-firm. More isolated than one-browser+one-context-for-all.

**Launch cost budget:** `chromium.launch({ headless: true })` takes ~1.2s on Ubuntu GHA with cached binary (Playwright's own benchmark). `newContext()` takes ~80-150ms. `goto` + `waitForSelector` takes up to 15s (per-firm). For 4 firms: ~1.5s launch + 4 × ~80ms context + 4 × ~3s (real-world page load avg) = ~14s worst case for the list-page pass. The 3-min GHA budget has room.

**Detail-page fallback (D-04):** `enrichWithBody` already does 1 sequential detail fetch per item with 500ms inter-fetch delay. For a js-render firm with 3 new items and detail pages that static-extract under 200 chars, worst case adds: 3 × (~3s Playwright nav) + 2 × 500ms delay = ~10s. Still within budget. Only fires when `firm.type === 'js-render'` AND static body is below threshold.

### 5. GitHub Actions cache key — Playwright binary install

Pattern source: PROJECT.md stack lock ("Cache `~/.cache/ms-playwright` across GHA runs with `actions/cache`") + current `daily.yml` L45-54.

```yaml
- name: Cache Playwright browser binary
  uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}

- name: Install Playwright chromium shell
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: pnpm exec playwright install chromium --only-shell --with-deps
```

**Why `hashFiles('pnpm-lock.yaml')` as the version source:** pnpm-lock.yaml pins the exact `playwright` package version. When the package bumps, the hash changes, the cache invalidates, and a fresh `install` pulls the matching binary. Alternative: `hashFiles('**/playwright/package.json')` — slightly more precise but behavior is identical for a locked project. Keep it simple.

**First-run cost:** cache miss → `playwright install chromium --only-shell --with-deps` pulls ~100MB + Ubuntu apt deps in ~45s. Subsequent runs → cache hit, ~1s to restore, zero install.

**`--with-deps`:** Installs apt dependencies chromium needs (fonts, libnss, etc.). Without it, `chromium.launch()` throws `Host system is missing dependencies`. Required on Ubuntu GHA runners.

### 6. Error taxonomy — three new classes

Decision source: `04-CONTEXT.md` D-10.

Extend `src/compose/templates.ts:92-101` `classifyError()`:

```typescript
if (/browser|chromium|playwright.*(launch|install|executable)/i.test(msg)) return 'browser-launch-fail';
if (/waitForSelector|TimeoutError.*Playwright/i.test(msg)) return 'playwright-timeout';
if (/jsRender.*zero items|jsRender.*no items extracted/i.test(msg)) return 'selector-miss';
```

**Why these three and not fewer:**
- `browser-launch-fail` distinguishes infra problems (cache miss, apt deps missing, GHA runner disk full) from content problems. Ops response differs: infra → retry/cache bust; content → selector audit.
- `playwright-timeout` is the common content-drift signal: the firm removed/renamed the CSS class the wait_for targeted. Medium ops priority — wait one day, audit selector.
- `selector-miss` catches the case where the wait_for matched (page hydrated) but the downstream `list_item` extractor returned empty — indicates `wait_for` is too generic OR `list_item` selector drifted.

Existing `http-5xx`, `dns-fail`, `fetch-timeout` classes still apply for Playwright's own network errors — no new classes needed for those.

### 7. Schema extension — `wait_for` as a conditional required field

Decision source: `04-CONTEXT.md` D-12.

zod shape (extend `src/config/schema.ts:12-55`):

```typescript
// 1. Type enum extended:
type: z.enum(['rss', 'html', 'js-render']),

// 2. New optional field alongside selectors:
wait_for: z.string().min(1).optional(),

// 3. superRefine across the whole FirmSchema:
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
})
```

**Why `superRefine` and not two separate schemas:** single schema keeps YAML validation atomic and error messages grouped. `discriminatedUnion` on `type` would be more type-safe but requires duplicating every shared field across three branches — overkill for one conditional field. Phase 4 accepts the tradeoff.

**Type mirroring (`src/types.ts`):** Add `wait_for?: string;` to the `FirmConfig` interface. The `FirmType` line already includes `'js-render'`, so the only net change is the one new field.

### 8. `runPipeline` zero-js-render short-circuit

Decision source: `04-CONTEXT.md` Claude's Discretion #4 (recommended: skip browser launch when all js-render firms disabled).

```typescript
// Near the top of runPipeline, AFTER loadFirms + firmFilter:
const hasJsRender = firms.some(f => f.type === 'js-render');
let browser: Browser | undefined;
if (hasJsRender) {
  browser = await chromium.launch({ headless: true });
}
try {
  // ... existing pipeline, pass `browser` to fetchAll + enrichWithBody ...
} finally {
  if (browser) await browser.close();
}
```

**Why this matters:** Each `chromium.launch()` costs ~1.2s even when no js-render firm is enabled. The DX scenario: a developer flips all four js-render firms to `enabled: false` for a debugging run. Without the short-circuit, the debug run still pays 1.2s+cleanup. With the short-circuit, `check:firm cooley` (rss firm) is identical to pre-Phase-4 behavior.

**Cost of short-circuit:** one boolean check + conditional launch = negligible code weight.

### 9. Fail-loud rule — `exit(1)` after email + state

Decision source: `04-CONTEXT.md` D-08 + D-09.

Current `main.ts` ends with `main().then(code => process.exit(code))`. Currently `code` is 0 on full pipeline success, 1 on FATAL (composition-root throw). Phase 4 adds a new failure mode: **any js-render firm ended with `FirmResult.error` populated**. Flow:

```typescript
// In src/pipeline/run.ts, inside runPipeline after writeState:
const jsRenderFailures = summarized.filter(
  r => r.firm.type === 'js-render' && r.error != null,
);
// ... return report with new field:
return { ...report, jsRenderFailures: jsRenderFailures.length };
```

```typescript
// In src/main.ts, AFTER runPipeline returns:
const report = await runPipeline({});
if (report.jsRenderFailures > 0) {
  console.error(`FATAL: ${report.jsRenderFailures} js-render firm(s) failed`);
  return 1;   // ensures GHA step fails, triggers the Issue-opener step
}
return 0;
```

**Ordering invariant (D-08):** `writeState` has ALREADY run inside `runPipeline` before `main.ts` inspects the flag. `sendMail` has ALREADY run. The `exit(1)` is strictly after both — the recipient sees today's digest for the healthy firms, state persists, and only THEN the workflow goes red so the Issue-opener step runs. The Phase 3 `OPS-04` staleness banner still serves as the "no data ever" backstop.

### 10. Detail-page fallback threshold

Decision source: `04-CONTEXT.md` D-04 + Claude's Discretion #1.

In `enrichWithBody`:

```typescript
const STATIC_BODY_MIN_CHARS = 200;

// For js-render firms, after the existing static fetch + extractBody:
if (r.firm.type === 'js-render' && body.length < STATIC_BODY_MIN_CHARS && browser) {
  try {
    const ctx = await browser.newContext({ userAgent: USER_AGENT });
    const page = await ctx.newPage();
    await page.goto(item.url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
    const hydratedHtml = await page.content();
    await ctx.close();
    const hydratedBody = extractBody(hydratedHtml, r.firm.selectors?.body);
    if (hydratedBody.length > body.length) {
      // Fallback produced more signal — use it.
      return { ...item, description: hydratedBody };
    }
  } catch {
    // Per-item isolation (mirrors existing catch at L93).
  }
}
```

**Why 200 chars:** Below 200 chars of article body, Gemini's structured summary falls to `confidence: 'low'` almost universally (observed in Phase 1 probes). 200 is the signal/noise floor. Too high (say 1000) → too many fallbacks → 3-min budget risk. Too low (say 50) → miss real fallback cases where an article has a short teaser paragraph above a JS-hydrated body.

### 11. CLI output — fallback indicator

Decision source: `04-CONTEXT.md` Claude's Discretion #6.

When `check:firm <js-render-id>` triggers the static→Playwright fallback in `enrichWithBody`, emit one Reporter line:

```typescript
reporter.section('enrich', `${firm.id}: static fallback → Playwright for ${item.url}`);
```

Keeps the single-idea-per-line CLI format consistent with Phase 3 D-06. Operator sees WHY the enrich stage took longer than expected.

## Validation Architecture

> Nyquist validation is disabled for this project (`nyquist_validation_enabled: false`). No VALIDATION.md is required; per-plan `<acceptance_criteria>` serves as the local validation contract.

## Risks & Landmines

### Risk 1 — Playwright binary cache miss on first GHA run after version bump

**Symptom:** Runtime jumps from ~90s to ~140s; `actions/cache` miss logged. **Mitigation:** cache key includes `hashFiles('pnpm-lock.yaml')` so bumps are deterministic; `--only-shell --with-deps` keeps the download under 120s budget. **Acceptance:** Phase 4 final smoke-test task includes one clean-cache live run.

### Risk 2 — Hardcoded 15s `waitForSelector` timeout insufficient for firm X

**Symptom:** `playwright-timeout` errorClass on one firm consistently, other 3 succeed. **Mitigation:** D-13 locks 15s as v1. If one firm proves insufficient, the remediation is Phase 5 triggered item (`wait_for: { selector, timeout_ms }` rich shape) — do NOT expose timeout in v1. Failure footer will surface the pattern clearly.

### Risk 3 — Detail-page Playwright fallback causes quadratic slowdown

**Symptom:** For a firm with many items where every detail page static-extracts < 200 chars, fallback fires on every item → N × 3s Playwright calls. **Mitigation:** dedup runs BEFORE enrichBody in `runPipeline`'s order — so new-items (not all-items) drives the count. Realistic worst-case 2026: ~3 new items/day per firm × 4 firms × 3s = 36s. Well within 3-min budget. **Gate:** If a firm proves noisy, add to `deferred ideas` a per-firm `skip_static_body_probe: true` flag.

### Risk 4 — `chromium.launch()` intermittent failure on Ubuntu latest

**Symptom:** `Host system is missing dependencies` once a month after GHA runner image update. **Mitigation:** `--with-deps` re-installs apt deps each cache-miss; `browser-launch-fail` errorClass makes the retry story trivial (re-run workflow, cache busts, apt re-installs). No persistent remediation beyond the existing `if: failure()` issue-opener.

### Risk 5 — `barun` roster expansion surprise

**Symptom:** Phase 4 planning assumed barun is a known audit-target but `config/firms.yaml` has no block for it yet. **Mitigation:** Plan 04-04 (firms.yaml update) adds the block from scratch. Plan 04-07 (live wait_for probe) verifies the correct list URL (home page vs `/newsletter` sub-path — audit was inconclusive).

### Risk 6 — `wait_for` drift without monitoring

**Symptom:** Firm renames a CSS class; we don't notice until user comments on stale digest. **Mitigation:** Phase 3 `OPS-04` 30-day staleness banner is the backstop — same philosophy as HTML tier. New Phase 4 errorClass `playwright-timeout` surfaces in email footer (via EMAIL-05 Phase 2 mechanism) on the first failed day, not after 30.

## Architecture Patterns

### Pattern 1 — Scraper-Level Browser Injection (not Module Singleton)

```typescript
// GOOD — browser is a parameter, testable with mock Browser
export async function scrapeJsRender(
  firm: FirmConfig,
  browser: Browser,
): Promise<RawItem[]> { ... }

// BAD — browser is a module-scoped singleton
let browser: Browser | null = null;
export async function scrapeJsRender(firm: FirmConfig): Promise<RawItem[]> {
  browser ??= await chromium.launch();   // module state, test-hostile
  ...
}
```

Rationale: Phase 3 `runPipeline` IS the composition root. Keeping browser as an injected parameter:
1. Lets `runPipeline` own the full lifecycle (launch in try, close in finally).
2. Makes `scrapeJsRender` testable with a mock `Browser` that returns a canned HTML page.
3. Lets `check:firm` reuse the same code path without branch logic ("is this a dev CLI? then skip browser launch").

### Pattern 2 — Shared HTML → RawItem Helper (DRY tiers)

Extract a `parseListItemsFromHtml(html, firm, selectors)` from `scrapers/html.ts`:

```typescript
// src/scrapers/util.ts
export function parseListItemsFromHtml(
  html: string,
  firm: FirmConfig,
  selectors: Required<FirmConfig>['selectors'],
): RawItem[] { /* the cheerio loop that html.ts lines 80-151 already contains */ }
```

Then:

```typescript
// html.ts
const html = await decodeCharsetAwareFetch(...)
return parseListItemsFromHtml(html, firm, firm.selectors);

// jsRender.ts
const html = await page.content();
return parseListItemsFromHtml(html, firm, firm.selectors);
```

Rationale: both tiers produce identical `RawItem[]` shape; DRY the 71-line cheerio loop instead of copy-pasting. A Phase 5 bug fix to the date-format regex applies to both tiers in one edit.

**Caveat:** The extraction is a refactor, not a Phase 4 requirement. Two alternatives:
- **A (preferred):** Refactor in plan 04-02 (scrapers util) before writing jsRender.ts. Small, atomic, testable.
- **B (fallback):** Accept code duplication in jsRender.ts; file a Phase 5 cleanup triggered item. Ship faster; carry 60 lines of dup.

Plans will choose A.

### Pattern 3 — Fail-Soft Per-Item, Fail-Loud Per-Firm

Already the Phase 2 invariant. Phase 4 inherits it:
- Per-item Playwright error (one detail page nav fails) → swallow in try/catch, keep other items going.
- Per-firm Playwright error (list page fails to hydrate) → throw, caught by `fetchAll`'s outer try, synthesized to `FirmResult.error`, surfaces in email footer with new errorClass.

## Canonical Decision Summary

All 15 D-numbered decisions from `04-CONTEXT.md` are accepted as-is; research adds no contradictions. Two small research-derived additions:

- **R-01:** Extract `parseListItemsFromHtml` helper into `scrapers/util.ts` (Pattern 2 above) as part of Phase 4 plan 02, BEFORE `scrapers/jsRender.ts` (plan 03) is written. Keeps tier-parity tight from day one.
- **R-02:** Live `wait_for` probe is its own plan (plan 04-07) and runs BEFORE the `firms.yaml` flip (plan 04-08) — no guessed selectors ever land enabled.

## Next Step

Planner creates 8 plans (1 schema, 1 scraper-util refactor, 1 scrapers/jsRender, 1 pipeline glue, 1 GHA workflow, 1 enrichBody fallback, 1 live-probe, 1 config flip + smoke) organized into 3 waves.

## RESEARCH COMPLETE
