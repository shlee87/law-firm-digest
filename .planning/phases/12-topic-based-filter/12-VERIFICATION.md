---
phase: 12-topic-based-filter
verified: 2026-04-21T14:21:00Z
status: human_needed
score: 5/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run DRY_RUN=1 pnpm tsx src/main.ts and check for [filter] skipped lines"
    expected: "For any fetched items that do not match vc_securities/fair_trade/privacy/labor/ip keywords, console output shows '[filter] skipped — no topic match: <title>'. If all today's items happen to match, no skip lines appear — that is also correct. State log '[DRY_RUN] would write state/seen.json with N URLs across M firms' confirms writeState path was exercised."
    why_human: "Requires a live network run against real law firm sites. The [filter] skip log lines only appear when at least one fetched item today matches no keyword. Cannot be verified offline or via unit tests."
---

# Phase 12: Topic-Based Filter Verification Report

**Phase Goal:** The pipeline filters each newsletter item by topic relevance before body fetch and summarization, so only items related to VC/securities, 공정거래, 개인정보, 노동법, or IP are delivered in the digest.
**Verified:** 2026-04-21T14:21:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | config/firms.yaml contains a `topics:` block with keyword lists for all 5 practice areas — editing the list changes filter behavior with no code change | ✓ VERIFIED | `config/firms.yaml` lines 1–118: `topics:` block with `vc_securities` (17 kw), `fair_trade` (13 kw), `privacy` (17 kw), `labor` (19 kw), `ip` (18 kw) including all D-01..D-05 keywords and both `라이선스`/`라이센스` variants. No code change required — `loadTopics()` reads from this file directly. |
| 2 | `isTopicRelevant(title, body, topics)` returns true on title/body match, false on no match, and true unconditionally on empty body | ✓ VERIFIED | `src/pipeline/filter.ts` lines 88–103: pure function, `if (!body.trim()) return true` (D-11 permissive), 500-char window, case-insensitive via `.toLowerCase()`. All 8 unit tests pass (cases a–h). |
| 3 | `pnpm dry-run` prints `[filter] skipped — no topic match: <title>` for non-matching items, and those items do not appear in digest HTML | PARTIAL (automated) / ? HUMAN NEEDED | Code verified: `run.ts` lines 243–247 log the skip lines; topic-filtered items moved to `r.topicFiltered` and removed from `r.raw` before `dedupAll`, so they never reach `r.new`, `r.summarized`, or `composeDigest`. Log line and exclusion from digest HTML are code-correct but require a live network run to observe actual [filter] skip output. |
| 4 | Filtered-out items appear in seen.json after a run — running twice on same data shows dedup: 0 new for filtered items | ✓ VERIFIED | `src/state/writer.ts` lines 109–112: `topicFilteredUrls` extracted from `r.topicFiltered ?? []`, deduplicated against existing and summarizedUrls, merged into `newUrls`, then included in the 500-cap slice. `lastNewAt` correctly advances only on `summarizedUrls.length > 0`. |
| 5 | `pnpm vitest run` passes with 448+ tests (all new filter tests included) | ✓ VERIFIED | Test run output: 456/456 tests pass across 31 test files. 8 new `isTopicRelevant` tests in `test/pipeline/filter.test.ts` all GREEN. Zero regressions. |
| 6 | No `genai` or `summarize` calls exist in `src/pipeline/filter.ts` (zero additional Gemini RPD) | ✓ VERIFIED | `src/pipeline/filter.ts` has exactly one import: `import type { FirmResult, RawItem, TopicConfig } from '../types.js'`. Two grep hits for "genai"/"summarize" are both in comment text, not executable code. |

**Score:** 5/6 truths verified (SC-3 requires human confirmation for live run output)

### Deferred Items

None identified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `config/firms.yaml` | `topics:` block with 5 practice areas and D-01..D-05 keywords | ✓ VERIFIED | Lines 1–118: all 5 areas present, 84 total keywords including both 라이선스/라이센스 and 라이선싱/라이센싱 variants |
| `src/types.ts` | `TopicConfig` exported type alias | ✓ VERIFIED | Line 125: `export type TopicConfig = Record<string, string[]>;` |
| `src/types.ts` | `FirmResult.topicFiltered?: RawItem[]` field | ✓ VERIFIED | Lines 107–112: documented with Phase 12 D-09 comment, typed correctly |
| `src/config/schema.ts` | `FirmsConfigSchema` accepts `topics:` without breaking `.strict()` | ✓ VERIFIED | Lines 180–188: `topics: z.record(z.string(), z.array(z.string())).optional().default({})` inside `.strict()` object |
| `src/config/loader.ts` | `loadTopics(): Promise<TopicConfig>` exported async function | ✓ VERIFIED | Lines 69–79: exact mirror of `loadFirms` safeParse+stderr+throw pattern |
| `src/pipeline/filter.ts` | `isTopicRelevant` and `applyTopicFilter` exported functions | ✓ VERIFIED | Lines 88–141: both functions implemented, pure, no I/O |
| `src/pipeline/run.ts` | `applyTopicFilter` call after `applyKeywordFilter` + `loadTopics()` call + per-item log | ✓ VERIFIED | Line 70: `loadTopics` imported; line 74: `applyTopicFilter` imported; line 141: `const topics = await loadTopics()`; lines 241–248: filter + log loop; line 250: `dedupAll(topicFiltered, seen)` |
| `src/state/writer.ts` | `topicFiltered` URL merge in subsequent-run branch | ✓ VERIFIED | Lines 109–112: `topicFilteredUrls` extracted and merged |
| `test/pipeline/filter.test.ts` | 8-case `isTopicRelevant` describe block + `makeTopics()` helper | ✓ VERIFIED | Lines 198–250: `makeTopics()` at line 198, describe block at line 209, 8 `it()` cases (a)–(h), all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/pipeline/run.ts` | `src/pipeline/filter.ts:applyTopicFilter` | `import { applyKeywordFilter, applyTopicFilter } from './filter.js'` | ✓ WIRED | Line 74 import + line 241 call |
| `src/pipeline/run.ts` | `src/config/loader.ts:loadTopics` | `import { loadFirms, loadRecipient, loadTopics } from '../config/loader.js'` | ✓ WIRED | Line 70 import + line 141 call |
| `src/pipeline/run.ts` | `src/state/writer.ts:writeState` | `writeState(seen, clusterAdjusted)` — carries `r.topicFiltered` arrays through spread-preserving pipeline | ✓ WIRED | `clusterAdjusted` carries `topicFiltered` because `detectHallucinationClusters` spreads `...r` preserving all fields. `writeState` at line 412 reads `r.topicFiltered` |
| `src/state/writer.ts` | `FirmResult.topicFiltered` | `(r.topicFiltered ?? []).map(it => it.url)` | ✓ WIRED | Lines 109–112 in writer.ts |
| `test/pipeline/filter.test.ts` | `src/pipeline/filter.ts:isTopicRelevant` | `import { applyKeywordFilter, isTopicRelevant } from '../../src/pipeline/filter.js'` | ✓ WIRED | Line 18 import, used in all 8 test cases |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/pipeline/filter.ts:applyTopicFilter` | `topics: TopicConfig` | `loadTopics()` reads `config/firms.yaml` → `FirmsConfigSchema.safeParse` → `result.data.topics` | Yes — 5 areas × ~17 avg keywords from YAML | ✓ FLOWING |
| `src/state/writer.ts` | `topicFilteredUrls` | `r.topicFiltered` array carried from `applyTopicFilter` output through dedup/summarize/detectClusters pipeline spread | Yes — real RawItem objects moved from `r.raw` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles cleanly | `pnpm tsc --noEmit` | Exit 0, no output | ✓ PASS |
| All tests pass (456 expected) | `pnpm vitest run` | 456/456 tests, 31 files | ✓ PASS |
| filter.test.ts: 17 tests (9 applyKeywordFilter + 8 isTopicRelevant) | `pnpm vitest run test/pipeline/filter.test.ts` | 17/17 passed | ✓ PASS |
| firms.yaml topics block parseable with 5 keys | Node YAML parse in verification | `vc_securities`, `fair_trade`, `privacy`, `labor`, `ip` present | ✓ PASS |
| No genai import in filter.ts | `grep "^import" src/pipeline/filter.ts` | Single import: `../types.js` only | ✓ PASS |
| Live [filter] skip log output on dry-run | `DRY_RUN=1 pnpm tsx src/main.ts` | Not executed (requires live network) | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SPEC-12-REQ-1 | 12-01 | Topic keyword config in firms.yaml — 5 practice areas, editible without code change | ✓ SATISFIED | `config/firms.yaml` topics block present and read by `loadTopics()` |
| SPEC-12-REQ-2 | 12-01, 12-02 | `isTopicRelevant(title, body, topics): boolean` — title OR body match, case-insensitive | ✓ SATISFIED | Implemented in `filter.ts` lines 88–103, 8 unit tests GREEN |
| SPEC-12-REQ-3 | 12-01, 12-02 | Permissive on empty body — `isTopicRelevant(title, '', topics)` returns true | ✓ SATISFIED | `if (!body.trim()) return true` at filter.ts line 94; test case (e) GREEN |
| SPEC-12-REQ-4 | 12-02 | Pipeline integration — filter after enrichBody, before summarize; non-matching → seen.json only | ✓ SATISFIED | `applyTopicFilter` called at run.ts line 241, between `applyKeywordFilter` and `dedupAll`; items in `r.topicFiltered` never reach `r.summarized` or digest |
| SPEC-12-REQ-5 | 12-02 | Filtered items in seen.json — URL-recorded as seen on each run | ✓ SATISFIED | `writer.ts` lines 109–112 merge `topicFilteredUrls` alongside `summarizedUrls` |
| SPEC-12-REQ-6 | 12-01, 12-02 | No extra Gemini API calls — keyword matching only, no genai/summarize in filter | ✓ SATISFIED | `filter.ts` imports only `../types.js`; grep confirms zero genai/summarize executable code |

All 6 SPEC-12 requirements are covered. Note: SPEC-12-REQ-* are phase-local identifiers defined in `12-SPEC.md` and do not appear in the global `REQUIREMENTS.md` traceability table, which covers only v1/v1.1 requirement IDs (FETCH-xx, DEDUP-xx, etc.). This is expected — the SPEC-12 requirements were introduced in Phase 12's spec process.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scanned: `src/pipeline/filter.ts`, `src/config/loader.ts`, `src/config/schema.ts`, `src/types.ts`, `src/pipeline/run.ts`, `src/state/writer.ts`, `test/pipeline/filter.test.ts`. No TODO/FIXME/placeholder comments, no empty return stubs, no hardcoded empty data that flows to rendering.

### Human Verification Required

#### 1. Live dry-run [filter] skip log output

**Test:** Run `DRY_RUN=1 pnpm tsx src/main.ts 2>&1 | grep -E "\[filter\]|after filter"` from the project root.

**Expected:**
- If any fetched items today do not match any keyword across the 5 topic areas: output shows one or more lines like `[filter] skipped — no topic match: <title>`.
- If all items today match at least one keyword: no `[filter]` lines appear — that is also correct behavior.
- In all cases: `[DRY_RUN] would write state/seen.json with N URLs across M firms` confirms writeState exercised.

**Why human:** Requires live network access to 13 law firm sites. The `[filter] skipped` lines only appear when at least one item today matches no keyword — cannot be predicted or mocked without real data. This is the only part of SC-3 that cannot be confirmed programmatically.

### Gaps Summary

No gaps blocking goal achievement. All 6 SPEC-12 requirements are implemented and verified at code level. The single human verification item (SC-3 live dry-run output) is a behavioral confirmation requirement that depends on live network data — it does not indicate missing implementation.

---

_Verified: 2026-04-21T14:21:00Z_
_Verifier: Claude (gsd-verifier)_
