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
 * One per detected cluster. firmId + signature uniquely identify the
 * cluster within a single run.
 */
export interface ClusterMarker {
  firmId: string;
  firmName: string;
  count: number;
  signature: string;
}

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
          firmId: r.firm.id,
          firmName: r.firm.name,
          count: group.length,
          signature: sig,
        });
        for (const it of group) clusteredUrls.add(it.url);
        // D-16 marker (mirrors GMAIL_AUTH_FAILURE in src/mailer/gmail.ts:93)
        // Single-line stderr, UPPERCASE marker, key=value metadata, no
        // scrubSecrets (signature is user-facing summary prefix, safe).
        console.error(
          `HALLUCINATION_CLUSTER_DETECTED: firm=${r.firm.id} count=${group.length} signature="${sig}"`,
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
