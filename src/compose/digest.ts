// Email digest composer (D-06 subject format + D-07 HTML body).
//
// Pure function: FirmResult[] → EmailPayload. No I/O, no side effects.
// Callers (main.ts) pass a deterministic `now: Date` in tests to lock
// the subject-line snapshot; production calls pass no arg and we default
// `now = new Date()`.
//
// Subject format (D-06 locked): `[법률 다이제스트] YYYY-MM-DD (N firms, M items)`
//   - YYYY-MM-DD is KST-local date (Korea has no DST → formatInTimeZone is safe).
//   - firmsWithNew.length counts firms that delivered summarized items.
//     Failed firms are NOT counted — the subject keeps measuring signal,
//     and the failure footer in the body conveys the error context.
//   - The "1 firms" grammar oddity is intentionally preserved per Phase 1.
//
// Firm filter (Phase 2):
//   - firmsWithNew: summarized.length > 0 → renders in the body sections.
//   - firmsWithErrors: .error set → renders in the failed-firm footer.
//   - Firms with neither (200-OK but zero new items): absent from both body
//     and footer. They're a run-log concern, not a reader concern.
//
// plaintext alternative (D-08): NOT emitted. EmailPayload has no `text` field.

import { formatInTimeZone } from 'date-fns-tz';
import { renderHtml } from './templates.js';
import type { FirmResult, EmailPayload } from '../types.js';
import type { StalenessWarnings } from '../observability/staleness.js';

export function composeDigest(
  results: FirmResult[],
  recipient: string | string[],
  fromAddr: string,
  warnings?: StalenessWarnings,
  now: Date = new Date(),
): EmailPayload {
  const firmsWithNew = results.filter((r) => r.summarized.length > 0);
  const firmsWithErrors = results.filter((r) => !!r.error);
  const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
  const itemCount = firmsWithNew.reduce((n, r) => n + r.summarized.length, 0);
  const subject = `[법률 다이제스트] ${dateKst} (${firmsWithNew.length} firms, ${itemCount} items)`;
  const html = renderHtml(firmsWithNew, dateKst, firmsWithErrors, warnings);
  return { subject, html, to: recipient, from: fromAddr };
}
