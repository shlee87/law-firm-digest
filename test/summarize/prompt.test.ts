// TDD coverage for src/summarize/prompt.ts D-P2-13 language routing.

import { describe, it, expect } from 'vitest';
import { buildPrompt, summarySchema } from '../../src/summarize/prompt.js';
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

describe('buildPrompt (D-P2-13 language routing)', () => {
  it('(1) Korean firm → Korean-source instruction, NO translation wording', () => {
    const p = buildPrompt(krItem, 'BODY-MARKER');
    expect(p).toContain('원문');
    expect(p).toContain('번역하지 말고');
  });

  it('(2) English firm → English-to-Korean translation instruction', () => {
    const p = buildPrompt(enItem, 'BODY-MARKER');
    expect(p).toContain('한국어 2~5줄 요약');
    expect(p).toContain('Korean summary');
  });

  it('(3) SUMM-06 preserved — item.title absent from Korean prompt', () => {
    const p = buildPrompt(krItem, 'BODY-MARKER');
    expect(p).not.toContain('KR-TITLE-DO-NOT-LEAK');
  });

  it('(4) SUMM-06 preserved — item.title absent from English prompt', () => {
    const p = buildPrompt(enItem, 'BODY-MARKER');
    expect(p).not.toContain('EN-TITLE-DO-NOT-LEAK');
  });

  it('(5) body wrapped in <article>...</article> delimiters (injection defense)', () => {
    const p = buildPrompt(krItem, 'BODY-MARKER');
    expect(p).toContain(`<article>\nBODY-MARKER\n</article>`);
    const q = buildPrompt(enItem, 'BODY-MARKER');
    expect(q).toContain(`<article>\nBODY-MARKER\n</article>`);
  });

  it('(6) summarySchema shape unchanged — language-independent response contract', () => {
    expect(summarySchema.type).toBe('object');
    expect(summarySchema.properties.summary_ko.type).toEqual([
      'string',
      'null',
    ]);
    expect(summarySchema.properties.confidence.enum).toEqual([
      'high',
      'medium',
      'low',
    ]);
    expect(summarySchema.required).toEqual(['summary_ko', 'confidence']);
  });

  it('(7) GUARD-01 Layer 2 rule present — prompt contains "title verbatim" and confidence literal', () => {
    const p = buildPrompt(krItem, 'BODY-MARKER');
    expect(p).toMatch(/title verbatim/i);
    expect(p).toContain(`confidence: 'low'`);
  });

  it('(8) GUARD-01 Layer 2 rule is language-independent — appears for English firms too', () => {
    const p = buildPrompt(enItem, 'BODY-MARKER');
    expect(p).toMatch(/title verbatim/i);
    expect(p).toContain(`confidence: 'low'`);
  });
});
