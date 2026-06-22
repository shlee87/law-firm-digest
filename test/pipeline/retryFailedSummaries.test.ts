// plan 260622-p9j Task 2 — four tests covering cross-day retry of failed Gemini summaries.
//
// (a) retry pre-pass recovers a failed item using stored summaryBody
// (b) retry stops at CAP=3 attempts — item unchanged when summaryAttempts===3
// (c) toPendingItem persists summaryBody on failure, omits on success (unit test)
// (d) weekly run: geminiCallCount stays 0 (D-01 — summarize not called)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { toPendingItem, type PendingItem } from '../../src/state/pending.js';
import type { SummarizedItem, FirmConfig, RawItem } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Shared mocks (hoisted)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  // pipeline mocks for runDaily
  fetchAllMock: vi.fn(),
  enrichWithBodyMock: vi.fn(),
  summarizeMock: vi.fn(),
  resetGeminiCallCountMock: vi.fn(),
  getGeminiCallCountMock: vi.fn(() => 0),
  loadFirmsMock: vi.fn(),
  loadRecipientMock: vi.fn(),
  loadTopicsMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  writeStateMock: vi.fn(),
  // runWeekly mocks
  sendMailMock: vi.fn(),
  writeArchiveMock: vi.fn(),
}));

vi.mock('../../src/pipeline/fetch.js', () => ({
  fetchAll: mocks.fetchAllMock,
}));

vi.mock('../../src/pipeline/enrichBody.js', () => ({
  enrichWithBody: mocks.enrichWithBodyMock,
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

vi.mock('../../src/state/writer.js', () => ({
  writeState: mocks.writeStateMock,
}));

vi.mock('../../src/mailer/gmail.js', () => ({
  sendMail: mocks.sendMailMock,
}));

vi.mock('../../src/archive/writer.js', () => ({
  writeArchive: mocks.writeArchiveMock,
}));

// Imports under test (after mocks)
import { runDaily } from '../../src/pipeline/runDaily.js';
import { runWeekly } from '../../src/pipeline/runWeekly.js';
import { readPending } from '../../src/state/pending.js';

const FIRM: FirmConfig = {
  id: 'bkl',
  name: 'BKL',
  language: 'ko',
  type: 'html',
  url: 'https://bkl.co.kr/insights',
  timezone: 'Asia/Seoul',
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
  digest: { min_body_chars: 10 },
  prompt: { instruction_ko: '한국어 요약', instruction_en: 'Korean summary' },
};

// A pending item in failed state with summaryBody stored
function makeFailedPendingItem(overrides: Partial<PendingItem> = {}): PendingItem {
  return {
    firmId: 'bkl',
    title: '법무법인 광장 업데이트',
    url: 'https://bkl.co.kr/item/1',
    language: 'ko',
    summary_ko: null,
    summaryConfidence: 'low',
    summaryModel: 'failed',
    summarizedAt: '2026-06-20T12:00:00.000Z',
    summaryBody: '광장 법률 업데이트 내용입니다. 이번 달 규제 변경 사항을 요약합니다.',
    summaryAttempts: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test (a) + (b): runDaily pre-pass tests
// ---------------------------------------------------------------------------
describe('retry pre-pass in runDaily', () => {
  let dir: string;
  let originalCwd: string;
  let pendingPath: string;
  let seenPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'retry-prepass-'));
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    pendingPath = path.join(dir, 'state', 'pending.json');
    seenPath = path.join(dir, 'state', 'seen.json');
    originalCwd = process.cwd();
    process.chdir(dir);

    delete process.env.DRY_RUN;
    delete process.env.GITHUB_STEP_SUMMARY;

    vi.clearAllMocks();

    mocks.loadFirmsMock.mockResolvedValue([FIRM]);
    mocks.loadRecipientMock.mockResolvedValue('user@example.com');
    mocks.loadTopicsMock.mockResolvedValue({});
    mocks.loadSettingsMock.mockResolvedValue(SETTINGS);
    mocks.getGeminiCallCountMock.mockReturnValue(0);
    mocks.writeStateMock.mockResolvedValue(undefined);

    // fetchAll returns 0 new items — pre-pass is the only Gemini activity
    mocks.fetchAllMock.mockResolvedValue([
      { firm: FIRM, raw: [], new: [], summarized: [], durationMs: 5 },
    ]);
    // enrichWithBody passes through unchanged
    mocks.enrichWithBodyMock.mockImplementation(async (results: unknown) => results);

    // Seed seen.json (non-bootstrap path)
    writeFileSync(
      seenPath,
      JSON.stringify({
        version: 1,
        lastUpdated: '2026-06-20T00:00:00.000Z',
        firms: {
          bkl: {
            urls: ['https://bkl.co.kr/item/1'],
            lastNewAt: '2026-06-20T00:00:00.000Z',
            enabledAt: '2026-06-01T00:00:00.000Z',
          },
        },
      }),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('(a) recovers a failed item using stored summaryBody', async () => {
    // Arrange: one failed item in pending with summaryBody and summaryAttempts=1
    const failedItem = makeFailedPendingItem();
    writeFileSync(
      pendingPath,
      JSON.stringify({
        version: 1,
        windowStart: '2026-06-15T00:00:00.000Z',
        items: [failedItem],
      }),
    );

    // summarize succeeds on retry
    mocks.summarizeMock.mockResolvedValueOnce({
      firmId: failedItem.firmId,
      title: failedItem.title,
      url: failedItem.url,
      language: failedItem.language,
      isNew: true as const,
      summary_ko: '이번 달 규제 변경 사항 한국어 요약입니다.',
      summaryConfidence: 'high' as const,
      summaryModel: 'gemini-2.5-flash',
    } satisfies SummarizedItem);

    // Act
    await runDaily({ skipStateWrite: true });

    // Assert: pending item is now recovered
    const pending = await readPending(pendingPath);
    expect(pending.items).toHaveLength(1);
    const updated = pending.items[0];
    expect(updated.summaryModel).not.toBe('failed');
    expect(updated.summaryModel).toBe('gemini-2.5-flash');
    expect(updated.summary_ko).toBe('이번 달 규제 변경 사항 한국어 요약입니다.');
    // COMP-05: summaryBody deleted on success
    expect(updated.summaryBody).toBeUndefined();
    // summaryAttempts bumped
    expect(updated.summaryAttempts).toBe(2);
  });

  it('(b) stops retrying when summaryAttempts === CAP (3)', async () => {
    // Arrange: item already at CAP — must NOT be retried
    const cappedItem = makeFailedPendingItem({ summaryAttempts: 3 });
    const windowStart = '2026-06-15T00:00:00.000Z';
    writeFileSync(
      pendingPath,
      JSON.stringify({
        version: 1,
        windowStart,
        items: [cappedItem],
      }),
    );

    // Act
    await runDaily({ skipStateWrite: true });

    // Assert: summarize was NOT called for the capped item
    expect(mocks.summarizeMock).not.toHaveBeenCalled();

    // Item in pending must be unchanged (no updatePending mutation for capped items)
    const pending = await readPending(pendingPath);
    expect(pending.items).toHaveLength(1);
    const item = pending.items[0];
    expect(item.summaryModel).toBe('failed');
    expect(item.summaryAttempts).toBe(3);
    expect(item.summaryBody).toBe(cappedItem.summaryBody);
  });
});

// ---------------------------------------------------------------------------
// Test (c): toPendingItem unit test — summaryBody on failure, omit on success
// ---------------------------------------------------------------------------
describe('toPendingItem — summaryBody persistence (COMP-05)', () => {
  const now = new Date('2026-06-22T12:00:00.000Z');
  const body = '광장 법률 업데이트 내용입니다. 이번 달 규제 변경 사항을 요약합니다.';

  it('(c) persists summaryBody + summaryAttempts=1 on failure, omits on success', () => {
    const base = {
      firmId: 'bkl',
      title: '법무법인 광장',
      url: 'https://bkl.co.kr/item/1',
      language: 'ko' as const,
      isNew: true as const,
      summaryConfidence: 'low' as const,
    };

    // Failed item with body → summaryBody stored
    const failedItem: SummarizedItem = {
      ...base,
      summary_ko: null,
      summaryModel: 'failed',
    };
    const failedPending = toPendingItem(failedItem, now, body);
    expect(failedPending.summaryBody).toBe(body);
    expect(failedPending.summaryAttempts).toBe(1);

    // Successful item with body → summaryBody NOT stored (COMP-05)
    const successItem: SummarizedItem = {
      ...base,
      summary_ko: '한국어 요약입니다.',
      summaryConfidence: 'high' as const,
      summaryModel: 'gemini-2.5-flash',
    };
    const successPending = toPendingItem(successItem, now, body);
    expect(successPending.summaryBody).toBeUndefined();
    expect(successPending.summaryAttempts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test (d): runWeekly — geminiCallCount stays 0
// ---------------------------------------------------------------------------
describe('runWeekly — D-01 invariant: geminiCallCount stays 0', () => {
  let dir: string;
  let originalCwd: string;
  let pendingPath: string;
  let seenPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'runWeekly-d01-'));
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    pendingPath = path.join(dir, 'state', 'pending.json');
    seenPath = path.join(dir, 'state', 'seen.json');
    originalCwd = process.cwd();
    process.chdir(dir);

    delete process.env.DRY_RUN;
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GMAIL_FROM_ADDRESS;

    vi.clearAllMocks();

    mocks.loadFirmsMock.mockResolvedValue([FIRM]);
    mocks.loadRecipientMock.mockResolvedValue('user@example.com');
    mocks.loadTopicsMock.mockResolvedValue({});
    mocks.loadSettingsMock.mockResolvedValue(SETTINGS);
    mocks.getGeminiCallCountMock.mockReturnValue(0);
    mocks.writeStateMock.mockResolvedValue(undefined);
    mocks.sendMailMock.mockResolvedValue(undefined);
    mocks.writeArchiveMock.mockResolvedValue('archive/2026/06-22.html');

    writeFileSync(
      seenPath,
      JSON.stringify({ version: 1, lastUpdated: null, firms: {} }),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('(d) weekly run does not call summarize — geminiCallCount stays 0', async () => {
    // Arrange: one succeeded item in pending (weekly digest path)
    writeFileSync(
      pendingPath,
      JSON.stringify({
        version: 1,
        windowStart: '2026-06-15T00:00:00.000Z',
        items: [
          {
            firmId: 'bkl',
            title: '법무법인 광장 업데이트',
            url: 'https://bkl.co.kr/item/2',
            language: 'ko',
            summary_ko: '지난 주 법률 동향 요약.',
            summaryConfidence: 'high',
            summaryModel: 'gemini-2.5-flash',
            summarizedAt: '2026-06-20T12:00:00.000Z',
          },
        ],
      }),
    );

    // Act
    await runWeekly({ skipStateWrite: true });

    // D-01 invariant: summarize was never called in the weekly run
    expect(mocks.summarizeMock).not.toHaveBeenCalled();
    // geminiCallCount stays 0
    expect(mocks.getGeminiCallCountMock()).toBe(0);
  });
});
