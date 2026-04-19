// JS-rendered scraper — Playwright-based tier-3 path (Phase 4, D-05 / D-12 / D-13).
//
// Sibling to src/scrapers/rss.ts and src/scrapers/html.ts. Consumes a FirmConfig
// where type='js-render' + wait_for is set (enforced by the zod superRefine in
// src/config/schema.ts after Phase 4 plan 01). Emits the same RawItem[] contract
// so downstream dedup / enrichBody / summarize / compose stay tier-agnostic.
//
// Browser lifecycle (D-05):
//   - browser is an INJECTED parameter, NOT a module singleton. The composition
//     root (src/pipeline/run.ts, plan 04) owns launch()+close(); we own only the
//     per-firm BrowserContext.
//   - browser.newContext({ userAgent }) per firm — cookies/storage isolated.
//   - context.close() after list-page extraction (finally {} block). If a detail-
//     page Playwright fallback fires later (src/pipeline/enrichBody.ts plan 06),
//     that path opens its OWN per-firm context.
//
// Timeout policy (D-13):
//   - Hardcoded 15_000 ms on page.goto, page.waitForSelector, and context close.
//   - Not exposed via YAML in v1. If a firm proves 15s insufficient, Phase 5
//     promotes wait_for to a richer shape ({ selector, timeout_ms }).
//
// Error message shapes (D-10, COUPLED to classifyError regex in
// src/compose/templates.ts; DO NOT modify without updating classifier in lockstep):
//   - 'scrapeJsRender {firm.id}: browser-launch-fail ...' — chromium launch
//     failure, usually infra (cache miss / apt deps). Classifier regex:
//     /browser|chromium|playwright.*(launch|install|executable)/i
//   - 'scrapeJsRender {firm.id}: playwright-timeout waiting for {wait_for}' —
//     waitForSelector exceeded 15s. Classifier regex:
//     /waitForSelector|TimeoutError.*Playwright/i
//   - 'scrapeJsRender {firm.id}: zero items extracted (selector-miss)' — page
//     hydrated (wait_for matched) but downstream list_item extractor returned
//     [].  Classifier regex: /jsRender.*zero items|jsRender.*no items extracted/i
//
// NEVER returns [] silently for the "zero items" case — throws so the firm
// appears in the email failed-firm footer with errorClass='selector-miss'.
// This is intentionally stricter than scrapers/html.ts (which returns [])
// because a js-render firm hydrating successfully but extracting zero items
// is ALWAYS a contract violation worth a user-visible alert (D-10).

import type { Browser } from 'playwright';
import { USER_AGENT } from '../util/logging.js';
import { parseListItemsFromHtml } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';

const WAIT_TIMEOUT_MS = 15_000;
const GOTO_TIMEOUT_MS = 15_000;

/**
 * Fetch a JS-rendered listing page via Playwright and parse it into a
 * RawItem[]. The browser argument is owned by runPipeline (composition root)
 * — this function MUST NOT close it.
 *
 * @param firm FirmConfig with type='js-render' and a wait_for selector.
 *             Schema superRefine enforces presence at config-load time; if
 *             this function is called with a firm that lacks wait_for, we
 *             treat it as a programmer error and throw a clear message.
 * @param browser A launched chromium Browser instance (headless shell).
 * @throws Error on navigation / wait / zero-items. Outer pipeline/fetch.ts
 *         catches and synthesizes FirmResult.error.
 */
export async function scrapeJsRender(
  firm: FirmConfig,
  browser: Browser,
): Promise<RawItem[]> {
  if (!firm.wait_for) {
    // Defense-in-depth: schema superRefine should prevent this at load time.
    throw new Error(
      `scrapeJsRender ${firm.id}: wait_for is required for type='js-render' but was missing`,
    );
  }
  if (!firm.selectors) {
    throw new Error(
      `scrapeJsRender ${firm.id}: selectors block is required for list-item extraction`,
    );
  }

  const context = await browser.newContext({ userAgent: USER_AGENT });
  let html: string;
  try {
    const page = await context.newPage();
    try {
      await page.goto(firm.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector(firm.wait_for, {
        timeout: WAIT_TIMEOUT_MS,
        state: 'attached',
      });
      html = await page.content();
    } catch (err) {
      const msg = (err as Error).message;
      // Playwright's TimeoutError.message typically contains "Timeout" and the
      // selector text; normalize to our classifier-friendly phrasing.
      if (/Timeout|waiting for selector/i.test(msg)) {
        throw new Error(
          `scrapeJsRender ${firm.id}: playwright-timeout waiting for ${firm.wait_for}`,
        );
      }
      // Navigation / network / crashed-page / missing-binary all re-wrap to
      // the same errorClass. classifyError will distinguish by keyword in
      // the downstream email footer.
      if (/browser|chromium|executable|Protocol|Connection closed/i.test(msg)) {
        throw new Error(`scrapeJsRender ${firm.id}: browser-launch-fail ${msg}`);
      }
      // Anything else (DNS, HTTP non-200 navigation, abort) — re-wrap with
      // firm id prefix so classifyError still sees 'scrapeJsRender' for
      // future refinement. 'jsRender' keyword is sufficient for classifier.
      throw new Error(`scrapeJsRender ${firm.id}: ${msg}`);
    }
  } finally {
    // Always close context — prevents zombie browser contexts accumulating
    // across firms if a throw escapes. Matches Phase 2 D-P2-03 spirit.
    await context.close();
  }

  const items = parseListItemsFromHtml(html, firm);
  if (items.length === 0) {
    // D-10 selector-miss — page hydrated OK (wait_for matched) but extractor
    // returned zero items. Contract violation worth an alert.
    throw new Error(
      `scrapeJsRender ${firm.id}: zero items extracted (selector-miss) — wait_for matched but list_item ${firm.selectors.list_item} returned nothing`,
    );
  }
  return items;
}
