// Multi-signal detail-identity classifier for the firm-audit probe (Phase 6 D-07).
//
// Four independent signals combine via OR to detect SPA / generic-body bugs:
//   1. exactHashMatch     — port from scripts/detail-page-audit.ts (bkl exact case)
//   2. jaccardTokenSimilarity ≥ 0.9 — micro-diff SPAs (timestamps differ only)
//   3. titleTokensPresentInBody = 0 across BOTH items — body topically unrelated to titles
//   4. bodyTooShort (length < 100) — empty / 404 page; PROMOTED to detail-empty status
//
// Each signal is a pure function — no I/O, no shared state — enabling fast
// unit tests. classifyDetailIdentity combines them per D-08 status mapping.
//
// Pitfall 1 guard: title-token signal MUST require `totalTokensA > 0 &&
// totalTokensB > 0` to avoid vacuous trigger when titles have zero ≥2-char
// tokens. Without this guard, audit produces false-positive
// 'detail-identical (title-tokens 0/0)' for legitimate firms.

// ---------------------------------------------------------------------------
// Signal 1: Exact hash match (port from scripts/detail-page-audit.ts:25)
// ---------------------------------------------------------------------------

/**
 * Hash a body to a length-prefixed first-50-chars (whitespace-stripped) signature.
 * Two bodies with the same hash are byte-identical for matching purposes.
 *
 * Format: '${body.length}:${body.slice(0,50).replace(/\s+/g,"")}'
 */
export function bodyHash(body: string): string {
  return `${body.length}:${body.slice(0, 50).replace(/\s+/g, '')}`;
}

/**
 * Returns true when both bodies produce the same length-prefixed hash —
 * i.e., they are byte-identical in length and first 50 non-whitespace chars.
 */
export function exactHashMatch(bodyA: string, bodyB: string): boolean {
  return bodyHash(bodyA) === bodyHash(bodyB);
}

// ---------------------------------------------------------------------------
// Signal 2: Jaccard token similarity
// ---------------------------------------------------------------------------

/**
 * Whitespace-tokenize a string. Korean Hangul/CJK and Latin both use
 * whitespace as primary token boundary in legal newsletter prose.
 * No lowercasing — production scrapers do not lowercase, so identity
 * matches what users would actually see.
 */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Jaccard similarity = |A ∩ B| / |A ∪ B| over whitespace tokens.
 *
 * Edge cases:
 * - Both empty → 1.0 (vacuously identical; bodyTooShort preempts in practice)
 * - One empty → 0.0 (intersection 0 / union N)
 *
 * Threshold for detail-identical: ≥ 0.9 (D-07, locked — do not parameterize).
 */
export function jaccardTokenSimilarity(bodyA: string, bodyB: string): number {
  const tokensA = new Set(tokenize(bodyA));
  const tokensB = new Set(tokenize(bodyB));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

// ---------------------------------------------------------------------------
// Signal 3: Title-token presence
// ---------------------------------------------------------------------------

/**
 * Extract ≥2-character tokens from a title for body-presence checking.
 *
 * Token classes:
 *   - Hangul syllable blocks U+AC00-U+D7AF (가-힣) — 2+ in a row
 *   - CJK unified ideographs U+4E00-U+9FFF — 2+ in a row (legal terms 改正/法案)
 *   - Latin word chars [A-Za-z0-9_]+ — 2+ in a row, lowercased for case-insensitive body match
 *
 * Single-character tokens dropped: '법' appears in nearly every Korean legal
 * document; matching it would always pass the presence check.
 */
export function extractTitleTokens(title: string): string[] {
  const matches = title.match(/[\uAC00-\uD7AF\u4E00-\u9FFF]{2,}|[A-Za-z0-9_]{2,}/g) ?? [];
  return matches.map((t) => (/^[A-Za-z0-9_]+$/.test(t) ? t.toLowerCase() : t));
}

/**
 * Count how many ≥2-char title tokens appear anywhere in the body
 * (case-insensitive for Latin; exact for Hangul/CJK since neither has case).
 *
 * Returns 0 if title has no ≥2-char tokens. Caller MUST guard against
 * vacuous-fire — see Pitfall 1: require totalTokens > 0 before triggering
 * on a count of 0.
 */
export function titleTokensPresentInBody(title: string, body: string): number {
  const tokens = extractTitleTokens(title);
  if (tokens.length === 0) return 0;
  const bodyLower = body.toLowerCase();
  return tokens.filter((t) => bodyLower.includes(t.toLowerCase())).length;
}

// ---------------------------------------------------------------------------
// Signal 4: Body too short (separate status branch per D-08)
// ---------------------------------------------------------------------------

/** Bodies shorter than this threshold are classified as detail-empty (not detail-identical). */
export const BODY_TOO_SHORT_THRESHOLD = 100;

/**
 * Returns true when the body is shorter than BODY_TOO_SHORT_THRESHOLD (100 chars).
 * Short bodies indicate an empty / 404 / Chrome-blocked page, not a SPA identity bug.
 * This triggers the distinct 'detail-empty' status in classifyDetailIdentity.
 */
export function bodyTooShort(body: string): boolean {
  return body.length < BODY_TOO_SHORT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Classifier: combines all 4 signals → Status + evidence per D-07/D-08
// ---------------------------------------------------------------------------

export interface DetailSignalResult {
  status: 'OK' | 'detail-identical' | 'detail-empty' | 'detail-quality-unknown';
  evidence: string;
}

/**
 * Combine the 4 signals into a Status + evidence string per D-07/D-08.
 *
 * Rules:
 *   - bodies.length < 2 → detail-quality-unknown (cannot compute identity)
 *   - either body length < 100 → detail-empty (overrides identity check)
 *   - exact-hash OR jaccard ≥ 0.9 OR (titleTokensTriggered with both
 *     totals > 0) → detail-identical, evidence lists triggered reasons
 *   - otherwise → OK
 *
 * Pitfall 1 guard: titlePresenceTriggered requires totalTokensA > 0 &&
 * totalTokensB > 0 so that vacuous (zero-token title) does NOT trip the
 * signal and produce false-positive 'detail-identical (title-tokens 0/0)'.
 */
export function classifyDetailIdentity(
  bodies: { url: string; title: string; body: string }[],
): DetailSignalResult {
  if (bodies.length < 2) {
    return {
      status: 'detail-quality-unknown',
      evidence: `only ${bodies.length}/2 detail fetches succeeded`,
    };
  }

  const [a, b] = bodies;

  // Signal 4: either body too short → promote to detail-empty (D-08 separate branch)
  if (bodyTooShort(a.body) || bodyTooShort(b.body)) {
    return {
      status: 'detail-empty',
      evidence: `body lengths: item1=${a.body.length}, item2=${b.body.length} (threshold ${BODY_TOO_SHORT_THRESHOLD})`,
    };
  }

  // Signal 1: exact hash
  const exact = exactHashMatch(a.body, b.body);

  // Signal 2: jaccard similarity
  const jaccard = jaccardTokenSimilarity(a.body, b.body);

  // Signal 3: title-token presence (with Pitfall 1 guard)
  const titleTokensA = titleTokensPresentInBody(a.title, a.body);
  const titleTokensB = titleTokensPresentInBody(b.title, b.body);
  const totalTokensA = extractTitleTokens(a.title).length;
  const totalTokensB = extractTitleTokens(b.title).length;

  // Pitfall 1 guard: require totalTokens > 0 on BOTH items so vacuous
  // (zero-token title) does not trip the signal.
  const titlePresenceTriggered =
    titleTokensA === 0 &&
    totalTokensA > 0 &&
    titleTokensB === 0 &&
    totalTokensB > 0;

  if (exact || jaccard >= 0.9 || titlePresenceTriggered) {
    const reasons: string[] = [];
    if (exact) reasons.push('exact-hash');
    if (jaccard >= 0.9) reasons.push(`jaccard=${jaccard.toFixed(2)}`);
    if (titlePresenceTriggered) {
      reasons.push(`title-tokens 0/${totalTokensA} & 0/${totalTokensB}`);
    }
    return {
      status: 'detail-identical',
      evidence: reasons.join(', '),
    };
  }

  return {
    status: 'OK',
    evidence: `bodies distinct (jaccard=${jaccard.toFixed(2)}, lengths ${a.body.length}/${b.body.length})`,
  };
}
