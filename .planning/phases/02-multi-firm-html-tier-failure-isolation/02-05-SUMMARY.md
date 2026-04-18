---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 05
status: complete
files_modified:
  - src/compose/templates.ts
  - src/compose/digest.ts
  - test/compose/digest.test.ts
  - test/compose/__snapshots__/digest.test.ts.snap
---

# Plan 02-05 Summary: EMAIL-05 failed-firm footer

## What was built

Extended the digest HTML renderer with a Korean-header failed-firm footer
that appears only when at least one firm errored during a run. Empty on
clean runs — zero visual footprint.

### templates.ts extensions
- `renderHtml(firms, dateKst, failed: FirmResult[] = [])` — third optional arg
- `classifyError(msg, stage)` — LOCAL; maps error messages to one of:
  `robots-blocked`, `fetch-timeout`, `http-{status}`, `dns-fail`,
  `selector-miss`, `parse-error`, `unknown`. Ordered checks so robots
  precedes HTTP-code match.
- `renderFailedFirmsFooter(failed)` — LOCAL; returns `''` on empty input,
  otherwise a `<footer><ul>` with one `<li>` per failed firm.
- Pipeline: `scrubSecrets → first-line split → slice(0, 140) → escapeHtml`
  — four-stage defense-in-depth.

### digest.ts
- `firmsWithErrors = results.filter(r => !!r.error)` → passed as 3rd arg
  to renderHtml. Subject count still measures `firmsWithNew.length` — failed
  firms are in the footer, not the subject count.

### Tests (9 new, 15 total)
- http-status classification (Test 4)
- Subject count excludes failed firms (Test 5)
- robots-blocked classification (Test 6)
- fetch-timeout classification (Test 7)
- XSS defense: `<script>` in firm.name escaped (Test 8)
- Clean-run: no footer rendered (Test 9)
- 140-char truncation of long messages (Test 10)
- scrubSecrets redacts API key leaks (Test 11)
- Snapshot lock on failed-firm-included output (Test 12)

## Phase 1 01-08 invariant preserved

`escapeHtml` and `escapeAttr` remain LOCAL to templates.ts. `renderHtml`
is the sole export. Verified:

```
grep -c "^export " src/compose/templates.ts → 1
grep -c "^function escapeHtml" src/compose/templates.ts → 1
grep -c "^function classifyError" src/compose/templates.ts → 1
grep -c "^function renderFailedFirmsFooter" src/compose/templates.ts → 1
```

## Verification evidence

```
pnpm typecheck → exit 0
pnpm vitest run test/compose/digest.test.ts → 15/15 pass
pnpm vitest run (full suite) → 73/73 pass (no regressions)
Snapshot file: test/compose/__snapshots__/digest.test.ts.snap
  Contains 2 entries: clean-run + digest-with-failed-firm.
  Both include '이번 실행에서 수집 실패' (second one only) and
  'AI 요약 — 원문 확인 필수' (both).
```

## Deviations from plan

1. **Helper placement**: `cliffordChance` FirmConfig + `failedFirmResult()`
   helper were appended to the END of digest.test.ts (after the closing
   describe) rather than inserted mid-file. Identical semantics, cleaner
   diff. JS hoisting + const-in-module mean the describe block can still
   reference them via closure.

## Coupling contracts locked

- `classifyError` regex `/HTTP (\d{3})/` couples to:
  - `src/scrapers/rss.ts` error shape `RSS fetch {firm.id}: HTTP {status}`
  - `src/scrapers/util.ts` (Plan 02-02) error shape `HTML fetch {url}: HTTP {status}`
  - Plan 02-03's HTML scraper error shape MUST follow the same pattern.
- Snapshot regeneration is destructive — any future template change
  requires `vitest run -u` and a new review of the .snap diff.

## Note for plan 02-08

main.ts calls `composeDigest(results, ...)`. No signature change needed —
`results: FirmResult[]` already carries `r.error` when failure-isolation
(FETCH-02) populates it. Plan 02-08's job is only to ensure failed firms
appear in the `results` array with `error` populated.

## Requirements touched

- EMAIL-05 (failed-firm email footer) — fully satisfied
