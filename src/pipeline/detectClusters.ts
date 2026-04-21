// Phase 8 D-06 — post-summarize hallucination cluster detector.
//
// Pure function over FirmResult[]. For each firm, groups summarized items
// by the first 50 chars of summary_ko (D-07: exact prefix, no trim, no
// case-fold). Groups with 3+ members are clusters: all members are demoted
// (summaryConfidence: 'low', isClusterMember: true) and one ClusterMarker
// per cluster is collected. A single console.error line per cluster is
// emitted to stderr with format mirroring GMAIL_AUTH_FAILURE (D-16).
//
// INPUT CONTRACT: FirmResult[] post-summarize. summary_ko === null items
// are excluded from signature calculation. The ONLY sanctioned null source
// is the `pnpm check:firm --skip-gemini` debugging path (run.ts sets
// summaryModel='cli-skipped' on that branch). Post-Plan-01 real-run paths
// always produce a string (title-verbatim via Layer 1 short-circuit or
// catch-block fallback). A non-'cli-skipped' null reaching this detector
// would indicate a pre-Phase-8 regression — we log a warning below but
// still `continue` so the detector is resilient (fail-open for detection,
// fail-loud in logs for the operator).
//
// OUTPUT CONTRACT: NEW FirmResult[] (never mutates input) + markers.
// Immutable update via .map + spread mirrors pipeline convention at
// src/pipeline/run.ts:255 (`return { ...r, summarized: out }`).
//
// D-09: jaccardTokenSimilarity (src/audit/signals.ts) is deliberately NOT
// reused — GUARD-03 literal is "first 50 chars identical" and prefix
// comparison is faster + spec-exact.
//
// D-10: false positives (5 items with coincidentally-similar titles)
// accepted; user preference is aggressive failure detection. Operator
// can diagnose from per-item titles in the email + stderr log.

import type { FirmResult, SummarizedItem } from '../types.js';

/**
 * Phase 10 D-03 — widened to a discriminated union via `kind`. Two kinds
 * live here (ClusterMarker, LowConfidenceMarker). The DataQualityMarker
 * union alias is the rendering surface for every consumer (email footer,
 * step-summary, DRY_RUN emission). Exhaustive narrowing on `marker.kind`
 * is the only sanctioned access pattern — property-probing (e.g.
 * `'signature' in marker`) is an anti-pattern per 10-RESEARCH §Don't
 * Hand-Roll.
 *
 * ClusterMarker shape (signature field remains — unique to cluster).
 */
export interface ClusterMarker {
  kind: 'cluster';     // Phase 10 D-03 discriminator
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}

/**
 * Phase 10 D-03 — low-confidence marker. Emitted by detectLowConfidence
 * when a firm's summarized items cross the D-04 threshold
 * (totalCount >= 3 AND lowCount / totalCount >= 0.5).
 *
 * firmName mirrors ClusterMarker so rendering code can access
 * `marker.firmName` without branching on kind.
 */
export interface LowConfidenceMarker {
  kind: 'low-confidence';   // Phase 10 D-03 discriminator
  firmId: string;
  firmName: string;
  lowCount: number;
  totalCount: number;
}

export type DataQualityMarker = ClusterMarker | LowConfidenceMarker;

/**
 * Detector return shape. `firms` is a NEW array — never the input reference.
 * `markers` may be empty on clean runs (no clusters detected).
 */
export interface DetectionResult {
  firms: FirmResult[];
  markers: ClusterMarker[];
}

const CLUSTER_THRESHOLD = 3;     // D-07: 3+ items with identical signature
const SIGNATURE_LENGTH = 50;     // D-07: first 50 chars of summary_ko

/**
 * Scan post-summarize FirmResult[] for same-firm prefix clusters.
 * Demotes cluster members and emits stderr markers. Pure otherwise.
 */
export function detectHallucinationClusters(
  firms: FirmResult[],
): DetectionResult {
  const markers: ClusterMarker[] = [];

  const outFirms: FirmResult[] = firms.map((r) => {
    // Skip firms with errors or no summarized items — nothing to detect.
    if (r.error || r.summarized.length === 0) return r;

    // Group by summary_ko prefix. summary_ko === null items excluded
    // (cli-skipped debugging path produces null post-Plan-01; real-run
    // paths produce title-verbatim strings).
    const groups = new Map<string, SummarizedItem[]>();
    for (const item of r.summarized) {
      if (item.summary_ko === null) {
        // Defense-in-depth (WR-02): the only sanctioned null path is the
        // debug cli-skipped branch. Any other null is a pre-Phase-8
        // regression — surface it via stderr so the operator notices
        // rather than silently bypassing cluster detection.
        if (item.summaryModel !== 'cli-skipped') {
          console.warn(
            `[detectClusters] unexpected null summary_ko on non-cli path: firm=${r.firm.id} model=${item.summaryModel}`,
          );
        }
        continue;
      }
      const sig = item.summary_ko.slice(0, SIGNATURE_LENGTH);
      const g = groups.get(sig) ?? [];
      g.push(item);
      groups.set(sig, g);
    }

    // Identify clusters (size >= 3).
    const clusteredUrls = new Set<string>();
    for (const [sig, group] of groups) {
      if (group.length >= CLUSTER_THRESHOLD) {
        markers.push({
          kind: 'cluster',  // Phase 10 D-03 discriminator
          firmId: r.firm.id,
          firmName: r.firm.name,
          count: group.length,
          signature: sig,
        });
        for (const it of group) clusteredUrls.add(it.url);
        // D-16 marker (mirrors GMAIL_AUTH_FAILURE in src/mailer/gmail.ts:93)
        // Single-line stderr, UPPERCASE marker, key=value metadata, no
        // scrubSecrets (signature is user-facing summary prefix, safe).
        //
        // WR-03: escape backslash, double-quote, and newline in `sig` for
        // the log line ONLY. The underlying `signature` field in the
        // emitted ClusterMarker is NOT touched — downstream consumers
        // (email footer, step summary) see the original prefix. Gemini
        // can emit a literal `"` or newline in the first 50 chars; this
        // keeps the `key="value"` format parseable by log-tail tooling.
        const safeSig = sig
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        console.error(
          `HALLUCINATION_CLUSTER_DETECTED: firm=${r.firm.id} count=${group.length} signature="${safeSig}"`,
        );
      }
    }

    if (clusteredUrls.size === 0) return r;

    // D-08: demote confidence to 'low' on cluster members; summary_ko
    // unchanged (template partitions by isClusterMember, hides summary in
    // fold UI). Immutable update — follows pipeline convention.
    const demoted = r.summarized.map((it) =>
      clusteredUrls.has(it.url)
        ? {
            ...it,
            summaryConfidence: 'low' as const,
            isClusterMember: true as const,
          }
        : it,
    );
    return { ...r, summarized: demoted };
  });

  return { firms: outFirms, markers };
}
