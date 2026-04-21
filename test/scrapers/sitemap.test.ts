// Offline vitest coverage for src/scrapers/sitemap.ts.
//
// Deterministic by design — no real chromium required. Hand-rolled mock
// with the Browser / BrowserContext / Request API surface we actually use
// is cast to `never` at call sites to opt out of full-interface TS
// conformance. Same pattern as test/scrapers/jsRender.test.ts.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { scrapeSitemap } from '../../src/scrapers/sitemap.js';
import type { FirmConfig } from '../../src/types.js';

const FIXTURE_XML = readFileSync(
  new URL('../fixtures/cooley-post-sitemap.xml', import.meta.url),
  'utf8',
);

function makeFirm(overrides: Partial<FirmConfig> = {}): FirmConfig {
  return {
    id: 'cooley',
    name: 'Cooley',
    language: 'en',
    type: 'sitemap',
    url: 'https://www.cooleygo.com/post-sitemap.xml',
    timezone: 'America/Los_Angeles',
    enabled: true,
    latest_n: 10,
    ...overrides,
  };
}

function makeMockBrowser(opts: { xmlBody: string; status?: number }) {
  const status = opts.status ?? 200;
  const response = {
    ok: () => status < 400,
    status: () => status,
    text: vi.fn().mockResolvedValue(opts.xmlBody),
  };
  const request = { get: vi.fn().mockResolvedValue(response) };
  const contextClose = vi.fn().mockResolvedValue(undefined);
  const context = { request, close: contextClose };
  const browser = { newContext: vi.fn().mockResolvedValue(context) };
  return { browser, context, contextClose, request, response };
}

describe('scrapeSitemap (Phase 9)', () => {
  it('parses fixture → 9 RawItems sorted by lastmod desc, missing-lastmod dropped', async () => {
    const { browser } = makeMockBrowser({ xmlBody: FIXTURE_XML });
    const items = await scrapeSitemap(makeFirm(), browser as never);
    // Fixture has 10 <url> entries, 1 missing lastmod → 9 expected.
    expect(items).toHaveLength(9);
    // Sort is strictly descending on publishedAt.
    const times = items.map((i) => Date.parse(i.publishedAt!));
    const sortedDesc = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sortedDesc);
  });

  it('applies latest_n cap (firm.latest_n=3 → 3 items)', async () => {
    const { browser } = makeMockBrowser({ xmlBody: FIXTURE_XML });
    const items = await scrapeSitemap(
      makeFirm({ latest_n: 3 }),
      browser as never,
    );
    expect(items).toHaveLength(3);
  });

  it('defaults to DEFAULT_LATEST_N=10 when firm.latest_n is undefined', async () => {
    const { browser } = makeMockBrowser({ xmlBody: FIXTURE_XML });
    const items = await scrapeSitemap(
      makeFirm({ latest_n: undefined }),
      browser as never,
    );
    // Only 9 pass the filter; slice(0, 10) returns 9.
    expect(items.length).toBeLessThanOrEqual(10);
  });

  it('throws classifier-friendly message on HTTP non-200', async () => {
    const { browser } = makeMockBrowser({
      xmlBody: '',
      status: 403,
    });
    await expect(
      scrapeSitemap(makeFirm(), browser as never),
    ).rejects.toThrow(/scrapeSitemap cooley: HTTP 403/);
  });

  it('throws malformed-XML message when <urlset> is absent', async () => {
    const { browser } = makeMockBrowser({
      xmlBody: '<html><body>Not a sitemap</body></html>',
    });
    await expect(
      scrapeSitemap(makeFirm(), browser as never),
    ).rejects.toThrow(/scrapeSitemap cooley: malformed XML \(no <urlset> root\)/);
  });

  it('throws zero-items-extracted when every <url> entry fails the filter', async () => {
    const allMissingLastmod = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/a/</loc></url>
        <url><loc>https://example.com/b/</loc></url>
      </urlset>`;
    const { browser } = makeMockBrowser({ xmlBody: allMissingLastmod });
    await expect(
      scrapeSitemap(makeFirm(), browser as never),
    ).rejects.toThrow(/scrapeSitemap cooley: zero items extracted/);
  });

  it('always closes the browser context (finally discipline)', async () => {
    const { browser, contextClose } = makeMockBrowser({ xmlBody: FIXTURE_XML });
    await scrapeSitemap(makeFirm(), browser as never);
    expect(contextClose).toHaveBeenCalledTimes(1);
  });

  it('closes context even when fetch throws (non-OK response)', async () => {
    const { browser, contextClose } = makeMockBrowser({
      xmlBody: '',
      status: 500,
    });
    await expect(
      scrapeSitemap(makeFirm(), browser as never),
    ).rejects.toThrow(/HTTP 500/);
    expect(contextClose).toHaveBeenCalledTimes(1);
  });

  it('passes firm.url VERBATIM to context.request.get (www. preserved, no canonicalize)', async () => {
    const { browser, request } = makeMockBrowser({ xmlBody: FIXTURE_XML });
    await scrapeSitemap(makeFirm(), browser as never);
    expect(request.get).toHaveBeenCalledWith(
      'https://www.cooleygo.com/post-sitemap.xml',
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('sends USER_AGENT via newContext (politeness / classifier consistency)', async () => {
    const { browser } = makeMockBrowser({ xmlBody: FIXTURE_XML });
    await scrapeSitemap(makeFirm(), browser as never);
    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: expect.stringContaining('LegalNewsletterBot'),
      }),
    );
  });

  it('derives title from URL slug (Title-Case, hyphen-split)', async () => {
    const fixedXml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://www.cooleygo.com/share-incentives-employees-uk/</loc>
          <lastmod>2025-01-15T10:00:00+00:00</lastmod>
        </url>
      </urlset>`;
    const { browser } = makeMockBrowser({ xmlBody: fixedXml });
    const items = await scrapeSitemap(makeFirm(), browser as never);
    expect(items[0].title).toBe('Share Incentives Employees Uk');
  });
});
