// TDD test for Phase 8 GUARD-01: SummarizedItem.isClusterMember flag.
// This test verifies the type contract only — runtime assignment of the flag
// lives in Plan 03's detectHallucinationClusters.

import { describe, it, expect } from 'vitest';
import type { SummarizedItem } from '../../src/types.js';

describe('SummarizedItem.isClusterMember (Phase 8 GUARD-01)', () => {
  it('(1) SummarizedItem without isClusterMember is valid (optional field)', () => {
    const item: SummarizedItem = {
      firmId: 'test-firm',
      title: 'Test Title',
      url: 'https://example.com/1',
      language: 'ko',
      isNew: true,
      summary_ko: '테스트 요약',
      summaryConfidence: 'high',
      summaryModel: 'gemini-2.5-flash',
    };
    // If this compiles and runs, the field is correctly optional
    expect(item.isClusterMember).toBeUndefined();
  });

  it('(2) SummarizedItem with isClusterMember: true is valid', () => {
    const item: SummarizedItem = {
      firmId: 'test-firm',
      title: 'Test Title',
      url: 'https://example.com/1',
      language: 'ko',
      isNew: true,
      summary_ko: '테스트 요약',
      summaryConfidence: 'low',
      summaryModel: 'gemini-2.5-flash',
      isClusterMember: true,
    };
    expect(item.isClusterMember).toBe(true);
  });

  it('(3) isClusterMember is exactly the literal true when set', () => {
    // The flag should be `true` not `false` — the type is `true` not `boolean`
    const demoted: SummarizedItem = {
      firmId: 'bkl',
      title: 'BKL Article',
      url: 'https://bkl.co.kr/1',
      language: 'ko',
      isNew: true,
      summary_ko: '법무법인 태평양은...',
      summaryConfidence: 'low',
      summaryModel: 'gemini-2.5-flash',
      isClusterMember: true,
    };
    expect(demoted.isClusterMember).toStrictEqual(true);
  });
});
