// Minimal robots.txt fetcher + checker — COMP-03 pre-fetch gate.
//
// This is the FIRST outbound request layer; politeness invariants are
// baked in here so plan 05 fetch.ts (and every future scraper strategy)
// can call fetchRobots(origin) → isAllowed(url, disallows) without
// re-implementing the rules. Pitfall 9 (Saramin precedent) requires
// robots.txt respect for any automated scraping — RESEARCH.md L723-737.
//
// Phase 1 scope: hand-rolled parser covering only `User-agent: *`
// Disallow rules. Phase 2 may swap to `robots-parser` npm pkg when the
// firm set grows past one; RESEARCH.md §"Don't Hand-Roll" (L613)
// explicitly endorses hand-roll for the single-firm vertical slice.
//
// Caching: module-level Map<origin, string[]> keeps robots.txt content
// for the life of a single run. Each new process invocation re-fetches
// (GHA spawns a fresh runner per cron trigger), so there's no stale-cache
// concern across runs — only within a run.

import { USER_AGENT } from '../util/logging.js';

const cache = new Map<string, string[]>();

/**
 * Fetch and parse robots.txt for an origin. Returns the list of Disallow
 * path prefixes that apply to `User-agent: *`. On any non-200 response
 * (including 404 "no robots.txt"), caches and returns [] — the RFC
 * convention is "no robots.txt = no restrictions".
 *
 * Parse strategy (line-by-line):
 *   1. Strip `# comment` from each line.
 *   2. Empty line resets the active section (exits a User-agent: * block).
 *   3. `User-agent: *` enters the starred section.
 *   4. `Disallow: /path` while inside the starred section adds to the list.
 *   5. Any other User-agent key exits the starred section.
 *   6. Empty `Disallow:` (with no value) is skipped — it means "allow all".
 *
 * @param origin Origin string like `https://cooleygo.com` (NO trailing slash).
 * @returns Array of Disallow path prefixes; empty if robots.txt missing
 *          or no star-section restrictions.
 */
export async function fetchRobots(origin: string): Promise<string[]> {
  if (cache.has(origin)) return cache.get(origin)!;

  const res = await fetch(`${origin}/robots.txt`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    cache.set(origin, []);
    return [];
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const disallows: string[] = [];
  let inStar = false;

  for (const raw of lines) {
    // Strip inline comments, then trim.
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) {
      // Empty line ends the current User-agent block per RFC draft.
      inStar = false;
      continue;
    }
    const [key, ...rest] = line.split(':');
    const val = rest.join(':').trim();
    const keyLower = key.toLowerCase();
    if (keyLower === 'user-agent') {
      inStar = val === '*';
    } else if (inStar && keyLower === 'disallow' && val) {
      disallows.push(val);
    }
  }

  cache.set(origin, disallows);
  return disallows;
}

/**
 * Test whether a URL is allowed given a Disallow list. Returns true iff
 * no Disallow prefix is a prefix of the URL's pathname. Root `/` as a
 * Disallow value blocks everything (standard robots.txt semantics).
 *
 * @param url       Full URL to test (e.g. `https://cooleygo.com/feed/`).
 * @param disallows Output of fetchRobots(origin).
 * @returns true if allowed, false if any Disallow rule matches.
 */
export function isAllowed(url: string, disallows: string[]): boolean {
  const { pathname } = new URL(url);
  return !disallows.some((d) => pathname.startsWith(d));
}
