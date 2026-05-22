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
//
// Missing-API-key fail-loud (debug session gemini-403-access-token-scope,
// 2026-04-21): when process.env.GEMINI_API_KEY is unset, @google/genai's
// NodeAuth silently falls back to Application Default Credentials (ADC) with
// cloud-platform scope only. That scope does NOT cover
// generativelanguage.googleapis.com → every call returns 403
// ACCESS_TOKEN_SCOPE_INSUFFICIENT. The SDK's own console.warn ("API key
// should be set when using the Gemini API.") signals this, but is easy to
// miss in a noisy pipeline log. We now abort BEFORE constructing the SDK
// client so the cause surfaces as a clean, single error message per item
// rather than an ADC 403 chain. The throw lives inside the pRetry-wrapped
// call so the existing "Never throws" contract (see docstring) is preserved:
// the catch at the bottom logs + returns the title-verbatim fallback, matching
// every other per-item failure path.
//
// Phase 13 observability: module-level geminiCallCount (sanctioned per D-20).
// resetGeminiCallCount() at runDaily/runWeekly start; getGeminiCallCount()
// at run end → writeStepSummary [METRIC] line. See plan 13-02 for rationale.

import { GoogleGenAI } from '@google/genai';
import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';
import { buildPrompt, summarySchema } from './prompt.js';
import type { PromptConfig } from './prompt.js';
import { scrubSecrets } from '../util/logging.js';
import type { NewItem, SummarizedItem } from '../types.js';

// Phase 13 D-18/D-20: module-level counter for Gemini API calls. Tracks
// EVERY generateContent attempt — including p-retry retries on 429 AND the
// fallback (flash → flash-lite) swap — because all of them consume RPD
// quota. The summaryModel post-tally approach (count items whose model ===
// 'gemini-2.5-flash') is INSUFFICIENT: a single item that fell back is
// counted as 1, not as 2 (initial + retry). Counter accuracy matters because
// SPEC AC-7's daily-average ≤ 15 / weekly === 0 sits right at the RPD ceiling.
//
// Module-level mutable state is normally an anti-pattern. It is sanctioned
// here because:
//   1. Single-process, single-run lifecycle (cron-driven Node 22 invocation).
//   2. Test isolation via resetGeminiCallCount() in vitest beforeEach.
//   3. Threading recorder through every summarize() caller would touch the
//      entire pipeline (runDaily, run.ts variants, checkFirm.ts) for a
//      counter that has exactly one writer and two readers.
// If the counter ever grows responsibilities (per-model breakdown,
// per-attempt timing), migrate to Recorder injection.
let geminiCallCount = 0;
export function getGeminiCallCount(): number {
  return geminiCallCount;
}
export function resetGeminiCallCount(): void {
  geminiCallCount = 0;
}

const SummaryZ = z.object({
  // GUARD-01 Layer 2 (Phase 8): empty string is the generic-boilerplate
  // sentinel — caller substitutes item.title when parsed.summary_ko === ''.
  // .min(10) removed; .max(800) preserved (input length cap defense).
  summary_ko: z.string().max(800).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

/**
 * Summarize a legal-newsletter article body into Korean via Gemini.
 *
 * **SUMM-06 caller contract:** the body MUST be a real article body (e.g.,
 * `item.description` from the RSS feed). Do NOT substitute the article title
 * as a fallback body — SUMM-06 forbids the title from entering the LLM prompt.
 * When only the title is available, callers MUST skip this function entirely
 * and construct a SummarizedItem with title-verbatim summary_ko (Phase 8
 * D-03): `{ summary_ko: item.title, summaryConfidence: 'low', summaryModel: 'skipped' }`.
 * That branch lives in src/pipeline/run.ts Layer 1 short-circuit; this module
 * trusts its caller.
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
export async function summarize(
  item: NewItem,
  body: string,
  models?: { primary: string; fallback: string },
  promptConfig?: PromptConfig,
): Promise<SummarizedItem> {
  let model = (models?.primary ?? 'gemini-2.5-flash') as string;

  const call = async (): Promise<SummarizedItem> => {
    // Fail loud on missing API key BEFORE SDK construction, so we never reach
    // @google/genai's ADC fallback path. AbortError halts pRetry immediately —
    // no quota / wall-clock is wasted retrying a setup bug that only a human
    // fix (populate .env or GHA secret) can resolve. The surrounding catch
    // block converts this into the standard `[summarize] ... FAILED: ...`
    // log + title-verbatim SummarizedItem, preserving the "Never throws"
    // contract documented above.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AbortError(
        'GEMINI_API_KEY is not set — refusing to fall back to ADC (generativelanguage.googleapis.com requires explicit API key)',
      );
    }
    const ai = new GoogleGenAI({ apiKey });
    // Phase 13 D-18: count BEFORE the await so a network throw (429, 5xx,
    // timeout) is still counted — the API call left this process, consumed
    // RPD/RPM budget, and bounced. p-retry's onFailedAttempt then re-enters
    // `call` and increments again for the retry. This produces an accurate
    // RPD denominator even when the API is failing.
    geminiCallCount++;
    const res = await ai.models.generateContent({
      model,
      contents: buildPrompt(item, body, promptConfig),
      config: {
        responseMimeType: 'application/json',
        responseSchema: summarySchema,
        temperature: 0.2,
      },
    });
    const parsed = SummaryZ.parse(JSON.parse(res.text ?? '{}'));
    // GUARD-01 Layer 2 (Phase 8) Option C: Gemini returns '' when body is
    // generic boilerplate per the preamble rule; caller substitutes the title
    // here so SUMM-06 (title-never-in-prompt) is preserved. summaryConfidence
    // is forced to 'low' in this branch because Gemini already returned 'low'
    // per the rule, but defense-in-depth re-pins if the model drifts.
    if (parsed.summary_ko === '') {
      return {
        ...item,
        summary_ko: item.title,
        summaryConfidence: 'low' as const,
        summaryModel: model,
      };
    }
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
        if (anyErr.status === 429 && model === (models?.primary ?? 'gemini-2.5-flash')) {
          model = models?.fallback ?? 'gemini-2.5-flash-lite';
        }
        if (anyErr.name === 'ZodError') throw new AbortError(anyErr.message);
      },
    });
  } catch (err) {
    // Operational visibility: the caller (main.ts) wraps summaries and
    // does not log each failure, so without this line a Gemini outage
    // would render the null-summary placeholder in email WITHOUT any
    // trace in the run logs — impossible to triage. scrubSecrets strips
    // accidentally-echoed credentials (API key, App Password).
    const scrubbed = scrubSecrets((err as Error).message);
    console.error(
      `[summarize] model=${model} url=${item.url} FAILED: ${scrubbed}`,
    );
    // Phase 8 Open-Q #2 resolution: promote API-fail to title-verbatim so
    // downstream template never sees null from a real-run path. Parallels
    // Layer 1 short-circuit shape. 'failed' sentinel + summaryError retained
    // for operational visibility (console.error above + recorder.errorClass).
    return {
      ...item,
      summary_ko: item.title,
      summaryConfidence: 'low',
      summaryModel: 'failed',
      summaryError: scrubbed,
    };
  }
}
