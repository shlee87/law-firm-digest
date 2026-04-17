// Single-boundary reader for state/seen.json.
//
// Cold-start / ENOENT semantics: a brand-new repo clone (or the very first
// GHA run before state/seen.json exists on disk) falls back to the DEFAULT
// scaffold. This is the ONLY error path that is silently recovered; every
// other failure mode (bad JSON, permission denied, version drift) is
// propagated so main.ts top-level catch turns it into a red-X workflow.
//
// Why silent fallback is confined to ENOENT: swallowing a JSON parse error
// would reset the dedup table to empty, and the next run would then emit
// the entire firm back-catalog as "new" items — precisely the D-09 failure
// mode we exist to prevent. Fail-loud on corruption is the safer default.
//
// Why version !== 1 is a throw: DEDUP-07 reserves the right to change the
// state schema in a future phase (e.g. capturing per-URL publishedAt to
// drive smarter dedup). The migration guard lets us detect the drift
// immediately on read instead of silently misinterpreting a v2 state file
// as a v1 one — which, again, would corrupt the dedup table.

import { readFile } from 'node:fs/promises';
import type { SeenState } from '../types.js';

const DEFAULT: SeenState = { version: 1, lastUpdated: null, firms: {} };

export async function readState(path = 'state/seen.json'): Promise<SeenState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as SeenState;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported seen.json version: ${parsed.version}`);
    }
    return parsed;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return DEFAULT;
    throw err;
  }
}
