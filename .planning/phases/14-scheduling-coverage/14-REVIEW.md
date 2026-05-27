---
phase: 14-scheduling-coverage
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - .github/workflows/daily.yml
  - .github/workflows/weekly.yml
  - CLAUDE.md
  - config/settings.yaml
  - package.json
  - src/config/loader.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found (2 Info, 0 Warning, 0 Critical)

## Summary

Phase 14 scheduling-coverage changes are correct and contained. The two cron edits parse and align with the stated calendar intent:

- `daily.yml` cron `0 12 * * 0-6` fires every day Sun-Sat at 12:00 UTC (21:00 KST) — Monday now included, as required. The phase-13 day-of-week collision (`0` + `7`) is correctly avoided by using the contiguous `0-6` range.
- `weekly.yml` cron `0 21 * * 0` fires Sunday 21:00 UTC, which is Monday 06:00 KST. Time separation from the Monday daily run (21:00 KST) is 15 hours, matching the stated rationale.
- Both workflows' `concurrency` block keys are byte-identical (`group: digest-pipeline`, `cancel-in-progress: false`); only the inline comments differ, which is expected (different rationale text per file).
- `src/config/loader.ts` is unchanged from the diff base and still parses `config/settings.yaml`'s `schedule:` block through the unchanged `SettingsSchema` — `days: weekly` + `time_utc: '12:00'` both pass the strict zod schema (`schema.ts:212-221`).
- `package.json` cleanly removes the `sync-schedule` entry; no orphan references to `sync-schedule` or `syncSchedule`/`toCron` remain in `src/`, `scripts/`, or `test/`.
- `CLAUDE.md` adds the new `### Workflow scheduling (cron edit policy)` subsection inside the `<!-- GSD:conventions-start --> ... <!-- GSD:conventions-end -->` fence, covering all three required items (phase-13 lesson, edit procedure, time-separation rationale).

Two Info-level observations on stale test fixtures and a minor doc/code inconsistency are noted below. Neither blocks the phase — both predate this phase's changes but are surfaced because the work area is adjacent.

## Info

### IN-01: Stale `cron:` field on schedule fixtures in e2e tests

**File:** `test/pipeline/runDaily.e2e.test.ts:76`
**File:** `test/pipeline/runWeekly.e2e.test.ts:86`

**Issue:** Both e2e fixtures construct an inline `SETTINGS` object whose `schedule:` includes a `cron` property:

```ts
// runDaily.e2e.test.ts:76
schedule: { time_utc: '00:00', days: 'daily' as const, cron: '0 0 * * *' },

// runWeekly.e2e.test.ts:86
schedule: { time_utc: '00:00', days: 'weekly' as const, cron: '0 12 * * 1' },
```

`SettingsSchema.schedule` (`src/config/schema.ts:212-221`) is `.strict()` and only allows `time_utc` + `days` — it does not have a `cron` field. The fixtures don't break at runtime because they're handed to `loadSettingsMock.mockResolvedValue()` (a loosely-typed `vi.fn()`), so the extra key is silently passed through and no consumer reads it. But the fixtures now misrepresent the runtime shape (the cron is in `daily.yml`/`weekly.yml`, not in `Settings`), which is exactly the architectural shift this phase codifies in CLAUDE.md.

Out of strict review scope (these files were not in the changed-file list), but flagged because the cleanup is a natural follow-up to phase 14.

**Fix:** Drop the stale `cron` key from both fixtures:

```ts
// runDaily.e2e.test.ts:76
schedule: { time_utc: '00:00', days: 'daily' as const },

// runWeekly.e2e.test.ts:86
schedule: { time_utc: '00:00', days: 'weekly' as const },
```

### IN-02: settings.yaml `time_utc: '12:00'` value is misleading now that the block is unused

**File:** `config/settings.yaml:29-30`

**Issue:** The `schedule:` block header is now "현재 미사용" (currently unused) and the inline comments clearly redirect readers to `daily.yml`/`weekly.yml` for the real schedule. The block is kept for zod backwards compat — fine. But the literal values `time_utc: '12:00'` + `days: weekly` look like real config to a casual reader skimming the YAML and could mislead a non-developer maintainer ("oh, the schedule is weekly at 12:00 UTC") because the actual daily run is also at 12:00 UTC but daily, and weekly is at 21:00 UTC.

**Fix:** Either set obviously-placeholder values, or add an inline comment clarifying these specific values are no-ops:

```yaml
schedule:
  time_utc: '00:00'   # placeholder — actual cron lives in .github/workflows/
  days: daily         # placeholder — see CLAUDE.md "Workflow scheduling"
```

Optional; the block-level comment already covers this, so this is purely defensive.

---

_Reviewed: 2026-05-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
