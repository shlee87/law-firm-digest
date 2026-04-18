// Gmail SMTP boundary — nodemailer + App Password, DRY_RUN-aware, fail-loud.
//
// Phase 2 (EMAIL-07): selectively retry transient SMTP 5xx errors with
// exponential backoff (2s/4s/8s, 3 retries) while failing FAST on 535 auth
// and any non-5xx code. Uses p-retry v8's AbortError to short-circuit the
// retry loop for non-retryable classes.
//
// This file is still DRY_RUN check site #1 of 2 (plan 10 state writer is #2).
// Pattern 2 forbids scattered DRY_RUN checks; importing isDryRun from
// ../env.js is the sanctioned path. The short-circuit stays FIRST so no
// transporter is created in DRY_RUN mode.
//
// W2 invariant (Phase 2 update): this file now contains TWO error-catching
// blocks — one inside `sendOnce` (the classifier that decides retry vs
// AbortError) and a second catch-open that wraps the pRetry result in a
// scrubSecrets'd final message. The Phase 1 grep-gate that asserted
// "exactly 1 catch" is updated to assert "exactly 2". The intent is
// unchanged: no silently-swallowed error. AbortError in `sendOnce` aborts
// the retry loop immediately; the 5xx branch throws a plain Error which
// pRetry retries until exhausted.
//
// EMAIL-03 nodemailer Gmail service shortcut + App Password (GMAIL_APP_PASSWORD).
// EMAIL-06 any SMTP failure ultimately propagates — top-level main.ts catch
//          sets exit 1 (fail-loud preserved).
// EMAIL-07 retry policy:
//   - 5xx (502/503/504/other 5xx): p-retry 3 attempts, factor=2, min 2000ms,
//     max 8000ms, total max wait ~14s on worst case. Retries happen within
//     a single GHA run so a transient Gmail blip doesn't lose the day.
//   - 535 auth: AbortError — NO retry. GMAIL_AUTH_FAILURE marker emitted
//     to console.error, recovery URL included for operator MTTR.
//   - Other non-5xx (4xx, 6xx edge): AbortError — NO retry. Retrying auth-
//     rejection or server-policy errors wastes attempts on a dead path.
// OPS-06  DRY_RUN=1 short-circuits before any transporter is created.
//
// p-retry v8 API note (Pitfall 7): onFailedAttempt receives a RetryContext
// object ({ error, attemptNumber, retriesLeft, ... }) — destructure
// `{ error, attemptNumber, retriesLeft }` in the callback. The v6 shape
// `(err: Error) => void` compiles under any-threading but logs 'undefined'
// at runtime. gemini.ts (plan 01-06) uses the v8 shape; this file matches.

import nodemailer from 'nodemailer';
import pRetry, { AbortError } from 'p-retry';
import { isDryRun } from '../env.js';
import { scrubSecrets } from '../util/logging.js';
import type { EmailPayload } from '../types.js';

export async function sendMail(payload: EmailPayload): Promise<void> {
  // OPS-06 DRY_RUN check site #1 of 2. Must be FIRST — no transporter
  // creation, no SMTP connection, no outbound bytes in DRY_RUN mode.
  if (isDryRun()) {
    console.log('[DRY_RUN] Subject:', payload.subject);
    console.log('[DRY_RUN] HTML body:\n', payload.html);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: payload.from,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  // `sendOnce` is the inner classifier. It catches nodemailer's error,
  // distinguishes retryable (5xx or code-missing) from abort-worthy (535,
  // other non-5xx), and throws the appropriate shape. p-retry wraps it.
  const sendOnce = async (): Promise<void> => {
    try {
      await transporter.sendMail({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
    } catch (err) {
      // A4 defensive field check (Phase 1 01-09 invariant): nodemailer may
      // surface the SMTP response code as `responseCode` or embed '535' in
      // the free-form `response` string. Cover both paths so a field rename
      // in a minor release does not silently lose the recovery marker.
      const anyErr = err as {
        responseCode?: number;
        response?: string;
        message?: string;
      };
      const code = anyErr.responseCode;

      // 535 authentication failure → absolutely no retry. Emit recovery
      // marker + App Password URL, then AbortError to abort the pRetry loop.
      if (
        code === 535 ||
        (typeof anyErr.response === 'string' && anyErr.response.includes('535'))
      ) {
        console.error('GMAIL_AUTH_FAILURE: App Password invalid or revoked.');
        console.error(
          'Regenerate at https://myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD secret.',
        );
        throw new AbortError(
          `SMTP 535 auth: ${scrubSecrets(anyErr.message ?? String(err))}`,
        );
      }

      // Other non-5xx codes (4xx auth-ish edge cases, 3xx redirects,
      // 6xx non-standard) → no retry. Retrying a rejection like 421
      // "Try again later" won't help in 2-8 seconds — the user will see
      // the workflow fail-red and can dispatch a manual retry via GHA.
      if (typeof code === 'number' && (code < 500 || code >= 600)) {
        throw new AbortError(
          `SMTP ${code}: ${scrubSecrets(anyErr.message ?? String(err))}`,
        );
      }

      // 5xx OR code missing entirely (network blip, ECONNRESET, etc.) →
      // throw a plain Error. pRetry retries 3 more attempts with
      // exponential backoff (2s/4s/8s).
      throw new Error(
        `SMTP transient: ${scrubSecrets(anyErr.message ?? String(err))}`,
      );
    }
  };

  // EMAIL-07 retry policy. `retries: 3` means up to 4 total attempts
  // (1 initial + 3 retries). onFailedAttempt uses the v8 destructured
  // signature (Pitfall 7 regression guard).
  try {
    await pRetry(sendOnce, {
      retries: 3,
      factor: 2,
      minTimeout: 2_000,
      maxTimeout: 8_000,
      onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
        console.warn(
          `[SMTP retry ${attemptNumber}/${attemptNumber + retriesLeft}] ${error.message}`,
        );
      },
    });
  } catch (err) {
    // Final fail-loud propagation (EMAIL-06). scrubSecrets again defense-
    // in-depth even though sendOnce already scrubbed — cheap and the final
    // error might be an AbortError whose .message was unscrubbed upstream
    // in some edge case. Rethrow so main.ts top-level catch sets exit 1.
    throw new Error(`SMTP send failed: ${scrubSecrets((err as Error).message)}`);
  }
}
