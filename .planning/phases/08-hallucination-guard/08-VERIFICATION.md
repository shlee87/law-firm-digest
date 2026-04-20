---
phase: 08-hallucination-guard
verified: 2026-04-20T16:39:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 8: Hallucination Guard Verification Report

**Phase Goal:** Gemini is prevented from producing plausible-sounding but fabricated summaries when article body is absent, too short, or generic boilerplate — and clusters of identical summaries within a single firm's digest are automatically detected and flagged.
**Verified:** 2026-04-20T16:39:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Sending an empty body string to the summarizer produces `summary_ko` equal to the item title verbatim and `confidence: 'low'` — not a fabricated 3-sentence summary. | ✓ VERIFIED | Layer 1 short-circuit in `src/pipeline/run.ts`: `body.trim().length < 100` gate returns `summary_ko: item.title, summaryConfidence: 'low', summaryModel: 'skipped'`. Empty string has length 0 < 100. gemini.test.ts test (a)/(b) document this; run.test.ts "Phase 8 GUARD-01 Layer 1 short-circuit" suite asserts `summarizeMock` NOT called and items get `summary_ko === item.title`. |
| 2 | Sending a body shorter than 100 characters or a generic-firm-overview text to the summarizer produces the same title-verbatim + confidence:low result; sending a real article body (200+ chars, content-specific) produces a genuine 3–5 line Korean summary. | ✓ VERIFIED | Layer 1 (< 100 chars) → title-verbatim confirmed by run.test.ts Layer 1 describe block with 50-char 'x'.repeat(50) fixture. Layer 2 (generic body → Gemini returns '' → Option C substitutes item.title) confirmed by gemini.test.ts case (c): mock returns `summary_ko: ''`, assert `result.summary_ko === baseItem.title`. Real body (200+ chars, case (d)) → `result.summary_ko.includes('M&A')`, not equal to title. All 6 gemini.test.ts tests pass. |
| 3 | After summarizing a simulated bkl batch where 5 items share the same first 50 chars of summary, the run log contains a `HALLUCINATION_CLUSTER_DETECTED` marker with the firm id, and all 5 items are demoted to `confidence: 'low'`. | ✓ VERIFIED | `src/pipeline/detectClusters.ts`: `CLUSTER_THRESHOLD = 3`, groups by `summary_ko.slice(0, SIGNATURE_LENGTH)`. Console.error emits `HALLUCINATION_CLUSTER_DETECTED: firm=<id> count=<n> signature="<sig>"`. All 12 clusterDetection.test.ts tests pass, including test 1 (3 items → demoted + marker), test 12 (mixed: only clustered members demoted). 5-item D-14 test in digest.test.ts also confirms 5-cluster scenario. |
| 4 | The `HALLUCINATION_CLUSTER_DETECTED` marker appears in the GHA step-summary output and in the email footer — visible without opening raw logs. | ✓ VERIFIED | GHA step-summary: `src/observability/summary.ts` appends `## ⚠ Data Quality Warnings` section with `- **<firmId>**: HALLUCINATION_CLUSTER_DETECTED — <count> items demoted` per marker in a single `appendFile` call. Email footer: `src/compose/templates.ts::renderDataQualityFooter` renders `⚠ 데이터 품질 경고 — 요약 신뢰도 의심:` footer with `HALLUCINATION_CLUSTER_DETECTED (N items, 요약 숨김)` per cluster. summary.test.ts D-15 tests (4 tests) and digest.test.ts Phase 8 D-14 tests all pass. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types.ts` | SummarizedItem with `isClusterMember?: true` flag | ✓ VERIFIED | Line 92: `isClusterMember?: true;` present. Not referenced in `src/state/writer.ts` (runtime-only, not persisted). |
| `src/summarize/prompt.ts` | Gemini preamble with Layer 2 generic-body rule | ✓ VERIFIED | Lines 81-82: "title verbatim" and `confidence: 'low'` both present in preamble. 8 prompt tests pass (original 6 SUMM-06 gates + 2 new Layer 2 literal assertions). |
| `src/summarize/gemini.ts` | Option C post-parse substitution + catch block title-verbatim | ✓ VERIFIED | `parsed.summary_ko === ''` → returns `summary_ko: item.title` (Option C). Catch block: returns `summary_ko: item.title, summaryModel: 'failed'`. `summary_ko: null` count = 0. |
| `src/pipeline/run.ts` | Layer 1 short-circuit with `body.trim().length < 100` | ✓ VERIFIED | Exact check present. `summary_ko: null` count = 1 (only cli-skipped debugging path). `clusterAdjusted` propagates to all downstream consumers (newTotal, composeDigest, writeState, results). |
| `src/pipeline/detectClusters.ts` | `detectHallucinationClusters` pure function + `ClusterMarker` + `DetectionResult` | ✓ VERIFIED | All exports present. `CLUSTER_THRESHOLD = 3`, `SIGNATURE_LENGTH = 50`. `HALLUCINATION_CLUSTER_DETECTED` stderr marker emitted in cluster loop. Immutable (`.map + spread`). |
| `src/compose/templates.ts` | D-04 null-branch removed, D-13 badge, D-11/D-12 fold UI, D-14 footer | ✓ VERIFIED | `요약 없음 — 본문 부족` count = 0. `⚠ 본문 확보 실패` badge present. `⚠ 품질 의심 — 접힘` block present. `renderDataQualityFooter` function present. |
| `src/observability/summary.ts` | D-15 markdown section rendering | ✓ VERIFIED | `## ⚠ Data Quality Warnings` section added. `void markers` placeholder removed. Single `appendFile` call (Pitfall 5). |
| `test/summarize/gemini.test.ts` | GUARD-02 4-body-shape fixture tests | ✓ VERIFIED | 6 tests pass: (a)(b) documented, (c) Option C, (d) real body, (e) API-fail, (f) SUMM-06 spy. |
| `test/summarize/prompt.test.ts` | Layer 2 literal assertions | ✓ VERIFIED | 8 tests pass (6 original + 2 new GUARD-01 Layer 2 tests). |
| `test/pipeline/run.test.ts` | Layer 1 short-circuit describe block + reconciled null assertions | ✓ VERIFIED | 15 tests pass. Phase 8 GUARD-01 Layer 1 short-circuit describe block with 2 tests present. |
| `test/pipeline/clusterDetection.test.ts` | 12 unit tests for detectHallucinationClusters | ✓ VERIFIED | 12 tests pass. All decision points covered: threshold, scope, signature exactness, null exclusion, error skip, immutability, D-16 format, multibyte Korean, idempotence, mixed. |
| `test/observability/summary.test.ts` | D-15 test cases | ✓ VERIFIED | 8 tests pass (4 original + 4 new D-15 tests including Pitfall 5 single-call transactional test). |
| `test/compose/digest.test.ts` | Updated B3 test + cluster fold UI + D-14 footer tests | ✓ VERIFIED | 33 tests pass. `summary_ko: null` count = 0 in fixtures. Phase 8 D-04, D-13, D-11/D-12, D-14, XSS tests all present and green. |
| `test/compose/__snapshots__/digest.test.ts.snap` | Regenerated snapshot without null-placeholder | ✓ VERIFIED | `요약 없음 — 본문 부족` count = 0 in snapshot file. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/pipeline/run.ts` | `summarize()` | body passed ONLY when `body.trim().length >= 100` | ✓ WIRED | Short-circuit returns title-verbatim before calling `summarize(item, body)` |
| `src/summarize/gemini.ts` | `item.title` | substituted when Gemini returns `''` OR catch-block API failure | ✓ WIRED | `parsed.summary_ko === ''` → Option C; catch block → `summary_ko: item.title` |
| `src/summarize/prompt.ts` | Gemini preamble | Layer 2 rule appended as new paragraph | ✓ WIRED | "title verbatim" + `confidence: 'low'` both in preamble template literal |
| `src/pipeline/run.ts` | `src/pipeline/detectClusters.ts` | `import { detectHallucinationClusters, type ClusterMarker }` | ✓ WIRED | Import present; called at D-06 position between summarize close and newTotal reduce |
| `src/pipeline/run.ts` | `writeStepSummary` | `markers` passed as 3rd arg | ✓ WIRED | `writeStepSummary(recorder, allFirms, markers)` call; `markers` hoisted above try block |
| `src/pipeline/detectClusters.ts` | `console.error` | D-16 stderr marker per cluster | ✓ WIRED | Exact format: `HALLUCINATION_CLUSTER_DETECTED: firm=<id> count=<n> signature="<sig>"` |
| `src/compose/templates.ts` | `SummarizedItem.isClusterMember` | partition filter in sections loop | ✓ WIRED | `normal = items.filter(it => !it.isClusterMember)`, `demoted = items.filter(it => it.isClusterMember === true)` |
| `src/observability/summary.ts` | `$GITHUB_STEP_SUMMARY` file | single `appendFile` call with table + markers section | ✓ WIRED | `appendFile` count = 1; markers section conditionally appended to payload string |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/compose/templates.ts` renderHtml | `firms` (FirmResult[]) → `r.summarized` items | `clusterAdjusted` from `detectHallucinationClusters` in `run.ts` | Yes — cluster-adjusted array flows from real pipeline results | ✓ FLOWING |
| `src/observability/summary.ts` writeStepSummary | `markers` (ClusterMarker[]) | Hoisted `let markers` assigned from `detectHallucinationClusters(summarized).markers` in run.ts | Yes — populated only when real clusters detected | ✓ FLOWING |
| `src/pipeline/detectClusters.ts` | `summary_ko.slice(0, 50)` | Real summarized items from Gemini or Layer 1/2 short-circuits | Yes — actual summary text (not hardcoded) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Layer 1 short-circuit: `body.trim().length < 100` exact gate present | `grep -cE "body\.trim\(\)\.length < 100" src/pipeline/run.ts` | `1` | ✓ PASS |
| Option C substitution: empty Gemini response → item.title | `grep -c "summary_ko === ''" src/summarize/gemini.ts` | `2` | ✓ PASS |
| Catch block null eliminated | `grep -cE "summary_ko: null" src/summarize/gemini.ts` | `0` | ✓ PASS |
| D-16 marker format in detectClusters.ts | `grep -c "HALLUCINATION_CLUSTER_DETECTED" src/pipeline/detectClusters.ts` | `1` | ✓ PASS |
| D-15 section header in summary.ts | `grep -c "## ⚠ Data Quality Warnings" src/observability/summary.ts` | `1` | ✓ PASS |
| D-14 footer heading in templates.ts | `grep -c "데이터 품질 경고" src/compose/templates.ts` | `1` | ✓ PASS |
| Snapshot null-placeholder eliminated | `grep -c "요약 없음 — 본문 부족" test/compose/__snapshots__/digest.test.ts.snap` | `0` | ✓ PASS |
| Full test suite | `pnpm exec vitest run` | 373/373 passed (28 test files) | ✓ PASS |
| TypeScript compile | `pnpm exec tsc --noEmit` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| GUARD-01 | 08-01-PLAN.md | Gemini prompt includes explicit rule for empty/short/generic bodies → title-verbatim + confidence:low | ✓ SATISFIED | Layer 1 (run.ts < 100 chars), Layer 2 (prompt.ts preamble + gemini.ts Option C substitution), catch-block promotion. All confirmed by code + 6 gemini.test.ts tests + Layer 1 run.test.ts tests. |
| GUARD-02 | 08-02-PLAN.md | Fixture tests covering 4 body shapes | ✓ SATISFIED | test/summarize/gemini.test.ts: cases (a)(b) documented, (c) Option C, (d) real body. test/pipeline/run.test.ts Layer 1 block covers (a)(b) at integration level. 6+2+15 tests across files. |
| GUARD-03 | 08-03-PLAN.md + 08-05-PLAN.md | Post-summarize cluster detector: 3+ identical-prefix items demoted + HALLUCINATION_CLUSTER_DETECTED logged | ✓ SATISFIED | detectClusters.ts pure function, hooked in run.ts at D-06 position, 12 unit tests in clusterDetection.test.ts all pass. |
| GUARD-04 | 08-04-PLAN.md + 08-06-PLAN.md | HALLUCINATION_CLUSTER_DETECTED surfaces in GHA step-summary and email footer | ✓ SATISFIED | summary.ts D-15 markdown section (step-summary side). templates.ts renderDataQualityFooter (email footer side). Both confirmed by passing test suites. |

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `src/summarize/gemini.ts:109` | Comment referencing old null-branch placeholder | ℹ Info | Internal comment only, not rendering path — not a stub |
| `src/compose/templates.ts:13-16` | Comment describing Phase 8 changes | ℹ Info | Documentation comment only |

No blocking anti-patterns found.

### Human Verification Required

None. All success criteria are verifiable programmatically via code inspection and automated test execution.

The only items requiring human judgment are:
1. **Email visual rendering**: The `⚠ 본문 확보 실패` badge, fold-UI block, and data-quality footer appearance in actual Gmail client — but these are template concerns already covered by snapshot tests and structural assertions. No new human verification is required beyond standard UAT.
2. **GHA step-summary rendering**: The `## ⚠ Data Quality Warnings` markdown section appearance in GitHub Actions UI — requires a real cluster event to trigger. Covered structurally by test/observability/summary.test.ts D-15 tests.

These items are routine UAT concerns, not verification gaps.

### Gaps Summary

No gaps found. All 4 ROADMAP Success Criteria are met:

1. **SC-1** (empty body → title-verbatim + confidence:low): Layer 1 short-circuit confirmed in run.ts, tested in run.test.ts.
2. **SC-2** (short/generic → title-verbatim; real body → genuine summary): Layer 1 + Layer 2 + Option C all wired; gemini.test.ts cases (a)–(d) cover all shapes.
3. **SC-3** (5-item cluster → HALLUCINATION_CLUSTER_DETECTED + all demoted): detectClusters.ts threshold=3 covers 5-item case; clusterDetection.test.ts test 1 + digest.test.ts D-14 test both confirm.
4. **SC-4** (marker visible in step-summary + email footer): summary.ts D-15 + templates.ts D-14 both implemented and tested.

All 4 GUARD requirements (GUARD-01 through GUARD-04) verified as SATISFIED. Full test suite: 373 tests passing across 28 test files. TypeScript compiles clean.

---

_Verified: 2026-04-20T16:39:00Z_
_Verifier: Claude (gsd-verifier)_
