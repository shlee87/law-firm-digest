import { describe, it, expect } from 'vitest';
import { composeDigest } from '../../src/compose/digest.js';
import type { FirmConfig, FirmResult } from '../../src/types.js';

const cooley: FirmConfig = {
  id: 'cooley',
  name: 'Cooley',
  language: 'en',
  type: 'rss',
  url: 'https://cooley.com/feed',
  timezone: 'America/Los_Angeles',
  enabled: true,
  timeout_ms: 20000,
};

function fixture(): FirmResult[] {
  return [
    {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [
        {
          firmId: 'cooley',
          title: 'AI Regulation Update April 2026',
          url: 'https://cooley.com/news/insight/2026/2026-04-15-ai-reg',
          publishedAt: '2026-04-15T12:00:00.000Z',
          language: 'en',
          isNew: true,
          summary_ko:
            '4월 AI 규제 동향을 정리한 요약입니다. 핵심 3가지 변경사항을 다룹니다.',
          summaryConfidence: 'high',
          summaryModel: 'gemini-2.5-flash',
        },
        {
          firmId: 'cooley',
          title: 'Second <Article> with HTML-ish Title',
          url: 'https://cooley.com/news/insight/2026/2026-04-10-ma',
          language: 'en',
          isNew: true,
          summary_ko: null,
          summaryConfidence: 'low',
          summaryModel: 'failed',
          summaryError: 'quota exceeded',
        },
        {
          // B3 path: item with no description; main.ts bypassed Gemini.
          firmId: 'cooley',
          title: 'Title-only Article (B3 skipped)',
          url: 'https://cooley.com/news/insight/2026/2026-04-05-privacy',
          language: 'en',
          isNew: true,
          summary_ko: null,
          summaryConfidence: 'low',
          summaryModel: 'skipped',
        },
      ],
      durationMs: 1234,
    },
  ];
}

describe('composeDigest', () => {
  const fixedDate = new Date('2026-04-17T09:00:00.000Z'); // 18:00 KST

  it('produces subject per D-06 format', () => {
    const payload = composeDigest(
      fixture(),
      'user@example.com',
      'user@example.com',
      fixedDate,
    );
    expect(payload.subject).toBe('[법률 다이제스트] 2026-04-17 (1 firms, 3 items)');
    expect(payload.to).toBe('user@example.com');
    expect(payload.from).toBe('user@example.com');
  });

  it('HTML contains escaped title and Korean summary', () => {
    const payload = composeDigest(
      fixture(),
      'user@example.com',
      'user@example.com',
      fixedDate,
    );
    expect(payload.html).toContain('&lt;Article&gt;'); // XSS-safe
    expect(payload.html).toContain('4월 AI 규제 동향'); // summary passes through
    expect(payload.html).toContain(
      'href="https://cooley.com/news/insight/2026/2026-04-15-ai-reg"',
    );
    expect(payload.html).toContain('<h1');
    expect(payload.html).toContain('<h2');
    expect(payload.html).not.toContain('<script');
  });

  it('B3: null summary_ko (either failed or skipped) renders Korean placeholder "요약 없음 — 본문 부족"', () => {
    const payload = composeDigest(
      fixture(),
      'user@example.com',
      'user@example.com',
      fixedDate,
    );
    const placeholderCount = (payload.html.match(/요약 없음 — 본문 부족/g) ?? [])
      .length;
    // Fixture has two null-summary items (summaryModel 'failed' + 'skipped');
    // both must render the placeholder.
    expect(placeholderCount).toBe(2);
    // The old English-ish '(요약 실패 — 원문 확인)' must NOT appear anywhere.
    expect(payload.html).not.toContain('(요약 실패 — 원문 확인)');
  });

  it('HTML snapshot is stable', () => {
    const payload = composeDigest(
      fixture(),
      'user@example.com',
      'user@example.com',
      fixedDate,
    );
    expect(payload.html).toMatchSnapshot();
  });

  it('excludes firms with zero summarized items from subject count', () => {
    const input: FirmResult[] = [
      { firm: cooley, raw: [], new: [], summarized: [], durationMs: 0 },
      ...fixture(),
    ];
    const payload = composeDigest(input, 'u@e.com', 'u@e.com', fixedDate);
    expect(payload.subject).toContain('(1 firms,'); // not 2
  });

  it('passes a list of recipients through to payload.to unchanged', () => {
    const recipients = ['primary@example.com', 'cc@example.com'];
    const payload = composeDigest(fixture(), recipients, recipients[0], fixedDate);
    expect(payload.to).toEqual(recipients);
    expect(payload.from).toBe('primary@example.com');
  });
});
