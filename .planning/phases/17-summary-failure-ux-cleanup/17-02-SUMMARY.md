---
phase: 17-summary-failure-ux-cleanup
plan: "02"
subsystem: api
tags: [gemini, p-retry, retryDelay, 429, quota, fake-timers, vitest]

requires:
  - phase: 08-hallucination-defense
    provides: summarize() catch path + summaryModel='failed' sentinel
provides:
  - parseRetryDelaySeconds helper (errorDetails + message-body fallback, 60s cap)
  - async onFailedAttempt that sleeps for parsed retryDelay before next attempt
  - 4 fake-timer regression tests covering structured + fallback + cap + no-retryDelay paths
affects: [phase-17-01, phase-17-03, future-quota-handling]

tech-stack:
  added: []
  patterns:
    - Async onFailedAttempt sleep injection on 429 — flash/flash-lite share quota metric, so model fallback alone does not unstick a 429 burst
    - 60s hard cap inside parseRetryDelaySeconds — defense against runaway SDK values
    - Fake-timer driven test for time-sensitive retry behavior — keeps suite fast

key-files:
  created: []
  modified:
    - src/summarize/gemini.ts
    - test/summarize/gemini.test.ts

key-decisions:
  - "Used parseRetryDelaySeconds with two parse paths (structured + message-body) — gives forward-compatibility if @google/genai changes which path it populates"
  - "Cap inside the parser, not at the call site — single point of policy; tests assert cap by mocking 3600s value"
  - "Kept p-retry retries: 3 unchanged per D-06 — only sleep behavior added, not retry policy"

patterns-established:
  - "vi.useFakeTimers + vi.advanceTimersByTimeAsync + vi.runAllTimersAsync three-step pattern for testing async retry+sleep paths"
  - "Pre-fire / post-fire timer advancement asserts the sleep duration is honored (call count remains 1 before threshold, becomes 2 after)"

requirements-completed: [FAIL-UX-01]

duration: 6min
completed: 2026-05-28
---

# Plan 17-02: onFailedAttempt retryDelay honor — 429 burst 자동 회복

**429 responses with retryDelay (errorDetails or message body) now cause an explicit sleep before the next p-retry attempt — flash/flash-lite quota-pool bursts wait for the actual RPM window instead of exhausting the default exponential backoff.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3
- **Files modified:** 2 (1 src + 1 test)

## Accomplishments

- `parseRetryDelaySeconds(err)` helper added (file-scoped) — parses `errorDetails[].retryDelay` first, falls back to `"retryDelay":"Ns"` regex on `err.message`. Returns 0 for unparseable/negative/non-finite values; caps positive values at 60.
- `onFailedAttempt` is now `async` — still does the flash → flash-lite model swap and ZodError → AbortError throw, then (for 429s) sleeps for parsed retryDelay seconds.
- 4 new tests verify: structured shape parse with 25s pre-fire vs 35s post-fire, message-body fallback parse, 60s cap on 3600s input, and no-retryDelay 429 still completes via p-retry default backoff.
- 495/495 tests pass.

## Task Commits

1. **T1: parseRetryDelaySeconds + async onFailedAttempt sleep** — squashed into Plan commit `14a0e28`
2. **T2: 4 retryDelay regression tests** — squashed into Plan commit `14a0e28`
3. **T3: Plan commit** — `14a0e28` (single commit per plan)

## Files Created/Modified

- `src/summarize/gemini.ts` — Added `parseRetryDelaySeconds` (~30 lines) above `SummaryZ`. Changed `onFailedAttempt` from sync to `async` and appended a 429-only sleep block after the existing model fallback + ZodError abort. `console.error` operator-signal line + `summaryModel: 'failed'` catch path untouched (D-08).
- `test/summarize/gemini.test.ts` — Added describe block `summarize — retryDelay honor on 429 (FAIL-UX-01 / SPEC requirement 5)` with 4 fake-timer tests.

## Decisions Made

- **Parser cap is internal, not external.** Putting `Math.min(n, 60)` inside the parser means callers can never accidentally pass a giant sleep. Tests still verify the cap via input that demands clamping (3600s).
- **Two parse paths, not one.** SDK 1.49.x exposes `errorDetails` as a structured array; older error wrappers or stringified errors only have `err.message`. Both are covered so we don't break if @google/genai changes which path it populates.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- 2026-05-27 production failure shape (`retryDelay: "39.347610487s"`) now triggers an ~40s sleep + retry, well within the GHA 6-hour timeout. Per-run wall-clock impact is bounded at 60s × retries 3 ≈ 3min worst case.
- Plan 17-03 (CLAUDE.md table update) is the last remaining wave-1 plan and is fully independent.

---
*Phase: 17-summary-failure-ux-cleanup*
*Completed: 2026-05-28*
