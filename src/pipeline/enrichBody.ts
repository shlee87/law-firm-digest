// Article body enrichment — run between fetchAll and applyKeywordFilter.
//
// For every RawItem on successful FirmResults, this stage issues a second GET
// to the article detail page (item.url), extracts the main body via the
// cheerio selector chain (util.ts#extractBody), and writes the normalized
// body text into item.description. The summarizer downstream (SUMM-06 +
// Phase 1 B3 bypass) reads description as the article body for Gemini.
//
// Why this stage exists (D-P2-02): Phase 1 passed RSS <description> teasers
// (typically 180 chars) to Gemini, producing low-confidence "paraphrase of a
// blurb" summaries. Fetching the detail page + extracting ~2K chars of real
// article text lifts summary quality to medium/high confidence.
//
// Politeness (D-P2-10):
//   - Cross-firm parallelism: inherited from pipeline/fetch.ts pLimit(3).
//     This module doesn't re-cap at the firm level — it runs all firms in
//     Promise.all at the outer layer.
//   - Within-firm sequentiality: per-firm pLimit(1) serializes detail
//     fetches. Each firm's site only sees one concurrent request from us.
//   - Min 500ms delay between detail fetches for the SAME firm. First item
//     has no delay (no predecessor); items 2+ wait 500ms. Keeps us inside
//     the "1 req/firm/day spirit" — a firm with 3 new items spreads 1 list
//     + 3 detail = 4 requests across ~2s.
//
// Failure modes:
//   - FirmResult.error set (upstream fetch failure) → pass-through by
//     reference. No detail fetches for a firm whose list page already errored.
//   - Individual item detail-fetch failure (timeout, 404, block, parse
//     error) → leave item.description UNCHANGED. RSS items carry a teaser
//     description we preserve; HTML items carry description: undefined and
//     summarize() will invoke the SUMM-06 B3 bypass for those.
//   - This function NEVER throws. Contract is same-length FirmResult[] out
//     with no fresh error objects.
//
// Phase 7 D-05/D-07 detail_tier-gated branch:
//   - firms with firm.detail_tier === 'js-render' route detail fetches
//     through Playwright EXCLUSIVELY — static fetch is NOT attempted.
//     (Rationale: bkl returns a long-but-identical landing HTML from
//     static fetch; threshold-based fallback cannot detect this, so we
//     skip static entirely when the operator declared js-render detail.)
//   - firms with firm.detail_tier === 'static' (including unset, which
//     zod defaults to 'static') run the existing Phase 1-6 static path.
//   - Per-item try/catch discipline preserved — one failed Playwright
//     detail fetch does NOT poison sibling items (D-P2-03 mirror).
//   - Per-firm BrowserContext (newContext → newPage → content → ctx.close
//     in finally) preserves cookie/session isolation between items (D-09).
//   - browser.close() is owned exclusively by run.ts outer finally — this
//     module MUST NEVER call browser.close().
//
// COMP-05 invariant: body is populated IN-PLACE on RawItem.description
// (already an optional field) — NOT on a new 'body' field. The state writer
// (state/writer.ts) does not persist description; therefore body never
// reaches disk. Adding a body field to RawItem would risk accidental
// persistence via a future writer refactor.
//
// Pattern 2 DRY_RUN invariant: this file does NOT import isDryRun. The
// two sanctioned check sites remain mailer/gmail.ts + state/writer.ts.

import pLimit from 'p-limit';
import type { Browser } from 'playwright';
import { decodeCharsetAwareFetch, extractBody } from '../scrapers/util.js';
import { USER_AGENT } from '../util/logging.js';
import type { FirmResult } from '../types.js';

const INTER_FETCH_DELAY_MS = 500;
const DETAIL_PAGE_TIMEOUT_MS = 15_000; // D-14

/**
 * Enrich every RawItem's description with body text extracted from its
 * detail page.
 *
 * @param results FirmResult[] from fetchAll. Failed firms are passed through
 *                by reference, successful firms have their r.raw items'
 *                description field populated.
 * @param browser Optional shared Browser handle. When present AND a firm has
 *                detail_tier === 'js-render' (Phase 7 D-07), detail fetches
 *                for that firm route through Playwright EXCLUSIVELY — the
 *                static fetch path is skipped. When absent OR firm has
 *                detail_tier === 'static' (or unset, zod-defaulted), the
 *                existing Phase 1-6 static decodeCharsetAwareFetch path runs.
 * @returns same-length FirmResult[]. Never throws.
 */
export async function enrichWithBody(
  results: FirmResult[],
  browser?: Browser,
): Promise<FirmResult[]> {
  return Promise.all(
    results.map(async (r) => {
      // Pass-through for failed firms (dedup.ts error pass-through mirror)
      if (r.error) return r;
      if (r.raw.length === 0) return r;

      const perFirm = pLimit(1); // sequential within firm (D-P2-10)

      const enrichedRaw = await Promise.all(
        r.raw.map((item, idx) =>
          perFirm(async () => {
            // Min-delay gate: first item no wait; items 2+ wait INTER_FETCH_DELAY_MS.
            if (idx > 0) {
              await new Promise((res) =>
                setTimeout(res, INTER_FETCH_DELAY_MS),
              );
            }
            // Phase 7 D-07 + Phase 9 D-05: Playwright-ONLY detail path, no static attempt.
            //   - detail_tier === 'js-render' (Phase 7): bkl, kim-chang explicitly opt in.
            //   - type === 'sitemap' (Phase 9): implicit — sitemap tier ALWAYS uses
            //     Playwright detail fetch per D-05. OR-gate short-circuits zod's
            //     detail_tier='static' default firing on sitemap firms (Pitfall 6).
            // Browser presence is guaranteed by run.ts hasJsRender check whenever any
            // firm needs it; we defensively check `browser` to handle test-harness
            // calls that pass results without a browser.
            const needsPlaywrightDetail =
              r.firm.detail_tier === 'js-render' || r.firm.type === 'sitemap';
            if (needsPlaywrightDetail && browser) {
              try {
                const ctx = await browser.newContext({ userAgent: USER_AGENT });
                try {
                  const page = await ctx.newPage();
                  await page.goto(item.url, {
                    timeout: DETAIL_PAGE_TIMEOUT_MS,
                    waitUntil: 'domcontentloaded',
                  });
                  const hydratedHtml = await page.content();
                  const hydratedBody = extractBody(
                    hydratedHtml,
                    r.firm.selectors?.body,
                  );
                  if (hydratedBody && hydratedBody.length > 0) {
                    return { ...item, description: hydratedBody };
                  }
                  return item;
                } finally {
                  await ctx.close();
                }
              } catch {
                // Per-item isolation (D-P2-03 mirror) — a failed Playwright
                // detail fetch does not tank sibling items. Leave description
                // untouched.
                return item;
              }
            }

            // detail_tier === 'static' (or undefined, zod-defaulted) →
            // existing Phase 1-6 static fetch path, unchanged.
            try {
              const { html } = await decodeCharsetAwareFetch(item.url, {
                timeoutMs: r.firm.timeout_ms ?? 20_000,
              });
              const staticBody = extractBody(html, r.firm.selectors?.body);
              if (staticBody && staticBody.length > 0) {
                return { ...item, description: staticBody };
              }
              return item;
            } catch {
              // Per-item isolation — one 404 / timeout / DNS fail does not
              // affect sibling items. Keep original description (undefined
              // for HTML tier, teaser for RSS tier).
              return item;
            }
          }),
        ),
      );

      return { ...r, raw: enrichedRaw };
    }),
  );
}
