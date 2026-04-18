# Plan 03-04 — archive writer + DRY_RUN site #3

Phase: 03-observability-dev-loop
Plan: 04 of 5 (Wave 1)
Commit: `bf313b7` (on `dev`)

## What shipped

`src/archive/writer.ts` — canonical Phase 3 in-repo digest sink.
- `writeArchive(html, now?, baseDir?)` returns `Promise<string>` (written or would-write path).
- Path derivation: `formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd')` → `archive/YYYY/MM-DD.html` (D-13 matches Phase 1 parseDate + compose/digest.ts date).
- `mkdir({ recursive: true })` bootstraps missing year directories.
- D-15 same-day overwrite: single `writeFile` (no `wx` exclusive flag).
- DRY_RUN check site #3 of 3 (R-02) — `isDryRun()` short-circuits with `[DRY_RUN] would write archive ...` log line and no disk write.

`test/archive/writer.test.ts` — 10 tests passing.

## DRY_RUN invariant evidence

```bash
grep -rc "isDryRun()" src/ | awk -F: '{sum += $2} END {print sum}'
# → 3
```

Three sanctioned sites:
1. `src/mailer/gmail.ts` (EMAIL-06)
2. `src/state/writer.ts` (OPS-06)
3. `src/archive/writer.ts` (OPS-09 Phase 3 R-02) — NEW

Any other module importing `isDryRun` in a future phase is a Pattern 2 regression.

## KST convention match

`formatInTimeZone(now, 'Asia/Seoul', 'yyyy/MM-dd')` reuses the same `date-fns-tz` + `Asia/Seoul` constellation already used in `src/compose/digest.ts` subject-line formatting and `src/scrapers/rss.ts` via feedparser's `pubDate`. Asia/Seoul has no DST so 23:00–01:00 UTC rollover is deterministic.

## Evidence

| Gate | Actual |
|------|--------|
| `export async function writeArchive` | 1 ✓ |
| `isDryRun()` call | 1 ✓ |
| `import { isDryRun }` | 1 ✓ |
| `Asia/Seoul` | 2 (1 code + 1 docstring) ✓ |
| `yyyy/MM-dd` | 1 ✓ |
| `grep -rc "isDryRun()" src/` aggregate | 3 ✓ |
| `pnpm typecheck` | exit 0 ✓ |
| `pnpm vitest run test/archive/writer.test.ts` | 10 pass ✓ |

## Deviations

None.

## Unexpected behavior

`vi.stubEnv('DRY_RUN', '1')` worked correctly — `isDryRun()` inside `writeArchive` sees the stubbed env var on every call. `vi.unstubAllEnvs()` in `afterEach` cleanly resets between tests.

## No new dependencies

package.json untouched. `date-fns-tz` was already a Phase 1 dependency.
