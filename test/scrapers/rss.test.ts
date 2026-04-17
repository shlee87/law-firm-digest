// Offline vitest coverage for src/scrapers/rss.ts.
//
// Deterministic by design — we mock globalThis.fetch so the test never
// touches the network. Fabricated fixture (test/fixtures/cooley.rss.xml)
// has three items with pubDates in GMT so the B2 no-double-zone guard
// can assert exact UTC round-trip without relying on the live Cooley
// feed's (variable) pubDate values.
//
// Three behaviors locked:
//   1. Shape: scrapeRss returns RawItem[] with canonical URLs (utm_source
//      stripped, www. stripped — DEDUP-02 contract flowing through).
//   2. B2 timezone invariant: item pubDate 12:00 GMT round-trips to
//      12:00:00.000Z regardless of firm.timezone being America/Los_Angeles.
//      Any regression that adds zone-aware re-anchor would shift by the
//      PDT (7h) or PST (8h) offset and this test catches it.
//   3. Failure propagation: HTTP 503 throws.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { scrapeRss } from '../../src/scrapers/rss.js';
import type { FirmConfig } from '../../src/types.js';

const cooley: FirmConfig = {
  id: 'cooley',
  name: 'Cooley',
  language: 'en',
  type: 'rss',
  url: 'https://cooley.com/feed',
  timezone: 'America/Los_Angeles',
  enabled: true,
  timeout_ms: 20000,
};

describe('scrapeRss', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses fixture into RawItem[] with canonical URLs', async () => {
    const xml = await readFile(
      new URL('../fixtures/cooley.rss.xml', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(xml, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }),
    ) as typeof fetch;

    const items = await scrapeRss(cooley);

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({
      firmId: 'cooley',
      language: 'en',
    });
    expect(typeof items[0].title).toBe('string');
    expect(items[0].url).toMatch(/^https?:\/\/[^/]*cooley/);
    // Canonicalization invariant from plan 01-04 flows through here:
    // utm_source stripped, no leading www.
    expect(items[0].url).not.toMatch(/utm_source/);
    expect(items[0].url).not.toMatch(/^https?:\/\/www\./);
  });

  it('publishedAt is absolute UTC (no zone re-apply)', async () => {
    // B2 regression guard. Fixture item 1: pubDate "Tue, 15 Apr 2026
    // 12:00:00 GMT" → must round-trip to "2026-04-15T12:00:00.000Z",
    // NOT shifted by America/Los_Angeles (firm.timezone).
    const xml = await readFile(
      new URL('../fixtures/cooley.rss.xml', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(xml, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }),
    ) as typeof fetch;

    const items = await scrapeRss(cooley);
    const first = items.find((i) => i.url.includes('2026-04-15')) ?? items[0];

    expect(first.publishedAt).toBeDefined();
    if (first.publishedAt) {
      // Millisecond-precision Z-suffixed UTC.
      expect(first.publishedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      // Exact expected value from fabricated fixture.
      expect(first.publishedAt).toBe('2026-04-15T12:00:00.000Z');
      // Defense-in-depth: NOT shifted by 7h (PDT) or 8h (PST).
      expect(first.publishedAt).not.toMatch(/^2026-04-15T(19|20):00:00/);
      expect(first.publishedAt).not.toMatch(/^2026-04-15T(04|05):00:00/);
    }
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 503 })) as typeof fetch;
    await expect(scrapeRss(cooley)).rejects.toThrow(/HTTP 503/);
  });
});
