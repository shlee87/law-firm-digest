// Pending storage for Phase 13 daily-vs-weekly split.
//
// Daily runs (Tue~Sun) append PendingItems here after summarize. Weekly run
// (Mon) reads pending, composes digest+heartbeat, sends, archives, then
// truncates. Atomic git commit (daily.yml file_pattern groups
// pending.json+seen.json) ensures runner-death between summarize and write
// leaves both files un-touched (idempotent recovery).
//
// Invariants this file exists to enforce:
//
//   1. COMP-05: NEWSLETTER BODY MUST NOT BE PERSISTED. The PendingItem type
//      deliberately OMITS RawItem.description (article body) and
//      SummarizedItem.isClusterMember (runtime-only). toPendingItem is the
//      ONLY sanctioned construction path — callers MUST NOT JSON.stringify a
//      SummarizedItem directly. The type system enforces this at compile time:
//      writeFile receives PendingState, never SummarizedItem[].
//
//   2. D-09 windowStart immutability: writePending(state) is NOT exported.
//      External callers must use appendPending(items) (preserves windowStart)
//      or truncatePending() (resets windowStart to now). This prevents
//      accidental window-drift bugs where a daily run rewrites windowStart.
//
//   3. D-11 ENOENT default + fail-loud everything else: first-run / brand-new
//      repo clone -> DEFAULT scaffold. All other read errors (bad JSON, version
//      drift, zod shape error) propagate so main.ts top-level catch turns them
//      into a red-X workflow.
//
//   4. D-10 zod schema is the version guard: PendingStateSchema pins the
//      version field to the literal value 1 via zod so version drift produces
//      a typed zod error with the JSON path `version`. No separate
//      `if (parsed.version !== 1)` check needed.
//
//   5. OPS-06 DRY_RUN check site #5 of 5 (siblings: src/mailer/gmail.ts,
//      src/state/writer.ts, src/archive/writer.ts, src/main.ts).
//      writePendingInternal honors DRY_RUN: arithmetic still runs (read,
//      merge), only disk writeFile+rename is skipped.
//      Plan 13-05 must update main.ts header-comment "DRY_RUN check sites = 4"
//      to "DRY_RUN check sites = 5" to keep Pattern 2 containment accurate.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { z } from 'zod';
import { isDryRun } from '../env.js';
import type { SummarizedItem } from '../types.js';

// Phase 13 D-10: schema + type in same file so a maintenance edit shows
// drift in one view. PendingItem.strict() rejects unknown keys at parse
// time — defends against an upstream refactor accidentally widening the
// shape (e.g., someone adding the body field would fail validation immediately
// rather than silently persisting article body to disk).
const PendingItemSchema = z
  .object({
    firmId: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    publishedAt: z.string().optional(),
    language: z.enum(['ko', 'en']),
    summary_ko: z.string().nullable(),
    summaryConfidence: z.enum(['high', 'medium', 'low']),
    summaryModel: z.string().min(1),
    summaryError: z.string().min(1).optional(),
    summarizedAt: z.string(), // ISO8601 (daily run sets this)
  })
  .strict();

const PendingStateSchema = z
  .object({
    version: z.literal(1), // D-10: drift produces zod error with path `version`
    windowStart: z.string(),
    items: z.array(PendingItemSchema),
  })
  .strict();

export type PendingItem = z.infer<typeof PendingItemSchema>;
export type PendingState = z.infer<typeof PendingStateSchema>;

// Export schemas so test/state/pending.test.ts can probe error paths.
export { PendingItemSchema, PendingStateSchema };

// D-11: factory (not module-level const) so windowStart is evaluated at call
// time, not at module-load time. Mirrors src/state/reader.ts DEFAULT idiom
// but parametrized to "now".
function defaultPending(): PendingState {
  return {
    version: 1,
    windowStart: new Date().toISOString(),
    items: [],
  };
}

export async function readPending(
  path = 'state/pending.json',
): Promise<PendingState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw); // SyntaxError on bad JSON -> propagates
    return PendingStateSchema.parse(parsed); // ZodError on shape / version drift -> propagates
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return defaultPending();
    throw err;
  }
}

// Private helper — NOT exported (D-09). External callers go through
// appendPending or truncatePending so windowStart cannot be rewritten by
// accident.
async function writePendingInternal(
  state: PendingState,
  path: string,
): Promise<void> {
  if (isDryRun()) {
    // OPS-06 sanctioned DRY_RUN site #5 (see header comment for the full list).
    // Arithmetic above already ran; we only skip the disk write so DRY_RUN
    // exercises the same merge/truncate code paths as a real run.
    console.log(
      `[DRY_RUN] would write ${path} with ${state.items.length} items`,
    );
    return;
  }
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

export async function appendPending(
  items: PendingItem[],
  path = 'state/pending.json',
): Promise<void> {
  const current = await readPending(path);
  const next: PendingState = {
    version: 1,
    windowStart: current.windowStart, // D-09: preserved across appends
    items: [...current.items, ...items],
  };
  await writePendingInternal(next, path);
}

export async function truncatePending(
  path = 'state/pending.json',
): Promise<void> {
  // D-09: truncate is the ONLY sanctioned windowStart reset. Used by
  // runWeekly after sendMail + writeArchive succeed.
  const next: PendingState = {
    version: 1,
    windowStart: new Date().toISOString(),
    items: [],
  };
  await writePendingInternal(next, path);
}

// D-07 COMP-05 enforcement: the description (article body) MUST NOT reach
// disk. isClusterMember is runtime-only (Phase 8 D-08). isNew is
// runtime-only (NewItem marker). Construct the projected shape EXPLICITLY
// so a future widening of SummarizedItem (e.g., adding a new runtime-only
// field) does not silently start persisting through a spread.
export function toPendingItem(s: SummarizedItem, now: Date): PendingItem {
  return {
    firmId: s.firmId,
    title: s.title,
    url: s.url,
    publishedAt: s.publishedAt,
    language: s.language,
    summary_ko: s.summary_ko,
    summaryConfidence: s.summaryConfidence,
    summaryModel: s.summaryModel,
    summaryError: s.summaryError,
    summarizedAt: now.toISOString(),
  };
}
