// Offline vitest coverage for src/scrapers/jsRender.ts.
//
// Deterministic by design — no real chromium binary required. A hand-rolled
// mock with the Browser / BrowserContext / Page API surface we actually use
// is cast to `never` at call sites to opt out of full-interface TS conformance.
// This is a test-scope disclaimer, not a runtime concern; production code
// (pipeline/run.ts, plan 04-04) will receive a real Browser.
//
// Covers:
//   1. Happy path — mock page.content() returns HTML, parseListItemsFromHtml
//      extracts items, scrapeJsRender returns the RawItem[].
//   2. wait_for + 15s timeout passed through to page.waitForSelector.
//   3. Phase 1 USER_AGENT string sent via browser.newContext({ userAgent }).
//   4. Finally-block closes BrowserContext even on throw.
//   5. Playwright TimeoutError re-wrapped to "playwright-timeout" classifier shape.
//   6. chromium-executable-missing re-wrapped to "browser-launch-fail" shape.
//   7. Zero-items extraction throws "selector-miss" (stricter than scrapeHtml).
//   8. Programmer-error (firm without wait_for) throws before touching the browser.

import { describe, it, expect, vi } from 'vitest';
import { scrapeJsRender } from '../../src/scrapers/jsRender.js';
import type { FirmConfig } from '../../src/types.js';

function makeFirm(overrides: Partial<FirmConfig> = {}): FirmConfig {
  return {
    id: 'lee-ko',
    name: '광장',
    language: 'ko',
    type: 'js-render',
    url: 'https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR',
    timezone: 'Asia/Seoul',
    enabled: true,
    wait_for: 'ul#contentsList > li',
    selectors: {
      list_item: 'ul#contentsList > li',
      title: '.title',
      link: 'a',
    },
    ...overrides,
  };
}

type MockPage = {
  goto: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  content: ReturnType<typeof vi.fn>;
};
type MockContext = { newPage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
type MockBrowser = { newContext: ReturnType<typeof vi.fn> };

function makeMockBrowser(pageBehavior: Partial<MockPage> = {}): {
  browser: MockBrowser;
  page: MockPage;
  context: MockContext;
} {
  const page: MockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html><body></body></html>'),
    ...pageBehavior,
  };
  const context: MockContext = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser: MockBrowser = {
    newContext: vi.fn().mockResolvedValue(context),
  };
  return { browser, page, context };
}

describe('scrapeJsRender', () => {
  it('returns RawItem[] when list page hydrates with items', async () => {
    const html = `<!doctype html><html><body>
      <ul id="contentsList">
        <li><a href="/detail/1"><span class="title">Newsletter A</span></a></li>
        <li><a href="/detail/2"><span class="title">Newsletter B</span></a></li>
      </ul>
    </body></html>`;
    const { browser } = makeMockBrowser({
      content: vi.fn().mockResolvedValue(html),
    });
    const items = await scrapeJsRender(makeFirm(), browser as never);
    expect(items).toHaveLength(2);
    expect(items[0].firmId).toBe('lee-ko');
    expect(items[0].title).toBe('Newsletter A');
    expect(items[0].url).toContain('/detail/1');
    expect(items[0].language).toBe('ko');
  });

  it('passes the configured wait_for selector and 15s timeout to waitForSelector', async () => {
    const { browser, page } = makeMockBrowser();
    try {
      await scrapeJsRender(makeFirm(), browser as never);
    } catch {
      /* expected — empty HTML produces zero-items throw */
    }
    expect(page.waitForSelector).toHaveBeenCalledWith(
      'ul#contentsList > li',
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('sends the Phase 1 USER_AGENT string via newContext', async () => {
    const { browser } = makeMockBrowser();
    try {
      await scrapeJsRender(makeFirm(), browser as never);
    } catch {
      /* zero-items */
    }
    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: expect.stringContaining('LegalNewsletterBot'),
      }),
    );
  });

  it('closes the BrowserContext even on throw (finally discipline)', async () => {
    const { browser, context } = makeMockBrowser({
      waitForSelector: vi
        .fn()
        .mockRejectedValue(new Error('Timeout 15000ms exceeded waiting for selector')),
    });
    await expect(scrapeJsRender(makeFirm(), browser as never)).rejects.toThrow(
      /playwright-timeout/,
    );
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('re-wraps Playwright timeout to the "playwright-timeout" classifier-friendly message', async () => {
    const { browser } = makeMockBrowser({
      waitForSelector: vi
        .fn()
        .mockRejectedValue(new Error('Timeout 15000ms exceeded waiting for selector')),
    });
    await expect(scrapeJsRender(makeFirm(), browser as never)).rejects.toThrow(
      /scrapeJsRender lee-ko: playwright-timeout waiting for ul#contentsList > li/,
    );
  });

  it('re-wraps browser-level failure to the "browser-launch-fail" classifier-friendly message', async () => {
    const { browser } = makeMockBrowser({
      goto: vi
        .fn()
        .mockRejectedValue(new Error('chromium executable not found')),
    });
    await expect(scrapeJsRender(makeFirm(), browser as never)).rejects.toThrow(
      /scrapeJsRender lee-ko: browser-launch-fail/,
    );
  });

  it('throws "zero items extracted (selector-miss)" when wait_for matched but list_item extractor returned []', async () => {
    const html = '<html><body><ul id="contentsList"></ul></body></html>'; // empty list
    const { browser } = makeMockBrowser({
      content: vi.fn().mockResolvedValue(html),
    });
    await expect(scrapeJsRender(makeFirm(), browser as never)).rejects.toThrow(
      /zero items extracted \(selector-miss\)/,
    );
  });

  it('rejects programmer-error call with firm lacking wait_for', async () => {
    const { browser } = makeMockBrowser();
    const bad = makeFirm({ wait_for: undefined });
    await expect(scrapeJsRender(bad, browser as never)).rejects.toThrow(
      /wait_for is required/,
    );
  });
});
