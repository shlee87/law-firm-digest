# Phase 3: Observability + Dev Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 03-observability-dev-loop
**Areas discussed:** Assumptions review (pre-phase), Staleness thresholds, `check:firm` CLI details, Step summary columns, Operational README

---

## Pre-Phase Assumptions Review

Invoked via `/gsd:list-phase-assumptions 3` before discuss-phase. Four top-level framings were validated.

| # | Area | Claude's assumption | User decision |
|---|------|---------------------|---------------|
| A-01 | `check:firm` fetch mode | Live fetch by default, `--fixture` deferred | ✓ Confirmed |
| A-02 | Staleness banner placement | Single consolidated block at top of digest | ✓ Confirmed |
| A-03 | Archive git churn | Accept — no orphan branch | ✓ Confirmed |
| A-04 | Operational README scope | Include in Phase 3 as part of phase deliverables | ✓ Confirmed |

---

## Staleness Thresholds

### Per-firm override?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 30 days for all firms | Simple, single source of truth. Per-firm override promoted to Phase 5 backlog if needed | ✓ |
| `staleness_days: N` per-firm field | More precise, handles quarterly publishers. Adds a config knob | |

**User's choice:** Fixed 30 days

### Null `lastNewAt` (new firm) handling?

| Option | Description | Selected |
|--------|-------------|----------|
| 30-day bootstrap grace | Newly enabled firm gets 30 days before staleness fires — avoids false alarm | ✓ |
| Alarm immediately | Bad selector at firm add time is caught on day 1 | |

**User's choice:** 30-day bootstrap grace
**Notes:** Claude has discretion on sourcing the "enabled date" — recommended to write an `enabledAt` marker to `state/seen.json` on first firm processing.

### Last-run threshold?

| Option | Description | Selected |
|--------|-------------|----------|
| 30 hours | Matches OPS-05, tolerates ~6h cron drift | ✓ |
| 24–26 hours | More aggressive, risks false alarms from small delays | |

**User's choice:** 30 hours

---

## `check:firm` CLI Details

### Firm identifier input?

| Option | Description | Selected |
|--------|-------------|----------|
| English id only (e.g. `cooley`) | Unambiguous, easy typing, no Korean input mode | ✓ |
| id + Korean name partial match | Convenience, but multi-match disambiguation logic needed | |

**User's choice:** English id only
**Notes:** Required two passes — first question used jargon ("부분일치"), user asked for clarification. Rewritten with concrete CLI examples before user answered.

### Output format?

| Option | Description | Selected |
|--------|-------------|----------|
| Text only | Simple human-readable stage-by-stage output | ✓ |
| `--json` flag | Adds structured output for tools/automation | |

**User's choice:** Text only

### `--save-html` option?

| Option | Description | Selected |
|--------|-------------|----------|
| Include `--save-html <path>` | Writes rendered digest HTML to disk for browser preview | ✓ |
| Exclude | User redirects HTML via shell: `... > preview.html` | |

**User's choice:** Include `--save-html <path>`

---

## Step Summary Columns

### `Filtered` column?

| Option | Description | Selected |
|--------|-------------|----------|
| Do not add | D-P2-17 sets all filters empty; column would always be 0 | ✓ |
| Add preemptively | Column slot ready for future filter use; noisy now | |

**User's choice:** Do not add

### `Gemini time` column?

| Option | Description | Selected |
|--------|-------------|----------|
| Do not add | Single `Duration` column. Defer split until Phase 5 QUOTA-01 triggers | ✓ |
| Add | Separates Gemini wall time for bottleneck analysis | |

**User's choice:** Do not add

---

## Operational README

### File location?

| Option | Description | Selected |
|--------|-------------|----------|
| Sections in existing `README.md` | Single file, visible on GitHub entry | ✓ |
| Separate `docs/OPERATIONS.md` | Keeps README short, docs linked | |

**User's choice:** Sections in `README.md`

### Language?

| Option | Description | Selected |
|--------|-------------|----------|
| Korean only | User is sole operator; Korean is fastest | ✓ |
| English also | Prep for open-source release; doubles authoring + maintenance burden | |

**User's choice:** Korean only

### Scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Operational procedures only (4 items) | Phase 3 delivery scope, no more | ✓ |
| Also onboarding / tech stack / architecture | Broader rewrite — scope creep risk | |

**User's choice:** Operational procedures only

---

## Claude's Discretion

- Staleness detector module location (recommended: `src/observability/staleness.ts`)
- Metrics accumulator shape (recommended: `Recorder` instance threaded through `runPipeline()`)
- `enabledAt` source for bootstrap grace (recommended: write to `state/seen.json` on first firm processing)
- Archive filename timezone handling (reuse Phase 1 KST `parseDate` helpers)
- README section order and tone within the 4 required items

## Deferred Ideas

- Per-firm `staleness_days` override (Phase 5 triggered)
- `check:firm --fixture <path>` offline mode (Phase 5 if needed)
- `check:firm --json` structured output (Phase 5 if CI needs it)
- Step summary `Filtered` column (activates when firms start using keyword filters)
- Step summary `Gemini time` column (Phase 5 QUOTA-01 trigger)
- Orphan archive branch `archive/main` (only if `main` git log noise becomes painful)
- English README translation (if open-sourced)
- README onboarding sections (separate documentation phase)

---

## Notes

- User asked "이게 무슨뜻이야?" three times during this session when questions used undefined technical terms. After rewriting each with concrete scenarios + CLI examples, user answered decisively (all recommended defaults). Memory captured for future sessions.
- Background Phase 2 executor completed mid-discussion: 8/8 plans, 128/128 tests passing. Dashboard will reflect on next `/gsd:manager` invocation.
