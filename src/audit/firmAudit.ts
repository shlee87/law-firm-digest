// Firm-audit probe orchestrator (Phase 6).
//
// Public entry: runAudit(options) → AuditReport. Fans out one probe per
// firm via Promise.allSettled (per-firm isolation — Phase 2 D-P2-03), then
// serializes via writer.ts and writes ONE atomic file at AUDIT_OUTPUT_PATH.
//
// Tier dispatch (D-06):
//   - rss       → list-only via scrapeRss; status determined by item count
//   - html      → list via scrapeHtml + N=2 detail via decodeCharsetAwareFetch
//                 + extractBody → classifyDetailIdentity
//   - js-render → list via scrapeJsRender + N=2 detail via Playwright
//                 (shared chromium browser, per-firm context — Phase 4 D-05)
//
// Chromium launches IFF any js-render firm is in scope (saves ~1.2s when
// none). Close in outer finally so a throw inside per-firm fan-out never
// leaks the browser process.
//
// Output path is a hardcoded constant — Phase 11 cron-gate workflow
// expects this exact path.

import pLimit from 'p-limit';
import { writeFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import { loadFirms } from '../config/loader.js';
import { fetchRobots, isAllowed } from '../scrapers/robots.js';
import { scrapeRss } from '../scrapers/rss.js';
import { scrapeHtml } from '../scrapers/html.js';
import { scrapeJsRender } from '../scrapers/jsRender.js';
import {
  decodeCharsetAwareFetch,
  extractBody,
} from '../scrapers/util.js';
import { scrubSecrets, USER_AGENT } from '../util/logging.js';
import { classifyDetailIdentity } from './signals.js';
import { renderAuditMarkdown } from './writer.js';
import type {
  AuditRow,
  AuditReport,
  Status,
  Remediation,
  RunOptions,
} from './types.js';
import type { FirmConfig, FirmType, RawItem } from '../types.js';

export const AUDIT_OUTPUT_PATH =
  '.planning/phases/06-firm-audit-probe/06-AUDIT.md';

// Sample size for detail probing (D-06; SC-2 floor).
const DETAIL_SAMPLE_N = 2;

// Mirror src/scrapers/jsRender.ts:45-46 — re-declared locally to keep
// audit decoupled from production constants per RESEARCH.md L177.
const PLAYWRIGHT_GOTO_TIMEOUT_MS = 15_000;

/**
 * Default remediation mapping per Status × Tier.
 * Caller may override (e.g., orchestrator overrides for cooley-style
 * CF-block to migrate-to-sitemap). Not exported.
 */
function defaultRemediation(
  status: Status,
  tier: FirmType,
): Remediation | null {
  switch (status) {
    case 'OK':
      return null;
    case 'list-fail':
      return 'monitor';
    case 'selector-empty':
      return 'fix-selector';
    case 'detail-identical':
      // html → SPA detail typical → enable-js-render-detail
      // js-render → already JS; weirder root cause → monitor
      return tier === 'html' ? 'enable-js-render-detail' : 'monitor';
    case 'detail-empty':
      return 'fix-selector';
    case 'detail-quality-unknown':
      return 'monitor';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive as string}`);
    }
  }
}

function targetPhaseFor(remediation: Remediation | null): string | null {
  if (remediation === null) return null;
  switch (remediation) {
    case 'enable-js-render-detail': return 'Phase 7';
    case 'fix-selector':            return 'Phase 7';
    case 'disable-firm':            return 'immediate';
    case 'migrate-to-sitemap':      return 'Phase 9';
    case 'monitor':                 return 'Phase 10/11';
    default: {
      const _exhaustive: never = remediation;
      throw new Error(`Unhandled remediation: ${_exhaustive as string}`);
    }
  }
}

function makeRow(
  firm: FirmConfig,
  status: Status,
  items: number,
  evidence: string,
): AuditRow {
  const remediation = defaultRemediation(status, firm.type);
  return {
    firmId: firm.id,
    firmName: firm.name,
    tier: firm.type,
    status,
    items,
    remediation,
    targetPhase: targetPhaseFor(remediation),
    evidence,
    disabled: !firm.enabled,
  };
}

async function probeRssFirm(firm: FirmConfig): Promise<AuditRow> {
  try {
    const items = await scrapeRss(firm);
    if (items.length === 0) {
      return makeRow(firm, 'selector-empty', 0, 'feed parsed; 0 items');
    }
    return makeRow(firm, 'OK', items.length, `feed parsed; ${items.length} items`);
  } catch (err) {
    const msg = scrubSecrets((err as Error).message);
    return makeRow(firm, 'list-fail', 0, msg);
  }
}

async function probeHtmlFirm(firm: FirmConfig): Promise<AuditRow> {
  let items: RawItem[];
  try {
    items = await scrapeHtml(firm);
  } catch (err) {
    return makeRow(firm, 'list-fail', 0, scrubSecrets((err as Error).message));
  }
  if (items.length === 0) {
    return makeRow(firm, 'selector-empty', 0, 'list page OK; 0 items extracted');
  }

  // N=2 detail fetch — port from scripts/detail-page-audit.ts:21-32 (then DELETED in Plan 05).
  const bodies: { url: string; title: string; body: string }[] = [];
  for (const item of items.slice(0, DETAIL_SAMPLE_N)) {
    try {
      const { html } = await decodeCharsetAwareFetch(item.url);
      const body = extractBody(html, firm.selectors?.body);
      bodies.push({ url: item.url, title: item.title, body });
    } catch {
      // per-detail-page isolation; insufficient bodies → detail-quality-unknown
    }
  }

  const result = classifyDetailIdentity(bodies);
  return makeRow(firm, result.status, items.length, result.evidence);
}

async function probeJsRenderFirm(
  firm: FirmConfig,
  browser: Browser,
): Promise<AuditRow> {
  let items: RawItem[];
  try {
    items = await scrapeJsRender(firm, browser);
  } catch (err) {
    return makeRow(firm, 'list-fail', 0, scrubSecrets((err as Error).message));
  }
  if (items.length === 0) {
    return makeRow(firm, 'selector-empty', 0, 'list page OK; 0 items extracted');
  }

  // Open a per-firm context for detail probing (Phase 4 D-05 pattern).
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const bodies: { url: string; title: string; body: string }[] = [];
    for (const item of items.slice(0, DETAIL_SAMPLE_N)) {
      const detailPage = await context.newPage();
      try {
        // Phase 4 D-14 — detail-page wait is domcontentloaded ONLY (no firm.wait_for).
        await detailPage.goto(item.url, {
          timeout: PLAYWRIGHT_GOTO_TIMEOUT_MS,
          waitUntil: 'domcontentloaded',
        });
        const detailHtml = await detailPage.content();
        const body = extractBody(detailHtml, firm.selectors?.body);
        bodies.push({ url: item.url, title: item.title, body });
      } catch {
        // per-detail isolation
      } finally {
        await detailPage.close();
      }
    }
    const result = classifyDetailIdentity(bodies);
    return makeRow(firm, result.status, items.length, result.evidence);
  } finally {
    await context.close();
  }
}

export async function runAudit(options: RunOptions): Promise<AuditReport> {
  const firms = await loadFirms({ includeDisabled: options.includeDisabled });
  const startedAt = new Date();
  const reporter = options.reporter ?? { section: () => {} };
  reporter.section('audit', `${firms.length} firm(s) in scope`);

  // D-05 / Phase 4 — launch chromium IFF any js-render firm in scope.
  const hasJsRender = firms.some((f) => f.type === 'js-render');
  let browser: Browser | undefined;
  if (hasJsRender) {
    browser = await chromium.launch({ headless: true });
    reporter.section('chromium', 'launched');
  }

  try {
    const limit = pLimit(3);
    const settled = await Promise.allSettled(
      firms.map((firm) =>
        limit(async (): Promise<AuditRow> => {
          try {
            // Pattern S3 — robots.txt gate before any tier dispatch.
            const origin = new URL(firm.url).origin;
            const disallows = await fetchRobots(origin);
            if (!isAllowed(firm.url, disallows)) {
              return makeRow(
                firm,
                'list-fail',
                0,
                `robots.txt disallows ${firm.url}`,
              );
            }
            switch (firm.type) {
              case 'rss':       return await probeRssFirm(firm);
              case 'html':      return await probeHtmlFirm(firm);
              case 'js-render': return await probeJsRenderFirm(firm, browser!);
              case 'sitemap':
                // Phase 9 Plan 09-01: FirmType union now includes 'sitemap';
                // the real probeSitemapFirm lands in Plan 09-03 Task 4. Until
                // then, sitemap firms report list-fail so `pnpm audit:firms`
                // does not crash on "Unknown tier" during the interim between
                // plan 01 (types+schema) and plan 03 (audit wiring).
                return makeRow(
                  firm,
                  'list-fail',
                  0,
                  'sitemap tier audit wiring lands in Phase 9 Plan 09-03 Task 4',
                );
              default: {
                const _exhaustive: never = firm.type;
                throw new Error(`Unknown tier: ${_exhaustive as string}`);
              }
            }
          } catch (err) {
            // Expected error path — convert to row with list-fail status.
            return makeRow(
              firm,
              'list-fail',
              0,
              scrubSecrets((err as Error).message),
            );
          }
        }),
      ),
    );

    // Defense-in-depth: settled-rejected branch synthesizes a row.
    const rows: AuditRow[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const reason = r.reason;
      const msg = scrubSecrets(
        reason instanceof Error ? reason.message : String(reason),
      );
      return makeRow(firms[i], 'list-fail', 0, msg);
    });

    const okCount = rows.filter((r) => r.status === 'OK').length;
    const report: AuditReport = {
      rows,
      runMetadata: {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        includeDisabled: options.includeDisabled === true,
        totalFirms: rows.length,
        okCount,
        nonOkCount: rows.length - okCount,
        probeVersion: process.env.GITHUB_SHA ?? 'unknown',
      },
      outputPath: AUDIT_OUTPUT_PATH,
    };

    // Pitfall 6 — ONE writeFile, atomic. Build full string in memory first.
    const markdown = renderAuditMarkdown(report);
    await writeFile(AUDIT_OUTPUT_PATH, markdown, 'utf8');
    reporter.section('write', AUDIT_OUTPUT_PATH);
    return report;
  } finally {
    if (browser) {
      await browser.close();
      reporter.section('chromium', 'closed');
    }
  }
}
