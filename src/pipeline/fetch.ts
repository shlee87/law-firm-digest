// Fetch orchestrator — runs robots-gate + scraper per firm, with
// per-firm failure isolation and pLimit(3) concurrency cap.
//
// Phase 2 updates (FETCH-01, FETCH-02):
//   - Promise.all → Promise.allSettled (Pitfall 1 defense-in-depth). The
//     per-firm try/catch still catches every expected error path; allSettled
//     guards against the pathological case where a synchronous throw happens
//     OUTSIDE the try (e.g., a future refactor moves `new URL(firm.url)`
//     before the try, and the URL parser throws on malformed YAML that the
//     schema should have caught). Without allSettled, that throw would reject
//     Promise.all and the ENTIRE run would fail with no per-firm records.
//   - Tier dispatch: switch(firm.type) routes rss → scrapeRss, html →
//     scrapeHtml, js-render → throw "Phase 4 territory". A config mistake
//     that activates js-render becomes a LOUDLY visible per-firm error in
//     the email footer (EMAIL-05), not a silent skip.
//
// This is the single sink where all outbound scrape traffic funnels:
//   1. pLimit(3) — politeness cap (FETCH-03, unchanged from Phase 1).
//   2. fetchRobots + isAllowed — COMP-03 pre-fetch gate, BEFORE tier dispatch.
//   3. switch(firm.type) — scrapeRss / scrapeHtml / js-render-throw.
//   4. Per-firm try/catch — one firm's failure never kills sibling firms.
//      Error is captured into FirmResult.error with scrubSecrets applied to
//      the message (COMP-01). fetchAll NEVER throws.
//   5. Promise.allSettled — defense-in-depth above step 4. Any settled
//      'rejected' result (shouldn't happen if try/catch is intact) is
//      synthesized into a FirmResult with error.stage='fetch'.
//
// Shape invariant: every input firm produces exactly one FirmResult in
// the output array, index-aligned with the input. On success `raw` is
// populated; on failure `raw` is [] and `error` is set. Downstream
// (dedup / main) can filter `error?` to separate winners from losers
// without losing the firm-level record needed for run reporting.

import pLimit from 'p-limit';
import { scrapeRss } from '../scrapers/rss.js';
import { scrapeHtml } from '../scrapers/html.js';
import { fetchRobots, isAllowed } from '../scrapers/robots.js';
import { scrubSecrets } from '../util/logging.js';
import { classifyError } from '../compose/templates.js';
import type { Recorder } from '../observability/recorder.js';
import type { FirmConfig, FirmResult, RawItem } from '../types.js';

export async function fetchAll(
  firms: FirmConfig[],
  recorder?: Recorder,
): Promise<FirmResult[]> {
  const limit = pLimit(3);

  const settled = await Promise.allSettled(
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

          // D-P2-09 tier dispatch. js-render intentionally throws so a
          // config-file regression that sets type: js-render surfaces as
          // a per-firm error in the email footer (via EMAIL-05 classifier)
          // instead of silently scraping nothing.
          let raw: RawItem[];
          switch (firm.type) {
            case 'rss':
              raw = await scrapeRss(firm);
              break;
            case 'html':
              raw = await scrapeHtml(firm);
              break;
            case 'js-render':
              throw new Error(
                `firm ${firm.id}: js-render tier is Phase 4 territory`,
              );
            default:
              throw new Error(
                `firm ${firm.id}: unknown tier ${String(firm.type)}`,
              );
          }

          const duration = Date.now() - started;
          recorder?.firm(firm.id).fetched(raw.length).durationMs(duration);
          return {
            firm,
            raw,
            new: [],
            summarized: [],
            durationMs: duration,
          };
        } catch (err) {
          const duration = Date.now() - started;
          const message = scrubSecrets((err as Error).message);
          recorder?.firm(firm.id).errorClass(classifyError(message, 'fetch')).durationMs(duration);
          return {
            firm,
            raw: [],
            new: [],
            summarized: [],
            error: {
              stage: 'fetch',
              message,
            },
            durationMs: duration,
          };
        }
      }),
    ),
  );

  // Pitfall 9 — `reason` is typed `any` in settled-rejected entries. If the
  // per-firm try/catch is intact (contract above), NONE of these should be
  // rejected — they all resolve with FirmResult.error set instead. But
  // Pitfall 1 defense-in-depth: handle the rejected branch anyway.
  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const reason = r.reason;
    const message = scrubSecrets(
      reason instanceof Error ? reason.message : String(reason),
    );
    // Defense-in-depth recorder emission for settled-rejected branch.
    recorder?.firm(firms[i].id).errorClass(classifyError(message, 'fetch')).durationMs(0);
    return {
      firm: firms[i],
      raw: [],
      new: [],
      summarized: [],
      error: {
        stage: 'fetch',
        message,
      },
      durationMs: 0,
    };
  });
}
