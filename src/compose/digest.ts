// Email digest composer (D-06 subject format + D-07 HTML body).
//
// Pure function: FirmResult[] → EmailPayload. No I/O, no side effects.
// Callers (plan 11 main.ts) pass a deterministic `now: Date` in tests to lock
// the subject-line snapshot; production calls pass no arg and we default
// `now = new Date()`.
//
// Subject format (D-06 locked): `[법률 다이제스트] YYYY-MM-DD (N firms, M items)`
//   - YYYY-MM-DD is KST-local date (Korea has no DST → formatInTimeZone is safe).
//   - The "1 firms" grammar oddity is intentionally preserved per CONTEXT.md D-06
//     (no grammar fallback branches; simpler is better at this scale).
//
// Firm filter: firms with zero summarized items are excluded from both the
// subject count (firmsWithNew.length) AND the body (renderHtml receives the
// filtered array). A firm that 200'd with zero new items, or errored during
// fetch, should not appear in the digest body — that's a run-log concern,
// not a reader concern.
//
// plaintext alternative (D-08): NOT emitted. EmailPayload has no `text` field
// (types.ts line 87–92). Gmail renders HTML fine for the single-user recipient.

import { formatInTimeZone } from 'date-fns-tz';
import { renderHtml } from './templates.js';
import type { FirmResult, EmailPayload } from '../types.js';

export function composeDigest(
  results: FirmResult[],
  recipient: string,
  fromAddr: string,
  now: Date = new Date(),
): EmailPayload {
  const firmsWithNew = results.filter((r) => r.summarized.length > 0);
  const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
  const itemCount = firmsWithNew.reduce((n, r) => n + r.summarized.length, 0);
  const subject = `[법률 다이제스트] ${dateKst} (${firmsWithNew.length} firms, ${itemCount} items)`;
  const html = renderHtml(firmsWithNew, dateKst);
  return { subject, html, to: recipient, from: fromAddr };
}
