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
import { applyKeywordFilter, isTopicRelevant } from '../../src/pipeline/filter.js';
import type { FirmConfig, FirmResult, TopicConfig } from '../../src/types.js';

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

// ---------------------------------------------------------------------------
// isTopicRelevant — Phase 12 SPEC-12-REQ-2 / SPEC-12-REQ-3
// ---------------------------------------------------------------------------
// Contract (8 behaviors):
//   a. Title match with empty body → true (permissive: empty body always passes)
//   b. Body match only (generic title, keyword only in body) → true
//   c. Both title and body match → true
//   d. No keyword in title or body → false
//   e. Empty body regardless of title content → true (D-11 permissive bias)
//   f. Case-insensitive match → true
//   g. 500-char body window: keyword beyond char 500 is invisible → false
//   h. Empty topics config {} with non-empty body → false (no keywords to match)

function makeTopics(overrides: Partial<TopicConfig> = {}): TopicConfig {
  return {
    vc_securities: ['VC', '벤처', 'startup', 'securities'],
    fair_trade: ['공정거래', 'antitrust'],
    privacy: ['개인정보', 'privacy', 'GDPR'],
    labor: ['노동', 'employment'],
    ip: ['특허', 'patent', 'trademark'],
    ...overrides,
  };
}

describe('isTopicRelevant', () => {
  it('(a) title match with empty body → true (permissive — empty body always passes, D-11)', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('VC 투자 규제', '', topics)).toBe(true);
  });

  it('(b) body match only — generic title with no topic keyword → true', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('법무법인 소식', '특허 분쟁 사례 분석 보고서', topics)).toBe(true);
  });

  it('(c) both title and body match → true', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('공정거래 이슈', '개인정보 침해 사례', topics)).toBe(true);
  });

  it('(d) no keyword in title or body → false', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('오늘의 날씨 예보', '내일은 맑고 기온이 높겠습니다.', topics)).toBe(false);
  });

  it('(e) empty body — title has NO topic keyword → true (SPEC req 3 / D-11 permissive)', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('오늘의 날씨 예보', '', topics)).toBe(true);
  });

  it('(f) case-insensitive match — uppercase keyword in title → true', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('PATENT Dispute Ruling', '법원 판결문 전문', topics)).toBe(true);
  });

  it('(g) 500-char body window — keyword beyond char 500 is invisible', () => {
    const topics = makeTopics();
    const filler = 'A'.repeat(501);
    const bodyWithLateKeyword = filler + '특허';
    expect(isTopicRelevant('법무법인 공지', bodyWithLateKeyword, topics)).toBe(false);
  });

  it('(h) empty topics config {} with non-empty body → false (no keywords to match)', () => {
    expect(isTopicRelevant('공정거래 이슈', '이 글은 공정거래에 관한 내용입니다.', {})).toBe(false);
  });
});
