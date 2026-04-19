// HTML scraper — cheerio-based, charset-aware, handles both plain-href and
// onclick-extract firm variants.
//
// Sibling to src/scrapers/rss.ts. Consumes a FirmConfig where type='html' and
// emits RawItem[]. The Phase 2 tier-dispatch switch in pipeline/fetch.ts picks
// between scrapeRss and scrapeHtml based on firm.type.
//
// Two selector variants supported (D-P2-15):
//   A) Plain href: firm.selectors.link is a CSS selector for an <a> element
//      whose href attribute is the item URL. Shin-Kim, Yulchon, Logos, Skadden
//      use this variant.
//   B) Onclick extract: firm.selectors.link_onclick_regex + link_template
//      reconstruct the URL from an `onclick="goDetail('X','Y')"` attribute.
//      Kim-Chang and BKL use this variant. The regex must have capture groups;
//      the template substitutes {1}, {2}, ... with those captures.
//
// Both paths produce a RawItem with the SAME shape that rss.ts emits, so
// downstream dedup/summarize/compose stays tier-agnostic:
//   - firmId:      firm.id
//   - title:       text content of firm.selectors.title inside the list_item
//   - url:         canonicalizeUrl(href|reconstructed, firm.url)
//   - publishedAt: parseDate(normalized date text, firm.timezone) OR undefined
//   - language:    firm.language
//   - description: undefined — plan 04 enrichWithBody fetches the article
//                  detail page and populates body via a second GET. Keeping
//                  description undefined HERE is load-bearing: dedup filters
//                  on url only (canonical), and state/writer.ts does not
//                  persist description (COMP-05).
//
// Per-item try/catch discipline: one malformed row is silently skipped.
// This matches rss.ts's L82-101 pattern. A firm-level failure (non-OK HTTP,
// missing selectors object) still throws so the pipeline/fetch.ts outer
// catch can synthesize a FirmResult.error.
//
// Error message shape `scrapeHtml {firm.id}: HTTP {status}` is COUPLED to
// compose/templates.ts classifyError regex `/HTTP (\d{3})/` (plan 05). Do
// NOT change the format without updating the classifier in lockstep.
//
// Phase 4 (2026-04-18): the HTML-string → RawItem[] loop has been lifted into
// scrapers/util.ts as parseListItemsFromHtml, so both scrapeHtml and the new
// scrapeJsRender (Phase 4 plan 03) share identical extraction semantics. The
// fetch + charset-aware decode path remains here because scrapeJsRender's
// Playwright browser owns its own network stack.

import { decodeCharsetAwareFetch, parseListItemsFromHtml } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';

/**
 * Fetch an HTML listing page and parse it into a RawItem[].
 *
 * @param firm FirmConfig with type='html' and a selectors block satisfying
 *             the refine gate (link OR onclick-pair). Missing selectors
 *             throws "firm {id}: html tier requires selectors".
 * @throws Error on non-OK HTTP response from the list page fetch (shape:
 *         `scrapeHtml {firm.id}: HTTP {status}`). Outer pipeline/fetch.ts
 *         catches and synthesizes FirmResult.error.
 */
export async function scrapeHtml(firm: FirmConfig): Promise<RawItem[]> {
  if (!firm.selectors) {
    throw new Error(`firm ${firm.id}: html tier requires selectors`);
  }

  let html: string;
  try {
    const r = await decodeCharsetAwareFetch(firm.url, {
      timeoutMs: firm.timeout_ms ?? 20_000,
    });
    html = r.html;
  } catch (err) {
    // Re-wrap decodeCharsetAwareFetch errors so the message identifies THIS
    // scraper + firm.id for the footer classifier. The underlying error
    // shape from decodeCharsetAwareFetch is `HTML fetch {url}: HTTP {N}` —
    // re-wrap to `scrapeHtml {firm.id}: HTTP {N}` for consistency with
    // scrapeRss's `RSS fetch {firm.id}: HTTP {N}` pattern.
    const msg = (err as Error).message;
    const httpMatch = /HTTP (\d{3})/.exec(msg);
    if (httpMatch) {
      throw new Error(`scrapeHtml ${firm.id}: HTTP ${httpMatch[1]}`);
    }
    // Non-HTTP errors (timeout, DNS, abort) propagate verbatim — the
    // footer classifier handles timeout/ENOTFOUND patterns by keyword.
    throw err;
  }

  return parseListItemsFromHtml(html, firm);
}
