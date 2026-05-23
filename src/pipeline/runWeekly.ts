// runWeekly — Phase 13 D-01 weekly-mode entry (Mon).
//
// Canonical weekly sequence (DO NOT REORDER — OPS-03 transaction ordering
// applies: sendMail BEFORE writeArchive BEFORE truncatePending BEFORE
// writeState; failure of any step leaves a recoverable transaction):
//
//   1. loadFirms / loadRecipient / loadSettings — fail-fast on bad YAML.
//   2. readPending (state/pending.json)         — D-09 + D-11 ENOENT default.
//   3. Branch on pending.items.length:
//        a. === 0 → composeHeartbeat (D-15/D-16/D-17 + SPEC Req 5).
//        b. > 0   → restoreFirmsFromPending (D-14) → detectHallucinationClusters
//                   (D-12 only here) → detectLowConfidence (D-12) → composeDigest.
//   4. sendMail                                 — EMAIL-06 fail-loud.
//   5. writeArchive                             — OPS-09; rides AFTER mailer success.
//   6. truncatePending                          — D-09 windowStart reset.
//   7. writeState (seen.json — lastUpdated only) — OPS-03 LAST step.
//   8. writeStepSummary (in finally)            — D-21 [METRIC] line with count=0.
//
// D-01 cross-mode invariant: this file DOES NOT IMPORT fetchAll,
// enrichWithBody, applyKeywordFilter, applyTopicFilter, dedupAll, summarize,
// chromium/playwright Browser. Grep gate in acceptance asserts.
//
// D-12: detectHallucinationClusters and detectLowConfidence run HERE ONLY.
// Daily firm-batches are too small for the 3+ cluster threshold to fire
// meaningfully; weekly cumulates 50~100 items where detection is the
// intended GUARD-03 use case.
//
// D-13: markers (DataQualityMarker[]) are NOT persisted to pending.json.
// Recomputed each weekly run from PendingItem[]. Detector is pure + cheap
// (<10ms for 100 items); caching invites stale-marker bugs.
//
// D-19 + D-22: resetGeminiCallCount() at top of try; getGeminiCallCount()
// in finally. Weekly never calls Gemini, so the [METRIC] line always reads
// `geminiCallCount=0` — still emitted so the grep marker stays uniform across
// daily + weekly logs.

import {
  loadFirms,
  loadRecipient,
  loadSettings,
} from '../config/loader.js';
import { readState } from '../state/reader.js';
import { writeState } from '../state/writer.js';
import { detectHallucinationClusters } from './detectClusters.js';
import { detectLowConfidence } from './detectLowConfidence.js';
import { composeDigest } from '../compose/digest.js';
import { composeHeartbeat } from '../compose/heartbeat.js';
import { sendMail } from '../mailer/gmail.js';
import { writeArchive } from '../archive/writer.js';
import { readPending, truncatePending } from '../state/pending.js';
import type { PendingItem, PendingState } from '../state/pending.js';
import { detectStaleness } from '../observability/staleness.js';
import { Recorder } from '../observability/recorder.js';
import { writeStepSummary } from '../observability/summary.js';
import { resetGeminiCallCount, getGeminiCallCount } from '../summarize/gemini.js';
import type {
  EmailPayload,
  FirmResult,
  FirmConfig,
  SummarizedItem,
  NewItem,
} from '../types.js';
import type { DataQualityMarker } from './detectClusters.js';
import type { RunOptions, RunReport } from './runTypes.js';
import { noopReporter } from './runTypes.js';
// D-01 FORBIDDEN imports:
//   - './fetch.js' (fetchAll)
//   - './enrichBody.js' (enrichWithBody)
//   - './filter.js' (applyKeywordFilter, applyTopicFilter)
//   - './dedup.js' (dedupAll)
//   - '../summarize/gemini.js' summarize (counter accessors OK)
//   - 'playwright' Browser (no fetch → no browser)

// D-14 helper: convert PendingItem[] → FirmResult[] so existing Phase 8/10
// detectors + composeDigest signatures are reusable without changes.
//
// firmId not present in firms.yaml (e.g., operator disabled a firm mid-week)
// is logged + skipped — runWeekly continues with the remaining items. This
// matches Phase 2 D-P2-03 failure isolation: a missing firm does not
// terminate the run.
function restoreFirmsFromPending(
  pending: PendingState,
  allFirms: FirmConfig[],
): FirmResult[] {
  const byFirmId = new Map<string, PendingItem[]>();
  const firmsById = new Map(allFirms.map((f) => [f.id, f]));

  for (const item of pending.items) {
    if (!firmsById.has(item.firmId)) {
      // D-14 Claude's Discretion: warn + skip when firm vanished from YAML.
      console.warn(
        `[runWeekly] skipping pending item from missing firm: firmId=${item.firmId} url=${item.url}`,
      );
      continue;
    }
    const arr = byFirmId.get(item.firmId) ?? [];
    arr.push(item);
    byFirmId.set(item.firmId, arr);
  }

  const results: FirmResult[] = [];
  for (const [firmId, items] of byFirmId) {
    const firm = firmsById.get(firmId)!;
    // Reconstruct SummarizedItem[] from PendingItem[]. description is intentionally
    // absent (COMP-05 — body was never persisted) so downstream code that reads
    // r.summarized[i].description gets undefined. composeDigest does NOT read
    // description (it reads summary_ko). detectHallucinationClusters compares
    // summary_ko prefixes. detectLowConfidence reads summaryConfidence. None
    // need description.
    const summarized: SummarizedItem[] = items.map((p) => ({
      firmId: p.firmId,
      title: p.title,
      url: p.url,
      publishedAt: p.publishedAt,
      language: p.language,
      isNew: true,
      summary_ko: p.summary_ko,
      summaryConfidence: p.summaryConfidence,
      summaryModel: p.summaryModel,
      summaryError: p.summaryError,
    }));
    results.push({
      firm,
      raw: [], // weekly does not re-fetch (D-01); not needed by compose
      new: summarized as unknown as NewItem[], // shape-compatible: SummarizedItem extends NewItem
      summarized,
      durationMs: 0,
    });
  }

  return results;
}

export async function runWeekly(options: RunOptions = {}): Promise<RunReport> {
  const {
    skipEmail = false,
    skipStateWrite = false,
    reporter = noopReporter,
  } = options;

  const now = new Date();
  const recorder = new Recorder();
  await loadSettings(); // load for parity / future use; ignore concurrency etc.
  const allFirms = await loadFirms();
  const recipient = await loadRecipient();
  const fromAddr =
    process.env.GMAIL_FROM_ADDRESS ??
    (Array.isArray(recipient) ? recipient[0] : recipient);

  // D-19 + D-22: counter resets at run start; reads as 0 in finally (weekly
  // never calls Gemini, but uniform [METRIC] emission keeps grep clean).
  resetGeminiCallCount();

  // Pre-declare markers so the finally writeStepSummary sees them on early throw.
  let markers: DataQualityMarker[] = [];
  let resultsForReport: FirmResult[] = [];

  try {
    const seen = await readState();
    const warnings = detectStaleness(seen, allFirms, now);

    const pending = await readPending();
    reporter.section(
      'pending',
      `${pending.items.length} item(s) since ${pending.windowStart}`,
    );

    let payload: EmailPayload;
    if (pending.items.length === 0) {
      // D-15/16/17 heartbeat path (SPEC Req 5). Empty-week => keep weekly
      // rhythm + signal liveness. Failed-firm/marker absence is intentional.
      payload = composeHeartbeat(recipient, fromAddr, now);
      reporter.section('compose', 'heartbeat — no pending items this week');
    } else {
      // D-14: restore FirmResult[] for the existing detectors + composeDigest.
      const firms = restoreFirmsFromPending(pending, allFirms);

      // D-12: Phase 8 cluster detector runs HERE ONLY.
      const clusterResult = detectHallucinationClusters(firms);
      const clusterAdjusted = clusterResult.firms;
      markers = clusterResult.markers;

      // Phase 10 DQOBS-01 H/M/L tally over restored items (Phase 10 invariants preserved).
      for (const r of clusterAdjusted) {
        if (r.error) continue;
        const layer1 = r.summarized.filter((it) => it.summaryModel === 'skipped').length;
        const layer2 = r.summarized.filter(
          (it) =>
            it.summary_ko === it.title &&
            it.summaryModel !== 'skipped' &&
            it.summaryModel !== 'failed' &&
            it.summaryModel !== 'cli-skipped',
        ).length;
        const layer3 = r.summarized.filter((it) => it.isClusterMember === true).length;
        recorder.firm(r.firm.id).guardCount(layer1 + layer2 + layer3);
        const h = r.summarized.filter((it) => it.summaryConfidence === 'high').length;
        const m = r.summarized.filter((it) => it.summaryConfidence === 'medium').length;
        const l = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
        recorder.firm(r.firm.id).confidence(h, m, l);
      }

      // D-12: low-confidence detector also weekly-only.
      const lowConfMarkers = detectLowConfidence(clusterAdjusted);
      markers = [...markers, ...lowConfMarkers];

      resultsForReport = clusterAdjusted;

      // composeDigest signature unchanged (D-14 helper avoided refactor).
      payload = composeDigest(
        clusterAdjusted,
        recipient,
        fromAddr,
        warnings,
        now,
        markers,
      );
      reporter.section(
        'compose',
        `${pending.items.length} item(s) across ${clusterAdjusted.length} firm(s)`,
      );
    }

    // Send + archive + truncate + state — OPS-03 ordering.
    // Phase 13 W-03 fix: archive BEFORE send so a disk failure does not leave
    // pending un-truncated after a successful send (which would resend on the
    // next weekly run). Archive write is local + cheap; sendMail is network +
    // lossy. Archive failure aborts BEFORE network egress => no duplicate-send
    // window. Trade-off: a successful archive no longer implies a successful
    // send (the inverse OPS-03 guarantee).
    let archivePath: string | undefined;
    if (!skipEmail) {
      archivePath = await writeArchive(payload.html, now);
      await sendMail(payload);
      reporter.section('send', `archive=${archivePath}`);
    } else {
      reporter.section('would-send', payload.subject);
    }

    // D-09: truncate AFTER mailer + archive succeed. Failure above → pending
    // preserved → next manual workflow_dispatch retries cleanly.
    await truncatePending();
    reporter.section('truncate', 'pending cleared');

    // OPS-03 last: state write (lastUpdated refresh; no new urls because
    // weekly does not fetch, so writeState merges an empty FirmResult[] —
    // however we still pass the restored results so summarized URLs are
    // recorded in seen.json. Conservative behavior — Phase 1 writer handles
    // empty arrays gracefully).
    if (!skipStateWrite) {
      await writeState(seen, resultsForReport);
    }

    const report: RunReport = {
      results: resultsForReport,
      digestSent: !skipEmail,
      archivePath,
      warnings,
      recorder,
      jsRenderFailures: 0, // weekly does not fetch
      markers,
      firms: allFirms,
    };
    return report;
  } finally {
    // D-22 [METRIC] line — count is always 0 in weekly, still emitted.
    await writeStepSummary(recorder, allFirms, markers, getGeminiCallCount());
  }
}
