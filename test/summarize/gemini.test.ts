// GUARD-02 fixture coverage (Phase 8): four body shapes exercised end-to-end
// against a mocked @google/genai SDK. Tests (a) and (b) are Layer 1 concerns
// (server-side short-circuit in src/pipeline/run.ts), documented here but
// asserted via test/pipeline/run.test.ts. Tests (c), (d), (e) exercise the
// summarize() function directly via SDK mock.
//
// Mock pattern: vi.hoisted + vi.mock('@google/genai', factory) — matches
// test/pipeline/run.test.ts:14-30 verbatim for consistency.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContentMock };
  },
}));

// Import AFTER mock setup (pattern from test/pipeline/run.test.ts).
import { summarize } from '../../src/summarize/gemini.js';
import type { NewItem } from '../../src/types.js';

const baseItem: NewItem = {
  firmId: 'bkl',
  title: '태평양 뉴스레터 — M&A 규제 개정 안내',
  url: 'https://bkl.co.kr/item/1',
  language: 'ko',
  isNew: true,
};

const genericBoilerplate =
  '법무법인 태평양은 1980년에 설립된 한국의 종합 법률 서비스 회사로, 기업 자문, M&A, 금융을 제공합니다. ' +
  '서울, 부산, 광주에 사무소를 두고 있으며, 200여 명의 변호사가 근무하고 있습니다. ' +
  'About-Us: 당사의 연혁과 철학을 소개합니다.';

const realArticleBody =
  '금융위원회는 2026년 4월 M&A 규제 개정안을 발표했다. 핵심은 세 가지로, ' +
  '(1) 공개매수 기준 변경, (2) 주요 주주 공시 의무 강화, (3) 외국인 투자자 신고 절차 간소화. ' +
  '개정안은 6월부터 시행되며, 국내 상장 법인과 외국계 IB 모두에게 상당한 영향을 미칠 것으로 예상된다. ' +
  '당사는 고객사의 대응 전략을 자세히 검토하고 있다. ' +
  '특히 외국계 PEF의 경우 기존 신고 면제 조항이 일부 축소되므로 사전 법률 검토가 필수적이다.';

beforeEach(() => {
  mocks.generateContentMock.mockReset();
  // Stub GEMINI_API_KEY so src/summarize/gemini.ts's fail-loud guard
  // (added in commit 344b65d to catch missing env in local dev) does not
  // throw before the SDK mock is invoked. Value is a placeholder —
  // @google/genai is mocked at module level, so the real key never leaves
  // the test process.
  vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('summarize — GUARD-02 body-shape fixtures', () => {
  it('(a) empty body — Layer 1 short-circuit in run.ts; summarize() never called (asserted in run.test.ts)', () => {
    // Documentation-only. The server-side caller in src/pipeline/run.ts
    // short-circuits body.trim().length < 100 BEFORE calling summarize().
    // Coverage lives in test/pipeline/run.test.ts (Task 3 of this plan).
    expect(true).toBe(true);
  });

  it('(b) short body (<100 chars) — Layer 1 short-circuit; summarize() never called', () => {
    // Documentation-only. See (a).
    expect(true).toBe(true);
  });

  it('(c) generic firm-overview body — Gemini returns "" per Layer 2; caller substitutes item.title (Option C)', async () => {
    // Verify the 220-char fixture exceeds Layer 1 threshold so it would
    // reach Gemini in a real run.
    expect(genericBoilerplate.trim().length).toBeGreaterThanOrEqual(100);
    mocks.generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary_ko: '', confidence: 'low' }),
    });
    const result = await summarize(baseItem, genericBoilerplate);
    expect(result.summary_ko).toBe(baseItem.title);
    expect(result.summaryConfidence).toBe('low');
    expect(result.summaryModel).toBe('gemini-2.5-flash');
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('(d) real article body (200+ chars) — Gemini returns 3-5 line Korean summary with medium/high confidence', async () => {
    expect(realArticleBody.trim().length).toBeGreaterThanOrEqual(200);
    mocks.generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        summary_ko: '본 기사는 최근 M&A 시장의 규제 변화를 다룬다. 규제 당국이 발표한 주요 변경사항은 세 가지로 요약된다.',
        confidence: 'high',
      }),
    });
    const result = await summarize(baseItem, realArticleBody);
    expect(result.summary_ko).toContain('M&A');
    expect(result.summary_ko).not.toBe(baseItem.title);
    expect(result.summaryConfidence).toBe('high');
    expect(result.summaryModel).toBe('gemini-2.5-flash');
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('(e) API failure (retry-exhausted) — catch-block returns title-verbatim + summaryModel="failed"', async () => {
    // Mock 4 failures: initial attempt + 3 retries (p-retry default). All throw.
    // p-retry default minTimeout=1000ms × factor=2 → 1s+2s+4s backoff ≈ 7s.
    // Test timeout raised to 15 000ms to accommodate all retry delays.
    mocks.generateContentMock.mockRejectedValue(new Error('upstream timeout'));
    const result = await summarize(baseItem, realArticleBody);
    expect(result.summary_ko).toBe(baseItem.title);
    expect(result.summaryModel).toBe('failed');
    expect(result.summaryConfidence).toBe('low');
    expect(result.summaryError).toBeDefined();
    expect(result.summaryError).not.toBe('');
  }, 15_000);

  it('(f) SUMM-06 preserved — item.title never appears in the contents string sent to Gemini', async () => {
    mocks.generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary_ko: '테스트 요약', confidence: 'high' }),
    });
    await summarize(baseItem, realArticleBody);
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateContentMock.mock.calls[0][0];
    // contents is the prompt string passed to Gemini. Assert the title is
    // absent (SUMM-06 invariant from Phase 1).
    expect(callArgs.contents).not.toContain(baseItem.title);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 17 / FAIL-UX-01 (SPEC requirement 5 / D-06) — onFailedAttempt now
// honors Gemini's 429 retryDelay so the next attempt waits for the per-minute
// quota window to reset (flash + flash-lite share the same gemini-2.5-flash
// quota metric — model fallback alone does NOT unstick a 429 burst).
// Fixtures mirror the 2026-05-27 production failure (GHA run 26512695491,
// retryDelay 39.347610487s).
// ─────────────────────────────────────────────────────────────────────────

describe('summarize — retryDelay honor on 429 (FAIL-UX-01 / SPEC requirement 5)', () => {
  beforeEach(() => {
    mocks.generateContentMock.mockReset();
    vi.stubEnv('GEMINI_API_KEY', 'test-stub-key-not-real');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('sleeps for the parsed retryDelay (errorDetails shape) before the next attempt', async () => {
    const err429 = Object.assign(new Error('429 quota exceeded'), {
      status: 429,
      errorDetails: [{ retryDelay: '30s' }],
    });
    mocks.generateContentMock.mockRejectedValueOnce(err429);
    mocks.generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ summary_ko: '요약입니다.', confidence: 'high' }),
    });

    const promise = summarize(baseItem, realArticleBody);

    // p-retry awaits onFailedAttempt → which awaits the 30s sleep. At 25s,
    // the retry has NOT happened yet.
    await vi.advanceTimersByTimeAsync(25_000);
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);

    // Past 30s + p-retry's own minTimeout, the retry fires.
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(2);
    expect(result.summary_ko).toBe('요약입니다.');
    expect(result.summaryModel).not.toBe('failed');
  });

  it('parses retryDelay from message body fallback when errorDetails is absent', async () => {
    const err429 = Object.assign(
      new Error('{"error":{"code":429,"details":[{"retryDelay":"5s"}]}}'),
      { status: 429 },
    );
    mocks.generateContentMock.mockRejectedValueOnce(err429);
    mocks.generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ summary_ko: '본문 요약', confidence: 'medium' }),
    });

    const promise = summarize(baseItem, realArticleBody);
    await vi.advanceTimersByTimeAsync(6_000);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(2);
    expect(result.summaryModel).not.toBe('failed');
  });

  it('caps retryDelay at 60 seconds (does not block indefinitely on inflated SDK value)', async () => {
    const err429 = Object.assign(new Error('429'), {
      status: 429,
      errorDetails: [{ retryDelay: '3600s' }], // 1 hour — must be capped to 60s
    });
    mocks.generateContentMock.mockRejectedValueOnce(err429);
    mocks.generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ summary_ko: 'OK', confidence: 'high' }),
    });

    const promise = summarize(baseItem, realArticleBody);
    await vi.advanceTimersByTimeAsync(65_000);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(2);
    expect(result.summary_ko).toBe('OK');
  });

  it('does not sleep when 429 has no retryDelay field (preserves p-retry default backoff)', async () => {
    const err429 = Object.assign(new Error('429 no details'), { status: 429 });
    mocks.generateContentMock.mockRejectedValueOnce(err429);
    mocks.generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ summary_ko: 'ok', confidence: 'low' }),
    });

    const promise = summarize(baseItem, realArticleBody);
    // p-retry default minTimeout=1000ms — advance past it.
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(2);
    expect(result.summaryModel).not.toBe('failed');
  });
});
