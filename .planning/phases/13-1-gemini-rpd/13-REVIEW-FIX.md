---
phase: 13-1-gemini-rpd
fixed_at: 2026-05-23T08:57:00Z
review_path: .planning/phases/13-1-gemini-rpd/13-REVIEW.md
iteration: 2
findings_in_scope: 6
fixed: 5
skipped: 0
acknowledged: 1
status: all_fixed
---

# Phase 13: Code Review Fix Report (Iteration 2)

**Fixed at:** 2026-05-23T08:57:00Z
**Source review:** .planning/phases/13-1-gemini-rpd/13-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 6 (IN-01 through IN-06; --all cleanup pass)
- Fixed: 5 (IN-01, IN-02, IN-03, IN-04, IN-05)
- Acknowledged (no code change required): 1 (IN-06)
- Skipped: 0

> **Note on prior iteration:** The 3 Warnings from this review (WR-01, WR-02, WR-03) were fixed in iteration 1 — see commits `0f8ae8c`, `29243a8`, `4cf4cd7` in git history. This iteration handles only the Info-class findings under an explicit `--all` cleanup pass.

## Fixed Issues

### IN-01: daily.yml header comment references rejected cron form

**Files modified:** `.github/workflows/daily.yml`
**Commit:** fbca9dd (grouped with IN-02)
**Applied fix:** Replaced `2-7,0` with `0,2-6` in the header docstring (line 6) so the comment matches the actual cron expression on line 27. Verified the cron line BEFORE editing — confirmed line 27 reads `'0 12 * * 0,2-6'` (the correct, parser-accepted form). Documentation-only; zero behavior change.

### IN-02: GitHub Action version drift vs CLAUDE.md stack lock

**Files modified:** `CLAUDE.md`
**Commit:** fbca9dd (grouped with IN-01)
**Applied fix:** Per orchestrator decision, treated workflows as source of truth (they run in production) and updated CLAUDE.md to match. Updated the "GitHub Actions" row in the Development Tools table:
- `actions/checkout@v5` → `actions/checkout@v6`
- `actions/setup-node@v5` → `actions/setup-node@v6`
- `stefanzweifel/git-auto-commit-action@v6` → `stefanzweifel/git-auto-commit-action@v7`
- `actions/cache@v4` unchanged
The minimal-edit principle was preserved — only version numbers in that one cell were changed; surrounding rationale and stack table structure untouched.

### IN-03: runDaily loads recipient purely for "symmetry"

**Files modified:** `src/pipeline/runDaily.ts`
**Commit:** e93d476 (grouped with IN-04)
**Applied fix:** Per orchestrator decision (Option 2 from the review), kept the `await loadRecipient()` call and replaced the symmetry comment with an explicit fail-fast intent comment verbatim from the orchestrator brief:
```ts
// Pre-validate recipient config so a malformed RECIPIENT_EMAIL surfaces
// on Tue's daily run instead of waiting for Monday's weekly to crash.
await loadRecipient();
```
This makes the previously-undocumented "feature" (catching recipient misconfig on every daily run) explicit. No behavior change — same call, same await, same throw on validation failure.

### IN-04: runWeekly loadSettings result discarded

**Files modified:** `src/pipeline/runWeekly.ts`
**Commit:** e93d476 (grouped with IN-03)
**Applied fix:** Parallel treatment to IN-03 — kept the `await loadSettings()` call and replaced the "load for parity / future use" trailing comment with an explicit fail-fast intent comment on the preceding two lines:
```ts
// Pre-validate settings config so a malformed settings.yaml surfaces
// at the top of the weekly run instead of crashing partway through compose.
await loadSettings();
```
No behavior change.

### IN-05: PendingItemSchema accepts empty optional summaryError

**Files modified:** `src/state/pending.ts`
**Commit:** 61e8b39
**Applied fix:** Changed `summaryError: z.string().optional()` to `summaryError: z.string().min(1).optional()` on line 60. Before applying, verified the producer at `src/summarize/gemini.ts:193` — it passes `scrubbed = scrubSecrets((err as Error).message)` which is never empty in current call paths, and an existing test (`test/summarize/gemini.test.ts:113`) already asserts `expect(result.summaryError).not.toBe('')`. The schema change locks this producer contract at the persistence boundary so a future refactor that accidentally writes `""` fails Zod validation immediately rather than silently producing a "failed" item with an empty error message.

## Acknowledged (No Code Change)

### IN-06: composeHeartbeat does not escape dateKst into HTML

**File:** `src/compose/heartbeat.ts:33-40`
**Status:** Acknowledged per review guidance — no code change applied this iteration.
**Rationale:** The review itself explicitly states "No change required today; flag for future-proofing only." `dateKst` is derived from `formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd')` and is fully deterministic ASCII (`YYYY-MM-DD`) — no XSS surface today. Recipient and from-address are not interpolated into HTML. The finding is recorded here as a guard for future contributors: if anyone later interpolates user-supplied content (e.g., a `note` field from settings YAML) into the heartbeat HTML, an `escapeHtml()` pass at the boundary becomes required.

## Verification

- **Tier 1 (always):** Re-read each modified file section after the edit to confirm fix text present and surrounding code intact. All five fixes verified.
- **Tier 2 — IN-01, IN-02:** Documentation-only (YAML comment + Markdown table). No syntax checker run; YAML structure unchanged.
- **Tier 2 — IN-03, IN-04:** Comment-only TypeScript edits; no semantic change. Folded into the final typecheck below.
- **Tier 2 — IN-05:** Ran `pnpm test test/state/pending.test.ts test/summarize/gemini.test.ts` — 14 tests passed across 2 files (no breakage from the `.min(1)` tightening).
- **Final typecheck:** `pnpm typecheck` (tsc --noEmit) — clean across the codebase.

## Iteration History

| Iteration | Scope | Fixed | Commits |
|-----------|-------|------:|---------|
| 1 | Warnings (WR-01, WR-02, WR-03) | 3 | 0f8ae8c, 29243a8, 4cf4cd7 |
| 2 (this) | Info (IN-01–IN-06; --all cleanup) | 5 fixed + 1 acknowledged | fbca9dd, e93d476, 61e8b39 |

---

_Fixed: 2026-05-23T08:57:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
