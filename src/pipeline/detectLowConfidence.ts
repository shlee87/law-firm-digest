// Phase 10 D-04 — low-confidence marker detector.
//
// Pure function over FirmResult[]. For each firm with total >= 3 summarized
// items, emits a LowConfidenceMarker when the fraction of items with
// summaryConfidence === 'low' meets or exceeds 50%.
//
// INPUT CONTRACT: Called AFTER detectHallucinationClusters so Layer-3
// cluster demotes (confidence='low') are counted (Phase 10 Pitfall 2).
//
// OUTPUT CONTRACT: Returns a NEW LowConfidenceMarker[]. Never mutates
// input. Emits zero markers on clean runs (D-15 clean-run invisible
// invariant — footer/summary block is omitted by the rendering layer
// when markers is empty).
//
// D-04 no-suppression: a firm that fires a ClusterMarker can ALSO fire a
// LowConfidenceMarker. This is by-design layered detection (cluster is a
// subset signal; low-confidence is a superset). See 10-RESEARCH Pitfall 8.
//
// No stderr emission. Unlike detectHallucinationClusters which logs
// HALLUCINATION_CLUSTER_DETECTED to stderr per cluster, the low-confidence
// signal surfaces only in the email footer + step-summary (D-05).

import type { FirmResult } from '../types.js';
import type { LowConfidenceMarker } from './detectClusters.js';

const LOW_CONF_THRESHOLD = 0.5;   // D-04 — inclusive (>= 0.5)
const MIN_TOTAL_FLOOR = 3;        // D-04 — sparse-firm protection

/**
 * Scan post-cluster-detect FirmResult[] for firms whose summaries are
 * majority-low-confidence. Pure. See module header for D-04 thresholds.
 */
export function detectLowConfidence(firms: FirmResult[]): LowConfidenceMarker[] {
  const markers: LowConfidenceMarker[] = [];
  for (const r of firms) {
    if (r.error) continue;
    const total = r.summarized.length;
    if (total < MIN_TOTAL_FLOOR) continue;
    const low = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
    if (low / total >= LOW_CONF_THRESHOLD) {
      markers.push({
        kind: 'low-confidence',
        firmId: r.firm.id,
        firmName: r.firm.name,
        lowCount: low,
        totalCount: total,
      });
    }
  }
  return markers;
}
