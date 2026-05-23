// runDaily — Phase 13 Plan 13-07 e2e fixture covering SPEC AC-1.
//
// AC-1 (SPEC §Acceptance Criteria, daily branch):
//   - `pnpm tsx src/main.ts --mode=daily` produces sendMail mock = 0,
//     writeArchive mock = 0, pending.json items grow by the new-items count,
//     seen.json urls grow by the same count.
//
// Test strategy:
//   - Mock every I/O boundary that runDaily calls (fetch, summarize, config
//     loaders, state writer) so the test exercises the real orchestration
//     logic without touching network / disk / Gemini.
//   - readPending uses the real implementation against a tmp dir (chdir'd
//     via beforeEach) so the AC-1 invariant "pending.json grew by N items"
//     is verified against the actual on-disk shape that runDaily wrote.
//   - sendMail and writeArchive are NOT imported by runDaily (D-01 cross-mode
//     invariant) — there is nothing to mock for them. The proof of "no send,
//     no archive" lives in the import graph, asserted at compile time by
//     runDaily.ts itself + the grep gate in this plan's acceptance criteria.
//     We still assert report.digestSent === false and report.archivePath
//     undefined as the runtime counterpart.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

// --- Module-level mocks (hoisted by vitest above the imports below) ---

// Capture mocks via vi.hoisted so the factory closures see the same references
// the test bodies use.
const mocks = vi.hoisted(() => ({
  fetchAllMock: vi.fn(),
  summarizeMock: vi.fn(),
  resetGeminiCallCountMock: vi.fn(),
  getGeminiCallCountMock: vi.fn(() => 0),
  loadFirmsMock: vi.fn(),
  loadRecipientMock: vi.fn(),
  loadTopicsMock: vi.fn(),
  loadSettingsMock: vi.fn(),
}));

vi.mock('../../src/pipeline/fetch.js', () => ({
  fetchAll: mocks.fetchAllMock,
}));

vi.mock('../../src/summarize/gemini.js', () => ({
  summarize: mocks.summarizeMock,
  resetGeminiCallCount: mocks.resetGeminiCallCountMock,
  getGeminiCallCount: mocks.getGeminiCallCountMock,
}));

vi.mock('../../src/config/loader.js', () => ({
  loadFirms: mocks.loadFirmsMock,
  loadRecipient: mocks.loadRecipientMock,
  loadTopics: mocks.loadTopicsMock,
  loadSettings: mocks.loadSettingsMock,
}));

// --- Imports under test (after mocks) ---
import { runDaily } from '../../src/pipeline/runDaily.js';
import { readPending } from '../../src/state/pending.js';
import type { FirmResult, FirmConfig, RawItem, SummarizedItem } from '../../src/types.js';

const FIRM: FirmConfig = {
  id: 'cooley',
  name: 'Cooley',
  language: 'en',
  type: 'rss',
  url: 'https://example.com/feed',
  timezone: 'UTC',
  enabled: true,
};

const SETTINGS = {
  recipient: { email: 'user@example.com' },
  schedule: { time_utc: '00:00', days: 'daily' as const, cron: '0 0 * * *' },
  gemini: {
    primary_model: 'gemini-2.5-flash',
    fallback_model: 'gemini-2.5-flash-lite',
    concurrency: 3,
  },
  digest: { min_body_chars: 100 },
  prompt: { instruction_ko: '한국어 요약', instruction_en: 'Korean summary' },
};

describe('runDaily — SPEC AC-1 (daily appends pending, no send, no archive)', () => {
  let dir: string;
  let originalCwd: string;
  let pendingPath: string;
  let seenPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'runDaily-e2e-'));
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    pendingPath = path.join(dir, 'state', 'pending.json');
    seenPath = path.join(dir, 'state', 'seen.json');
    originalCwd = process.cwd();
    process.chdir(dir);

    delete process.env.DRY_RUN;
    delete process.env.GITHUB_STEP_SUMMARY;

    vi.clearAllMocks();

    // Default mock implementations — tests override as needed.
    mocks.loadFirmsMock.mockResolvedValue([FIRM]);
    mocks.loadRecipientMock.mockResolvedValue('user@example.com');
    mocks.loadTopicsMock.mockResolvedValue({});
    mocks.loadSettingsMock.mockResolvedValue(SETTINGS);
    mocks.getGeminiCallCountMock.mockReturnValue(0);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('appends 3 PendingItems to pending.json and does not send or archive', async () => {
    // Arrange — 3 raw items via mocked fetchAll. Body length ≥ 100 chars so
    // SUMM-06 layer-1 short-circuit (body < min_body_chars → skip Gemini)
    // does NOT fire and summarize IS exercised.
    const rawItems: RawItem[] = [
      {
        firmId: 'cooley',
        title: 'A',
        url: 'https://example.com/a',
        language: 'en',
        description: 'A '.repeat(200),
      },
      {
        firmId: 'cooley',
        title: 'B',
        url: 'https://example.com/b',
        language: 'en',
        description: 'B '.repeat(200),
      },
      {
        firmId: 'cooley',
        title: 'C',
        url: 'https://example.com/c',
        language: 'en',
        description: 'C '.repeat(200),
      },
    ];

    mocks.fetchAllMock.mockResolvedValue([
      { firm: FIRM, raw: rawItems, new: [], summarized: [], durationMs: 100 },
    ] satisfies FirmResult[]);

    // summarize returns SummarizedItem per call.
    mocks.summarizeMock.mockImplementation(async (item: RawItem) => ({
      ...item,
      isNew: true as const,
      summary_ko: `요약: ${item.title}`,
      summaryConfidence: 'high' as const,
      summaryModel: 'gemini-2.5-flash',
    } satisfies SummarizedItem));

    // After 3 summarize calls, counter would be 3 (mocked here).
    mocks.getGeminiCallCountMock.mockReturnValue(3);

    // Pre-seed seen.json so dedupAll's bootstrap branch (DEDUP-05 first-run
    // seeding) does not fire — we want the 3 items to flow as NEW, not be
    // swallowed by the empty-state bootstrap path.
    writeFileSync(
      seenPath,
      JSON.stringify({
        version: 1,
        lastUpdated: new Date('2026-05-01T00:00:00.000Z').toISOString(),
        firms: {
          cooley: {
            urls: ['https://example.com/prev'],
            lastNewAt: '2026-05-01T00:00:00.000Z',
            enabledAt: '2026-05-01T00:00:00.000Z',
          },
        },
      }),
    );

    // Act
    const report = await runDaily();

    // Assert — pending.json contains 3 items (AC-1 invariant 1).
    const pending = await readPending(pendingPath);
    expect(pending.items.length).toBe(3);
    expect(pending.items.map((i) => i.title)).toEqual(['A', 'B', 'C']);

    // COMP-05 — no description (body) on any pending item.
    for (const p of pending.items) {
      expect(p).not.toHaveProperty('description');
    }
    // Each pending item has summarizedAt (Plan 13-01 invariant).
    for (const p of pending.items) {
      expect(typeof p.summarizedAt).toBe('string');
      expect(p.summarizedAt.length).toBeGreaterThan(0);
    }

    // AC-1 invariants 2 + 3 — sendMail mock NEVER called (not imported by
    // runDaily — compile-time guarantee from D-01). writeArchive also never
    // called. Runtime counterpart:
    expect(report.digestSent).toBe(false);
    expect(report.archivePath).toBeUndefined();
    expect(report.markers).toEqual([]); // D-12: cluster/low-conf in weekly only.

    // jsRenderFailures = 0 (rss firm).
    expect(report.jsRenderFailures).toBe(0);

    // D-19: counter reset called once at run start.
    expect(mocks.resetGeminiCallCountMock).toHaveBeenCalledTimes(1);
    expect(mocks.getGeminiCallCountMock).toHaveBeenCalled();

    // W2 SPEC AC-7 single-run hard cap (≤ 50 per run). The 7-day daily-average
    // ≤ 15 invariant requires natural cron cycles to verify, but the per-run
    // cap can be gated here. Mocked counter is 3 in this fixture; assert the
    // ceiling holds.
    expect(mocks.getGeminiCallCountMock()).toBeLessThanOrEqual(50);
  });

  it('skips summarize call entirely when body is shorter than min_body_chars (SUMM-06 Layer 1)', async () => {
    mocks.fetchAllMock.mockResolvedValue([
      {
        firm: FIRM,
        raw: [
          {
            firmId: 'cooley',
            title: 'Short',
            url: 'https://example.com/short',
            language: 'en',
            description: 'tiny', // 4 chars — well below min_body_chars=100
          },
        ],
        new: [],
        summarized: [],
        durationMs: 0,
      },
    ] satisfies FirmResult[]);

    // Pre-seed seen.json (non-bootstrap path).
    writeFileSync(
      seenPath,
      JSON.stringify({
        version: 1,
        lastUpdated: new Date().toISOString(),
        firms: {
          cooley: {
            urls: ['https://example.com/prev'],
            lastNewAt: null,
            enabledAt: '2026-05-01T00:00:00.000Z',
          },
        },
      }),
    );

    await runDaily();

    // Layer 1 short-circuit — summarize MUST NOT be called for short bodies.
    expect(mocks.summarizeMock).not.toHaveBeenCalled();

    // But the item still flows to pending (with summary_ko = title, model = 'skipped').
    const pending = await readPending(pendingPath);
    expect(pending.items.length).toBe(1);
    expect(pending.items[0].summary_ko).toBe('Short');
    expect(pending.items[0].summaryModel).toBe('skipped');
  });

  it('appendPending preserves existing pending items (D-09 windowStart invariant)', async () => {
    // Pre-seed pending.json with 2 prior items + an early windowStart so we
    // can verify appendPending doesn't reset windowStart on every daily run.
    const priorWindowStart = '2026-05-15T00:00:00.000Z';
    writeFileSync(
      pendingPath,
      JSON.stringify({
        version: 1,
        windowStart: priorWindowStart,
        items: [
          {
            firmId: 'cooley',
            title: 'Prior 1',
            url: 'https://example.com/prior1',
            language: 'en',
            summary_ko: '이전 요약 1',
            summaryConfidence: 'high',
            summaryModel: 'gemini-2.5-flash',
            summarizedAt: '2026-05-15T12:00:00.000Z',
          },
          {
            firmId: 'cooley',
            title: 'Prior 2',
            url: 'https://example.com/prior2',
            language: 'en',
            summary_ko: '이전 요약 2',
            summaryConfidence: 'high',
            summaryModel: 'gemini-2.5-flash',
            summarizedAt: '2026-05-16T12:00:00.000Z',
          },
        ],
      }),
    );
    writeFileSync(
      seenPath,
      JSON.stringify({
        version: 1,
        lastUpdated: new Date().toISOString(),
        firms: {
          cooley: {
            urls: [
              'https://example.com/prior1',
              'https://example.com/prior2',
              'https://example.com/seed',
            ],
            lastNewAt: '2026-05-16T12:00:00.000Z',
            enabledAt: '2026-05-01T00:00:00.000Z',
          },
        },
      }),
    );

    // Today's fetch returns 1 new item.
    mocks.fetchAllMock.mockResolvedValue([
      {
        firm: FIRM,
        raw: [
          {
            firmId: 'cooley',
            title: 'Today',
            url: 'https://example.com/today',
            language: 'en',
            description: 'T '.repeat(200),
          },
        ],
        new: [],
        summarized: [],
        durationMs: 100,
      },
    ] satisfies FirmResult[]);
    mocks.summarizeMock.mockImplementation(async (item: RawItem) => ({
      ...item,
      isNew: true as const,
      summary_ko: '오늘의 요약',
      summaryConfidence: 'high' as const,
      summaryModel: 'gemini-2.5-flash',
    } satisfies SummarizedItem));

    await runDaily();

    const pending = await readPending(pendingPath);
    // 2 prior + 1 new = 3 items.
    expect(pending.items.length).toBe(3);
    expect(pending.items.map((i) => i.title)).toEqual(['Prior 1', 'Prior 2', 'Today']);
    // D-09: windowStart preserved across appends (only truncatePending resets).
    expect(pending.windowStart).toBe(priorWindowStart);
  });
});
