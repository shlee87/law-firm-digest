---
phase: 04-js-rendered-tier-conditional
reviewed: 2026-04-19T12:40:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - .github/workflows/daily.yml
  - config/firms.yaml
  - package.json
  - scripts/probe-js-render.ts
  - src/compose/templates.ts
  - src/config/schema.ts
  - src/main.ts
  - src/pipeline/enrichBody.ts
  - src/pipeline/fetch.ts
  - src/pipeline/run.ts
  - src/scrapers/html.ts
  - src/scrapers/jsRender.ts
  - src/scrapers/util.ts
  - src/types.ts
  - test/compose/digest.test.ts
  - test/config/schema.test.ts
  - test/pipeline/enrichBody.test.ts
  - test/pipeline/fetch.test.ts
  - test/pipeline/run.test.ts
  - test/scrapers/jsRender.test.ts
  - test/scrapers/util.test.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-19T12:40:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 4 cleanly lands the js-render tier: Playwright dispatch is well-isolated
behind a single composition root (`src/pipeline/run.ts`), the browser lifecycle
is correctly bracketed by a top-level `try/finally`, per-firm `BrowserContext`
is always closed via inner finally, and the D-08 fail-loud contract is honored
by deferring the exit-code decision to after email/archive/state commits.

Security posture is solid: **no hardcoded secrets**, no `eval`/`dangerouslySetInnerHTML`,
no `as any`/`@ts-ignore` in Phase 4 source, `scrubSecrets` is threaded through
every error-rendering path, HTML email is escaped via `escapeHtml`/`escapeAttr`,
and GitHub Actions secrets are only surfaced through environment variables.

Four Warnings center on resource-leak edge cases (a path where a Playwright
page can be orphaned if `page.close()` is omitted; a ReDoS-adjacent regex
compile on untrusted onclick strings in the worst case; `context.close()`
itself can throw in the outer finally and mask the original error; and a
silent-swallow of regex-compile errors in `extractLinkUrl` that could mask
a bad config). Info items are minor cleanups.

No critical security or correctness findings. No scraping-politeness
violations (UA header set on both fetch and Playwright contexts; pLimit(3)
at fetch + pLimit(1) per-firm detail + 500ms inter-item delay preserved).

---

## Warnings

### WR-01: Playwright `page` is not explicitly closed — relies on `context.close()` cascade

**File:** `src/scrapers/jsRender.ts:80-115`
**File:** `src/pipeline/enrichBody.ts:127-145`

**Issue:** Neither site that opens a page (`scrapeJsRender` list fetch,
`enrichWithBody` detail fallback) closes the `Page` object before
`context.close()`. Playwright documents that closing a context cascades to
its pages, so this is not a leak in the common success path — but if a
rare Playwright refactor or a forked browser driver changes that cascade,
the page keeps its CDP session alive. With up to 4 js-render firms + their
detail pages per run, an orphaned page per firm leaks ~2–4 MB each across
retries.

Also: in `jsRender.ts` the `page = await context.newPage()` (line 80) is
created BEFORE the inner try, so if `newPage()` itself throws, the `finally`
on line 111 still closes the context, but there is no page to worry about.
That's correct. However, for `enrichBody.ts:128` (`const page = await ctx.newPage()`),
the page is created inside the inner try, which is fine — the outer
`ctx.close()` handles it. So this is defensive-hardening, not a bug.

**Fix:** Add `await page.close().catch(() => {});` in the inner finally of
`scrapeJsRender` to make the invariant explicit rather than implicit:

```ts
const context = await browser.newContext({ userAgent: USER_AGENT });
let page: Page | null = null;
try {
  page = await context.newPage();
  // ... existing logic
} finally {
  if (page) await page.close().catch(() => {});
  await context.close().catch(() => {});
}
```

Same pattern for `enrichBody.ts:127-145` (wrap the existing `ctx.close()`
in a catch so a context-close failure does not mask the in-flight per-item
error before the outer `catch {}` swallows it).

---

### WR-02: `context.close()` in outer finally can throw and mask primary error

**File:** `src/scrapers/jsRender.ts:111-115`

**Issue:** The `finally { await context.close(); }` on line 113 is not
wrapped in `try/catch`. If Playwright throws during context close (e.g.,
browser crashed mid-navigation, connection reset, protocol error), this
throw will replace the original error that caused us to enter the finally
— the operator loses the "playwright-timeout" or "browser-launch-fail"
signal that drives `classifyError` → email footer → operator triage.

This also breaks the D-08 contract observation that the failing js-render
firm surfaces in the email's failed-firm footer with a correct errorClass:
if the context-close error replaces it, the footer shows the wrong class.

**Fix:** Defensively catch in the finally so the primary throw survives:

```ts
} finally {
  // Defensive: context.close() can throw on browser crash / protocol error.
  // Swallow so the primary in-flight error (the reason we entered finally)
  // surfaces to classifyError unchanged. Any close-failure logs are not
  // actionable for operators anyway — the context is being torn down.
  try { await context.close(); } catch { /* intentional */ }
}
```

Same issue exists at `src/pipeline/enrichBody.ts:143-145` (`ctx.close()`
inside a finally, outer catch on 146 is already silent — so there the
cascade is less harmful, but still makes the per-item isolation less
precise).

---

### WR-03: `new RegExp(lx.regex)` on each item — ReDoS-adjacent + no compile-error isolation

**File:** `src/scrapers/util.ts:353, 375`

**Issue:** Two call sites compile a fresh `RegExp` per list item from
config-supplied strings (`lx.regex` from `selectors.link.regex`, and
`selectors.link_onclick_regex`). Three concerns:

1. **ReDoS-adjacent:** the regex is config-controlled (not user-controlled
   in the traditional sense — YAML is trusted), but it runs against
   `attrValue` / `onclick` strings that ARE scraped HTML content. A
   pathological regex + crafted onclick string could pin a CPU core. Low
   risk because YAML is operator-authored, but the existing firms all use
   simple `\d+` captures — so the pattern space is bounded.

2. **No error isolation for a bad config regex:** if `lx.regex` is malformed
   (e.g., unclosed group), `new RegExp(...)` throws a `SyntaxError` inside
   the `$(selectors.list_item).each(...)` loop. The outer `try { ... } catch {}`
   on util.ts:420/451 swallows it — so a bad regex silently produces zero
   items, which then escalates to `selector-miss` at the scrapeJsRender
   level. The operator sees "selector-miss" in the email footer when the
   actual root cause is "your regex is invalid."

3. **Perf:** compiling on every iteration rather than once per firm. N=10-30
   items per firm, so negligible, but trivially fixable.

**Fix:** Compile once per firm, outside the `.each()` loop, and add a
try/catch for compile errors that surfaces the config bug clearly:

```ts
// In parseListItemsFromHtml, hoist regex compile:
let compiledRegex: RegExp | null = null;
if (typeof selectors.link === 'object' && selectors.link?.regex) {
  try {
    compiledRegex = new RegExp(selectors.link.regex);
  } catch (err) {
    throw new Error(
      `firm ${firm.id}: selectors.link.regex is not valid: ${(err as Error).message}`,
    );
  }
}
// Same for selectors.link_onclick_regex.
// Pass compiledRegex into extractLinkUrl instead of the raw string.
```

This converts a silent "selector-miss in email footer 4 hours later" into a
loud "invalid regex — fix config/firms.yaml" at pipeline start.

---

### WR-04: Per-item Playwright fallback has no delay between list fetch and detail fetch

**File:** `src/pipeline/enrichBody.ts:125-151`

**Issue:** For js-render firms with an item whose static body < 200 chars,
we immediately open a second Playwright context and navigate to the detail
URL. The 500ms `INTER_FETCH_DELAY_MS` gate (line 104) is BETWEEN items
within a firm, but a firm with 3 new items triggering the fallback will
hit the origin with: list fetch → static fetch item 1 → playwright item 1
(no delay) → 500ms → static fetch item 2 → playwright item 2 (no delay) →
500ms → etc.

This is not a politeness violation per se (the gate still paces items),
but for js-render firms the "1 req/firm/day spirit" mentioned in
enrichBody.ts:23 understates actual traffic: a firm with 3 short-static
items produces 1 (list) + 3 (static detail) + 3 (playwright detail) = 7
requests within ~3s. Some origins may interpret this as bursty, especially
when both the static and Playwright paths share the same UA.

Probability of actual blocking: low — 7 requests over 3s is well below
typical rate limits. But this is exactly the kind of thing a firm's WAF
picks up on if it's tuned aggressively.

**Fix:** Either (a) document the accepted tradeoff in enrichBody.ts's
politeness comment block (line 18-23), or (b) add a small delay
before `browser.newContext()` in the fallback branch:

```ts
if (r.firm.type === 'js-render' && staticBody.length < STATIC_BODY_MIN_CHARS && browser) {
  // Small extra delay before second origin hit on same item — avoids the
  // static + playwright double-tap looking like a retry storm to a WAF.
  await new Promise((res) => setTimeout(res, 250));
  try {
    const ctx = await browser.newContext({ userAgent: USER_AGENT });
    // ...
```

Recommend (a) — update the header comment to explicitly cover the double-fetch
case — since this is a $0 project and the firms in scope are currently 4
small KR/US firms with benign WAFs, and enforcement lives at a single point
for easy future tightening.

---

## Info

### IN-01: `extractLinkUrl` uses `itemEl: any` — disables type-checking across cheerio boundary

**File:** `src/scrapers/util.ts:338-339`

**Issue:** The function signature `// eslint-disable-next-line ...  function extractLinkUrl($: ..., itemEl: any, ...)`
uses `any` to match the surrounding `.each((_, el) => ...)` callback
style. Cheerio's `Element` type from `domhandler` is exported and would
work: `import type { Element } from 'domhandler';`. The eslint-disable
suppresses the warning but keeps the escape.

Not a bug — the callback style is consistent — but this is a type-safety
escape that could be closed without behavioral change.

**Fix:** Replace with `Element` from `domhandler`:

```ts
import type { Element } from 'domhandler';
function extractLinkUrl(
  $: ReturnType<typeof cheerio.load>,
  itemEl: Element,
  firm: FirmConfig,
): string | null { ... }
```

---

### IN-02: `waitUntil: 'domcontentloaded'` may miss late-hydrated content — by design but should be documented

**File:** `src/scrapers/jsRender.ts:85`
**File:** `src/pipeline/enrichBody.ts:131`

**Issue:** Both Playwright navigations use `waitUntil: 'domcontentloaded'`
rather than `'networkidle'` or `'load'`. This is intentional (faster, and
`waitForSelector` handles the hydration wait), but it's not documented in
the code. A future maintainer may flip it to `'load'` thinking it's a
robustness improvement and break the 15s budget for firms that load
late-firing analytics XHRs.

**Fix:** Add a short comment explaining the choice:

```ts
// domcontentloaded (not networkidle/load): waitForSelector below handles
// the hydration wait explicitly. networkidle would idle on long-poll
// analytics and blow the 15s timeout budget on firms like Latham.
await page.goto(firm.url, {
  timeout: GOTO_TIMEOUT_MS,
  waitUntil: 'domcontentloaded',
});
```

---

### IN-03: Test file `test/pipeline/enrichBody.test.ts` has no assertion that Playwright fallback opens a NEW context per item

**File:** `test/pipeline/enrichBody.test.ts:260-273`

**Issue:** The `makeMockBrowser` helper returns a single `ctx` — tests verify
that `ctx.close` was called (line 324) but don't verify that
`browser.newContext` is called with a FRESH context per item (D-05
invariant: per-item BrowserContext isolation). If a future refactor
accidentally reuses a context across items (e.g., cookies bleeding
between detail fetches), the test suite wouldn't catch it.

**Fix:** Add an explicit assertion in the happy-path fallback test:

```ts
// After enrichWithBody, with 2 short-static items:
expect(browser.newContext).toHaveBeenCalledTimes(items.length);
```

Plus a test with 2 items where each gets its own mock context and
assert `ctx1.close` AND `ctx2.close` were both called.

---

### IN-04: `scripts/probe-js-render.ts` silently treats `--link` without a value as "no link"

**File:** `scripts/probe-js-render.ts:58-64`

**Issue:** The `get(name)` helper returns `undefined` if the value starts
with `--` (line 62: `if (!v || v.startsWith('--')) return undefined`).
That's a reasonable heuristic, but for a CSS selector like `--link` without
a value (which is valid cheerio syntax would require quoting anyway), the
failure mode is confusing: the arg is silently dropped rather than
diagnosed as "--link needs a value."

Minor usability wart on a debug-only script.

**Fix:** Differentiate "missing flag" from "flag with missing value":

```ts
const get = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined; // flag not present
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) {
    console.error(`--${name} requires a value`);
    process.exit(4);
  }
  return v;
};
```

---

### IN-05: Cast `as never` in `enrichBody.ts` tests loses type signal for mock Browser shape

**File:** `test/pipeline/enrichBody.test.ts:322, 346, 365, 381, 402, 427`

**Issue:** `await enrichWithBody([jsRenderFirmResult], browser as never)` at
multiple sites. `as never` is the strongest TS escape — if `enrichWithBody`
changes its second-arg contract (adds a required method on Browser), the
tests silently compile. The `as unknown as Browser` pattern is verbose but
actually preserves some checking.

Low priority — this is standard vitest mocking idiom — but worth noting for
the same reason IN-01 exists: type-safety escapes tend to accumulate.

**Fix:** Define a minimal Browser-shaped interface in the test file:

```ts
type MockBrowser = Pick<Browser, 'newContext'>;
// then: const browser: MockBrowser = ...; await enrichWithBody([...], browser as Browser);
```

---

### IN-06: `config/firms.yaml` comment block at top references "plan 01-02 probe" that has moved

**File:** `config/firms.yaml:23-30`

**Issue:** The Phase 1 seed-firm comment block references "01-02 probe, W4"
and other Phase 1/2 planning artifacts. With Phase 4 landed, this block is
historical context that a non-developer (per CLAUDE.md: "Config UX — 로펌
추가는 비개발자 수준에서 가능해야 함") may find confusing. The Phase 2 and
Phase 4 lock notes (lines 32-46) are more current and arguably cover the
same ground.

Not a bug — just stale documentation that adds visual noise for the
intended non-developer audience.

**Fix:** Either archive the Phase 1 commentary into `.planning/` history
and collapse lines 23-46 into a single "current tier notes" section, or
leave as-is and accept that this file doubles as a changelog. No code
change required.

---

_Reviewed: 2026-04-19T12:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
