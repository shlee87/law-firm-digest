// TDD coverage for src/pipeline/filter.ts.
//
// Mirrors the dedup.ts test structure: explicit invariant-list preamble,
// separate it() per behavior, error pass-through + no-mutation gates.
//
// Contract locked (9 behaviors):
//   1. Fast path — both keyword arrays empty → return same reference.
//   2. include_keywords AND-gate — only items with >=1 include match pass.
//   3. exclude_keywords OR-gate — any single exclude match kills.
//   4. Combined — include passes then exclude kills (overlap possible).
//   5. Case-insensitive matching on title + description[:500].
//   6. 500-char window: matches beyond char 500 of description are invisible.
//   7. Error pass-through — FirmResult with .error returned unchanged.
//   8. No mutation — input results array + nested items unchanged.
//   9. Empty r.raw — returns empty r.raw, no crash, same-length output.

import { describe, it, expect } from 'vitest';
import { applyKeywordFilter } from '../../src/pipeline/filter.js';
import type { FirmConfig, FirmResult } from '../../src/types.js';

function makeFirm(overrides: Partial<FirmConfig> = {}): FirmConfig {
  return {
    id: 'test-firm',
    name: 'Test Firm',
    language: 'en',
    type: 'rss',
    url: 'https://example.com/feed',
    timezone: 'America/New_York',
    enabled: true,
    timeout_ms: 20000,
    include_keywords: [],
    exclude_keywords: [],
    ...overrides,
  };
}

function makeResult(
  firm: FirmConfig,
  items: Array<{ title: string; url: string; description?: string }>,
): FirmResult {
  return {
    firm,
    raw: items.map((i) => ({
      firmId: firm.id,
      title: i.title,
      url: i.url,
      language: firm.language,
      description: i.description,
    })),
    new: [],
    summarized: [],
    durationMs: 0,
  };
}

describe('applyKeywordFilter', () => {
  it('(1) fast path — no filters → return same reference', () => {
    const firm = makeFirm();
    const r = makeResult(firm, [
      { title: 'Anything', url: 'https://x.com/a' },
      { title: 'Whatever', url: 'https://x.com/b' },
    ]);
    const out = applyKeywordFilter([r]);
    expect(out[0]).toBe(r);
  });

  it('(2) include_keywords AND-gate — only items with any match pass', () => {
    const firm = makeFirm({ include_keywords: ['tax', 'AI'] });
    const r = makeResult(firm, [
      {
        title: 'AI regulation update',
        url: 'https://x.com/ai',
        description: 'about AI',
      },
      { title: 'Weather report', url: 'https://x.com/w', description: 'sunny' },
      {
        title: 'Tax Alert',
        url: 'https://x.com/t',
        description: 'new tax rules',
      },
    ]);
    const out = applyKeywordFilter([r]);
    expect(out[0].raw).toHaveLength(2);
    expect(out[0].raw.map((i) => i.url)).toEqual([
      'https://x.com/ai',
      'https://x.com/t',
    ]);
  });

  it('(3) exclude_keywords OR-gate — any match kills the item', () => {
    const firm = makeFirm({ exclude_keywords: ['press release'] });
    const r = makeResult(firm, [
      { title: 'Tax Alert', url: 'https://x.com/t' },
      { title: 'Press Release: corporate milestone', url: 'https://x.com/p' },
      { title: 'Insights', url: 'https://x.com/i' },
    ]);
    const out = applyKeywordFilter([r]);
    expect(out[0].raw.map((i) => i.url)).toEqual([
      'https://x.com/t',
      'https://x.com/i',
    ]);
  });

  it('(4) combined — include AND exclude — both apply (include pass + exclude kill)', () => {
    const firm = makeFirm({
      include_keywords: ['tax'],
      exclude_keywords: ['press release'],
    });
    const r = makeResult(firm, [
      { title: 'Tax Alert', url: 'https://x.com/1' },
      { title: 'Tax Press Release', url: 'https://x.com/2' },
      { title: 'Weather', url: 'https://x.com/3' },
    ]);
    const out = applyKeywordFilter([r]);
    expect(out[0].raw.map((i) => i.url)).toEqual(['https://x.com/1']);
  });

  it('(5) case-insensitive matching', () => {
    const firm = makeFirm({ include_keywords: ['AI'] });
    const r = makeResult(firm, [
      {
        title: 'Artificial Intelligence AI Roundup',
        url: 'https://x.com/a',
      },
      { title: 'GDP growth', url: 'https://x.com/b' },
    ]);
    const out = applyKeywordFilter([r]);
    expect(out[0].raw.map((i) => i.url)).toEqual(['https://x.com/a']);
  });

  it('(6) description[:500] window — matches beyond char 500 are invisible', () => {
    const firm = makeFirm({ include_keywords: ['zebra'] });
    const leadingFiller = 'A'.repeat(550);
    const r = makeResult(firm, [
      {
        title: 'unrelated title',
        url: 'https://x.com/deep',
        description: leadingFiller + ' zebra here',
      },
      {
        title: 'zebra title wins',
        url: 'https://x.com/t',
        description: 'nothing',
      },
    ]);
    const out = applyKeywordFilter([r]);
    expect(out[0].raw.map((i) => i.url)).toEqual(['https://x.com/t']);
  });

  it('(7) error pass-through — FirmResult with error returned unchanged', () => {
    const firm = makeFirm({ include_keywords: ['anything'] });
    const errored: FirmResult = {
      firm,
      raw: [],
      new: [],
      summarized: [],
      error: { stage: 'fetch', message: 'down' },
      durationMs: 0,
    };
    const out = applyKeywordFilter([errored]);
    expect(out[0]).toBe(errored);
  });

  it('(8) does not mutate input', () => {
    const firm = makeFirm({ exclude_keywords: ['skip'] });
    const r = makeResult(firm, [
      { title: 'keep', url: 'https://x.com/k' },
      { title: 'skip me', url: 'https://x.com/s' },
    ]);
    const before = JSON.stringify([r]);
    applyKeywordFilter([r]);
    const after = JSON.stringify([r]);
    expect(after).toBe(before);
  });

  it('(9) empty r.raw — no crash, empty raw in output', () => {
    const firm = makeFirm({ include_keywords: ['anything'] });
    const r = makeResult(firm, []);
    const out = applyKeywordFilter([r]);
    expect(out).toHaveLength(1);
    expect(out[0].raw).toEqual([]);
  });
});
