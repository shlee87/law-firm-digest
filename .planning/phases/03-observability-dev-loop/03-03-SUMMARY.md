# Plan 03-03 — staleness detector + digest banner (OPS-04 + OPS-05)

Phase: 03-observability-dev-loop
Plan: 03 of 5 (Wave 2)
Commits: `2b2e8a1` (task 1), `8cd2b96` (task 2)

## What shipped

### Task 1 — `src/observability/staleness.ts` (pure function)

`detectStaleness(seen, firms, now?)` — pure function over `SeenState` +
`FirmConfig[]` + optional `now: Date`. No I/O, no env reads. Returns:

```ts
{ staleFirms: string[], lastRunStale: { hoursAgo: number } | null }
```

Thresholds hard-coded:
- `STALE_FIRM_THRESHOLD_MS` — 30 days (D-01)
- `STALE_RUN_THRESHOLD_MS` — 30 hours (D-03)

Invariants locked in by the 20 tests:
- **Pure** — same inputs → identical outputs (Test P — determinism).
- **Loaded-firms authority** — iterates over `firms: FirmConfig[]` param;
  disabled firms (`enabled: false`) are **never** in warnings (Pitfall 1).
- **Bootstrap grace (D-02)** — firms whose `enabledAt` is within the last
  30 days are excluded, regardless of `lastNewAt`.
- **No retrofit (Pitfall 9)** — legacy entries without `enabledAt` fall
  through to the conservative-flag policy: if `lastNewAt` is null and
  we're past grace, flag it.
- **Cold start** — `seen.lastUpdated === null` → `lastRunStale` is null.

**Tests:** `test/observability/staleness.test.ts` — 20 passing (plan
targeted "~17+"). Boundary tests at 29/30/31 days + 29/30/31 hours lock
the threshold semantics.

### Task 2 — `renderHtml` + `composeDigest` banner wiring

- `src/compose/templates.ts` — `renderHtml` grew optional
  `warnings?: StalenessWarnings` (4th param). New file-local
  `renderStalenessBanner(warnings)` helper emits a single consolidated
  block (D-04) sitting between `<h1>` and the firm `${sections}`.
  Returns `''` when warnings is undefined or empty (mirrors
  `renderFailedFirmsFooter`'s invisible-on-clean-run posture). Firm
  names escape via `escapeHtml` for defense-in-depth XSS.

- `src/compose/digest.ts` — `composeDigest` signature grew optional
  `warnings?: StalenessWarnings` inserted **before** `now: Date`.
  Forwards into `renderHtml`. The `warnings` param slot before `now`
  is the RESEARCH Pattern 2 contract — any positional `now` call
  sites needed `undefined` inserted as the new 4th arg.

Banner HTML (rendered samples):

```html
<!-- staleFirms only -->
<div style="margin:0 0 16px 0;padding:12px;background:#fff8e1;border-left:4px solid #f57f17;color:#6f5300;font-size:13px;"><div>⚠ 30일 이상 새 글 없음: 김앤장, 태평양</div></div>

<!-- lastRunStale only -->
<div style="…">⚠ 이전 실행 누락 — 48시간 전 마지막 성공 실행</div></div>

<!-- both (D-04: single consolidated block, one <div> wrapper) -->
<div style="…"><div>⚠ 30일 이상 새 글 없음: A</div><div>⚠ 이전 실행 누락 — 72시간 전 마지막 성공 실행</div></div>
```

## Call-site adjustments for the signature change

15 existing `composeDigest` call sites in `test/compose/digest.test.ts`
were passing `fixedDate` as the 4th positional arg. All updated to pass
`undefined` as the new 4th arg (warnings) + `fixedDate` as the 5th:

```ts
// before
composeDigest(results, 'u@e.com', 'u@e.com', fixedDate)
// after
composeDigest(results, 'u@e.com', 'u@e.com', undefined, fixedDate)
```

Production call site `src/main.ts:125` was already passing only 3 args
(`composeDigest(summarized, recipient, fromAddr)`) — no change needed;
`warnings` and `now` both default.

## Snapshot refresh

Two digest snapshots refreshed for the new `${stalenessBanner}` template
line (empty-string interpolation on clean runs adds one blank line,
identical pattern to the pre-existing `${failedFooter}` behavior):

- `composeDigest > HTML snapshot is stable`
- `composeDigest > EMAIL-05 — snapshot with failed firm included (footer format locked)`

No functional change; whitespace-only snapshot drift.

## renderStalenessBanner scope

`renderStalenessBanner` is **file-local** (no `export`) — preserving the
Phase 1 01-08 LOCKED invariant that the XSS-escape boundary of the
renderer is contained inside `templates.ts`. Tests verify this:

```bash
grep -c "^export function renderStalenessBanner" src/compose/templates.ts
# → 0
```

## Evidence

| Gate | Actual |
|------|--------|
| `export function detectStaleness` | 1 ✓ |
| `export interface StalenessWarnings` | 1 ✓ |
| `STALE_FIRM_THRESHOLD_MS` refs | 4 (decl + 3 usages) ✓ |
| `STALE_RUN_THRESHOLD_MS` refs | 2 (decl + usage) ✓ |
| 30-day constant literal (`30 * 24 * 60 * 60 * 1000`) | 1 ✓ |
| 30-hour constant literal (`30 * 60 * 60 * 1000`) | 1 ✓ |
| `Math.floor` (hoursAgo) | 1 ✓ |
| `firm.enabled` (disabled-filter) | 1 ✓ |
| `function renderStalenessBanner` (private) | 1 ✓ |
| exported `renderStalenessBanner` | 0 ✓ (locked to file) |
| `${stalenessBanner}` interpolation in templates.ts | 1 ✓ |
| `warnings?: StalenessWarnings` in digest.ts | 1 ✓ |
| staleness tests | 20/20 pass ✓ |
| digest tests (existing + new banner) | 23/23 pass ✓ |
| `pnpm typecheck` | exit 0 ✓ |
| `pnpm vitest run` (full suite) | 188/188 pass ✓ |

## Plan 05 consumer contract

`src/pipeline/run.ts` (Plan 05) will:
1. Load `seen` via `readState()` and `firms` via `loadFirms()`.
2. Call `detectStaleness(seen, firms)` at the boundary just after state
   load — one invocation per run.
3. Forward the returned `StalenessWarnings` object into
   `composeDigest(results, recipient, fromAddr, warnings)`.

Nothing else in the pipeline consumes `staleness.ts` — the detector is a
one-site hookup, and the banner is fully owned by the render path.

## Backward compatibility

All Phase 1 and Phase 2 callers that do NOT pass `warnings` produce
identical HTML output to before (minus the single blank-line template
drift absorbed by the snapshot update). Zero behavior change when
`warnings` is omitted.
