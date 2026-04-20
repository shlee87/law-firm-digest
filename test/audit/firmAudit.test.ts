// Integration tests for src/audit/firmAudit.ts
//
// Per RESEARCH.md A2 L937: NO live audit snapshot — synthetic fixtures + mocked
// scrapers. The writer's snapshot test (Plan 03 Task 2) covers markdown shape;
// these tests cover orchestrator wiring + branching.
//
// Per CONTEXT.md D-04: tests use fabricated firms, not real config — keeps tests
// deterministic and isolated from firms.yaml drift.
//
// Per Pitfall 5 L673-677: Test 9 (defense-in-depth allSettled rejected branch)
// is the regression test for "audit silently green when one firm catastrophically
// throws".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/loader.js', () => ({
  loadFirms: vi.fn(),
}));
vi.mock('../../src/scrapers/rss.js', () => ({ scrapeRss: vi.fn() }));
vi.mock('../../src/scrapers/html.js', () => ({ scrapeHtml: vi.fn() }));
vi.mock('../../src/scrapers/jsRender.js', () => ({ scrapeJsRender: vi.fn() }));
vi.mock('../../src/scrapers/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/scrapers/util.js')>();
  return {
    ...actual,
    decodeCharsetAwareFetch: vi.fn(),
    // keep extractBody real (pure)
  };
});
vi.mock('../../src/scrapers/robots.js', () => ({
  fetchRobots: vi.fn(async () => [] as string[]),
  isAllowed: vi.fn(() => true),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(async () => {}) };
});
vi.mock('playwright', () => {
  const newPage = vi.fn(async () => ({
    goto: vi.fn(async () => {}),
    content: vi.fn(async () => '<html><body><p>stub content for testing purposes that is long enough</p></body></html>'),
    close: vi.fn(async () => {}),
  }));
  const newContext = vi.fn(async () => ({
    newPage,
    close: vi.fn(async () => {}),
  }));
  return {
    chromium: {
      launch: vi.fn(async () => ({
        newContext,
        close: vi.fn(async () => {}),
      })),
    },
  };
});

// Import AFTER mocks so the SUT picks up the mocks.
import { runAudit, AUDIT_OUTPUT_PATH } from '../../src/audit/firmAudit.js';
import { loadFirms } from '../../src/config/loader.js';
import { scrapeRss } from '../../src/scrapers/rss.js';
import { scrapeHtml } from '../../src/scrapers/html.js';
import { scrapeJsRender } from '../../src/scrapers/jsRender.js';
import { decodeCharsetAwareFetch } from '../../src/scrapers/util.js';
import { fetchRobots, isAllowed } from '../../src/scrapers/robots.js';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { FirmConfig } from '../../src/types.js';

// Fixture firm builders (mirror test/pipeline/fetch.test.ts:29-60).
const rssFirm: FirmConfig = {
  id: 'rss-firm',
  name: 'RSS Firm',
  language: 'en',
  type: 'rss',
  url: 'https://example.com/feed',
  timezone: 'UTC',
  enabled: true,
};

const htmlFirm: FirmConfig = {
  id: 'html-firm',
  name: 'HTML Firm',
  language: 'en',
  type: 'html',
  url: 'https://example.com/list',
  timezone: 'UTC',
  enabled: true,
  selectors: { list_item: 'li', title: 'a', link: 'a', date: '.d' },
};

const jsFirm: FirmConfig = {
  id: 'js-firm',
  name: 'JS Firm',
  language: 'en',
  type: 'js-render',
  url: 'https://example.com/js-list',
  wait_for: '.item',
  timezone: 'UTC',
  enabled: true,
  selectors: { list_item: '.item', title: '.t', link: 'a', date: '.d' },
};

const mockItem = (url: string, title: string) => ({
  firmId: 'html-firm',
  title,
  url,
  language: 'en' as const,
});

describe('runAudit orchestrator — integration tests', () => {
  beforeEach(() => {
    vi.mocked(loadFirms).mockReset();
    vi.mocked(scrapeRss).mockReset();
    vi.mocked(scrapeHtml).mockReset();
    vi.mocked(scrapeJsRender).mockReset();
    vi.mocked(decodeCharsetAwareFetch).mockReset();
    vi.mocked(fetchRobots).mockReset().mockResolvedValue([] as string[]);
    vi.mocked(isAllowed).mockReset().mockReturnValue(true);
    vi.mocked(writeFile as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.GITHUB_SHA;
  });

  it('(1) per-firm isolation: firm B throws → 3 rows, B=list-fail, A and C normal', async () => {
    const firmA: FirmConfig = { ...htmlFirm, id: 'firm-a', url: 'https://a.example.com/list' };
    const firmB: FirmConfig = { ...htmlFirm, id: 'firm-b', url: 'https://b.example.com/list' };
    const firmC: FirmConfig = { ...htmlFirm, id: 'firm-c', url: 'https://c.example.com/list' };

    vi.mocked(loadFirms).mockResolvedValue([firmA, firmB, firmC]);
    // A and C: return 2 items each (detail check will be skipped because decodeCharsetAwareFetch is not set up)
    vi.mocked(scrapeHtml)
      .mockResolvedValueOnce([
        mockItem('https://a.example.com/item1', 'Title A1'),
        mockItem('https://a.example.com/item2', 'Title A2'),
      ])
      .mockRejectedValueOnce(new Error('firm-b-scraped-throw'))
      .mockResolvedValueOnce([
        mockItem('https://c.example.com/item1', 'Title C1'),
        mockItem('https://c.example.com/item2', 'Title C2'),
      ]);
    // For firms A and C, detail fetch also throws (→ detail-quality-unknown is OK too)
    vi.mocked(decodeCharsetAwareFetch).mockRejectedValue(new Error('detail-fail'));

    const report = await runAudit({});

    expect(report.rows).toHaveLength(3);
    expect(report.rows[1].status).toBe('list-fail');
    expect(report.rows[1].firmId).toBe('firm-b');
    // scrubSecrets keeps the message (no secrets in it)
    expect(report.rows[1].evidence).toMatch(/firm-b-scraped-throw/);
    // firms A and C should have a non-list-fail status
    expect(report.rows[0].status).not.toBe('list-fail');
    expect(report.rows[2].status).not.toBe('list-fail');
  });

  it('(2) HTML detail-identical: scrapeHtml OK, decodeCharsetAwareFetch returns identical body', async () => {
    vi.mocked(loadFirms).mockResolvedValue([htmlFirm]);
    vi.mocked(scrapeHtml).mockResolvedValue([
      mockItem('https://example.com/item1', 'Article One'),
      mockItem('https://example.com/item2', 'Article Two'),
      mockItem('https://example.com/item3', 'Article Three'),
      mockItem('https://example.com/item4', 'Article Four'),
      mockItem('https://example.com/item5', 'Article Five'),
    ]);
    // Identical body for both detail fetches — length > 100 so not detail-empty
    const identicalBody = '<html><body><article>' + 'x'.repeat(300) + '</article></body></html>';
    vi.mocked(decodeCharsetAwareFetch).mockResolvedValue({
      html: identicalBody,
      status: 200,
      finalUrl: 'https://example.com/item1',
    });

    const report = await runAudit({});

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].status).toBe('detail-identical');
    expect(report.rows[0].remediation).toBe('enable-js-render-detail');
    expect(report.rows[0].targetPhase).toBe('Phase 7');
    expect(report.rows[0].items).toBe(5);
  });

  it('(3) HTML OK distinct bodies: two distinct ≥200-char bodies → status OK', async () => {
    vi.mocked(loadFirms).mockResolvedValue([htmlFirm]);
    vi.mocked(scrapeHtml).mockResolvedValue([
      mockItem('https://example.com/item1', 'Contract Law Amendment 계약법 개정안'),
      mockItem('https://example.com/item2', 'Patent System Update 특허제도 개편'),
    ]);

    // Distinct bodies — different content, each > 200 chars
    const bodyA = '<html><body><article>' + 'Contract law reform analysis with detailed legal implications and case precedents covering various aspects of commercial contracts in Korean jurisdiction '.repeat(3) + '</article></body></html>';
    const bodyB = '<html><body><article>' + 'Patent system overhaul represents significant changes to intellectual property protection mechanisms in the Republic of Korea affecting technology companies '.repeat(3) + '</article></body></html>';
    vi.mocked(decodeCharsetAwareFetch)
      .mockResolvedValueOnce({ html: bodyA, status: 200, finalUrl: 'https://example.com/item1' })
      .mockResolvedValueOnce({ html: bodyB, status: 200, finalUrl: 'https://example.com/item2' });

    const report = await runAudit({});

    expect(report.rows[0].status).toBe('OK');
    expect(report.rows[0].remediation).toBeNull();
  });

  it('(4) HTML detail-quality-unknown: both decodeCharsetAwareFetch throw', async () => {
    vi.mocked(loadFirms).mockResolvedValue([htmlFirm]);
    vi.mocked(scrapeHtml).mockResolvedValue([
      mockItem('https://example.com/item1', 'Title One'),
      mockItem('https://example.com/item2', 'Title Two'),
    ]);
    vi.mocked(decodeCharsetAwareFetch).mockRejectedValue(new Error('detail-fetch-fail'));

    const report = await runAudit({});

    expect(report.rows[0].status).toBe('detail-quality-unknown');
    expect(report.rows[0].remediation).toBe('monitor');
  });

  it('(5) RSS list-only: decodeCharsetAwareFetch NOT called even with 5 items', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([
      { firmId: 'rss-firm', title: 'Item 1', url: 'https://example.com/1', language: 'en' },
      { firmId: 'rss-firm', title: 'Item 2', url: 'https://example.com/2', language: 'en' },
      { firmId: 'rss-firm', title: 'Item 3', url: 'https://example.com/3', language: 'en' },
      { firmId: 'rss-firm', title: 'Item 4', url: 'https://example.com/4', language: 'en' },
      { firmId: 'rss-firm', title: 'Item 5', url: 'https://example.com/5', language: 'en' },
    ]);

    const report = await runAudit({});

    expect(vi.mocked(decodeCharsetAwareFetch)).not.toHaveBeenCalled();
    expect(report.rows[0].status).toBe('OK');
    expect(report.rows[0].items).toBe(5);
  });

  it('(6) RSS selector-empty: scrapeRss returns [] → selector-empty', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);

    const report = await runAudit({});

    expect(report.rows[0].status).toBe('selector-empty');
    expect(report.rows[0].items).toBe(0);
  });

  it('(7) RSS list-fail: scrapeRss throws → list-fail, evidence is scrubbed', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockRejectedValue(new Error('network error 503'));

    const report = await runAudit({});

    expect(report.rows[0].status).toBe('list-fail');
    expect(report.rows[0].evidence).toMatch(/network error 503/);
  });

  it('(8) robots disallow: fetchRobots+isAllowed blocks firm → list-fail with robots.txt evidence', async () => {
    vi.mocked(loadFirms).mockResolvedValue([htmlFirm]);
    vi.mocked(fetchRobots).mockResolvedValueOnce(['/list']);
    vi.mocked(isAllowed).mockReturnValueOnce(false);

    const report = await runAudit({});

    expect(report.rows[0].status).toBe('list-fail');
    expect(report.rows[0].evidence).toContain('robots.txt disallows');
    expect(report.rows[0].evidence).toContain(htmlFirm.url);
  });

  it('(9) defense-in-depth: non-Error reject reason synthesizes list-fail row', async () => {
    vi.mocked(loadFirms).mockResolvedValue([htmlFirm]);
    // pLimit wraps in a promise that should handle rejection from any source
    vi.mocked(scrapeHtml).mockRejectedValue('string-reason-not-error');

    const report = await runAudit({});

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].status).toBe('list-fail');
    // The firm still has a row despite the catastrophic non-Error throw
    expect(report.rows[0].firmId).toBe('html-firm');
  });

  it('(10a) chromium does NOT launch when no js-render firms', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);

    await runAudit({});

    expect(vi.mocked(chromium.launch)).not.toHaveBeenCalled();
  });

  it('(10b) chromium launches exactly once for js-render firm and closes after', async () => {
    vi.mocked(loadFirms).mockResolvedValue([jsFirm]);
    vi.mocked(scrapeJsRender).mockResolvedValue([
      { firmId: 'js-firm', title: 'JS Item 1', url: 'https://example.com/js-list/1', language: 'en' },
      { firmId: 'js-firm', title: 'JS Item 2', url: 'https://example.com/js-list/2', language: 'en' },
    ]);

    const report = await runAudit({});

    expect(vi.mocked(chromium.launch)).toHaveBeenCalledTimes(1);
    // browser.close() should have been called after the fan-out
    const browser = await vi.mocked(chromium.launch).mock.results[0].value;
    expect(browser.close).toHaveBeenCalledTimes(1);
    // row should exist
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].firmId).toBe('js-firm');
  });

  it('(11) includeDisabled forwards to loadFirms', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);

    await runAudit({ includeDisabled: true });
    expect(vi.mocked(loadFirms)).toHaveBeenCalledWith({ includeDisabled: true });

    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);

    await runAudit({});
    expect(vi.mocked(loadFirms)).toHaveBeenCalledWith({ includeDisabled: undefined });
  });

  it('(12) writeFile receives AUDIT_OUTPUT_PATH and markdown containing firm audit header', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([
      { firmId: 'rss-firm', title: 'Item 1', url: 'https://example.com/1', language: 'en' },
    ]);

    const report = await runAudit({});

    expect(vi.mocked(writeFile as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      AUDIT_OUTPUT_PATH,
      expect.stringContaining('# Firm Audit Report'),
      'utf8',
    );
    // The markdown should also contain the firmId
    const callArgs = vi.mocked(writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toContain(report.rows[0].firmId);
  });

  it('(13) probeVersion picks up GITHUB_SHA env var; fallback to unknown', async () => {
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);

    process.env.GITHUB_SHA = 'deadbeef';
    let report = await runAudit({});
    expect(report.runMetadata.probeVersion).toBe('deadbeef');

    delete process.env.GITHUB_SHA;
    vi.mocked(loadFirms).mockResolvedValue([rssFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);
    report = await runAudit({});
    expect(report.runMetadata.probeVersion).toBe('unknown');
  });

  it('(14) disabled firm row carries disabled:true', async () => {
    const disabledFirm: FirmConfig = { ...rssFirm, enabled: false };
    vi.mocked(loadFirms).mockResolvedValue([disabledFirm]);
    vi.mocked(scrapeRss).mockResolvedValue([]);

    const report = await runAudit({});

    expect(report.rows[0].disabled).toBe(true);
  });
});
