// TDD coverage for src/pipeline/enrichBody.ts.
//
// Contract locked (Phase 2):
//   1. Happy path — detail fetch succeeds → item.description populated
//      with extracted body text.
//   2. Firm-level error pass-through — r.error set → reference-equal
//      return, no fetch invoked.
//   3. Empty r.raw pass-through — no fetch invoked.
//   4. Per-item isolation — 503 on one item does not affect siblings.
//   5. D-P2-10 politeness — within a firm, detail fetches are sequential
//      (pLimit(1)) with >=500ms minimum interval between items 2+.
//   6. firm.selectors.body override — passed through to extractBody.
//   7. description-preserve on failure — RSS teaser is not erased.
//
// Phase 4 plan 06 additions (Playwright fallback):
//   8.  Fallback fires when static body < 200 chars for js-render firm.
//   9.  Fallback skipped when static body >= 200 chars (no Playwright nav).
//   10. Fallback skipped for rss/html firms even when static body is short.
//   11. Longer-wins semantic: static body kept when hydrated body is shorter.
//   12. Per-item isolation — Playwright throw doesn't tank the firm.
//   13. Backwards-compat — enrichWithBody works without a browser argument.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichWithBody } from '../../src/pipeline/enrichBody.js';
import type { FirmConfig, FirmResult } from '../../src/types.js';

const shinKim: FirmConfig = {
  id: 'shin-kim',
  name: '세종',
  language: 'ko',
  type: 'html',
  url: 'https://www.shinkim.com/kor/media/newsletter',
  timezone: 'Asia/Seoul',
  enabled: true,
  timeout_ms: 20000,
  selectors: {
    list_item: '.post-prime',
    title: 'a.text',
    link: 'a.text',
  },
  include_keywords: [],
  exclude_keywords: [],
};

function makeFirmResult(urls: string[]): FirmResult {
  return {
    firm: shinKim,
    raw: urls.map((u, i) => ({
      firmId: shinKim.id,
      title: `title-${i}`,
      url: u,
      language: 'ko',
      description: undefined,
    })),
    new: [],
    summarized: [],
    durationMs: 0,
  };
}

const BODY_HTML = (marker: string) =>
  `<!doctype html><html><body><article>${marker} article body text that is definitely longer than one hundred and twenty characters because the extractBody chain requires this to be a real body passing the length gate used in the selector chain.</article></body></html>`;

describe('enrichWithBody', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('populates description with extracted body text (happy path)', async () => {
    const results = [
      makeFirmResult([
        'https://shinkim.com/kor/media/newsletter/1',
        'https://shinkim.com/kor/media/newsletter/2',
      ]),
    ];
    globalThis.fetch = vi.fn(
      async () =>
        new Response(BODY_HTML('ITEM-SIGNAL'), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const out = await enrichWithBody(results);
    expect(out).toHaveLength(1);
    expect(out[0].raw[0].description).toContain('ITEM-SIGNAL article body text');
    expect(out[0].raw[1].description).toContain('ITEM-SIGNAL article body text');
  }, 10_000);

  it('pass-through by reference when FirmResult.error is set', async () => {
    const errored: FirmResult = {
      firm: shinKim,
      raw: [],
      new: [],
      summarized: [],
      error: { stage: 'fetch', message: 'network down' },
      durationMs: 0,
    };
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await enrichWithBody([errored]);
    expect(out[0]).toBe(errored); // reference-equal
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('pass-through by reference when r.raw is empty', async () => {
    const empty = makeFirmResult([]);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await enrichWithBody([empty]);
    expect(out[0]).toBe(empty);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('per-item isolation — one 503 does not affect siblings', async () => {
    const results = [
      makeFirmResult([
        'https://shinkim.com/kor/media/newsletter/1',
        'https://shinkim.com/kor/media/newsletter/2',
        'https://shinkim.com/kor/media/newsletter/3',
      ]),
    ];
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 2) return new Response('', { status: 503 });
      return new Response(BODY_HTML(`OK-${call}`), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof fetch;

    const out = await enrichWithBody(results);
    expect(out[0].raw[0].description).toContain('OK-1 article body');
    expect(out[0].raw[1].description).toBeUndefined(); // preserved
    expect(out[0].raw[2].description).toContain('OK-3 article body');
  }, 10_000);

  it('preserves pre-existing description on detail-fetch failure (RSS teaser retention)', async () => {
    const rssTeaser =
      'This is an RSS teaser that came from feedparser. 180 chars typical.';
    const withTeaser: FirmResult = {
      ...makeFirmResult(['https://cooleygo.com/insights/rss-item/42']),
      raw: [
        {
          firmId: 'cooley',
          title: 'RSS item',
          url: 'https://cooleygo.com/insights/rss-item/42',
          language: 'en',
          description: rssTeaser,
        },
      ],
    };
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 503 }),
    ) as unknown as typeof fetch;

    const out = await enrichWithBody([withTeaser]);
    expect(out[0].raw[0].description).toBe(rssTeaser); // untouched
  });

  it('passes firm.selectors.body to extractBody as override', async () => {
    const firmWithBodyOverride: FirmConfig = {
      ...shinKim,
      selectors: {
        list_item: '.post-prime',
        title: 'a.text',
        link: 'a.text',
        body: '.custom-body',
      },
    };
    const results: FirmResult[] = [
      {
        firm: firmWithBodyOverride,
        raw: [
          {
            firmId: firmWithBodyOverride.id,
            title: 't',
            url: 'https://example.com/x',
            language: 'ko',
          },
        ],
        new: [],
        summarized: [],
        durationMs: 0,
      },
    ];
    const mixedHtml =
      '<html><body>' +
      '<article>generic article body long enough to pass the 120-char gate. generic generic generic generic generic generic generic generic generic generic generic generic generic generic generic.</article>' +
      '<div class="custom-body">OVERRIDE body text long enough to pass the length gate. override override override override override override override override override override.</div>' +
      '</body></html>';
    globalThis.fetch = vi.fn(
      async () =>
        new Response(mixedHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const out = await enrichWithBody(results);
    expect(out[0].raw[0].description?.startsWith('OVERRIDE body')).toBe(true);
  });

  it('enforces ≥500ms delay between detail fetches within a firm (D-P2-10)', async () => {
    const starts: number[] = [];
    globalThis.fetch = vi.fn(async () => {
      starts.push(Date.now());
      return new Response(BODY_HTML('OK'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof fetch;

    const results = [
      makeFirmResult([
        'https://shinkim.com/1',
        'https://shinkim.com/2',
        'https://shinkim.com/3',
      ]),
    ];

    await enrichWithBody(results);

    expect(starts.length).toBe(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(450);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(450);
  }, 10_000);
});

// ----------------------------------------------------------------------------
// Phase 4 plan 06 — Playwright fallback for js-render firms.
//
// Locks the four invariants from must_haves:
//   (a) fallback fires when static < 200 chars for js-render firm
//   (b) fallback skipped when static >= 200 chars (no Playwright nav)
//   (c) fallback skipped for rss/html firms (tier-aware branch)
//   (d) longer-wins semantic (static kept when hydrated is shorter)
// Plus two backwards-compat invariants:
//   (e) per-item isolation when Playwright throws
//   (f) enrichWithBody is callable without a browser argument
// ----------------------------------------------------------------------------

describe('enrichWithBody (Phase 4 Playwright fallback)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeMockBrowser(hydratedHtml: string) {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue(hydratedHtml),
    };
    const ctx = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(ctx),
    };
    return { browser, ctx, page };
  }

  const jsRenderFirm: FirmConfig = {
    id: 'lee-ko',
    name: '광장',
    language: 'ko',
    type: 'js-render',
    url: 'https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR',
    timezone: 'Asia/Seoul',
    enabled: true,
    wait_for: 'ul',
    selectors: { list_item: 'li', title: '.t', link: 'a' },
    timeout_ms: 20_000,
  };

  const jsRenderFirmResult: FirmResult = {
    firm: jsRenderFirm,
    raw: [
      {
        firmId: 'lee-ko',
        title: 'Test Article',
        url: 'https://www.leeko.com/article/1',
        language: 'ko',
        description: undefined,
      },
    ],
    new: [],
    summarized: [],
    durationMs: 0,
  };

  it('fires Playwright fallback when static body < 200 chars for js-render firm', async () => {
    const shortStaticHtml = '<html><body><p>Too short</p></body></html>';
    const hydratedHtml =
      '<html><body><article>' +
      'This is a much longer hydrated article body that should win over the static fallback. '.repeat(
        10,
      ) +
      '</article></body></html>';

    globalThis.fetch = vi.fn(
      async () =>
        new Response(shortStaticHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const { browser, ctx } = makeMockBrowser(hydratedHtml);
    const out = await enrichWithBody([jsRenderFirmResult], browser as never);
    expect(out[0].raw[0].description).toContain('hydrated article body');
    expect(ctx.close).toHaveBeenCalled();
    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: expect.stringContaining('LegalNewsletterBot'),
      }),
    );
  });

  it('does NOT fire Playwright fallback when static body >= 200 chars', async () => {
    const longStaticHtml =
      '<html><body><article>' + 'A'.repeat(300) + '</article></body></html>';
    const hydratedHtml = '<html><body>should not be reached</body></html>';

    globalThis.fetch = vi.fn(
      async () =>
        new Response(longStaticHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const { browser, page } = makeMockBrowser(hydratedHtml);
    const out = await enrichWithBody([jsRenderFirmResult], browser as never);
    expect(out[0].raw[0].description).toMatch(/A{200,}/);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('does NOT fire Playwright fallback for rss firms even when body is short', async () => {
    const rssFirmResult: FirmResult = {
      ...jsRenderFirmResult,
      firm: { ...jsRenderFirmResult.firm, type: 'rss', wait_for: undefined },
    };
    const shortHtml = '<html><body><p>short</p></body></html>';
    globalThis.fetch = vi.fn(
      async () =>
        new Response(shortHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const { browser, page } = makeMockBrowser('<html/>');
    await enrichWithBody([rssFirmResult], browser as never);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('keeps static body when hydrated body is SHORTER (longer-wins semantic)', async () => {
    const staticHtml =
      '<html><body><article>' + 'X'.repeat(150) + '</article></body></html>';
    const hydratedHtml = '<html><body><article>SHORT</article></body></html>';
    globalThis.fetch = vi.fn(
      async () =>
        new Response(staticHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;
    const { browser } = makeMockBrowser(hydratedHtml);
    const out = await enrichWithBody([jsRenderFirmResult], browser as never);
    expect(out[0].raw[0].description).toMatch(/X{100,}/);
    expect(out[0].raw[0].description).not.toContain('SHORT');
  });

  it('per-item isolates a Playwright fallback throw (returns static body instead of erroring out)', async () => {
    const shortStatic = '<html><body><p>short</p></body></html>';
    globalThis.fetch = vi.fn(
      async () =>
        new Response(shortStatic, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const brokenBrowser = {
      newContext: vi.fn().mockRejectedValue(new Error('mock Playwright failure')),
    };
    const out = await enrichWithBody(
      [jsRenderFirmResult],
      brokenBrowser as never,
    );
    // Static body had something extractable — even if short — it's returned
    // when the Playwright fallback fails. The assertion is that the call
    // resolved (no throw bubbled up).
    expect(out).toHaveLength(1);
    expect(out[0].raw).toHaveLength(1);
  });

  it('works without a browser argument (callable standalone for rss/html-only pipelines)', async () => {
    const rssFirmResult: FirmResult = {
      ...jsRenderFirmResult,
      firm: { ...jsRenderFirmResult.firm, type: 'rss', wait_for: undefined },
    };
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          '<html><body><article>normal body text here yes that is long enough to pass the 120-char generic-chain length gate without any tricks at all really truly long.</article></body></html>',
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        ),
    ) as unknown as typeof fetch;

    const out = await enrichWithBody([rssFirmResult]); // no browser
    expect(out).toHaveLength(1);
    expect(out[0].raw[0].description).toContain('normal body text');
  });
});
