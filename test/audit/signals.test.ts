// Unit tests for src/audit/signals.ts — 4-signal multi-detection detail-identity classifier.
//
// These tests lock the contract of the 4 pure signal functions and the
// classifyDetailIdentity combiner. Every change to signals.ts MUST keep these
// tests green.
//
// Critical: Test 34 (Pitfall 1 vacuous-fire guard) — must remain green.
// Without it, audit produces false-positive 'detail-identical (title-tokens 0/0)'
// for legitimate firms whose titles consist solely of single-character tokens
// (e.g., 'A B', 'M&A'). The giveaway is '0/0' in the evidence string.

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  extractTitleTokens,
  titleTokensPresentInBody,
  bodyHash,
  exactHashMatch,
  jaccardTokenSimilarity,
  bodyTooShort,
  BODY_TOO_SHORT_THRESHOLD,
  classifyDetailIdentity,
} from '../../src/audit/signals.js';

// ---------------------------------------------------------------------------
// Fixture bodies for classifier tests (Tests 29-35)
// ---------------------------------------------------------------------------
const identicalBody =
  '법무법인 태평양은 1980년에 설립된 한국의 종합 법률 서비스 회사로, 기업 자문, M&A, 금융, 소송 등 다양한 법률 서비스를 제공합니다.'.repeat(
    5,
  ); // ≥200 chars

const realArticleA =
  'M&A 시장에서 최근 두드러진 움직임이 관찰되었다. 인수합병 거래량이 전년 대비 30퍼센트 증가하면서 주요 법무법인들의 자문 수임도 크게 늘었다.'.repeat(
    3,
  );
const realArticleB =
  '세법 개정안이 국회를 통과하면서 기업 지배구조에 미치는 영향이 광범위하다. 새로운 규정은 다음 분기부터 적용되며 주요 상장사에 상당한 비용 절감 효과를 가져올 것으로 예상된다.'.repeat(
    3,
  );

// ---------------------------------------------------------------------------
// describe('tokenize')
// ---------------------------------------------------------------------------
describe('tokenize', () => {
  it('Test 1: empty string returns []', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('Test 2: whitespace-only string returns []', () => {
    expect(tokenize('   \t\n  ')).toEqual([]);
  });

  it('Test 3: simple English string splits on whitespace', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('Test 4: Korean Hangul string splits on whitespace', () => {
    expect(tokenize('한국어 테스트')).toEqual(['한국어', '테스트']);
  });

  it('Test 5: mixed Korean and English splits on whitespace', () => {
    expect(tokenize('mixed 한국어 EN')).toEqual(['mixed', '한국어', 'EN']);
  });

  it('Test 6: consecutive whitespace (space, tab, newline) collapses to single separator', () => {
    expect(tokenize('a  b\t\nc')).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// describe('extractTitleTokens')
// ---------------------------------------------------------------------------
describe('extractTitleTokens', () => {
  it('Test 7: Korean title with M&A — ampersand splits, single-char tokens dropped', () => {
    // 'M', '&', 'A' are each <2 chars and M&A gets split; '시장', '동향' are 2-char Hangul
    expect(extractTitleTokens('M&A 시장 동향')).toEqual(['시장', '동향']);
  });

  it('Test 8: English title — lowercased', () => {
    expect(extractTitleTokens('Recent Tax Policy Updates')).toEqual([
      'recent',
      'tax',
      'policy',
      'updates',
    ]);
  });

  it('Test 9: mixed K-IFRS title — Latin lowercased, Hangul preserved as-is', () => {
    // 'K' is single char and dropped; 'IFRS' ≥2 chars → 'ifrs'; '도입', '영향' are Hangul
    expect(extractTitleTokens('K-IFRS 도입 영향')).toEqual(['ifrs', '도입', '영향']);
  });

  it('Test 10: empty title returns []', () => {
    expect(extractTitleTokens('')).toEqual([]);
  });

  it('Test 11: all single-char Latin tokens returns [] (no ≥2-char token survives)', () => {
    expect(extractTitleTokens('A B C')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// describe('titleTokensPresentInBody')
// ---------------------------------------------------------------------------
describe('titleTokensPresentInBody', () => {
  it('Test 12: tokens all present in body returns count N', () => {
    // title='Tax Update' → tokens ['tax', 'update']; both in body
    const result = titleTokensPresentInBody('Tax Update', 'this is a tax update doc');
    expect(result).toBe(2);
  });

  it('Test 13: tokens none present in body returns 0', () => {
    const result = titleTokensPresentInBody('환경 규제', '금융 시장 동향 분석');
    expect(result).toBe(0);
  });

  it('Test 14: case-insensitive English match (title TAX, body lowercase tax law)', () => {
    expect(titleTokensPresentInBody('TAX', 'tax law')).toBe(1);
  });

  it('Test 15: empty title returns 0 (no tokens to check)', () => {
    expect(titleTokensPresentInBody('', 'some body content here')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// describe('bodyHash + exactHashMatch')
// ---------------------------------------------------------------------------
describe('bodyHash + exactHashMatch', () => {
  it('Test 16: identical strings produce identical hash and exactHashMatch is true', () => {
    const body = 'Hello world this is a test body';
    expect(bodyHash(body)).toBe(bodyHash(body));
    expect(exactHashMatch(body, body)).toBe(true);
  });

  it('Test 17: bodies differing only after 51st char — still same hash (design: first 50 chars hashed)', () => {
    // By design, bodyHash only considers first 50 chars + total length.
    // Two bodies identical in length and first 50 chars but differing after → same hash.
    // The total length must match too (length prefix in hash format).
    const prefix = 'a'.repeat(50);
    const bodyA = prefix + 'XXXXX';
    const bodyB = prefix + 'XXXXX'; // same length, same first 50 → true
    // Actually: per hash format '${body.length}:${first50}', if length differs → different
    // Make them same length but differ ONLY in chars 51+
    const bodyC = prefix + 'YYYYY';
    // bodyA.length === bodyC.length, first 50 identical → same hash → exactHashMatch true
    expect(bodyA.length).toBe(bodyC.length);
    expect(exactHashMatch(bodyA, bodyC)).toBe(true);
  });

  it('Test 18: bodies differing in length → different hash, exactHashMatch false', () => {
    expect(exactHashMatch('short', 'a much longer string')).toBe(false);
  });

  it('Test 19: whitespace within first 50 chars is stripped in hash', () => {
    // Hash format: '${body.length}:${body.slice(0,50).replace(/\s+/g,"")}'
    const body = '  abc';
    const hash = bodyHash(body);
    // body.length = 5, first 50 (stripped) = 'abc'
    expect(hash).toBe('5:abc');
  });
});

// ---------------------------------------------------------------------------
// describe('jaccardTokenSimilarity')
// ---------------------------------------------------------------------------
describe('jaccardTokenSimilarity', () => {
  it('Test 20: identical bodies (≥10 tokens) → 1.0', () => {
    const body =
      '법무 법인 태평양 기업 자문 금융 소송 M&A 특허 분쟁 해결 위한 전문가 법률 서비스';
    expect(jaccardTokenSimilarity(body, body)).toBe(1.0);
  });

  it('Test 21: completely disjoint bodies → 0.0', () => {
    expect(jaccardTokenSimilarity('aaa bbb ccc', 'xxx yyy zzz')).toBe(0.0);
  });

  it('Test 22: both empty bodies → 1.0 (vacuously identical)', () => {
    expect(jaccardTokenSimilarity('', '')).toBe(1.0);
  });

  it('Test 23: one empty, other with tokens → 0.0', () => {
    expect(jaccardTokenSimilarity('', 'some words here')).toBe(0.0);
    expect(jaccardTokenSimilarity('some words here', '')).toBe(0.0);
  });

  it('Test 24: 50% overlap — e.g., "a b c d" vs "a b e f" → 2/6 ≈ 0.333', () => {
    // intersection: {a, b} = 2; union: {a, b, c, d, e, f} = 6; 2/6 ≈ 0.333
    const result = jaccardTokenSimilarity('a b c d', 'a b e f');
    expect(result).toBeCloseTo(2 / 6, 5);
  });
});

// ---------------------------------------------------------------------------
// describe('bodyTooShort')
// ---------------------------------------------------------------------------
describe('bodyTooShort', () => {
  it('Test 25: 99-char body → true (below threshold)', () => {
    expect(bodyTooShort('a'.repeat(99))).toBe(true);
  });

  it('Test 26: 100-char body → false (at threshold boundary, NOT too short)', () => {
    expect(bodyTooShort('a'.repeat(100))).toBe(false);
  });

  it('Test 27: 0-char (empty) body → true', () => {
    expect(bodyTooShort('')).toBe(true);
  });

  it('Test 28: BODY_TOO_SHORT_THRESHOLD constant is exported and equals 100', () => {
    expect(BODY_TOO_SHORT_THRESHOLD).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// describe('classifyDetailIdentity')
// ---------------------------------------------------------------------------
describe('classifyDetailIdentity', () => {
  it('Test 29: empty array → detail-quality-unknown, evidence contains "0/2"', () => {
    const result = classifyDetailIdentity([]);
    expect(result.status).toBe('detail-quality-unknown');
    expect(result.evidence).toContain('0/2');
  });

  it('Test 30: single body → detail-quality-unknown, evidence contains "1/2"', () => {
    const result = classifyDetailIdentity([
      { url: 'https://x/1', title: '세법 개정', body: identicalBody },
    ]);
    expect(result.status).toBe('detail-quality-unknown');
    expect(result.evidence).toContain('1/2');
  });

  it('Test 31: one body length=50 (other length=300) → detail-empty, evidence mentions both lengths and threshold 100', () => {
    const shortBody = 'a'.repeat(50);
    const longBody = 'b'.repeat(300);
    const result = classifyDetailIdentity([
      { url: 'https://x/1', title: '기업 인수', body: shortBody },
      { url: 'https://x/2', title: '세법 동향', body: longBody },
    ]);
    expect(result.status).toBe('detail-empty');
    expect(result.evidence).toContain('50');
    expect(result.evidence).toContain('300');
    expect(result.evidence).toContain('100');
  });

  it('Test 32: both bodies identical (≥200 chars), distinct titles → detail-identical with all 3 reasons', () => {
    // bkl-style: identical bodies, titles with tokens present in their own bodies
    const result = classifyDetailIdentity([
      { url: 'https://x/1', title: 'M&A 시장 동향', body: identicalBody },
      { url: 'https://x/2', title: '세법 개정 영향', body: identicalBody },
    ]);
    expect(result.status).toBe('detail-identical');
    expect(result.evidence).toContain('exact-hash');
    expect(result.evidence).toContain('jaccard=1.00');
    expect(result.evidence).toContain('title-tokens');
  });

  it('Test 33: both bodies are real distinct articles (different topics, ≥200 chars, jaccard <0.5, titles share tokens with own body) → OK', () => {
    const result = classifyDetailIdentity([
      { url: 'https://x/1', title: 'M&A 시장 동향', body: realArticleA },
      { url: 'https://x/2', title: '세법 개정 영향', body: realArticleB },
    ]);
    expect(result.status).toBe('OK');
    expect(result.evidence).toContain('bodies distinct');
    expect(result.evidence).toMatch(/jaccard=\d+\.\d{2}/);
  });

  // ---------------------------------------------------------------------------
  // Test 34 — Pitfall 1 Vacuous-Fire Guard (CRITICAL)
  //
  // Scenario: titles 'A B' and 'X Y' each yield ZERO ≥2-char tokens from
  // extractTitleTokens. If the classifier fired title-token signal when
  // totalTokens === 0, distinct real articles would be mis-classified as
  // 'detail-identical' whenever both titles happen to be short-token titles.
  //
  // The guard: titlePresenceTriggered MUST require totalTokensA > 0 &&
  // totalTokensB > 0. Without it, 'title-tokens 0/0 & 0/0' appears in evidence
  // — the giveaway of a vacuous trigger.
  // ---------------------------------------------------------------------------
  it('Test 34 (Pitfall 1 vacuous-fire guard): titles with zero ≥2-char tokens AND distinct bodies → OK, not detail-identical', () => {
    // Titles 'A B' and 'X Y' each have zero ≥2-char tokens
    // Bodies are distinct real articles (jaccard << 0.9, no exact-hash match)
    const result = classifyDetailIdentity([
      { url: 'https://x/1', title: 'A B', body: realArticleA },
      { url: 'https://x/2', title: 'X Y', body: realArticleB },
    ]);
    expect(result.status).toBe('OK');
    // The vacuous-fire guard ensures this is NOT classified as detail-identical
    // due to "title-tokens 0/0" triggering.
  });

  it('Test 35: both bodies identical AND title-tokens vacuously zero — still detail-identical via exact-hash and jaccard (NOT title-tokens)', () => {
    // Titles 'A B' / 'X Y' → zero tokens each → title-token signal MUST NOT fire
    // But exact-hash and jaccard=1.0 still fire for identical bodies
    const result = classifyDetailIdentity([
      { url: 'https://x/1', title: 'A B', body: identicalBody },
      { url: 'https://x/2', title: 'X Y', body: identicalBody },
    ]);
    expect(result.status).toBe('detail-identical');
    expect(result.evidence).toContain('exact-hash');
    expect(result.evidence).toContain('jaccard=1.00');
    // title-tokens reason MUST NOT appear (vacuous guard prevents it)
    expect(result.evidence).not.toContain('title-tokens');
  });
});
