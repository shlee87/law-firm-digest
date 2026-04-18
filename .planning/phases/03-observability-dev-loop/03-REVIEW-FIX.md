---
phase: 03-observability-dev-loop
fixed_at: 2026-04-18T00:00:00Z
review_path: .planning/phases/03-observability-dev-loop/03-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-04-18T00:00:00Z
**Source review:** `.planning/phases/03-observability-dev-loop/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (critical + warning only; 5 info-level findings deferred)
- Fixed: 3
- Skipped: 0

Baseline verification before fixes: `pnpm typecheck` clean, `pnpm test` 202/202 passing.
After each fix: both gates re-run and stayed green (202/202) before committing.

## Fixed Issues

### WR-01: `runPipeline` uses separate `new Date()` for staleness vs. archive — KST midnight skew risk

**Files modified:** `src/pipeline/run.ts`
**Commit:** 1bbafb3
**Applied fix:** Captured a single `const now = new Date()` at the top of
`runPipeline` (immediately after options destructuring) and threaded it
through the three downstream consumers that already accept an injectable
clock: `detectStaleness(seen, allFirms, now)`, `composeDigest(..., warnings, now)`,
and `writeArchive(payload.html, now)`. Added an explanatory header comment
tying the change to the 23:59/00:01 KST straddle scenario so future
refactors do not re-split the timestamp sources. No signature changes
to the downstream functions; their `now: Date = new Date()` defaults
remain for production fall-through and test injection.

### WR-02: `checkFirm.ts` `main()` call lacks `.catch()` — unhandled rejection if `loadFirms` throws

**Files modified:** `src/cli/checkFirm.ts`
**Commit:** 83951eb
**Applied fix:** Moved `await loadFirms()` and the firm-match block inside
the existing `try` block so a ZodError from malformed `config/firms.yaml`
is caught by the same `catch (err)` that already produces the friendly
`[check:firm] error: <message>` output. Additionally added a top-level
`.catch()` on the `main()` promise chain as belt-and-suspenders: any
future refactor that moves an await outside the inner try block (or a
synchronous throw that escapes the inner catch) will still emit the
formatted error and exit 1, instead of producing Node 22's raw
unhandled-rejection stack. Both changes carry inline WR-02 comments
explaining the DX invariant.

### WR-03: `parseArgs` accepts `--save-html` without a value and silently uses `undefined` or next flag as the path

**Files modified:** `src/cli/checkFirm.ts`
**Commit:** b3fb81c
**Applied fix:** Before assigning `saveHtmlPath = args[i + 1]`, check that
the next arg exists and does not start with `--`. If either condition
fails, print `--save-html requires a file path argument` to stderr and
`process.exit(2)` (matching the existing exit-code-2 usage-error convention
documented in the file header). Closes both footgun modes called out in
the review: trailing `--save-html` with no value (silent no-op) and
`--save-html --debug` (literal file named `--debug` written to cwd).
Comment block enumerates both failure modes for future readers.

## Skipped Issues

None — all three in-scope findings were fixed cleanly.

---

_Fixed: 2026-04-18T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
