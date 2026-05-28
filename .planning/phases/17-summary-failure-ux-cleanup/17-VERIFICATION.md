---
status: passed
phase: 17-summary-failure-ux-cleanup
verified: 2026-05-28
verifier: inline (subagent verification skipped — nested-Agent unavailable; SDK-level validation PASS)
must_haves_total: 5
must_haves_passed: 5
human_verification: 0
gaps: 0
---

# Phase 17 Verification — Summary Failure UX Cleanup

**Goal:** Hide Gemini summary failure technicals from digest email body, preserve operator-visible signal, update CLAUDE.md free-tier RPM table, honor retryDelay in p-retry.

## Acceptance Gate Sweep

### AC1 — Title duplication removed (FAIL-UX-01 / SPEC requirement 1)

- **Source verification:** `src/compose/templates.ts` `renderArticle()` has a top-of-function `if (it.summaryModel === 'failed')` branch that returns title + tag + read-link, with the body `<p>` omitted entirely. `it.summaryError` is not referenced anywhere in the file.
- **Test verification:** `test/compose/templates.test.ts` test `failed item does not duplicate title in body paragraph` — PASS. Asserts `html.split(escapedTitle).length - 1 === 1` against the Latham EU ETS fixture.
- **Smoke verification:** Local render of the Latham EU ETS fixture produced exactly one occurrence of the escaped title in the full HTML.

PASS

### AC2 — Raw error JSON / quota / retryDelay never in recipient HTML (SPEC requirement 2)

- **Source verification:** `grep -nE "it\.summaryError" src/compose/templates.ts` → 0 matches; `grep -nE "summaryError\.slice" src/compose/templates.ts` → 0 matches.
- **Test verification:** `test/compose/templates.test.ts` test `failed item does not leak raw error JSON, quota, retryDelay, or RESOURCE_EXHAUSTED patterns to recipient HTML` — PASS. 8-pattern deny-list (`"code":\s*\d+`, `&quot;code&quot;:`, `"error"\s*:\s*\{`, `&quot;error&quot;`, `RESOURCE_EXHAUSTED`, `exceeded your current quota`, `retryDelay`, `generativelanguage\.googleapis`) zero matches.
- **Smoke verification:** Local render: all 5 spot-check patterns ("`code`:N", `RESOURCE_EXHAUSTED`, `retryDelay`, `generativelanguage`, `exceeded your current quota`) absent.

PASS

### AC3 — Operator-visible failure signal preserved (SPEC requirement 3)

- **Source verification:** `grep -nE "console\.error" src/summarize/gemini.ts` → line 235 still present. `summaryModel: 'failed'` catch path at line 246 intact. step-summary recorder shape (in `src/observability/`) untouched.
- **Test verification:** Existing test `(e) API failure (retry-exhausted) — catch-block returns title-verbatim + summaryModel="failed"` (gemini.test.ts) — PASS unchanged.

PASS

### AC4 — CLAUDE.md free-tier table updated (SPEC requirement 4)

- `grep -nE 'gemini-2\.5-flash[^-].*5 \(observed 2026-05-27\)' CLAUDE.md` → line 29 match.
- `grep -nE 'share the same.*quota metric.*model fallback alone does NOT unstick' CLAUDE.md` → line 32 match.
- Diff: 1 modification + 1 quote-block addition, scoped to the Critical Correction section. `gemini-2.5-pro` and `gemini-2.5-flash-lite` rows unchanged.

PASS

### AC5 — retryDelay honored in p-retry sleep (SPEC requirement 5 / D-06)

- **Source verification:** `parseRetryDelaySeconds` helper defined in `src/summarize/gemini.ts:82`. `onFailedAttempt` is `async` (line 203). Sleep block in lines 221-224. 60s cap inside parser (Math.min at lines 93 and 104).
- **Test verification:** All 4 new tests pass — structured-shape parse with 25s pre-fire / 35s post-fire, message-body fallback parse, 3600s clamped to 60s, no-retryDelay 429 still completes.

PASS

## Test Suite

`pnpm test` → 36 files, 495/495 tests passing. +7 new tests (3 in `test/compose/templates.test.ts`, 4 in `test/summarize/gemini.test.ts`).

## Goal-Backward Visual Check

Local render against the 2026-05-27 Latham EU ETS fixture produced the expected card layout:

```
2026.05.27 (meta line)
EU ETS: European Commission Announces Additional Flexibilities, Including Updated Benchmarks
⚠ 요약 일시 불가 (muted-gray monospace)
원문 읽기 →
```

No body `<p>`. No error JSON. No `⚠ 요약 실패` red badge. Tag styled with `JetBrains Mono` + `COLOR.muted` (#6B6A66) — same weight as meta-line.

## Plan Summaries

- `17-01-SUMMARY.md` — renderArticle failed branch + title-occurrence / deny-list / tag tests. (commit `1cda441`)
- `17-02-SUMMARY.md` — onFailedAttempt async + parseRetryDelaySeconds + 4 retryDelay tests. (commit `14a0e28`)
- `17-03-SUMMARY.md` — CLAUDE.md table + quote-block. (commit `24deed1`)

## Boundary Deviations

- Plan 17-01: extended file boundary to include `test/compose/digest.test.ts` + `test/compose/__snapshots__/digest.test.ts.snap` because pre-existing assertions/snapshots locked the legacy `⚠ 요약 실패` rendering. Documented in plan's SUMMARY.md "Deviations from Plan" section.

## Verification Note

Subagent verification skipped because nested-Agent spawn is unavailable in this harness context (depth ≥ 1). Inline verification used: source grep + full test suite run + goal-backward smoke render. All SPEC requirement 1–5 acceptance criteria pass.

---

*Verified: 2026-05-28*
