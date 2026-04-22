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

import type { FirmResult, RawItem, TopicConfig } from '../types.js';

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

// ---------------------------------------------------------------------------
// Phase 12: Topic relevance filter
// ---------------------------------------------------------------------------
// Design invariants (same as applyKeywordFilter above):
//   PURE — no I/O, no env reads. Logging is the caller's responsibility (run.ts).
//   ERROR PASS-THROUGH — FirmResult with .error returned by reference.
//   NO MUTATION — return new objects via spread.
//   QUOTA GUARD — runs BEFORE dedupAll/summarize (D-08 pipeline order).
//
// D-11 permissive bias: empty body always returns true.
// False negatives (missing a relevant item) are worse than false positives.
// An item whose body extraction failed must not be silently discarded.

/**
 * Pure function — no I/O, no env. Same inputs → same outputs.
 * Returns true if title OR body (first 500 chars) contains at least one keyword
 * from any topic area (case-insensitive substring match).
 *
 * D-11: if body is empty or whitespace-only, returns true immediately (permissive
 * bias — body fetch failure must never silently discard a potentially relevant item).
 *
 * SPEC-12-REQ-2 / SPEC-12-REQ-3
 */
export function isTopicRelevant(
  title: string,
  body: string,
  topics: TopicConfig,
): boolean {
  // D-11 permissive on empty body.
  if (!body.trim()) return true;

  const descWindow = body.slice(0, 500);
  const haystack = (title + ' ' + descWindow).toLowerCase();

  // ANY keyword from ANY topic area is sufficient to pass.
  return Object.values(topics).some((keywords) =>
    keywords.some((k) => haystack.includes(k.toLowerCase())),
  );
}

/**
 * Wraps isTopicRelevant for a full results array.
 * Items failing the topic filter are moved from r.raw to r.topicFiltered so
 * writeState can merge their URLs into seen.json (SPEC req 5 / D-09).
 * Logging of skipped items is the caller's responsibility (run.ts D-10).
 *
 * Fast path: if topics is empty ({}), returns all results unchanged — every item
 * passes when no keywords are configured (filter effectively disabled).
 *
 * D-08: must run AFTER applyKeywordFilter, BEFORE dedupAll.
 */
export function applyTopicFilter(
  results: FirmResult[],
  topics: TopicConfig,
): FirmResult[] {
  // Fast path — no topic keywords configured → pass all through unchanged.
  const allKeywords = Object.values(topics).flat();
  if (allKeywords.length === 0) return results;

  return results.map((r) => {
    // Error pass-through — same reference, unchanged.
    if (r.error) return r;

    const passed: RawItem[] = [];
    const topicFiltered: RawItem[] = [];

    for (const item of r.raw) {
      if (isTopicRelevant(item.title, item.description ?? '', topics)) {
        passed.push(item);
      } else {
        topicFiltered.push(item);
      }
    }

    return { ...r, raw: passed, topicFiltered };
  });
}
