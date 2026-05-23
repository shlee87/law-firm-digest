// runDaily — Phase 13 D-01 daily-mode entry (Tue~Sun).
//
// Canonical daily sequence (DO NOT REORDER — mirrors Phase 1 OPS-03 ordering,
// truncated at summarize → pending append → state write):
//
//   1. loadFirms / loadRecipient / loadTopics / loadSettings   — fail-fast on bad YAML.
//   2. Apply firmFilter if set                                  — D-05 Firm-not-found.
//   3. readState (seen.json)                                    — dedup input.
//   4. detectStaleness                                          — Phase 3 warnings.
//   5. fetchAll(firms, recorder, browser)                       — per-firm Promise.allSettled.
//   6. enrichWithBody                                           — Phase 2 D-P2-02.
//   7. applyKeywordFilter → applyTopicFilter                    — Phase 2/12 quota guards.
//   8. dedupAll                                                 — pure function.
//   9. summarize (or skipGemini)                                — FETCH-03 pLimit + Phase 13 counter.
//  10. appendPending(toPendingItem(...))                        — D-07 + D-09 windowStart preserved.
//  11. writeStepSummary (in finally)                            — D-21 [METRIC] line.
//  12. writeState (seen.json)                                   — OPS-03 LAST step.
//
// D-01 cross-mode invariant: this file DOES NOT IMPORT sendMail,
// writeArchive, composeDigest, composeHeartbeat, detectHallucinationClusters,
// or detectLowConfidence. The compiler enforces the split — adding any of
// these imports is a Phase 13 regression that grep gates will catch.
//
// D-12: cluster + low-confidence detection runs in runWeekly only. Daily
// firm-batch sizes (1~2 items/firm) are below the cluster threshold (3+) so
// detection is permanently no-op on daily; running it would waste cycles and
// risk false positives across cross-day comparison. Detection moves to weekly
// where 50~100 cumulated items make threshold-3 meaningful.
//
// D-19: resetGeminiCallCount() at the top of the try block, getGeminiCallCount()
// inside the finally so partial runs still report the count.
//
// Pattern 2 DRY_RUN containment: this file does NOT import the env dry-run
// helper. The five sanctioned check sites stay confined to mailer/gmail.ts,
// state/writer.ts, archive/writer.ts, main.ts, and state/pending.ts (Plan
// 13-01's check site #5 — written through by appendPending below).

import pLimit from 'p-limit';
import { chromium, type Browser } from 'playwright';
import {
  loadFirms,
  loadRecipient,
  loadTopics,
  loadSettings,
} from '../config/loader.js';
import { readState } from '../state/reader.js';
import { writeState } from '../state/writer.js';
import { fetchAll } from './fetch.js';
import { enrichWithBody } from './enrichBody.js';
import { applyKeywordFilter, applyTopicFilter } from './filter.js';
import { dedupAll } from './dedup.js';
import {
  summarize,
  resetGeminiCallCount,
  getGeminiCallCount,
} from '../summarize/gemini.js';
import { detectStaleness } from '../observability/staleness.js';
import { Recorder } from '../observability/recorder.js';
import { writeStepSummary } from '../observability/summary.js';
import { appendPending, toPendingItem } from '../state/pending.js';
import type { FirmResult, SummarizedItem } from '../types.js';
import type { RunOptions, RunReport } from './runTypes.js';
import { noopReporter } from './runTypes.js';
import type { PendingItem } from '../state/pending.js';
// D-01 FORBIDDEN imports (enforce via absence — grep gate in acceptance):
//   - '../mailer/gmail.js' (sendMail)
//   - '../archive/writer.js' (writeArchive)
//   - '../compose/digest.js' (composeDigest)
//   - '../compose/heartbeat.js' (composeHeartbeat — Plan 13-04 creates this)
//   - './detectClusters.js' (detectHallucinationClusters)
//   - './detectLowConfidence.js' (detectLowConfidence)

export async function runDaily(options: RunOptions = {}): Promise<RunReport> {
  const {
    firmFilter,
    skipStateWrite = false,
    skipGemini = false,
    reporter = noopReporter,
  } = options;

  const now = new Date();
  const recorder = new Recorder();
  const settings = await loadSettings();
  const allFirms = await loadFirms();
  // recipient loaded for symmetry with runWeekly contract, even though
  // runDaily does not send — keeps composition-root parity in case a future
  // dry-render plan reintroduces saveHtmlPath here.
  await loadRecipient();
  const topics = await loadTopics();

  // Firm filter (D-05 R-01).
  let firms = allFirms;
  if (firmFilter) {
    const match = allFirms.find((f) => f.id === firmFilter);
    if (!match) {
      const ids = allFirms.map((f) => f.id).sort().join(', ');
      throw new Error(`Firm not found: ${firmFilter}. Valid ids: ${ids}`);
    }
    firms = [match];
    reporter.section('target', `firm=${match.id}`);
  }

  // Phase 4/7/9 browser short-circuit (verbatim from run.ts lines 172-181).
  const hasJsRender = firms.some(
    (f) =>
      f.type === 'js-render' ||
      f.detail_tier === 'js-render' ||
      f.type === 'sitemap',
  );
  let browser: Browser | undefined;
  if (hasJsRender) {
    browser = await chromium.launch({ headless: true });
  }

  try {
    // D-19: reset counter at the top of the run-transaction. Counter accumulates
    // through summarize() calls and is read in the finally block.
    resetGeminiCallCount();

    const seen = await readState();
    const warnings = detectStaleness(seen, allFirms, now);

    reporter.section('fetch', `${firms.length} firm(s)`);
    const fetched = await fetchAll(firms, recorder, browser);
    reporter.section(
      'fetch',
      fetched
        .map((r) =>
          r.error
            ? `${r.firm.id}: error ${r.error.message}`
            : `${r.firm.id}: ${r.raw.length} items (${r.durationMs}ms)`,
        )
        .join(' | '),
    );

    const enriched = await enrichWithBody(fetched, browser);
    reporter.section(
      'enrich',
      enriched
        .map(
          (r) =>
            `${r.firm.id}: ${r.raw.filter((i) => !!i.description).length}/${r.raw.length} bodies`,
        )
        .join(' | '),
    );

    // Phase 10 DQOBS-01 Site 1 — body lengths recorded post-enrich (verbatim from run.ts:229-233).
    for (const r of enriched) {
      if (r.error) continue;
      const lengths = r.raw.map((item) => (item.description ?? '').length);
      recorder.firm(r.firm.id).bodyLengths(lengths);
    }

    const filtered = applyKeywordFilter(enriched);
    reporter.section(
      'filter',
      filtered.map((r) => `${r.firm.id}: ${r.raw.length} after filter`).join(' | '),
    );

    const topicFiltered = applyTopicFilter(filtered, topics);
    for (const r of topicFiltered) {
      if (r.error || !r.topicFiltered?.length) continue;
      for (const item of r.topicFiltered) {
        console.log(`[filter] skipped — no topic match: ${item.title}`);
      }
    }

    const deduped = dedupAll(topicFiltered, seen);
    for (const r of deduped) {
      recorder.firm(r.firm.id).newCount(r.new.length);
    }
    reporter.section(
      'dedup',
      deduped.map((r) => `${r.firm.id}: ${r.new.length} new`).join(' | '),
    );

    // Step 9 — summarize (verbatim from run.ts:262-312 minus the cluster/low-conf
    // detection that runs only in weekly per D-12). Phase 13 counter increments
    // inside summarize() at each generateContent attempt.
    const summarizeLimit = pLimit(settings.gemini.concurrency);
    const summarized: FirmResult[] = await Promise.all(
      deduped.map(async (r) => {
        if (r.error || r.new.length === 0) return r;
        const out: SummarizedItem[] = await Promise.all(
          r.new.map((item) =>
            summarizeLimit(async (): Promise<SummarizedItem> => {
              if (skipGemini) {
                return {
                  ...item,
                  summary_ko: null,
                  summaryConfidence: 'low' as const,
                  summaryModel: 'cli-skipped',
                };
              }
              const body = item.description ?? '';
              if (body.trim().length < settings.digest.min_body_chars) {
                return {
                  ...item,
                  summary_ko: item.title,
                  summaryConfidence: 'low' as const,
                  summaryModel: 'skipped',
                };
              }
              return summarize(
                item,
                body,
                {
                  primary: settings.gemini.primary_model,
                  fallback: settings.gemini.fallback_model,
                },
                settings.prompt,
              );
            }),
          ),
        );
        recorder
          .firm(r.firm.id)
          .summarized(
            out.filter(
              (it) =>
                it.summaryModel !== 'skipped' && it.summaryModel !== 'cli-skipped',
            ).length,
          );
        return { ...r, summarized: out };
      }),
    );

    // Phase 10 DQOBS-01 Site 2 — H/M/L tally (cluster detection moved to weekly per D-12,
    // so layer3 cluster-demote count is always 0 here. Keep layer1+layer2 — same code as run.ts
    // minus the layer3 contributor).
    for (const r of summarized) {
      if (r.error) continue;
      const layer1 = r.summarized.filter((it) => it.summaryModel === 'skipped').length;
      const layer2 = r.summarized.filter(
        (it) =>
          it.summary_ko === it.title &&
          it.summaryModel !== 'skipped' &&
          it.summaryModel !== 'failed' &&
          it.summaryModel !== 'cli-skipped',
      ).length;
      // D-12: layer3 (cluster-demoted) is 0 here. Detection runs in weekly.
      recorder.firm(r.firm.id).guardCount(layer1 + layer2);
      const h = r.summarized.filter((it) => it.summaryConfidence === 'high').length;
      const m = r.summarized.filter((it) => it.summaryConfidence === 'medium').length;
      const l = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
      recorder.firm(r.firm.id).confidence(h, m, l);
    }

    // jsRenderFailures count (Phase 4 D-08 — used by main.ts for exit code).
    // Phase 13 W-02 fix: also count failures from firms with
    // detail_tier === 'js-render'. The browser launch decision above (lines
    // 104-109) considers both type and detail_tier, so the fail-loud gate
    // must mirror that surface — otherwise js-rendering regressions on
    // detail-tier-only firms slip past the cron failure-issue auto-opener.
    // (type === 'sitemap' deliberately not included — scope decision deferred.)
    const jsRenderFailures = summarized.filter(
      (r) =>
        r.error != null &&
        (r.firm.type === 'js-render' || r.firm.detail_tier === 'js-render'),
    ).length;

    // Step 10 — convert SummarizedItem → PendingItem (COMP-05 enforced by toPendingItem)
    // and append. Skip firms that errored (we don't have summarized items for them).
    const pendingItems: PendingItem[] = summarized
      .filter((r) => !r.error)
      .flatMap((r) => r.summarized.map((s) => toPendingItem(s, now)));
    await appendPending(pendingItems);
    reporter.section('pending', `appended ${pendingItems.length} item(s)`);

    const report: RunReport = {
      results: summarized,
      digestSent: false, // D-01: runDaily never sends
      warnings,
      recorder,
      jsRenderFailures,
      markers: [], // D-12: detection runs in weekly
      firms: allFirms,
    };

    try {
      // Step 12 — state write (OPS-03 LAST). The atomic commit step in
      // .github/workflows/daily.yml groups pending.json + seen.json so a
      // runner death between this and appendPending leaves both files
      // un-touched — idempotent recovery on next daily run.
      if (!skipStateWrite) {
        await writeState(seen, summarized);
      }
    } finally {
      // D-21 [METRIC] line via 4th arg. allFirms (not filtered) so the table
      // shows the whole roster — same as run.ts behavior.
      await writeStepSummary(recorder, allFirms, [], getGeminiCallCount());
    }

    return report;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
