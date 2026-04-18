# Plan 03-02 — Recorder + step-summary

Phase: 03-observability-dev-loop
Plan: 02 of 5 (Wave 1)
Commits: `84cd9d5`, `d832d54` (on `dev`)

## What shipped

### Task 1 — `src/observability/recorder.ts`

`Recorder` class with chainable `FirmRecorder` handle pattern. Pure in-memory accumulator:
- `recorder.firm(id)` returns chainable handle: `.fetched(n).newCount(n).summarized(n).errorClass(s).durationMs(ms)`.
- Replace-not-accumulate semantics (Pitfall 6).
- Per-firm isolation via `Map<firmId, FirmMetrics>`.
- `toMarkdownTable(firms)` emits D-10 5-column GFM table in firms.yaml order.
- Disabled firms filtered out (D-P2-14).

**Tests:** `test/observability/recorder.test.ts` — 13 passing (plan targeted 12+).

### Task 2 — `src/observability/summary.ts`

`writeStepSummary(recorder, firms)` env-gated appender:
- No-op when `GITHUB_STEP_SUMMARY` unset.
- `appendFile` only — preserves prior step contributions.
- `try/catch` with scrubbed `console.warn` prefixed `[step-summary]` — Pitfall 10.

**Tests:** `test/observability/summary.test.ts` — 4 passing.

## Evidence

| Gate | Actual |
|------|--------|
| `grep -c "export class Recorder"` | 1 ✓ |
| Recorder header string exact match | 1 string literal ✓ |
| `grep -c "f.enabled"` | 1 (disabled filter) ✓ |
| `grep -c "throw" src/observability/summary.ts` | 0 ✓ (never-throw) |
| `grep -c "writeFile" src/observability/summary.ts` | 2 (docstring only; no actual writeFile call) |
| `pnpm typecheck` | exit 0 ✓ |

**Full suite status:** 145 tests pass (128 Phase 1/2 baseline + 5 Plan 01 writer tests + 2 Plan 01 classifyError tests + 13 Recorder tests + 4 summary tests = 152... to be reconfirmed at phase end).

## Deviations

None. Some plan grep counts expected exact-1 values that reached 2-4 because the module docstrings quote code patterns they document. The runtime semantics (single Recorder class, single writeStepSummary, zero `throw` sites in summary.ts, zero `writeFile` calls in summary.ts) all match the plan.

## No new dependencies

package.json untouched. Only `node:fs/promises` and existing project imports.
