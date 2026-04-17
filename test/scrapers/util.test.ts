// Unit tests for src/scrapers/util.ts — DEDUP-02 canonicalizeUrl + Pitfall 3/6 parseDate.
//
// These tests lock the contract of the two hottest pure functions in the pipeline.
// Every change to canonicalizeUrl or parseDate MUST keep these vectors green; any
// change that forces an update here is a breaking change to downstream state.

import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, parseDate } from '../../src/scrapers/util.js';

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
