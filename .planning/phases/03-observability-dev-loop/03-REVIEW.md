---
phase: 03-observability-dev-loop
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .github/workflows/daily.yml
  - package.json
  - README.md
  - src/archive/writer.ts
  - src/cli/checkFirm.ts
  - src/compose/digest.ts
  - src/compose/templates.ts
  - src/main.ts
  - src/observability/recorder.ts
  - src/observability/staleness.ts
  - src/observability/summary.ts
  - src/pipeline/fetch.ts
  - src/pipeline/run.ts
  - src/state/writer.ts
  - src/types.ts
  - test/archive/writer.test.ts
  - test/compose/digest.test.ts
  - test/observability/recorder.test.ts
  - test/observability/staleness.test.ts
  - test/observability/summary.test.ts
  - test/pipeline/fetch.test.ts
  - test/pipeline/run.test.ts
  - test/state/writer.test.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 3 adds observability (`Recorder`, `writeStepSummary`, `detectStaleness`,
`writeArchive`) and extracts `runPipeline` as the composition root consumed by
both the cron entrypoint (`src/main.ts`) and the dev CLI (`src/cli/checkFirm.ts`).

Overall quality is high: the code is heavily commented with load-bearing
invariants, pure-function boundaries are respected, the Pattern-2 DRY_RUN
containment (three sanctioned sites) is preserved, and the test suite covers
edge cases that typically bite staleness/archive logic (KST boundary, D-02
bootstrap grace, Pitfall 9 no-retrofit, same-day overwrite, step-summary
never-throws).

No critical security or correctness issues found. Three warnings concern
temporal-consistency (clock injection plumbing through `runPipeline`),
defensive argument parsing in the CLI, and an unhandled-rejection risk on
`checkFirm`'s `main().then()`. Five info-level items cover minor polish and
portability concerns in tests.

## Warnings

### WR-01: `runPipeline` uses separate `new Date()` for staleness vs. archive — KST midnight skew risk

**File:** `src/pipeline/run.ts:148`, `src/pipeline/run.ts:264`
**Issue:** `detectStaleness(seen, allFirms)` defaults its `now` argument to
`new Date()`, and `writeArchive(payload.html)` similarly defaults its `now`.
Both functions accept an injectable clock (good), but `runPipeline` does not
capture a single `now` at the top of the run and thread it through. If a run
straddles KST midnight (a real concern because pLimit+Gemini calls can take
minutes and `compose` runs later still), these three timestamps can disagree:

1. `detectStaleness` — uses wall clock at step 4.
2. `composeDigest` — uses wall clock at step 10 (`dateKst` in subject + `<h1>`).
3. `writeArchive` — uses wall clock at step 13 (archive filename `YYYY/MM-DD.html`).

The worst case is a run that starts at 23:59 KST and finishes at 00:01 KST.
The digest email header says "2026-04-18" but the archive file lands at
`archive/2026/04-19.html`, creating a mismatch between email content and
archived filename (and an orphan `04-18.html` is never produced).

**Fix:** Capture one `now` at the top of `runPipeline` and thread it through:

```typescript
export async function runPipeline(options: RunOptions = {}): Promise<RunReport> {
  const now = new Date();
  // ...
  const warnings = detectStaleness(seen, allFirms, now);
  // ...
  const payload = composeDigest(summarized, recipient, fromAddr, warnings, now);
  // ...
  const archivePath = await writeArchive(payload.html, now);
}
```

This requires `composeDigest`'s `now` parameter (already exists — `src/compose/digest.ts:33`)
and `writeArchive`'s `now` parameter (already exists — `src/archive/writer.ts:49`)
to be plumbed. No signature changes needed; just pass the captured `now`.

### WR-02: `checkFirm.ts` `main()` call lacks `.catch()` — unhandled rejection if `loadFirms` throws

**File:** `src/cli/checkFirm.ts:83`
**Issue:** `main().then((code) => process.exit(code))` has no `.catch()`. Inside
`main()`, the `await loadFirms()` call on line 54 is NOT inside the try/catch
(only the `runPipeline` call is). If `loadFirms` throws (e.g., `config/firms.yaml`
has a `ZodError`), the rejection escapes `main()`. Node's default unhandled-rejection
behavior in Node 22 LTS is to terminate with exit code 1 and log the stack, which
is tolerable, but the specific DX goal of check:firm — "clear error listing
valid ids" — is defeated: the user sees a raw zod stack instead of the friendly
error the main.ts catch would produce.

By contrast, `src/main.ts:73` follows the same `main().then(...)` pattern but
safely because its top-level try/catch wraps the ONLY awaited call (`runPipeline`).

**Fix:** Wrap the `await loadFirms()` in the existing try/catch, or add a top-level `.catch()`:

```typescript
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[check:firm] error: ${(err as Error).message}`);
    process.exit(1);
  });
```

Or move the `loadFirms` call inside the try block:

```typescript
async function main(): Promise<number> {
  const { firmId, saveHtmlPath } = parseArgs(process.argv);
  try {
    const firms = await loadFirms();
    const match = firms.find((f) => f.id === firmId);
    if (!match) { /* ... */ return 1; }
    // ... rest as before
  } catch (err) {
    console.error(`[check:firm] error: ${(err as Error).message}`);
    return 1;
  }
}
```

### WR-03: `parseArgs` accepts `--save-html` without a value and silently uses `undefined` or next flag as the path

**File:** `src/cli/checkFirm.ts:34-39`
**Issue:** The loop increments `i` unconditionally after consuming `args[i + 1]`
as `saveHtmlPath` without validating that the next argument exists or is not
itself another flag:

```typescript
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--save-html') {
    saveHtmlPath = args[i + 1];  // could be undefined or another --flag
    i++;
  }
}
```

Two failure modes:
- `pnpm check:firm cooley --save-html` → `saveHtmlPath = undefined`. Downstream
  in `runPipeline` this is fine (no write happens), but the CLI silently ignored
  the user's intent to save HTML.
- `pnpm check:firm cooley --save-html --debug` → `saveHtmlPath = '--debug'`, and
  `writeFile('--debug', payload.html)` creates a literal file named `--debug`
  in the cwd.

**Fix:** Validate before assignment:

```typescript
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--save-html') {
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      console.error('--save-html requires a file path argument');
      process.exit(2);
    }
    saveHtmlPath = next;
    i++;
  }
}
```

## Info

### IN-01: `detectStaleness` silently ignores malformed `enabledAt`/`lastNewAt` via `isNaN(Date.parse(...))`

**File:** `src/observability/staleness.ts:65`, `src/observability/staleness.ts:71-75`, `src/observability/staleness.ts:87-90`
**Issue:** When `Date.parse(seenFirm.enabledAt)` returns `NaN` (malformed
ISO string), the guard `if (!isNaN(enabledAtMs) && ...)` skips the grace-period
check entirely and falls through to the normal lastNewAt flow. Similarly for
`lastNewAt` and `lastUpdated`, a NaN parse silently drops the warning. A
corrupted state file (hand-edited or migration bug) would produce incorrect
staleness warnings without any indication of the underlying problem.

Given that `readState` is fail-loud on JSON parse errors but accepts any
string for `enabledAt` (schema is `string | undefined`), a malformed date
in the state file is silently tolerated here.

**Fix:** Log a warn when an expected ISO string fails `Date.parse`, or rely
on an upstream zod schema at `readState` to validate ISO format. Low priority
since state is machine-written (only hand-edits would produce this), but
worth a `console.warn` for observability:

```typescript
if (seenFirm.enabledAt) {
  const enabledAtMs = Date.parse(seenFirm.enabledAt);
  if (isNaN(enabledAtMs)) {
    console.warn(`[staleness] malformed enabledAt for ${firm.id}: ${seenFirm.enabledAt}`);
  } else if (nowMs - enabledAtMs < STALE_FIRM_THRESHOLD_MS) {
    continue;
  }
}
```

### IN-02: `Recorder.firm()` closure pattern captures `existing` and uses non-null assertion

**File:** `src/observability/recorder.ts:67-92`
**Issue:** The fluent builder pattern relies on a closure-captured `existing`
reference plus the `existing!` non-null assertion inside each method. This
works correctly (the `this.metrics.set` call guarantees the value is present),
but the non-null assertion is brittle to future refactors — if someone later
adds a code path that clears `this.metrics` mid-chain, the assertion becomes
unsound without a type error.

**Fix:** Use the firmId to re-lookup on each call (slightly slower but safer),
or capture the Map entry directly:

```typescript
firm(firmId: string): FirmRecorder {
  if (!this.metrics.has(firmId)) {
    this.metrics.set(firmId, defaultMetrics());
  }
  const entry = this.metrics.get(firmId)!;  // single assertion, not per-method
  const handle: FirmRecorder = {
    fetched: (n) => { entry.fetched = n; return handle; },
    // ...
  };
  return handle;
}
```

### IN-03: `archive/writer.ts` comment claims "atomic-ish" but uses plain writeFile

**File:** `src/archive/writer.ts:38-40`, `src/archive/writer.ts:73`
**Issue:** The header comment says "ATOMIC-ISH — single writeFile, not a
writeFile+rename dance." Using plain `writeFile` is NOT atomic on POSIX — a
crash mid-write leaves a partial file. The comment acknowledges this is a
deliberate trade-off (archive is less critical than state), so the naming
"atomic-ish" is misleading. Consider either making it truly atomic (mirror
`state/writer.ts`'s tmp+rename) or renaming the comment block to "NOT ATOMIC"
for clarity.

**Fix:** Rename the comment section and state the trade-off plainly:

```
//   5. NON-ATOMIC (deliberate) — single writeFile, not a writeFile+rename
//      dance. The archive is less critical than state/seen.json (losing a
//      mid-write archive means we lose that day's HTML sidecar; the seen-set
//      and sent email remain correct). Simpler semantics, fewer failure
//      modes, acceptable risk.
```

### IN-04: `runPipeline` recorder mutation after dedup overwrites for errored firms

**File:** `src/pipeline/run.ts:182-184`
**Issue:** The loop `for (const r of deduped) { recorder.firm(r.firm.id).newCount(r.new.length); }`
runs for every firm including errored ones. For an errored firm, `r.new.length === 0`
so newCount gets set to 0 — this is correct, but it means an errored firm's
row in the markdown table reads `new=0` next to `errorClass='http-503'`, which
is accurate but somewhat redundant. Not a bug.

More notably, this loop does NOT skip errored firms, which is slightly wasteful
but has no observable effect (Recorder semantics are "replace," not "accumulate").

**Fix:** Optional micro-optimization — skip errored firms:

```typescript
for (const r of deduped) {
  if (r.error) continue;
  recorder.firm(r.firm.id).newCount(r.new.length);
}
```

### IN-05: Tests in `test/state/writer.test.ts` use hardcoded `/tmp/` paths — not portable

**File:** `test/state/writer.test.ts:272`, `test/state/writer.test.ts:304`, `test/state/writer.test.ts:335`, `test/state/writer.test.ts:392`, `test/state/writer.test.ts:447`
**Issue:** The new Phase 3 D-02 `enabledAt` tests use `/tmp/seen-test-${Date.now()}-*.json`
directly, hardcoded to POSIX. The earlier tests in the same file use the
`TMP = 'test/tmp-state.json'` convention relative to cwd. The hardcoded paths
work on CI (ubuntu-latest per `.github/workflows/daily.yml:43`) and on macOS
(the developer's platform per CLAUDE.md), but would fail on Windows. Since this
project's `Execution` is locked to GitHub Actions ubuntu runners this is fine,
but using `os.tmpdir()` + `mkdtemp` (as `test/archive/writer.test.ts` and
`test/observability/summary.test.ts` already do) would be cleaner and consistent.

**Fix:** Match the `mkdtemp` pattern used by the Phase 3 archive/summary tests:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'writer-test-'));
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// In tests:
const path = join(tempDir, 'seen.json');
```

---

_Reviewed: 2026-04-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
