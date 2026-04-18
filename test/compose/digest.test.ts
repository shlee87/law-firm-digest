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
      undefined,
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
      undefined,
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
      undefined,
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
      undefined,
      fixedDate,
    );
    expect(payload.html).toMatchSnapshot();
  });

  it('excludes firms with zero summarized items from subject count', () => {
    const input: FirmResult[] = [
      { firm: cooley, raw: [], new: [], summarized: [], durationMs: 0 },
      ...fixture(),
    ];
    const payload = composeDigest(input, 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.subject).toContain('(1 firms,'); // not 2
  });

  it('passes a list of recipients through to payload.to unchanged', () => {
    const recipients = ['primary@example.com', 'cc@example.com'];
    const payload = composeDigest(fixture(), recipients, recipients[0], undefined, fixedDate);
    expect(payload.to).toEqual(recipients);
    expect(payload.from).toBe('primary@example.com');
  });

  // --- Phase 2 EMAIL-05 / D-P2-04 coverage ---

  it('EMAIL-05 — failed-firm footer renders http-{status} classification', () => {
    const results: FirmResult[] = [
      ...fixture(),
      failedFirmResult('RSS fetch clifford-chance: HTTP 503'),
    ];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).toContain('이번 실행에서 수집 실패');
    expect(payload.html).toContain('http-503');
    expect(payload.html).toContain('Clifford Chance');
    expect(payload.html).toContain('(clifford-chance)');
  });

  it('EMAIL-05 — failed firm does NOT appear in the subject count', () => {
    const results: FirmResult[] = [
      ...fixture(),
      failedFirmResult('RSS fetch clifford-chance: HTTP 503'),
    ];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    // One firm in the subject (cooley) + one failed (clifford-chance in footer),
    // so "(1 firms, 3 items)" — NOT "(2 firms, ..." and NOT "(1 firms, 4" either.
    expect(payload.subject).toBe('[법률 다이제스트] 2026-04-17 (1 firms, 3 items)');
  });

  it('EMAIL-05 — robots-blocked classification end-to-end', () => {
    const results: FirmResult[] = [
      ...fixture(),
      failedFirmResult('robots.txt disallows https://example.com/feed'),
    ];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).toContain('robots-blocked');
    expect(payload.html).not.toContain('http-'); // no HTTP code visible
  });

  it('EMAIL-05 — fetch-timeout classification', () => {
    const results: FirmResult[] = [
      ...fixture(),
      failedFirmResult('The operation was aborted due to timeout'),
    ];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).toContain('fetch-timeout');
  });

  it('EMAIL-05 — XSS defense: firm.name with <script> is escaped', () => {
    const hostile: FirmResult = {
      firm: { ...cliffordChance, name: '<script>alert(1)</script>' },
      raw: [],
      new: [],
      summarized: [],
      error: { stage: 'fetch', message: 'HTTP 500' },
      durationMs: 0,
    };
    const payload = composeDigest(
      [...fixture(), hostile],
      'u@e.com',
      'u@e.com',
      undefined,
      fixedDate,
    );
    expect(payload.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(payload.html).not.toContain('<script>alert(1)</script>');
  });

  it('EMAIL-05 — no failed firms → NO footer block rendered (visual no-op on clean runs)', () => {
    const payload = composeDigest(fixture(), 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).not.toContain('이번 실행에서 수집 실패');
    expect(payload.html).toContain('AI 요약 — 원문 확인 필수');
  });

  it('EMAIL-05 — message longer than 140 chars is truncated in footer', () => {
    const longMsg = 'HTTP 503 ' + 'A'.repeat(200);
    const results: FirmResult[] = [...fixture(), failedFirmResult(longMsg)];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    const m = /<li>[^<]*Clifford Chance[^<]*<\/li>/.exec(payload.html);
    expect(m).not.toBeNull();
    const aRun = /A+/.exec(m?.[0] ?? '');
    expect(aRun).not.toBeNull();
    expect(aRun![0].length).toBeLessThanOrEqual(140);
  });

  it('EMAIL-05 — message scrubSecrets: GEMINI_API_KEY replaced with ***REDACTED*** if accidentally echoed', () => {
    const realKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'THIS_IS_A_FAKE_KEY_LONG_ENOUGH_12345';
    try {
      const leak = `config error at THIS_IS_A_FAKE_KEY_LONG_ENOUGH_12345 position`;
      const results: FirmResult[] = [
        ...fixture(),
        failedFirmResult(leak, 'parse'),
      ];
      const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
      expect(payload.html).not.toContain('THIS_IS_A_FAKE_KEY_LONG_ENOUGH_12345');
      expect(payload.html).toContain('***REDACTED***');
    } finally {
      if (realKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = realKey;
    }
  });

  it('EMAIL-05 — snapshot with failed firm included (footer format locked)', () => {
    const results: FirmResult[] = [
      ...fixture(),
      failedFirmResult(
        'RSS fetch clifford-chance: HTTP 503\nUnrelated second line ignored.',
      ),
    ];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).toMatchSnapshot('digest-with-failed-firm');
  });
});

const cliffordChance: FirmConfig = {
  id: 'clifford-chance',
  name: 'Clifford Chance',
  language: 'en',
  type: 'rss',
  url: 'https://www.cliffordchance.com/rss/rss-feed-briefings.html',
  timezone: 'Europe/London',
  enabled: true,
  timeout_ms: 20000,
};

function failedFirmResult(
  message: string,
  stage: 'fetch' | 'parse' | 'dedup' | 'summarize' = 'fetch',
): FirmResult {
  return {
    firm: cliffordChance,
    raw: [],
    new: [],
    summarized: [],
    error: { stage, message },
    durationMs: 0,
  };
}

describe('Phase 3 staleness banner (OPS-04 + OPS-05)', () => {
  const baseFirm: FirmConfig = {
    id: 'cooley', name: 'Cooley', language: 'en', type: 'rss',
    url: 'https://cooleygo.com/feed/', timezone: 'America/Los_Angeles', enabled: true,
  };
  const baseResult: FirmResult = {
    firm: baseFirm,
    raw: [], new: [],
    summarized: [
      {
        firmId: 'cooley', title: 'Test', url: 'https://cooleygo.com/x',
        language: 'en', isNew: true,
        summary_ko: '요약', summaryConfidence: 'high', summaryModel: 'gemini-2.5-flash',
      },
    ],
    durationMs: 100,
  };
  const NOW = new Date('2026-04-18T00:00:00.000Z');

  it('does not render a banner when warnings is undefined (Phase 1 backward compat)', () => {
    const payload = composeDigest([baseResult], 'a@b.com', 'a@b.com', undefined, NOW);
    expect(payload.html).not.toContain('⚠');
    expect(payload.html).not.toContain('background:#fff8e1');
  });

  it('does not render a banner when warnings has empty staleFirms and null lastRunStale', () => {
    const payload = composeDigest(
      [baseResult], 'a@b.com', 'a@b.com',
      { staleFirms: [], lastRunStale: null }, NOW,
    );
    expect(payload.html).not.toContain('⚠');
  });

  it('renders a single block with the stale-firm warning listing firm display names', () => {
    const payload = composeDigest(
      [baseResult], 'a@b.com', 'a@b.com',
      { staleFirms: ['김앤장', '태평양'], lastRunStale: null }, NOW,
    );
    expect(payload.html).toContain('⚠ 30일 이상 새 글 없음: 김앤장, 태평양');
    const h1Idx = payload.html.indexOf('</h1>');
    const bannerIdx = payload.html.indexOf('⚠');
    const firstSectionIdx = payload.html.indexOf('<section>');
    expect(h1Idx).toBeLessThan(bannerIdx);
    expect(bannerIdx).toBeLessThan(firstSectionIdx);
  });

  it('renders the last-run staleness warning with hoursAgo', () => {
    const payload = composeDigest(
      [baseResult], 'a@b.com', 'a@b.com',
      { staleFirms: [], lastRunStale: { hoursAgo: 48 } }, NOW,
    );
    expect(payload.html).toContain('⚠ 이전 실행 누락 — 48시간 전 마지막 성공 실행');
  });

  it('renders BOTH warnings in a single consolidated block (D-04)', () => {
    const payload = composeDigest(
      [baseResult], 'a@b.com', 'a@b.com',
      { staleFirms: ['A'], lastRunStale: { hoursAgo: 72 } }, NOW,
    );
    const bannerMatches = payload.html.match(/background:#fff8e1/g);
    expect(bannerMatches?.length).toBe(1);
    expect(payload.html).toContain('⚠ 30일 이상 새 글 없음: A');
    expect(payload.html).toContain('⚠ 이전 실행 누락 — 72시간 전 마지막 성공 실행');
  });

  it('escapes firm names defensively (XSS posture mirrors renderFailedFirmsFooter)', () => {
    const payload = composeDigest(
      [baseResult], 'a@b.com', 'a@b.com',
      { staleFirms: ['<script>alert(1)</script>'], lastRunStale: null }, NOW,
    );
    expect(payload.html).not.toContain('<script>alert(1)</script>');
    expect(payload.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('Phase 3 classifyError export surface', () => {
  it('classifyError is importable from src/compose/templates.ts', async () => {
    // Dynamic import keeps the test decoupled if the export site ever moves.
    const mod = await import('../../src/compose/templates.js');
    expect(typeof mod.classifyError).toBe('function');
  });

  it('classifyError returns the same taxonomy strings as before the export promotion', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    expect(classifyError('robots.txt disallows /foo', 'fetch')).toBe('robots-blocked');
    expect(classifyError('request timeout', 'fetch')).toBe('fetch-timeout');
    expect(classifyError('HTTP 503 Service Unavailable', 'fetch')).toBe('http-503');
    expect(classifyError('ENOTFOUND example.com', 'fetch')).toBe('dns-fail');
    expect(classifyError('selectors not found', 'parse')).toBe('selector-miss');
    expect(classifyError('parse error on <html>', 'parse')).toBe('parse-error');
    expect(classifyError('mystery', 'fetch')).toBe('unknown');
  });
});
