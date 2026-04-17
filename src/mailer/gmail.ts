// Gmail SMTP boundary — nodemailer + App Password, DRY_RUN-aware, fail-loud.
//
// This file is the ONLY outbound email surface in the pipeline and is DRY_RUN
// check site #1 of 2 (plan 10 state writer is #2). Pattern 2 forbids scattered
// DRY_RUN checks; importing isDryRun from ../env.js is the sanctioned path.
//
// W2 fail-loud invariant: this file contains EXACTLY ONE error-catching
// block. That sole handler emits the GMAIL_AUTH_FAILURE recovery marker when
// the underlying SMTP error is a 535 auth failure, then immediately rethrows
// as an Error. Any additional error-catching blocks in this file would be a
// Pitfall 6 regression (silent SMTP error swallow) — the grep acceptance gate
// in the plan enforces this invariant statically by counting catch-open tokens.
//
// EMAIL-03 nodemailer Gmail service shortcut + App Password (GMAIL_APP_PASSWORD).
// EMAIL-06 any SMTP failure propagates — top-level main.ts catch sets exit 1.
// OPS-06  DRY_RUN=1 short-circuits before any transporter is created.
// Pitfall 7/14 — 535 auth error emits literal GMAIL_AUTH_FAILURE marker plus
// the https://myaccount.google.com/apppasswords recovery URL so the operator
// can regenerate the App Password and update the GitHub Actions secret.

import nodemailer from 'nodemailer';
import { isDryRun } from '../env.js';
import { scrubSecrets } from '../util/logging.js';
import type { EmailPayload } from '../types.js';

export async function sendMail(payload: EmailPayload): Promise<void> {
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

  try {
    await transporter.sendMail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
  } catch (err) {
    // A4 defensive field check: nodemailer may surface the SMTP response
    // code as `responseCode` or embed '535' in the free-form `response`
    // string. Cover both paths so a field rename in a minor release does
    // not silently lose the recovery marker.
    const anyErr = err as { responseCode?: number; response?: string; message?: string };
    if (
      anyErr.responseCode === 535 ||
      (typeof anyErr.response === 'string' && anyErr.response.includes('535'))
    ) {
      console.error('GMAIL_AUTH_FAILURE: App Password invalid or revoked.');
      console.error(
        'Regenerate at https://myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD secret.',
      );
    }
    throw new Error(`SMTP send failed: ${scrubSecrets(anyErr.message ?? String(err))}`);
  }
}
