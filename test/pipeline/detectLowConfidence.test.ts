// Phase 10 D-04 — boundary tests for detectLowConfidence pure detector.
// Mirrors test/pipeline/clusterDetection.test.ts fixture-factory pattern.

import { describe, it, expect } from 'vitest';
import { detectLowConfidence } from '../../src/pipeline/detectLowConfidence.js';
import type { FirmResult, SummarizedItem, FirmConfig } from '../../src/types.js';

function makeItem(
  firmId: string,
  url: string,
  title: string,
  confidence: 'high' | 'medium' | 'low',
  extras: Partial<SummarizedItem> = {},
): SummarizedItem {
  return {
    firmId,
    title,
    url,
    language: 'ko',
    isNew: true,
    summary_ko: 'some summary',
    summaryConfidence: confidence,
    summaryModel: 'gemini-2.5-flash',
    ...extras,
  };
}

const testFirmConfig = (id: string, name: string): FirmConfig => ({
  id,
  name,
  enabled: true,
  type: 'rss',
  url: 'https://example.com/feed',
  language: 'ko',
  timezone: 'Asia/Seoul',
} as FirmConfig);

type FirmError = { stage: 'fetch' | 'parse' | 'dedup' | 'summarize'; message: string };

function makeFirm(firmId: string, items: SummarizedItem[], error?: FirmError): FirmResult {
  return {
    firm: testFirmConfig(firmId, firmId),
    raw: [],
    new: [],
    summarized: items,
    durationMs: 100,
    error,
  };
}

describe('detectLowConfidence — Phase 10 D-04', () => {
  it('N=2, 2/2 low → NO marker (below MIN_TOTAL_FLOOR)', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'low'),
        makeItem('cooley', 'u2', 'b', 'low'),
      ]),
    ];
    expect(detectLowConfidence(firms)).toEqual([]);
  });

  it('N=3, 1/3 low (33%) → NO marker', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'high'),
        makeItem('cooley', 'u2', 'b', 'high'),
        makeItem('cooley', 'u3', 'c', 'low'),
      ]),
    ];
    expect(detectLowConfidence(firms)).toEqual([]);
  });

  it('N=3, 2/3 low (66%) → marker fires with lowCount=2 totalCount=3', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'high'),
        makeItem('cooley', 'u2', 'b', 'low'),
        makeItem('cooley', 'u3', 'c', 'low'),
      ]),
    ];
    const markers = detectLowConfidence(firms);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toEqual({
      kind: 'low-confidence',
      firmId: 'cooley',
      firmName: 'cooley',
      lowCount: 2,
      totalCount: 3,
    });
  });

  it('N=3, 3/3 low (100%) → marker fires', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'low'),
        makeItem('cooley', 'u2', 'b', 'low'),
        makeItem('cooley', 'u3', 'c', 'low'),
      ]),
    ];
    const markers = detectLowConfidence(firms);
    expect(markers).toHaveLength(1);
    expect(markers[0].lowCount).toBe(3);
    expect(markers[0].totalCount).toBe(3);
  });

  it('N=6, 3/6 low (exactly 50%, inclusive threshold) → marker fires', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'high'),
        makeItem('cooley', 'u2', 'b', 'high'),
        makeItem('cooley', 'u3', 'c', 'high'),
        makeItem('cooley', 'u4', 'd', 'low'),
        makeItem('cooley', 'u5', 'e', 'low'),
        makeItem('cooley', 'u6', 'f', 'low'),
      ]),
    ];
    const markers = detectLowConfidence(firms);
    expect(markers).toHaveLength(1);
    expect(markers[0].lowCount).toBe(3);
    expect(markers[0].totalCount).toBe(6);
  });

  it('N=5, 2/5 low (40%) → NO marker', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'high'),
        makeItem('cooley', 'u2', 'b', 'high'),
        makeItem('cooley', 'u3', 'c', 'high'),
        makeItem('cooley', 'u4', 'd', 'low'),
        makeItem('cooley', 'u5', 'e', 'low'),
      ]),
    ];
    expect(detectLowConfidence(firms)).toEqual([]);
  });

  it('errored firm → skipped (no marker even if summarized would cross threshold)', () => {
    const firms = [
      makeFirm(
        'cooley',
        [
          makeItem('cooley', 'u1', 'a', 'low'),
          makeItem('cooley', 'u2', 'b', 'low'),
          makeItem('cooley', 'u3', 'c', 'low'),
        ],
        { stage: 'fetch', message: 'fetch failed' },
      ),
    ];
    expect(detectLowConfidence(firms)).toEqual([]);
  });

  it('empty summarized firm → skipped', () => {
    const firms = [makeFirm('cooley', [])];
    expect(detectLowConfidence(firms)).toEqual([]);
  });

  it('D-04 no suppression: firm with all items cluster-demoted still fires low-confidence marker', () => {
    // Simulate post-cluster output — all items have confidence='low' because
    // detectHallucinationClusters demoted them.
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'low', { isClusterMember: true }),
        makeItem('cooley', 'u2', 'b', 'low', { isClusterMember: true }),
        makeItem('cooley', 'u3', 'c', 'low', { isClusterMember: true }),
        makeItem('cooley', 'u4', 'd', 'low', { isClusterMember: true }),
        makeItem('cooley', 'u5', 'e', 'low', { isClusterMember: true }),
      ]),
    ];
    const markers = detectLowConfidence(firms);
    expect(markers).toHaveLength(1);
    expect(markers[0].lowCount).toBe(5);
    expect(markers[0].totalCount).toBe(5);
  });

  it('multiple firms: only ones crossing threshold emit markers', () => {
    const firms = [
      makeFirm('firm-a', [
        // 3/3 low — fires
        makeItem('firm-a', 'u1', 'a', 'low'),
        makeItem('firm-a', 'u2', 'b', 'low'),
        makeItem('firm-a', 'u3', 'c', 'low'),
      ]),
      makeFirm('firm-b', [
        // 0/3 low — does NOT fire
        makeItem('firm-b', 'u1', 'a', 'high'),
        makeItem('firm-b', 'u2', 'b', 'medium'),
        makeItem('firm-b', 'u3', 'c', 'high'),
      ]),
    ];
    const markers = detectLowConfidence(firms);
    expect(markers).toHaveLength(1);
    expect(markers[0].firmId).toBe('firm-a');
  });

  it('pure function: does not mutate input summarized array', () => {
    const firms = [
      makeFirm('cooley', [
        makeItem('cooley', 'u1', 'a', 'low'),
        makeItem('cooley', 'u2', 'b', 'low'),
        makeItem('cooley', 'u3', 'c', 'low'),
      ]),
    ];
    const before = JSON.stringify(firms);
    detectLowConfidence(firms);
    const after = JSON.stringify(firms);
    expect(after).toBe(before);
  });
});
