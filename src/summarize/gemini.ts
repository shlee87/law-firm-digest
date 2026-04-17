// Gemini summarization client — the single sanctioned LLM boundary for
// the LegalNewsletter pipeline. All @google/genai calls live in this file;
// no other module may import from '@google/genai'.
//
// Requirements mapping (see .planning/REQUIREMENTS.md):
//   SUMM-01 — Korean 3~5-line summary (prompt enforces)
//   SUMM-02 — flash → flash-lite fallback on 429 (onFailedAttempt swap)
//   SUMM-03 — structured output via responseMimeType + responseSchema
//   SUMM-04 — nullable summary_ko + low-confidence on failure (catch block)
//   SUMM-05 — temperature: 0.2 (minimize drift, Pitfall 4)
//   SUMM-06 — title NEVER in prompt (caller contract documented below)
//
// Context7 verification (2026-04-17): @google/genai 1.50.x API shape matches
// PATTERNS.md expectations — new GoogleGenAI({ apiKey }), ai.models.generateContent({
// model, contents, config: { responseMimeType, responseSchema, temperature } }),
// response.text as getter property. No drift.
//
// p-retry v8 API note: onFailedAttempt receives a RetryContext object
// ({ error, attemptNumber, retriesLeft, retriesConsumed, retryDelay }), not the
// error directly as in v6. See `./{onFailedAttempt}` usage below.

import { GoogleGenAI } from '@google/genai';
import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';
import { buildPrompt, summarySchema } from './prompt.js';
import { scrubSecrets } from '../util/logging.js';
import type { NewItem, SummarizedItem } from '../types.js';

const SummaryZ = z.object({
  summary_ko: z.string().min(10).max(800).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

/**
 * Summarize a legal-newsletter article body into Korean via Gemini.
 *
 * **SUMM-06 caller contract:** the body MUST be a real article body (e.g.,
 * `item.description` from the RSS feed). Do NOT substitute the article title
 * as a fallback body — SUMM-06 forbids the title from entering the LLM prompt.
 * When only the title is available, callers MUST skip this function entirely
 * and construct a SummarizedItem with
 * `{ summary_ko: null, summaryConfidence: 'low', summaryModel: 'skipped' }`.
 * That branch lives in main.ts (plan 11 B3 revision); this module trusts its
 * caller.
 *
 * Never throws. On failure returns a SummarizedItem with
 * `summaryModel: 'failed'` and `summaryError` scrubbed via scrubSecrets.
 *
 * Retry strategy:
 *   - retries: 3 (p-retry exponential backoff on transient errors)
 *   - onFailedAttempt: if HTTP 429 and primary model is still flash, swap to
 *     flash-lite for the next attempt (SUMM-02 quota fallback).
 *   - ZodError: escalated to AbortError — don't waste quota retrying a
 *     schema-violating model response.
 */
export async function summarize(item: NewItem, body: string): Promise<SummarizedItem> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let model: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash';

  const call = async (): Promise<SummarizedItem> => {
    const res = await ai.models.generateContent({
      model,
      contents: buildPrompt(item, body),
      config: {
        responseMimeType: 'application/json',
        responseSchema: summarySchema,
        temperature: 0.2,
      },
    });
    const parsed = SummaryZ.parse(JSON.parse(res.text ?? '{}'));
    return {
      ...item,
      summary_ko: parsed.summary_ko,
      summaryConfidence: parsed.confidence,
      summaryModel: model,
    };
  };

  try {
    return await pRetry(call, {
      retries: 3,
      onFailedAttempt: ({ error }) => {
        const anyErr = error as unknown as { status?: number; name?: string; message: string };
        if (anyErr.status === 429 && model === 'gemini-2.5-flash') {
          model = 'gemini-2.5-flash-lite';
        }
        if (anyErr.name === 'ZodError') throw new AbortError(anyErr.message);
      },
    });
  } catch (err) {
    return {
      ...item,
      summary_ko: null,
      summaryConfidence: 'low',
      summaryModel: 'failed',
      summaryError: scrubSecrets((err as Error).message),
    };
  }
}
