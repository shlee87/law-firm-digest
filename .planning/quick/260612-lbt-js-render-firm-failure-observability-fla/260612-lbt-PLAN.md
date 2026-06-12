---
quick_id: 260612-lbt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.ts
  - src/scrapers/jsRender.ts
  - test/main.test.ts
  - test/scrapers/jsRender.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "When a js-render firm fails, the GHA log shows the failing firm id and scrubbed error reason on stderr (not just a count)"
    - "A single transient Playwright timeout triggers one retry before the firm is counted as failed"
    - "After retry exhaustion, the run still returns exit 1 (fail-loud contract preserved)"
  artifacts:
    - path: "src/main.ts"
      provides: "FATAL path emits per-firm id + scrubbed error to stderr"
    - path: "src/scrapers/jsRender.ts"
      provides: "p-retry wrapper on the scrapeJsRender call — 1 retry on playwright-timeout"
    - path: "test/main.test.ts"
      provides: "Unit test: failing firm id + scrubbed error appears on stderr at the FATAL path"
    - path: "test/scrapers/jsRender.test.ts"
      provides: "Unit tests: retries once on playwright-timeout, fails loud after retry exhaustion, no retry on selector-miss"
  key_links:
    - from: "src/main.ts:164-168"
      to: "report.results"
      via: "filter(r => r.error && (r.firm.type === 'js-render' || r.firm.detail_tier === 'js-render'))"
      pattern: "jsRenderFailures > 0"
    - from: "src/scrapers/jsRender.ts"
      to: "p-retry"
      via: "pRetry(scrapeJsRenderOnce, { retries: 1, shouldRetry: isTransient })"
      pattern: "pRetry"
---

<objective>
Fix two production pain points on the js-render failure path:

1. OBSERVABILITY: The FATAL log line currently says "N js-render firm(s) failed" with no identity. Add per-firm id + scrubbed error reason to the same stderr emission so it appears in the GHA run log and in the auto-issue body.

2. FLAKINESS RETRY: Playwright list-page fetches intermittently timeout on slow SPAs. Add one p-retry retry on the playwright-timeout error class in scrapeJsRender. Persistent failures (after the single retry) still propagate as errors so the run still returns exit 1.

Purpose: Operator can diagnose failures without needing DRY_RUN or the GHA Step Summary tab. Transient slow loads no longer cause unnecessary red runs.
Output: Two modified source files + test coverage.
</objective>

<execution_context>
@/Users/seonghoonyi/Documents/projects/legalnewsletter/.claude/get-shit-done/workflows/execute-plan.md
@/Users/seonghoonyi/Documents/projects/legalnewsletter/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/seonghoonyi/Documents/projects/legalnewsletter/.planning/STATE.md
@/Users/seonghoonyi/Documents/projects/legalnewsletter/CLAUDE.md

<!-- Key interfaces the executor needs. No codebase exploration required. -->
<interfaces>
From src/pipeline/runTypes.ts:
```typescript
export interface RunReport {
  results: FirmResult[];  // FirmResult[] — every firm, success or failure
  jsRenderFailures: number;  // count only; firm identity NOT included
  // ...
}
```

From src/types.ts:
```typescript
export interface FirmResult {
  firm: FirmConfig;  // firm.id, firm.type, firm.detail_tier
  error?: {
    stage: 'fetch' | 'parse' | 'dedup' | 'summarize';
    message: string;  // already scrubSecrets()-scrubbed at fetch.ts catch site
  };
  // ...
}
export interface FirmConfig {
  id: string;
  type: FirmType;  // 'js-render' | 'rss' | 'html' | 'sitemap'
  detail_tier?: 'js-render' | 'static';
}
```

From src/util/logging.ts:
```typescript
export function scrubSecrets(input: string): string;
// Already called on error.message in fetch.ts — but not on the firm.id+message
// composite string emitted at the FATAL site. Apply defensively.
```

From src/scrapers/jsRender.ts:
```typescript
// Current constants:
const WAIT_TIMEOUT_MS = 15_000;
const GOTO_TIMEOUT_MS = 15_000;

// Current error message shape for playwright timeout:
// `scrapeJsRender ${firm.id}: playwright-timeout waiting for ${firm.wait_for}`
// This string is what the retry predicate should match.

export async function scrapeJsRender(firm: FirmConfig, browser: Browser): Promise<RawItem[]>
```

p-retry (already a project dep, used in src/summarize/gemini.ts):
```typescript
import pRetry from 'p-retry';
// API: pRetry(fn, { retries: N, shouldRetry?: (err) => boolean })
// shouldRetry returns false → AbortError equivalent, no more retries
// onFailedAttempt(context) can also be used for logging
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FATAL path — emit per-firm id + error to stderr</name>
  <files>src/main.ts, test/main.test.ts</files>
  <behavior>
    - Test: when report has 2 js-render failures, stderr contains both firm ids
    - Test: stderr output for each failing firm contains the scrubbed error message
    - Test: the FATAL count line is still emitted (existing behavior preserved)
    - Test: non-js-render failures do NOT appear in the js-render FATAL block
  </behavior>
  <action>
In src/main.ts, find the FATAL block (lines 164-168):

```typescript
if (report.jsRenderFailures > 0) {
  console.error(
    `FATAL: ${report.jsRenderFailures} js-render firm(s) failed — see email footer; state + archive have already been committed`,
  );
  return 1;
}
```

Replace with a block that:
1. Collects all FirmResult entries where `r.error != null && (r.firm.type === 'js-render' || r.firm.detail_tier === 'js-render')` from `report.results` — mirrors the same predicate already used in runDaily.ts lines 255-259 to set `jsRenderFailures`.
2. For each failing firm, emits one `console.error` line: `[js-render-fail] firm=${r.firm.id} error=${scrubSecrets(r.error.message)}`
3. Emits the existing summary count line AFTER the per-firm lines (keep it as the final line so the auto-issue's "Likely causes" keyword matching — `playwright-timeout`, `browser-launch-fail`, `zero items extracted` — remains greppable in the log).

The `error.message` field is already scrubSecrets()-scrubbed by fetch.ts at the catch site. Apply `scrubSecrets()` again as defense-in-depth on the composite string — consistent with the existing `catch (err)` path at line 180.

Do NOT change the return value (still `return 1`). Do NOT change the `emitDryRunStepSummary` call. Do NOT remove the count from the summary line.

In test/main.test.ts, add a new `describe('FATAL js-render observability')` block:
- Spy on `console.error`
- Build a fake `RunReport` with `jsRenderFailures: 2` and two matching FirmResult entries in `results` (firm.type='js-render', error.message set)
- Call a test-exported helper or use the existing `main()` spy pattern (match existing test style — use vi.mock or spy on runDaily to return the fake report)
- Assert: stderr contains `[js-render-fail] firm=lee-ko error=...` and `[js-render-fail] firm=yoon-yang error=...`
- Assert: stderr contains the summary `FATAL: 2 js-render firm(s) failed`
- Assert: per-firm line appears BEFORE the summary count line

Look at how `test/main.test.ts` already stubs `GEMINI_API_KEY` and spies on `console.error` in the `parseMode` describe block — mirror that pattern.

NOTE: `main()` itself calls `runDaily()`/`runWeekly()` and `process.exit()`. The cleanest way to test the FATAL observability without spawning a child process is to export a small helper `emitJsRenderFatalLines(results: FirmResult[]): void` from main.ts (analogous to the exported `emitDryRunStepSummary`) and test it directly. This avoids mocking the entire pipeline. Add the export; have the FATAL block call it.
  </action>
  <verify>
    <automated>pnpm test -- --reporter=verbose test/main.test.ts 2>&1 | grep -E "PASS|FAIL|js-render observability"</automated>
  </verify>
  <done>
    - `emitJsRenderFatalLines` exported from src/main.ts
    - Called in the FATAL block before the summary count console.error
    - Tests: per-firm stderr lines appear; summary count line still present; order correct
    - Existing main.test.ts tests still green
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: jsRender list-fetch — 1 retry on transient playwright-timeout</name>
  <files>src/scrapers/jsRender.ts, test/scrapers/jsRender.test.ts</files>
  <behavior>
    - Test: first call throws playwright-timeout, second call succeeds → items returned (retry absorbed the transient failure)
    - Test: both calls throw playwright-timeout → error propagates (fail-loud preserved; no silent swallow)
    - Test: first call throws selector-miss (zero-items) → no retry, error propagates immediately (selector-miss is not transient)
    - Test: first call throws browser-launch-fail → no retry, error propagates immediately (infra failure is not transient)
    - Test: existing happy-path and timeout/context-close tests still pass (no regression)
  </behavior>
  <action>
In src/scrapers/jsRender.ts:

1. Add `import pRetry from 'p-retry';` at the top (already in package.json; mirror the import style from src/summarize/gemini.ts which uses `import pRetry, { AbortError } from 'p-retry'`).

2. Extract the current body of `scrapeJsRender` into a private inner function `scrapeOnce(firm, browser)` — same signature, same logic, no changes to the implementation.

3. Replace the body of the exported `scrapeJsRender` with a `pRetry` wrapper:

```typescript
export async function scrapeJsRender(
  firm: FirmConfig,
  browser: Browser,
): Promise<RawItem[]> {
  return pRetry(() => scrapeOnce(firm, browser), {
    retries: 1,
    shouldRetry: (err) => {
      // Only retry playwright-timeout (transient slow SPA load).
      // selector-miss and browser-launch-fail are NOT transient — abort immediately.
      return /playwright-timeout/i.test((err as Error).message);
    },
  });
}
```

The `shouldRetry` predicate matches the normalized error message shape from the existing inner catch (lines 95-98: `throw new Error(\`scrapeJsRender ${firm.id}: playwright-timeout waiting for ${firm.wait_for}\`)`). This is tight-coupled by design — the D-10 error message shapes are documented in the file header as the classifier contract.

Do NOT change WAIT_TIMEOUT_MS or GOTO_TIMEOUT_MS. Do NOT add sleep between retries (p-retry default delay is fine for a 1-retry case; the total wall-clock impact is bounded by the existing 30s timeout budget × 2 = 60s max, which is within GHA step budget). Do NOT touch fetch.ts, enrichBody.ts, or runDaily.ts.

In test/scrapers/jsRender.test.ts, add a new `describe('scrapeJsRender — p-retry behavior')` block:

- For the "retry succeeds" test: create a mock where `goto` rejects with the playwright-timeout message on the first call, then resolves normally on the second; assert items returned with no error.
- For the "retry exhausted" test: create a mock where `goto` always rejects with playwright-timeout; assert the error propagates.
- For the "no-retry on selector-miss" test: create a mock where `waitForSelector` resolves but `content` returns empty-list HTML; assert the error propagates immediately (mock call count = 1, not 2).
- For the "no-retry on browser-launch-fail" test: create a mock where `goto` rejects with `chromium executable not found`; assert error propagates immediately (mock call count = 1).

NOTE on mock call counting for retry tests: the `goto` mock records calls per invocation. After a retry, `browser.newContext` is called again because `scrapeOnce` creates a new context each time. So count `browser.newContext` calls (not `page.goto` calls) to assert whether a retry happened — `newContext` will be called 2× on a retry, 1× on no-retry. Mirror the existing `makeMockBrowser` helper to build retry-scenario mocks.
  </action>
  <verify>
    <automated>pnpm test -- --reporter=verbose test/scrapers/jsRender.test.ts 2>&1 | grep -E "PASS|FAIL|p-retry"</automated>
  </verify>
  <done>
    - scrapeJsRender wraps scrapeOnce with pRetry({ retries: 1, shouldRetry: playwright-timeout only })
    - Retry test: transient timeout → second call succeeds → items returned
    - No-retry tests: selector-miss and browser-launch-fail do not retry
    - Exhaustion test: persistent playwright-timeout still propagates error → run still returns exit 1
    - All 8 existing jsRender.test.ts tests still pass
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify full suite is green</name>
  <files></files>
  <action>
Run the full vitest suite to confirm no regressions. Do not modify any files in this task.

If any test outside test/main.test.ts or test/scrapers/jsRender.test.ts fails, investigate before proceeding — it is a regression from Task 1 or Task 2.
  </action>
  <verify>
    <automated>pnpm test 2>&1 | tail -20</automated>
  </verify>
  <done>All 495+ tests pass (the count may be slightly higher due to the new tests added in Tasks 1 and 2).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stderr → GHA log | scrubbed error messages cross into the public run log and auto-issue body |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260612-01 | Information Disclosure | emitJsRenderFatalLines stderr output | mitigate | Apply scrubSecrets() on error.message before emitting — already scrubbed once at fetch.ts catch site; apply again as defense-in-depth on the composite string |
| T-260612-02 | Denial of Service | p-retry in scrapeJsRender | accept | retries: 1 only; shouldRetry is strictly scoped to playwright-timeout string match; no exponential backoff delay added (single retry, no sleep); total extra wall-clock is bounded by one additional 30s timeout window |
</threat_model>

<verification>
- `pnpm test` passes (all existing + new tests green)
- `pnpm tsx src/main.ts --mode=daily 2>&1` produces `[js-render-fail] firm=... error=...` lines on a real failing run (manual smoke test optional — covered by unit test)
- scrapeJsRender import in jsRender.ts uses `p-retry` (already in pnpm-lock.yaml)
- No new `DRY_RUN` check sites introduced outside the 5 sanctioned sites documented in main.ts header
- No imports added to runDaily.ts (D-01 forbidden-import contract preserved)
</verification>

<success_criteria>
- Per-firm id + scrubbed error message appears on stderr at the FATAL site (observable in GHA run log without needing Step Summary tab)
- A single playwright-timeout is retried once; if the retry succeeds, the run returns 0; if it fails, jsRenderFailures is still incremented and the run returns 1
- pnpm test passes with ≥ 495 tests
</success_criteria>

<output>
After completion, create `.planning/quick/260612-lbt-js-render-firm-failure-observability-fla/260612-lbt-SUMMARY.md`
</output>
