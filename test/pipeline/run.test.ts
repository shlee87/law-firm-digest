// Integration tests for src/pipeline/run.ts — the Phase 3 composition root.
//
// All pipeline stages are module-mocked so runPipeline's orchestration logic
// can be observed without performing real I/O (no live fetches, no real
// Gmail, no real Gemini, no real writeState).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// vi.mock factories are hoisted above import statements, so any reference to
// a test-file variable from inside the factory must go through vi.hoisted().
const mocks = vi.hoisted(() => {
  return {
    loadFirmsMock: vi.fn(),
    loadRecipientMock: vi.fn(),
    readStateMock: vi.fn(),
    writeStateMock: vi.fn(),
    fetchAllMock: vi.fn(),
    enrichWithBodyMock: vi.fn(),
    applyKeywordFilterMock: vi.fn(),
    dedupAllMock: vi.fn(),
    summarizeMock: vi.fn(),
    sendMailMock: vi.fn(),
    writeArchiveMock: vi.fn(),
    chromiumLaunchMock: vi.fn(),
    browserCloseMock: vi.fn(),
  };
});

vi.mock('../../src/config/loader.js', () => ({
  loadFirms: mocks.loadFirmsMock,
  loadRecipient: mocks.loadRecipientMock,
}));
vi.mock('../../src/state/reader.js', () => ({
  readState: mocks.readStateMock,
}));
vi.mock('../../src/state/writer.js', () => ({
  writeState: mocks.writeStateMock,
}));
vi.mock('../../src/pipeline/fetch.js', () => ({
  fetchAll: mocks.fetchAllMock,
}));
vi.mock('../../src/pipeline/enrichBody.js', () => ({
  enrichWithBody: mocks.enrichWithBodyMock,
}));
vi.mock('../../src/pipeline/filter.js', () => ({
  applyKeywordFilter: mocks.applyKeywordFilterMock,
}));
vi.mock('../../src/pipeline/dedup.js', () => ({
  dedupAll: mocks.dedupAllMock,
}));
vi.mock('../../src/summarize/gemini.js', () => ({
  summarize: mocks.summarizeMock,
}));
vi.mock('../../src/mailer/gmail.js', () => ({
  sendMail: mocks.sendMailMock,
}));
vi.mock('../../src/archive/writer.js', () => ({
  writeArchive: mocks.writeArchiveMock,
}));
vi.mock('playwright', () => ({
  chromium: { launch: mocks.chromiumLaunchMock },
}));

// Import AFTER mocks are set up. Vitest hoists vi.mock calls so this import
// will see the mocked modules.
import { runPipeline } from '../../src/pipeline/run.js';

const FIRMS = [
  {
    id: 'cooley',
    name: 'Cooley',
    language: 'en' as const,
    type: 'rss' as const,
    url: 'https://example.com/cooley',
    timezone: 'UTC',
    enabled: true,
  },
  {
    id: 'kim-chang',
    name: '김앤장',
    language: 'ko' as const,
    type: 'html' as const,
    url: 'https://example.com/kc',
    timezone: 'Asia/Seoul',
    enabled: true,
  },
];

type FakeRecorder = {
  firm: (id: string) => {
    fetched: (n: number) => { durationMs: (m: number) => unknown };
  };
};

describe('runPipeline — composition root', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'run-test-'));

    // Default implementations — tests override as needed.
    mocks.loadFirmsMock.mockReset().mockResolvedValue(FIRMS);
    mocks.loadRecipientMock.mockReset().mockResolvedValue('user@example.com');
    mocks.readStateMock.mockReset().mockResolvedValue({
      version: 1,
      lastUpdated: null,
      firms: {},
    });
    mocks.writeStateMock.mockReset().mockResolvedValue(undefined);
    mocks.fetchAllMock
      .mockReset()
      .mockImplementation(async (firms: typeof FIRMS, recorder?: FakeRecorder) => {
        return firms.map((f) => {
          recorder?.firm(f.id).fetched(1).durationMs(100);
          return {
            firm: f,
            raw: [
              {
                firmId: f.id,
                title: 't',
                url: `https://x/${f.id}/1`,
                language: f.language,
                // 120-char description so Phase 8 Layer 1 short-circuit
                // (body.trim().length < 100) does NOT fire and summarizeMock
                // is exercised by the default "invokes full pipeline" test.
                description: 'x'.repeat(120),
              },
            ],
            new: [],
            summarized: [],
            durationMs: 100,
          };
        });
      });
    mocks.enrichWithBodyMock
      .mockReset()
      .mockImplementation(async (results: unknown) => results);
    mocks.applyKeywordFilterMock
      .mockReset()
      .mockImplementation((results: unknown) => results);
    mocks.dedupAllMock.mockReset().mockImplementation(
      (
        results: {
          raw: {
            url: string;
            firmId: string;
            title: string;
            language: string;
            description?: string;
          }[];
          firm: unknown;
        }[],
      ) =>
        results.map((r) => ({
          ...r,
          new: r.raw.map((i) => ({ ...i, isNew: true as const })),
        })),
    );
    mocks.summarizeMock
      .mockReset()
      .mockImplementation(
        async (item: {
          url: string;
          firmId: string;
          title: string;
          language: string;
          description?: string;
        }) => ({
          ...item,
          isNew: true as const,
          summary_ko: '요약',
          summaryConfidence: 'high' as const,
          summaryModel: 'gemini-2.5-flash',
        }),
      );
    mocks.sendMailMock.mockReset().mockResolvedValue(undefined);
    mocks.writeArchiveMock.mockReset().mockResolvedValue('/tmp/fake-archive.html');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('invokes full pipeline with default options', async () => {
    const report = await runPipeline({});
    expect(mocks.fetchAllMock).toHaveBeenCalled();
    expect(mocks.summarizeMock).toHaveBeenCalled();
    expect(mocks.sendMailMock).toHaveBeenCalled();
    expect(mocks.writeArchiveMock).toHaveBeenCalled();
    expect(mocks.writeStateMock).toHaveBeenCalled();
    expect(report.digestSent).toBe(true);
  });

  it('skipEmail=true does NOT send mail or write archive', async () => {
    const report = await runPipeline({ skipEmail: true });
    expect(mocks.sendMailMock).not.toHaveBeenCalled();
    expect(mocks.writeArchiveMock).not.toHaveBeenCalled();
    expect(report.digestSent).toBe(false);
  });

  it('skipStateWrite=true does NOT write state', async () => {
    await runPipeline({ skipStateWrite: true });
    expect(mocks.writeStateMock).not.toHaveBeenCalled();
  });

  it('skipGemini=true does not call summarize; items marked cli-skipped', async () => {
    const report = await runPipeline({
      skipGemini: true,
      skipEmail: true,
      skipStateWrite: true,
    });
    expect(mocks.summarizeMock).not.toHaveBeenCalled();
    const firstSummarized = report.results.flatMap((r) => r.summarized);
    expect(firstSummarized.length).toBeGreaterThan(0);
    firstSummarized.forEach((it) => {
      expect(it.summaryModel).toBe('cli-skipped');
      expect(it.summary_ko).toBeNull();
    });
  });

  it('firmFilter scopes to one firm', async () => {
    await runPipeline({
      firmFilter: 'cooley',
      skipEmail: true,
      skipStateWrite: true,
      skipGemini: true,
    });
    const firstCallFirms = mocks.fetchAllMock.mock.calls[0][0] as typeof FIRMS;
    expect(firstCallFirms.length).toBe(1);
    expect(firstCallFirms[0].id).toBe('cooley');
  });

  it('firmFilter with unknown id throws with valid-ids listing (D-05)', async () => {
    await expect(
      runPipeline({
        firmFilter: 'nonsense',
        skipEmail: true,
        skipStateWrite: true,
      }),
    ).rejects.toThrow(/Firm not found: nonsense\. Valid ids: cooley, kim-chang/);
  });

  it('saveHtmlPath writes composed html to the given path', async () => {
    const htmlPath = join(tempDir, 'preview.html');
    const report = await runPipeline({
      saveHtmlPath: htmlPath,
      skipEmail: true,
      skipStateWrite: true,
      skipGemini: true,
    });
    expect(report.saveHtmlWritten).toBe(htmlPath);
    const contents = await readFile(htmlPath, 'utf8');
    expect(contents).toContain('법률 다이제스트');
  });

  it('Recorder is threaded and toMarkdownTable reflects metrics', async () => {
    const report = await runPipeline({
      skipEmail: true,
      skipStateWrite: true,
      skipGemini: true,
    });
    const table = report.recorder.toMarkdownTable([
      {
        id: 'cooley',
        name: 'Cooley',
        language: 'en',
        type: 'rss',
        url: 'https://x/c',
        timezone: 'UTC',
        enabled: true,
      },
    ]);
    expect(table).toContain('| Cooley |');
    expect(table).toContain('1'); // fetched=1 from the mock.
    // Phase 10 DQOBS-01: 9-column header in recorder table.
    expect(table).toContain('| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |');
    // AvgBody is either a number or '—' — just verify it's present in the row.
    const cooleyRow = table.split('\n').find((l) => l.includes('| Cooley |'));
    expect(cooleyRow).toBeDefined();
  });

  it('Phase 10 DQOBS-01: Recorder captures bodyLengths and H/M/L after pipeline run', async () => {
    const report = await runPipeline({
      skipEmail: true,
      skipStateWrite: true,
    });

    const firmId = 'cooley';
    const metrics = report.recorder.get(firmId);
    expect(metrics).toBeDefined();
    // bodyLengths set post-enrich (120-char descriptions per the mock setup).
    expect(metrics!.bodyLengths.length).toBeGreaterThan(0);
    // guardCount is a number (may be 0 if no guards triggered).
    expect(typeof metrics!.guardCount).toBe('number');
    // H/M/L tallied post-cluster-detect.
    expect(typeof metrics!.confidenceH).toBe('number');
    expect(typeof metrics!.confidenceM).toBe('number');
    expect(typeof metrics!.confidenceL).toBe('number');
    // H+M+L totals match summarized count (mock: 1 item per firm summarized=high).
    expect(metrics!.confidenceH + metrics!.confidenceM + metrics!.confidenceL)
      .toBe(metrics!.summarized + metrics!.guardCount);
  });

  it('Phase 10 DQOBS-01: error firms do not receive bodyLengths/guardCount/confidence records', async () => {
    // Override fetchAll so kim-chang errors out (r.error set).
    mocks.fetchAllMock.mockReset().mockImplementation(
      async (firms: typeof FIRMS, recorder?: FakeRecorder) => {
        return firms.map((f) => {
          if (f.id === 'kim-chang') {
            recorder?.firm(f.id).fetched(0).durationMs(0);
            return {
              firm: f,
              raw: [],
              new: [],
              summarized: [],
              durationMs: 0,
              error: new Error('fetch-error'),
            };
          }
          recorder?.firm(f.id).fetched(1).durationMs(100);
          return {
            firm: f,
            raw: [
              {
                firmId: f.id,
                title: 't',
                url: `https://x/${f.id}/1`,
                language: f.language,
                description: 'x'.repeat(120),
              },
            ],
            new: [],
            summarized: [],
            durationMs: 100,
          };
        });
      },
    );

    const report = await runPipeline({
      skipEmail: true,
      skipStateWrite: true,
    });

    const erroredFirmMetrics = report.recorder.get('kim-chang');
    // If present (errorClass was set by fetchAll mock), bodyLengths must remain default.
    if (erroredFirmMetrics) {
      expect(erroredFirmMetrics.bodyLengths).toEqual([]);
      expect(erroredFirmMetrics.guardCount).toBe(0);
      expect(erroredFirmMetrics.confidenceH).toBe(0);
      expect(erroredFirmMetrics.confidenceM).toBe(0);
      expect(erroredFirmMetrics.confidenceL).toBe(0);
    }
  });

  it('writeStepSummary runs in finally block — propagates throw from fetchAll', async () => {
    vi.stubEnv('GITHUB_STEP_SUMMARY', join(tempDir, 'summary.md'));
    mocks.fetchAllMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(runPipeline({})).rejects.toThrow(/boom/);
    // The assertion is that the finally block did not swallow the throw.
  });

  it('RunReport shape — results, digestSent, warnings, recorder, markers, firms populated', async () => {
    const report = await runPipeline({
      skipEmail: true,
      skipStateWrite: true,
      skipGemini: true,
    });
    expect(report.results).toBeDefined();
    expect(report.digestSent).toBe(false);
    expect(report.warnings).toBeDefined();
    expect(report.warnings.staleFirms).toEqual([]);
    expect(report.warnings.lastRunStale).toBeNull();
    expect(report.recorder).toBeDefined();
    // Phase 4 D-08 — jsRenderFailures populated on every run (0 when no
    // js-render firms are enabled or all succeeded).
    expect(report.jsRenderFailures).toBe(0);
    // Phase 10 DQOBS-03 additions:
    expect(Array.isArray(report.markers)).toBe(true);  // always an array, may be empty
    expect(Array.isArray(report.firms)).toBe(true);
    expect(report.firms.length).toBeGreaterThan(0);     // at least the mocked firms
  });

  it('Phase 10 DQOBS-03: report.markers is a DataQualityMarker[] with valid kind values', async () => {
    const report = await runPipeline({ skipEmail: true, skipStateWrite: true });
    // markers is always a DataQualityMarker[] (possibly empty on clean runs)
    report.markers.forEach((m) => {
      expect(['cluster', 'low-confidence']).toContain(m.kind);
    });
  });
});

describe('runPipeline (Phase 4 browser lifecycle)', () => {
  beforeEach(() => {
    mocks.loadFirmsMock.mockReset().mockResolvedValue(FIRMS); // only rss + html
    mocks.loadRecipientMock.mockReset().mockResolvedValue('user@example.com');
    mocks.readStateMock.mockReset().mockResolvedValue({
      version: 1,
      lastUpdated: null,
      firms: {},
    });
    mocks.writeStateMock.mockReset().mockResolvedValue(undefined);
    mocks.fetchAllMock
      .mockReset()
      .mockImplementation(async (firms: typeof FIRMS) =>
        firms.map((f) => ({
          firm: f,
          raw: [],
          new: [],
          summarized: [],
          durationMs: 0,
        })),
      );
    mocks.enrichWithBodyMock.mockReset().mockImplementation(async (r: unknown) => r);
    mocks.applyKeywordFilterMock.mockReset().mockImplementation((r: unknown) => r);
    mocks.dedupAllMock
      .mockReset()
      .mockImplementation(
        (results: { raw: unknown[] }[]) =>
          results.map((r) => ({ ...r, new: [] })),
      );
    mocks.summarizeMock.mockReset();
    mocks.sendMailMock.mockReset().mockResolvedValue(undefined);
    mocks.writeArchiveMock.mockReset().mockResolvedValue('/tmp/fake-archive.html');
    mocks.chromiumLaunchMock
      .mockReset()
      .mockImplementation(() => {
        throw new Error('chromium.launch should not have been called when no js-render firm is enabled');
      });
    mocks.browserCloseMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does NOT call chromium.launch when no enabled firm has type="js-render"', async () => {
    // FIRMS (from describe above) contains only type: 'rss' and type: 'html'.
    // The short-circuit should skip chromium.launch entirely.
    await runPipeline({ skipEmail: true, skipStateWrite: true, skipGemini: true });
    expect(mocks.chromiumLaunchMock).not.toHaveBeenCalled();
  });

  it('DOES call chromium.launch exactly once when at least one firm is js-render, and closes the browser in finally', async () => {
    mocks.chromiumLaunchMock
      .mockReset()
      .mockResolvedValue({ close: mocks.browserCloseMock });
    const jsRenderFirm = {
      id: 'lee-ko',
      name: '광장',
      language: 'ko' as const,
      type: 'js-render' as const,
      url: 'https://example.com/lee-ko',
      timezone: 'Asia/Seoul',
      enabled: true,
      wait_for: 'ul#contentsList > li',
    };
    mocks.loadFirmsMock.mockResolvedValue([...FIRMS, jsRenderFirm]);

    await runPipeline({ skipEmail: true, skipStateWrite: true, skipGemini: true });

    expect(mocks.chromiumLaunchMock).toHaveBeenCalledTimes(1);
    expect(mocks.browserCloseMock).toHaveBeenCalledTimes(1);
  });

  it('closes the browser even when a mid-pipeline stage throws', async () => {
    mocks.chromiumLaunchMock
      .mockReset()
      .mockResolvedValue({ close: mocks.browserCloseMock });
    const jsRenderFirm = {
      id: 'lee-ko',
      name: '광장',
      language: 'ko' as const,
      type: 'js-render' as const,
      url: 'https://example.com/lee-ko',
      timezone: 'Asia/Seoul',
      enabled: true,
      wait_for: 'ul',
    };
    mocks.loadFirmsMock.mockResolvedValue([jsRenderFirm]);
    mocks.fetchAllMock.mockImplementationOnce(async () => {
      throw new Error('fetchAll exploded');
    });

    await expect(
      runPipeline({ skipEmail: true, skipStateWrite: true, skipGemini: true }),
    ).rejects.toThrow(/fetchAll exploded/);
    // Browser.close must still have fired via the outer finally{}.
    expect(mocks.browserCloseMock).toHaveBeenCalledTimes(1);
  });
});

// Phase 8 GUARD-01 Layer 1 short-circuit — added by Plan 08-02 Task 3.
// Exercises src/pipeline/run.ts body.trim().length < 100 gate.
describe('Phase 8 GUARD-01 Layer 1 short-circuit', () => {
  beforeEach(() => {
    // Reset from outer suite defaults; override only what this block needs.
    mocks.loadFirmsMock.mockReset().mockResolvedValue(FIRMS);
    mocks.loadRecipientMock.mockReset().mockResolvedValue('user@example.com');
    mocks.readStateMock.mockReset().mockResolvedValue({
      version: 1,
      lastUpdated: null,
      firms: {},
    });
    mocks.writeStateMock.mockReset().mockResolvedValue(undefined);
    mocks.enrichWithBodyMock
      .mockReset()
      .mockImplementation(async (r: unknown) => r);
    mocks.applyKeywordFilterMock
      .mockReset()
      .mockImplementation((r: unknown) => r);
    mocks.sendMailMock.mockReset().mockResolvedValue(undefined);
    mocks.writeArchiveMock.mockReset().mockResolvedValue('/tmp/fake.html');
  });

  it('body.trim().length < 100 → mocks.summarizeMock NOT called; summary_ko = item.title, summaryModel = "skipped"', async () => {
    // Synthesize ONE firm with ONE raw item whose description is 50 chars
    // (well below the 100-char Layer 1 threshold). After dedup marks it
    // new, runPipeline should short-circuit BEFORE invoking summarize.
    mocks.fetchAllMock
      .mockReset()
      .mockImplementation(async (firms: typeof FIRMS) =>
        firms.map((f) => ({
          firm: f,
          raw: [
            {
              firmId: f.id,
              title: `${f.id}-short-title`,
              url: `https://x/${f.id}/short`,
              language: f.language,
              description: 'x'.repeat(50), // 50 chars — SHORT per D-02
            },
          ],
          new: [],
          summarized: [],
          durationMs: 0,
        })),
      );
    mocks.dedupAllMock.mockReset().mockImplementation(
      (results: { raw: unknown[]; firm: unknown }[]) =>
        results.map((r) => ({
          ...r,
          new: (r.raw as Array<Record<string, unknown>>).map((i) => ({
            ...i,
            isNew: true as const,
          })),
        })),
    );
    // Trap: if summarizeMock IS called, we surface a clear error.
    mocks.summarizeMock.mockReset().mockImplementation(() => {
      throw new Error(
        'summarize() should NOT be called for short-body items (Layer 1 short-circuit)',
      );
    });

    const report = await runPipeline({
      skipEmail: true,
      skipStateWrite: true,
    });

    // Primary assertion — trap was never tripped.
    expect(mocks.summarizeMock).not.toHaveBeenCalled();

    // Every summarized item was short-circuited to title-verbatim.
    const items = report.results.flatMap((r) => r.summarized);
    expect(items.length).toBeGreaterThan(0);
    items.forEach((it) => {
      expect(it.summary_ko).toBe(it.title);
      expect(it.summaryConfidence).toBe('low');
      expect(it.summaryModel).toBe('skipped');
    });
  });

  it('body with real 150-char content → mocks.summarizeMock IS invoked once per item, summary_ko differs from title', async () => {
    const longBody = '가'.repeat(150); // 150 Hangul chars — passes Layer 1.
    mocks.fetchAllMock
      .mockReset()
      .mockImplementation(async (firms: typeof FIRMS) =>
        firms.map((f) => ({
          firm: f,
          raw: [
            {
              firmId: f.id,
              title: `${f.id}-long-title`,
              url: `https://x/${f.id}/long`,
              language: f.language,
              description: longBody,
            },
          ],
          new: [],
          summarized: [],
          durationMs: 0,
        })),
      );
    mocks.dedupAllMock.mockReset().mockImplementation(
      (results: { raw: unknown[]; firm: unknown }[]) =>
        results.map((r) => ({
          ...r,
          new: (r.raw as Array<Record<string, unknown>>).map((i) => ({
            ...i,
            isNew: true as const,
          })),
        })),
    );
    mocks.summarizeMock
      .mockReset()
      .mockImplementation(
        async (item: {
          url: string;
          firmId: string;
          title: string;
          language: string;
          description?: string;
        }) => ({
          ...item,
          isNew: true as const,
          summary_ko: '실제 요약 내용입니다. 3-5 줄 한국어 요약입니다.',
          summaryConfidence: 'high' as const,
          summaryModel: 'gemini-2.5-flash',
        }),
      );

    const report = await runPipeline({
      skipEmail: true,
      skipStateWrite: true,
    });

    // summarize was called for every new item (2 firms × 1 item each = 2).
    expect(mocks.summarizeMock).toHaveBeenCalledTimes(FIRMS.length);
    // Summarize was called with the 150-char body (not title substitution).
    const firstCallBody = mocks.summarizeMock.mock.calls[0][1];
    expect(firstCallBody).toBe(longBody);

    const items = report.results.flatMap((r) => r.summarized);
    expect(items.length).toBe(FIRMS.length);
    items.forEach((it) => {
      expect(it.summary_ko).not.toBe(it.title);
      expect(it.summary_ko).toContain('실제 요약');
      expect(it.summaryModel).toBe('gemini-2.5-flash');
    });
  });
});
