// Offline vitest coverage for src/scrapers/html.ts.
//
// Deterministic by design — globalThis.fetch is mocked in each test so no
// network I/O occurs. Three firm fixtures exercise all three code paths:
//   - shin-kim.list.html:  plain-href, YYYY.MM.DD dates, 3 items
//   - yulchon.list.html:   plain-href, "YYYY. MM. DD." dates with spaces, 2 items
//   - bkl.list.html:       onclick-extract, 3 rows where row 2 is malformed
//
// Contract locked:
//   1. Output shape identical to scrapeRss (firmId, title, url, publishedAt,
//      language, description: undefined).
//   2. URLs canonicalized — utm_source stripped, path-absolute resolved.
//   3. Onclick regex + template reconstruction + Pitfall 5 origin-anchor.
//   4. Error shape `scrapeHtml {firm.id}: HTTP {status}` on non-OK fetch.
//   5. Per-item isolation: one bad row does NOT tank the firm.
//   6. Missing selectors → throws with locked message.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { scrapeHtml } from '../../src/scrapers/html.js';
import type { FirmConfig } from '../../src/types.js';

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
    date: '.foot-item.posted',
  },
  include_keywords: [],
  exclude_keywords: [],
};

const yulchon: FirmConfig = {
  id: 'yulchon',
  name: '율촌',
  language: 'ko',
  type: 'html',
  url: 'https://www.yulchon.com/ko/resources/publications/newsletter.do',
  timezone: 'Asia/Seoul',
  enabled: true,
  timeout_ms: 20000,
  selectors: {
    list_item: 'ul.list_type_post > li',
    title: 'p.title',
    link: 'a.post_link',
    date: 'p.date',
  },
  include_keywords: [],
  exclude_keywords: [],
};

const bkl: FirmConfig = {
  id: 'bkl',
  name: '태평양',
  language: 'ko',
  type: 'html',
  url: 'https://www.bkl.co.kr/law/insight/informationList.do?lang=ko',
  timezone: 'Asia/Seoul',
  enabled: true,
  timeout_ms: 20000,
  selectors: {
    list_item: 'ul li.info-item',
    title: '.info-title',
    link_onclick_regex: "goView\\('(\\d+)'\\)",
    link_template: '/law/insight/informationView.do?infoNo={1}&lang=ko',
    date: '.info-date',
  },
  include_keywords: [],
  exclude_keywords: [],
};

describe('scrapeHtml', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses plain-href fixture into 3 canonical RawItems (shin-kim)', async () => {
    const html = await readFile(
      new URL('../fixtures/shin-kim.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;

    const items = await scrapeHtml(shinKim);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      firmId: 'shin-kim',
      language: 'ko',
      description: undefined,
    });
    expect(items[0].url).toBe(
      'https://shinkim.com/kor/media/newsletter/3235',
    );
    expect(items[1].url).toBe(
      'https://shinkim.com/kor/media/newsletter/3230',
    );
    expect(items[1].url).not.toContain('utm_source');
  });

  it('parses YYYY.MM.DD dates via parseDate to UTC ISO (shin-kim KST)', async () => {
    const html = await readFile(
      new URL('../fixtures/shin-kim.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;

    const items = await scrapeHtml(shinKim);
    // 2026-04-15T00:00:00 KST → 2026-04-14T15:00:00.000Z (KST = UTC+9)
    expect(items[0].publishedAt).toBe('2026-04-14T15:00:00.000Z');
  });

  it('parses "YYYY. MM. DD." spaced dates (yulchon)', async () => {
    const html = await readFile(
      new URL('../fixtures/yulchon.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;

    const items = await scrapeHtml(yulchon);
    expect(items).toHaveLength(2);
    // "2026. 05. 10." KST → 2026-05-09T15:00:00.000Z (KST = UTC+9)
    expect(items[0].publishedAt).toBe('2026-05-09T15:00:00.000Z');
  });

  it('extracts URLs from onclick via regex + template (bkl)', async () => {
    const html = await readFile(
      new URL('../fixtures/bkl.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;

    const items = await scrapeHtml(bkl);
    // Row 2 ("not-a-goView-match") is silently skipped → 2 items, not 3.
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe(
      'https://bkl.co.kr/law/insight/informationView.do?infoNo=12345&lang=ko',
    );
    expect(items[1].url).toBe(
      'https://bkl.co.kr/law/insight/informationView.do?infoNo=67890&lang=ko',
    );
  });

  it('onclick template resolves against firm origin, not list-page path (Pitfall 5)', async () => {
    const html = await readFile(
      new URL('../fixtures/bkl.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;

    const items = await scrapeHtml(bkl);
    items.forEach((i) => {
      expect(i.url).toMatch(
        /^https:\/\/bkl\.co\.kr\/law\/insight\/informationView\.do/,
      );
      expect(i.url).not.toContain('informationList.do');
    });
  });

  it('throws with locked shape scrapeHtml {id}: HTTP {status} on non-OK', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 503 })) as typeof fetch;
    await expect(scrapeHtml(shinKim)).rejects.toThrow(
      /scrapeHtml shin-kim: HTTP 503/,
    );
  });

  it('throws "html tier requires selectors" when selectors is undefined', async () => {
    const broken: FirmConfig = { ...shinKim, selectors: undefined };
    await expect(scrapeHtml(broken)).rejects.toThrow(
      /html tier requires selectors/,
    );
  });

  it('silently skips rows whose onclick does not match the regex (per-item isolation)', async () => {
    const html = await readFile(
      new URL('../fixtures/bkl.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;
    await expect(scrapeHtml(bkl)).resolves.toBeDefined();
  });

  it('every returned RawItem has description: undefined (plan 04 owns body)', async () => {
    const html = await readFile(
      new URL('../fixtures/shin-kim.list.html', import.meta.url),
      'utf8',
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(Buffer.from(html, 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as typeof fetch;
    const items = await scrapeHtml(shinKim);
    for (const i of items) {
      expect(i.description).toBeUndefined();
    }
  });
});
