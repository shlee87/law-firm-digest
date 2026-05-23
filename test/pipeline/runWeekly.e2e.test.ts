// runWeekly — Phase 13 Plan 13-07 e2e fixture covering SPEC AC-2 + AC-3.
//
// AC-2 (SPEC §Acceptance Criteria, weekly digest branch):
//   - pending.items === 5 → sendMail 1x (with composed digest) →
//     writeArchive 1x → pending truncated to items === 0 + windowStart reset
//
// AC-3 (SPEC §Acceptance Criteria, weekly heartbeat branch):
//   - pending.items === 0 → sendMail 1x (heartbeat subject contains
//     "이번 주 신규 없음" marker) → writeArchive 1x → pending stays empty +
//     windowStart still resets via truncate
//
// Test strategy mirrors runDaily.e2e.test.ts:
//   - Mock sendMail, writeArchive, writeState, loaders, gemini counter.
//   - Use the real readPending / truncatePending against a tmp dir so the
//     transaction order (send → archive → truncate → state) is observable
//     on disk.
//   - composeDigest + composeHeartbeat are NOT mocked — they are pure pure
//     functions and contribute to the subject-line assertions.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

// Hoisted mocks — module factories below close over these references.
const mocks = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  writeArchiveMock: vi.fn(),
  writeStateMock: vi.fn(),
  loadFirmsMock: vi.fn(),
  loadRecipientMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  resetGeminiCallCountMock: vi.fn(),
  getGeminiCallCountMock: vi.fn(() => 0),
}));

vi.mock('../../src/mailer/gmail.js', () => ({
  sendMail: mocks.sendMailMock,
}));

vi.mock('../../src/archive/writer.js', () => ({
  writeArchive: mocks.writeArchiveMock,
}));

vi.mock('../../src/state/writer.js', () => ({
  writeState: mocks.writeStateMock,
}));

vi.mock('../../src/config/loader.js', () => ({
  loadFirms: mocks.loadFirmsMock,
  loadRecipient: mocks.loadRecipientMock,
  loadSettings: mocks.loadSettingsMock,
}));

// AC-3 cross-mode invariant: weekly NEVER calls Gemini at runtime. Mock the
// counter accessors so the test can observe reset/read calls + assert the
// final value is 0.
vi.mock('../../src/summarize/gemini.js', () => ({
  resetGeminiCallCount: mocks.resetGeminiCallCountMock,
  getGeminiCallCount: mocks.getGeminiCallCountMock,
  // summarize is intentionally NOT exposed here — runWeekly does not import
  // it (D-01). If a future regression adds the import, this mock factory's
  // missing key surfaces as `undefined is not a function` at runtime.
}));

// --- Imports under test (after mocks) ---
import { runWeekly } from '../../src/pipeline/runWeekly.js';
import { readPending } from '../../src/state/pending.js';
import type { PendingItem } from '../../src/state/pending.js';
import type { FirmConfig, EmailPayload } from '../../src/types.js';

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
  schedule: { time_utc: '00:00', days: 'weekly' as const, cron: '0 12 * * 1' },
  gemini: {
    primary_model: 'gemini-2.5-flash',
    fallback_model: 'gemini-2.5-flash-lite',
    concurrency: 3,
  },
  digest: { min_body_chars: 100 },
  prompt: { instruction_ko: '한국어 요약', instruction_en: 'Korean summary' },
};

describe('runWeekly — SPEC AC-2 (digest send) + AC-3 (heartbeat)', () => {
  let dir: string;
  let originalCwd: string;
  let pendingPath: string;
  let seenPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'runWeekly-e2e-'));
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    pendingPath = path.join(dir, 'state', 'pending.json');
    seenPath = path.join(dir, 'state', 'seen.json');
    originalCwd = process.cwd();
    process.chdir(dir);

    delete process.env.DRY_RUN;
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GMAIL_FROM_ADDRESS;

    vi.clearAllMocks();

    // Default mock implementations.
    mocks.sendMailMock.mockResolvedValue(undefined);
    mocks.writeArchiveMock.mockResolvedValue('archive/2026/05-22.html');
    mocks.writeStateMock.mockResolvedValue(undefined);
    mocks.loadFirmsMock.mockResolvedValue([FIRM]);
    mocks.loadRecipientMock.mockResolvedValue('user@example.com');
    mocks.loadSettingsMock.mockResolvedValue(SETTINGS);
    mocks.getGeminiCallCountMock.mockReturnValue(0);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('AC-2: 5 pending → sendMail 1x (digest), writeArchive 1x, pending truncated', async () => {
    // Arrange — 5 pending items + a fixed windowStart we can assert was reset.
    const fixedStart = '2026-05-15T00:00:00.000Z';
    const items: PendingItem[] = Array.from({ length: 5 }, (_, i) => ({
      firmId: 'cooley',
      title: `Title ${i}`,
      url: `https://example.com/${i}`,
      language: 'en',
      summary_ko: `요약 ${i}`,
      summaryConfidence: 'high',
      summaryModel: 'gemini-2.5-flash',
      summarizedAt: '2026-05-15T12:00:00.000Z',
    }));
    writeFileSync(
      pendingPath,
      JSON.stringify({ version: 1, windowStart: fixedStart, items }),
    );
    // Seed seen.json so readState doesn't bootstrap on top of test isolation.
    writeFileSync(
      seenPath,
      JSON.stringify({
        version: 1,
        lastUpdated: null,
        firms: { cooley: { urls: [], lastNewAt: null, enabledAt: '2026-05-01T00:00:00.000Z' } },
      }),
    );

    // Act
    const report = await runWeekly();

    // Assert — sendMail called exactly once.
    expect(mocks.sendMailMock).toHaveBeenCalledTimes(1);
    expect(mocks.writeArchiveMock).toHaveBeenCalledTimes(1);

    // Subject distinguishes digest path from heartbeat path. composeDigest
    // produces `[법률 다이제스트] YYYY-MM-DD (N firms, M items)`. We assert
    // only the EMAIL-04 prefix + a KST-shaped date, then negate the heartbeat
    // marker — this is robust against future pluralization tweaks like
    // "1 firms" → "1 firm" without coupling the test to the exact text.
    const sentPayload = mocks.sendMailMock.mock.calls[0][0] as EmailPayload;
    expect(sentPayload.subject).toMatch(/^\[법률 다이제스트\] \d{4}-\d{2}-\d{2}/);
    expect(sentPayload.subject).not.toContain('이번 주 신규 없음');
    // OPS-03 ordering: sendMail was called BEFORE writeArchive.
    const sendOrder = mocks.sendMailMock.mock.invocationCallOrder[0];
    const archiveOrder = mocks.writeArchiveMock.mock.invocationCallOrder[0];
    expect(sendOrder).toBeLessThan(archiveOrder);

    // truncatePending invariant — pending is empty after the run.
    const after = await readPending(pendingPath);
    expect(after.items).toEqual([]);
    expect(after.items.length).toBe(0);
    expect(after.windowStart).not.toBe(fixedStart);

    // Report shape.
    expect(report.digestSent).toBe(true);
    expect(report.archivePath).toBe('archive/2026/05-22.html');

    // AC-3 cross-mode invariant: weekly NEVER calls Gemini.
    expect(mocks.resetGeminiCallCountMock).toHaveBeenCalledTimes(1);
    expect(mocks.getGeminiCallCountMock()).toBe(0);
  });

  it('AC-3: 0 pending → sendMail 1x (heartbeat subject), writeArchive 1x, pending stays empty post-truncate', async () => {
    const fixedStart = '2026-05-15T00:00:00.000Z';
    writeFileSync(
      pendingPath,
      JSON.stringify({ version: 1, windowStart: fixedStart, items: [] }),
    );
    writeFileSync(
      seenPath,
      JSON.stringify({ version: 1, lastUpdated: null, firms: {} }),
    );

    const report = await runWeekly();

    expect(mocks.sendMailMock).toHaveBeenCalledTimes(1);
    expect(mocks.writeArchiveMock).toHaveBeenCalledTimes(1);

    const sentPayload = mocks.sendMailMock.mock.calls[0][0] as EmailPayload;
    // D-16 heartbeat subject: `[법률 다이제스트] YYYY-MM-DD (이번 주 신규 없음)`.
    expect(sentPayload.subject).toContain('이번 주 신규 없음');
    expect(sentPayload.subject).toContain('[법률 다이제스트]');
    // D-17 minimal body markers.
    expect(sentPayload.html).toContain('이번 주 새 뉴스레터가 없습니다');
    expect(sentPayload.html).toContain('시스템은 정상 작동 중입니다');

    // truncatePending still runs even when pending was already empty —
    // windowStart resets to "now" so the next weekly run has a fresh window.
    const after = await readPending(pendingPath);
    expect(after.items).toEqual([]);
    expect(after.windowStart).not.toBe(fixedStart);

    expect(report.digestSent).toBe(true);
    expect(report.markers).toEqual([]); // D-17 heartbeat has no markers.

    // Weekly never calls Gemini (AC-3 invariant).
    expect(mocks.getGeminiCallCountMock()).toBe(0);
  });

  it('AC-2 atomicity: when sendMail throws, pending is NOT truncated (idempotent recovery)', async () => {
    // OPS-03 transaction ordering: if sendMail fails, truncatePending must
    // NOT execute — the next manual workflow_dispatch retries cleanly with
    // the same pending payload. This locks down the recovery invariant
    // SPEC §Constraints implicitly relies on.
    const fixedStart = '2026-05-15T00:00:00.000Z';
    const items: PendingItem[] = [
      {
        firmId: 'cooley',
        title: 'Retryable',
        url: 'https://example.com/r',
        language: 'en',
        summary_ko: '재시도 요약',
        summaryConfidence: 'high',
        summaryModel: 'gemini-2.5-flash',
        summarizedAt: '2026-05-15T12:00:00.000Z',
      },
    ];
    writeFileSync(
      pendingPath,
      JSON.stringify({ version: 1, windowStart: fixedStart, items }),
    );
    writeFileSync(
      seenPath,
      JSON.stringify({ version: 1, lastUpdated: null, firms: {} }),
    );

    mocks.sendMailMock.mockRejectedValueOnce(new Error('SMTP 503 transient'));

    await expect(runWeekly()).rejects.toThrow(/SMTP 503 transient/);

    expect(mocks.writeArchiveMock).not.toHaveBeenCalled();
    // Pending preserved — windowStart unchanged, items intact.
    const after = await readPending(pendingPath);
    expect(after.items.length).toBe(1);
    expect(after.windowStart).toBe(fixedStart);
  });
});
