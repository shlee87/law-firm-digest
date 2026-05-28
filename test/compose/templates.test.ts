// Unit tests for renderCuratedTopicsFooter (quick task 260523-oi6).
//
// Locked vocabulary (constraint):
//   vc_securities → VC·증권
//   fair_trade    → 공정거래
//   privacy       → 개인정보
//   labor         → 노동법
//   ip            → 지식재산권
//
// Empty TopicConfig ({}) renders '' (no footer). Unmapped keys pass through
// as-is (snake_case) so adding a YAML key never crashes the email.

import { describe, it, expect } from 'vitest';
import { renderCuratedTopicsFooter, renderHtml } from '../../src/compose/templates.js';
import type { FirmConfig, FirmResult } from '../../src/types.js';

describe('renderCuratedTopicsFooter (quick 260523-oi6)', () => {
  it('renders all 5 Korean labels joined by ", " ending with "."', () => {
    const html = renderCuratedTopicsFooter({
      vc_securities: ['x'],
      fair_trade: ['y'],
      privacy: ['z'],
      labor: ['a'],
      ip: ['b'],
    });
    expect(html).toContain(
      '현재 이 다이제스트는 다음 분야를 큐레이션합니다: VC·증권, 공정거래, 개인정보, 노동법, 지식재산권.',
    );
  });

  it('empty TopicConfig returns empty string (clean-run invisible posture)', () => {
    expect(renderCuratedTopicsFooter({})).toBe('');
  });

  it('unknown key passes through verbatim (snake_case visible, no crash)', () => {
    const html = renderCuratedTopicsFooter({
      vc_securities: ['x'],
      future_topic: ['y'],
    });
    expect(html).toContain('VC·증권');
    expect(html).toContain('future_topic');
  });

  it('iteration order matches Object.keys insertion order (YAML order preserved)', () => {
    const html = renderCuratedTopicsFooter({
      ip: ['a'],
      vc_securities: ['b'],
    });
    expect(html.indexOf('지식재산권')).toBeLessThan(html.indexOf('VC·증권'));
  });

  it('empty keyword list does NOT exclude the key (presence is what counts)', () => {
    expect(renderCuratedTopicsFooter({ vc_securities: [] })).toContain('VC·증권');
  });

  it('XSS defense: hostile key name is escaped (no raw <script> in output)', () => {
    const html = renderCuratedTopicsFooter({ '<script>alert(1)</script>': [] });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 17 / FAIL-UX-01 regression — verifies that a Gemini-failed item
// (a) does NOT duplicate the title in the body paragraph, and (b) does NOT
// leak any raw error JSON / quota / retryDelay / RESOURCE_EXHAUSTED text to
// recipient HTML. Driver fixture mirrors the 2026-05-27 production failure
// (GHA run 26512695491, Latham EU ETS card) — title-verbatim summary_ko
// (gemini.ts catch-block fallback) + a quota-exhaustion summaryError.
// ─────────────────────────────────────────────────────────────────────────

const lathamFirm: FirmConfig = {
  id: 'latham',
  name: 'Latham & Watkins',
  language: 'en',
  type: 'rss',
  url: 'https://www.lathamandwatkins.com/feed',
  timezone: 'America/Los_Angeles',
  enabled: true,
  timeout_ms: 20000,
};

const failedTitle =
  'EU ETS: European Commission Announces Additional Flexibilities, Including Updated Benchmarks';

function failedFixture(): FirmResult[] {
  return [
    {
      firm: lathamFirm,
      raw: [],
      new: [],
      summarized: [
        {
          firmId: 'latham',
          title: failedTitle,
          url: 'https://www.lathamandwatkins.com/insights/example',
          language: 'en',
          isNew: true,
          // gemini.ts catch-block fallback: summary_ko = item.title
          summary_ko: failedTitle,
          summaryConfidence: 'low',
          summaryModel: 'failed',
          // Real-shape 429 error body excerpt (sanitized) — drives deny-list
          // regex assertions below.
          summaryError:
            '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-2.5-flash"},"quotaValue":"5"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"39.347610487s"}]}}',
        },
      ],
      durationMs: 0,
    },
  ];
}

describe('renderHtml — failed-render regression (FAIL-UX-01)', () => {
  it('failed item does not duplicate title in body paragraph', () => {
    const html = renderHtml(failedFixture(), '2026-05-27');
    const occurrences = html.split(failedTitle).length - 1;
    expect(occurrences).toBe(1);
  });

  it('failed item does not leak raw error JSON, quota, retryDelay, or RESOURCE_EXHAUSTED patterns to recipient HTML', () => {
    const html = renderHtml(failedFixture(), '2026-05-27');
    const denyPatterns: RegExp[] = [
      /"code":\s*\d+/,
      /&quot;code&quot;:/,
      /"error"\s*:\s*\{/,
      /&quot;error&quot;/,
      /RESOURCE_EXHAUSTED/,
      /exceeded your current quota/,
      /retryDelay/,
      /generativelanguage\.googleapis/,
    ];
    for (const re of denyPatterns) {
      expect(
        html,
        `pattern ${re} should not appear in recipient HTML`,
      ).not.toMatch(re);
    }
  });

  it('failed item renders the user-friendly "⚠ 요약 일시 불가" tag in monospace muted style', () => {
    const html = renderHtml(failedFixture(), '2026-05-27');
    expect(html).toContain('⚠ 요약 일시 불가');
    // The tag block uses FONT_MONO and COLOR.muted — assert both tokens appear
    // in the immediate neighborhood of the tag text (within ±300 chars).
    const tagBlockStart = html.indexOf('⚠ 요약 일시 불가');
    const tagBlockSlice = html.substring(Math.max(0, tagBlockStart - 300), tagBlockStart + 50);
    expect(tagBlockSlice).toContain('JetBrains Mono');
    expect(tagBlockSlice).toContain('#6B6A66');
  });
});
