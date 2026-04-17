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

/**
 * Query-string keys that are stripped from every URL during canonicalization.
 *
 * The first 12 are marketing / analytics trackers (utm_*, gclid, fbclid,
 * mailchimp mc_*, HubSpot _hs*, Marketo mkt_tok). The last 3 (sessionid,
 * token, sid) are session-bearing params that (a) would cause false-new
 * items if the session rotates between runs and (b) double as a tiny
 * information-disclosure mitigation (T-04-02).
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
