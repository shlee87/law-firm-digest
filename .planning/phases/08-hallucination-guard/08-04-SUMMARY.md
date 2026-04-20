---
phase: 08-hallucination-guard
plan: "04"
subsystem: compose
tags: [hallucination-guard, email-template, templates, phase-8, guard-04]

dependency_graph:
  requires:
    - plan: 08-01
      provides: isClusterMember flag on SummarizedItem + summaryModel=skipped sentinel
    - plan: 08-03
      provides: detectHallucinationClusters + ClusterMarker type
  provides:
    - renderHtml with D-04 null-branch removed + D-11/D-12 fold UI + D-13 B3 badge + D-14 renderDataQualityFooter
    - renderDataQualityFooter (D-14)
    - deriveMarkersFromFirms (template-internal ClusterMarker reconstruction)
  affects:
    - 08-05 (step-summary — separate plan, unaffected by template changes)
    - 08-06 (verification sweep — consumes template output)

tech_stack:
  added: []
  patterns:
    - "D-11/D-12 partition: r.summarized.filter(!isClusterMember) vs filter(isClusterMember===true)"
    - "D-13 badge: it.summaryModel === 'skipped' → span with color:#f57f17 warning badge inline in summary paragraph"
    - "D-14 deriveMarkersFromFirms: template-internal marker reconstruction (Option 2 — no composeDigest signature change)"
    - "renderDataQualityFooter mirrors renderFailedFirmsFooter shape exactly (same outer footer styles)"

key_files:
  created: []
  modified:
    - src/compose/templates.ts
    - test/compose/digest.test.ts
    - test/compose/__snapshots__/digest.test.ts.snap

key_decisions:
  - "Option 2 marker threading: deriveMarkersFromFirms scans firms internally — composeDigest signature unchanged (11+ call sites unaffected)"
  - "D-13 badge condition: summaryModel === 'skipped' AND !isClusterMember (not folded) — shows '⚠ 본문 확보 실패' inline"
  - "summaryText fallback: summary_ko ?? it.title — defensive for any residual cli-skipped null path (never reached in real runs per Plan 01)"
  - "Snapshot regeneration: -u flag regenerates; '요약 없음 — 본문 부족' confirmed absent from snap file"

requirements_completed: [GUARD-04]

metrics:
  duration: ~8min
  completed: 2026-04-20
  tasks: 2
  files: 3
---

# Phase 08 Plan 04: Email Template Phase 8 Rendering — D-04/D-11/D-12/D-13/D-14 Summary

**Removed `요약 없음 — 본문 부족` null-branch; added D-13 `⚠ 본문 확보 실패` badge for skipped singletons, D-11/D-12 fold-UI for cluster-demoted items, and D-14 `renderDataQualityFooter` between failed-firms footer and disclaimer.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-20
- **Tasks:** 2
- **Files modified:** 3 (1 src, 1 test, 1 snapshot)

## Accomplishments

- **D-04 eliminated:** `요약 없음 — 본문 부족` null-branch completely removed from `templates.ts` and snapshot
- **D-11/D-12 fold UI:** `r.summarized` partitioned into `normal[]` / `demoted[]` by `isClusterMember`; demoted items render as `<ul>` with title + 원문 보기 only — hallucinated summary text hidden
- **D-13 badge:** `summaryModel === 'skipped'` items in normal partition show `⚠ 본문 확보 실패` inline badge (orange, 11px)
- **D-14 footer:** `renderDataQualityFooter(markers)` mirrors `renderFailedFirmsFooter` shape; `deriveMarkersFromFirms` reconstructs `ClusterMarker[]` by scanning `isClusterMember` without touching `composeDigest` signature
- **Snapshots regenerated:** both snapshot entries updated; `요약 없음 — 본문 부족` confirmed absent
- **33 tests pass** in `digest.test.ts` (existing + 4 new Phase 8 tests)

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite renderHtml: D-04 removed, D-13 badge, D-11/D-12 fold UI, D-14 footer | `47726aa` | src/compose/templates.ts |
| 2 | Update digest.test.ts fixtures + Phase 8 tests + snapshot regeneration | `30f271a` | test/compose/digest.test.ts, __snapshots__/digest.test.ts.snap |

## Lines Changed in templates.ts

| Change | Description |
|--------|-------------|
| Line 13-17 (header comment) | Updated from old null-placeholder description to Phase 8 D-04/D-11/D-12/D-13/D-14 summary |
| Line 47 (import) | Added `import type { ClusterMarker } from '../pipeline/detectClusters.js'` |
| Lines 55-100 (sections loop) | Replaced flat `.map()` with partition logic (normal/demoted) + D-13 badge branch + D-11/D-12 demotedBlock |
| Lines 102-113 (renderHtml return) | Added `deriveMarkersFromFirms` call + `${dataQualityFooter}` injection between failedFooter and disclaimer |
| Lines 172-215 (new functions) | Added `renderDataQualityFooter` + `deriveMarkersFromFirms` after `renderFailedFirmsFooter` |

## New Test Names

1. `Phase 8 D-04: null-branch placeholder "요약 없음 — 본문 부족" is REMOVED from all rendering paths`
2. `Phase 8 D-13: B3 title-verbatim singleton (summaryModel==="skipped") shows ⚠ 본문 확보 실패 badge`
3. `Phase 8 D-11/D-12: cluster-demoted items (isClusterMember=true) fold under 품질 의심 block, summaries hidden`
4. `Phase 8 D-14: renderDataQualityFooter emits ⚠ 데이터 품질 경고 footer with HALLUCINATION_CLUSTER_DETECTED per affected firm`
5. `Phase 8 D-14: no clusters → data-quality footer NOT rendered (clean-run invisible posture)`
6. `Phase 8 D-14 XSS: marker firmName with <script> is escaped`

## Snapshot Verification

```
grep -c "요약 없음 — 본문 부족" test/compose/__snapshots__/digest.test.ts.snap
→ 0 (PASS)
```

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All user-controlled fields passing into HTML continue to use `escapeHtml` / `escapeAttr`. T-08-04-01 (XSS via firmName in data-quality footer) covered by `escapeHtml(m.firmName)` + Phase 8 XSS assertion. T-08-04-03 (hallucinated summary leaking through fold UI) covered by explicit `not.toContain()` assertion.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All rendering paths are wired to real data. `deriveMarkersFromFirms` reconstructs markers from `isClusterMember` flag set by Plan 03's detector — no stubs remain.

## Self-Check: PASSED

- `src/compose/templates.ts` exists: FOUND
- `47726aa` exists: FOUND
- `30f271a` exists: FOUND
- `grep -c "요약 없음 — 본문 부족" src/compose/templates.ts` = 0: PASS
- `grep -c "요약 없음 — 본문 부족" test/compose/__snapshots__/digest.test.ts.snap` = 0: PASS
- `grep -c "본문 확보 실패" src/compose/templates.ts` = 3: PASS (>=1)
- `grep -c "품질 의심 — 접힘" src/compose/templates.ts` = 1: PASS
- `grep -c "데이터 품질 경고" src/compose/templates.ts` = 1: PASS
- `grep -c "HALLUCINATION_CLUSTER_DETECTED" src/compose/templates.ts` = 1: PASS
- `pnpm exec tsc --noEmit` exits 0: PASS
- `pnpm exec vitest run test/compose/digest.test.ts` 33/33 tests pass: PASS
