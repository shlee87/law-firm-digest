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
}

export interface FirmRecorder {
  fetched(n: number): FirmRecorder;
  newCount(n: number): FirmRecorder;
  summarized(n: number): FirmRecorder;
  errorClass(cls: string): FirmRecorder;
  durationMs(ms: number): FirmRecorder;
}

function defaultMetrics(): FirmMetrics {
  return {
    fetched: 0,
    new: 0,
    summarized: 0,
    errorClass: null,
    durationMs: 0,
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
    };
    return handle;
  }

  get(firmId: string): FirmMetrics | undefined {
    return this.metrics.get(firmId);
  }

  /**
   * Emit a GitHub-Flavored Markdown table in the shape locked by D-10:
   *   | Firm | Fetched | New | Summarized | Errors | Duration |
   *
   * Iterates the input `firms` array to drive row order and disabled filter.
   * Firms present in the recorder but absent from `firms` (e.g., a stale
   * firm id that was removed from YAML between runs) are NOT rendered —
   * step summary mirrors the live firm set, not historical state.
   */
  toMarkdownTable(firms: FirmConfig[]): string {
    const header = '| Firm | Fetched | New | Summarized | Errors | Duration |';
    const separator = '|------|--------:|----:|-----------:|--------|---------:|';
    const rows = firms
      .filter((f) => f.enabled)
      .map((f) => {
        const m = this.metrics.get(f.id) ?? defaultMetrics();
        const err = m.errorClass ?? '—';
        return `| ${f.name} | ${m.fetched} | ${m.new} | ${m.summarized} | ${err} | ${m.durationMs}ms |`;
      });
    return [header, separator, ...rows].join('\n');
  }
}
