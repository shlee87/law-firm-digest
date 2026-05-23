---
quick_id: 260523-mtz
mode: quick
type: execute
wave: 1
autonomous: true
files_modified:
  - src/observability/recorder.ts
  - test/observability/recorder.test.ts
requirements: [DQOBS-01, DQOBS-02]
must_haves:
  truths:
    - "Weekly step-summary GUARD column renders integer (not em-dash) when runWeekly populates guardCount via recorder"
    - "Weekly step-summary H/M/L column renders H/M/L counts (not em-dash) when runWeekly populates confidence(h,m,l) via recorder"
    - "Truly-empty firms (no fetched, no body, no guard, no confidence) still render as em-dash — daily-side mid-stage-throw honesty preserved"
    - "All 22 pre-existing Recorder tests stay green (no behavioral regression on daily/Phase-10 contract)"
  artifacts:
    - path: "src/observability/recorder.ts"
      provides: "Extended isEmptyFirm predicate (fetched + bodyLengths + guardCount + confidence all zero)"
      contains: "guardCount === 0"
    - path: "test/observability/recorder.test.ts"
      provides: "Focused weekly-pattern regression test for DQOBS-01"
      contains: "runWeekly"
  key_links:
    - from: "src/pipeline/runWeekly.ts:197"
      to: "src/observability/recorder.ts:157"
      via: "recorder.firm(id).guardCount(n) writes guardCount; new predicate reads it"
      pattern: "guardCount"
    - from: "src/pipeline/runWeekly.ts:201"
      to: "src/observability/recorder.ts:157"
      via: "recorder.firm(id).confidence(h,m,l) writes confidenceH/M/L; new predicate reads them"
      pattern: "confidence"
---

<objective>
Fix DQOBS-01 weekly observability regression flagged in `.planning/v1.1-MILESTONE-AUDIT.md` BLOCKER-1.

**Root cause:** Phase 13's daily/weekly pipeline split routes weekly metric writes (`recorder.firm(id).guardCount(...)` at runWeekly.ts:197, `.confidence(h,m,l)` at runWeekly.ts:201) through the recorder WITHOUT calling `.fetched(n)` first (weekly reads pending — it never fetches). The current `isEmptyFirm` predicate at `src/observability/recorder.ts:157` (`m.fetched === 0 && m.bodyLengths.length === 0`) then blanks the GUARD + H/M/L columns to em-dash in the weekly step-summary, suppressing data the recorder already holds.

**Fix surface:** Extend the recorder predicate (Option B from audit). A firm is truly empty only when fetched=0 AND bodyLengths empty AND guardCount=0 AND confidence(H+M+L) all zero. Daily-side mid-stage-throw honesty (Phase 3 Pitfall 6) preserved because every truly-untouched firm still has all four signals at zero.

**Why recorder-side, not runWeekly-side:** Per constraint and audit Option B — predicate is the single surface every current and future weekly-style entry point flows through. Option A (have runWeekly call `.fetched(items.length)` per firm) would fabricate a metric that doesn't match the weekly semantic (fetched = items pulled from a remote — weekly pulls zero) and would require parallel patches in every future non-fetching entry point.

Purpose: Restore operator visibility into per-firm GUARD + H/M/L counts on the weekly step-summary — the run that actually delivers the digest.
Output: 1 predicate line broadened in `recorder.ts` + 1 new regression test in `recorder.test.ts`.
</objective>

<execution_context>
@/Users/seonghoonyi/Documents/projects/legalnewsletter/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/v1.1-MILESTONE-AUDIT.md
@src/observability/recorder.ts
@src/pipeline/runWeekly.ts
@test/observability/recorder.test.ts

<interfaces>
<!-- Current isEmptyFirm predicate (recorder.ts:157) — the surface being widened: -->

```typescript
const isEmptyFirm = m.fetched === 0 && m.bodyLengths.length === 0;
```

<!-- FirmMetrics shape (recorder.ts:36-48) — fields the new predicate must check: -->

```typescript
export interface FirmMetrics {
  fetched: number;
  new: number;
  summarized: number;
  errorClass: string | null;
  durationMs: number;
  bodyLengths: number[];
  guardCount: number;     // populated by runWeekly:197
  confidenceH: number;    // populated by runWeekly:201
  confidenceM: number;
  confidenceL: number;
}
```

<!-- The weekly write pattern that triggers the bug (runWeekly.ts:186-202) — fetched is NEVER called here: -->

```typescript
for (const r of clusterAdjusted) {
  if (r.error) continue;
  const layer1 = r.summarized.filter((it) => it.summaryModel === 'skipped').length;
  const layer2 = r.summarized.filter(/* ... */).length;
  const layer3 = r.summarized.filter((it) => it.isClusterMember === true).length;
  recorder.firm(r.firm.id).guardCount(layer1 + layer2 + layer3);
  const h = r.summarized.filter((it) => it.summaryConfidence === 'high').length;
  const m = r.summarized.filter((it) => it.summaryConfidence === 'medium').length;
  const l = r.summarized.filter((it) => it.summaryConfidence === 'low').length;
  recorder.firm(r.firm.id).confidence(h, m, l);
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Widen isEmptyFirm predicate + add weekly-pattern regression test</name>
  <files>src/observability/recorder.ts, test/observability/recorder.test.ts</files>
  <behavior>
    Add ONE new test to `test/observability/recorder.test.ts` inside the existing `describe('Phase 10 DQOBS-01 extensions', ...)` block (place it after the 'Mid-stage throw honesty' test). The test name MUST contain the literal string `runWeekly` so a grep on the test file makes the regression provenance findable.

    Test contract (mirrors runWeekly.ts:186-202 write pattern verbatim — NO `.fetched()` call, NO `.bodyLengths()` call):

    ```typescript
    it('DQOBS-01 regression: runWeekly pattern (guardCount + confidence, no fetched call) renders non-em-dash GUARD + H/M/L', () => {
      const r = new Recorder();
      // Mirrors runWeekly.ts:197,201 — weekly never calls fetched() or bodyLengths()
      // because weekly reads pending instead of fetching.
      r.firm('cooley').guardCount(2).confidence(5, 1, 0);
      const table = r.toMarkdownTable([
        { id: 'cooley', name: 'Cooley', enabled: true, type: 'rss', url: 'x', language: 'en', timezone: 'UTC' } as FirmConfig,
      ]);
      // GUARD must be '2' not '—'; H/M/L must be '5/1/0' not '—'.
      // AvgBody stays '—' (bodyLengths empty — intentional per COMP-05, body not persisted to pending.json).
      expect(table).toContain('| Cooley | 0 | 0 | 0 | — | 0ms | — | 2 | 5/1/0 |');
    });
    ```

    Run `pnpm vitest run test/observability/recorder.test.ts` — this new test MUST FAIL with the current predicate (expected output shows GUARD='—' and H/M/L='—' under current `m.fetched === 0 && m.bodyLengths.length === 0` logic). This is the RED step. Capture stderr/stdout briefly to confirm the assertion mismatches on GUARD/H-M-L columns specifically (not on some other column drift).
  </behavior>
  <action>
    After confirming RED, make GREEN with a one-line predicate widening in `src/observability/recorder.ts` at line 157.

    Replace:

    ```typescript
    const isEmptyFirm = m.fetched === 0 && m.bodyLengths.length === 0;
    ```

    With:

    ```typescript
    // DQOBS-01 fix (BLOCKER-1 in .planning/v1.1-MILESTONE-AUDIT.md):
    // Weekly entry (runWeekly.ts) writes guardCount + confidence WITHOUT calling fetched(n)
    // because it reads pending instead of fetching. Original two-signal predicate
    // (fetched + bodyLengths) blanked weekly rows. Extended to four signals so a firm
    // is "empty" only when ALL recorder writes are absent. Daily-side mid-stage-throw
    // honesty (Phase 3 Pitfall 6) preserved: a truly-untouched firm still has all
    // four signals at zero and still renders em-dash.
    const isEmptyFirm =
      m.fetched === 0 &&
      m.bodyLengths.length === 0 &&
      m.guardCount === 0 &&
      m.confidenceH === 0 &&
      m.confidenceM === 0 &&
      m.confidenceL === 0;
    ```

    Do NOT touch `src/pipeline/runWeekly.ts` — recorder predicate is the right surface (covers all current and future weekly-style entry points uniformly per constraint).

    Do NOT modify any other test in `test/observability/recorder.test.ts` — the existing 22 tests already pass with the new predicate (verified by audit: every "empty" assertion in current tests is a firm where ALL four signal groups are zero, so widening adds new "non-empty" cases without flipping any existing "empty" case).
  </action>
  <verify>
    <automated>pnpm vitest run test/observability/recorder.test.ts && pnpm tsc --noEmit</automated>
  </verify>
  <done>
    - `pnpm vitest run test/observability/recorder.test.ts` reports all tests pass, including the new `runWeekly` regression test (23 total, was 22)
    - `pnpm tsc --noEmit` reports zero errors
    - The widened predicate in `src/observability/recorder.ts` has all four signal-group checks (`fetched`, `bodyLengths.length`, `guardCount`, `confidenceH + confidenceM + confidenceL`)
    - `runWeekly.ts` is unchanged (`git diff src/pipeline/runWeekly.ts` produces no output)
  </done>
</task>

</tasks>

<verification>
1. Test suite — `pnpm vitest run test/observability/recorder.test.ts` exits 0 with 23 tests passing
2. Typecheck — `pnpm tsc --noEmit` exits 0
3. Predicate scope check — the four-signal widening is in `recorder.ts` ONLY: `git diff --name-only` should show exactly `src/observability/recorder.ts` and `test/observability/recorder.test.ts` modified
4. No runWeekly drift — `git diff src/pipeline/runWeekly.ts` produces no output
</verification>

<success_criteria>
- DQOBS-01 BLOCKER-1 closed: weekly step-summary will now render per-firm GUARD + H/M/L counts (no em-dash masking) on the next runWeekly invocation
- DQOBS-02 cross-check unblocked as a side-effect: operators can now cross-check the "X firm flagged low-confidence" marker against the in-table H/M/L column in the weekly step-summary
- No daily-path regression: truly-empty firms still render em-dash; all pre-existing Recorder tests still green
</success_criteria>

<commit>
Commit message format (mandated by constraints):

```
fix(13.1): DQOBS-01 isEmptyFirm predicate masks weekly observability rows
```

Stage only the two files modified by this plan (no -A):

```bash
git add src/observability/recorder.ts test/observability/recorder.test.ts
git commit -m "fix(13.1): DQOBS-01 isEmptyFirm predicate masks weekly observability rows"
```
</commit>

<output>
After completion, this quick task is closed. No SUMMARY.md required for quick mode unless requested.
</output>
