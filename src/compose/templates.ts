// Email digest HTML renderer (D-07 minimal inline-CSS style).
//
// Pure function: takes FirmResult[] (already filtered to firms with summarized items)
// plus a KST date string, returns a single <!doctype html>...</html> string ready
// for EmailPayload.html.
//
// XSS defense (threat model T-08-01/02/03): EVERY user-controlled string crossing
// into HTML or attribute context passes through escapeHtml or escapeAttr before
// interpolation. User-controlled = scraped title, Gemini summary_ko, scraped URL,
// firm.name (config-sourced but escaped defensively). The date string is
// developer/library-controlled (ISO format) but still escaped for defense-in-depth.
//
// B3 null-summary placeholder (2026-04-17 revision): when summary_ko is null —
// whether from a Gemini failure (summaryModel === 'failed') OR the main.ts B3
// bypass for description-less items (summaryModel === 'skipped') — render the
// literal Korean placeholder "요약 없음 — 본문 부족" in italic grey. A single
// user-facing message because the root cause in both branches is "no body
// content to summarize from". Do NOT special-case by summaryModel here; the
// branching policy lives upstream, templates just render.

import type { FirmResult } from '../types.js';

export function renderHtml(firms: FirmResult[], dateKst: string): string {
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

  return `<!doctype html><html><body style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:16px;">
    <h1 style="font-size:22px;">법률 다이제스트 ${escapeHtml(dateKst)}</h1>
    ${sections}
    <footer style="margin-top:32px;color:#888;font-size:12px;">AI 요약 — 원문 확인 필수</footer>
  </body></html>`;
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
