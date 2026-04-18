---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 07
status: complete
files_modified:
  - src/pipeline/dedup.ts
  - src/state/writer.ts
  - test/pipeline/dedup.test.ts
  - test/state/writer.test.ts
---

# Plan 02-07 Summary: D-P2-08 empty-state bootstrap guard

## What was built

Extended the D-09 bootstrap guard in both `dedupAll` AND `writeState` to
treat a structurally-empty prior state (`{urls:[], lastNewAt:null}`) the
same as a missing firm. This closes the Pitfall 6 regression vector
where a manually-edited state file or a "never successfully scraped"
firm would bypass the bootstrap branch and flood the next digest with
the entire back-catalog.

### dedup.ts change (2 logical lines)
```ts
if (!priorFirm) { ... }
// became:
if (
  !priorFirm ||
  (priorFirm.urls.length === 0 && priorFirm.lastNewAt === null)
) { ... }
```

### writer.ts change (mirror)
```ts
if (!priorFirm) { ... seed from r.raw ... }
// became:
const isBootstrap =
  !priorFirm ||
  (priorFirm.urls.length === 0 && priorFirm.lastNewAt === null);
if (isBootstrap) { ... seed from r.raw ... }
```

Both files' docstring invariants updated to reference D-P2-08 explicitly.

## Test counts

- `test/pipeline/dedup.test.ts`: 6 (Phase 1) → **9** (3 new D-P2-08 tests)
- `test/state/writer.test.ts`: 5 (Phase 1) → **7** (2 new D-P2-08 tests)

writer.test.ts already existed from Phase 1 plan 01-10; extended it
rather than creating a new file.

## Verification evidence

```
pnpm typecheck → exit 0
pnpm vitest run test/pipeline/dedup.test.ts test/state/writer.test.ts
  → 16/16 pass (9 dedup + 7 writer)

grep -c "priorFirm.urls.length === 0 && priorFirm.lastNewAt === null" src/pipeline/dedup.ts → 1
grep -c "priorFirm.urls.length === 0 && priorFirm.lastNewAt === null" src/state/writer.ts → 1
grep -c "D-P2-08" src/pipeline/dedup.ts → 2 (docstring + guard comment)
grep -c "D-P2-08" src/state/writer.ts → 2 (docstring + guard comment)
grep -c "isBootstrap" src/state/writer.ts → 2 (declaration + use)
grep -c "D-P2-08" test/pipeline/dedup.test.ts → 3 (3 new test labels)
```

### Boundary cases locked

- `{urls: [], lastNewAt: null}` → bootstrap (D-P2-08 match)
- `{urls: ['/b'], lastNewAt: null}` → NOT bootstrap (prior urls exist)
- `{urls: [], lastNewAt: '2026-04-17...'}` → NOT bootstrap (history exists,
  500-cap degenerate case)

## Deviations from plan

None. Minimal-footprint discipline honored: only 2 src files + 2 test
files touched.

## Note for plan 02-08

main.ts composition root does not change. dedup and writer handle D-P2-08
internally; the self-healing empty-state behavior occurs within a single
run.

## Requirements touched

- DEDUP-05 (no back-catalog flood on brand-new firm first-run) — fully
  satisfied, including the structurally-empty-state edge case (Pitfall 6).
