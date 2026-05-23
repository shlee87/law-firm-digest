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
import type { EmailPayload, TopicConfig } from '../types.js';
import { renderCuratedTopicsFooter } from './templates.js';

export function composeHeartbeat(
  recipient: string | string[],
  fromAddr: string,
  now: Date = new Date(),
  topics: TopicConfig = {},
): EmailPayload {
  const dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
  const subject = `[법률 다이제스트] ${dateKst} (이번 주 신규 없음)`;

  // quick task 260523-oi6: render the curated-topics footer above the closing
  // "시스템은 정상 작동 중입니다." paragraph (the heartbeat's analogue of the
  // digest's legal disclaimer / closing block). renderCuratedTopicsFooter
  // returns a <tr><td>…</td></tr> table row designed for the digest layout;
  // wrap it in a minimal <table> here so the row is well-formed when nested
  // inside the plain-paragraph heartbeat body. Returns '' on empty topics,
  // which collapses the entire <table> wrapper to '' (clean-run invisible
  // posture mirroring renderDataQualityFooter).
  const curatedTopicsRow = renderCuratedTopicsFooter(topics);
  const curatedTopicsBlock = curatedTopicsRow
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${curatedTopicsRow}</table>`
    : '';

  const html = `<!DOCTYPE html>
<html><body>
<h1>법률 다이제스트 — ${dateKst}</h1>
<p>이번 주 새 뉴스레터가 없습니다.</p>
${curatedTopicsBlock}
<p>시스템은 정상 작동 중입니다.</p>
</body></html>`;
  return { subject, html, to: recipient, from: fromAddr };
}
