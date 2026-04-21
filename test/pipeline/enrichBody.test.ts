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
// Phase 7 plan 02 replacement (detail_tier-gated Playwright):
//   8.  detail_tier='js-render' → Playwright invoked, static fetch NOT called.
//   9.  detail_tier='static' → static fetch only, Playwright NOT invoked.
//   10. detail_tier unset (pre-Phase-7 firm) → defaults to static behavior (DETAIL-03 / SC-1).
//   11. Per-item Playwright throw isolated — siblings unaffected, no FirmResult.error.
//   12. enrichWithBody callable without a browser argument (js-render firms fall through to static).

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
// Phase 7 plan 02 — detail_tier-gated Playwright (replaces Phase 4 fallback block).
//
// Locks the DETAIL-02/03 contract:
//   (i)   detail_tier='js-render' → Playwright invoked, static fetch NOT called.
//   (ii)  detail_tier='static'     → static fetch only, Playwright NOT invoked.
//   (iii) detail_tier unset         → zod-defaults to 'static' behavior (DETAIL-03 SC-1 backwards compat).
//   (iv)  Per-item Playwright throw isolated (sibling items unaffected).
//   (v)   enrichWithBody callable without a browser argument.
// ----------------------------------------------------------------------------

describe('enrichWithBody (Phase 7 detail_tier-gated Playwright)', () => {
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

  // Base: html-tier firm that opts into Playwright detail fetching.
  const bklFirm: FirmConfig = {
    id: 'bkl',
    name: '태평양',
    language: 'ko',
    type: 'html',
    detail_tier: 'js-render',
    url: 'https://www.bkl.co.kr/law/insight/informationList.do?lang=ko',
    timezone: 'Asia/Seoul',
    enabled: true,
    selectors: { list_item: 'li', title: '.t', link: 'a' },
    timeout_ms: 20_000,
  };

  const bklFirmResult: FirmResult = {
    firm: bklFirm,
    raw: [
      {
        firmId: 'bkl',
        title: 'Test Article',
        url: 'https://www.bkl.co.kr/law/insight/informationView.do?infoNo=1',
        language: 'ko',
        description: undefined,
      },
    ],
    new: [],
    summarized: [],
    durationMs: 0,
  };

  const HYDRATED = (marker: string) =>
    '<!doctype html><html><body><article>' +
    `${marker} hydrated article body text that is definitely longer than one hundred and twenty characters because the extractBody chain requires this to be a real body passing the length gate used in the selector chain.` +
    '</article></body></html>';

  it('(i) detail_tier=js-render → Playwright invoked, static fetch NOT called', async () => {
    const hydrated = HYDRATED('PHASE7-PLAYWRIGHT');
    const staticFetchSpy = vi.fn();
    globalThis.fetch = staticFetchSpy as unknown as typeof fetch;

    const { browser, ctx, page } = makeMockBrowser(hydrated);
    const out = await enrichWithBody([bklFirmResult], browser as never);

    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: expect.stringContaining('LegalNewsletterBot'),
      }),
    );
    expect(page.goto).toHaveBeenCalledWith(
      bklFirmResult.raw[0].url,
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(ctx.close).toHaveBeenCalled();
    expect(staticFetchSpy).not.toHaveBeenCalled(); // D-07 — static skipped
    expect(out[0].raw[0].description).toContain('PHASE7-PLAYWRIGHT hydrated');
  });

  it('(ii) detail_tier=static → static fetch only, Playwright NOT invoked', async () => {
    const staticFirmResult: FirmResult = {
      ...bklFirmResult,
      firm: { ...bklFirm, detail_tier: 'static' },
    };
    globalThis.fetch = vi.fn(
      async () =>
        new Response(HYDRATED('PHASE7-STATIC'), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const { browser, page } = makeMockBrowser('<html/>');
    const out = await enrichWithBody([staticFirmResult], browser as never);

    expect(browser.newContext).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
    expect(out[0].raw[0].description).toContain('PHASE7-STATIC hydrated');
  });

  it('(iii) detail_tier unset → defaults to static behavior (DETAIL-03 backwards compat)', async () => {
    // Simulate a pre-Phase-7 FirmConfig shape — detail_tier field absent entirely.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { detail_tier: _dropped, ...noDetailTierFirm } = bklFirm;
    const legacyFirmResult: FirmResult = {
      ...bklFirmResult,
      firm: noDetailTierFirm as FirmConfig,
    };
    globalThis.fetch = vi.fn(
      async () =>
        new Response(HYDRATED('PHASE7-LEGACY'), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const { browser, page } = makeMockBrowser('<html/>');
    const out = await enrichWithBody([legacyFirmResult], browser as never);

    expect(page.goto).not.toHaveBeenCalled();
    expect(out[0].raw[0].description).toContain('PHASE7-LEGACY hydrated');
  });

  it('(iv) per-item Playwright throw isolated — siblings unaffected, no FirmResult.error', async () => {
    // 3-item firm; browser.newContext rejects on the SECOND call only.
    let contextCall = 0;
    const goodHydrated = HYDRATED('OK');
    const pageOk = {
      goto: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue(goodHydrated),
    };
    const ctxOk = {
      newPage: vi.fn().mockResolvedValue(pageOk),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const flakyBrowser = {
      newContext: vi.fn(async () => {
        contextCall++;
        if (contextCall === 2) {
          throw new Error('mock Playwright context failure for item 2');
        }
        return ctxOk;
      }),
    };

    const threeItems: FirmResult = {
      ...bklFirmResult,
      raw: [
        { firmId: 'bkl', title: 't1', url: 'https://bkl.co.kr/1', language: 'ko' },
        { firmId: 'bkl', title: 't2', url: 'https://bkl.co.kr/2', language: 'ko' },
        { firmId: 'bkl', title: 't3', url: 'https://bkl.co.kr/3', language: 'ko' },
      ],
    };

    const out = await enrichWithBody([threeItems], flakyBrowser as never);

    expect(out).toHaveLength(1);
    expect(out[0].error).toBeUndefined(); // firm-level error NOT set
    expect(out[0].raw).toHaveLength(3);
    expect(out[0].raw[0].description).toContain('OK hydrated'); // item 1 ok
    expect(out[0].raw[1].description).toBeUndefined(); // item 2 failed, unchanged
    expect(out[0].raw[2].description).toContain('OK hydrated'); // item 3 ok
  }, 10_000);

  it('(v) callable without a browser argument — js-render firms fall through to static', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(HYDRATED('STATIC-FALLTHROUGH'), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch;

    const out = await enrichWithBody([bklFirmResult]); // no browser
    expect(out).toHaveLength(1);
    // detail_tier='js-render' + no browser → the `&& browser` guard fails,
    // falls through to the static path.
    expect(out[0].raw[0].description).toContain('STATIC-FALLTHROUGH hydrated');
  });

  it('sitemap tier routes to Playwright detail path even without explicit detail_tier', async () => {
    // Plan 09-03 Task 2: OR-gate fix — sitemap firms MUST reach the
    // Playwright branch. Regression for Pitfall 6.
    const sitemapFirm: FirmConfig = {
      id: 'cooley',
      name: 'Cooley',
      language: 'en',
      type: 'sitemap',
      url: 'https://www.cooleygo.com/post-sitemap.xml',
      timezone: 'America/Los_Angeles',
      enabled: true,
      latest_n: 10,
      // NO detail_tier — zod would default to 'static' but OR-gate
      // should short-circuit that.
    };
    const rawItem = {
      firmId: 'cooley',
      title: 'X',
      url: 'https://www.cooleygo.com/article/',
      publishedAt: '2025-01-01T00:00:00.000Z',
      language: 'en' as const,
    };
    // Mock browser: context.newPage().goto → content returns HTML with
    // '.post-content' body text.
    const pageContent = vi.fn().mockResolvedValue(
      '<html><body><div class="post-content">Article body text, long enough to clear the 120-char generic chain threshold. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.</div></body></html>',
    );
    const pageGoto = vi.fn().mockResolvedValue(undefined);
    const page = { goto: pageGoto, content: pageContent };
    const contextClose = vi.fn().mockResolvedValue(undefined);
    const context = {
      newPage: vi.fn().mockResolvedValue(page),
      close: contextClose,
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
    };

    const staticFetchSpy = vi.fn();
    globalThis.fetch = staticFetchSpy as unknown as typeof fetch;

    const out = await enrichWithBody(
      [
        {
          firm: sitemapFirm,
          raw: [rawItem],
          new: [],
          summarized: [],
          durationMs: 0,
        },
      ],
      browser as never,
    );
    expect(out[0].raw[0].description).toMatch(/Article body text/);
    expect(browser.newContext).toHaveBeenCalled(); // Playwright branch entered
    expect(staticFetchSpy).not.toHaveBeenCalled(); // static path skipped
  });
});
