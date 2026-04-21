// Single-boundary in-memory metrics accumulator for Phase 3 OPS-08.
//
// Invariants this module enforces:
//
//   1. PURE STATE — no I/O, no env reads, no clock access. The only input
//      is a FirmConfig[] array (for table ordering) and the per-firm
//      method calls. Tests exercise the full contract without mocks.
//
//   2. REPLACE-NOT-ACCUMULATE — `recorder.firm(id).fetched(n)` REPLACES the
//      current value. Callers (pipeline stages) record the final count
//      once per stage per firm. This intentionally tolerates a mid-stage
//      throw — if fetchAll threw after recording fetched=12 but before
//      enrichBody's record call, the table shows fetched=12 + new=0 +
//      summarized=0, which is the honest snapshot of where the run died
//      (Phase 3 Pitfall 6 — desired, not a bug).
//
//   3. PER-FIRM ISOLATION — each firm's metrics live in a separate Map
//      entry. One firm's throw does not mutate another firm's row
//      (mirror of Phase 2 D-P2-03 Promise.allSettled discipline).
//
//   4. DETERMINISTIC OUTPUT ORDER — toMarkdownTable iterates the input
//      `firms` array (firms.yaml load order), NOT this.metrics insertion
//      order. Diffable row order across runs in the GHA UI.
//
//   5. DISABLED-FIRM FILTER — toMarkdownTable skips firms with enabled:false.
//      Phase 2 D-P2-14 ships 3 disabled placeholders (lee-ko, yoon-yang,
//      latham) that must not leak into the step summary.
//
// The module is consumed by src/pipeline/fetch.ts (fetched + durationMs +
// errorClass on each firm's try/catch), by src/pipeline/run.ts (newCount
// after dedupAll and summarized after the summarize loop), and by
// src/observability/summary.ts (toMarkdownTable → $GITHUB_STEP_SUMMARY).

import type { FirmConfig } from '../types.js';

export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;
  durationMs: number;
  // Phase 10 DQOBS-01 additions (replace-not-accumulate at stage boundary):
  bodyLengths: number[];  // REPLACE with full array per firm per stage; render-time average
  guardCount: number;     // Union Layer 1 + Layer 2 + Layer 3 scalar
  confidenceH: number;    // post-cluster-detect tally (H)
  confidenceM: number;
  confidenceL: number;
}

export interface FirmRecorder {
  fetched(n: number): FirmRecorder;
  newCount(n: number): FirmRecorder;
  summarized(n: number): FirmRecorder;
  errorClass(cls: string): FirmRecorder;
  durationMs(ms: number): FirmRecorder;
  // Phase 10 DQOBS-01:
  bodyLengths(lengths: number[]): FirmRecorder;  // REPLACE (not accumulate)
  guardCount(n: number): FirmRecorder;
  confidence(h: number, m: number, l: number): FirmRecorder;
}

function defaultMetrics(): FirmMetrics {
  return {
    fetched: 0,
    new: 0,
    summarized: 0,
    errorClass: null,
    durationMs: 0,
    bodyLengths: [],  // empty array = no-data sentinel (AvgBody renders '—')
    guardCount: 0,
    confidenceH: 0,
    confidenceM: 0,
    confidenceL: 0,
  };
}

export class Recorder {
  private metrics = new Map<string, FirmMetrics>();

  firm(firmId: string): FirmRecorder {
    let existing = this.metrics.get(firmId);
    if (!existing) {
      existing = defaultMetrics();
      this.metrics.set(firmId, existing);
    }
    const handle: FirmRecorder = {
      fetched: (n) => {
        existing!.fetched = n;
        return handle;
      },
      newCount: (n) => {
        existing!.new = n;
        return handle;
      },
      summarized: (n) => {
        existing!.summarized = n;
        return handle;
      },
      errorClass: (cls) => {
        existing!.errorClass = cls;
        return handle;
      },
      durationMs: (ms) => {
        existing!.durationMs = ms;
        return handle;
      },
      bodyLengths: (lengths) => {
        existing!.bodyLengths = lengths;  // REPLACE — never push(); per Invariant 2
        return handle;
      },
      guardCount: (n) => {
        existing!.guardCount = n;
        return handle;
      },
      confidence: (h, m, l) => {
        existing!.confidenceH = h;
        existing!.confidenceM = m;
        existing!.confidenceL = l;
        return handle;
      },
    };
    return handle;
  }

  get(firmId: string): FirmMetrics | undefined {
    return this.metrics.get(firmId);
  }

  /**
   * Emit a GitHub-Flavored Markdown table in the shape locked by Phase 10 D-01:
   *   | Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |
   *
   * Iterates the input `firms` array to drive row order and disabled filter.
   * AvgBody, GUARD, and H/M/L render as em-dash ('—') when a firm was never
   * fetched (preserves Phase 3 Pitfall 6 mid-stage-throw honesty).
   */
  toMarkdownTable(firms: FirmConfig[]): string {
    const header = '| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |';
    const separator = '|------|--------:|----:|-----:|--------|---------:|--------:|------:|------:|';
    const rows = firms
      .filter((f) => f.enabled)
      .map((f) => {
        const m = this.metrics.get(f.id) ?? defaultMetrics();
        const err = m.errorClass ?? '—';

        // AvgBody: integer average of bodyLengths, or '—' when empty.
        // Empty array is the load-bearing no-data sentinel (Pitfall 4).
        const avgBody =
          m.bodyLengths.length === 0
            ? '—'
            : Math.round(
                m.bodyLengths.reduce((s, x) => s + x, 0) / m.bodyLengths.length,
              ).toString();

        // GUARD / H/M/L: '—' when firm was never fetched (Fetched=0 AND empty bodyLengths).
        // Preserves Phase 3 Pitfall 6 mid-stage-throw honesty.
        const isEmptyFirm = m.fetched === 0 && m.bodyLengths.length === 0;
        const guard = isEmptyFirm ? '—' : m.guardCount.toString();
        const hml = isEmptyFirm
          ? '—'
          : `${m.confidenceH}/${m.confidenceM}/${m.confidenceL}`;

        return `| ${f.name} | ${m.fetched} | ${m.new} | ${m.summarized} | ${err} | ${m.durationMs}ms | ${avgBody} | ${guard} | ${hml} |`;
      });
    return [header, separator, ...rows].join('\n');
  }
}
