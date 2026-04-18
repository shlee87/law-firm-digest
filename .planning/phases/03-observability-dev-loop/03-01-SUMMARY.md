# Plan 03-01 — Types + enabledAt + classifyError export

Phase: 03-observability-dev-loop
Plan: 01 of 5 (Wave 1)
Commits: `e362657`, `b68ac03`, `785f7ba` (on `dev`)

## What shipped

Foundation surfaces that Plans 02–05 consume — three minimum-diff edits plus two test augmentations, zero runtime-semantic regressions.

### Task 1 — SeenState.firms[].enabledAt optional field

`src/types.ts`:
- Added `enabledAt?: string` to the per-firm record inside `SeenState.firms`.
- Extended the leading invariant docstring with a bullet documenting Phase 3 D-02 provenance and the Pitfall 9 "no silent retrofit" rule.
- `version: 1` literal preserved; no breaking schema change.

### Task 2 — writeState populates enabledAt on bootstrap; preserves on merge

`src/state/writer.ts`:
- Bootstrap branch (first-run OR D-P2-08 empty-state) now writes `enabledAt: new Date().toISOString()` onto the new per-firm record.
- Subsequent-run merge uses conditional spread `...(priorFirm.enabledAt ? { enabledAt: priorFirm.enabledAt } : {})` — preserves existing value; never retrofits legacy Phase 1/2 entries.
- Error-passthrough path (untouched) preserves enabledAt via the spread over `prior.firms`.
- Added invariant bullet #4 to the leading docstring.

`test/state/writer.test.ts`: appended 5 new tests covering the full matrix:
1. First-run bootstrap — enabledAt set to `now` (±timing assertion).
2. Empty-state bootstrap (D-P2-08 path) — enabledAt set.
3. Subsequent-run merge — original enabledAt preserved.
4. Legacy entry without enabledAt — NOT retrofitted (Pitfall 9).
5. Fetch-errored firm — enabledAt preserved via pass-through.

### Task 3 — classifyError exported

`src/compose/templates.ts`:
- Single-character change: `function classifyError` → `export function classifyError`.
- Function body, regex order, and call site at L106 unchanged.
- `escapeHtml` / `escapeAttr` remain file-local (Phase 1 01-08 LOCKED).
- Extended JSDoc with Phase 3 provenance note.

`test/compose/digest.test.ts`: 2 new tests — import surface + 7-branch taxonomy regression guard.

## Evidence

| Gate | Expected | Actual |
|------|----------|--------|
| `grep -c "enabledAt?: string" src/types.ts` | 1 | 1 |
| `grep -c "Phase 3 D-02" src/types.ts` | ≥1 | 2 |
| `grep -c "Phase 3 Pitfall 9" src/types.ts` | 1 | 1 |
| `grep -c "enabledAt: new Date().toISOString()" src/state/writer.ts` | 1 (code line) | 2 (code + docstring example) |
| `grep -c "priorFirm.enabledAt ? { enabledAt: priorFirm.enabledAt } : {}" src/state/writer.ts` | 1 | 1 |
| `grep -c "^export function classifyError" src/compose/templates.ts` | 1 | 1 |
| `grep -c "^function classifyError" src/compose/templates.ts` | 0 | 0 |
| `grep -c "^function escapeHtml" src/compose/templates.ts` | 1 | 1 |
| `grep -c "^export function escapeHtml" src/compose/templates.ts` | 0 | 0 |
| `pnpm typecheck` | exit 0 | ✓ |

**Test results:**
- `test/state/writer.test.ts` — 12 pass (7 Phase 1/2 + 5 new Phase 3).
- `test/compose/digest.test.ts` — 17 pass (15 existing + 2 new).

## Deviations

None. One grep count (`enabledAt: new Date().toISOString()` = 2 instead of 1) is due to the docstring invariant bullet quoting the code pattern. The substantive invariant — exactly one bootstrap branch writes this value at runtime — is preserved.

## Confirmation: escapeHtml / escapeAttr privacy intact

`grep -c "^export function escapeHtml" src/compose/templates.ts` returns 0. `escapeHtml` and `escapeAttr` remain file-local. Phase 1 01-08 LOCKED invariant preserved.
