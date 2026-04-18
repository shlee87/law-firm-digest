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

import * as cheerio from 'cheerio';
import { canonicalizeUrl, decodeCharsetAwareFetch, parseDate } from './util.js';
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

  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  const selectors = firm.selectors;

  $(selectors.list_item).each((_, el) => {
    try {
      // Title
      const title = $(el).find(selectors.title).first().text().trim();
      if (!title) return; // silently skip rows without a title

      // URL — branch A (plain href) vs branch B (onclick extract)
      let url: string;
      if (selectors.link !== undefined && selectors.link !== '') {
        const href = $(el).find(selectors.link).attr('href') ?? '';
        if (!href) return; // silently skip rows whose anchor has no href
        url = canonicalizeUrl(href, firm.url);
      } else if (selectors.link_onclick_regex && selectors.link_template) {
        // Prefer an anchor INSIDE the row, fall back to onclick on the row itself.
        const anchor = $(el).find('a[onclick]').first();
        const onclick = anchor.attr('onclick') ?? $(el).attr('onclick') ?? '';
        if (!onclick) return;
        const match = new RegExp(selectors.link_onclick_regex).exec(onclick);
        if (!match) return;
        let resolved = selectors.link_template;
        for (let i = 1; i < match.length; i++) {
          resolved = resolved.replaceAll(`{${i}}`, match[i]);
        }
        // Pitfall 5 defense: link_template is zod-validated to be absolute
        // (https://...) or path-absolute (/...). Relative templates are
        // rejected at schema-load. canonicalizeUrl resolves against firm.url
        // so path-absolute templates anchor to origin, not the list-page path.
        url = canonicalizeUrl(resolved, firm.url);
      } else {
        // No link branch configured. Schema refine (plan 01) catches this at
        // load-time; defense-in-depth: silently skip at scrape-time too.
        return;
      }

      // publishedAt — optional, best-effort
      let publishedAt: string | undefined;
      if (selectors.date) {
        const dateText = $(el).find(selectors.date).first().text().trim();
        if (dateText) {
          const iso = normalizeDateString(dateText);
          if (iso) {
            try {
              publishedAt = parseDate(iso, firm.timezone);
            } catch {
              // Invalid IANA zone or unparseable ISO — leave publishedAt
              // undefined rather than tanking the item. Plan 04 / summarize
              // don't require it.
            }
          }
        }
      }

      items.push({
        firmId: firm.id,
        title,
        url,
        publishedAt,
        language: firm.language,
        description: undefined, // plan 04 enrichBody will populate
      });
    } catch {
      // Per-item isolation: one malformed row does not tank the whole firm.
      // Any exception from cheerio selector evaluation or URL canonicalization
      // is swallowed here so sibling rows continue to process. Firm-level
      // failures (bad list page HTML, non-OK HTTP) already threw above.
    }
  });

  return items;
}

/**
 * Normalize common list-page date formats to a Date.parse-friendly ISO-8601
 * local string (no offset — parseDate anchors with firm.timezone).
 *
 * Recognized formats (audit-observed 2026-04-17):
 *   "2026.04.17"         → 2026-04-17T00:00:00  (Shin-Kim / 세종)
 *   "2026. 04. 17."      → 2026-04-17T00:00:00  (Yulchon / 율촌)
 *   "2026. 4. 17"        → 2026-04-17T00:00:00  (space-padded single digit)
 *   "17 April 2026"      → 2026-04-17T...       (Date.parse-compatible English)
 *   "April 17, 2026"     → 2026-04-17T...       (Skadden US format)
 *
 * Returns null for anything unparseable — caller leaves publishedAt undefined.
 */
function normalizeDateString(raw: string): string | null {
  // Asian YYYY.MM.DD with optional space padding and trailing dot
  const m = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/.exec(raw);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00`;
  }
  // Fall back to native Date.parse for English forms
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 19);
  }
  return null;
}
