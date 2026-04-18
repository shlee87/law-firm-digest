// Pure-function keyword filter — runs between enrichWithBody and dedupAll.
//
// Design invariants (contract locked by test/pipeline/filter.test.ts):
//
//   1. PURE — no I/O, no env reads, no clock access. Same inputs always
//      yield same outputs. Mirror of dedup.ts's invariant #1.
//
//   2. ERROR PASS-THROUGH — a FirmResult with .error set is returned
//      BY REFERENCE, unchanged (tests assert `toBe(errorResult)`).
//
//   3. NO MUTATION — input results array and nested objects untouched.
//      New objects allocated via spread for non-error branches.
//
//   4. BODY ASSUMPTION — this function reads item.description. Callers
//      (pipeline order) MUST have run enrichWithBody first so description
//      is populated with real article text; otherwise the filter falls
//      back to the RSS teaser (Phase 1) or empty string.
//
//   5. QUOTA GUARD — applied BEFORE dedupAll/summarize so items filtered
//      OUT never consume Gemini free-tier quota. This is the whole point
//      of CONF-06 / D-P2-07.
//
// Match policy (D-P2-07):
//   - Case-insensitive substring match on (title + ' ' + description[:500]).
//   - include_keywords = AND-gate ANY-match (at least one include keyword
//     must appear). Empty array → no include filter.
//   - exclude_keywords = OR-gate ANY-match (any single exclude keyword
//     kills the item). Empty array → no exclude filter.
//   - Fast path: if BOTH arrays are empty (D-P2-17 default for all Phase 2
//     firms), return the FirmResult by reference.
//
// Naive substring — no tokenization, no mecab-ko, no regex. A false-
// negative around Korean particles is acceptable for v1; see the deferred
// mecab-ko revisit in CONTEXT.md.

import type { FirmResult } from '../types.js';

export function applyKeywordFilter(results: FirmResult[]): FirmResult[] {
  return results.map((r) => {
    // Error pass-through — same reference.
    if (r.error) return r;

    const firm = r.firm;
    const inc = (firm.include_keywords ?? []).map((k) => k.toLowerCase());
    const exc = (firm.exclude_keywords ?? []).map((k) => k.toLowerCase());

    // Fast path — no filters configured (D-P2-17 default state).
    if (inc.length === 0 && exc.length === 0) return r;

    const filtered = r.raw.filter((item) => {
      const descWindow = (item.description ?? '').slice(0, 500);
      const haystack = (item.title + ' ' + descWindow).toLowerCase();

      const includeOk =
        inc.length === 0 || inc.some((k) => haystack.includes(k));
      const excludeOk = exc.every((k) => !haystack.includes(k));

      return includeOk && excludeOk;
    });

    return { ...r, raw: filtered };
  });
}
