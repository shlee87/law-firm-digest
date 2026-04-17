// Fetch orchestrator — runs robots-gate + scraper per firm, with
// per-firm failure isolation and pLimit(3) concurrency cap.
//
// This is the single sink where all outbound scrape traffic funnels:
//   1. pLimit(3) — politeness cap (also plays nice with GHA network).
//   2. fetchRobots + isAllowed — COMP-03 pre-fetch gate (Pitfall 9).
//   3. scrapeRss — Phase 1's only scraper strategy. Phase 2 will add
//      an html.ts branch here dispatched by firm.type.
//   4. Per-firm try/catch — one firm's failure never kills sibling firms.
//      Error is captured into FirmResult.error with scrubSecrets applied
//      to the message (COMP-01). fetchAll NEVER throws.
//
// Shape invariant: every input firm produces exactly one FirmResult in
// the output array. On success `raw` is populated; on failure `raw`
// is [] and `error` is set. Downstream (plan 07 dedup / plan 11 main)
// can filter `error?` to separate winners from losers without losing
// the firm-level record needed for run reporting.

import pLimit from 'p-limit';
import { scrapeRss } from '../scrapers/rss.js';
import { fetchRobots, isAllowed } from '../scrapers/robots.js';
import { scrubSecrets } from '../util/logging.js';
import type { FirmConfig, FirmResult } from '../types.js';

/**
 * Fetch every enabled firm in parallel (capped at 3) and return a
 * FirmResult[] the size of the input array. Each firm passes through
 * the robots gate before its scraper runs. Any thrown error inside a
 * firm's block is captured into that firm's FirmResult.error — the
 * outer Promise resolves even if every firm fails.
 *
 * Phase 1 scope: only firm.type='rss' is implemented. Phase 2 will
 * add strategy dispatch (html, js-render) at the marked extension
 * point; the pLimit + per-firm try/catch scaffolding stays unchanged.
 *
 * @param firms FirmConfig[] — typically loadFirms() output (enabled only).
 * @returns Promise<FirmResult[]> in the same order as `firms`.
 */
export async function fetchAll(firms: FirmConfig[]): Promise<FirmResult[]> {
  const limit = pLimit(3);
  return Promise.all(
    firms.map((firm) =>
      limit(async (): Promise<FirmResult> => {
        const started = Date.now();
        try {
          // COMP-03 pre-fetch gate — robots.txt per origin, cached
          // for the run lifetime by fetchRobots' internal Map.
          const origin = new URL(firm.url).origin;
          const disallows = await fetchRobots(origin);
          if (!isAllowed(firm.url, disallows)) {
            throw new Error(`robots.txt disallows ${firm.url}`);
          }
          // Phase 1: only 'rss' strategy. Phase 2 dispatch point.
          const raw = await scrapeRss(firm);
          return {
            firm,
            raw,
            new: [],
            summarized: [],
            durationMs: Date.now() - started,
          };
        } catch (err) {
          return {
            firm,
            raw: [],
            new: [],
            summarized: [],
            error: {
              stage: 'fetch',
              message: scrubSecrets((err as Error).message),
            },
            durationMs: Date.now() - started,
          };
        }
      }),
    ),
  );
}
