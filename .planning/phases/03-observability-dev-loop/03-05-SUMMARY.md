---
phase: 03-observability-dev-loop
plan: 05
subsystem: pipeline
tags: [runPipeline, check-firm, cli, recorder, staleness, archive, workflow, readme, D-17]

requires:
  - phase: 03-observability-dev-loop
    provides: "SeenState.enabledAt field (03-01), writeState bootstrap seeding (03-01), classifyError exported (03-01), Recorder + writeStepSummary (03-02), detectStaleness + digest banner (03-03), writeArchive (03-04)"
  - phase: 02-scraper-coverage
    provides: "fetchAll, enrichBody, keywordFilter, dedupAll, summarizeItem, composeDigest, sendMail, writeState run-transaction"
provides:
  - "runPipeline() single composition root with options { skipEmail, skipStateWrite, skipGemini, firmFilter, saveHtmlPath, reporter }"
  - "check:firm CLI — debug side-effect-free single-firm execution with optional --save-html"
  - "Recorder threaded through fetchAll per-firm metrics"
  - "Archive write wired after sendMail resolves, before writeState, gated on !skipEmail && newTotal > 0"
  - "writeStepSummary in finally block — partial runs still emit $GITHUB_STEP_SUMMARY table"
  - "daily.yml git-auto-commit file_pattern widened to archive/**/*.html"
  - "README D-17 Korean operational sections (로펌 추가하기 / 시크릿 교체 / 수동 실행 / 디버깅)"
affects: ["04-js-rendering", "05-backlog"]

tech-stack:
  added: []
  patterns:
    - "Composition-root extraction: runPipeline() owns the run-transaction; main.ts and cli/checkFirm.ts are thin wrappers differing only in options"
    - "Observability threading: Recorder instance flows through fetchAll + downstream stages; writeStepSummary lives in a finally block so partial runs still emit metrics"
    - "CLI debug contract: check:firm hard-sets skipEmail/skipStateWrite/skipGemini to true — no way to accidentally send mail or mutate seen.json from the dev loop"
    - "Archive gating: writeArchive(html, now) runs only when !skipEmail && newTotal > 0 (silent-day DEDUP-03 skip propagates to archive)"

key-files:
  created:
    - "src/pipeline/run.ts"
    - "src/cli/checkFirm.ts"
    - "test/pipeline/run.test.ts"
  modified:
    - "src/main.ts"
    - "src/pipeline/fetch.ts"
    - "package.json"
    - ".github/workflows/daily.yml"
    - "README.md"

key-decisions:
  - "runPipeline takes a single options object (not positional params) so new debug flags in Phase 4+ add without breaking call sites"
  - "check:firm CLI does NOT accept --send-email or --write-state escape hatches — Phase 3 scope deliberately narrows dev loop to read-only reproduction"
  - "writeStepSummary lives in finally (not after writeState) so even crashes mid-pipeline emit the per-firm table that operators use to diagnose failures"
  - "Archive write sits AFTER sendMail resolves — if email send fails we do NOT commit an archive for a mail we never delivered (consistency with DEDUP-03 silent-day rule)"

patterns-established:
  - "Composition-root pattern: downstream phases adding dev tools (e.g., Phase 4 Playwright debugger) wrap runPipeline with new option flags instead of forking run-transaction"
  - "Finally-block observability: any future metric writer must attach in finally, not after writeState, to survive partial runs"

requirements-completed: [OPS-04, OPS-05, OPS-07, OPS-08, OPS-09]

duration: 6 tasks across 2 sessions
completed: 2026-04-18
---

# Phase 03 Plan 05: runPipeline Capstone Summary

**Composition-root extraction + dev-loop CLI + observability wiring: runPipeline is now the single entry point; main.ts and check:firm differ only in their options payload; recorder/staleness/archive thread the run-transaction at documented positions.**

## Performance

- **Duration:** 6 tasks (session split — tasks 1-5 prior, task 6 this session)
- **Started:** 2026-04-18 (task 1 commit)
- **Completed:** 2026-04-18T10:49Z (task 6 commit + verification)
- **Tasks:** 6
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- `runPipeline(options?)` extracted as single composition root; preserves fetch → enrich → filter → dedup → summarize → email → archive → state ordering verbatim
- `pnpm check:firm <id> [--save-html <path>]` CLI — single-firm end-to-end reproduction with email/state/Gemini skipped by construction
- Recorder threaded through fetchAll; writeStepSummary in finally block emits per-firm fetched/duration/errorClass table to `$GITHUB_STEP_SUMMARY`
- Staleness warnings flow readState → detectStaleness → composeDigest (banner at top of email)
- writeArchive(html, now) wired after sendMail resolves, before writeState, gated on `!skipEmail && newTotal > 0`
- daily.yml git-auto-commit-action file_pattern widened — `archive/**/*.html` commits alongside `state/seen.json`
- README gains 4 Korean operational sections per D-17: 로펌 추가하기 (replacing English Adding a firm), 시크릿 교체, 수동 실행, 디버깅

## Task Commits

Each task was committed atomically:

1. **Task 1: fetchAll accepts optional Recorder** — `8a542e3` (feat)
2. **Task 2: extract runPipeline composition root** — `e7c5a6b` (feat)
3. **Task 3: main.ts thin wrapper** — `730246b` (refactor)
4. **Task 4: check:firm CLI + package.json script** — `da1a82c` (feat)
5. **Task 5: daily.yml file_pattern widens for archive** — `f0f8042` (feat)
6. **Task 6: README 4 Korean operational sections (D-17)** — `f4b959f` (docs)

## Files Created/Modified

- `src/pipeline/run.ts` — runPipeline composition root with options object for side-effect gating
- `src/cli/checkFirm.ts` — CLI entrypoint, hard-sets skipEmail/skipStateWrite/skipGemini, parses --save-html
- `test/pipeline/run.test.ts` — runPipeline unit tests (options honored, ordering preserved, finally block runs)
- `src/main.ts` — thin wrapper: `runPipeline({})` + top-level error handler
- `src/pipeline/fetch.ts` — fetchAll accepts optional Recorder, threads per-firm metrics
- `package.json` — `check:firm` script wired to `tsx src/cli/checkFirm.ts`
- `.github/workflows/daily.yml` — file_pattern includes `archive/**/*.html`
- `README.md` — 4 new Korean sections per D-17, existing English sections unchanged

## Decisions Made

- **Composition-root over inline main:** extracting runPipeline now prevents main.ts + checkFirm.ts from drifting as Phase 4+ introduces more dev tools
- **Options object over positional args:** future flags (e.g., Phase 4 `usePlaywright: true`) add without breaking call sites
- **check:firm has no --send-email escape hatch:** dev loop is read-only by construction; if an operator wants to send a test mail, `pnpm dry-run` on `firmFilter` would be the Phase 5 follow-up
- **writeStepSummary in finally:** partial runs still emit the observability table — crash mid-summarize still tells the operator which firms fetched

## Deviations from Plan

None — plan executed as written.

**Minor acceptance-criterion note (Task 6):** plan line 1341 asserts `grep -c "archive/YYYY" README.md` returns exactly 1, but the plan's own prescribed text for 수동 실행 (line 1257) and 디버깅 (line 1301) sections each mention `archive/YYYY/MM-DD.html`, so the actual count is 2. Following the plan's prescribed body text was treated as authoritative over the auto-grep threshold.

## Issues Encountered

None during task 6. Tasks 1-5 landed in the prior session without remediation.

## User Setup Required

None — all changes are code + config in-repo; no new secrets, no new external services.

## Next Phase Readiness

- runPipeline is stable API surface for Phase 4 (js-rendering) to extend with a `usePlaywright: true` option flag — no main.ts or checkFirm.ts changes needed
- $GITHUB_STEP_SUMMARY observability + archive commit + staleness banner close OPS-04/05/07/08/09 — Phase 3 goal ready for verifier
- check:firm CLI provides Phase 4 selector-debugging workflow out of the box

---
*Phase: 03-observability-dev-loop*
*Completed: 2026-04-18*
