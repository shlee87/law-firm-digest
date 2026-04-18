// Single-boundary writer for state/seen.json — run-transaction "commit"
// half of the dedup machinery. Called by main.ts AFTER the digest email
// has been successfully sent (or after DRY_RUN short-circuit).
//
// Three invariants this file exists to enforce:
//
//   1. DEDUP-04: MAX_PER_FIRM = 500 — per-firm URL history is capped
//      newest-first. Applied to both the bootstrap seed (from r.raw) and
//      subsequent-run merges (from r.summarized + prior). Worst case
//      ~12 firms × 500 URLs × ~200 bytes = ~1.2 MB state file, negligible
//      for the git-commit-back state persistence pattern.
//
//   2. OPS-06: DRY_RUN check site #2 of 2 (sibling: src/mailer/gmail.ts).
//      When DRY_RUN=1, the merge computation STILL runs (so we exercise
//      the same code path and log the intended result), but the
//      writeFile+rename is skipped. This matches Pattern 2's "print +
//      return" semantics and is the sole sanctioned location besides
//      the mailer to honor DRY_RUN.
//
//   3. D-09 / B1: first-run bootstrap MUST seed from r.raw, not
//      r.summarized. Rationale: main.ts skips summarization entirely for
//      any firm whose dedup returned new:[] (the bootstrap case per
//      plan 07). So r.summarized is [] on bootstrap even though r.raw
//      contains the full current catalog. Seeding from r.summarized
//      would leave seen.firms[id] = { urls: [] } — defined but empty —
//      and the NEXT run would see every current URL as brand-new and
//      flood the recipient with the whole back-catalog. Bootstrap MUST
//      consume r.raw to honor D-09's "silent seed on run 1" promise.
//
//   3b. D-P2-08 empty-state bootstrap (Pitfall 6 defense): if priorFirm
//       exists but is structurally empty (urls:[] AND lastNewAt:null),
//       treat it as bootstrap too. Mirror of dedup.ts guard. Without
//       this mirror, dedup short-circuits to new:[] but writer leaves
//       urls:[] in place, and the SAME empty-state re-occurs on the
//       next run. Together they make the empty-state case self-healing
//       within one run.
//
//   4. Phase 3 D-02 bootstrap grace field: on bootstrap branches (first-run
//      OR D-P2-08 empty-state), write `enabledAt: new Date().toISOString()`
//      onto the new per-firm record. On subsequent-run merges, preserve
//      `priorFirm.enabledAt` if present; otherwise leave the field absent
//      (Phase 3 Pitfall 9 — no silent retrofit of pre-Phase-3 entries).
//
// Atomic-ish write: writeFile to `${path}.tmp`, then rename. POSIX
// rename is atomic on the same filesystem, so a mid-write crash leaves
// either the old file intact or the new file fully materialized —
// never a partial / corrupted JSON blob that the next reader would
// propagate as a fail-loud parse error.

import { writeFile, rename } from 'node:fs/promises';
import { isDryRun } from '../env.js';
import type { SeenState, FirmResult } from '../types.js';

const MAX_PER_FIRM = 500;

export async function writeState(
  prior: SeenState,
  results: FirmResult[],
  path = 'state/seen.json',
): Promise<void> {
  // Spread prior.firms so firms present in `prior` but absent from the
  // current run (e.g. disabled in YAML this run) pass through untouched —
  // no data loss on config toggles.
  const nextFirms: SeenState['firms'] = { ...prior.firms };

  for (const r of results) {
    // Fetch-failed firms: preserve prior urls untouched. Marking URLs as
    // "seen" after a transient network failure would permanently lose the
    // items that firm published during the outage window.
    if (r.error) continue;

    const priorFirm = prior.firms[r.firm.id];

    // D-09 / B1 first-run bootstrap AND D-P2-08 empty-state bootstrap:
    // mirror of the dedup.ts guard. When dedup returned new:[] because
    // priorFirm was missing OR structurally empty, r.summarized is [].
    // Seed urls from r.raw directly so the NEXT run sees these URLs as
    // seen and only emits genuinely-new items.
    const isBootstrap =
      !priorFirm ||
      (priorFirm.urls.length === 0 && priorFirm.lastNewAt === null);

    if (isBootstrap) {
      const seededUrls = r.raw.map((x) => x.url).slice(0, MAX_PER_FIRM);
      const lastNewAt =
        r.raw.length > 0 ? r.raw[0]?.publishedAt ?? new Date().toISOString() : null;
      // Phase 3 D-02: record the date this firm entered the pipeline so the
      // staleness detector (Phase 3) can grant a 30-day bootstrap grace period
      // to newly-added firms. Pre-Phase-3 state entries DO NOT get retrofitted
      // in the subsequent-run branch below — they're past their implicit grace
      // period already (Phase 3 Pitfall 9 — no silent retrofit).
      nextFirms[r.firm.id] = {
        urls: seededUrls,
        lastNewAt,
        enabledAt: new Date().toISOString(),
      };
      continue;
    }

    // Subsequent runs: merge newly-summarized URLs on top of prior urls.
    // newest-first ordering is load-bearing for the 500-cap slice: we
    // want to drop the OLDEST entries, not the newest.
    const existing = new Set(priorFirm.urls);
    const newUrls = r.summarized
      .map((it) => it.url)
      .filter((u) => !existing.has(u));
    const merged = [...newUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM);
    const lastNewAt =
      newUrls.length > 0
        ? r.summarized[0]?.publishedAt ?? new Date().toISOString()
        : priorFirm.lastNewAt ?? null;
    nextFirms[r.firm.id] = {
      urls: merged,
      lastNewAt,
      // Phase 3 D-02 preservation — if priorFirm had an enabledAt recorded on a
      // prior bootstrap run, carry it forward untouched. If priorFirm lacks the
      // field (legacy Phase 1/2 state), do NOT retrofit (Pitfall 9).
      ...(priorFirm.enabledAt ? { enabledAt: priorFirm.enabledAt } : {}),
    };
  }

  const next: SeenState = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    firms: nextFirms,
  };

  // OPS-06 DRY_RUN check site #2. Merge already computed above so
  // DRY_RUN exercises the same arithmetic; we only skip the disk write.
  if (isDryRun()) {
    const total = Object.values(next.firms).reduce(
      (n, f) => n + f.urls.length,
      0,
    );
    console.log(
      `[DRY_RUN] would write ${path} with ${total} URLs across ${Object.keys(next.firms).length} firms`,
    );
    return;
  }

  // Atomic-ish write. Trailing newline keeps git diffs clean.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}
