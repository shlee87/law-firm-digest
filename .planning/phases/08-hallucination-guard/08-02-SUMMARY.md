---
phase: 08-hallucination-guard
plan: 02
subsystem: test/summarize + test/pipeline
tags: [hallucination-guard, tests, gemini, fixtures, guard-02, phase-8]

requires:
  - phase: 08-hallucination-guard
    plan: 01
    provides: GUARD-01 Layer 1+2 + Option C substitution + API-fail title-verbatim

provides:
  - GUARD-02 fixture tests: 6 body-shape tests in gemini.test.ts
  - Layer 2 literal grep-gate in prompt.test.ts (tests 7 + 8)
  - Phase 8 GUARD-01 Layer 1 describe block in run.test.ts (2 new tests)
  - Default fetchAll body raised 4→120 chars (Layer 1 short-circuit regression fix)

affects:
  - 08-03 (cluster detector — test harness patterns established here reusable)
  - 08-06 (verification sweep — GUARD-02 gate closes here)

tech-stack:
  added: []
  patterns:
    - "vi.hoisted + vi.mock('@google/genai') pattern reused verbatim across gemini.test.ts"
    - "p-retry backoff test: raise timeout to 15 000ms for retry-exhausted test (1s+2s+4s backoff)"
    - "Layer 1 trap pattern: summarizeMock throws if called; not.toHaveBeenCalled asserts trap was not tripped"

key-files:
  created:
    - test/summarize/gemini.test.ts
  modified:
    - test/summarize/prompt.test.ts
    - test/pipeline/run.test.ts

key-decisions:
  - "p-retry backoff raises test (e) to 15 000ms timeout — cleaner than fake timers for black-box retry test"
  - "Default fetchAll description raised 4→120 chars — Layer 1 short-circuit blocked summarizeMock in existing 'invokes full pipeline' test; 120 chars is safely above threshold"
  - "summarizeMock.mockImplementation(throw) trap pattern — surfaces clear error message if Layer 1 short-circuit fails to fire"

requirements-completed: [GUARD-02]

duration: ~6 min
completed: 2026-04-20
---

# Phase 08 Plan 02: GUARD-02 Fixture Tests Summary

**GUARD-02 fixture tests: 6 body-shape + SUMM-06 spy in gemini.test.ts; Layer 2 literal grep-gates added to prompt.test.ts; run.test.ts reconciled with Layer 1 short-circuit describe block**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T20:28:02Z
- **Completed:** 2026-04-20T20:34:27Z
- **Tasks:** 3
- **Files modified:** 3 (0 src, 3 test)

## Accomplishments

- `test/summarize/gemini.test.ts` (new, 117 lines): 6 tests covering GUARD-02 — (a)(b) Layer 1 doc stubs, (c) Option C empty→title substitution, (d) real 200+ char body → Gemini summary, (e) API-fail retry-exhausted → title-verbatim, (f) SUMM-06 spy confirming title absent from Gemini prompt
- `test/summarize/prompt.test.ts` (+12 lines): tests (7) and (8) — GUARD-01 Layer 2 literals "title verbatim" and `confidence: 'low'` present in both Korean and English firm prompts
- `test/pipeline/run.test.ts` (+155 lines, 1 char change): Phase 8 GUARD-01 Layer 1 short-circuit describe block added with 2 tests; default description raised 4→120 chars

## Task Commits

1. **Task 1: Create gemini.test.ts with 4 body-shape + API-fail + SUMM-06 tests** — `f3b26aa`
2. **Task 2: Append Layer 2 literal assertions to prompt.test.ts** — `0d2a8e2`
3. **Task 3: Reconcile run.test.ts + add GUARD-01 Layer 1 describe block** — `7a0225b`

## Test Counts

| File | Before | After | New Tests |
|------|--------|-------|-----------|
| test/summarize/gemini.test.ts | 0 (new) | 6 | +6 |
| test/summarize/prompt.test.ts | 6 | 8 | +2 |
| test/pipeline/run.test.ts | 13 | 15 | +2 |
| **Total** | **19** | **29** | **+10** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] realArticleBody fixture 191자로 200자 미달**
- **Found during:** Task 1 RED run
- **Issue:** 계획에서 "200+ chars" 검증을 요구하는 테스트 (d)가 `toBeGreaterThanOrEqual(200)` assertion으로 실패 — 실제 픽스처 문자열이 191자
- **Fix:** 픽스처 문자열에 추가 문장 1개 병합 → 229자
- **Files modified:** test/summarize/gemini.test.ts
- **Committed in:** f3b26aa (Task 1)

**2. [Rule 1 - Bug] p-retry 기본 backoff(1000ms × 2^n)가 기본 5000ms 타임아웃 초과**
- **Found during:** Task 1 — test (e) 타임아웃
- **Issue:** p-retry retries=3 + minTimeout=1000ms → 1s+2s+4s = 7초 대기; 기본 테스트 타임아웃 5000ms 초과
- **Fix:** test (e)에 15 000ms 명시적 타임아웃 설정
- **Files modified:** test/summarize/gemini.test.ts
- **Committed in:** f3b26aa (Task 1)

**3. [Rule 1 - Bug] 기존 fetchAll 기본 description이 4자('body')여서 Layer 1 short-circuit이 'invokes full pipeline' 테스트를 깨뜨림**
- **Found during:** Task 3 — `invokes full pipeline with default options` 테스트 실패
- **Issue:** Phase 8 Layer 1이 100자 미만 body를 short-circuit하므로 summarizeMock이 호출되지 않아 `expect(mocks.summarizeMock).toHaveBeenCalled()`가 실패
- **Fix:** 기존 beforeEach fetchAllMock default description을 'body'(4자) → `'x'.repeat(120)`(120자)로 변경. 120자는 Layer 1 임계값(100자)보다 충분히 크고 테스트 의도(summarize 호출 확인)를 유지함
- **Files modified:** test/pipeline/run.test.ts
- **Committed in:** 7a0225b (Task 3)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — correctness bugs found during TDD RED/GREEN cycle)
**Impact on plan:** All 3 fixes necessary for correctness. No scope creep.

## Success Criteria Verification

1. GUARD-02 literal coverage: (a)(b) Layer 1 doc in run.test.ts; (c)(d) in gemini.test.ts — **PASS**
2. Option C substitution locked by test (c): mock returns "" → summarize returns item.title — **PASS**
3. API-fail title-verbatim locked by test (e): retry-exhausted → item.title + summaryModel='failed' — **PASS**
4. SUMM-06 spy (f): title never in Gemini prompt contents — **PASS**
5. Layer 2 literal assertions added to prompt.test.ts (tests 7 + 8) — **PASS**
6. run.test.ts reconciled: no stale null assertions on 'skipped'/'failed'; Phase 8 Layer 1 block present — **PASS**

## Self-Check

Verifying claims before proceeding:

- `test/summarize/gemini.test.ts` exists: confirmed
- `test/summarize/prompt.test.ts` has 8 tests: confirmed (pnpm vitest run → 8 passed)
- `test/pipeline/run.test.ts` has 15 tests: confirmed (pnpm vitest run → 15 passed)
- All 29 tests pass: confirmed
- `pnpm exec tsc --noEmit` exits 0: confirmed
- `summary_ko: null` in run.test.ts: 1 occurrence (cli-skipped path only): confirmed
- Commits f3b26aa, 0d2a8e2, 7a0225b all exist: confirmed

## Self-Check: PASSED

---
*Phase: 08-hallucination-guard*
*Completed: 2026-04-20*
