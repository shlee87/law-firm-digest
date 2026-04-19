// Email digest HTML renderer (D-07 minimal inline-CSS style).
//
// Pure function: takes FirmResult[] (already filtered to firms with summarized items)
// plus a KST date string, optional failed-firms array, returns a single
// <!doctype html>...</html> string ready for EmailPayload.html.
//
// XSS defense (threat model T-08-01/02/03, and T-02-05-01 for the new footer):
// EVERY user-controlled string crossing into HTML or attribute context passes
// through escapeHtml or escapeAttr before interpolation. User-controlled =
// scraped title, Gemini summary_ko, scraped URL, firm.name (config-sourced but
// escaped defensively), firm.id (ditto), error.message (scrubSecrets + escapeHtml).
//
// B3 null-summary placeholder (2026-04-17 revision): when summary_ko is null —
// whether from a Gemini failure (summaryModel === 'failed') OR the main.ts B3
// bypass for description-less items (summaryModel === 'skipped') — render the
// literal Korean placeholder "요약 없음 — 본문 부족" in italic grey.
//
// EMAIL-05 failed-firm footer (Phase 2 addition, D-P2-04):
// When a FirmResult carries an .error, classifyError() maps the message to a
// compact errorClass tag and renderFailedFirmsFooter composes a Korean-header
// <ul> of failed firms.
//
// Error class taxonomy (Phase 2 + Phase 4):
//   - robots-blocked       (robots.txt disallows ...)
//   - fetch-timeout        (timeout / ETIMEDOUT / aborted — non-Playwright)
//   - browser-launch-fail  (Phase 4 — chromium launch / install / executable)
//   - playwright-timeout   (Phase 4 — waitForSelector exceeded 15s)
//   - selector-miss        (Phase 2 html OR Phase 4 js-render zero-items throw)
//   - http-{status}        (message matches /HTTP (\d{3})/ — coupled to
//                           scrapers/rss.ts L68 and scrapers/html.ts error shapes)
//   - dns-fail             (ENOTFOUND / DNS)
//   - parse-error          (stage='parse' OR keywords parse/selector)
//   - unknown              (none of the above)
//
// Error messages are scrubSecrets'd then escapeHtml'd before output. Only
// the FIRST LINE is rendered and it is hard-truncated at 140 chars — no
// ellipsis, no stack traces in email (stack traces stay in GHA logs for
// operator triage).
//
// Phase 1 01-08 LOCKED: escapeHtml stays LOCAL to this file. It is NOT
// exported and MUST NOT be duplicated into a sibling file — the single
// XSS-escape boundary of the renderer lives here and only here.

import type { FirmResult } from '../types.js';
import type { StalenessWarnings } from '../observability/staleness.js';
import { scrubSecrets } from '../util/logging.js';

export function renderHtml(
  firms: FirmResult[],
  dateKst: string,
  failed: FirmResult[] = [],
  warnings?: StalenessWarnings,
): string {
  const sections = firms
    .map((r) => {
      const items = r.summarized
        .map(
          (it) => `
      <div style="margin:0 0 16px 0;">
        <div><a href="${escapeAttr(it.url)}">${escapeHtml(it.title)}</a></div>
        ${
          it.summary_ko
            ? `<p style="margin:4px 0 0 0;color:#333;">${escapeHtml(it.summary_ko)}</p>`
            : `<p style="margin:4px 0 0 0;color:#999;font-style:italic;">요약 없음 — 본문 부족</p>`
        }
      </div>`,
        )
        .join('');
      return `<section><h2 style="font-size:18px;margin:24px 0 8px 0;">${escapeHtml(r.firm.name)}</h2>${items}</section>`;
    })
    .join('');

  const failedFooter = renderFailedFirmsFooter(failed);
  const stalenessBanner = renderStalenessBanner(warnings);

  return `<!doctype html><html><body style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:16px;">
    <h1 style="font-size:22px;">법률 다이제스트 ${escapeHtml(dateKst)}</h1>
    ${stalenessBanner}
    ${sections}
    ${failedFooter}
    <footer style="margin-top:32px;color:#888;font-size:12px;">AI 요약 — 원문 확인 필수</footer>
  </body></html>`;
}

/**
 * Classify an error.message + stage into a compact errorClass tag.
 * Order of checks matters — robots precedes HTTP-code match because a
 * disallows message might incidentally include a status code; parse/timeout
 * are keyword-based and mutually exclusive with HTTP codes in practice.
 *
 * Phase 3 (2026-04-18): promoted from file-local `function` to `export
 * function` so the Phase 3 `Recorder` (src/observability/recorder.ts) can
 * reuse the same taxonomy for the step-summary `Errors` column (D-11).
 * No semantic change.
 */
export function classifyError(msg: string, stage: string): string {
  if (msg.includes('robots.txt disallows')) return 'robots-blocked';
  // Phase 4 additions — check BEFORE generic timeout/fetch-timeout patterns
  // because Playwright's TimeoutError also matches /timeout/ (generic check
  // below would mis-classify it as 'fetch-timeout'). The 'playwright-timeout'
  // token is emitted verbatim by scrapers/jsRender.ts; the wider regex covers
  // Playwright's own TimeoutError.message text shape plus the literal token.
  if (/playwright-timeout|waitForSelector|TimeoutError\.?.*Playwright/i.test(msg))
    return 'playwright-timeout';
  if (/browser-launch-fail|chromium|playwright.*(launch|install|executable)/i.test(msg))
    return 'browser-launch-fail';
  if (/zero items extracted \(selector-miss\)|jsRender.*no items extracted/i.test(msg))
    return 'selector-miss';
  // Generic (Phase 1/2) — UNCHANGED
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(msg)) return 'fetch-timeout';
  const http = /HTTP (\d{3})/.exec(msg);
  if (http) return `http-${http[1]}`;
  if (/ENOTFOUND|DNS/i.test(msg)) return 'dns-fail';
  if (/selectors? (miss|not found)/i.test(msg)) return 'selector-miss';
  if (stage === 'parse' || /parse error|selector/i.test(msg)) return 'parse-error';
  return 'unknown';
}

/**
 * Render the Korean-header failed-firm footer <footer>...</footer>.
 * Empty string if no failed firms (keeps clean runs visually unchanged).
 */
function renderFailedFirmsFooter(failed: FirmResult[]): string {
  const filtered = failed.filter((f) => !!f.error);
  if (filtered.length === 0) return '';

  const items = filtered
    .map((f) => {
      const scrubbed = scrubSecrets(f.error!.message);
      const firstLine = scrubbed.split('\n')[0].slice(0, 140);
      const errClass = classifyError(scrubbed, f.error!.stage);
      return `<li>${escapeHtml(f.firm.name)} (${escapeHtml(f.firm.id)}) — ${escapeHtml(errClass)}: ${escapeHtml(firstLine)}</li>`;
    })
    .join('');

  return `<footer style="margin-top:32px;color:#999;font-size:12px;">
  <div>⚠ 이번 실행에서 수집 실패 — 다음 실행에서 재시도됩니다:</div>
  <ul style="margin:4px 0;">${items}</ul>
</footer>`;
}

/**
 * Render the Phase 3 staleness banner (OPS-04 + OPS-05) as a single
 * consolidated block (D-04) between the <h1> and the firm sections.
 *
 * Returns '' when warnings is undefined or contains no active warnings —
 * mirroring the renderFailedFirmsFooter "clean-run invisible" pattern.
 *
 * Korean banner wording (from CONTEXT.md specifics):
 *   "⚠ 30일 이상 새 글 없음: 김앤장, 태평양"
 *   "⚠ 이전 실행 누락 — 48시간 전 마지막 성공 실행"
 *
 * Firm names flow from FirmConfig.name (developer-controlled via
 * config/firms.yaml, already zod-validated). escapeHtml is applied
 * defensively to preserve the Phase 1 renderFailedFirmsFooter posture.
 */
function renderStalenessBanner(warnings?: StalenessWarnings): string {
  if (!warnings) return '';
  const parts: string[] = [];
  if (warnings.staleFirms.length > 0) {
    const names = warnings.staleFirms.map(escapeHtml).join(', ');
    parts.push(`⚠ 30일 이상 새 글 없음: ${names}`);
  }
  if (warnings.lastRunStale) {
    parts.push(
      `⚠ 이전 실행 누락 — ${warnings.lastRunStale.hoursAgo}시간 전 마지막 성공 실행`,
    );
  }
  if (parts.length === 0) return '';
  const innerDivs = parts.map((p) => `<div>${p}</div>`).join('');
  return `<div style="margin:0 0 16px 0;padding:12px;background:#fff8e1;border-left:4px solid #f57f17;color:#6f5300;font-size:13px;">${innerDivs}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

function escapeAttr(s: string): string {
  return s.replace(
    /["&<>]/g,
    (c) => ({ '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!,
  );
}
