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
                description: 'body',
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
  });

  it('writeStepSummary runs in finally block — propagates throw from fetchAll', async () => {
    vi.stubEnv('GITHUB_STEP_SUMMARY', join(tempDir, 'summary.md'));
    mocks.fetchAllMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(runPipeline({})).rejects.toThrow(/boom/);
    // The assertion is that the finally block did not swallow the throw.
  });

  it('RunReport shape — results, digestSent, warnings, recorder populated', async () => {
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
  });
});
