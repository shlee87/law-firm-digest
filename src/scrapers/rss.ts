// RSS scraper — feedparser-based, streaming, absolute-time pass-through.
//
// Consumes a FirmConfig where type='rss' and emits RawItem[]. This is the
// first concrete scraper strategy; plan 05 pipeline/fetch.ts wires the
// robots gate in front of it, and plan 07 dedup consumes the RawItem[]
// downstream. Phase 2 will add an html.ts sibling.
//
// Timezone contract (B2 — 2026-04-17):
//   feedparser's item.pubdate is ALREADY an absolute JS Date (it parses
//   RFC-822 / ISO input with its inline offset). .toISOString() therefore
//   emits a correct UTC ISO string. Do NOT re-anchor via the zone-aware
//   date helper from ./util.js — that would interpret the already-UTC
//   string as local to firm.timezone and shift by the offset (double-zone
//   bug). The zone-aware helper is reserved for Phase 2 HTML scrapers
//   that encounter zone-less date strings. Note: src/scrapers/rss.ts is
//   machine-verified to contain ZERO occurrences of that helper's
//   identifier as a B2 regression gate — this comment therefore avoids
//   the literal token on purpose.
//
// Stream bridge: Node 22's WHATWG ReadableStream from fetch.res.body is
// converted to a Node Readable via Readable.fromWeb, then piped into the
// feedparser Transform. This avoids buffering the entire feed in memory
// and keeps malformed-item handling cheap.
//
// Per-item isolation: a single malformed item (missing link, unparseable
// URL) is silently skipped so it doesn't fail the whole feed. Firm-level
// failures (non-OK HTTP, empty body, parser.on('error')) still throw and
// are caught by the fetch.ts orchestrator per-firm try/catch.

import FeedParser from 'feedparser';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { USER_AGENT } from '../util/logging.js';
import { canonicalizeUrl } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';

/**
 * Fetch and parse an RSS/Atom feed into a RawItem array.
 *
 * Behavior:
 *   - Outbound GET uses the honest USER_AGENT (FETCH-04 / Pitfall 9).
 *   - Per-firm timeout: firm.timeout_ms (default 20000ms) via AbortSignal.
 *   - Non-OK HTTP → throws (firm-level failure).
 *   - Empty body → throws.
 *   - Parser error → rejects.
 *   - Per-item catch → skip malformed item, keep going.
 *
 * Returned RawItem fields:
 *   - firmId:      firm.id (stable state key).
 *   - title:       original-language title (SUMM-06: never translated).
 *   - url:         canonicalizeUrl(item.link, firm.url) — strips utm_*,
 *                  www., fragment, trailing slash; resolves relative.
 *   - publishedAt: item.pubdate.toISOString() if present — already UTC,
 *                  NO zone-aware re-anchor from util.js (B2).
 *   - language:    inherited from firm.language (not item.meta.language).
 *   - description: item.description || item.summary — SUMM-06 summarizer
 *                  input; Pitfall 4 hallucination defense.
 *
 * @param firm FirmConfig with type='rss'.
 * @returns Promise<RawItem[]> in feed order (newest first by convention).
 */
export async function scrapeRss(firm: FirmConfig): Promise<RawItem[]> {
  const res = await fetch(firm.url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(firm.timeout_ms ?? 20000),
  });
  if (!res.ok) {
    throw new Error(`RSS fetch ${firm.id}: HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error(`RSS fetch ${firm.id}: empty body`);
  }

  return new Promise<RawItem[]>((resolve, reject) => {
    const items: RawItem[] = [];
    const parser = new FeedParser({});

    parser.on('error', reject);
    parser.on('readable', function () {
      let item: FeedParser.Item | null;
      while ((item = this.read())) {
        try {
          const url = canonicalizeUrl(item.link ?? '', firm.url);
          // feedparser's item.pubdate is ALREADY an absolute Date —
          // .toISOString() is UTC. Do NOT wrap in the zone-aware helper
          // from util.js; that would re-interpret as local to
          // firm.timezone and shift by the offset (B2 double-zone bug).
          const publishedAt = item.pubdate ? item.pubdate.toISOString() : undefined;
          items.push({
            firmId: firm.id,
            title: item.title ?? '(untitled)',
            url,
            publishedAt,
            language: firm.language,
            description: item.description ?? item.summary ?? undefined,
          });
        } catch {
          // Skip malformed item (e.g. unparseable link) — don't tank
          // the whole feed on a single bad row.
        }
      }
    });
    parser.on('end', () => resolve(items));

    // Bridge WHATWG ReadableStream (res.body) → Node Readable → parser.
    Readable.fromWeb(res.body as unknown as WebReadableStream).pipe(parser);
  });
}
