// Pure-function helpers shared by every scraper strategy.
//
// canonicalizeUrl is DEDUP-02's linchpin: every URL that enters SeenState
// goes through here first, so if two callers disagree on canonical form
// the dedup table splits and the same article gets emailed twice. Any edit
// to this function that changes its output for existing vectors is a
// breaking state-format change (see test/scrapers/util.test.ts for the
// locked vectors, and .planning/phases/01-foundation-vertical-slice/
// 01-RESEARCH.md §Pattern 4 for the design rationale).
//
// parseDate guards Pitfall 3/6 (timezone drift): every scraper routes
// firm-local date strings through here so downstream code always sees a
// UTC-ISO string regardless of the process timezone or DST state.

import { fromZonedTime } from 'date-fns-tz';
import iconv from 'iconv-lite';
import * as cheerio from 'cheerio';
import { USER_AGENT } from '../util/logging.js';
import type { FirmConfig, RawItem } from '../types.js';

/**
 * Query-string keys that are stripped from every URL during canonicalization.
 *
 * Entries 1-12: marketing / analytics trackers (utm_*, gclid, fbclid,
 * mailchimp mc_*, HubSpot _hs*, Marketo mkt_tok).
 * Entries 13-15: session-bearing params — sessionid/token/sid — that would
 * cause false-new items if the session rotates between runs and double as
 * a tiny information-disclosure mitigation (T-04-02).
 * Entries 16-18 (D-P2-16, 2026-04-17): legacy ASP ambient params. 법무법인
 * 로고스 (lawlogos.com) uses `/sub/news/newsletter_view.asp?b_idx=X&page=1&s_type=&s_keyword=`
 * where b_idx is item identity and the other three are pagination/search
 * ambient values that shift between requests. Keeping them in the URL
 * would bloat state and risk false-new-item events; stripping is safe
 * because no audited firm treats `page`/`s_type`/`s_keyword` as identity.
 *
 * NOTE: keeping this list exported rather than inlined so downstream plans
 * (e.g. plan 05 rss.ts) can reference it in documentation or, if ever
 * needed, extend it through a dedicated follow-up change rather than by
 * edit-in-place across multiple files.
 */
export const TRACKING_PARAMS: readonly string[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'sessionid',
  'token',
  'sid',
  // D-P2-16 additions (legacy ASP ambient params — see docstring above):
  'page',
  's_type',
  's_keyword',
];

/**
 * Normalize a URL to a canonical form for dedup and state storage.
 *
 * Steps (order matters):
 *   1. `new URL(input, base)` — throws on invalid input; plan 05 rss.ts
 *      wraps this call so a single bad RSS item fails the item, not the
 *      whole firm (T-04-01).
 *   2. Lowercase the protocol (HTTPS → https).
 *   3. Lowercase the hostname and strip a leading `www.`.
 *   4. Drop the fragment (`#section`) — never identifies a distinct article.
 *   5. Delete every TRACKING_PARAMS key.
 *   6. Sort the remaining query params alphabetically by key, stable on
 *      value order — so `?a=1&b=2` and `?b=2&a=1` produce the same output.
 *   7. Strip a trailing `/` from the pathname UNLESS the pathname is just
 *      `/` (root preservation matters — `https://cooley.com/` vs
 *      `https://cooley.com` would otherwise collapse to the ambiguous
 *      empty-pathname form).
 *
 * Scheme preservation is deliberate: `http://x/y` and `https://x/y` remain
 * distinct after canonicalization. This diverges from DEDUP-02 test vector
 * 3's literal expected output (which shows scheme flipping from http to
 * https); plan 01-04 documents this as the canonical contract — any
 * future scheme-collapse decision is a follow-up schema change.
 *
 * @param input URL string (absolute or, when base is provided, relative).
 * @param base  Optional base URL for resolving relative inputs.
 * @returns Canonical URL string. Same input always yields same output
 *          (pure function — no I/O, no env reads, no clock).
 */
export function canonicalizeUrl(input: string, base?: string): string {
  const u = new URL(input, base);

  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';

  for (const p of TRACKING_PARAMS) {
    u.searchParams.delete(p);
  }

  // Rewrite the search string with params sorted alphabetically by key.
  // We clear `u.search` then re-append in sorted order so the final
  // serialization is stable regardless of input order.
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  u.search = '';
  for (const [k, v] of sorted) {
    u.searchParams.append(k, v);
  }

  // Only strip trailing slash if pathname is more than "/" — root must
  // stay as "/" so `cooley.com/` normalizes to `https://cooley.com/`,
  // not `https://cooley.com`.
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

/**
 * Convert a firm-local date string in a named IANA timezone to a UTC ISO
 * string. Wraps date-fns-tz's `fromZonedTime` so the rest of the pipeline
 * depends on this helper (single point of upgrade if date-fns-tz ever
 * changes its semantics).
 *
 * Examples:
 *   parseDate('2026-04-14T23:50:00', 'Asia/Seoul')
 *     → '2026-04-14T14:50:00.000Z'  // KST = UTC+9, no DST
 *   parseDate('2026-04-14T12:00:00', 'America/Los_Angeles')
 *     → '2026-04-14T19:00:00.000Z'  // PDT = UTC-7 in April
 *   parseDate('2026-01-15T12:00:00', 'America/Los_Angeles')
 *     → '2026-01-15T20:00:00.000Z'  // PST = UTC-8 in January
 *
 * Unknown IANA zone strings cause `fromZonedTime` to throw RangeError;
 * the zod FirmSchema (plan 03) constrains `timezone` at config-load time
 * so reaching here with a bad zone implies a schema regression.
 *
 * @param raw Date-time string local to `tz` (typically ISO without offset).
 * @param tz  IANA timezone name (e.g. 'Asia/Seoul', 'America/Los_Angeles').
 * @returns UTC ISO-8601 string with millisecond precision, Z-suffixed.
 */
export function parseDate(raw: string, tz: string): string {
  return fromZonedTime(raw, tz).toISOString();
}

// --------------------------------------------------------------------------
// Phase 2 additions — HTML-tier helpers (decodeCharsetAwareFetch, extractBody)
// --------------------------------------------------------------------------

/**
 * Charset-aware HTML fetch (D-P2-06).
 *
 * Fetches URL, picks correct charset from Content-Type → <meta charset> → utf-8
 * fallback, and decodes via iconv-lite for non-UTF-8 bodies (so EUC-KR / CP949
 * Korean sites work). UTF-8 responses short-circuit through the native
 * `Buffer.toString('utf8')` path — never double-decoded.
 *
 * Why iconv-lite and not TextDecoder: Node 22's TextDecoder only supports
 * WHATWG encodings; `euc-kr` and `cp949` throw RangeError. iconv-lite covers
 * them (and many more). [RESEARCH L359]
 *
 * Error message shape `HTML fetch {url}: HTTP {status}` couples to the footer
 * classifier in compose/templates.ts (plan 05). Do NOT change the format.
 *
 * @param url URL to fetch (absolute, followed redirects honored).
 * @param opts.timeoutMs  AbortSignal.timeout — default 20000ms.
 * @returns { html, status, finalUrl } where `html` is always UTF-8 string.
 */
export async function decodeCharsetAwareFetch(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ html: string; status: number; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTML fetch ${url}: HTTP ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? '';

  // Priority 1: Content-Type header charset.
  let charset = /charset=([A-Za-z0-9_-]+)/i.exec(contentType)?.[1]?.toLowerCase();

  // Priority 2: <meta charset=...> or <meta http-equiv=Content-Type> in first 4KB.
  // iso-8859-1 is usually the web-server default when the actual body declares
  // a different charset internally — re-probe the document head in that case.
  if (!charset || charset === 'iso-8859-1') {
    const head = buf.subarray(0, 4096).toString('ascii');
    charset =
      /<meta[^>]+charset=["']?([A-Za-z0-9_-]+)/i.exec(head)?.[1]?.toLowerCase() ??
      charset ??
      'utf-8';
  }

  // Normalize Korean aliases to the iconv-lite canonical name.
  const normalized =
    charset === 'euc-kr' || charset === 'ks_c_5601-1987' ? 'cp949' : charset;

  const html =
    normalized === 'utf-8' || normalized === 'utf8'
      ? buf.toString('utf8')
      : iconv.decode(buf, normalized);

  return { html, status: res.status, finalUrl: res.url };
}

/**
 * Body selector chain per D-P2-02 / D-P2-11.
 *
 * Try in order: firm.selectors?.body override (if provided), then generic chain:
 * article → main → .entry-content → .post-content → .article-body → #content.
 * First selector matching AND yielding >120 chars of text wins.
 *
 * Fallback when nothing matches: find the single element parent with the
 * most <p> children (the "p-dense parent" heuristic) and return its text.
 * This handles sites that don't use any of the semantic wrappers.
 *
 * Noise strip: <script>, <style>, <nav>, <aside>, <footer>, ads, share
 * widgets, related-posts, role=navigation are removed from the document
 * BEFORE selectors match — ensures body text is signal, not footer junk.
 *
 * Text normalization (Pitfall 4): U+00A0 non-breaking space is replaced
 * with ASCII space BEFORE \s+ collapse; otherwise the keyword filter's
 * .slice(0, 500) boundary would land in inconsistent places across firms.
 *
 * Length cap: 10_000 chars — stays well under Gemini's 250K TPM shared
 * quota while preserving enough context for a real summary.
 *
 * @param html full HTML page (from decodeCharsetAwareFetch typically).
 * @param firmBodySelector  optional per-firm override from firm.selectors.body.
 * @returns normalized body text (may be empty string if nothing extractable).
 */
export function extractBody(html: string, firmBodySelector?: string): string {
  const $ = cheerio.load(html);

  // Strip noise globally first so subsequent selectors see only signal.
  const STRIP_SELECTORS = [
    'script',
    'style',
    'nav',
    'aside',
    'footer',
    '.ad',
    '.social-share',
    '.related-posts',
    '[role="navigation"]',
  ].join(',');
  $(STRIP_SELECTORS).remove();

  // Per-firm override wins (D-P2-11).
  if (firmBodySelector) {
    const override = $(firmBodySelector).first();
    if (override.length && override.text().trim().length > 0) {
      return normalize(override.text());
    }
  }

  // Generic chain (D-P2-02 / RESEARCH Pattern 2).
  const BODY_SELECTOR_CHAIN = [
    'article',
    'main',
    '.entry-content',
    '.post-content',
    '.article-body',
    '#content',
  ];
  for (const sel of BODY_SELECTOR_CHAIN) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 120) {
      return normalize(el.text());
    }
  }

  // Fallback: the <p>-dense parent.
  let bestEl = $('body');
  let bestScore = 0;
  $('p').each((_, p) => {
    const parent = $(p).parent();
    const ps = parent.find('p').length;
    if (ps > bestScore) {
      bestEl = parent;
      bestScore = ps;
    }
  });
  return normalize(bestEl.text());
}

/**
 * Whitespace + non-breaking-space normalization (Pitfall 4).
 * Collapses runs of whitespace (including U+00A0) into single ASCII space,
 * trims, caps at 10_000 chars.
 *
 * ORDER MATTERS: replace \u00a0 BEFORE the \s+ collapse, because JS regex
 * \s does NOT include U+00A0 — it would leak through unnormalized.
 */
function normalize(text: string): string {
  return text
    .replace(/\u00a0/g, ' ') // Pitfall 4: non-breaking space → ASCII space FIRST
    .replace(/\s+/g, ' ') // then collapse all whitespace runs
    .trim()
    .slice(0, 10_000);
}

// --------------------------------------------------------------------------
// Phase 4 additions — shared HTML-string → RawItem[] extractor (04-02)
// --------------------------------------------------------------------------

/**
 * Shared HTML-string → RawItem[] extractor used by both `scrapers/html.ts`
 * (server-rendered HTML via fetch) and `scrapers/jsRender.ts` (Playwright-
 * rendered HTML via page.content()). Accepts a full HTML string and a firm
 * whose selectors block describes the list_item / title / link shape.
 *
 * DRY source of truth: both tiers MUST go through this function so a date-
 * format fix, onclick-extract adjustment, or skip-malformed-row heuristic
 * applies to every js-rendered and server-rendered firm in one edit.
 *
 * Lifted verbatim from scrapers/html.ts:80-152 (2026-04-18) — per-item
 * try/catch discipline, silent skip on missing title/href, onclick-regex
 * capture-group substitution, canonicalizeUrl resolution against firm.url
 * base, and Pitfall 5 link_template absolute/path-absolute invariant are
 * all preserved.
 *
 * @throws NEVER. Returns [] for HTML with zero matching list items. The
 *         firm-level "list page empty" signal should be classified by the
 *         CALLER (scrapeJsRender may choose to throw "zero items" for the
 *         new errorClass 'selector-miss' — scrapeHtml historically does
 *         NOT throw; D-P2-03 preserved).
 */
export function parseListItemsFromHtml(html: string, firm: FirmConfig): RawItem[] {
  if (!firm.selectors) {
    return []; // defense-in-depth; schema refine blocks this at load-time
  }

  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  const selectors = firm.selectors;

  $(selectors.list_item).each((_, el) => {
    try {
      const title = $(el).find(selectors.title).first().text().trim();
      if (!title) return;

      let url: string;
      if (selectors.link !== undefined && selectors.link !== '') {
        const href = $(el).find(selectors.link).attr('href') ?? '';
        if (!href) return;
        url = canonicalizeUrl(href, firm.url);
      } else if (selectors.link_onclick_regex && selectors.link_template) {
        const anchor = $(el).find('a[onclick]').first();
        const onclick = anchor.attr('onclick') ?? $(el).attr('onclick') ?? '';
        if (!onclick) return;
        const match = new RegExp(selectors.link_onclick_regex).exec(onclick);
        if (!match) return;
        let resolved = selectors.link_template;
        for (let i = 1; i < match.length; i++) {
          resolved = resolved.replaceAll(`{${i}}`, match[i]);
        }
        url = canonicalizeUrl(resolved, firm.url);
      } else {
        return;
      }

      let publishedAt: string | undefined;
      if (selectors.date) {
        const dateText = $(el).find(selectors.date).first().text().trim();
        if (dateText) {
          const iso = normalizeDateString(dateText);
          if (iso) {
            try {
              publishedAt = parseDate(iso, firm.timezone);
            } catch {
              // swallow — leave publishedAt undefined
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
        description: undefined,
      });
    } catch {
      // per-item isolation — identical to html.ts:145-149
    }
  });

  return items;
}

/**
 * Normalize common list-page date formats to a Date.parse-friendly ISO-8601
 * local string (no offset — parseDate anchors with firm.timezone). LIFTED
 * from scrapers/html.ts:168-180 so both tiers share identical date parsing.
 *
 * NOTE: this helper was previously file-local in html.ts; promote to module
 * export so jsRender.ts (plan 03) does not need to re-declare it OR import
 * html.ts (which would be a tier-cross-dependency smell).
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
export function normalizeDateString(raw: string): string | null {
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
