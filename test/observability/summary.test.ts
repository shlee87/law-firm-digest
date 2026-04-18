import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Recorder } from '../../src/observability/recorder.js';
import { writeStepSummary } from '../../src/observability/summary.js';
import type { FirmConfig } from '../../src/types.js';

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
    expect(contents).toContain('| Firm | Fetched | New | Summarized | Errors | Duration |');
    expect(contents).toContain('| Cooley | 12 | 3 | 3 | — | 1247ms |');
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
});
