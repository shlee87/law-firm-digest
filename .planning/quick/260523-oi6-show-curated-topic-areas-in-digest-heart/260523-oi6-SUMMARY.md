---
quick_id: 260523-oi6
status: complete
completed_at: 2026-05-23
description: Add curated topic areas footer to digest + heartbeat emails
files_modified:
  - src/compose/templates.ts
  - src/compose/digest.ts
  - src/compose/heartbeat.ts
  - src/pipeline/runWeekly.ts
  - test/compose/templates.test.ts (new)
  - test/compose/digest.test.ts
  - test/compose/heartbeat.test.ts
  - test/compose/__snapshots__/digest.test.ts.snap
  - test/pipeline/runWeekly.e2e.test.ts (Rule 1 deviation — see below)
acceptance_gates:
  - "pnpm vitest run test/compose/templates.test.ts test/compose/digest.test.ts test/compose/heartbeat.test.ts: 58/58 passed"
  - "pnpm tsc --noEmit: exit 0"
  - "pnpm vitest run (full suite): 488/488 passed"
---

# Quick 260523-oi6: Curated Topic Areas Footer — Summary

## What Was Built

Single-line Korean footer added to BOTH digest and heartbeat emails:

> 현재 이 다이제스트는 다음 분야를 큐레이션합니다: VC·증권, 공정거래, 개인정보, 노동법, 지식재산권.

- Reads from `loadTopics()` at `runWeekly` compose time — not a hard-coded list
- Editing `config/firms.yaml` `topics:` block changes the email next run
- Unmapped keys pass through verbatim as snake_case (no crash on YAML extension)
- Empty TopicConfig (`{}`) renders nothing (clean-run invisible posture)
- Positioned BEFORE legal disclaimer in digest, BEFORE "시스템은 정상 작동 중입니다." in heartbeat

## Files Modified

| File | Change |
|------|--------|
| `src/compose/templates.ts` | Added `TopicConfig` import + `TOPIC_LABEL_KO` const + `renderCuratedTopicsFooter` export + 8th param `topics: TopicConfig = {}` on `renderHtml` + `${curatedTopics}` interpolation between `${coverageBar}` and `${footer}` |
| `src/compose/digest.ts` | Added `TopicConfig` import + 7th param `topics: TopicConfig = {}` on `composeDigest` + forwards to `renderHtml` as 8th arg |
| `src/compose/heartbeat.ts` | Added `TopicConfig` import + `renderCuratedTopicsFooter` import + 4th param `topics: TopicConfig = {}` on `composeHeartbeat` + wraps the `<tr>` row in a minimal `<table>` for valid nesting inside the plain-paragraph body, placed BEFORE the "시스템은 정상 작동 중입니다." closing line |
| `src/pipeline/runWeekly.ts` | Added `loadTopics` to existing loader import + `const topics = await loadTopics();` alongside other config loads + threaded `topics` into both `composeHeartbeat` (4th arg) and `composeDigest` (7th arg) call sites |
| `test/compose/templates.test.ts` | NEW FILE — 6 unit tests: 5-label rendering, empty=`''`, unknown-key pass-through, iteration order preservation, empty-keyword-list non-exclusion, XSS escape defense |
| `test/compose/digest.test.ts` | Added new `describe('composeDigest curated topics footer (quick 260523-oi6)')` block with Tests A/B/C |
| `test/compose/heartbeat.test.ts` | Added new top-level `describe('composeHeartbeat curated topics footer (quick 260523-oi6)')` block with Tests D/E |
| `test/compose/__snapshots__/digest.test.ts.snap` | Snapshot updated — whitespace-only diff (2 lines × 8 spaces each) from the empty `${curatedTopics}` interpolation at the new site. Zero visible content change. Confirmed by `git diff` inspection. |
| `test/pipeline/runWeekly.e2e.test.ts` | **Rule 1 deviation** — see Deviations section below |

## Snapshot Update Justification

The `digest.test.ts.snap` snapshot updated with two added lines, each containing exactly 8 spaces (the template literal indent that wraps `${curatedTopics}`). When `topics={}` (the existing test path), `renderCuratedTopicsFooter` returns `''`, so the template interpolation collapses to whitespace-only — no new DOM tags, no new visible content. This matches the plan's acceptance shape #2: "Only the inserted empty-string interpolation site adds harmless whitespace". The Test C invariant ("topics omitted → curated-topics prose absent") confirms no regression.

Inspected diff:
```
@@ -80,6 +80,7 @@
...
   </td></tr>
+        
         <tr><td style="padding:28px 32px 40px;...">
```

## D-01 Invariant Verification

```bash
grep -n "composeDigest\|composeHeartbeat" src/pipeline/runDaily.ts
```

Returns 3 matches, **all inside FORBIDDEN-imports comment blocks** asserting D-01 cross-mode invariant:
- Line 20: `// writeArchive, composeDigest, composeHeartbeat, detectHallucinationClusters,` (header narrative)
- Line 68: `//   - '../compose/digest.js' (composeDigest)` (FORBIDDEN imports list)
- Line 69: `//   - '../compose/heartbeat.js' (composeHeartbeat — Plan 13-04 creates this)` (FORBIDDEN imports list)

Zero non-comment matches. **D-01 invariant preserved** — runDaily still does NOT import the compose layer.

## Acceptance Gate Output

**Gate 1: targeted vitest**
```
$ pnpm vitest run test/compose/templates.test.ts test/compose/digest.test.ts test/compose/heartbeat.test.ts
 Test Files  3 passed (3)
      Tests  58 passed (58)
```

**Gate 2: typecheck**
```
$ pnpm tsc --noEmit
(exit 0, no output)
```

**Bonus: full test suite (regression check)**
```
$ pnpm vitest run
 Test Files  36 passed (36)
      Tests  488 passed (488)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed runWeekly.e2e.test.ts loader mock missing `loadTopics`**

- **Found during:** Final full-suite regression check after Task 2 wiring
- **Issue:** `test/pipeline/runWeekly.e2e.test.ts` declares `vi.mock('../../src/config/loader.js', ...)` exposing only `loadFirms / loadRecipient / loadSettings`. My change to `runWeekly.ts` (adding `await loadTopics()`) triggered vitest's strict-mock error: `No "loadTopics" export is defined on the "../../src/config/loader.js" mock`. All 3 e2e tests failed.
- **Why it was in scope:** The failure is DIRECTLY caused by this task's `loadTopics()` addition to `runWeekly.ts`. Per the deviation rule "Only auto-fix issues DIRECTLY caused by the current task's changes," this is a Rule 1 fix.
- **Fix:** Added `loadTopicsMock: vi.fn()` to the `vi.hoisted` mocks block, exposed it as `loadTopics: mocks.loadTopicsMock` in the loader mock factory, and set `mocks.loadTopicsMock.mockResolvedValue({})` in `beforeEach` alongside the other config-mock defaults. Empty topics matches the existing e2e fixtures (no curated-topics footer expected in these tests; no other assertions affected).
- **Files modified:** `test/pipeline/runWeekly.e2e.test.ts`
- **Verification:** `pnpm vitest run test/pipeline/runWeekly.e2e.test.ts` — 3/3 passing.

The plan's `files_modified` frontmatter did not include this test file, but the fix is the minimum-surface change required to keep the existing test contract intact after the runWeekly.ts loader-deps expansion. No production-code logic touched in this file; only the mock surface widened.

### Skipped optional steps

- **Manual visual sanity check** (plan §verification): The plan-supplied `tsx --loader -e "..."` inline snippet failed with `Cannot find module './src/compose/heartbeat.js'` because the tsx-eval CJS loader resolves the inline import statement against CWD-as-CJS rather than the project's ESM tsconfig context. Not a functional issue — the heartbeat behavior is fully locked by Tests D + E (positional invariant + content match) plus the digest integration tests. The visual check was non-blocking per plan.

## Commit

Single commit: `feat(compose): add curated topic areas footer to digest + heartbeat emails`

## Success Criteria Status

- [x] Both digest and heartbeat render the locked Korean footer when TopicConfig is populated
- [x] Footer positioned above legal disclaimer (digest) / "시스템은 정상 작동 중입니다." (heartbeat)
- [x] Footer absent when TopicConfig is empty (clean-run invisible posture)
- [x] Footer absent when callers omit the new arg (backwards-compat — Tests C + E)
- [x] Topic keys come from `loadTopics()` at runWeekly compose time
- [x] Unmapped topic keys render as raw snake_case (no crash, no silent drop)
- [x] Targeted vitest + `tsc --noEmit` green
- [x] D-01 cross-mode invariant preserved (no compose imports in runDaily.ts)
- [x] Single commit with the locked message
