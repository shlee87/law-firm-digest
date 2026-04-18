// TDD coverage for src/pipeline/enrichBody.ts.
//
// Contract locked:
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
