// Single-module pure-function staleness detector for Phase 3 OPS-04 + OPS-05.
//
// Invariants this module enforces:
//
//   1. PURE — no I/O, no env reads, NO implicit clock access. Callers pass
//      `now: Date` (defaults to new Date() only as a convenience for runtime
//      call sites; tests always inject a fixed clock). Same inputs always
//      yield identical outputs. Mirror of src/pipeline/filter.ts discipline.
//
//   2. LOADED-FIRMS AUTHORITY — iteration is over the `firms: FirmConfig[]`
//      parameter (post-loadFirms, already filtered by `enabled: true` per
//      Phase 1). A firm removed from config/firms.yaml or flipped to
//      enabled:false disappears from warnings immediately (Phase 3 Pitfall 1).
//
//   3. BOOTSTRAP GRACE (D-02) — when seen.firms[id].enabledAt is recorded
//      AND `(now - enabledAt) < STALE_FIRM_THRESHOLD_MS`, the firm is
//      excluded from staleFirms regardless of its lastNewAt. This lets a
//      newly-added firm sit quietly for 30 days before the operator sees
//      a "30일 이상 새 글 없음" banner for it.
//
//   4. NO-RETROFIT (Pitfall 9) — legacy pre-Phase-3 entries that lack
//      enabledAt are treated as "past their grace period." If such an entry
//      has lastNewAt=null, it IS flagged stale (conservative default — the
//      operator can investigate whether the firm genuinely publishes).
//
//   5. COLD-START — seen.lastUpdated === null → lastRunStale is null. A
//      first-ever run is not a missed run.
//
// Consumed by src/pipeline/run.ts (Plan 05) which invokes detectStaleness
// at the boundary just after readState, passes warnings into composeDigest,
// and ultimately into renderHtml's staleness banner (D-04 — single
// consolidated block at the top).

import type { FirmConfig, SeenState } from '../types.js';

const STALE_FIRM_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // D-01: 30 days
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 60 * 1000; // D-03: 30 hours

export interface StalenessWarnings {
  staleFirms: string[];
  lastRunStale: { hoursAgo: number } | null;
}

export function detectStaleness(
  seen: SeenState,
  firms: FirmConfig[],
  now: Date = new Date(),
): StalenessWarnings {
  const nowMs = now.getTime();
  const staleFirms: string[] = [];

  for (const firm of firms) {
    // Invariant 2 — disabled firms never appear in warnings.
    if (!firm.enabled) continue;

    const seenFirm = seen.firms[firm.id];
    // Invariant 2 follow-up — firm exists in config but has never been
    // processed. Pre-bootstrap is not stale.
    if (!seenFirm) continue;

    // Invariant 3 — D-02 bootstrap grace period. enabledAt within 30 days
    // suppresses stale warnings regardless of lastNewAt.
    if (seenFirm.enabledAt) {
      const enabledAtMs = Date.parse(seenFirm.enabledAt);
      if (!isNaN(enabledAtMs) && nowMs - enabledAtMs < STALE_FIRM_THRESHOLD_MS) {
        continue;
      }
    }

    if (seenFirm.lastNewAt) {
      const lastNewMs = Date.parse(seenFirm.lastNewAt);
      if (!isNaN(lastNewMs) && nowMs - lastNewMs >= STALE_FIRM_THRESHOLD_MS) {
        staleFirms.push(firm.name);
      }
      continue;
    }

    // Invariant 4 — lastNewAt is null AND we're past the grace period
    // (either no enabledAt at all, or enabledAt older than threshold).
    // Conservative policy: flag it. The operator can decide whether the
    // firm genuinely publishes.
    staleFirms.push(firm.name);
  }

  let lastRunStale: { hoursAgo: number } | null = null;
  if (seen.lastUpdated) {
    const lastMs = Date.parse(seen.lastUpdated);
    if (!isNaN(lastMs) && nowMs - lastMs >= STALE_RUN_THRESHOLD_MS) {
      lastRunStale = { hoursAgo: Math.floor((nowMs - lastMs) / 3_600_000) };
    }
  }

  return { staleFirms, lastRunStale };
}
