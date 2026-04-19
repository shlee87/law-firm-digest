import { describe, it, expect } from 'vitest';
import { FirmSchema, FirmsConfigSchema } from '../../src/config/schema.js';

const baseValid = {
  id: 'test-firm',
  name: 'Test Firm',
  language: 'ko' as const,
  type: 'html' as const,
  url: 'https://example.com',
  timezone: 'Asia/Seoul',
  enabled: true,
};

describe('FirmSchema (Phase 2 extensions)', () => {
  it('accepts firm with selectors.link only (plain-href backward compat)', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      selectors: { list_item: 'li', title: '.t', link: 'a' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts firm with link_onclick_regex + link_template (no link)', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      selectors: {
        list_item: 'li',
        title: '.t',
        link_onclick_regex: "goView\\('(\\d+)'\\)",
        link_template: '/detail.do?id={1}',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects firm with selectors but no link AND no onclick pair (refine trigger)', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      selectors: { list_item: 'li', title: '.t' },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(
      'Each firm needs either selectors.link OR',
    );
  });

  it('rejects link_template that is not absolute or path-absolute (Pitfall 5)', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      selectors: {
        list_item: 'li',
        title: '.t',
        link_onclick_regex: "goView\\('(\\d+)'\\)",
        link_template: 'detail.do?id={1}', // missing leading / or https://
      },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(
      'link_template must be absolute',
    );
  });

  it('include_keywords and exclude_keywords default to []', () => {
    const r = FirmSchema.parse({
      ...baseValid,
      type: 'rss',
      url: 'https://example.com/feed',
    });
    expect(r.include_keywords).toEqual([]);
    expect(r.exclude_keywords).toEqual([]);
  });

  it('accepts include_keywords as string[]', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      type: 'rss',
      url: 'https://example.com/feed',
      include_keywords: ['tax', 'AI'],
      exclude_keywords: ['press release'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-string element in include_keywords', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      type: 'rss',
      url: 'https://example.com/feed',
      include_keywords: ['tax', 42],
    });
    expect(r.success).toBe(false);
  });

  it('accepts selectors.body override', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      selectors: {
        list_item: 'li',
        title: '.t',
        link: 'a',
        body: '.article-content',
      },
    });
    expect(r.success).toBe(true);
  });

  it('still rejects unknown top-level field (.strict() regression guard)', () => {
    const r = FirmSchema.safeParse({
      ...baseValid,
      type: 'rss',
      url: 'https://example.com/feed',
      nmae: 'typo',
    });
    expect(r.success).toBe(false);
  });
});

describe('FirmSchema (Phase 4 js-render extensions)', () => {
  const jsRenderBase = {
    id: 'test-js-firm',
    name: 'Test JS Firm',
    language: 'ko' as const,
    type: 'js-render' as const,
    url: 'https://example.com/news',
    timezone: 'Asia/Seoul',
    enabled: true,
  };

  it('accepts type: js-render with wait_for + selectors', () => {
    const r = FirmSchema.safeParse({
      ...jsRenderBase,
      wait_for: 'ul#contentsList > li',
      selectors: { list_item: 'ul#contentsList > li', title: '.title', link: 'a' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects js-render firm with no wait_for field', () => {
    const r = FirmSchema.safeParse({
      ...jsRenderBase,
      selectors: { list_item: 'li', title: '.t', link: 'a' },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('wait_for is required when type');
  });

  it('rejects js-render firm with empty wait_for string', () => {
    const r = FirmSchema.safeParse({
      ...jsRenderBase,
      wait_for: '',
      selectors: { list_item: 'li', title: '.t', link: 'a' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects rss firm that mistakenly includes wait_for', () => {
    const r = FirmSchema.safeParse({
      id: 'bad-rss',
      name: 'Bad RSS',
      language: 'en',
      type: 'rss',
      url: 'https://example.com/feed',
      timezone: 'Europe/London',
      enabled: true,
      wait_for: 'should-not-be-here',
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('wait_for is only valid when type');
  });

  it('rejects html firm that mistakenly includes wait_for', () => {
    const r = FirmSchema.safeParse({
      id: 'bad-html',
      name: 'Bad HTML',
      language: 'ko',
      type: 'html',
      url: 'https://example.com',
      timezone: 'Asia/Seoul',
      enabled: true,
      wait_for: 'should-not-be-here',
      selectors: { list_item: 'li', title: '.t', link: 'a' },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('wait_for is only valid when type');
  });

  it('still enforces .strict() regression — unknown top-level field rejected for js-render', () => {
    const r = FirmSchema.safeParse({
      ...jsRenderBase,
      wait_for: 'li',
      selectors: { list_item: 'li', title: '.t', link: 'a' },
      nmae: 'typo',
    });
    expect(r.success).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Phase 4.1 — selectors.link union (string | LinkExtractorSchema)
// --------------------------------------------------------------------------

describe('FirmSchema selectors.link union (Phase 4.1)', () => {
  const baseFirm = {
    id: 'lx-test',
    name: 'Link Extractor Test',
    language: 'ko',
    type: 'html',
    url: 'https://example.com',
    timezone: 'Asia/Seoul',
  };

  it('accepts selectors.link as a plain string (legacy form)', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: { list_item: '.item', title: '.ttl', link: 'a' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts selectors.link as an object with selector only', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: { selector: 'a' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts selectors.link as an object with selector + attribute + regex + template', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: {
          selector: 'a',
          attribute: 'data-id',
          regex: '(\\d+)',
          template: '/article/{1}',
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects selectors.link object with regex but no template', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: { selector: 'a', regex: '(\\d+)' },
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects selectors.link object with template but no regex', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link: { selector: 'a', template: '/foo/{1}' },
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects selectors with neither link nor (link_onclick_regex + link_template)', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: { list_item: '.item', title: '.ttl' },
    });
    expect(r.success).toBe(false);
  });

  it('still accepts legacy link_onclick_regex + link_template combo', () => {
    const r = FirmSchema.safeParse({
      ...baseFirm,
      selectors: {
        list_item: '.item',
        title: '.ttl',
        link_onclick_regex: "goView\\('(\\d+)'\\)",
        link_template: '/view/{1}',
      },
    });
    expect(r.success).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Phase 4.1 — regression: existing firms.yaml parses unchanged under new schema
// --------------------------------------------------------------------------

describe('config/firms.yaml regression under Phase 4.1 schema', () => {
  it('all existing firms still parse against generalized schema', async () => {
    const fs = await import('node:fs/promises');
    const yaml = await import('yaml');
    const raw = await fs.readFile('config/firms.yaml', 'utf8');
    const parsed = yaml.parse(raw);
    const r = FirmsConfigSchema.safeParse(parsed);
    if (!r.success) {
      // surface issues in CI output when regression hits
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(r.error.issues, null, 2));
    }
    expect(r.success).toBe(true);
  });
});
