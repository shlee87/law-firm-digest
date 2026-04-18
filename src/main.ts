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
// Pattern 2 (DRY_RUN containment): this file does NOT import the env dry-run
// helper. The two sanctioned DRY_RUN check sites are mailer/gmail.ts and
// state/writer.ts. Any DRY_RUN branch here would be a Pattern 2 regression.
// (Header comment deliberately avoids the literal identifier so a grep gate
// for "env dry-run helper" import in main.ts stays at zero.)

import pLimit from 'p-limit';
import { loadFirms, loadRecipient } from './config/loader.js';
import { readState } from './state/reader.js';
import { fetchAll } from './pipeline/fetch.js';
import { enrichWithBody } from './pipeline/enrichBody.js';
import { applyKeywordFilter } from './pipeline/filter.js';
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
    // self-send path still works with zero extra configuration.
    const fromAddr =
      process.env.GMAIL_FROM_ADDRESS ??
      (Array.isArray(recipient) ? recipient[0] : recipient);
    const seen = await readState();

    // ---- Phase 2 pipeline order: fetch → enrich → filter → dedup ----
    const fetched = await fetchAll(firms);
    const enriched = await enrichWithBody(fetched);
    const filtered = applyKeywordFilter(enriched);
    const deduped = dedupAll(filtered, seen);

    // FETCH-03 spirit: cap parallel Gemini calls at 3 globally per run. A
    // single shared limiter across all firms is correct — pLimit(3) caps the
    // Gemini free tier call rate while letting multiple firms run their
    // summarize batches concurrently.
    const summarizeLimit = pLimit(3);
    const summarized: FirmResult[] = await Promise.all(
      deduped.map(async (r) => {
        if (r.error || r.new.length === 0) return r;
        const out: SummarizedItem[] = await Promise.all(
          r.new.map((item) =>
            summarizeLimit(async (): Promise<SummarizedItem> => {
              // SUMM-06 / B3 guard: no real body → skip Gemini entirely.
              // The title is NEVER a substitute for a body in the prompt.
              // With Phase 2's enrichWithBody, most items have description
              // populated from detail pages. When extraction failed AND
              // there's no RSS teaser fallback, description stays undefined
              // and this branch fires — summaryModel: 'skipped'.
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

    const newTotal = summarized.reduce(
      (n, r) => n + r.summarized.length,
      0,
    );

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
