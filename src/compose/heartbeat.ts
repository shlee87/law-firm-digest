// Phase 13 D-15: empty-week heartbeat email composer.
//
// composeDigest already has substantial branching (warnings, markers,
// failed-firm footer); embedding a heartbeat branch into it would degrade
// readability and risk snapshot test drift on the existing digest path.
// composeHeartbeat is a separate, minimal pure function — same EmailPayload
// shape, but with a fixed Korean "이번 주 신규 없음" subject marker (D-16)
// and a 2-paragraph body (D-17).
//
// Why a heartbeat at all: SPEC §Requirement 5 / DEDUP-03 weekly cadence
// override. With cron split to weekly send, a "silent week" (pending.items
// === 0 — possible during 명절/연휴) would produce zero emails for 7+ days.
// The recipient cannot distinguish "system healthy, no news" from "system
// dead" without the heartbeat. Heartbeat reassures + preserves the weekly
// rhythm.
//
// What's intentionally absent (D-17):
//   - Failed-firm footer — weekly doesn't fetch, so it can't know firm errors.
//   - DQOBS markers — no items → no body lengths → no markers to render.
//   - Staleness banner — staleness is daily-side observability.
//
// EMAIL-04 prefix `[법률 다이제스트]` preserved (D-16) so the Gmail spam
// filter stays consistently calibrated across digest + heartbeat senders.

import { formatInTimeZone } from 'date-fns-tz';
import type { EmailPayload } from '../types.js';

export function composeHeartbeat(
  recipient: string | string[],
  fromAddr: string,
  now: Date = new Date(),
): EmailPayload {
  const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
  const subject = `[법률 다이제스트] ${dateKst} (이번 주 신규 없음)`;
  const html = `<!DOCTYPE html>
<html><body>
<h1>법률 다이제스트 — ${dateKst}</h1>
<p>이번 주 새 뉴스레터가 없습니다.</p>
<p>시스템은 정상 작동 중입니다.</p>
</body></html>`;
  return { subject, html, to: recipient, from: fromAddr };
}
