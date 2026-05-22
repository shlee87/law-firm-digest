// Phase 13 D-18/D-20: module-level geminiCallCount counter coverage.
// Counter must increment on every ai.models.generateContent attempt — including
// p-retry retries on 429 and the fallback (flash → flash-lite) swap — because
// all of them consume RPD quota. The summaryModel post-tally approach is
// insufficient; this module-level counter is the single source of truth for
// SPEC AC-7's `[METRIC] geminiCallCount=N` step-summary marker.
//
// Mock pattern: vi.hoisted + vi.mock('@google/genai', ...) — mirrors
// test/summarize/guard01Layer2.test.ts:12-20 verbatim for consistency.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContentMock };
  },
}));

// Import AFTER mock setup.
import {
  summarize,
  getGeminiCallCount,
  resetGeminiCallCount,
} from '../../src/summarize/gemini.js';
import type { NewItem } from '../../src/types.js';

const baseItem: NewItem = {
  firmId: 'cooley',
  title: 'Test article',
  url: 'https://example.com/x',
  language: 'en',
  description: 'A '.repeat(200),
  isNew: true,
};

const realBody = 'A '.repeat(200);

describe('src/summarize/gemini.ts module-level geminiCallCount (D-18)', () => {
  beforeEach(() => {
    resetGeminiCallCount();
    mocks.generateContentMock.mockReset();
    vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
  });

  afterEach(() => {
    resetGeminiCallCount();
    vi.unstubAllEnvs();
  });

  it('starts at 0 on fresh module load (after reset)', () => {
    expect(getGeminiCallCount()).toBe(0);
  });

  it('resetGeminiCallCount() returns counter to 0 after a successful summarize call', async () => {
    mocks.generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary_ko: '요약', confidence: 'high' }),
    });
    await summarize(baseItem, realBody);
    expect(getGeminiCallCount()).toBeGreaterThan(0);
    resetGeminiCallCount();
    expect(getGeminiCallCount()).toBe(0);
  });

  it('missing GEMINI_API_KEY: counter does NOT increment (AbortError bypasses generateContent)', async () => {
    vi.unstubAllEnvs();
    delete process.env.GEMINI_API_KEY;
    await summarize(baseItem, realBody);
    expect(getGeminiCallCount()).toBe(0);
    // generateContent must not have been invoked either (AbortError fires
    // before SDK construction reaches the call site).
    expect(mocks.generateContentMock).not.toHaveBeenCalled();
  });

  it('successful single call: counter === 1', async () => {
    mocks.generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary_ko: '요약', confidence: 'high' }),
    });
    await summarize(baseItem, realBody);
    expect(getGeminiCallCount()).toBe(1);
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('transient 429 then success: counter increments per attempt (retry is counted)', async () => {
    let attempt = 0;
    mocks.generateContentMock.mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        const err: Error & { status?: number } = new Error('429 rate limit');
        err.status = 429;
        throw err;
      }
      return { text: JSON.stringify({ summary_ko: '요약', confidence: 'high' }) };
    });
    await summarize(baseItem, realBody);
    // Initial attempt (429) + at least one retry that succeeds → ≥ 2 calls.
    expect(getGeminiCallCount()).toBeGreaterThanOrEqual(2);
    // p-retry counter must match the SDK invocation count exactly.
    expect(getGeminiCallCount()).toBe(mocks.generateContentMock.mock.calls.length);
  }, 15_000);
});
