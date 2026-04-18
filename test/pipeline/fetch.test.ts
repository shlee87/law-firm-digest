// TDD coverage for src/pipeline/fetch.ts Phase 2 orchestrator changes.
//
// Mocks scrapeRss + scrapeHtml + fetchRobots so no network traffic occurs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/scrapers/rss.js', () => ({
  scrapeRss: vi.fn(),
}));
vi.mock('../../src/scrapers/html.js', () => ({
  scrapeHtml: vi.fn(),
}));
vi.mock('../../src/scrapers/robots.js', () => ({
  fetchRobots: vi.fn(async () => [] as string[]),
  isAllowed: vi.fn(() => true),
}));

import { fetchAll } from '../../src/pipeline/fetch.js';
import { scrapeRss } from '../../src/scrapers/rss.js';
import { scrapeHtml } from '../../src/scrapers/html.js';
import { isAllowed, fetchRobots } from '../../src/scrapers/robots.js';
import type { FirmConfig } from '../../src/types.js';

const rssFirm: FirmConfig = {
  id: 'rss-firm',
  name: 'RSS Firm',
  language: 'en',
  type: 'rss',
  url: 'https://rssexample.com/feed',
  timezone: 'UTC',
  enabled: true,
  timeout_ms: 20000,
  include_keywords: [],
  exclude_keywords: [],
};

const htmlFirm: FirmConfig = {
  id: 'html-firm',
  name: 'HTML Firm',
  language: 'ko',
  type: 'html',
  url: 'https://htmlexample.com/news',
  timezone: 'Asia/Seoul',
  enabled: true,
  timeout_ms: 20000,
  selectors: { list_item: 'li', title: '.t', link: 'a' },
  include_keywords: [],
  exclude_keywords: [],
};

const jsFirm: FirmConfig = {
  ...htmlFirm,
  id: 'js-firm',
  type: 'js-render',
};

describe('fetchAll (Phase 2 orchestrator)', () => {
  beforeEach(() => {
    vi.mocked(scrapeRss).mockReset();
    vi.mocked(scrapeHtml).mockReset();
    vi.mocked(fetchRobots)
      .mockReset()
      .mockImplementation(async () => [] as string[]);
    vi.mocked(isAllowed)
      .mockReset()
      .mockImplementation(() => true);
  });
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('(1) RSS tier — scrapeRss invoked, scrapeHtml not', async () => {
    vi.mocked(scrapeRss).mockResolvedValue([
      {
        firmId: 'rss-firm',
        title: 't',
        url: 'https://x/1',
        language: 'en',
      },
    ]);
    const out = await fetchAll([rssFirm]);
    expect(vi.mocked(scrapeRss)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scrapeHtml)).not.toHaveBeenCalled();
    expect(out[0].raw).toHaveLength(1);
    expect(out[0].error).toBeUndefined();
  });

  it('(2) HTML tier — scrapeHtml invoked, scrapeRss not', async () => {
    vi.mocked(scrapeHtml).mockResolvedValue([
      {
        firmId: 'html-firm',
        title: 't',
        url: 'https://x/1',
        language: 'ko',
      },
    ]);
    const out = await fetchAll([htmlFirm]);
    expect(vi.mocked(scrapeHtml)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scrapeRss)).not.toHaveBeenCalled();
    expect(out[0].raw).toHaveLength(1);
  });

  it('(3) js-render tier throws Phase 4 territory → caught into error result', async () => {
    const out = await fetchAll([jsFirm]);
    expect(vi.mocked(scrapeRss)).not.toHaveBeenCalled();
    expect(vi.mocked(scrapeHtml)).not.toHaveBeenCalled();
    expect(out[0].raw).toEqual([]);
    expect(out[0].error).toBeDefined();
    expect(out[0].error!.message).toContain('Phase 4 territory');
  });

  it('(4) robots-blocked — no scraper invoked, error contains "robots.txt disallows"', async () => {
    vi.mocked(isAllowed).mockReturnValue(false);
    const out = await fetchAll([rssFirm]);
    expect(vi.mocked(scrapeRss)).not.toHaveBeenCalled();
    expect(out[0].error!.message).toContain('robots.txt disallows');
  });

  it('(5) one firm throws inside try → siblings still succeed', async () => {
    vi.mocked(scrapeRss).mockResolvedValueOnce([
      {
        firmId: 'rss-firm',
        title: 't',
        url: 'https://x/1',
        language: 'en',
      },
    ]);
    vi.mocked(scrapeHtml).mockRejectedValueOnce(
      new Error('scrapeHtml html-firm: HTTP 503'),
    );
    const out = await fetchAll([rssFirm, htmlFirm]);
    expect(out).toHaveLength(2);
    expect(out[0].error).toBeUndefined();
    expect(out[0].raw).toHaveLength(1);
    expect(out[1].error).toBeDefined();
    expect(out[1].error!.message).toContain('HTTP 503');
  });

  it('(6) malformed URL inside try is caught per-firm and synthesized as error', async () => {
    const malformed: FirmConfig = {
      ...rssFirm,
      id: 'malformed',
      url: 'not a valid url',
    };
    vi.mocked(scrapeRss).mockResolvedValue([
      {
        firmId: 'rss-firm',
        title: 't',
        url: 'https://x/1',
        language: 'en',
      },
    ]);
    const out = await fetchAll([malformed, rssFirm]);
    expect(out).toHaveLength(2);
    expect(out[0].error).toBeDefined();
    expect(out[1].error).toBeUndefined();
  });

  it('(7) all firms fail — output length equals input length, all errored', async () => {
    vi.mocked(scrapeRss).mockRejectedValue(new Error('RSS fetch: HTTP 500'));
    vi.mocked(scrapeHtml).mockRejectedValue(
      new Error('scrapeHtml: HTTP 500'),
    );
    const out = await fetchAll([rssFirm, htmlFirm, jsFirm]);
    expect(out).toHaveLength(3);
    for (const r of out) {
      expect(r.error).toBeDefined();
    }
  });

  it('(8) output length === input length (shape invariant)', async () => {
    vi.mocked(scrapeRss).mockResolvedValue([]);
    vi.mocked(scrapeHtml).mockResolvedValue([]);
    const firms = [rssFirm, htmlFirm, jsFirm, rssFirm, htmlFirm];
    const out = await fetchAll(firms);
    expect(out).toHaveLength(firms.length);
  });

  it('(9) output order preserves input order (index alignment)', async () => {
    vi.mocked(scrapeRss).mockResolvedValue([
      {
        firmId: 'rss-firm',
        title: 'rss-hit',
        url: 'https://x/r',
        language: 'en',
      },
    ]);
    vi.mocked(scrapeHtml).mockResolvedValue([
      {
        firmId: 'html-firm',
        title: 'html-hit',
        url: 'https://x/h',
        language: 'ko',
      },
    ]);
    const firms = [rssFirm, htmlFirm, rssFirm, htmlFirm];
    const out = await fetchAll(firms);
    expect(out[0].firm.id).toBe('rss-firm');
    expect(out[1].firm.id).toBe('html-firm');
    expect(out[2].firm.id).toBe('rss-firm');
    expect(out[3].firm.id).toBe('html-firm');
  });

  it('(10) scrubSecrets redacts GEMINI_API_KEY in error message', async () => {
    process.env.GEMINI_API_KEY = 'AIza_FAKE_KEY_LONG_ENOUGH';
    vi.mocked(scrapeRss).mockRejectedValue(
      new Error('failed at AIza_FAKE_KEY_LONG_ENOUGH position'),
    );
    const out = await fetchAll([rssFirm]);
    expect(out[0].error!.message).toContain('***REDACTED***');
    expect(out[0].error!.message).not.toContain('AIza_FAKE_KEY_LONG_ENOUGH');
  });
});
