// Phase 10 DQOBS-03 — unit tests for the exported emitDryRunStepSummary helper.
//
// Approach C (from 10-03-PLAN.md Task 2): test the extracted helper directly
// rather than spawning a child process or invoking main(). NODE_ENV=test guard
// in main.ts prevents the top-level main().then(process.exit) from firing when
// this file imports main.ts — verified by the test suite completing normally.
//
// Phase 13 D-04/D-06 — parseMode tests appended at the bottom verify
// --mode=daily|weekly parsing + fail-fast on missing/invalid mode.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DataQualityMarker } from '../src/pipeline/detectClusters.js';

// Import after setting up stubs to avoid gemini.ts AbortError at module load
// (STATE.md commit 344b65d — gemini.ts throws when GEMINI_API_KEY is unset).
// We use vi.stubEnv in beforeEach so the env is set before the dynamic import.

describe('emitDryRunStepSummary — Phase 10 DQOBS-03', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Stub GEMINI_API_KEY before importing main.ts to avoid AbortError
    // at module load (gemini.ts:85-89, commit 344b65d).
    vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  // Fake RunReport shape — only the fields emitDryRunStepSummary reads.
  const fakeReport = (markers: DataQualityMarker[] = []) => ({
    recorder: {
      toMarkdownTable: () =>
        '| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |\n' +
        '|------|--------:|----:|-----:|--------|---------:|--------:|------:|------:|\n' +
        '| Cooley | 3 | 1 | 1 | — | 500ms | 1000 | 0 | 1/0/0 |',
    },
    firms: [{ id: 'cooley', name: 'Cooley', enabled: true, type: 'rss' }],
    markers,
  });

  it('DRY_RUN=1 + empty markers → emits label + table, NO markers block', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    emitDryRunStepSummary(fakeReport([]) as never);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):');
    expect(output).toContain('| Cooley | 3 | 1 | 1 |');
    expect(output).not.toContain('⚠ Data Quality Warnings');  // D-15 clean-run invisible
  });

  it('DRY_RUN=1 + non-empty markers → emits label + table + markers block', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    const markers: DataQualityMarker[] = [
      { kind: 'low-confidence', firmId: 'yulchon', firmName: '율촌', lowCount: 4, totalCount: 6 },
    ];
    emitDryRunStepSummary(fakeReport(markers) as never);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):');
    expect(output).toContain('| Cooley | 3 | 1 | 1 |');
    expect(output).toContain('## ⚠ Data Quality Warnings');
    expect(output).toContain('- **yulchon**: 4/6 items 품질 의심 (confidence=low 과반)');
  });

  it('DRY_RUN unset → no stdout emission (early return)', async () => {
    vi.stubEnv('DRY_RUN', '');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    emitDryRunStepSummary(fakeReport([
      { kind: 'cluster', firmId: 'bkl', firmName: '태평양', count: 3, signature: 's' },
    ]) as never);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).not.toContain('[DRY_RUN] Step-summary');
  });

  it('DRY_RUN=0 → no stdout emission', async () => {
    vi.stubEnv('DRY_RUN', '0');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    emitDryRunStepSummary(fakeReport([]) as never);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).not.toContain('[DRY_RUN]');
  });

  it('DRY_RUN=1 + cluster markers → D-05 Korean wording in output', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    const markers: DataQualityMarker[] = [
      { kind: 'cluster', firmId: 'bkl', firmName: '태평양', count: 5, signature: 'sig' },
    ];
    emitDryRunStepSummary(fakeReport(markers) as never);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('HALLUCINATION_CLUSTER_DETECTED — 5개 항목 demote됨');
  });

  it('byte-for-byte parity: emitDryRunStepSummary output matches renderMarkersMarkdown output for markers block', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    const { renderMarkersMarkdown } = await import('../src/observability/summary.js');
    const markers: DataQualityMarker[] = [
      { kind: 'cluster', firmId: 'bkl', firmName: '태평양', count: 3, signature: 'sig' },
      { kind: 'low-confidence', firmId: 'yulchon', firmName: '율촌', lowCount: 4, totalCount: 6 },
    ];
    emitDryRunStepSummary(fakeReport(markers) as never);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    const expectedBlock = renderMarkersMarkdown(markers).trimEnd();
    expect(output).toContain(expectedBlock);
  });

  it('Phase 13 D-21 byte-parity: emitDryRunStepSummary prepends [METRIC] geminiCallCount line', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    emitDryRunStepSummary(fakeReport([]) as never, 12);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('[METRIC] geminiCallCount=12');
    // Ordering: [DRY_RUN] label appears before [METRIC]; [METRIC] before table row.
    const dryIdx = output.indexOf('[DRY_RUN] Step-summary');
    const metricIdx = output.indexOf('[METRIC] geminiCallCount=12');
    const tableIdx = output.indexOf('| Cooley');
    expect(dryIdx).toBeGreaterThanOrEqual(0);
    expect(metricIdx).toBeGreaterThan(dryIdx);
    expect(tableIdx).toBeGreaterThan(metricIdx);
  });

  it('Phase 13 D-22: [METRIC] emitted even when geminiCallCount=0 (weekly path)', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const { emitDryRunStepSummary } = await import('../src/main.js');
    emitDryRunStepSummary(fakeReport([]) as never, 0);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('[METRIC] geminiCallCount=0');
  });
});

describe('parseMode — Phase 13 D-04/D-06', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Stub GEMINI_API_KEY to avoid gemini.ts AbortError on module load.
    vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('--mode=daily returns daily', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(parseMode(['node', 'main.js', '--mode=daily'])).toBe('daily');
  });

  it('--mode daily (space form) returns daily', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(parseMode(['node', 'main.js', '--mode', 'daily'])).toBe('daily');
  });

  it('--mode=weekly returns weekly', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(parseMode(['node', 'main.js', '--mode=weekly'])).toBe('weekly');
  });

  it('--mode weekly (space form) returns weekly', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(parseMode(['node', 'main.js', '--mode', 'weekly'])).toBe('weekly');
  });

  it('missing --mode calls process.exit(2) with Usage stderr', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(() => parseMode(['node', 'main.js'])).toThrow('exit:2');
    expect(errSpy).toHaveBeenCalled();
    const msg = errSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('Usage:');
    expect(msg).toContain('--mode=daily|weekly');
  });

  it('invalid --mode value calls process.exit(2)', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(() => parseMode(['node', 'main.js', '--mode=monthly'])).toThrow('exit:2');
  });

  it('invalid --mode value (space form) calls process.exit(2)', async () => {
    const { parseMode } = await import('../src/main.js');
    expect(() => parseMode(['node', 'main.js', '--mode', 'monthly'])).toThrow(
      'exit:2',
    );
  });
});
