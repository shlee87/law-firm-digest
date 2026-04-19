// Composition root for the LegalNewsletter pipeline. Phase 3 extraction
// from src/main.ts so that main.ts (cron path) and src/cli/checkFirm.ts
// (dev path) share the SAME sequence without drift — D-09.
//
// Canonical run-transaction sequence (DO NOT REORDER — mirrors the Phase 1
// 01-12 locked order, extended with Phase 3 observability boundaries):
//
//   1. loadFirms / loadRecipient   — fail-fast on bad YAML.
//   2. Apply firmFilter if set     — D-05 Firm-not-found error on miss.
//   3. readState                   — needed BEFORE fetchAll for dedup.
//   4. detectStaleness (Phase 3)   — computed at boundary between
//                                    readState and fetchAll, consumes the
//                                    lastUpdated + per-firm lastNewAt we
//                                    just read. Cached in report.warnings.
//   5. fetchAll(firms, recorder)   — per-firm Promise.allSettled (FETCH-02);
//                                    recorder is threaded through so per-
//                                    firm fetched/durationMs/errorClass
//                                    are captured at the try/finally
//                                    boundary (OPS-08).
//   6. enrichWithBody              — D-P2-02. Per-firm sequential detail
//                                    fetches with 500ms politeness delay.
//   7. applyKeywordFilter          — D-P2-07. Quota guard before Gemini.
//   8. dedupAll                    — pure function; B3 bootstrap guard.
//                                    AFTER dedup we record newCount per
//                                    firm for the step summary.
//   9. summarize (or skipGemini)   — FETCH-03 pLimit(3). When skipGemini,
//                                    emit SummarizedItem shells with
//                                    summaryModel='cli-skipped' — keeps
//                                    check:firm from burning Gemini quota
//                                    during debug sessions (D-08).
//  10. composeDigest (warnings)    — Phase 3: pass staleness warnings
//                                    into compose so the banner renders
//                                    between <h1> and firm sections.
//  11. (optional) write saveHtmlPath — D-07 CLI preview output. Runs
//                                    regardless of skipEmail; allows
//                                    `pnpm check:firm --save-html` to
//                                    produce a browser-previewable file.
//                                    Only emits when newTotal > 0 (no
//                                    digest = no HTML to save).
//  12. if (!skipEmail && newTotal > 0) sendMail — EMAIL-06 fail-loud.
//  13. if (!skipEmail && newTotal > 0 && mailer OK) writeArchive — OPS-09.
//                                    Archive rides AFTER sendMail success
//                                    so a mailer failure does NOT produce
//                                    an orphan archive (run-transaction
//                                    consistency with state).
//  14. writeStepSummary (finally)  — OPS-08. Env-gated no-op locally;
//                                    appends markdown table to
//                                    $GITHUB_STEP_SUMMARY on GHA. Runs
//                                    EVEN on mid-pipeline throw so
//                                    operators see the partial snapshot.
//  15. if (!skipStateWrite) writeState — OPS-03 LAST step. Strictly after
//                                    sendMail. Pitfall 1 defense.
//
// Pattern 2 DRY_RUN containment: this file does NOT import the env dry-run
// helper. The three sanctioned DRY_RUN check sites are mailer/gmail.ts
// (EMAIL-06), state/writer.ts (OPS-06), and archive/writer.ts (Phase 3
// OPS-09 R-02). Any env dry-run helper import here would be a Pattern 2
// regression. (Header comment deliberately avoids the literal identifier
// so a grep gate stays at zero.)
//
// Fail-loud contract: runPipeline throws on composition-root failures
// (loadFirms ZodError, readState version drift, sendMail failure, bad
// firmFilter). Per-firm errors (scrape failure, parse error) are captured
// in FirmResult.error and the run continues — Phase 2 D-P2-03 failure
// isolation invariant is preserved.

import pLimit from 'p-limit';
import { writeFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import { loadFirms, loadRecipient } from '../config/loader.js';
import { readState } from '../state/reader.js';
import { fetchAll } from './fetch.js';
import { enrichWithBody } from './enrichBody.js';
import { applyKeywordFilter } from './filter.js';
import { dedupAll } from './dedup.js';
import { summarize } from '../summarize/gemini.js';
import { composeDigest } from '../compose/digest.js';
import { sendMail } from '../mailer/gmail.js';
import { writeState } from '../state/writer.js';
import { writeArchive } from '../archive/writer.js';
import { detectStaleness } from '../observability/staleness.js';
import type { StalenessWarnings } from '../observability/staleness.js';
import { Recorder } from '../observability/recorder.js';
import { writeStepSummary } from '../observability/summary.js';
import type { FirmResult, SummarizedItem } from '../types.js';

export interface Reporter {
  section(name: string, detail: string): void;
}

const noopReporter: Reporter = { section: () => {} };

export interface RunOptions {
  firmFilter?: string;
  skipEmail?: boolean;
  skipStateWrite?: boolean;
  skipGemini?: boolean;
  saveHtmlPath?: string;
  reporter?: Reporter;
}

export interface RunReport {
  results: FirmResult[];
  digestSent: boolean;
  saveHtmlWritten?: string;
  archivePath?: string;
  warnings: StalenessWarnings;
  recorder: Recorder;
  jsRenderFailures: number; // Phase 4 D-08 — count of type==='js-render' firms that errored
}

export async function runPipeline(options: RunOptions = {}): Promise<RunReport> {
  const {
    firmFilter,
    skipEmail = false,
    skipStateWrite = false,
    skipGemini = false,
    saveHtmlPath,
    reporter = noopReporter,
  } = options;

  // WR-01 — capture a SINGLE wall-clock reading at the top of the run and
  // thread it through the three downstream consumers (detectStaleness,
  // composeDigest, writeArchive). Protects against KST-midnight skew: a run
  // that starts at 23:59 KST and finishes at 00:01 KST must NOT produce a
  // digest header dated 2026-04-18 while the archive lands at
  // archive/2026/04-19.html. All three timestamps derive from the same
  // Date instance.
  const now = new Date();

  const recorder = new Recorder();
  const allFirms = await loadFirms();
  const recipient = await loadRecipient();
  // D-05 override chain: env wins over YAML. fromAddr defaults to the
  // first recipient (when a list is configured) so the single-user
  // self-send path still works with zero extra configuration.
  const fromAddr =
    process.env.GMAIL_FROM_ADDRESS ??
    (Array.isArray(recipient) ? recipient[0] : recipient);

  // Step 2 — firmFilter resolution (D-05). Match against enabled-firms
  // list returned by loadFirms; unknown id → clear error listing valid ids.
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

  // D-05 / Phase 4 RESEARCH §4 — launch ONE chromium per run, shared across
  // all js-render firms. Short-circuit when no firm needs it (§8) — saves
  // ~1.2s on days when all js-render firms are disabled.
  const hasJsRender = firms.some((f) => f.type === 'js-render');
  let browser: Browser | undefined;
  if (hasJsRender) {
    browser = await chromium.launch({ headless: true });
  }

  try {
    const seen = await readState();

    // Step 4 — staleness warnings (OPS-04 + OPS-05). Computed over the FULL
    // loaded firm list (not just the filtered subset) — the banner reflects
    // repo-wide staleness, independent of CLI scoping.
    const warnings = detectStaleness(seen, allFirms, now);

    // Step 5 — fetch with recorder threaded.
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

    const enriched = await enrichWithBody(fetched);
    reporter.section(
      'enrich',
      enriched
        .map(
          (r) =>
            `${r.firm.id}: ${r.raw.filter((i) => !!i.description).length}/${r.raw.length} bodies`,
        )
        .join(' | '),
    );

    const filtered = applyKeywordFilter(enriched);
    reporter.section(
      'filter',
      filtered.map((r) => `${r.firm.id}: ${r.raw.length} after filter`).join(' | '),
    );

    const deduped = dedupAll(filtered, seen);
    for (const r of deduped) {
      recorder.firm(r.firm.id).newCount(r.new.length);
    }
    reporter.section(
      'dedup',
      deduped.map((r) => `${r.firm.id}: ${r.new.length} new`).join(' | '),
    );

    // Step 9 — summarize with skipGemini shortcut. FETCH-03 spirit: cap
    // parallel Gemini calls at 3 globally per run.
    const summarizeLimit = pLimit(3);
    const summarized: FirmResult[] = await Promise.all(
      deduped.map(async (r) => {
        if (r.error || r.new.length === 0) return r;
        const out: SummarizedItem[] = await Promise.all(
          r.new.map((item) =>
            summarizeLimit(async (): Promise<SummarizedItem> => {
              if (skipGemini) {
                // D-08 CLI path: emit shell with summaryModel='cli-skipped' so
                // downstream render still produces HTML without Gemini calls.
                return {
                  ...item,
                  summary_ko: null,
                  summaryConfidence: 'low' as const,
                  summaryModel: 'cli-skipped',
                };
              }
              // SUMM-06 / B3 guard: no real body → skip Gemini entirely.
              if (!item.description) {
                return {
                  ...item,
                  summary_ko: null,
                  summaryConfidence: 'low' as const,
                  summaryModel: 'skipped',
                };
              }
              return summarize(item, item.description);
            }),
          ),
        );
        recorder
          .firm(r.firm.id)
          .summarized(
            out.filter(
              (it) => it.summaryModel !== 'skipped' && it.summaryModel !== 'cli-skipped',
            ).length,
          );
        return { ...r, summarized: out };
      }),
    );

    const newTotal = summarized.reduce((n, r) => n + r.summarized.length, 0);
    reporter.section(
      skipGemini ? 'would-summarize' : 'summarize',
      `${newTotal} item(s)`,
    );

    // Phase 4 D-08 — count js-render firms that errored. main.ts reads this
    // to decide exit code AFTER runPipeline has returned (email+state+archive
    // all committed). jsRenderFailures > 0 → workflow goes red, Issue-opener
    // fires, but recipient already has today's digest from healthy firms.
    const jsRenderFailures = summarized.filter(
      (r) => r.firm.type === 'js-render' && r.error != null,
    ).length;

    const report: RunReport = {
      results: summarized,
      digestSent: false,
      warnings,
      recorder,
      jsRenderFailures: jsRenderFailures,
    };

    try {
      if (newTotal > 0) {
        const payload = composeDigest(summarized, recipient, fromAddr, warnings, now);

        // Step 11 — optional HTML preview (D-07).
        if (saveHtmlPath) {
          await writeFile(saveHtmlPath, payload.html, 'utf8');
          report.saveHtmlWritten = saveHtmlPath;
          reporter.section('save-html', saveHtmlPath);
        }

        // Step 12 — send email (EMAIL-06 fail-loud).
        if (!skipEmail) {
          await sendMail(payload);
          report.digestSent = true;

          // Step 13 — archive AFTER mailer success, BEFORE state write.
          // Mailer failure ⇒ no orphan archive (run-transaction consistency).
          const archivePath = await writeArchive(payload.html, now);
          report.archivePath = archivePath;
        } else {
          reporter.section('would-render', `${newTotal} item(s) in digest`);
        }
      } else {
        // DEDUP-03 silent-day: no email, but writeState still runs below so
        // lastUpdated advances (OPS-05 staleness input) and first-run bootstrap
        // seeds seen.firms[*].urls from r.raw.
        reporter.section('compose', 'no new items — digest skipped (DEDUP-03)');
      }

      // Step 15 — state write (OPS-03 LAST step, strictly after sendMail).
      if (!skipStateWrite) {
        await writeState(seen, summarized);
      }
    } finally {
      // Step 14 — step summary always emitted (even on throw). Env-gated
      // no-op inside writeStepSummary when GITHUB_STEP_SUMMARY is unset.
      await writeStepSummary(recorder, allFirms);
    }

    return report;
  } finally {
    // Phase 4 D-05 — browser.close() runs LAST, after writeStepSummary and
    // writeState. Runs unconditionally on throw too (e.g., sendMail failure,
    // ZodError) so no zombie chromium processes leak across retries.
    if (browser) {
      await browser.close();
    }
  }
}
