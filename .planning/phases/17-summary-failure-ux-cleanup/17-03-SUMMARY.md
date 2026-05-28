---
phase: 17-summary-failure-ux-cleanup
plan: "03"
subsystem: docs
tags: [claude-md, gemini, free-tier, rpm, quota, stack-doc]

requires: []
provides:
  - Updated stack-doc baseline reflecting observed 5 RPM for gemini-2.5-flash
  - Explicit note that flash + flash-lite share the same quota metric
affects: [future-summarize-decisions, future-retry-tuning]

tech-stack:
  added: []
  patterns:
    - In-place table value update with adjacent quote-block clarification — single source of stack truth stays in CLAUDE.md

key-files:
  created: []
  modified:
    - CLAUDE.md

key-decisions:
  - "RPM column value: '5 (observed 2026-05-27)' — preserves the original metadata source while indicating provenance"
  - "Quote-block placed directly below the table — keeps the correction adjacent to the data it corrects"

patterns-established:
  - "Stack-doc table edits add inline provenance ('observed YYYY-MM-DD') rather than removing the original number — readers can trace history"

requirements-completed: [FAIL-UX-01]

duration: 2min
completed: 2026-05-28
---

# Plan 17-03: CLAUDE.md free-tier RPM 표 갱신

**gemini-2.5-flash RPM flipped from 10 to '5 (observed 2026-05-27)' + quote-block note that flash and flash-lite share the same quota metric (so model fallback alone does NOT unstick a 429).**

## Performance

- **Duration:** ~2 min
- **Tasks:** 2 (T1 edit + T2 commit, merged into one commit)
- **Files modified:** 1

## Accomplishments

- CLAUDE.md `## Critical Correction: Gemini Free-Tier Reality (April 2026)` table updated: `gemini-2.5-flash` row RPM column is now `5 (observed 2026-05-27)`.
- New quote block placed directly below the table (between the table and `## Recommended Stack`): `> **Observed 2026-05-27:** flash + flash-lite share the same `gemini-2.5-flash` quota metric — model fallback alone does NOT unstick a 429.`
- `gemini-2.5-pro` and `gemini-2.5-flash-lite` rows untouched.

## Task Commits

1. **T1: table edit + quote block insert** — squashed into Plan commit `24deed1`
2. **T2: Plan commit** — `24deed1`

## Files Created/Modified

- `CLAUDE.md` — 4 line additions + 1 line modification (diff: -1/+4) localized to the Critical Correction section.

## Decisions Made

None — followed plan exactly (D-07 wording quoted verbatim).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Stack doc now reflects production reality. Future plan-phase decisions about model selection and retry tuning have an accurate baseline.
- Wave 1 complete (17-01, 17-02, 17-03 all committed). Phase verification can run.

---
*Phase: 17-summary-failure-ux-cleanup*
*Completed: 2026-05-28*
