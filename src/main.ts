// Composition root — the ONE place that wires every pipeline stage together.
//
// This file is the runtime manifestation of OPS-03 "run-transaction ordering"
// (Pitfall #4, the keystone invariant of Phase 1). The sequence below is not
// re-defined anywhere else in the codebase. Every other module is pure I/O
// or pure computation; order-of-operations lives here and here only.
//
// Canonical sequence (DO NOT REORDER):
//
//   1. loadFirms / loadRecipient        — fail-fast on bad YAML before any I/O.
//   2. readState                         — needed BEFORE fetchAll so dedup has
//                                          the prior seen-set at hand.
//   3. fetchAll                          — per-firm try/catch inside;
//                                          Promise.allSettled + tier dispatch
//                                          (Phase 2 FETCH-01/02); NEVER throws.
//   4. enrichWithBody                    — Phase 2 D-P2-02. Fetch each item's
//                                          detail page, extract body into
//                                          item.description. Per-firm sequential
//                                          detail fetches with 500ms delay
//                                          (D-P2-10). NEVER throws.
//   5. applyKeywordFilter                — Phase 2 D-P2-07 (CONF-06). Drop items
//                                          that don't match include/exclude
//                                          keywords BEFORE Gemini burns quota.
//                                          Pure function. NEVER throws.
//   6. dedupAll                          — pure function; can't throw. Extended
//                                          bootstrap guard (D-P2-08 empty-state).
//   7. summarize per item + pLimit(3)    — FETCH-03 concurrency cap on Gemini
//                                          calls. SUMM-06 (B3): items WITHOUT
//                                          item.description bypass Gemini
//                                          entirely — the title NEVER enters
//                                          the LLM prompt.
//   8. if (newTotal > 0) compose+sendMail — DEDUP-03: silent day = no email.
//                                          EMAIL-05 failed-firm footer rendered
//                                          from results.filter(r => r.error).
//                                          EMAIL-07 SMTP pRetry wrapper.
//   9. writeState                        — runs in BOTH branches (incl. the
//                                          zero-new branch, which still
//                                          refreshes lastUpdated and — on
//                                          first-run bootstrap per B1 and
//                                          D-P2-08 empty-state bootstrap —
//                                          seeds urls from r.raw).
//
// Pitfall 1 (non-idempotent retry) is prevented by step 9 running STRICTLY
// AFTER step 8: if sendMail throws, writeState never runs, retry reads the
// same seen.json, dedup returns the same new items, retry re-sends. Reversing
// steps 8 and 9 would cause silent item loss on retry.
//
// Phase 4 D-08 fail-loud rule: runPipeline now tracks jsRenderFailures — the
// count of type==='js-render' firms whose FirmResult carries an error. main()
// returns 1 AFTER runPipeline has returned (i.e., after email + archive + state
// write all completed) when that count is > 0. Order matters: the recipient
// sees today's healthy-firm digest, state advances, archive is committed —
// THEN the workflow goes red and the Phase 1 OPS-07 issue-opener fires.
// Reversing would lose state on js-render failures or suppress today's digest
// entirely; both are worse than the current "partial digest + red run" trade.
//
// Pattern 2 (DRY_RUN containment): sanctioned DRY_RUN check sites are:
//   1. src/mailer/gmail.ts   — skip SMTP send (EMAIL-06)
//   2. src/state/writer.ts   — skip disk write (OPS-06)
//   3. src/archive/writer.ts — skip archive write (Phase 3 OPS-09 R-02)
//   4. src/main.ts           — Phase 10 DQOBS-03 step-summary stdout
//                              preview; stdout only, no file writes (D-07/D-08)
//   5. src/state/pending.ts  — Phase 13 D-09 pending state disk write
//                              (added by Plan 13-01)
// Any DRY_RUN branch OUTSIDE these five sites is a Pattern 2 regression.
//
// Phase 13 D-01/D-04/D-06: main.ts now dispatches to runDaily() or runWeekly()
// based on the `--mode=daily|weekly` flag. Missing/invalid mode is a hard exit 2
// + Usage stderr — aggressive failure detection over silent default (user-memory
// preference). The cron + manual workflow_dispatch are expected to pass --mode
// explicitly; checkFirm.ts (the dev CLI) calls runDaily directly without going
// through main().
//
// Local-dev dotenv loader: `import 'dotenv/config'` MUST be the first import
// so `.env` values land in process.env before any downstream module reads
// them (notably src/summarize/gemini.ts which fail-louds when
// GEMINI_API_KEY is unset — see debug session gemini-403-access-token-scope).
// On GHA no `.env` exists, so dotenv silently no-ops and secrets arrive via
// the workflow's env: block as before. Safe on both paths.

import 'dotenv/config';

import { runDaily } from './pipeline/runDaily.js';
import { runWeekly } from './pipeline/runWeekly.js';
import type { RunReport } from './pipeline/runTypes.js';
import type { FirmResult } from './types.js';
import { getGeminiCallCount } from './summarize/gemini.js';
import { scrubSecrets } from './util/logging.js';
import { isDryRun } from './env.js';
import { renderMarkersMarkdown } from './observability/summary.js';

/**
 * Phase 13 D-04/D-06 — hand-rolled mode flag parser. Mirrors
 * src/cli/checkFirm.ts parseArgs style (exit 2 on usage error). Supports both
 * `--mode=daily` and `--mode daily` forms. Missing/invalid mode is a HARD
 * exit so a manual workflow_dispatch that forgot the mode flag does NOT
 * silently degrade to one path or the other. Aggressive failure detection
 * over silent fallback (user-memory preference).
 */
export type Mode = 'daily' | 'weekly';

export function parseMode(argv: string[]): Mode {
  const args = argv.slice(2);
  let mode: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1];
      i++;
    } else if (args[i].startsWith('--mode=')) {
      mode = args[i].slice('--mode='.length);
    }
  }
  if (mode !== 'daily' && mode !== 'weekly') {
    console.error('Usage: pnpm tsx src/main.ts --mode=daily|weekly');
    process.exit(2);
  }
  return mode;
}

/**
 * Phase 260612-lbt — exported for unit testing. Emits one console.error line
 * per failing js-render firm (type==='js-render' || detail_tier==='js-render')
 * with firm id and scrubbed error message. Called in the FATAL block BEFORE
 * the summary count line so the per-firm lines are greppable in the GHA run
 * log and auto-issue body.
 *
 * scrubSecrets() applied defensively on the error.message even though fetch.ts
 * already scrubs at the catch site — satisfies T-260612-01 defense-in-depth.
 */
export function emitJsRenderFatalLines(results: FirmResult[]): void {
  for (const r of results) {
    if (
      r.error != null &&
      (r.firm.type === 'js-render' || r.firm.detail_tier === 'js-render')
    ) {
      console.error(
        `[js-render-fail] firm=${r.firm.id} error=${scrubSecrets(r.error.message)}`,
      );
    }
  }
}

/**
 * Phase 10 DQOBS-03 — exported for unit testing of the fourth sanctioned
 * DRY_RUN stdout emission. Shape: (report, geminiCallCount) → console
 * side-effects only. Pure w.r.t. return value (void); side-effect-only on
 * console.log.
 *
 * Phase 13 D-07/D-21: prepends `[METRIC] geminiCallCount=N` line so the
 * DRY_RUN stdout preview is byte-for-byte parity with the writeStepSummary
 * GHA step-summary payload (src/observability/summary.ts emits the same
 * marker first). D-22: emitted even when N=0 so weekly runs still surface
 * the grep marker uniformly.
 */
export function emitDryRunStepSummary(
  report: RunReport,
  geminiCallCount: number = 0,
): void {
  if (!isDryRun()) return;
  console.log('[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):');
  // Phase 13 D-21 byte-parity: writeStepSummary emits this line first
  // (followed by blank line) then the markdown table. Mirror exactly here.
  console.log(`[METRIC] geminiCallCount=${geminiCallCount}\n`);
  const table = report.recorder.toMarkdownTable(report.firms);
  console.log(table);
  const markersBlock = renderMarkersMarkdown(report.markers);
  if (markersBlock.length > 0) {
    // Trim the single trailing newline the helper appends — console.log
    // adds its own; avoids an ugly double blank line in stdout preview.
    console.log(markersBlock.trimEnd());
  }
}

async function main(): Promise<number> {
  try {
    // Phase 13 D-01/D-04 — dispatch by --mode flag. parseMode fail-fasts
    // on missing/invalid mode (exit 2). runDaily and runWeekly share the
    // same RunOptions/RunReport surface so this dispatch is a thin if/else.
    const mode = parseMode(process.argv);

    if (mode === 'daily') {
      // Phase 4 D-08: after runDaily returns (pending append + state written),
      // inspect jsRenderFailures. If any js-render firm errored, return 1
      // so the GHA step goes red and the if: failure() auto-issue step fires —
      // but ONLY after today's pending + seen.json are locked in.
      const report = await runDaily();
      emitDryRunStepSummary(report, getGeminiCallCount());
      if (report.jsRenderFailures > 0) {
        emitJsRenderFatalLines(report.results);
        console.error(
          `FATAL: ${report.jsRenderFailures} js-render firm(s) failed — see email footer; state + archive have already been committed`,
        );
        return 1;
      }
      return 0;
    }

    // mode === 'weekly' — runWeekly composes digest (or heartbeat on empty
    // pending), sends email, archives, truncates pending. Weekly never calls
    // Gemini so getGeminiCallCount() reads 0 (D-22 grep marker uniformity).
    const report = await runWeekly();
    emitDryRunStepSummary(report, getGeminiCallCount());
    return 0;
  } catch (err) {
    console.error('FATAL:', scrubSecrets((err as Error).message));
    return 1;
  }
}

// Phase 10 Approach C — NODE_ENV=test guard. Run main() only when invoked
// as the cron entry point (normal pnpm/tsx/node execution). Vitest sets
// NODE_ENV=test by default (Vitest 1.x+ contract), so importing main.ts
// from test/main.test.ts to exercise `emitDryRunStepSummary` does NOT
// invoke main() transitively → no premature process.exit during testing.
if (process.env.NODE_ENV !== 'test') {
  main().then((code) => process.exit(code));
}
