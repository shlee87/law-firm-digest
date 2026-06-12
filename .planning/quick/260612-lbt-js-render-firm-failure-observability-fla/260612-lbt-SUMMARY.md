---
quick_id: 260612-lbt
phase: quick
plan: 260612-lbt
subsystem: scraper, observability, main
tags: [js-render, playwright, p-retry, observability, fail-loud]
dependency_graph:
  requires: []
  provides:
    - emitJsRenderFatalLines export from src/main.ts
    - p-retry wrapper on scrapeJsRender in src/scrapers/jsRender.ts
  affects:
    - src/main.ts (FATAL block + new export)
    - src/scrapers/jsRender.ts (pRetry wrapper + scrapeOnce refactor)
    - test/main.test.ts (4 new observability tests)
    - test/scrapers/jsRender.test.ts (4 new p-retry tests + 1 updated)
tech_stack:
  added: []
  patterns:
    - p-retry v8 shouldRetry({ error }) context API (mirrors gemini.ts)
    - exported helper pattern for testability (mirrors emitDryRunStepSummary)
key_files:
  created: []
  modified:
    - src/main.ts
    - src/scrapers/jsRender.ts
    - test/main.test.ts
    - test/scrapers/jsRender.test.ts
decisions:
  - p-retry v8 uses shouldRetry({ error }) context object, not raw error — differs from plan's example code which showed v6 API; fixed to match gemini.ts pattern in this repo
  - Existing "closes BrowserContext even on throw" test updated from toHaveBeenCalledTimes(1) to (2): playwright-timeout now triggers 1 retry so context.close fires twice — correct behavior
metrics:
  duration: ~8min
  completed_date: 2026-06-12
---

# Quick Task 260612-lbt: js-render Firm Failure Observability + Flakiness Retry Summary

**One-liner:** Per-firm id + scrubbed error emitted to stderr at FATAL path; scrapeJsRender wraps scrapeOnce with pRetry({ retries: 1, shouldRetry: playwright-timeout only }).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | FATAL path — emit per-firm id + error to stderr | 95770c9 | src/main.ts, test/main.test.ts |
| 2 | jsRender list-fetch — 1 retry on transient playwright-timeout | 4a8a35e | src/scrapers/jsRender.ts, test/scrapers/jsRender.test.ts |
| 3 | Verify full suite is green | (no commit) | — |

## What Was Built

### Task 1: emitJsRenderFatalLines (src/main.ts)

Exported `emitJsRenderFatalLines(results: FirmResult[]): void` — iterates results and calls `console.error('[js-render-fail] firm=... error=...')` for each entry where `r.error != null && (r.firm.type === 'js-render' || r.firm.detail_tier === 'js-render')`. The FATAL block now calls this before the summary count line, so GHA run logs show firm identity without needing the Step Summary tab.

`scrubSecrets()` applied on `error.message` as defense-in-depth (T-260612-01), even though fetch.ts already scrubs at the catch site.

### Task 2: pRetry wrapper in scrapeJsRender (src/scrapers/jsRender.ts)

Extracted existing body into private `scrapeOnce(firm, browser)`. Exported `scrapeJsRender` now wraps `scrapeOnce` with `pRetry({ retries: 1, shouldRetry: ({ error }) => /playwright-timeout/i.test(error.message) })`.

- selector-miss and browser-launch-fail abort immediately (shouldRetry returns false)
- playwright-timeout retries once; if retry succeeds, run returns 0
- If retry also fails, error propagates → jsRenderFailures incremented → run returns 1 (fail-loud contract preserved)
- No sleep added (p-retry default); total extra wall-clock bounded by one 30s timeout window (T-260612-02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] p-retry v8 shouldRetry API is context object, not raw error**
- **Found during:** Task 2 GREEN phase (tests failed on retry tests after implementation)
- **Issue:** Plan's example code showed `shouldRetry: (err) => /playwright-timeout/.test(err.message)` — this is the p-retry v6 API. This project uses p-retry v8 (8.0.0) where `shouldRetry` receives `{ error, attemptNumber, retriesLeft, ... }` context object.
- **Fix:** Changed to `shouldRetry: ({ error }) => /playwright-timeout/i.test((error as Error).message)` — matches gemini.ts pattern in the codebase.
- **Files modified:** src/scrapers/jsRender.ts
- **Commit:** 4a8a35e

**2. [Rule 1 - Bug] Existing "closes BrowserContext even on throw" test expected toHaveBeenCalledTimes(1)**
- **Found during:** Task 2 GREEN phase after p-retry was wired in
- **Issue:** playwright-timeout now triggers 1 retry — `context.close()` is called in `finally` for both the initial attempt and the retry, so the shared mock context has close called twice.
- **Fix:** Updated assertion from `toHaveBeenCalledTimes(1)` to `toHaveBeenCalledTimes(2)`. Added comment explaining why (playwright-timeout + retry = 2 close calls). Test spirit preserved: context IS always closed.
- **Files modified:** test/scrapers/jsRender.test.ts
- **Commit:** 4a8a35e

## Test Results

| Metric | Before | After |
|--------|--------|-------|
| Tests passing | 495 | 503 |
| New tests added | — | +8 (4 observability + 4 p-retry) |
| Test files | 36 | 36 |

`pnpm test` result: **503 passed (503), 36 test files** — all green.

## Threat Model Coverage

| Threat ID | Disposition | Applied |
|-----------|-------------|---------|
| T-260612-01 | mitigate | scrubSecrets() applied on error.message in emitJsRenderFatalLines |
| T-260612-02 | accept | retries: 1 only; shouldRetry strictly scoped; no sleep added |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `src/main.ts` — emitJsRenderFatalLines exported, FATAL block updated: FOUND
- `src/scrapers/jsRender.ts` — pRetry wrapper + scrapeOnce: FOUND
- `test/main.test.ts` — 4 new observability tests: FOUND
- `test/scrapers/jsRender.test.ts` — 4 new p-retry tests: FOUND
- Commit 95770c9 exists: FOUND
- Commit 4a8a35e exists: FOUND
- pnpm test: 503 passed
