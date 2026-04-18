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
//   2. BOOTSTRAP (D-09, first-run policy; D-P2-08, empty-state guard) —
//      when a firm has no prior entry in `seen.firms` OR its prior entry
//      is structurally empty (`urls: []` AND `lastNewAt: null`), dedup
//      emits `new: []` so the FIRST run does NOT spray the back-catalog
//      at the recipient. The empty-state branch defends against Pitfall 6
//      (a manually-edited state file or a firm that was added but never
//      produced a successful scrape + summarize run). The RAW items
//      remain on `r.raw` untouched so plan 10's state writer can use
//      them to seed state (B1 cross-plan contract — writer MUST also
//      treat empty-state as bootstrap).
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

    // D-09 first-run bootstrap AND D-P2-08 empty-state bootstrap:
    //   - `!priorFirm` — firm absent from state (first run after config add).
    //   - priorFirm exists but `urls.length === 0 && lastNewAt === null` —
    //     Pitfall 6 defense. Happens after manual state edits or after a
    //     prior bootstrap was never followed by a successful dedup cycle
    //     (e.g., the firm errored on every run since being added).
    // Both branches emit new:[] and preserve r.raw so the writer seeds
    // urls from it (B1 cross-plan invariant).
    if (
      !priorFirm ||
      (priorFirm.urls.length === 0 && priorFirm.lastNewAt === null)
    ) {
      return { ...r, new: [] };
    }

    const seenSet = new Set(priorFirm.urls);
    const fresh: NewItem[] = r.raw
      .filter((item) => !seenSet.has(item.url))
      .map((item) => ({ ...item, isNew: true as const }));

    return { ...r, new: fresh };
  });
}
