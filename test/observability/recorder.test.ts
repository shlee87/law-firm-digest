import { describe, it, expect } from 'vitest';
import { Recorder } from '../../src/observability/recorder.js';
import type { FirmConfig } from '../../src/types.js';

function makeFirm(id: string, name: string, enabled = true): FirmConfig {
  return {
    id,
    name,
    language: 'en',
    type: 'rss',
    url: `https://example.com/${id}`,
    timezone: 'UTC',
    enabled,
  };
}

describe('Recorder — per-firm metrics accumulator', () => {
  describe('firm() handle — single-firm mutation', () => {
    it('persists fetched count', () => {
      const r = new Recorder();
      r.firm('cooley').fetched(12);
      expect(r.get('cooley')?.fetched).toBe(12);
    });

    it('supports chained mutations on one firm', () => {
      const r = new Recorder();
      r.firm('cooley').fetched(12).newCount(3).summarized(3).durationMs(1247);
      const m = r.get('cooley')!;
      expect(m.fetched).toBe(12);
      expect(m.new).toBe(3);
      expect(m.summarized).toBe(3);
      expect(m.durationMs).toBe(1247);
      expect(m.errorClass).toBeNull();
    });

    it('replaces (not accumulates) on subsequent calls to the same field (Pitfall 6 semantics)', () => {
      const r = new Recorder();
      r.firm('cooley').fetched(12);
      r.firm('cooley').fetched(99);
      expect(r.get('cooley')?.fetched).toBe(99);
    });

    it('records errorClass strings verbatim', () => {
      const r = new Recorder();
      r.firm('kim-chang').errorClass('fetch-timeout');
      expect(r.get('kim-chang')?.errorClass).toBe('fetch-timeout');
    });

    it('returns undefined for firms never touched', () => {
      const r = new Recorder();
      r.firm('cooley').fetched(1);
      expect(r.get('never-touched')).toBeUndefined();
    });
  });

  describe('per-firm isolation', () => {
    it('mutations on firm A do not affect firm B', () => {
      const r = new Recorder();
      r.firm('cooley').fetched(12).newCount(3);
      r.firm('kim-chang').fetched(5).errorClass('fetch-timeout');
      expect(r.get('cooley')?.fetched).toBe(12);
      expect(r.get('cooley')?.errorClass).toBeNull();
      expect(r.get('kim-chang')?.fetched).toBe(5);
      expect(r.get('kim-chang')?.errorClass).toBe('fetch-timeout');
    });
  });

  describe('toMarkdownTable — D-10 output contract', () => {
    it('renders the exact 5-column header + alignment separator', () => {
      const r = new Recorder();
      const firms = [makeFirm('cooley', 'Cooley')];
      r.firm('cooley').fetched(12).newCount(3).summarized(3).durationMs(1247);
      const table = r.toMarkdownTable(firms);
      const lines = table.split('\n');
      expect(lines[0]).toBe('| Firm | Fetched | New | Summarized | Errors | Duration |');
      expect(lines[1]).toBe('|------|--------:|----:|-----------:|--------|---------:|');
      expect(lines[2]).toBe('| Cooley | 12 | 3 | 3 | — | 1247ms |');
    });

    it('renders em-dash when errorClass is null, firm display name from FirmConfig.name', () => {
      const r = new Recorder();
      const firms = [makeFirm('cooley', 'Cooley')];
      r.firm('cooley').fetched(0).newCount(0);
      const table = r.toMarkdownTable(firms);
      expect(table).toContain('| Cooley | 0 | 0 | 0 | — | 0ms |');
    });

    it('renders the errorClass string in Errors column when set', () => {
      const r = new Recorder();
      const firms = [makeFirm('kim-chang', '김앤장')];
      r.firm('kim-chang').fetched(0).errorClass('http-503').durationMs(3211);
      const table = r.toMarkdownTable(firms);
      expect(table).toContain('| 김앤장 | 0 | 0 | 0 | http-503 | 3211ms |');
    });

    it('skips firms where enabled: false', () => {
      const r = new Recorder();
      const firms = [
        makeFirm('cooley', 'Cooley', true),
        makeFirm('lee-ko', '광장', false),
        makeFirm('bkl', '태평양', true),
      ];
      r.firm('cooley').fetched(12);
      r.firm('lee-ko').fetched(99); // should be ignored
      r.firm('bkl').fetched(3);
      const table = r.toMarkdownTable(firms);
      expect(table).toContain('Cooley');
      expect(table).toContain('태평양');
      expect(table).not.toContain('광장');
      expect(table).not.toContain('99');
    });

    it('row order mirrors firms: FirmConfig[] input order, not recorder insertion order', () => {
      const r = new Recorder();
      // Insert in bkl-first order
      r.firm('bkl').fetched(5);
      r.firm('cooley').fetched(12);
      // But iterate firms[] in cooley-first order
      const firms = [makeFirm('cooley', 'Cooley'), makeFirm('bkl', '태평양')];
      const table = r.toMarkdownTable(firms);
      const cooleyIdx = table.indexOf('| Cooley |');
      const bklIdx = table.indexOf('| 태평양 |');
      expect(cooleyIdx).toBeGreaterThan(0);
      expect(bklIdx).toBeGreaterThan(cooleyIdx);
    });

    it('renders untouched firms with zero metrics so silent-no-activity firms stay visible', () => {
      const r = new Recorder();
      const firms = [makeFirm('cooley', 'Cooley'), makeFirm('unused', 'Unused')];
      r.firm('cooley').fetched(12).newCount(3).summarized(3).durationMs(1247);
      // 'unused' was never touched
      const table = r.toMarkdownTable(firms);
      expect(table).toContain('| Cooley | 12 | 3 | 3 | — | 1247ms |');
      expect(table).toContain('| Unused | 0 | 0 | 0 | — | 0ms |');
    });

    it('returns header + separator only when firms array is empty', () => {
      const r = new Recorder();
      const table = r.toMarkdownTable([]);
      const lines = table.split('\n');
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('Firm');
      expect(lines[1]).toContain('---');
    });
  });
});
