---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 04
status: complete
files_modified:
  - src/pipeline/enrichBody.ts
  - src/pipeline/filter.ts
  - test/pipeline/enrichBody.test.ts
  - test/pipeline/filter.test.ts
---

# Plan 02-04 Summary: enrichBody + filter pipeline stages

## What was built

Two new pipeline stages sitting between `fetchAll` and `dedupAll` in the
pipeline order: `fetchAll → enrichWithBody → applyKeywordFilter → dedupAll →
summarize`.

### src/pipeline/enrichBody.ts
- Export: `enrichWithBody(results: FirmResult[]): Promise<FirmResult[]>`
- Per-firm `pLimit(1)` serializes detail fetches within a single firm
- 500ms delay enforced between items 2+ within the same firm (D-P2-10)
- Cross-firm parallelism inherited from fetch.ts outer pLimit(3)
- Pass-through by reference when `r.error` is set or `r.raw.length === 0`
  (mirrors dedup.ts error discipline)
- Per-item try/catch isolation: one 404/timeout on article detail does not
  affect sibling items; original `description` (undefined for HTML, teaser
  for RSS) is preserved on failure
- `extractBody(html, firm.selectors?.body)` — forwards firm override
- COMP-05 invariant: body written to `item.description` (existing optional
  field) — NOT a new `body` field. State writer doesn't persist description
  so body never reaches disk.

### src/pipeline/filter.ts
- Export: `applyKeywordFilter(results: FirmResult[]): FirmResult[]`
- Pure function. No I/O, no mutation.
- Fast path: both include_keywords AND exclude_keywords empty → return
  SAME reference (D-P2-17 default for all Phase 2 firms)
- include: AND-gate any-match (≥1 must hit). Empty include_keywords skips.
- exclude: OR-gate any-match kills the item. Empty exclude_keywords skips.
- Case-insensitive substring on `title + ' ' + description.slice(0, 500)`
- Error pass-through reference-equal (mirrors dedup.ts L45-46)

## Tests (16, all pass)

### enrichBody.test.ts (7)
1. Happy path populates description from extracted body
2. r.error pass-through reference-equal, no fetch invoked
3. Empty r.raw pass-through reference-equal, no fetch invoked
4. Per-item isolation — 503 on item 2 preserves items 1+3
5. RSS teaser preserved on detail-fetch failure (teaser retention)
6. firm.selectors.body override passed through to extractBody
7. **500ms delay enforced (D-P2-10)** — observed starts delta ≥ 450ms

### filter.test.ts (9)
1. Fast path reference-equal when both keyword arrays empty
2. include AND-gate ≥1 match required
3. exclude OR-gate any-match kills
4. Combined include + exclude (overlap possible)
5. Case-insensitive matching
6. description[:500] window — matches beyond char 500 are invisible
7. Error pass-through reference-equal
8. No mutation (JSON.stringify round-trip)
9. Empty r.raw returns empty r.raw, no crash

## Observed delay-test timings

```
delta 1->2: 500-520ms
delta 2->3: 500-520ms
```

## Verification evidence

```
pnpm typecheck → exit 0
pnpm vitest run test/pipeline/enrichBody.test.ts test/pipeline/filter.test.ts
  → 16/16 pass
pnpm vitest run (full suite) → 112/112 pass, 40s wall (mailer retry tests
  still dominate)

grep -c "^export async function enrichWithBody" src/pipeline/enrichBody.ts → 1
grep -c "^export " src/pipeline/enrichBody.ts → 1
grep -c "isDryRun" src/pipeline/enrichBody.ts → 0
grep -c "isDryRun" src/pipeline/filter.ts → 0
grep -c "pLimit(1)" src/pipeline/enrichBody.ts → 1
grep -c "INTER_FETCH_DELAY_MS = 500" src/pipeline/enrichBody.ts → 1
grep -c "^export function applyKeywordFilter" src/pipeline/filter.ts → 1
grep -c "slice(0, 500)" src/pipeline/filter.ts → 1
grep -c "toLowerCase" src/pipeline/filter.ts → 3
```

Pattern 2 DRY_RUN containment preserved: 0 isDryRun imports across both
new files.

## Deviations from plan

1. **Dropped the `test('does not import isDryRun')` marker test** in
   enrichBody.test.ts — the grep acceptance criteria already covers this
   better than an always-true vitest assertion. Test count went 8→7.
2. The `vi.useFakeTimers()` approach in the plan's test 5 was kept as real
   timers instead — matches the plan's "real timings" fallback note
   (`wrap the fetch mock with Date.now capture and verify the deltas`).

## Pipeline wiring for plan 02-08

main.ts must wire the new order: `fetchAll → enrichWithBody →
applyKeywordFilter → dedupAll → summarize`. The enrichWithBody + filter
stages are both FirmResult[] → FirmResult[] transforms, so the composition
is straightforward chaining of awaited awaits.

## Requirements touched

- FETCH-01 (HTML tier + body enrichment) — full article body now feeds
  Gemini (D-P2-02) instead of Phase 1's 180-char RSS teaser
- CONF-06 (per-firm keyword filter) — implemented; defaults to [] for all
  Phase 2 firms per D-P2-17
