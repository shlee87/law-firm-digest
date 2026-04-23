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
          summary_ko: 'Second <Article> with HTML-ish Title',
          summaryConfidence: 'low',
          summaryModel: 'failed',
          summaryError: 'quota exceeded',
        },
        {
          // B3 path: item with no description; Plan 01 Layer 1 short-circuit.
          firmId: 'cooley',
          title: 'Title-only Article (B3 skipped)',
          url: 'https://cooley.com/news/insight/2026/2026-04-05-privacy',
          language: 'en',
          isNew: true,
          summary_ko: 'Title-only Article (B3 skipped)',
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
    expect(payload.html).toContain('Daily Legal Digest');
    expect(payload.html).not.toContain('<script');
  });

  it('Phase 8 D-04: null-branch placeholder "요약 없음 — 본문 부족" is REMOVED from all rendering paths', () => {
    const payload = composeDigest(
      fixture(),
      'user@example.com',
      'user@example.com',
      undefined,
      fixedDate,
    );
    expect(payload.html).not.toContain('요약 없음 — 본문 부족');
  });

  it('Phase 8 D-13: B3 title-verbatim singleton (summaryModel==="skipped") shows ⚠ 본문 없음 badge', () => {
    const payload = composeDigest(
      fixture(),
      'user@example.com',
      'user@example.com',
      undefined,
      fixedDate,
    );
    // Fixture third item is summaryModel:'failed' (title-verbatim from catch block)
    // Fixture fourth item is summaryModel:'skipped' (title-verbatim from Layer 1)
    // Only the 'skipped' item triggers D-13 badge.
    expect(payload.html).toContain('⚠ 본문 없음');
    // The title appears in the summary slot for the skipped item.
    expect(payload.html).toContain('Title-only Article (B3 skipped)');
    // The 'failed' item gets its own badge (⚠ 요약 실패).
    expect(payload.html).toContain('⚠ 요약 실패');
    // Confirm each badge appears exactly once.
    const skippedBadge = (payload.html.match(/⚠ 본문 없음/g) ?? []).length;
    expect(skippedBadge).toBe(1);
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
    expect(payload.html).toContain('수집 실패 · Fetch failed');
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
    expect(payload.html).not.toContain('수집 실패 · Fetch failed');
    expect(payload.html).toContain('원문의 저작권은 각 로펌에 있으며');
  });

  it('EMAIL-05 — message longer than 140 chars is truncated in footer', () => {
    const longMsg = 'HTTP 503 ' + 'A'.repeat(200);
    const results: FirmResult[] = [...fixture(), failedFirmResult(longMsg)];
    const payload = composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate);
    const m = /Clifford Chance/.exec(payload.html);
    expect(m).not.toBeNull();
    const aRun = /A+/.exec(payload.html.slice(m!.index));
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

  // --- Phase 8 GUARD-04 coverage: cluster fold UI + data-quality footer ---

  it('Phase 8 D-11/D-12: cluster-demoted items (isClusterMember=true) fold under 품질 의심 block, summaries hidden', () => {
    const clusteredFirm: FirmResult = {
      firm: cooley,
      raw: [],
      new: [],
      summarized: [
        {
          firmId: 'cooley', title: 'Cluster Item 1',
          url: 'https://cooley.com/a', language: 'en', isNew: true,
          summary_ko: '법무법인 태평양은 1980년에 설립된 한국의 종합 법률...',
          summaryConfidence: 'low', summaryModel: 'gemini-2.5-flash',
          isClusterMember: true,
        },
        {
          firmId: 'cooley', title: 'Cluster Item 2',
          url: 'https://cooley.com/b', language: 'en', isNew: true,
          summary_ko: '법무법인 태평양은 1980년에 설립된 한국의 종합 법률...',
          summaryConfidence: 'low', summaryModel: 'gemini-2.5-flash',
          isClusterMember: true,
        },
        {
          firmId: 'cooley', title: 'Cluster Item 3',
          url: 'https://cooley.com/c', language: 'en', isNew: true,
          summary_ko: '법무법인 태평양은 1980년에 설립된 한국의 종합 법률...',
          summaryConfidence: 'low', summaryModel: 'gemini-2.5-flash',
          isClusterMember: true,
        },
      ],
      durationMs: 100,
    };
    const payload = composeDigest([clusteredFirm], 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).toContain('⚠ 품질 의심 — 요약 숨김');
    // All three titles appear (inside the fold <li>).
    expect(payload.html).toContain('Cluster Item 1');
    expect(payload.html).toContain('Cluster Item 2');
    expect(payload.html).toContain('Cluster Item 3');
    // The hallucinated summary text does NOT appear.
    expect(payload.html).not.toContain('법무법인 태평양은 1980년에 설립된 한국의 종합 법률...');
    expect(payload.html).toContain('원문 보기');
  });

  it('Phase 8 D-14: renderDataQualityFooter emits ⚠ 데이터 품질 경고 footer with HALLUCINATION_CLUSTER_DETECTED per affected firm', () => {
    const clusteredFirm: FirmResult = {
      firm: cooley, raw: [], new: [],
      summarized: [1, 2, 3, 4, 5].map((i) => ({
        firmId: 'cooley', title: `Cluster Item ${i}`,
        url: `https://cooley.com/${i}`, language: 'en' as const, isNew: true as const,
        summary_ko: '법무법인 태평양은 1980년에 설립된...',
        summaryConfidence: 'low' as const, summaryModel: 'gemini-2.5-flash',
        isClusterMember: true as const,
      })),
      durationMs: 100,
    };
    // WR-01: markers are now threaded explicitly through composeDigest (Option A).
    const markers = [
      {
        kind: 'cluster' as const,
        firmId: 'cooley',
        firmName: 'Cooley',
        count: 5,
        signature: '법무법인 태평양은 1980년에 설립된...',
      },
    ];
    const payload = composeDigest(
      [clusteredFirm],
      'u@e.com',
      'u@e.com',
      undefined,
      fixedDate,
      markers,
    );
    expect(payload.html).toContain('⚠ 데이터 품질 경고 · Quality flags');
    expect(payload.html).toContain('HALLUCINATION_CLUSTER_DETECTED (5 items, 요약 숨김)');
    // Footer ordering: data-quality → footer disclaimer.
    const disclaimerIdx = payload.html.indexOf('원문의 저작권은 각 로펌에 있으며');
    const dqIdx = payload.html.indexOf('데이터 품질 경고');
    expect(dqIdx).toBeLessThan(disclaimerIdx);
    expect(dqIdx).toBeGreaterThan(0);
  });

  it('Phase 8 D-14: no clusters → data-quality footer NOT rendered (clean-run invisible posture)', () => {
    const payload = composeDigest(fixture(), 'u@e.com', 'u@e.com', undefined, fixedDate);
    expect(payload.html).not.toContain('데이터 품질 경고');
    expect(payload.html).not.toContain('HALLUCINATION_CLUSTER_DETECTED');
  });

  it('Phase 8 D-14 XSS: marker firmName with <script> is escaped', () => {
    const hostileFirm: FirmConfig = { ...cooley, name: '<script>alert(1)</script>' };
    const clusteredFirm: FirmResult = {
      firm: hostileFirm, raw: [], new: [],
      summarized: [1, 2, 3].map((i) => ({
        firmId: 'cooley', title: `Item ${i}`,
        url: `https://cooley.com/${i}`, language: 'en' as const, isNew: true as const,
        summary_ko: '동일한 prefix 50자...',
        summaryConfidence: 'low' as const, summaryModel: 'gemini-2.5-flash',
        isClusterMember: true as const,
      })),
      durationMs: 100,
    };
    // WR-01: markers are now threaded explicitly through composeDigest (Option A).
    const markers = [
      {
        kind: 'cluster' as const,
        firmId: 'cooley',
        firmName: '<script>alert(1)</script>',
        count: 3,
        signature: '동일한 prefix 50자...',
      },
    ];
    const payload = composeDigest(
      [clusteredFirm],
      'u@e.com',
      'u@e.com',
      undefined,
      fixedDate,
      markers,
    );
    expect(payload.html).not.toContain('<script>alert(1)</script>');
    expect(payload.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('Phase 10 DQOBS-02: low-confidence marker renders in Data Quality footer', () => {
    const lowConfMarkers = [
      {
        kind: 'low-confidence' as const,
        firmId: 'cooley',
        firmName: 'Cooley',
        lowCount: 4,
        totalCount: 6,
      },
    ];
    const payload = composeDigest(
      fixture(),
      'u@e.com',
      'u@e.com',
      undefined,
      fixedDate,
      lowConfMarkers,
    );
    expect(payload.html).toContain('⚠ 데이터 품질 경고 · Quality flags');
    expect(payload.html).toContain('4/6 items 품질 의심 (confidence=low 과반)');
    expect(payload.html).toContain('Cooley');
    expect(payload.html).toContain('cooley');
  });

  it('Phase 10 DQOBS-02: mixed markers — both cluster and low-confidence render in footer', () => {
    const mixedMarkers = [
      {
        kind: 'cluster' as const,
        firmId: 'bkl',
        firmName: '태평양',
        count: 3,
        signature: 'sig',
      },
      {
        kind: 'low-confidence' as const,
        firmId: 'cooley',
        firmName: 'Cooley',
        lowCount: 4,
        totalCount: 6,
      },
    ];
    const payload = composeDigest(
      fixture(),
      'u@e.com',
      'u@e.com',
      undefined,
      fixedDate,
      mixedMarkers,
    );
    expect(payload.html).toContain('HALLUCINATION_CLUSTER_DETECTED (3 items, 요약 숨김)');
    expect(payload.html).toContain('4/6 items 품질 의심 (confidence=low 과반)');
  });

  it('Phase 10 D-15: empty markers → footer block omitted', () => {
    const payload = composeDigest(
      fixture(),
      'u@e.com',
      'u@e.com',
      undefined,
      fixedDate,
      [],
    );
    expect(payload.html).not.toContain('⚠ 데이터 품질 경고');
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
    const mastheadIdx = payload.html.indexOf('Daily Legal Digest');
    const bannerIdx = payload.html.indexOf('⚠');
    const firstSectionIdx = payload.html.indexOf('padding:28px');
    expect(mastheadIdx).toBeLessThan(bannerIdx);
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
    const bannerMatches = payload.html.match(/background:#fff8e1/gi);
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

describe('classifyError (Phase 4 additions)', () => {
  it('returns "playwright-timeout" for the jsRender timeout message shape', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    const msg = 'scrapeJsRender lee-ko: playwright-timeout waiting for ul#contentsList > li';
    expect(classifyError(msg, 'fetch')).toBe('playwright-timeout');
  });

  it('returns "browser-launch-fail" for chromium executable not found', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    const msg =
      'scrapeJsRender lee-ko: browser-launch-fail chromium executable not found at /home/runner/.cache/ms-playwright/chromium';
    expect(classifyError(msg, 'fetch')).toBe('browser-launch-fail');
  });

  it('returns "selector-miss" for the zero-items-extracted jsRender shape', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    const msg =
      'scrapeJsRender lee-ko: zero items extracted (selector-miss) — wait_for matched but list_item ul#contentsList > li returned nothing';
    expect(classifyError(msg, 'fetch')).toBe('selector-miss');
  });

  it('still classifies generic HTML-tier "selectors not found" as selector-miss (Phase 2 regression)', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    expect(classifyError('selectors not found on example.com', 'fetch')).toBe('selector-miss');
  });

  it('does NOT mis-classify Playwright timeout as generic fetch-timeout (ordering regression)', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    const msg = 'scrapeJsRender lee-ko: playwright-timeout waiting for ul#contentsList > li';
    // Generic fetch-timeout regex would match "timeout" — verify Phase 4
    // specific check fires FIRST and returns the specific class.
    expect(classifyError(msg, 'fetch')).not.toBe('fetch-timeout');
    expect(classifyError(msg, 'fetch')).toBe('playwright-timeout');
  });
});

describe('classifyError (debug session shin-kim-fetch-failed 2026-04-20)', () => {
  it('returns "tls-cert-fail" for the scrapeHtml TLS re-wrap shape', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    expect(
      classifyError('scrapeHtml shin-kim: TLS UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'fetch'),
    ).toBe('tls-cert-fail');
  });

  it('returns "tls-cert-fail" for CERT_HAS_EXPIRED', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    expect(
      classifyError('scrapeHtml example: TLS CERT_HAS_EXPIRED', 'fetch'),
    ).toBe('tls-cert-fail');
  });

  it('returns "tls-cert-fail" for ERR_TLS_CERT_ALTNAME_INVALID (kim-chang CN-mismatch shape)', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    expect(
      classifyError('scrapeHtml kim-chang: TLS ERR_TLS_CERT_ALTNAME_INVALID', 'fetch'),
    ).toBe('tls-cert-fail');
  });

  it('returns "tls-cert-fail" for SELF_SIGNED_CERT_IN_CHAIN', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    expect(
      classifyError('scrapeHtml foo: TLS SELF_SIGNED_CERT_IN_CHAIN', 'fetch'),
    ).toBe('tls-cert-fail');
  });

  it('does NOT mis-classify plain "fetch failed" as tls-cert-fail (regression guard)', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    // The undici TypeError.message without the html.ts cause-hoist stays "unknown".
    expect(classifyError('fetch failed', 'fetch')).toBe('unknown');
  });

  it('does NOT mis-classify an HTTP error as tls-cert-fail (ordering check)', async () => {
    const { classifyError } = await import('../../src/compose/templates.js');
    // A firm-name like "TLS Services" in a log path must not confuse the regex —
    // anchor "\bTLS [A-Z_]+" only fires on the post-re-wrap shape.
    expect(classifyError('scrapeHtml foo: HTTP 503', 'fetch')).toBe('http-503');
  });
});
