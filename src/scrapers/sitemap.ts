// Sitemap scraper — Phase 9 tier-4 path (D-01 / D-16 revision).
//
// Sibling to src/scrapers/rss.ts, html.ts, jsRender.ts. Consumes a FirmConfig
// where type='sitemap' + url points at a WordPress post-sitemap.xml. Emits
// the same RawItem[] contract so downstream dedup / enrichBody / summarize /
// compose stay tier-agnostic.
//
// D-16 REVISION (2026-04-20 live probe): Cloudflare extends managed-challenge
// to the sitemap XML endpoint when hit via undici (native fetch). Playwright's
// browser-HTTP stack (context.request.get) reliably returns HTTP 200 with the
// same LegalNewsletterBot UA. This module MUST use Playwright for the XML
// fetch; the undici-based charset-aware HTML helper (from util.js) is not
// viable for Cooley — see .planning/backlog/cooley-cf-bypass.md.
//
// Browser lifecycle (D-05 mirror):
//   - browser is an INJECTED parameter, NOT a module singleton. run.ts owns
//     launch()+close(); this module owns only the per-firm BrowserContext.
//   - context.newContext({ userAgent }) per firm — cookies/storage isolated.
//   - context.close() in finally {} — zombie-context prevention.
//
// Error message shapes (COUPLED to classifyError regex in
// src/compose/templates.ts; DO NOT modify without updating classifier in lockstep):
//   - 'scrapeSitemap {firm.id}: HTTP {status}' — XML fetch non-OK.
//   - 'scrapeSitemap {firm.id}: malformed XML (no <urlset> root)' — cheerio
//     loaded but root tag absent; likely HTML error page returned with 200.
//   - 'scrapeSitemap {firm.id}: zero items extracted' — XML parsed OK but
//     every <url> entry failed the loc+lastmod filter (D-10 drop policy).
//
// Title derivation (Phase 9 Option A, CONTEXT Decision resolved by plan 02):
//   - Sitemap XML has no <title>. We derive a slug title from the URL pathname
//     last segment, hyphens → spaces, Title-Case applied. Gemini summaries
//     use real body text via enrichBody's Playwright branch, so title is
//     cosmetic. Future enhancement: detail-page title via enrichBody is
//     intentionally out of scope (D-02: no sitemap-specific detail logic).

import type { Browser } from 'playwright';
import * as cheerio from 'cheerio';
import { USER_AGENT } from '../util/logging.js';
import { canonicalizeUrl } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';

const FETCH_TIMEOUT_MS = 20_000;
export const DEFAULT_LATEST_N = 10;

/**
 * Fetch a sitemap XML via Playwright browser-HTTP, parse it with cheerio
 * xml mode, and return the top-N most-recent entries as RawItem[].
 *
 * @param firm FirmConfig with type='sitemap' and url pointing at sitemap XML.
 *             firm.latest_n caps the returned RawItem count (default 10).
 * @param browser A launched chromium Browser instance. Owned by run.ts.
 * @throws Error with classifier-coupled shape on fetch / parse / zero-items.
 */
export async function scrapeSitemap(
  firm: FirmConfig,
  browser: Browser,
): Promise<RawItem[]> {
  const context = await browser.newContext({ userAgent: USER_AGENT });
  let xml: string;
  try {
    const res = await context.request.get(firm.url, {
      timeout: FETCH_TIMEOUT_MS,
    });
    const status = res.status();
    if (!res.ok()) {
      throw new Error(`scrapeSitemap ${firm.id}: HTTP ${status}`);
    }
    xml = await res.text();
  } finally {
    await context.close();
  }

  const $ = cheerio.load(xml, { xml: true });
  if ($('urlset').length === 0) {
    throw new Error(
      `scrapeSitemap ${firm.id}: malformed XML (no <urlset> root)`,
    );
  }

  type Entry = { loc: string; lastmodMs: number };
  const entries: Entry[] = [];
  $('url').each((_: number, el) => {
    const loc = $(el).find('loc').first().text().trim();
    const lastmodRaw = $(el).find('lastmod').first().text().trim();
    if (!loc) return;
    if (!lastmodRaw) return; // D-10: drop missing lastmod
    const t = new Date(lastmodRaw).getTime();
    if (Number.isNaN(t)) return; // drop unparseable dates
    entries.push({ loc, lastmodMs: t });
  });

  if (entries.length === 0) {
    throw new Error(`scrapeSitemap ${firm.id}: zero items extracted`);
  }

  entries.sort((a, b) => b.lastmodMs - a.lastmodMs);
  const topN = entries.slice(0, firm.latest_n ?? DEFAULT_LATEST_N);

  return topN.map(({ loc, lastmodMs }) => ({
    firmId: firm.id,
    title: titleFromUrl(loc),
    url: canonicalizeUrl(loc, firm.url),
    publishedAt: new Date(lastmodMs).toISOString(),
    language: firm.language,
  }));
}

/**
 * Derive a fallback title from a URL's pathname last segment.
 * Example: 'https://www.cooleygo.com/share-incentives-employees-uk/' →
 *          'Share Incentives Employees Uk'
 * Falls back to the full URL if the slug can't be derived.
 */
function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter((p) => p.length > 0);
    const slug = parts[parts.length - 1] ?? '';
    if (!slug) return url;
    return slug
      .split('-')
      .filter((w) => w.length > 0)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return url;
  }
}
