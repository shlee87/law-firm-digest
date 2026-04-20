// TDD test for Phase 8 GUARD-01 Layer 2: prompt rule + Zod schema relaxation.
// Plan 08-01 Task 2.

import { describe, it, expect } from 'vitest';
import { buildPrompt, summarySchema } from '../../src/summarize/prompt.js';
import { z } from 'zod';
import type { NewItem } from '../../src/types.js';

const krItem: NewItem = {
  firmId: 'shin-kim',
  title: 'KR-TITLE-DO-NOT-LEAK',
  url: 'https://shinkim.com/kor/media/newsletter/1',
  language: 'ko',
  isNew: true,
};

const enItem: NewItem = {
  firmId: 'cooley',
  title: 'EN-TITLE-DO-NOT-LEAK',
  url: 'https://cooleygo.com/insights/1',
  language: 'en',
  isNew: true,
};

describe('GUARD-01 Layer 2 prompt rule (Phase 8)', () => {
  it('(L2-01) buildPrompt contains "title verbatim" phrase (Layer 2 rule)', () => {
    const p = buildPrompt(krItem, 'BODY');
    expect(p.toLowerCase()).toContain('title verbatim');
  });

  it("(L2-02) buildPrompt contains \"confidence: 'low'\" literal", () => {
    const p = buildPrompt(krItem, 'BODY');
    expect(p).toContain("confidence: 'low'");
  });

  it('(L2-03) SUMM-06 preserved — KR title still NOT leaked in prompt', () => {
    const p = buildPrompt(krItem, 'BODY');
    expect(p).not.toContain('KR-TITLE-DO-NOT-LEAK');
  });

  it('(L2-04) SUMM-06 preserved — EN title still NOT leaked in prompt', () => {
    const p = buildPrompt(enItem, 'BODY');
    expect(p).not.toContain('EN-TITLE-DO-NOT-LEAK');
  });

  it('(L2-05) summarySchema.properties.summary_ko.description references empty-string rule', () => {
    const desc = summarySchema.properties.summary_ko.description;
    // Should mention empty string ("") and the Layer 2 rule
    expect(desc).toContain('""');
  });
});

describe('GUARD-01 Zod schema relaxation (Phase 8 Option C)', () => {
  // Simulate the new SummaryZ schema that gemini.ts will use after Task 2
  // We import from gemini.ts indirectly via the behavior contract:
  // SummaryZ.parse({ summary_ko: '', confidence: 'low' }) must succeed

  // Since SummaryZ is private to gemini.ts, we test the JSON schema in prompt.ts
  // and the actual Zod relaxation will be integration-tested via gemini.test.ts (Plan 02).
  // Here we test the schema description is updated.

  it('(Z-01) summarySchema.properties.summary_ko.description contains GUARD-01 reference', () => {
    const desc = summarySchema.properties.summary_ko.description;
    expect(desc.toLowerCase()).toContain('guard-01');
  });
});
