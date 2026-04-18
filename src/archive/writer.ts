// Single-boundary writer for archive/YYYY/MM-DD.html — the Phase 3 OPS-09
// in-repo digest history. Called by src/pipeline/run.ts (Plan 05) AFTER
// the digest email has been successfully sent and BEFORE writeState
// commits the new seen-urls.
//
// Invariants this module enforces:
//
//   1. OPS-09 ARCHIVE PATH — archive/<YYYY>/<MM-DD>.html derived from `now`
//      in KST (D-13). Reuses date-fns-tz `formatInTimeZone` (same idiom as
//      compose/digest.ts subject-line date). Asia/Seoul has no DST, so the
//      23:00–01:00 UTC rollover has no edge-case risk for Korean readers.
//
//   2. OPS-06 / Phase 3 R-02 — DRY_RUN check site #3 of 3. Mirror of the
//      existing mailer + state-writer gates. Without this gate, `pnpm
//      dry-run` would pollute the working tree with real archive files
//      on every iteration, and those files would sneak into subsequent
//      `git add` calls during development. The gate prints a would-archive
//      marker and returns the path WITHOUT touching disk.
//
//      Phase 1 invariant "DRY_RUN check sites = 2" is deliberately updated
//      by this plan to "= 3". The three canonical sites are:
//        #1: src/mailer/gmail.ts     (EMAIL-06 short-circuit)
//        #2: src/state/writer.ts     (OPS-06 would-write)
//        #3: src/archive/writer.ts   (OPS-09 would-archive) — THIS FILE
//      Any other module adding a DRY_RUN branch is a Pattern 2 regression.
//
//   3. D-15 SAME-DAY OVERWRITE — if the path already exists (second run
//      of the same KST day, e.g., manual workflow_dispatch after the
//      scheduled run), writeFile overwrites the existing file. The second
//      run's digest is the authoritative one (later seen.json diff).
//
//   4. FIRST-RUN DIRECTORY BOOTSTRAP — mkdir with { recursive: true }
//      makes the year directory idempotently, so the very first Phase 3
//      run on a brand-new repo (no archive/ folder yet) works without
//      a manual `mkdir archive/2026/`.
//
//   5. ATOMIC-ISH — single writeFile, not a writeFile+rename dance. The
//      archive is less critical than state/seen.json (losing a mid-write
//      archive means we lose that day's HTML sidecar; the seen-set and
//      sent email remain correct). Simpler semantics, fewer failure modes.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { formatInTimeZone } from 'date-fns-tz';
import { isDryRun } from '../env.js';

export async function writeArchive(
  html: string,
  now: Date = new Date(),
  baseDir: string = 'archive',
): Promise<string> {
  // D-13 — KST derives the archive path, matching Phase 1 parseDate +
  // digest.ts subject-line convention.
  const yearMonth = formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd');
  const [year, md] = yearMonth.split('/');
  const filePath = join(baseDir, year, `${md}.html`);

  // DRY_RUN check site #3 of 3 (Phase 3 R-02). Do NOT import isDryRun
  // anywhere except mailer/gmail.ts, state/writer.ts, and this file.
  if (isDryRun()) {
    console.log(
      `[DRY_RUN] would write archive ${filePath} (${html.length} bytes)`,
    );
    return filePath;
  }

  // First-run bootstrap: the `archive/<year>/` directory may not exist
  // yet. mkdir recursive is a no-op when the path already exists.
  await mkdir(dirname(filePath), { recursive: true });

  // D-15 same-day overwrite: writeFile replaces the existing file content.
  // No `flag: 'wx'` (exclusive write) — we WANT overwrite on re-run.
  await writeFile(filePath, html, 'utf8');

  return filePath;
}
