// Pure-function dedup stage — compares freshly scraped FirmResults against
// prior SeenState and populates each result's `.new` field with items that
// have not been seen before.
//
// Design invariants (contract locked by test/pipeline/dedup.test.ts):
//
//   1. PURE — no I/O, no env reads, no clock access. Same inputs always
//      yield same outputs. This is the highest-ROI test target in the
//      pipeline: a bug here cascades into state-file corruption and
//      duplicate emails.
//
//   2. BOOTSTRAP (D-09, first-run policy) — when a firm has no prior
//      entry in `seen.firms`, dedup emits `new: []` so the FIRST run of
//      Phase 1 does NOT spray the back-catalog at the recipient. The
//      RAW items remain on `r.raw` untouched so plan 10's state writer
//      can use them to seed state (B1 cross-plan contract).
//
//   3. CANONICAL URL ASSUMPTION — this function does NOT call
//      canonicalizeUrl. Every URL in `r.raw[*].url` is already canonical
//      (plan 05 rss.ts always canonicalizes before emitting a RawItem)
//      and every URL in `seen.firms[id].urls` is already canonical
//      (plan 10 state writer always stores canonical). Set-membership is
//      therefore canonical-to-canonical — no silent table splits.
//
//   4. ERROR PASS-THROUGH — a FirmResult that arrived with an `.error`
//      (upstream scrape or parse failure) is returned BY REFERENCE,
//      unchanged. Tests assert `toBe(errorResult)`, so this must remain
//      a reference pass-through and not a shallow clone.
//
//   5. NO MUTATION — the input `results` array and every nested object
//      inside it is left unmodified. New objects are allocated for
//      non-error branches via spread.
//
// DEDUP-03 ("send email only when something new") is enforced by the
// caller (plan 11 main.ts) based on the total length of `.new` across
// all firms. This module's job is only to compute `.new`.

import type { FirmResult, SeenState, NewItem } from '../types.js';

export function dedupAll(
  results: FirmResult[],
  seen: SeenState,
): FirmResult[] {
  return results.map((r) => {
    // Error pass-through — return the same reference unchanged.
    if (r.error) return r;

    const priorFirm = seen.firms[r.firm.id];

    // D-09 first-run bootstrap: no prior state for this firm → emit
    // nothing. r.raw is deliberately preserved so plan 10's writer can
    // seed SeenState from it (B1 cross-plan invariant).
    if (!priorFirm) {
      return { ...r, new: [] };
    }

    const seenSet = new Set(priorFirm.urls);
    const fresh: NewItem[] = r.raw
      .filter((item) => !seenSet.has(item.url))
      .map((item) => ({ ...item, isNew: true as const }));

    return { ...r, new: fresh };
  });
}
