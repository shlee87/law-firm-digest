// Observability side-effect boundary — appends the Recorder's markdown
// table to $GITHUB_STEP_SUMMARY, the file path GitHub Actions exposes
// for per-job summary rendering in the Actions UI.
//
// Invariants:
//
//   1. ENV-GATED — when $GITHUB_STEP_SUMMARY is undefined/empty (local
//      `pnpm dev`, `pnpm dry-run`, `pnpm check:firm`), this function
//      short-circuits and returns silently. It does NOT synthesize a
//      default path; local runs need no summary file.
//
//   2. NEVER-THROWS — any appendFile failure is caught and logged via
//      console.warn(scrubSecrets(err.message)) prefixed with '[step-summary]'.
//      A broken step-summary write MUST NOT fail the workflow. The
//      workflow's exit code is governed by main.ts's top-level catch
//      (EMAIL-06 fail-loud); observability is deliberately best-effort.
//
//   3. APPEND-ONLY — uses fs.promises.appendFile, NOT writeFile. Multiple
//      steps in the same GHA job each contribute rows; clobbering with
//      writeFile would erase earlier steps' summaries.
//
//   4. 1 MiB GitHub truncation — the runner truncates $GITHUB_STEP_SUMMARY
//      at 1 MiB. Our table is <2 KB (12 firms × ~120 bytes/row), so no
//      proactive truncation here is necessary. If Phase 5 grows the table,
//      revisit.
//
// Used by src/pipeline/run.ts (Plan 05) in a finally block so partial
// runs still emit what they have.

import { appendFile } from 'node:fs/promises';
import type { FirmConfig } from '../types.js';
import type { Recorder } from './recorder.js';
import { scrubSecrets } from '../util/logging.js';
import type { ClusterMarker } from '../pipeline/detectClusters.js';

export async function writeStepSummary(
  recorder: Recorder,
  firms: FirmConfig[],
  markers: ClusterMarker[] = [],
): Promise<void> {
  // D-12: no-op when the env var is unset (local runs, check:firm runs).
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;

  // Build payload: table always; markers section only when non-empty
  // (D-15: clean-run invisible posture). SINGLE appendFile call wraps
  // both writes so a half-success cannot leave the file inconsistent
  // (Pitfall 5).
  const table = recorder.toMarkdownTable(firms);
  let payload = table + '\n';
  if (markers.length > 0) {
    const lines = markers
      .map(
        (m) =>
          `- **${m.firmId}**: HALLUCINATION_CLUSTER_DETECTED — ${m.count} items demoted`,
      )
      .join('\n');
    payload += `\n## ⚠ Data Quality Warnings\n\n${lines}\n`;
  }

  try {
    await appendFile(path, payload, 'utf8');
  } catch (err) {
    // Phase 3 Pitfall 10: never propagate. Observability failure must not
    // surface as a red workflow. Scrub secrets defense-in-depth.
    console.warn(
      `[step-summary] write failed: ${scrubSecrets((err as Error).message)}`,
    );
  }
}
