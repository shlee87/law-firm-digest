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
//   3. fetchAll                          — per-firm try/catch inside; NEVER
//                                          throws; errors captured on
//                                          FirmResult.error.
//   4. dedupAll                          — pure function; can't throw.
//   5. summarize per item + pLimit(3)    — FETCH-03 concurrency cap on Gemini
//                                          calls. SUMM-06 (B3): items WITHOUT
//                                          item.description bypass Gemini
//                                          entirely — the title NEVER enters
//                                          the LLM prompt.
//   6. if (newTotal > 0) compose+sendMail — DEDUP-03: silent day = no email.
//   7. writeState                        — runs in BOTH branches (incl. the
//                                          zero-new branch, which still
//                                          refreshes lastUpdated and — on
//                                          first-run bootstrap per B1 — seeds
//                                          urls from r.raw via plan 10
//                                          writer).
//
// Pitfall 1 (non-idempotent retry) is prevented by step 7 running STRICTLY
// AFTER step 6: if sendMail throws, writeState never runs, retry reads the
// same seen.json, dedup returns the same new items, retry re-sends. Reversing
// steps 6 and 7 would cause silent item loss on retry.
//
// Pattern 2 (DRY_RUN containment): this file does NOT import the env dry-run
// helper. The two sanctioned DRY_RUN check sites are mailer/gmail.ts and
// state/writer.ts. Any DRY_RUN branch here would be a Pattern 2 regression.

import pLimit from 'p-limit';
import { loadFirms, loadRecipient } from './config/loader.js';
import { readState } from './state/reader.js';
import { fetchAll } from './pipeline/fetch.js';
import { dedupAll } from './pipeline/dedup.js';
import { summarize } from './summarize/gemini.js';
import { composeDigest } from './compose/digest.js';
import { sendMail } from './mailer/gmail.js';
import { writeState } from './state/writer.js';
import { scrubSecrets } from './util/logging.js';
import type { FirmResult, SummarizedItem } from './types.js';

async function main(): Promise<number> {
  try {
    const firms = await loadFirms();
    const recipient = await loadRecipient();
    // D-05 override chain: env wins over YAML. fromAddr defaults to the
    // first recipient (when a list is configured) so the single-user
    // self-send path still works with zero extra configuration; multi-
    // recipient setups should put the Gmail-authenticated address first
    // or set GMAIL_FROM_ADDRESS explicitly.
    const fromAddr =
      process.env.GMAIL_FROM_ADDRESS ??
      (Array.isArray(recipient) ? recipient[0] : recipient);
    const seen = await readState();

    const fetched = await fetchAll(firms);
    const deduped = dedupAll(fetched, seen);

    // FETCH-03 spirit: cap parallel Gemini calls at 3 globally per run. A
    // single shared limiter across all firms is correct — Phase 1 has one
    // firm, Phase 2 will add many, and the cap should be per-run, not
    // per-firm.
    const summarizeLimit = pLimit(3);
    const summarized: FirmResult[] = await Promise.all(
      deduped.map(async (r) => {
        if (r.error || r.new.length === 0) return r;
        const out: SummarizedItem[] = await Promise.all(
          r.new.map((item) =>
            summarizeLimit(async (): Promise<SummarizedItem> => {
              // SUMM-06 / B3 guard: if we have no real article body, the
              // title is NOT a substitute — SUMM-06 forbids the title from
              // ever reaching Gemini. Skip the LLM call entirely and mark
              // the item with summaryModel: 'skipped' so logs and audits
              // can distinguish "intentionally bypassed" from 'failed'
              // (Gemini called and erred). Composer (plan 08) renders both
              // null-summary origins identically.
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
        return { ...r, summarized: out };
      }),
    );

    const newTotal = summarized.reduce((n, r) => n + r.summarized.length, 0);

    if (newTotal > 0) {
      const payload = composeDigest(summarized, recipient, fromAddr);
      await sendMail(payload); // EMAIL-06: throws on failure → caught below → exit 1.
    } else {
      // DEDUP-03: silent days do NOT send email; writeState still runs below
      // so lastUpdated advances (OPS-05 staleness detection input) and a
      // first-run bootstrap still seeds seen.firms[*].urls from r.raw.
      console.log('No new items today — skipping email (DEDUP-03).');
    }

    // OPS-03: state write is the LAST step, strictly after sendMail has
    // resolved. If sendMail threw, we never get here — retry is idempotent.
    await writeState(seen, summarized);
    return 0;
  } catch (err) {
    console.error('FATAL:', scrubSecrets((err as Error).message));
    return 1;
  }
}

main().then((code) => process.exit(code));
