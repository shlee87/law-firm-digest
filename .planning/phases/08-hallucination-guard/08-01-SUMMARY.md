---
phase: 08-hallucination-guard
plan: 01
subsystem: summarize
tags: [hallucination-guard, gemini, pipeline, summarize, phase-8, guard-01, tdd]

requires:
  - phase: 07-spa-aware-detail-tier
    provides: detail_tier-gated enrichBody + firms.yaml with detail_tier fields

provides:
  - SummarizedItem.isClusterMember optional flag (type-level; runtime set by Plan 03)
  - GUARD-01 Layer 1 short-circuit in run.ts (body.trim().length < 100 → title-verbatim)
  - GUARD-01 Layer 2 Gemini prompt rule (generic-boilerplate → empty string → caller substitutes title)
  - Option C post-parse substitution in gemini.ts (parsed.summary_ko === '' → item.title)
  - Catch-block title-verbatim promotion in gemini.ts (API-fail → item.title, was null)
  - Zero real-run paths producing summary_ko: null (only cli-skipped debugging path remains)

affects:
  - 08-02 (gemini fixture tests — tests null→title-verbatim change)
  - 08-03 (cluster detector — uses isClusterMember flag)
  - 08-04 (digest template — reads isClusterMember + summaryModel=skipped for render logic)
  - 08-05 (step-summary surfacing)
  - 08-06 (verification sweep)

tech-stack:
  added: []
  patterns:
    - "Layer 1 / Layer 2 defense-in-depth: deterministic server-side gate before LLM prompt rule"
    - "Option C empty-string sentinel: LLM returns '' for generic boilerplate; caller substitutes title post-parse (preserves SUMM-06)"
    - "TDD: RED test (tsc fails or vitest fails) → GREEN (code fix) → commit per task"

key-files:
  created:
    - test/types/summerizedItem.test.ts
    - test/summarize/guard01Layer2.test.ts
    - test/pipeline/guard01Layer1.test.ts
  modified:
    - src/types.ts
    - src/summarize/prompt.ts
    - src/summarize/gemini.ts
    - src/pipeline/run.ts

key-decisions:
  - "Option C chosen over A/B for Layer 2 generic-boilerplate handling: Gemini returns '' (empty string), caller substitutes item.title post-parse — preserves SUMM-06 byte-for-byte without magic sentinel tokens"
  - "Zod schema SummaryZ: .min(10) removed, .max(800) preserved — empty string newly valid as Option C sentinel"
  - "catch-block in gemini.ts: null → item.title; 'failed' sentinel + summaryError retained for operational visibility"
  - "isClusterMember?: true uses literal true (not boolean) — prevents ambiguous false state; absent = not a cluster member"
  - "cli-skipped path UNCHANGED — still returns null; never reaches email template per Phase 1 B3 design"
  - "JSDoc in gemini.ts updated to reflect Phase 8 D-03 title-verbatim contract (was incorrectly referencing old null pattern)"

patterns-established:
  - "Layer 1 threshold: body.trim().length < 100 (D-02 literal — tuning deferred to Phase 10)"
  - "Real-run null invariant: grep -R 'summary_ko: null' src/ returns only cli-skipped line in run.ts and a string literal in prompt.ts (not code)"

requirements-completed: [GUARD-01]

duration: ~4min
completed: 2026-04-20
---

# Phase 08 Plan 01: Hallucination Guard Layer 1 + Layer 2 + API-fail Reconciliation Summary

**GUARD-01 defense-in-depth: body<100-char server-side short-circuit + Gemini generic-boilerplate prompt rule + API-fail catch-block all return title-verbatim, eliminating summary_ko:null from every real-run path**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-20T20:21:29Z
- **Completed:** 2026-04-20T20:25:30Z
- **Tasks:** 3
- **Files modified:** 7 (4 src, 3 test)

## Accomplishments

- SummarizedItem gains `isClusterMember?: true` optional flag (Plan 03 runtime setter, Plan 04 template consumer)
- Layer 1: `body.trim().length < 100` gate in run.ts returns title-verbatim instead of null — eliminates all short-body null paths
- Layer 2: GUARD-01 rule paragraph appended to Gemini preamble; Zod `.min(10)` relaxed so empty-string sentinel passes; Option C post-parse substitution wired in `call()`
- Catch-block: API-fail `summary_ko: null` promoted to `summary_ko: item.title`; 'failed' + summaryError retained for diagnostics
- SUMM-06 verified intact: prompt.test.ts all 6 tests green; title never enters LLM prompt

## Task Commits

1. **Task 1: Extend SummarizedItem type with isClusterMember flag** - `4fddd6d` (feat)
2. **Task 2: Layer 2 rule + Zod relaxation + Option C substitution** - `3af42d6` (feat)
3. **Task 3: Layer 1 short-circuit + catch-block title-verbatim** - `3552ea9` (feat)

## Files Created/Modified

- `src/types.ts` — Added `isClusterMember?: true` optional field to SummarizedItem
- `src/summarize/prompt.ts` — Layer 2 GUARD-01 rule paragraph in preamble; summarySchema description updated with GUARD-01 + empty-string rule
- `src/summarize/gemini.ts` — Zod .min(10) removed; Option C `parsed.summary_ko === ''` substitution; catch-block null→item.title; JSDoc updated
- `src/pipeline/run.ts` — B3 `!item.description` replaced with `body.trim().length < 100` gate returning title-verbatim
- `test/types/summerizedItem.test.ts` — 3 tests: optional, present-true, exact-literal-true
- `test/summarize/guard01Layer2.test.ts` — 6 tests: L2 rule presence, SUMM-06 preservation, schema description GUARD-01 reference
- `test/pipeline/guard01Layer1.test.ts` — 7 tests: Layer 1 gate threshold, null counts, catch-block behavior

## Decisions Made

- **Option C** (empty-string sentinel) chosen over Option A (magic token) and Option B (relax SUMM-06): preserves Phase 1 SUMM-06 invariant byte-for-byte; empty string is natural "no summary" semantics; caller substitution is deterministic (not LLM-probabilistic).
- **Zod .min(10) removal**: expands valid input to include empty string. Risk: 5–9-char genuine summaries now pass validation but still render (not substituted — only `=== ''` triggers Option C). Accepted per T-08-01-06 threat register.
- **cli-skipped null path unchanged**: this path is a debugging artifact that never reaches email template (per research A6). Changing it would require coordinating with main.ts CLI flag logic out of plan scope.
- **JSDoc update as Rule 1 fix**: stale JSDoc referencing old null pattern was a correctness documentation bug — updated inline with Task 3 to match new behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc in gemini.ts referenced old null summary_ko pattern**
- **Found during:** Task 3 (catch-block rewrite)
- **Issue:** JSDoc still said `{ summary_ko: null, ... }` for the skipped branch, contradicting Phase 8 D-03 title-verbatim change just made
- **Fix:** Updated JSDoc to reference `summary_ko: item.title` and Phase 8 D-03 contract
- **Files modified:** src/summarize/gemini.ts
- **Verification:** grep confirms no `summary_ko: null` code paths remain in gemini.ts
- **Committed in:** 3552ea9 (Task 3 commit)

**2. [Rule 1 - Bug] Test L1-04 window logic was wrong (cli-skipped check)**
- **Found during:** Task 3 TDD (guard01Layer1.test.ts)
- **Issue:** Test searched 100-char window before `summary_ko: null` index for 'cli-skipped', but 'cli-skipped' string is after null in the source — window was empty
- **Fix:** Flipped search direction — check 200-char window around cliSkippedIdx for `summary_ko: null`
- **Files modified:** test/pipeline/guard01Layer1.test.ts
- **Verification:** Test (L1-04) now passes; 7/7 guard01Layer1 tests green
- **Committed in:** 3552ea9 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — correctness bugs found during implementation)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## Self-Check

Verifying claims before proceeding:
- `isClusterMember?: true` in types.ts: 1 occurrence (confirmed)
- `body.trim().length < 100` in run.ts: 1 occurrence (confirmed)
- `summary_ko: item.title` in gemini.ts: 3 occurrences (Option C + catch-block + JSDoc example)
- `summary_ko: null` in gemini.ts: 0 occurrences (confirmed)
- `summary_ko: null` in run.ts: 1 occurrence (cli-skipped path only, confirmed)
- SUMM-06 prompt tests: 6/6 passing (confirmed)
- tsc --noEmit: exits 0 (confirmed)
- state/writer.ts: no `isClusterMember` reference (confirmed)

## Next Phase Readiness

- Plans 02–06 can assume `summary_ko !== null` for all real-run items
- Plan 02 updates gemini fixture tests for the new null→title-verbatim behavior
- Plan 03 implements `detectHallucinationClusters` and sets `isClusterMember: true` on cluster items
- Plan 04 templates read `isClusterMember` and `summaryModel === 'skipped'` for render differentiation

---
*Phase: 08-hallucination-guard*
*Completed: 2026-04-20*
