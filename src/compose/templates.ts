// Email digest HTML renderer — minimal modern Korean editorial redesign.
//
// Signature unchanged from prior version; callers in digest.ts are unaffected.
//
// XSS posture preserved: escapeHtml / escapeAttr remain file-local and every
// user-controlled string (scraped title, summary_ko, URL, firm.name, firm.id,
// scrubbed error.message) passes through one of them before interpolation.
//
// Email-client compatibility notes:
// - All layout uses <table> for Outlook on Windows (uses Word rendering engine).
// - Google Fonts <link> is intentionally NOT included — Gmail strips it.
//   Instead we supply a wide fallback stack on every font-family declaration.
// - Every style is inline. <style> blocks survive Gmail web but not all clients;
//   inline is the safe baseline.
// - Colors, spacing, and copy mirror the "Daily Legal Digest" redesign.

import type { FirmResult } from '../types.js';
import type { StalenessWarnings } from '../observability/staleness.js';
import { scrubSecrets } from '../util/logging.js';
import type { DataQualityMarker } from '../pipeline/detectClusters.js';

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */

const COLOR = {
  bg: '#FAF8F4',
  bgAlt: '#F4F1EA',
  ink: '#1A1917',
  inkDeep: '#0F0E0C',
  body: '#2A2824',
  muted: '#6B6A66',
  rule: '#E2DDD3',
  ruleSoft: '#EFEBE2',
  ruleStrong: '#1A1917',
  tagBorder: '#D9D4C9',
  link: '#234C7A',
  linkUnder: '#B7C4D7',
  warnBg: '#FFF8E1',
  warnBorder: '#F57F17',
  warnInk: '#6F5300',
  errInk: '#8A4438',
  footerBg: '#1A1917',
  footerInk: '#A8A49B',
  footerRule: '#2E2C28',
  footerMuted: '#7A766D',
  footerBrand: '#FAF8F4',
};

const FONT_SERIF = `'Noto Serif KR', 'Nanum Myeongjo', 'Apple SD Gothic Neo', serif`;
const FONT_SANS = `'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
const FONT_MONO = `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

/* ------------------------------------------------------------------ */
/* Main renderer                                                       */
/* ------------------------------------------------------------------ */

export function renderHtml(
  firms: FirmResult[],
  dateKst: string,
  failed: FirmResult[] = [],
  warnings?: StalenessWarnings,
  markers: DataQualityMarker[] = [],
): string {
  const itemCount = firms.reduce((n, r) => n + r.summarized.length, 0);
  const firmCount = firms.length;

  const masthead = renderMasthead(dateKst);
  const glance = renderGlance(itemCount, firmCount);
  const stalenessBanner = renderStalenessBanner(warnings);
  const sections = firms.map(renderFirmSection).join('');
  const silent = renderSilentFooter(failed);
  const dataQualityFooter = renderDataQualityFooter(markers);
  const footer = renderFooter(dateKst);

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>Daily Legal Digest — ${escapeHtml(dateKst)}</title>
</head>
<body style="margin:0;padding:0;background:#E8E4DC;font-family:${FONT_SANS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E8E4DC;">
  <tr>
    <td align="center" style="padding:32px 12px 64px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:${COLOR.bg};color:${COLOR.ink};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        ${masthead}
        ${glance}
        ${stalenessBanner}
        ${sections}
        ${silent}
        ${dataQualityFooter}
        ${footer}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Masthead                                                            */
/* ------------------------------------------------------------------ */

function renderMasthead(dateKst: string): string {
  return `<tr><td style="padding:40px 56px 28px;border-bottom:1px solid ${COLOR.ruleStrong};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.14em;color:${COLOR.muted};text-transform:uppercase;padding-bottom:20px;">DAILY LEGAL DIGEST</td>
        <td align="right" style="font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.14em;color:${COLOR.muted};text-transform:uppercase;padding-bottom:20px;">${escapeHtml(dateKst)}</td>
      </tr>
    </table>
    <h1 style="font-family:${FONT_SERIF};font-weight:500;font-size:34px;letter-spacing:-0.01em;line-height:1.1;margin:0;color:${COLOR.inkDeep};">
      Daily Legal Digest
      <span style="display:block;font-size:22px;font-weight:400;color:#3A3834;margin-top:6px;letter-spacing:0.01em;">오늘의 로펌 뉴스레터</span>
    </h1>
  </td></tr>`;
}

/* ------------------------------------------------------------------ */
/* At-a-glance bar                                                     */
/* ------------------------------------------------------------------ */

function renderGlance(itemCount: number, firmCount: number): string {
  const cell = (label: string, value: string, unit: string, borderLeft: boolean) => `
    <td style="padding:0 18px;${borderLeft ? `border-left:1px solid #D9D4C9;` : ''}vertical-align:top;">
      <div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.muted};margin-bottom:4px;">${label}</div>
      <div style="font-family:${FONT_SERIF};font-size:22px;font-weight:500;color:${COLOR.inkDeep};line-height:1;">${value}<span style="font-family:${FONT_SANS};font-size:12px;font-weight:400;color:${COLOR.muted};margin-left:3px;">${unit}</span></div>
    </td>`;
  return `<tr><td style="padding:22px 56px;background:${COLOR.bgAlt};border-bottom:1px solid ${COLOR.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${cell('New', String(itemCount), 'items', false)}
        ${cell('Firms', String(firmCount), 'active', true)}
      </tr>
    </table>
  </td></tr>`;
}

/* ------------------------------------------------------------------ */
/* Firm section                                                        */
/* ------------------------------------------------------------------ */

function renderFirmSection(r: FirmResult): string {
  const normal = r.summarized.filter((it) => !it.isClusterMember);
  const demoted = r.summarized.filter((it) => it.isClusterMember === true);

  if (normal.length === 0 && demoted.length === 0) return '';

  const firmHead = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;border-bottom:1px solid ${COLOR.ruleStrong};">
      <tr>
        <td style="padding-bottom:12px;font-family:${FONT_SERIF};font-size:19px;font-weight:600;color:${COLOR.inkDeep};letter-spacing:-0.005em;">${escapeHtml(r.firm.name)}</td>
      </tr>
    </table>`;

  const normalHtml = normal.map((it, i) => renderArticle(it, i === 0)).join('');
  const demotedHtml = demoted.length > 0 ? renderDemotedBlock(demoted) : '';

  return `<tr><td style="padding:36px 56px 28px;border-bottom:1px solid ${COLOR.rule};">
    ${firmHead}
    ${normalHtml}
    ${demotedHtml}
  </td></tr>`;
}

function renderArticle(it: FirmResult['summarized'][number], isFirst: boolean): string {
  const badge =
    it.summaryModel === 'skipped'
      ? ` <span style="font-family:${FONT_MONO};color:${COLOR.warnBorder};font-size:11px;letter-spacing:0.04em;">⚠ 본문 없음</span>`
      : it.summaryModel === 'failed'
      ? ` <span style="font-family:${FONT_MONO};color:${COLOR.errInk};font-size:11px;letter-spacing:0.04em;">⚠ 요약 실패${it.summaryError ? ` — ${escapeHtml(it.summaryError.slice(0, 80))}` : ''}</span>`
      : '';
  const summaryText = it.summary_ko ?? it.title;
  const published = it.publishedAt ? formatDate(it.publishedAt) : '';
  const meta = [published].filter(Boolean);
  const metaLine = meta
    .map(
      (m) =>
        `<span style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR.muted};">${escapeHtml(m)}</span>`,
    )
    .join(`<span style="display:inline-block;width:2px;height:2px;background:#B5B0A5;border-radius:50%;vertical-align:middle;margin:0 10px;"></span>`);

  const topPad = isFirst ? '6px' : '22px';
  const topBorder = isFirst ? '' : `border-top:1px solid ${COLOR.ruleSoft};`;

  return `
    <div style="padding:${topPad} 0 22px;${topBorder}">
      ${metaLine ? `<div style="margin-bottom:8px;">${metaLine}</div>` : ''}
      <div style="font-family:${FONT_SERIF};font-size:20px;font-weight:500;line-height:1.3;color:${COLOR.inkDeep};margin:0 0 10px;letter-spacing:-0.005em;">
        <a href="${escapeAttr(it.url)}" style="color:${COLOR.inkDeep};text-decoration:none;border-bottom:1px solid transparent;">${escapeHtml(it.title)}</a>
      </div>
      <p style="font-size:14.5px;line-height:1.7;color:${COLOR.body};margin:0 0 12px;font-weight:400;">${escapeHtml(summaryText)}${badge}</p>
      <a href="${escapeAttr(it.url)}" style="font-family:${FONT_MONO};font-size:10.5px;letter-spacing:0.08em;color:${COLOR.link};text-transform:uppercase;text-decoration:none;border-bottom:1px solid ${COLOR.linkUnder};padding-bottom:1px;">원문 읽기 &nbsp;→</a>
    </div>`;
}

function renderDemotedBlock(items: FirmResult['summarized']): string {
  const lis = items
    .map(
      (it) =>
        `<li style="margin:4px 0;"><a href="${escapeAttr(it.url)}" style="color:${COLOR.muted};text-decoration:underline;">${escapeHtml(it.title)}</a> → 원문 보기</li>`,
    )
    .join('');
  return `
    <div style="margin-top:12px;padding:14px 16px;background:${COLOR.bgAlt};border-left:2px solid #C5BFB2;font-size:13px;color:${COLOR.muted};">
      <div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;">⚠ 품질 의심 — 요약 숨김</div>
      <ul style="margin:0;padding-left:18px;">${lis}</ul>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Silent / failed firms footer                                        */
/* ------------------------------------------------------------------ */

function renderSilentFooter(failed: FirmResult[]): string {
  const filtered = failed.filter((f) => !!f.error);
  if (filtered.length === 0) return '';

  const items = filtered
    .map((f) => {
      const scrubbed = scrubSecrets(f.error!.message);
      const firstLine = scrubbed.split('\n')[0].slice(0, 140);
      const errClass = classifyError(scrubbed, f.error!.stage);
      return `<div style="margin-top:6px;"><span style="font-family:${FONT_MONO};color:${COLOR.errInk};font-size:11px;">[${escapeHtml(errClass)}]</span> <span style="color:${COLOR.body};font-size:13px;">${escapeHtml(f.firm.name)}</span> <span style="color:${COLOR.muted};font-size:12px;">(${escapeHtml(f.firm.id)})</span> <span style="color:${COLOR.muted};font-size:12px;">— ${escapeHtml(firstLine)}</span></div>`;
    })
    .join('');

  return `<tr><td style="padding:28px 56px;background:${COLOR.bgAlt};border-bottom:1px solid ${COLOR.rule};">
    <div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.muted};margin-bottom:10px;">수집 실패 · Fetch failed</div>
    <div>${items}</div>
    <div style="margin-top:10px;font-size:12px;color:${COLOR.muted};">다음 실행에서 자동으로 재시도됩니다.</div>
  </td></tr>`;
}

/* ------------------------------------------------------------------ */
/* Staleness banner                                                    */
/* ------------------------------------------------------------------ */

function renderStalenessBanner(warnings?: StalenessWarnings): string {
  if (!warnings) return '';
  const parts: string[] = [];
  if (warnings.staleFirms.length > 0) {
    const names = warnings.staleFirms.map(escapeHtml).join(', ');
    parts.push(`⚠ 30일 이상 새 글 없음: ${names}`);
  }
  if (warnings.lastRunStale) {
    parts.push(`⚠ 이전 실행 누락 — ${warnings.lastRunStale.hoursAgo}시간 전 마지막 성공 실행`);
  }
  if (parts.length === 0) return '';
  const inner = parts.map((p) => `<div style="margin:2px 0;">${p}</div>`).join('');
  return `<tr><td style="padding:16px 56px;background:${COLOR.warnBg};border-left:3px solid ${COLOR.warnBorder};border-bottom:1px solid ${COLOR.rule};color:${COLOR.warnInk};font-size:13px;line-height:1.6;">${inner}</td></tr>`;
}

/* ------------------------------------------------------------------ */
/* Data quality footer                                                 */
/* ------------------------------------------------------------------ */

function renderDataQualityFooter(markers: DataQualityMarker[]): string {
  if (markers.length === 0) return '';

  const items = markers
    .map((m) => {
      if (m.kind === 'cluster') {
        return `<li style="margin:4px 0;">${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): HALLUCINATION_CLUSTER_DETECTED (${m.count} items, 요약 숨김)</li>`;
      }
      return `<li style="margin:4px 0;">${escapeHtml(m.firmName)} (${escapeHtml(m.firmId)}): ${m.lowCount}/${m.totalCount} items 품질 의심 (confidence=low 과반)</li>`;
    })
    .join('');

  return `<tr><td style="padding:22px 56px;background:${COLOR.bgAlt};border-bottom:1px solid ${COLOR.rule};">
    <div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.muted};margin-bottom:10px;">⚠ 데이터 품질 경고 · Quality flags</div>
    <ul style="margin:0;padding-left:18px;color:${COLOR.body};font-size:13px;">${items}</ul>
  </td></tr>`;
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function renderFooter(dateKst: string): string {
  return `<tr><td style="padding:28px 56px 40px;background:${COLOR.footerBg};color:${COLOR.footerInk};font-family:${FONT_SANS};font-size:12px;line-height:1.65;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid ${COLOR.footerRule};">
      <tr>
        <td style="padding-bottom:16px;font-family:${FONT_SERIF};font-size:14px;color:${COLOR.footerBrand};font-weight:500;">Daily Legal Digest</td>
        <td align="right" style="padding-bottom:16px;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${COLOR.footerMuted};">${escapeHtml(dateKst)} · 18:00 KST</td>
      </tr>
    </table>
    <p style="margin:16px 0 8px;">이 메일은 LegalNewsletter 자동화 파이프라인이 수집한 각 로펌의 공개 뉴스레터/Legal Update 페이지를 한국어로 요약한 것입니다. 원문의 저작권은 각 로펌에 있으며, 전문은 반드시 원문 링크를 통해 확인하시기 바랍니다.</p>
    <div style="font-size:11px;color:${COLOR.footerMuted};margin-top:14px;line-height:1.6;">본 다이제스트는 정보 제공 목적의 개인 열람용 요약이며 법률 자문이 아닙니다. 구체적 사안에 대한 판단은 반드시 해당 로펌 원문 또는 별도 자문을 참고하시기 바랍니다.</div>
  </td></tr>`;
}

/* ------------------------------------------------------------------ */
/* Error classification (unchanged)                                    */
/* ------------------------------------------------------------------ */

export function classifyError(msg: string, stage: string): string {
  if (msg.includes('robots.txt disallows')) return 'robots-blocked';
  if (/playwright-timeout|waitForSelector|TimeoutError\.?.*Playwright/i.test(msg))
    return 'playwright-timeout';
  if (/browser-launch-fail|chromium|playwright.*(launch|install|executable)/i.test(msg))
    return 'browser-launch-fail';
  if (/zero items extracted \(selector-miss\)|jsRender.*no items extracted/i.test(msg))
    return 'selector-miss';
  if (/\bTLS [A-Z_]+/.test(msg)) return 'tls-cert-fail';
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(msg)) return 'fetch-timeout';
  const http = /HTTP (\d{3})/.exec(msg);
  if (http) return `http-${http[1]}`;
  if (/ENOTFOUND|DNS/i.test(msg)) return 'dns-fail';
  if (/selectors? (miss|not found)/i.test(msg)) return 'selector-miss';
  if (stage === 'parse' || /parse error|selector/i.test(msg)) return 'parse-error';
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  // Defensive: accept anything; fall back to raw substring if not parseable.
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return iso.slice(0, 10);
  }
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
