---
phase: 01-foundation-vertical-slice
plan: 10
subsystem: state
tags: [state, dedup, dry-run, newest-first-cap, bootstrap, atomic-write, b1, d-09]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: src/types.ts (SeenState, FirmResult) — plan 01-03
  - phase: 01-foundation-vertical-slice
    provides: src/env.ts (isDryRun) — plan 01-03
  - phase: 01-foundation-vertical-slice
    provides: src/scrapers/util.ts (canonicalizeUrl) — plan 01-04 (URLs already canonical at writer input)
provides:
  - "src/state/reader.ts: readState(path?) → SeenState with ENOENT default + DEDUP-07 version guard"
  - "src/state/writer.ts: writeState(prior, results, path?) → void — 500-cap + DRY_RUN gate + atomic tmp+rename + B1 bootstrap seeding from r.raw"
  - "state/seen.json: initial empty scaffold committed for cold-start visibility"
  - "test/state/writer.test.ts: 5-assertion vitest suite pinning 500-cap/DRY_RUN/error-pass-through/bootstrap-B1/absent-firm-pass-through"
affects: [01-11, 01-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic-ish write via tmp+rename — POSIX rename atomicity means a mid-write crash leaves either the old file intact or the new file fully materialized, never a partial JSON blob that would trip reader's fail-loud parse"
    - "Pattern 2 DRY_RUN — check site #2 of 2 sanctioned locations (sibling: src/mailer/gmail.ts site #1). Merge arithmetic runs regardless; only the disk write is skipped. Composes with main.ts so a full DRY_RUN pipeline exercises all logic and logs the intended state"
    - "B1 bootstrap invariant — prior.firms[id] undefined → seed urls from r.raw (not r.summarized), since main.ts skips summarization when dedup returned new:[]. Seeding from r.summarized would leave urls:[] and run 2 would flood the back-catalog (exactly D-09's failure mode)"
    - "Newest-first 500-cap — merge order is [...newUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM), so oldest entries drop first. Same pattern applied to bootstrap seed (r.raw is newest-first from RSS)"
    - "ENOENT-only silent fallback — reader recovers only from missing-file. Bad JSON, permission errors, version drift all propagate so corruption becomes a red-X workflow, not a silent state reset that would re-emit the entire back-catalog"
    - "Firm-level passthrough via { ...prior.firms } spread — firms absent from the current run (disabled in YAML) keep their prior state untouched, and firms with r.error keep prior urls untouched too (no continue-without-spread would drop them)"

key-files:
  created:
    - src/state/reader.ts
    - src/state/writer.ts
    - state/seen.json
    - test/state/writer.test.ts
  modified: []
  removed: []

key-decisions:
  - "Bootstrap branch seeds from r.raw, not r.summarized — the B1 cross-plan contract with plan 07 dedup. Without this, run 2 would see seen.firms[id].urls = [] and mark every current item as new, flooding the recipient with the entire back-catalog on the second run (D-09 failure mode)."
  - "Version guard is a throw, not a silent reset — DEDUP-07 reserves the right to change schema in a future phase. Throwing on mismatch means a future v2 migration will be detected immediately; silently falling back to DEFAULT would misinterpret v2 as v1 and corrupt dedup."
  - "State scaffold committed even though reader handles ENOENT equivalently — this is operator ergonomics, not functional requirement. A freshly-cloned repo has a visible state file so a human investigating 'where's the dedup data?' finds the structure immediately."
  - "Atomic write via tmp+rename is same-filesystem — JSON file + `.tmp` file live in the same `state/` directory, so rename is atomic on POSIX and atomic-ish on Windows GHA runners (which we don't target anyway since workflows run ubuntu-latest)."
  - "Five assertions, not six — plan 10 acceptance says exactly five it(...) blocks covering 500-cap/DRY_RUN/error/bootstrap/absent-firm. Did not add a no-mutation test like plan 07's dedup suite because writer INTENDS to construct a fresh nextFirms (spread), so mutation-invariance is a trivial byproduct not worth an extra test."
  - "isDryRun() call-sites in src/ now = 2 (gmail.ts + writer.ts), matching the plan 09 SUMMARY prediction. env.ts remains the sole definition. This is the final DRY_RUN topology for Phase 1."

patterns-established:
  - "State boundary pattern — any persistent run state lives under src/state/ as a reader/writer pair. Reader handles ENOENT cold-start; writer handles atomic update + DRY_RUN gate. Any future state file (e.g. delivery log, per-firm health tracking) follows the same shape"
  - "DRY_RUN check site discipline — exactly two sites in Phase 1 (mailer + state writer). Any future DRY_RUN check site requires a plan that explicitly calls out the location, preventing DRY_RUN from quietly silencing code paths no one meant to gate"

requirements-completed:
  - DEDUP-04
  - DEDUP-06
  - DEDUP-07
  - OPS-06

# Metrics
duration: ~3 min
completed: 2026-04-17
---

# Phase 01 Plan 10: State Reader + Writer + Initial Scaffold Summary

**State persistence boundary lands as a reader/writer pair with DEDUP-04 500-cap, DEDUP-07 version guard, OPS-06 DRY_RUN check site #2, and the B1 bootstrap seeding invariant that prevents D-09's back-catalog flood on run 2. Five-assertion vitest suite green; all 34 tests pass; typecheck clean; isDryRun() call-site count = 2 (gmail + writer) matching plan 09's prediction.**

## Performance

- **Duration:** ~3 min (153 seconds wall-clock from plan start to SUMMARY creation)
- **Started:** 2026-04-17T15:38:25Z
- **Completed:** 2026-04-17T15:41:00Z (approx)
- **Tasks:** 4 (reader + writer + scaffold + tests)
- **Files created:** 4 (`src/state/reader.ts`, `src/state/writer.ts`, `state/seen.json`, `test/state/writer.test.ts`)
- **Commits:** 4 task commits (one per file)

## Accomplishments

- `src/state/reader.ts` (38 LoC incl. 24-line header) — `readState(path?)` with ENOENT fallback to DEFAULT and `parsed.version !== 1` throw. Bad JSON, permission errors, and other I/O failures propagate (fail-loud; silent reset would corrupt dedup).
- `src/state/writer.ts` (110 LoC incl. 34-line header) — `writeState(prior, results, path?)`:
  1. Spreads `{ ...prior.firms }` so firms absent from current results pass through untouched.
  2. Skips `r.error` firms (preserve prior on fetch fail).
  3. **Bootstrap branch** (`!priorFirm`): seeds `urls` from `r.raw.map(x => x.url).slice(0, MAX_PER_FIRM)`, `lastNewAt` from newest r.raw publishedAt or null. This is the B1 fix — main.ts skips summarization on bootstrap so r.summarized is [], but r.raw contains the full catalog we must seed to prevent run-2 back-catalog flood.
  4. **Subsequent-run branch** (`priorFirm` exists): merges newUrls from r.summarized with existing prior urls, newest-first, 500-cap. lastNewAt takes the newest summarized publishedAt if any new items, else preserves prior.
  5. **DRY_RUN check site #2**: logs `[DRY_RUN] would write … with N URLs across M firms` and returns; no disk write.
  6. **Atomic write**: writeFile → `${path}.tmp`, rename → `path`. POSIX rename atomicity.
- `state/seen.json` scaffold committed at repo root — `{version:1, lastUpdated:null, firms:{}}` with trailing newline. Cold-start ergonomics; reader's ENOENT fallback handles the same case functionally.
- `test/state/writer.test.ts` (211 LoC) — five `it(...)` blocks pinning:
  1. **(a) 500-cap newest-first** — 501 prior urls + 1 new summarized → kept 500, newest at [0] (`https://cooley.com/newest`), oldest (`/p500`) dropped.
  2. **(b) DRY_RUN short-circuit** — DRY_RUN=1, expect neither `TMP` nor `TMP.tmp` to exist post-call.
  3. **(c) r.error pass-through** — prior `urls` and `lastNewAt` unchanged.
  4. **(d) B1 bootstrap** — prior.firms empty, r.raw has 3 items → urls seeded as `['/a','/b','/c']`, lastNewAt = `r.raw[0].publishedAt`.
  5. **(e) firms absent pass-through** — latham in prior, cooley in current run → latham passes through; cooley with zero new items keeps prior urls.
- **All 34 tests green** — 29 from prior plans + 5 new from this plan. Duration 524ms.
- **`pnpm typecheck`** exits 0.

## Files Created

### src/state/reader.ts (38 lines)

One export: `readState(path?: string): Promise<SeenState>`.

Two imports:
- `readFile` from `node:fs/promises` (only the read half of the fs API — writer is the sibling with the write half).
- `type { SeenState }` from `../types.js` (canonical contract from plan 03, not redeclared).

One internal const: `DEFAULT: SeenState = { version: 1, lastUpdated: null, firms: {} }`.

Behavior:
- ENOENT → return DEFAULT.
- Parse success + version === 1 → return parsed.
- Parse success + version !== 1 → throw with version echoed in message.
- Any other error (bad JSON, EACCES) → rethrow.

### src/state/writer.ts (110 lines)

One export: `writeState(prior, results, path?): Promise<void>`.

Three imports:
- `{ writeFile, rename }` from `node:fs/promises` (the atomic-write duo).
- `{ isDryRun }` from `../env.js` (the DRY_RUN check site #2 — site #1 is src/mailer/gmail.ts).
- `type { SeenState, FirmResult }` from `../types.js`.

One internal const: `MAX_PER_FIRM = 500` (DEDUP-04).

### state/seen.json (5 lines)

```json
{
  "version": 1,
  "lastUpdated": null,
  "firms": {}
}
```

Exact content; trailing newline for clean git diffs.

### test/state/writer.test.ts (211 lines)

Single `describe('writeState')` block with five `it(...)` assertions. Fixtures: `cooley: FirmConfig` minimum valid firm; `TMP = 'test/tmp-state.json'` scratch path; `readJson(p)` helper. beforeEach/afterEach cleanup of TMP and TMP.tmp, plus `delete process.env.DRY_RUN`.

## Task Commits

| Task | Hash | Message |
|------|------|---------|
| 1: src/state/reader.ts | `626fc04` | feat(01-10): add src/state/reader.ts with ENOENT fallback + version guard |
| 2: src/state/writer.ts | `4136ed2` | feat(01-10): add src/state/writer.ts with DRY_RUN gate + 500-cap + B1 bootstrap |
| 3: state/seen.json scaffold | `7424e7d` | chore(01-10): add initial state/seen.json scaffold |
| 4: test/state/writer.test.ts | `e2329aa` | test(01-10): add writer.test.ts pinning 500-cap, DRY_RUN, bootstrap, pass-through |

## Decisions Made

See frontmatter `key-decisions` for the full list. Highlights:

1. **Bootstrap seeds from r.raw, not r.summarized** — B1 cross-plan contract with plan 07 dedup and plan 11 main.ts. Regression-guarded by test (d).
2. **Version guard throws, doesn't silently reset** — DEDUP-07 future migration safety.
3. **State scaffold committed for operator ergonomics** — reader's ENOENT path handles the same case functionally; scaffold is purely discovery-aid.
4. **Atomic tmp+rename on same filesystem** — state/ directory co-located with state/.tmp guarantees POSIX rename atomicity.
5. **Five test assertions, not six** — no mutation test added (unlike plan 07 dedup) because writer INTENDS construction of fresh nextFirms via spread; mutation-immunity is a byproduct, not an invariant worth an extra test.
6. **isDryRun() call-site count confirmed at 2** — gmail.ts + writer.ts; env.ts stays as sole definition. Matches plan 09 SUMMARY's "3 sites total after 09+10" prediction (counting definition + 2 consumers).

## Deviations from Plan

**None of the Rule 1-3 deviation categories fired.** The implementation came verbatim from the plan's `<interfaces>` block. No bugs, no missing critical functionality, no blocking issues. Zero auto-fixes applied.

One plan-internal micro-choice worth recording: the Task 2 plan verification grep for `!priorFirm\\|prior.firms\\[r.firm.id\\]` accepted either form. The implementation uses `if (!priorFirm)` (the cleaner of the two alternatives) after hoisting `const priorFirm = prior.firms[r.firm.id]`. This is in-spec.

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `pnpm typecheck` clean | PASS — `tsc --noEmit` exits 0 |
| `pnpm test` green (writer.test.ts + all prior plans) | PASS — 34/34 tests pass in 524ms |
| state/seen.json parses as valid JSON with correct version | PASS — `{"version":1,"lastUpdated":null,"firms":{}}` |
| `isDryRun` imported in exactly mailer/gmail.ts + state/writer.ts (+ env.ts definition) | PASS — `grep -rn "isDryRun" src/` shows 3 files: env.ts (def), mailer/gmail.ts (import+call+comment), state/writer.ts (import+call) |
| `fs/promises` is the only filesystem API used in writer (no sync, no fs-extra) | PASS — `writer.ts` imports `{ writeFile, rename } from 'node:fs/promises'` only |
| Bootstrap branch references `r.raw.map` (not `r.summarized.map`) | PASS — `grep -c "r.raw.map" src/state/writer.ts` = 1 (in bootstrap branch) |

## Success Criteria

| Criterion | Status |
|-----------|--------|
| DEDUP-04 500-cap per firm, newest-first (bootstrap and subsequent) | PASS — tests (a) and (d) lock this |
| DEDUP-06 state written exactly once per run (plan 12 GHA commits it back) | PASS — writer is the only state-write site; called once from main.ts per plan 11 |
| DEDUP-07 version field enforced | PASS — reader throws on version !== 1; writer writes `version: 1` literally |
| OPS-06 DRY_RUN check site #2 | PASS — `isDryRun()` call at line 95 of writer.ts; writer is the 2nd of 2 sanctioned sites |
| COMP-05 body never persisted | PASS — writer stores only `.url` per item; r.raw items contribute only `.url` + `.publishedAt` (no title, no description, no body) |
| D-09 bootstrap honored by seeding urls from r.raw (B1) | PASS — test (d) asserts `urls === ['/a','/b','/c']` with empty r.summarized |

## Acceptance Criteria Per Task

### Task 1 (reader.ts)
| Criterion | Result |
|-----------|--------|
| File exists; exports `readState` | PASS |
| Default parameter `path = 'state/seen.json'` | PASS |
| Returns DEFAULT SeenState on ENOENT | PASS |
| Throws when `parsed.version !== 1` | PASS |
| Does NOT silently recover from non-ENOENT errors | PASS |
| `pnpm typecheck` exits 0 | PASS |

### Task 2 (writer.ts)
| Criterion | Result |
|-----------|--------|
| File exists; exports `writeState(prior, results, path?)` | PASS |
| Contains `MAX_PER_FIRM = 500` literal | PASS |
| DRY_RUN check is gate #2 (BEFORE writeFile) | PASS — isDryRun at line 95, writeFile at line 108 |
| Uses `writeFile` to `.tmp` then `rename` to final | PASS — lines 107-109 |
| Contains `JSON.stringify(next, null, 2)` | PASS — line 108 |
| Skips firms with `r.error` | PASS — line 55 `if (r.error) continue;` |
| Bootstrap seeds from `r.raw` (literal `r.raw.map`) | PASS — line 67 |
| Explicit `!priorFirm` bootstrap branch | PASS — line 63 |
| `slice(0, MAX_PER_FIRM)` applied to bootstrap seed | PASS — line 67 |
| Zero-summarized firms keep prior state | PASS — subsequent branch preserves `priorFirm.lastNewAt` when newUrls.length === 0 |
| `pnpm typecheck` exits 0 | PASS |

### Task 3 (state/seen.json scaffold)
| Criterion | Result |
|-----------|--------|
| File exists at `state/seen.json` | PASS |
| Parses as valid JSON | PASS |
| `version` field equals literal integer 1 | PASS |
| `lastUpdated` field equals literal `null` | PASS |
| `firms` field is empty object `{}` | PASS |
| Ends with trailing newline | PASS |

### Task 4 (writer.test.ts)
| Criterion | Result |
|-----------|--------|
| Test file exists at `test/state/writer.test.ts` | PASS |
| Contains `describe('writeState'` | PASS |
| Five test blocks (a)–(e) | PASS |
| Test (d) asserts `urls.length === 3` AND `urls[0] === 'https://cooley.com/a'` | PASS |
| Test (b) asserts `existsSync(TMP) === false` post-write | PASS |
| `pnpm test` exits 0 | PASS |

## Threat Model Mitigations Applied

Per plan's `<threat_model>`:

| Threat ID | Mitigation | Verified By |
|-----------|------------|-------------|
| T-10-01 Tampering (corrupted state) | Version guard throws; atomic tmp+rename prevents partial-write; JSON parse failure propagates (not silently reset) | Reader lines 29-34; writer lines 107-109 |
| T-10-02 DoS (unbounded state growth) | `MAX_PER_FIRM = 500` cap applied to both bootstrap seed and subsequent merge | Test (a) 500-cap assertion; bootstrap branch `slice(0, MAX_PER_FIRM)` at line 67 |
| T-10-03 Repudiation (DRY_RUN writes accidentally) | `isDryRun()` check at exact point between merge computation and disk write (line 95); Pattern 2 sanctioned site #2 | Test (b) asserts neither TMP nor TMP.tmp exists post-call |
| T-10-04 Tampering (concurrent write race) | Atomic rename (same filesystem); plan 12 GHA `concurrency:` will serialize workflow-level | POSIX rename atomicity guaranteed by tmp → path rename |
| T-10-05 Info Disclosure (state in public repo) | ACCEPT — repo is private in Phase 1; state is URL+timestamp only, no secret | COMP-04 repo privacy |
| T-10-06 Info Disclosure (body persistence) | Writer stores only `.url` per item; bootstrap stores only `.url` from r.raw (never `.title`/`.description`) | Type-level: SeenState.firms[id].urls is `string[]`; writer's r.raw.map pulls only `x.url` |
| T-10-07 Repudiation (bootstrap fails → run 2 flood) | Bootstrap seeds from r.raw; regression-guarded by test (d) | Test (d) asserts exact seeded URL list and lastNewAt |

## Known Stubs

**None.** No TODO/FIXME markers, no placeholder empty-data components, no "coming soon" strings. The `firms: {}` in the scaffold is not a stub — it is the specified initial state per D-09 (runs accumulate state lazily as firms are first scraped).

## Threat Flags

No new threat surface beyond what the plan's threat model already covers. No new network endpoints, no new auth paths, no new file access patterns outside `state/seen.json` (the one file this plan's writer touches).

## Next Phase Readiness

Plan 11 (main.ts orchestrator) can now:

- `import { readState } from './state/reader.js'` at the top of main() — returns DEFAULT on first run, throws on corruption.
- `import { writeState } from './state/writer.js'` at the bottom of main() — called AFTER sendMail resolves (or after DRY_RUN short-circuit in the mailer).
- Assume `readState()` never returns undefined; cold-start is handled by the DEFAULT fallback.
- Assume `writeState(seen, results)` handles DRY_RUN internally; main.ts does not need to skip the call itself.
- Rely on atomic-ish write: if main.ts crashes between writeFile and rename, the old state file is intact.

Plan 12 (GHA workflow) can now:

- Commit `state/seen.json` back to the repo via `stefanzweifel/git-auto-commit-action@v6` — file exists in the repo from the scaffold commit (`7424e7d`).
- Rely on file existing in tree from day 1 — no `ensure directory exists` step needed in the workflow.

## Self-Check: PASSED

- `src/state/reader.ts` exists on disk (38 lines; verified: `FOUND: src/state/reader.ts`).
- `src/state/writer.ts` exists on disk (110 lines; verified: `FOUND: src/state/writer.ts`).
- `state/seen.json` exists on disk and parses as JSON with version === 1.
- `test/state/writer.test.ts` exists on disk (211 lines).
- All four task commits (`626fc04`, `4136ed2`, `7424e7d`, `e2329aa`) present in `git log --oneline`.
- `pnpm test` exits 0 with 34/34 tests passing.
- `pnpm typecheck` exits 0.
- `grep -rn "isDryRun()" src/` = 2 call sites (mailer/gmail.ts + state/writer.ts) — matches success criterion.
- `grep -c "r.raw.map" src/state/writer.ts` = 1 (B1 bootstrap gate present).
- `grep -rn "\.tmp" src/` returns only the atomic-write site in writer.ts (plus one header comment line — documentation of the same pattern).

---
*Phase: 01-foundation-vertical-slice*
*Plan: 10*
*Completed: 2026-04-17*
