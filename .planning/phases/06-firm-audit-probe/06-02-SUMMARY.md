---
phase: 06-firm-audit-probe
plan: 02
subsystem: audit
tags: [audit, signals, pure-functions, tdd, jaccard, detail-identity, phase6]

# Dependency graph
requires:
  - phase: 06-01
    provides: "AuditRow/Status/Remediation types that Plan 04 orchestrator will adapt DetailSignalResult to"
provides:
  - "src/audit/signals.ts — 4 pure signal functions + classifyDetailIdentity combiner"
  - "test/audit/signals.test.ts — 35 unit tests including bkl walkthrough and Pitfall 1 guard"
affects:
  - "06-03 (firmAudit.ts orchestrator — imports classifyDetailIdentity from signals.js)"
  - "06-04 (CLI wrapper — indirectly via firmAudit.ts)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function signal modules: no I/O imports, all inputs are in-process strings"
    - "Pitfall 1 guard pattern: totalTokens > 0 required before triggering zero-count signal"
    - "D-07 combined-OR classifier: exact-hash | jaccard≥0.9 | title-token-zero → detail-identical"
    - "D-08 separate status branch: bodyTooShort → detail-empty (not folded into detail-identical)"
    - "TDD RED→GREEN: test commit first (module-not-found RED), then implementation (35/35 GREEN)"

key-files:
  created:
    - src/audit/signals.ts
    - test/audit/signals.test.ts
  modified: []

key-decisions:
  - "06-02: Pitfall 1 guard requires totalTokensA > 0 && totalTokensB > 0 — prevents vacuous title-token trigger when titles have zero ≥2-char tokens (e.g., 'A B', 'M&A'). Test 34 locks the behavior."
  - "06-02: jaccard threshold 0.9 is a hardcoded literal (D-07) — not parameterized, T-06-04 threat mitigation"
  - "06-02: RESEARCH.md classifier code (L482-527) correctly omits Pitfall 1 guard; PLAN.md action block (L370-394) supplies the corrected version with the guard — implementation follows PLAN.md"

requirements-completed: [AUDIT-02, AUDIT-03]

# Metrics
duration: 8min
completed: 2026-04-20
---

# Phase 6 Plan 02: Signals Summary

**4-signal detail-identity classifier (exact-hash, jaccard≥0.9, title-token-zero, body-too-short) implemented as pure TypeScript functions with Pitfall 1 vacuous-fire guard and 35 TDD-green unit tests**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-20T03:33:37Z
- **Completed:** 2026-04-20T03:42:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2 created

## Accomplishments

- `src/audit/signals.ts` — 9 exported symbols: `bodyHash`, `exactHashMatch`, `tokenize`, `jaccardTokenSimilarity`, `extractTitleTokens`, `titleTokensPresentInBody`, `BODY_TOO_SHORT_THRESHOLD`, `bodyTooShort`, `classifyDetailIdentity` + `DetailSignalResult` interface
- `test/audit/signals.test.ts` — 35 unit tests, 7 describe blocks, covering all 4 signals plus the classifyDetailIdentity combiner (35/35 GREEN, 302/302 full suite green)
- Pitfall 1 vacuous-fire guard verified by Test 34: titles 'A B'/'X Y' (zero ≥2-char tokens) with distinct real bodies → `OK`, not `detail-identical`
- bkl walking-through (Test 32): identical bodies + distinct titles with Hangul tokens → `detail-identical` with evidence containing `exact-hash`, `jaccard=1.00`, `title-tokens`
- TDD gate compliance: `test(06-02)` RED commit → `feat(06-02)` GREEN commit, sequential order verified in git log

## Task Commits

1. **Task 1: Write signals.test.ts (RED)** - `234fb68` (test)
2. **Task 2: Implement src/audit/signals.ts (GREEN)** - `277084a` (feat)

## Files Created/Modified

- `/Users/seonghoonyi/Documents/projects/legalnewsletter/src/audit/signals.ts` — 9 pure exported functions + DetailSignalResult interface; no I/O imports; Pitfall 1 guard (`totalTokensA > 0 && totalTokensB > 0`)
- `/Users/seonghoonyi/Documents/projects/legalnewsletter/test/audit/signals.test.ts` — 35 unit tests with bkl fixture bodies and vacuous-fire guard tests

## Exported Function Signatures

```typescript
export function bodyHash(body: string): string;
export function exactHashMatch(bodyA: string, bodyB: string): boolean;
export function tokenize(text: string): string[];
export function jaccardTokenSimilarity(bodyA: string, bodyB: string): number;
export function extractTitleTokens(title: string): string[];
export function titleTokensPresentInBody(title: string, body: string): number;
export const BODY_TOO_SHORT_THRESHOLD: number; // = 100
export function bodyTooShort(body: string): boolean;

export interface DetailSignalResult {
  status: 'OK' | 'detail-identical' | 'detail-empty' | 'detail-quality-unknown';
  evidence: string;
}
export function classifyDetailIdentity(
  bodies: { url: string; title: string; body: string }[],
): DetailSignalResult;
```

## bkl Walking-Through Verification (Test 32)

| Signal | Result |
|--------|--------|
| Exact hash | TRIGGERS — identical 200+ char bodies → bodyHash(a) === bodyHash(b) |
| Jaccard ≥ 0.9 | TRIGGERS — identical bodies → jaccard = 1.0 |
| Title-token presence = 0 | TRIGGERS — titles '시장 동향' / '세법 개정' have 2-char Hangul tokens; identicalBody (firm boilerplate) shares none → 0 tokens present, totalTokens > 0 on both |
| Body-too-short | NO — 200+ chars is above threshold |

**Result:** `status: 'detail-identical'`, evidence contains `exact-hash`, `jaccard=1.00`, `title-tokens`

## Pitfall 1 Vacuous-Fire Guard (Test 34)

```typescript
// Titles 'A B' / 'X Y' → extractTitleTokens → [] (zero ≥2-char tokens each)
// Guard: titlePresenceTriggered requires totalTokensA > 0 && totalTokensB > 0
// Without guard: vacuous "0/0 tokens present" would fire → false-positive detail-identical
const result = classifyDetailIdentity([
  { url: 'https://x/1', title: 'A B', body: realArticleA },
  { url: 'https://x/2', title: 'X Y', body: realArticleB },
]);
expect(result.status).toBe('OK'); // PASSES
```

## Decisions Made

- RESEARCH.md Pattern 3 (L482-527) omits the Pitfall 1 guard in the classifier code; PLAN.md action block (L370-394) supplies the corrected version — implementation follows PLAN.md's corrected code with `totalTokensA > 0 && totalTokensB > 0` guard
- jaccard threshold 0.9 is a hardcoded literal per D-07 — not extracted to a constant or config — matching T-06-04 threat mitigation (threshold cannot be suppressed at runtime)
- `DetailSignalResult` is an internal interface in signals.ts — Plan 04 orchestrator adapts it to `AuditRow` without needing to import `DetailSignalResult` from types.ts

## Deviations from Plan

None — plan executed exactly as written. The implementation in `src/audit/signals.ts` follows the PLAN.md action block precisely, including the Pitfall 1 guard.

## TDD Gate Compliance

- RED gate commit: `234fb68` — `test(06-02): add failing signals.test.ts for 4-signal detail identity classifier`
- GREEN gate commit: `277084a` — `feat(06-02): implement 4-signal detail-identity classifier (signals.ts)`
- REFACTOR gate: not needed — implementation is clean per pattern

## Issues Encountered

None.

## Known Stubs

None — all 9 exported functions are fully implemented with real logic.

## Threat Flags

No new threat surface introduced. `signals.ts` is a pure-function module with no I/O, no network endpoints, no auth paths, no file access, no schema changes. Threat model from PLAN.md covers the existing surface (T-06-04 through T-06-07).

## Next Phase Readiness

- Plan 04 orchestrator (`src/audit/firmAudit.ts`) can call `classifyDetailIdentity({ url, title, body }[])` and receive a typed `DetailSignalResult` with `status` and `evidence`
- Import path: `import { classifyDetailIdentity } from './signals.js'`
- No further parsing logic needed by the caller — the status union is exhaustive, evidence is a human-readable string

---
*Phase: 06-firm-audit-probe*
*Completed: 2026-04-20*

## Self-Check: PASSED

- `src/audit/signals.ts` — FOUND
- `test/audit/signals.test.ts` — FOUND
- Commit `234fb68` — FOUND (test RED)
- Commit `277084a` — FOUND (feat GREEN)
- `pnpm vitest run test/audit/signals.test.ts` — 35/35 PASSED
- `pnpm vitest run` — 302/302 PASSED (zero regression)
