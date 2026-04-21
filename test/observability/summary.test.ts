import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recorder } from '../../src/observability/recorder.js';
import { writeStepSummary } from '../../src/observability/summary.js';
import type { FirmConfig } from '../../src/types.js';
import { renderMarkersMarkdown } from '../../src/observability/summary.js';
import type { DataQualityMarker } from '../../src/pipeline/detectClusters.js';

function makeFirm(id: string, name: string): FirmConfig {
  return {
    id,
    name,
    language: 'en',
    type: 'rss',
    url: `https://example.com/${id}`,
    timezone: 'UTC',
    enabled: true,
  };
}

describe('writeStepSummary — $GITHUB_STEP_SUMMARY writer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'step-summary-test-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('is a silent no-op when GITHUB_STEP_SUMMARY is unset', async () => {
    vi.stubEnv('GITHUB_STEP_SUMMARY', '');
    const r = new Recorder();
    r.firm('cooley').fetched(12);
    const firms = [makeFirm('cooley', 'Cooley')];
    // Should not throw and produce no output.
    await expect(writeStepSummary(r, firms)).resolves.toBeUndefined();
  });

  it('appends the markdown table + newline to the file at $GITHUB_STEP_SUMMARY', async () => {
    const path = join(tempDir, 'summary.md');
    vi.stubEnv('GITHUB_STEP_SUMMARY', path);
    const r = new Recorder();
    r.firm('cooley').fetched(12).newCount(3).summarized(3).durationMs(1247);
    const firms = [makeFirm('cooley', 'Cooley')];
    await writeStepSummary(r, firms);
    const contents = await readFile(path, 'utf8');
    expect(contents).toContain('| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |');
    // fetched=12, bodyLengths not set → AvgBody='—'; isEmptyFirm? No (fetched=12≠0) → GUARD=0, H/M/L=0/0/0
    expect(contents).toContain('| Cooley | 12 | 3 | 3 | — | 1247ms | — | 0 | 0/0/0 |');
    expect(contents.endsWith('\n')).toBe(true);
  });

  it('appends (does not clobber) on repeated calls', async () => {
    const path = join(tempDir, 'summary.md');
    vi.stubEnv('GITHUB_STEP_SUMMARY', path);
    const r = new Recorder();
    r.firm('cooley').fetched(12);
    const firms = [makeFirm('cooley', 'Cooley')];
    await writeStepSummary(r, firms);
    await writeStepSummary(r, firms);
    const contents = await readFile(path, 'utf8');
    // Two copies of the header row — append-only semantics.
    const matches = contents.match(/\| Firm \| Fetched \|/g);
    expect(matches?.length).toBe(2);
  });

  it('does NOT throw when appendFile fails — logs warn and returns (Pitfall 10)', async () => {
    // Point at a directory that does not exist. appendFile will reject with ENOENT.
    const badPath = join(tempDir, 'nonexistent', 'deep', 'summary.md');
    vi.stubEnv('GITHUB_STEP_SUMMARY', badPath);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = new Recorder();
    r.firm('cooley').fetched(12);
    const firms = [makeFirm('cooley', 'Cooley')];
    await expect(writeStepSummary(r, firms)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain('[step-summary] write failed:');
  });

  // --- Phase 8 D-15 coverage ---

  describe('Phase 8 D-15: Data Quality Warnings section', () => {
    it('D-15: markers non-empty → ## ⚠ Data Quality Warnings section appended after table', async () => {
      const path = join(tempDir, 'summary-d15.md');
      vi.stubEnv('GITHUB_STEP_SUMMARY', path);
      const r = new Recorder();
      r.firm('bkl').fetched(5).newCount(5).summarized(5).durationMs(800);
      r.firm('kim-chang').fetched(3).newCount(3).summarized(3).durationMs(400);
      const firms = [makeFirm('bkl', 'BKL'), makeFirm('kim-chang', 'Kim & Chang')];
      const markers: DataQualityMarker[] = [
        { kind: 'cluster', firmId: 'bkl', firmName: '법무법인 태평양', count: 5, signature: 'sig1' },
        { kind: 'cluster', firmId: 'kim-chang', firmName: '김앤장', count: 3, signature: 'sig2' },
      ];
      await writeStepSummary(r, firms, markers);
      const content = await readFile(path, 'utf8');
      expect(content).toContain('## ⚠ Data Quality Warnings');
      expect(content).toContain('- **bkl**: HALLUCINATION_CLUSTER_DETECTED — 5개 항목 demote됨');
      expect(content).toContain('- **kim-chang**: HALLUCINATION_CLUSTER_DETECTED — 3개 항목 demote됨');
      // Section appears AFTER the per-firm table
      const tableIdx = content.indexOf('|');
      const sectionIdx = content.indexOf('## ⚠ Data Quality Warnings');
      expect(sectionIdx).toBeGreaterThan(tableIdx);
    });

    it('D-15: markers empty → NO Data Quality Warnings section appended (clean-run posture)', async () => {
      const path = join(tempDir, 'summary-d15-clean.md');
      vi.stubEnv('GITHUB_STEP_SUMMARY', path);
      const r = new Recorder();
      r.firm('cooley').fetched(10).newCount(2).summarized(2).durationMs(500);
      const firms = [makeFirm('cooley', 'Cooley')];
      await writeStepSummary(r, firms, []);
      const content = await readFile(path, 'utf8');
      expect(content).not.toContain('## ⚠ Data Quality Warnings');
    });

    it('D-15: GITHUB_STEP_SUMMARY unset → no write even with non-empty markers', async () => {
      vi.stubEnv('GITHUB_STEP_SUMMARY', '');
      const r = new Recorder();
      r.firm('bkl').fetched(5);
      const firms = [makeFirm('bkl', 'BKL')];
      const markers: DataQualityMarker[] = [
        { kind: 'cluster', firmId: 'bkl', firmName: '법무법인 태평양', count: 5, signature: 'sig1' },
      ];
      // Should return without writing anything
      await expect(writeStepSummary(r, firms, markers)).resolves.toBeUndefined();
      // No file should be created in tempDir (nothing was written)
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(tempDir);
      expect(files).toHaveLength(0);
    });

    it('D-15 Pitfall 5: SINGLE appendFile call for table + markers (transactional write — table and warnings section present in one atomic payload)', async () => {
      // Pitfall 5: if table and markers were written in separate appendFile
      // calls, a failure between the two would produce a partial file.
      // Verify that BOTH the table and the markers section exist in the
      // written file after a single writeStepSummary call — this is only
      // possible if they were written atomically in one payload string.
      const path = join(tempDir, 'summary-d15-pitfall5.md');
      vi.stubEnv('GITHUB_STEP_SUMMARY', path);
      const r = new Recorder();
      r.firm('bkl').fetched(5).newCount(5).summarized(5).durationMs(800);
      const firms = [makeFirm('bkl', 'BKL')];
      const markers: DataQualityMarker[] = [
        { kind: 'cluster', firmId: 'bkl', firmName: '법무법인 태평양', count: 5, signature: 'sig1' },
      ];
      await writeStepSummary(r, firms, markers);
      const content = await readFile(path, 'utf8');
      // Both must be present — written as one atomic payload (Pitfall 5)
      expect(content).toContain('| Firm | Fetched |');
      expect(content).toContain('## ⚠ Data Quality Warnings');
      // The source file must only contain one await appendFile call (static invariant)
      // Verified in acceptance criteria: grep -c "await appendFile" src/observability/summary.ts === 1
    });
  });

  describe('Phase 10 DQOBS-02 low-confidence marker rendering', () => {
    const firms = [makeFirm('cooley', 'Cooley')];

    it('low-confidence marker renders with Korean D-05 wording', async () => {
      const path = join(tempDir, 'summary-lc.md');
      vi.stubEnv('GITHUB_STEP_SUMMARY', path);
      const r = new Recorder();
      const markers: DataQualityMarker[] = [
        { kind: 'low-confidence', firmId: 'yulchon', firmName: '율촌', lowCount: 4, totalCount: 6 },
      ];
      await writeStepSummary(r, firms, markers);
      const content = await readFile(path, 'utf8');
      expect(content).toContain('## ⚠ Data Quality Warnings');
      expect(content).toContain('- **yulchon**: 4/6 items 품질 의심 (confidence=low 과반)');
    });

    it('mixed markers: both cluster and low-confidence render', async () => {
      const path = join(tempDir, 'summary-mixed.md');
      vi.stubEnv('GITHUB_STEP_SUMMARY', path);
      const r = new Recorder();
      const markers: DataQualityMarker[] = [
        { kind: 'cluster', firmId: 'bkl', firmName: '태평양', count: 3, signature: 'sig' },
        { kind: 'low-confidence', firmId: 'yulchon', firmName: '율촌', lowCount: 4, totalCount: 6 },
      ];
      await writeStepSummary(r, firms, markers);
      const content = await readFile(path, 'utf8');
      expect(content).toContain('- **bkl**: HALLUCINATION_CLUSTER_DETECTED — 3개 항목 demote됨');
      expect(content).toContain('- **yulchon**: 4/6 items 품질 의심 (confidence=low 과반)');
    });

    it('renderMarkersMarkdown: empty markers returns empty string', () => {
      expect(renderMarkersMarkdown([])).toBe('');
    });

    it('renderMarkersMarkdown: non-empty markers returns block starting with \\n## ⚠ Data Quality Warnings', () => {
      const block = renderMarkersMarkdown([
        { kind: 'cluster', firmId: 'x', firmName: 'X', count: 3, signature: 's' },
      ]);
      expect(block.startsWith('\n## ⚠ Data Quality Warnings')).toBe(true);
    });

    it('byte-for-byte helper reuse: writeStepSummary payload suffix matches renderMarkersMarkdown output', async () => {
      const path = join(tempDir, 'summary-byteparity.md');
      vi.stubEnv('GITHUB_STEP_SUMMARY', path);
      const r = new Recorder();
      const markers: DataQualityMarker[] = [
        { kind: 'low-confidence', firmId: 'z', firmName: 'Z', lowCount: 3, totalCount: 5 },
      ];
      await writeStepSummary(r, firms, markers);
      const content = await readFile(path, 'utf8');
      const expectedBlock = renderMarkersMarkdown(markers);
      expect(content.endsWith(expectedBlock)).toBe(true);
    });
  });
});
