---
phase: 09-cooley-sitemap-tier
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - config/firms.yaml
  - src/audit/firmAudit.ts
  - src/audit/types.ts
  - src/config/schema.ts
  - src/pipeline/enrichBody.ts
  - src/pipeline/fetch.ts
  - src/pipeline/run.ts
  - src/scrapers/sitemap.ts
  - src/types.ts
  - test/config/loader.test.ts
  - test/config/schema.test.ts
  - test/fixtures/cooley-post-sitemap.xml
  - test/pipeline/enrichBody.test.ts
  - test/pipeline/fetch.test.ts
  - test/scrapers/sitemap.test.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 9 introduces the `sitemap` tier variant for Cooley's WordPress sitemap discovery path, pivoting away from the Cloudflare-blocked `/feed/` RSS endpoint. The implementation is tight: `scrapeSitemap` follows the established scraper contract (same `RawItem[]` output, classifier-coupled error shapes, per-firm BrowserContext discipline with `finally` cleanup), the zod schema extension enforces exclusivity rules via `superRefine`, and `enrichBody.ts`'s OR-gate (`detail_tier === 'js-render' || type === 'sitemap'`) correctly short-circuits the zod-injected `detail_tier: 'static'` default for sitemap firms. Test coverage is strong — 10 sitemap-scraper cases exercise happy path, HTTP failures, malformed XML, zero-item drops, context cleanup in both happy and error paths, and title derivation. Exhaustiveness is preserved across all `switch(firm.type)` sites in `fetch.ts`, `firmAudit.ts`, and `schema.ts`.

No critical bugs or security issues found. Four warnings flag robustness gaps (classifier-coupled error shapes break on network-level throws, `canonicalizeUrl` `www.`-stripping replicates the 07-05/07-06 risk for Cooley detail URLs, explicit `detail_tier: 'static'` on a sitemap firm is silently accepted but functionally ignored, and the sitemap flow opens a fresh BrowserContext per detail item). Five info items cover naming drift (`hasJsRender` now covers sitemap too), minor refactor opportunities, and low-impact edge cases.

## Warnings

### WR-01: Network-level throws in `scrapeSitemap` bypass classifier-coupled error shape

**File:** `src/scrapers/sitemap.ts:60-68`
**Issue:** The module header comment (L22-27) declares three error shapes coupled to `classifyError` regexes in `src/compose/templates.ts`: `HTTP {status}`, `malformed XML ...`, `zero items extracted`. The HTTP-status branch is only reached when `res.ok()` is false — i.e. the fetch resolved with a response object. Network-level failures (DNS, connection reset, Playwright `context.request.get` timeout, TLS error) throw a Playwright-native error with message like `"net::ERR_NAME_NOT_RESOLVED at https://..."` that bypasses the classifier-coupled prefix. Downstream `compose/templates.ts#classifyError` will fall into the default bucket instead of matching `scrapeSitemap ...` shapes. This reduces debuggability for the most likely real-world failure mode (Cloudflare re-tightening their gate).
**Fix:**
```ts
let res;
try {
  res = await context.request.get(firm.url, { timeout: FETCH_TIMEOUT_MS });
} catch (err) {
  throw new Error(
    `scrapeSitemap ${firm.id}: fetch failed — ${(err as Error).message}`,
  );
}
const status = res.status();
if (!res.ok()) {
  throw new Error(`scrapeSitemap ${firm.id}: HTTP ${status}`);
}
xml = await res.text();
```
This preserves the `scrapeSitemap {firm.id}:` prefix across all fetch failure modes so `classifyError` has a consistent anchor. Also update the module comment's error-shape contract to document the `fetch failed` variant.

### WR-02: `canonicalizeUrl` strips `www.` from sitemap detail URLs — replicates the 07-05/07-06 root cause for Cooley

**File:** `src/scrapers/sitemap.ts:102`
**Issue:** `canonicalizeUrl(loc, firm.url)` is applied to every `<loc>` extracted from the sitemap. The helper (`src/scrapers/util.ts:96`) unconditionally strips leading `www.` from the hostname. So a sitemap entry `https://www.cooleygo.com/share-incentives-employees-uk/` becomes `https://cooleygo.com/share-incentives-employees-uk/` in the returned `RawItem.url`. `enrichBody.ts` then passes `item.url` verbatim to Playwright `page.goto()`. This is the exact pattern that broke `bkl` (Phase 7-06) and `kim-chang` (Phase 7-05): the apex domain either has a TLS-cert CN mismatch or redirects to the root path, poisoning the detail-page body extraction. Whether Cooley's apex `cooleygo.com` serves detail pages correctly is empirical — it may work today but is fragile. `test/scrapers/sitemap.test.ts` covers `items[0].title` but never asserts the emitted URL preserves `www.`, so a future TLS regression would not be caught by the test suite. Also, `config/firms.yaml` L67 explicitly declares `url: https://www.cooleygo.com/post-sitemap.xml` with `www.` for the sitemap fetch itself, but the canonicalization inside the scraper means every derived article URL loses it.
**Fix:** Either (a) confirm and document that `cooleygo.com` apex serves detail pages identically to `www.cooleygo.com` (smoke-test via `curl -sI`), AND add a regression test asserting the emitted URL for one known fixture entry — pin the current behavior. Or (b) fast-track the `restoreFetchHost(itemUrl, firmUrl)` follow-up planned for `bkl`/`kim-chang` re-enablement (referenced in firms.yaml L219-222) so all three sitemap + html-tier detail fetches use the firm's declared host. The 07-05-SUMMARY.md "URL-handling fix plan" covers both cases in one change.

### WR-03: Explicit `detail_tier: 'static'` on a sitemap firm passes schema but is silently overridden at runtime

**File:** `src/config/schema.ts:144-161` + `src/pipeline/enrichBody.ts:112-113`
**Issue:** The schema superRefine comment (L144-152) documents that it cannot distinguish a user-written `detail_tier: 'static'` from the zod-injected default, so the check is narrowed to only reject `detail_tier: 'js-render'`. Meanwhile, `enrichBody.ts` OR-gates on `r.firm.detail_tier === 'js-render' || r.firm.type === 'sitemap'` — so a user who explicitly writes `detail_tier: 'static'` on a sitemap firm (perhaps trying to force a static fetch for debugging) gets their field accepted by zod but silently ignored at runtime. The config UX contract (CLAUDE.md Constraints: "로펌 추가는 비개발자 수준에서 가능해야 함") says malformed firm entries should fail at startup with a precise error. This is a soft-violation: a value silently doesn't do what it says.
**Fix:** Preferred — migrate zod from `.default('static')` to distinguishing supplied vs injected. zod v4 supports `.catch()` or you can move the default into the loader post-parse so the raw parse preserves user-supplied `undefined`. Then tighten the check to `firm.detail_tier !== undefined` for sitemap firms. Alternative (lower effort): document the override at the zod error level with a separate refinement that parses the raw YAML input to detect user-supplied `detail_tier` before zod runs defaults. If neither is acceptable near-term, at minimum update the `latest_n` comment in `config/firms.yaml` L23-27 to warn that `detail_tier` is ignored on sitemap firms so non-developer operators do not waste time setting it.

### WR-04: `enrichBody.ts` allocates a fresh `BrowserContext` per detail item inside the per-firm pLimit(1) loop

**File:** `src/pipeline/enrichBody.ts:114-134`
**Issue:** For a sitemap firm with `latest_n: 10`, the current code opens and closes 10 separate `BrowserContext` instances in sequence (each with a `newPage()` inside). Context setup/teardown in Playwright is non-trivial (cookie jar init, worker allocation) — roughly 50-200ms each. At 10 items that's 0.5-2s of avoidable overhead on top of the mandatory 500ms `INTER_FETCH_DELAY_MS`. `probeSitemapFirm` in `firmAudit.ts:219-244` has the correct pattern: open context once outside the loop, reuse it for all items, close in outer finally. This is the same pattern Phase 4 D-05 established for `probeJsRenderFirm`.
**Fix:** Hoist `newContext`/`close` out of the per-item loop when `needsPlaywrightDetail && browser` is true for the firm:
```ts
if (needsPlaywrightDetail && browser) {
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const enrichedRaw = await Promise.all(
      r.raw.map((item, idx) =>
        perFirm(async () => {
          if (idx > 0) await new Promise((res) => setTimeout(res, INTER_FETCH_DELAY_MS));
          try {
            const page = await ctx.newPage();
            try {
              await page.goto(item.url, { timeout: DETAIL_PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
              const hydratedHtml = await page.content();
              const hydratedBody = extractBody(hydratedHtml, r.firm.selectors?.body);
              return hydratedBody && hydratedBody.length > 0 ? { ...item, description: hydratedBody } : item;
            } finally {
              await page.close();
            }
          } catch {
            return item; // per-item isolation preserved
          }
        }),
      ),
    );
    return { ...r, raw: enrichedRaw };
  } finally {
    await ctx.close();
  }
}
// ... static path unchanged
```
Note: this changes cookie/session isolation between items from per-item to per-firm. Comment at L45-46 says "Per-firm BrowserContext ... preserves cookie/session isolation between items (D-09)" — re-read D-09 to confirm whether the intent was per-item or per-firm. If per-item is load-bearing (some firms use session cookies that must not leak across articles), keep the current pattern. But for sitemap tier specifically, articles are stateless WordPress posts and the per-item isolation is not load-bearing — firms that need it can keep it via a per-tier branch. Given this is a correctness-vs-performance tradeoff and performance is explicitly out of v1 review scope, treat this as a future optimization candidate rather than a blocker. Also note the module comment at L35-48 describes per-firm BrowserContext, not per-item — the implementation drifted from the comment.

## Info

### IN-01: Variable `hasJsRender` is now misleading — covers three distinct triggers

**File:** `src/pipeline/run.ts:164-169`, `src/audit/firmAudit.ts:255-257`
**Issue:** The boolean gates chromium launch on `type === 'js-render' || detail_tier === 'js-render' || type === 'sitemap'`. The variable name `hasJsRender` is only accurate for the first disjunct. After Phase 7 and Phase 9 both extended the set, the name no longer communicates intent. A future contributor adding a fourth tier will have to re-read the surrounding comments to understand what the flag actually gates.
**Fix:** Rename to `needsChromium` (or `needsPlaywright`) at both call sites and in the `RunReport.jsRenderFailures` adjacent logic. The rename is purely cosmetic but improves grep-ability for future tier additions.

### IN-02: `titleFromUrl` first-char uppercasing is not Unicode-safe

**File:** `src/scrapers/sitemap.ts:123`
**Issue:** `w[0].toUpperCase() + w.slice(1).toLowerCase()` operates on UTF-16 code units. For a slug containing astral-plane characters (emoji, rare CJK, mathematical alphanumerics), `w[0]` returns a lone surrogate half and `.toUpperCase()` silently does nothing. Real-world impact is near zero for Cooley (all slugs are ASCII), but the function is generic (`src/scrapers/sitemap.ts` L108-128) and may be reused for other sitemap firms later.
**Fix:** Use `w.codePointAt(0)`-based uppercasing, or defer to `Array.from(w)[0]` which iterates by grapheme. Not urgent — ASCII slugs are the overwhelming WordPress convention.

### IN-03: `probeSitemapFirm` and `probeJsRenderFirm` duplicate ~40 lines of detail-probe orchestration

**File:** `src/audit/firmAudit.ts:162-202` vs `firmAudit.ts:204-245`
**Issue:** Both functions open a context, iterate `items.slice(0, DETAIL_SAMPLE_N)`, call `page.goto` with `waitUntil: 'domcontentloaded'`, read `page.content()`, call `extractBody`, close the page in `finally`, then `classifyDetailIdentity`. The only functional delta is the `extractBody` second arg (`firm.selectors?.body` vs `undefined`). A helper `probeDetailsWithBrowser(browser, items, bodySelectorOrUndefined)` could dedupe the loop. Low-priority refactor — both copies are short and cleanly scoped.
**Fix (optional):**
```ts
async function probeDetailsWithBrowser(
  browser: Browser,
  items: RawItem[],
  bodySelector: string | undefined,
): Promise<{ url: string; title: string; body: string }[]> {
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const bodies = [];
    for (const item of items.slice(0, DETAIL_SAMPLE_N)) {
      const page = await context.newPage();
      try {
        await page.goto(item.url, { timeout: PLAYWRIGHT_GOTO_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
        bodies.push({ url: item.url, title: item.title, body: extractBody(await page.content(), bodySelector) });
      } catch { /* per-detail isolation */ }
      finally { await page.close(); }
    }
    return bodies;
  } finally {
    await context.close();
  }
}
```
Then `probeJsRenderFirm` and `probeSitemapFirm` become one-liners around `probeDetailsWithBrowser`. Improves DRY; reduces the chance of one codepath drifting from the other (e.g., someone tweaking `waitUntil` in only one place).

### IN-04: `test/scrapers/sitemap.test.ts` "defaults to DEFAULT_LATEST_N" assertion is weak

**File:** `test/scrapers/sitemap.test.ts:67-75`
**Issue:** The test `'defaults to DEFAULT_LATEST_N=10 when firm.latest_n is undefined'` asserts `items.length <= 10` — which is trivially true because the fixture only yields 9 valid entries. The assertion does NOT verify that the default of 10 was actually applied (vs. say a bug that hardcoded 5). A fixture with 15+ valid entries would exercise the slice boundary.
**Fix:** Either expand the fixture to 12+ entries OR add a dedicated test with an inline XML string containing 15 valid `<url>` entries and assert `items.length === 10` exactly. Current test title claims a guarantee it does not actually enforce.

### IN-05: `schema.ts` — `firm.detail_tier === 'js-render'` narrowing comment could be shorter

**File:** `src/config/schema.ts:144-154`
**Issue:** The multi-line comment explaining why `detail_tier !== undefined` can't be used is correct but detailed enough that a future reader may not notice the narrower `=== 'js-render'` check is the actual enforcement. Consider splitting into: (1) a one-liner at the check explaining "only 'js-render' is user-assertable; 'static' is zod's default and indistinguishable" and (2) moving the longer rationale to a design note file or keeping in the WR-03 fix as part of the schema revision.
**Fix:** Cosmetic. Keep as-is unless WR-03 lands, in which case the whole block gets rewritten.

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
