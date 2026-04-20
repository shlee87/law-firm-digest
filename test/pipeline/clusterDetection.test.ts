// Phase 8 GUARD-03 unit tests — pure-function coverage of
// detectHallucinationClusters. Style matches test/audit/signals.test.ts:
// direct import, synthetic Korean fixtures, no SDK mocks.

import { describe, it, expect, vi } from 'vitest';
import {
  detectHallucinationClusters,
  type ClusterMarker,
} from '../../src/pipeline/detectClusters.js';
import type { FirmConfig, FirmResult, SummarizedItem } from '../../src/types.js';

const bklConfig: FirmConfig = {
  id: 'bkl',
  name: '법무법인 태평양',
  language: 'ko',
  type: 'html',
  url: 'https://www.bkl.co.kr/insights',
  timezone: 'Asia/Seoul',
  enabled: true,
};

const kimchangConfig: FirmConfig = {
  id: 'kim-chang',
  name: '김앤장 법률사무소',
  language: 'ko',
  type: 'html',
  url: 'https://www.kimchang.com/insights',
  timezone: 'Asia/Seoul',
  enabled: true,
};

function makeItem(
  firmId: string,
  url: string,
  title: string,
  summary: string | null,
  extras: Partial<SummarizedItem> = {},
): SummarizedItem {
  return {
    firmId,
    title,
    url,
    language: 'ko',
    isNew: true,
    summary_ko: summary,
    summaryConfidence: 'high',
    summaryModel: 'gemini-2.5-flash',
    ...extras,
  };
}

function makeFirm(firm: FirmConfig, items: SummarizedItem[]): FirmResult {
  return {
    firm,
    raw: [],
    new: [],
    summarized: items,
    durationMs: 100,
  };
}

// Hallucination-prefix fixture: first 50 chars (UTF-16 code units) are
// identical across all items. This mirrors the v1.0 UAT bkl incident pattern.
//
// Strategy: hallucinatedPrefix50 is exactly 50 BMP code units. Each full
// string is built as hallucinatedPrefix50 + divergingSuffix, so .slice(0,50)
// of any full string returns exactly hallucinatedPrefix50.
//
// Verified: '법무법인 태평양은 1980년에 설립된 한국의 종합 법률 서비스 회사이며 기업 자문을 제공합'.length === 50
// (all BMP Hangul syllable blocks + ASCII digits/spaces — no surrogates)
const hallucinatedPrefix50 =
  '법무법인 태평양은 1980년에 설립된 한국의 종합 법률 서비스 회사이며 기업 자문을 제공합';
// Each item starts with hallucinatedPrefix50 (50 chars) and diverges at char 51+.
const hallucinated1 = hallucinatedPrefix50 + '니다. 이곳은 기업 자문 전문 로펌입니다.';
const hallucinated2 = hallucinatedPrefix50 + '니다. M&A 업무를 중점적으로 수행합니다.';
const hallucinated3 = hallucinatedPrefix50 + '니다. 금융 및 자본시장 자문에 특화되어 있습니다.';
const hallucinated4 = hallucinatedPrefix50 + '니다. 소송 및 분쟁 자문을 담당합니다.';
const hallucinated5 = hallucinatedPrefix50 + '니다. 노동법 자문에 강점이 있습니다.';

describe('detectHallucinationClusters', () => {
  it('1: 3 items with identical first-50-char prefix → all demoted + 1 marker + 1 stderr emission', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Item C', hallucinated3),
      ]),
    ];
    const { firms, markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(1);
    expect(markers[0].firmId).toBe('bkl');
    expect(markers[0].firmName).toBe('법무법인 태평양');
    expect(markers[0].count).toBe(3);
    expect(markers[0].signature).toBe(hallucinatedPrefix50);
    // All 3 items demoted.
    for (const it of firms[0].summarized) {
      expect(it.summaryConfidence).toBe('low');
      expect(it.isClusterMember).toBe(true);
    }
    // Exactly one stderr emission.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^HALLUCINATION_CLUSTER_DETECTED: firm=bkl count=3 signature=".+"$/),
    );
    spy.mockRestore();
  });

  it('2: 2 items with identical prefix → NOT triggered (threshold is 3); no markers, no demotion', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
      ]),
    ];
    const { firms, markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(0);
    for (const it of firms[0].summarized) {
      expect(it.summaryConfidence).toBe('high'); // unchanged
      expect(it.isClusterMember).toBeUndefined();
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('3: signature is exactly first 50 chars — char 51+ diverging still clusters', () => {
    // hallucinated1..3 all share the first 50 chars; they diverge at char 51+.
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Item C', hallucinated3),
      ]),
    ];
    const { markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(1);
    expect(markers[0].signature.length).toBeLessThanOrEqual(50);
    // UTF-16 code unit exactness: .slice(0, 50) returns up to 50 code units.
    expect(markers[0].signature).toBe(hallucinatedPrefix50.slice(0, 50));
  });

  it('4: same prefix across different firms → NOT clustered (same-firm scope only, D-07)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
      ]),
      makeFirm(kimchangConfig, [
        makeItem('kim-chang', 'https://kimchang.com/a', 'Item A', hallucinated3),
      ]),
    ];
    // Total 3 items share the 50-char prefix, but split 2/1 across firms.
    // Neither firm alone hits threshold 3.
    const { markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('5: summary_ko === null items excluded from signature calculation', () => {
    // 2 items with hallucinated prefix + 1 null-summary item = still only
    // 2 items in the cluster group → NOT triggered.
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Item C', null, { summaryModel: 'cli-skipped' }),
      ]),
    ];
    const { markers, firms } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(0);
    // Null item should not be marked as cluster member.
    const nullItem = firms[0].summarized.find((it) => it.summary_ko === null);
    expect(nullItem?.isClusterMember).toBeUndefined();
  });

  it('6: firms with error → detection skips them entirely', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const erroredFirm: FirmResult = {
      firm: bklConfig,
      raw: [],
      new: [],
      summarized: [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Item C', hallucinated3),
      ],
      error: { stage: 'fetch', message: 'ECONNREFUSED' },
      durationMs: 0,
    };
    const { firms, markers } = detectHallucinationClusters([erroredFirm]);
    expect(markers).toHaveLength(0);
    // No demotion.
    for (const it of firms[0].summarized) {
      expect(it.isClusterMember).toBeUndefined();
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('7: empty summarized[] — no-op, no markers, no stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = [makeFirm(bklConfig, [])];
    const { firms, markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(0);
    expect(firms).toHaveLength(1);
    expect(firms[0].summarized).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('8: IMMUTABLE — input FirmResult[] elements are not mutated', () => {
    const originalItem = makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1);
    const input = [
      makeFirm(bklConfig, [
        originalItem,
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Item C', hallucinated3),
      ]),
    ];
    // Snapshot original field values before detector runs.
    const snapshotConfidence = originalItem.summaryConfidence;
    const snapshotIsClusterMember = originalItem.isClusterMember;

    detectHallucinationClusters(input);

    // Input item MUST be unchanged (not mutated in place).
    expect(originalItem.summaryConfidence).toBe(snapshotConfidence);
    expect(originalItem.isClusterMember).toBe(snapshotIsClusterMember);
  });

  it('9: D-16 marker exact format — firm=<id> count=<n> signature="<sig>"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Item A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Item B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Item C', hallucinated3),
      ]),
    ];
    detectHallucinationClusters(input);
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0][0];
    expect(call).toMatch(/^HALLUCINATION_CLUSTER_DETECTED: firm=bkl count=3 signature="/);
    // signature field contains the 50-char Korean prefix (D-16: signature is the prefix, not firmName)
    expect(call).toContain('법무법인 태평양은 1980년');
    // Exact regex test.
    expect(call).toMatch(/^HALLUCINATION_CLUSTER_DETECTED: firm=\S+ count=\d+ signature=".+"$/);
    spy.mockRestore();
  });

  it('10: multibyte Korean safety — slice(0, 50) on Hangul strings returns 50 UTF-16 code units (Pitfall 1)', () => {
    // Build two items with identical 50-code-unit Korean prefix.
    // Korean BMP Hangul = 1 UTF-16 code unit per syllable.
    const koreanPrefix = '가'.repeat(50);
    const korean1 = koreanPrefix + '가';
    const korean2 = koreanPrefix + '나';
    const korean3 = koreanPrefix + '다';
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'A', korean1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'B', korean2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'C', korean3),
      ]),
    ];
    const { markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(1);
    expect(markers[0].signature).toBe(koreanPrefix);
    expect(markers[0].signature.length).toBe(50);
  });

  it('11: idempotent — re-running detector on already-clustered output produces same markers and no new stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'C', hallucinated3),
      ]),
    ];
    const first = detectHallucinationClusters(input);
    expect(first.markers).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    // Re-run on the output (already demoted).
    const second = detectHallucinationClusters(first.firms);
    expect(second.markers).toHaveLength(1);
    expect(second.markers[0].count).toBe(3);
    // Two runs → two stderr emissions (cluster still detected each time).
    expect(spy).toHaveBeenCalledTimes(2);
    // Confidence already 'low' on input; stays 'low' (idempotent).
    for (const it of second.firms[0].summarized) {
      expect(it.summaryConfidence).toBe('low');
      expect(it.isClusterMember).toBe(true);
    }
    spy.mockRestore();
  });

  it('12: mixed normal + cluster items in same firm — only cluster members demoted', () => {
    const normalSummary = '이 기사는 2026년 금융 규제 변경안을 상세히 설명합니다.';
    const input = [
      makeFirm(bklConfig, [
        makeItem('bkl', 'https://bkl.co.kr/a', 'Hallucinated A', hallucinated1),
        makeItem('bkl', 'https://bkl.co.kr/b', 'Hallucinated B', hallucinated2),
        makeItem('bkl', 'https://bkl.co.kr/c', 'Hallucinated C', hallucinated3),
        makeItem('bkl', 'https://bkl.co.kr/d', 'Real Article', normalSummary),
      ]),
    ];
    const { firms, markers } = detectHallucinationClusters(input);
    expect(markers).toHaveLength(1);
    expect(markers[0].count).toBe(3);
    // Hallucinated items: demoted.
    const demoted = firms[0].summarized.filter((it) => it.isClusterMember);
    expect(demoted).toHaveLength(3);
    // Real article: untouched.
    const real = firms[0].summarized.find((it) => it.title === 'Real Article');
    expect(real?.isClusterMember).toBeUndefined();
    expect(real?.summaryConfidence).toBe('high');
  });
});
