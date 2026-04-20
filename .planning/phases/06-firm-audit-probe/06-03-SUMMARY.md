---
phase: 06-firm-audit-probe
plan: "03"
subsystem: audit/writer
tags: [audit, writer, markdown, snapshot, enum-enforcement, D-09, D-10]
dependency_graph:
  requires:
    - 06-01 (types.ts — Status, Remediation, AuditRow, AuditReport shapes)
  provides:
    - src/audit/writer.ts (renderAuditMarkdown, remediationToTargetPhase)
    - test/audit/writer.test.ts (6 tests + snapshot)
    - test/audit/__snapshots__/writer.test.ts.snap (locked markdown reference)
    - .prettierignore (snapshot protection)
  affects:
    - 06-04 orchestrator (firmAudit.ts) — imports renderAuditMarkdown
tech_stack:
  added: []
  patterns:
    - TS never-exhaustiveness switch (D-10 build-time enum enforcement)
    - Hand-rolled template-literal markdown (D-09 hybrid format)
    - External vitest snapshot (.snap file, not inline)
key_files:
  created:
    - src/audit/writer.ts
    - test/audit/writer.test.ts
    - test/audit/__snapshots__/writer.test.ts.snap
    - .prettierignore
  modified: []
decisions:
  - "statusLabel() and remediationToTargetPhase() both use `never` exhaustiveness — two independent TS never switches as required by plan acceptance criteria"
  - "evidenceSection disabledTag appended to heading per plan spec: '## <id> (<tier>, <status>) (disabled, baseline)'"
  - ".prettierignore created fresh (file did not exist); contains single exclusion for test/audit/__snapshots__/"
metrics:
  duration: "~3 min 24 sec"
  completed: "2026-04-20"
  tasks: 2
  files: 4
---

# Phase 06 Plan 03: AUDIT.md Serializer Summary

Pure-function markdown writer (AuditReport → string) with TS `never` exhaustiveness on both Status and Remediation enums; snapshot test locks the D-09 hybrid format output.

## Exported Function Signatures

```typescript
// src/audit/writer.ts

/**
 * Serialize an AuditReport to a markdown string per Phase 6 D-09 hybrid format.
 * Caller MUST write the entire returned string in ONE writeFile call (Pitfall 6).
 */
export function renderAuditMarkdown(report: AuditReport): string

/**
 * Map a Remediation value to its canonical target phase string.
 * Adding a new Remediation value without a case here fails `tsc --noEmit`.
 */
export function remediationToTargetPhase(r: Remediation): string
```

Plan 04 orchestrator usage:
```typescript
await writeFile(report.outputPath, renderAuditMarkdown(report), 'utf8');
```

## Snapshot File Location and Format Excerpt

`test/audit/__snapshots__/writer.test.ts.snap`

The summary table section (representative 5-line excerpt):

```
| Firm | Tier | Status | Items | Remediation | Target Phase |
|------|------|--------|-------|-------------|--------------|
| clifford-chance | rss | OK | 5 | n/a | n/a |
| bkl | html | detail-identical | 9 | enable-js-render-detail | Phase 7 |
| cooley (disabled, baseline) | rss | list-fail | 0 | migrate-to-sitemap | Phase 9 |
```

The full snapshot contains: header, 8-row summary table, 8 per-firm evidence sections, run metadata block.

## Never-Exhaustiveness Switch Confirmation

Both switches compile clean under `pnpm typecheck` (tsc --noEmit exits 0):

- **Remediation switch** in `remediationToTargetPhase()` — covers all 5 values:
  `enable-js-render-detail`, `fix-selector`, `disable-firm`, `migrate-to-sitemap`, `monitor`
- **Status switch** in `statusLabel()` — covers all 6 values:
  `OK`, `list-fail`, `selector-empty`, `detail-identical`, `detail-empty`, `detail-quality-unknown`

Adding a new enum value to `types.ts` without a matching case will cause `tsc --noEmit` to fail on the `_exhaustive: never` assignment — build-time D-10 enforcement is mechanical.

## Test Count

6 tests across 2 describe blocks:

| # | Test | Description |
|---|------|-------------|
| 1 | snapshot | 8-row AuditReport across all status × tier combos + disabled row |
| 2 | table row count | header + separator + N data rows (structural assertion) |
| 3 | null remediation | n/a renders in both table and evidence columns |
| 4 | disabled tag | (disabled, baseline) in summary table AND evidence heading |
| 5 | row order | input order preserved, no sorting |
| 6 | enum coverage | all 5 Remediation values map to correct target phase strings |

Full suite: 308 tests / 22 files — all green, zero regressions.

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | f5d288f | feat(06-03): implement AUDIT.md serializer with never-exhaustiveness enforcement |
| Task 2 | d2b226f | test(06-03): snapshot test for AUDIT.md writer + prettierignore guard |

## Deviations from Plan

None — plan executed exactly as written.

`.prettierignore` was created fresh (file did not previously exist) rather than appended. This is consistent with the plan's intent; the file now contains exactly the snapshot exclusion entry specified.

## Known Stubs

None. Writer is a pure function — no data sources, no stubs.

## Threat Flags

No new threat surface. `writer.ts` has zero network/fs/auth exposure. Evidence string is passed through verbatim per T-06-08 design: Plan 04 orchestrator is responsible for `scrubSecrets` before constructing `AuditRow.evidence`.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/audit/writer.ts | FOUND |
| test/audit/writer.test.ts | FOUND |
| test/audit/__snapshots__/writer.test.ts.snap | FOUND |
| .prettierignore | FOUND |
| Commit f5d288f | FOUND |
| Commit d2b226f | FOUND |
