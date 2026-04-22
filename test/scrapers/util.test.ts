// Unit tests for src/scrapers/util.ts — DEDUP-02 canonicalizeUrl + Pitfall 3/6 parseDate.
//
// These tests lock the contract of the two hottest pure functions in the pipeline.
// Every change to canonicalizeUrl or parseDate MUST keep these vectors green; any
// change that forces an update here is a breaking change to downstream state.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import {
  canonicalizeUrl,
  parseDate,
  decodeCharsetAwareFetch,
  extractBody,
  parseListItemsFromHtml,
  normalizeDateString,
  restoreFetchHost,
} from '../../src/scrapers/util.js';
import type { FirmConfig } from '../../src/types.js';

describe('canonicalizeUrl', () => {
  // The canonical form of the Cooley test article (RESEARCH.md L547-552).
  const expected = 'https://cooley.com/news/insight/2026/2026-04-15-ai-reg';

  it('strips www subdomain', () => {
    expect(
      canonicalizeUrl('https://www.cooley.com/news/insight/2026/2026-04-15-ai-reg'),
    ).toBe(expected);
  });

  it('strips utm_source tracking param (DEDUP-02 vector 1)', () => {
    expect(
      canonicalizeUrl(
        'https://www.cooley.com/news/insight/2026/2026-04-15-ai-reg?utm_source=x',
      ),
    ).toBe(expected);
  });

  it('is a no-op on the already-canonical form (DEDUP-02 vector 2)', () => {
    expect(
      canonicalizeUrl('https://cooley.com/news/insight/2026/2026-04-15-ai-reg'),
    ).toBe(expected);
  });

  it('strips trailing slash from non-root path (DEDUP-02 vector 3, scheme preserved)', () => {
    // NOTE: canonicalizeUrl preserves the scheme (lowercases only).
    // RESEARCH.md's vector 3 uses http:// input but expected https:// output;
    // plan 01-04 documents this as a deliberate divergence — scheme preservation
    // is the canonical contract. If product later wants http→https collapse,
    // that's a v1.x follow-up change to this function.
    expect(
      canonicalizeUrl('http://cooley.com/news/insight/2026/2026-04-15-ai-reg/'),
    ).toBe('http://cooley.com/news/insight/2026/2026-04-15-ai-reg');
  });

  it('strips fragment / hash AND trailing slash (DEDUP-02 vector 4)', () => {
    expect(
      canonicalizeUrl(
        'https://www.cooley.com/news/insight/2026/2026-04-15-ai-reg/#section-1',
      ),
    ).toBe(expected);
  });

  it('preserves root slash', () => {
    expect(canonicalizeUrl('https://cooley.com/')).toBe('https://cooley.com/');
  });

  it('lowercases hostname', () => {
    expect(canonicalizeUrl('https://COOLEY.COM/x')).toBe('https://cooley.com/x');
  });

  it('lowercases scheme (HTTPS -> https)', () => {
    expect(canonicalizeUrl('HTTPS://cooley.com/x')).toBe('https://cooley.com/x');
  });

  it('strips all 12 known marketing tracking params', () => {
    const url =
      'https://cooley.com/x' +
      '?utm_medium=a&utm_campaign=b&gclid=c&fbclid=d' +
      '&mc_cid=e&mc_eid=f&_hsenc=g&_hsmi=h&mkt_tok=i' +
      '&utm_term=m&utm_content=n&utm_source=o';
    expect(canonicalizeUrl(url)).toBe('https://cooley.com/x');
  });

  it('strips session-identifying params (sessionid, token, sid)', () => {
    const url = 'https://cooley.com/x?sessionid=j&token=k&sid=l';
    expect(canonicalizeUrl(url)).toBe('https://cooley.com/x');
  });

  it('preserves non-tracking params, sorted alphabetically', () => {
    expect(canonicalizeUrl('https://cooley.com/x?z=1&a=2&m=3')).toBe(
      'https://cooley.com/x?a=2&m=3&z=1',
    );
  });

  it('resolves relative URL against base', () => {
    expect(canonicalizeUrl('/news/foo', 'https://www.cooley.com/base/')).toBe(
      'https://cooley.com/news/foo',
    );
  });

  it('strips D-P2-16 legacy ASP params (page, s_type, s_keyword)', () => {
    expect(
      canonicalizeUrl(
        'https://www.lawlogos.com/sub/news/newsletter_view.asp?b_idx=1443&page=1&s_type=&s_keyword=',
      ),
    ).toBe('https://lawlogos.com/sub/news/newsletter_view.asp?b_idx=1443');
  });

  it('strips page/s_type/s_keyword independently (each entry is honored)', () => {
    expect(
      canonicalizeUrl(
        'https://example.com/x?a=1&page=5&s_type=news&s_keyword=foo&b=2',
      ),
    ).toBe('https://example.com/x?a=1&b=2');
  });

  it('collapses all four DEDUP-02 canonical vectors that share the same scheme', () => {
    // The three https vectors (1, 2, 4) MUST all collapse to the same canonical form.
    const vectors = [
      'https://www.cooley.com/news/insight/2026/2026-04-15-ai-reg?utm_source=x',
      'https://cooley.com/news/insight/2026/2026-04-15-ai-reg',
      'https://www.cooley.com/news/insight/2026/2026-04-15-ai-reg/#section-1',
    ];
    const normalized = vectors.map((v) => canonicalizeUrl(v));
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe(expected);
  });
});

describe('parseDate', () => {
  it('converts Asia/Seoul zone to UTC (KST = UTC+9, no DST)', () => {
    // RESEARCH.md L671 primary vector.
    expect(parseDate('2026-04-14T23:50:00', 'Asia/Seoul')).toBe(
      '2026-04-14T14:50:00.000Z',
    );
  });

  it('converts America/Los_Angeles to UTC during DST (April = PDT, UTC-7)', () => {
    expect(parseDate('2026-04-14T12:00:00', 'America/Los_Angeles')).toBe(
      '2026-04-14T19:00:00.000Z',
    );
  });

  it('converts America/Los_Angeles to UTC outside DST (January = PST, UTC-8)', () => {
    expect(parseDate('2026-01-15T12:00:00', 'America/Los_Angeles')).toBe(
      '2026-01-15T20:00:00.000Z',
    );
  });

  it('passes through UTC input unchanged (round-trip)', () => {
    expect(parseDate('2026-06-01T00:00:00', 'UTC')).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('returns a valid ISO-8601 string ending with Z', () => {
    const out = parseDate('2026-06-01T00:00:00', 'UTC');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('decodeCharsetAwareFetch', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns UTF-8 string for a UTF-8 response (passthrough)', async () => {
    const html = '<html><body><h1>뉴스레터</h1></body></html>';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;
    const r = await decodeCharsetAwareFetch('https://example.com/a');
    expect(r.html).toContain('뉴스레터');
    expect(r.status).toBe(200);
  });

  it('decodes CP949 bytes when charset=euc-kr', async () => {
    const buf = await readFile(
      new URL('../fixtures/korean-cp949.html', import.meta.url),
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=euc-kr' },
      }),
    ) as typeof fetch;
    const r = await decodeCharsetAwareFetch('https://example.com/a');
    expect(r.html).toContain('한국어');
  });

  it('uses <meta charset> when Content-Type lacks charset', async () => {
    const buf = await readFile(
      new URL('../fixtures/korean-cp949.html', import.meta.url),
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(buf, {
        status: 200,
        headers: { 'content-type': 'text/html' }, // no charset
      }),
    ) as typeof fetch;
    const r = await decodeCharsetAwareFetch('https://example.com/a');
    expect(r.html).toContain('한국어');
  });

  it('throws with {url}: HTTP {status} shape on non-OK', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 503 })) as typeof fetch;
    await expect(
      decodeCharsetAwareFetch('https://example.com/missing'),
    ).rejects.toThrow(/HTML fetch https:\/\/example\.com\/missing: HTTP 503/);
  });

  it('returns status and finalUrl from the response (redirect follow honored)', async () => {
    const html = '<html><body><p>ok</p></body></html>';
    globalThis.fetch = vi.fn().mockResolvedValue(
      Object.defineProperty(
        new Response(Buffer.from(html, 'utf8'), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
        'url',
        { value: 'https://example.com/final', configurable: true },
      ),
    ) as typeof fetch;
    const r = await decodeCharsetAwareFetch('https://example.com/start');
    expect(r.status).toBe(200);
    expect(r.finalUrl).toBe('https://example.com/final');
  });
});

describe('extractBody', () => {
  it('extracts body text from generic <article> selector (chain first match)', async () => {
    const html = await fs.readFile(
      new URL('../fixtures/article-generic.html', import.meta.url),
      'utf8',
    );
    const body = extractBody(html);
    expect(body.length).toBeGreaterThan(120);
    expect(body).toContain('main body text');
    expect(body).not.toContain('<'); // no html tags leaked
  });

  it('per-firm override beats generic chain', async () => {
    const html = await fs.readFile(
      new URL('../fixtures/article-override.html', import.meta.url),
      'utf8',
    );
    const body = extractBody(html, '.custom-body');
    expect(body).toMatch(/^override body/);
  });

  it('strips script/style/nav/aside/footer/ad/share/related widgets', () => {
    const html = `<html><body><article>good signal text is here and it is more than 120 chars long to pass the gate yes very long signal text continues and continues and we need more than one hundred and twenty characters.
      <script>bad()</script>
      <nav>bad nav</nav>
      <footer>bad footer</footer>
      <aside>bad aside</aside>
      <div class="ad">bad ad</div>
      <div class="social-share">bad share</div>
      <div class="related-posts">bad related</div>
    </article></body></html>`;
    const body = extractBody(html);
    expect(body).toContain('good signal');
    expect(body).not.toContain('bad()');
    expect(body).not.toContain('bad nav');
    expect(body).not.toContain('bad footer');
    expect(body).not.toContain('bad aside');
    expect(body).not.toContain('bad ad');
    expect(body).not.toContain('bad share');
    expect(body).not.toContain('bad related');
  });

  it('falls back to largest <p>-cluster parent when no semantic wrapper matches', async () => {
    const html = await fs.readFile(
      new URL('../fixtures/article-fallback.html', import.meta.url),
      'utf8',
    );
    const body = extractBody(html);
    expect(body).toContain('p-cluster target');
    expect(body).not.toContain('lone paragraph');
  });

  it('caps body at 10_000 chars', () => {
    const huge = 'x'.repeat(20_000);
    const html = `<html><body><article>${huge}</article></body></html>`;
    const body = extractBody(html);
    expect(body.length).toBe(10_000);
  });

  it('normalizes U+00A0 to ASCII space (Pitfall 4)', () => {
    const html =
      '<html><body><article>foo\u00a0bar' +
      'x'.repeat(200) +
      '</article></body></html>';
    const body = extractBody(html);
    expect(body.startsWith('foo bar')).toBe(true);
    expect(body).not.toMatch(/\u00a0/);
  });
});

// --------------------------------------------------------------------------
// Phase 4 — shared HTML-string → RawItem[] extractor tests (plan 04-02)
// --------------------------------------------------------------------------

describe('parseListItemsFromHtml (Phase 4 shared extractor)', () => {
  it('extracts plain-href items using selectors.link', async () => {
    const html = await readFile(
      new URL('../fixtures/shin-kim.list.html', import.meta.url),
      'utf8',
    );
    const firm: FirmConfig = {
      id: 'shin-kim',
      name: '세종',
      language: 'ko',
      type: 'html',
      url: 'https://www.shinkim.com/kor/media/newsletter',
      timezone: 'Asia/Seoul',
      enabled: true,
      selectors: {
        list_item: '.post-prime',
        title: 'a.text',
        link: 'a.text',
        date: '.foot-item.posted',
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].firmId).toBe('shin-kim');
    expect(items[0].title).toBeTruthy();
    expect(items[0].url).toMatch(/^https:\/\//);
    expect(items[0].language).toBe('ko');
    expect(items[0].description).toBeUndefined();
  });

  it('extracts onclick-reconstructed URLs using link_onclick_regex + link_template', async () => {
    const html = await readFile(
      new URL('../fixtures/bkl.list.html', import.meta.url),
      'utf8',
    );
    const firm: FirmConfig = {
      id: 'bkl',
      name: '태평양',
      language: 'ko',
      type: 'html',
      url: 'https://www.bkl.co.kr/law/insight/informationList.do?lang=ko',
      timezone: 'Asia/Seoul',
      enabled: true,
      selectors: {
        list_item: 'ul li.info-item',
        title: '.info-title',
        link_onclick_regex: "goView\\('(\\d+)'\\)",
        link_template: '/law/insight/informationView.do?infoNo={1}&lang=ko',
        date: '.info-date',
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.url).toContain('/law/insight/informationView.do?infoNo=');
      expect(it.url).toContain('lang=ko');
    }
  });

  it('returns [] when no list_item matches (empty list page)', () => {
    const html = '<html><body><p>no matching elements</p></body></html>';
    const firm: FirmConfig = {
      id: 'empty-test',
      name: 'Empty',
      language: 'en',
      type: 'html',
      url: 'https://example.com',
      timezone: 'America/New_York',
      enabled: true,
      selectors: { list_item: 'ul#does-not-exist > li', title: '.t', link: 'a' },
    };
    expect(parseListItemsFromHtml(html, firm)).toEqual([]);
  });

  it('returns [] when firm has no selectors block (defense-in-depth)', () => {
    const firm: FirmConfig = {
      id: 'no-selectors',
      name: 'No',
      language: 'en',
      type: 'html',
      url: 'https://example.com',
      timezone: 'America/New_York',
      enabled: true,
    };
    expect(parseListItemsFromHtml('<html></html>', firm)).toEqual([]);
  });
});

describe('normalizeDateString (Phase 4 exported)', () => {
  it('parses YYYY.MM.DD (shin-kim format)', () => {
    expect(normalizeDateString('2026.04.17')).toBe('2026-04-17T00:00:00');
  });
  it('parses YYYY. MM. DD. (yulchon format)', () => {
    expect(normalizeDateString('2026. 04. 17.')).toBe('2026-04-17T00:00:00');
  });
  it('falls back to native Date.parse for English forms', () => {
    const r = normalizeDateString('April 17, 2026');
    expect(r).toMatch(/^2026-04-17T/);
  });
  it('returns null for unparseable input', () => {
    expect(normalizeDateString('banana')).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Phase 4.1 — unified extractLinkUrl (3 modes: object, string, legacy onclick)
// --------------------------------------------------------------------------

describe('parseListItemsFromHtml link extraction (Phase 4.1 unified extractor)', () => {
  const baseFirm: FirmConfig = {
    id: 'test-firm',
    name: 'Test Firm',
    language: 'ko',
    type: 'html',
    url: 'https://example.com',
    timezone: 'Asia/Seoul',
    enabled: true,
    timeout_ms: 20_000,
    include_keywords: [],
    exclude_keywords: [],
  };

  it('Mode 2 (string link): plain CSS selector → take href as-is — backward compat', () => {
    const html = `
      <ul><li class="item">
        <a class="ttl" href="/post/123">Article 123</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      selectors: { list_item: '.item', title: '.ttl', link: 'a' },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Article 123');
    expect(items[0].url).toBe('https://example.com/post/123');
  });

  it('Mode 3 (legacy onclick): link_onclick_regex + link_template — backward compat', () => {
    const html = `
      <ul><li class="item">
        <a class="ttl" href="#" onclick="goView('456')">News 456</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link_onclick_regex: "goView\\('(\\d+)'\\)",
        link_template: '/news/view/{1}',
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://example.com/news/view/456');
  });

  it('Mode 1 (object link, attribute=href + regex + template): yoon-yang pattern', () => {
    const html = `
      <ul id="contentsList"><li>
        <span class="title">화우 뉴스레터 12345</span>
        <a href="javascript:doView(12345)">제목</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      url: 'https://www.yoonyang.com',
      selectors: {
        list_item: 'ul#contentsList > li',
        title: '.title',
        link: {
          selector: 'a',
          // attribute defaults to 'href'
          regex: 'doView\\((\\d+)\\)',
          template: '/kor/insights/newsletters/view?id={1}',
        },
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe(
      'https://yoonyang.com/kor/insights/newsletters/view?id=12345',
    );
  });

  it('Mode 1 (object link, attribute=onclick): subsumes legacy onclick mode', () => {
    const html = `
      <ul><li class="item">
        <span class="ttl">Onclick via object</span>
        <a href="#" onclick="goDetail(789)">제목</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: {
          selector: 'a',
          attribute: 'onclick',
          regex: 'goDetail\\((\\d+)\\)',
          template: '/article/{1}',
        },
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://example.com/article/789');
  });

  it('Mode 1 (object link, attribute=data-id, no regex): plain attribute extraction', () => {
    const html = `
      <ul><li class="item">
        <span class="ttl">Data-attribute style</span>
        <a data-id="/news/abc-123">제목</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: { selector: 'a', attribute: 'data-id' },
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://example.com/news/abc-123');
  });

  it('Mode 1: regex with no match → item silently skipped (per-item isolation)', () => {
    const html = `
      <ul><li class="item">
        <span class="ttl">Bad pattern</span>
        <a href="javascript:somethingElse()">제목</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: {
          selector: 'a',
          regex: 'doView\\((\\d+)\\)',
          template: '/{1}',
        },
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(0);
  });

  it('Mode 1: missing attribute → item silently skipped', () => {
    const html = `
      <ul><li class="item">
        <span class="ttl">No attr</span>
        <a>No href</a>
      </li></ul>`;
    const firm: FirmConfig = {
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: { selector: 'a' },
      },
    };
    const items = parseListItemsFromHtml(html, firm);
    expect(items).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// Phase 11-01 — restoreFetchHost (URL www-restoration for detail fetches)
// --------------------------------------------------------------------------

describe('restoreFetchHost', () => {
  it('restores www when firm URL has www and item URL was stripped (kim-chang pattern)', () => {
    // canonicalizeUrl strips www from the item URL; but firm.url has www.
    // restoreFetchHost must restore www on the fetch URL so TLS works.
    expect(
      restoreFetchHost(
        'https://kimchang.com/ko/insights/detail.kc?sch_section=1&idx=2',
        'https://www.kimchang.com/ko/newsletter.kc',
      ),
    ).toBe('https://www.kimchang.com/ko/insights/detail.kc?sch_section=1&idx=2');
  });

  it('pass-through when both item and firm already have www', () => {
    expect(
      restoreFetchHost(
        'https://www.firm.com/page',
        'https://www.firm.com/list',
      ),
    ).toBe('https://www.firm.com/page');
  });

  it('pass-through when neither item nor firm has www', () => {
    expect(
      restoreFetchHost(
        'https://firm.com/page',
        'https://firm.com/list',
      ),
    ).toBe('https://firm.com/page');
  });

  it('pass-through when firm and item are on different domains (no mutation)', () => {
    expect(
      restoreFetchHost(
        'https://www.a.com/page',
        'https://www.b.com/list',
      ),
    ).toBe('https://www.a.com/page');
  });

  it('restores www for bkl pattern (apex-redirect root cause)', () => {
    // bkl.co.kr apex redirects to homepage; www.bkl.co.kr serves the article.
    expect(
      restoreFetchHost(
        'https://bkl.co.kr/law/insight/informationView.do?infoNo=6542&lang=ko',
        'https://www.bkl.co.kr/law/insight/informationList.do?lang=ko',
      ),
    ).toBe(
      'https://www.bkl.co.kr/law/insight/informationView.do?infoNo=6542&lang=ko',
    );
  });
});
