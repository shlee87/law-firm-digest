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
// Phase 4 D-04 Playwright fallback:
//   - Applies ONLY to the js-render tier (rss/html tiers unchanged); the
//     branch is gated on the per-firm tier discriminant just below.
//   - Triggered when static extractBody returns fewer than 200 chars —
//     indicates the detail page is probably JS-hydrated too.
//   - Re-fetches the same URL in a fresh per-firm BrowserContext; reuses
//     the same extractBody chain on hydrated HTML.
//   - Keeps whichever body is longer (static vs hydrated). Equal length
//     → static (fewer side effects).
//   - Per-item try/catch discipline preserved — one failed Playwright
//     detail fetch does not block sibling items.
//   - No additional politeness delay on the Playwright path beyond the
//     existing 500ms inter-item gate (the Playwright nav itself dominates
//     the perceived per-item pacing at ~2-3s each).
//   - Note: plan 06 Task 2 intentionally does NOT plumb fallback counts
//     through the Reporter interface — it's a noisy signal that clutters
//     the CLI with per-item lines. The per-firm step-summary row already
//     shows body counts. If a future operator finds fallback-visibility
//     insufficient, promote to a Phase 5 triggered observability item.
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
const STATIC_BODY_MIN_CHARS = 200; // D-04 / Research §10 threshold
const DETAIL_PAGE_TIMEOUT_MS = 15_000; // D-14

/**
 * Enrich every RawItem's description with body text extracted from its
 * detail page.
 *
 * @param results FirmResult[] from fetchAll. Failed firms are passed through
 *                by reference, successful firms have their r.raw items'
 *                description field populated.
 * @param browser Optional shared Browser handle. When present AND a firm has
 *                type === 'js-render', a static extraction shorter than
 *                STATIC_BODY_MIN_CHARS triggers a Playwright re-fetch of the
 *                same URL. The longer of (static, hydrated) wins. When
 *                absent, behavior is identical to pre-Phase-4 static-only.
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
            // Static first — existing logic unchanged (keeps Phase 2 semantics for rss/html).
            try {
              const { html } = await decodeCharsetAwareFetch(item.url, {
                timeoutMs: r.firm.timeout_ms ?? 20_000,
              });
              const staticBody = extractBody(html, r.firm.selectors?.body);

              // D-04 Playwright fallback for js-render firms. Conditions:
              //   - firm.type must be 'js-render' (rss/html ignore this branch)
              //   - static body under threshold (signal too weak)
              //   - browser must be available (runPipeline only launches when hasJsRender)
              if (
                r.firm.type === 'js-render' &&
                staticBody.length < STATIC_BODY_MIN_CHARS &&
                browser
              ) {
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
                    // Keep whichever body has more signal. Equal length
                    // (including both 0) → static (fewer side effects).
                    if (hydratedBody.length > staticBody.length) {
                      return { ...item, description: hydratedBody };
                    }
                  } finally {
                    await ctx.close();
                  }
                } catch {
                  // Per-item isolation — one failed Playwright detail fallback
                  // doesn't tank the firm. Falls through to returning the
                  // static body (or original item) below.
                }
              }

              // Existing behavior: overwrite description ONLY if extraction
              // produced content. If extractBody returns '' (empty — which
              // can happen when the whole document was only noise), preserve
              // any prior description (e.g. RSS teaser) rather than erasing
              // signal.
              if (staticBody && staticBody.length > 0) {
                return { ...item, description: staticBody };
              }
              return item;
            } catch {
              // Per-item isolation — one 404 / timeout / DNS fail for this
              // article does not affect sibling items. Keep original
              // description (undefined for HTML tier, teaser for RSS tier).
              return item;
            }
          }),
        ),
      );

      return { ...r, raw: enrichedRaw };
    }),
  );
}
