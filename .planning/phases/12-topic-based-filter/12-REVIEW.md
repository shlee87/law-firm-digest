---
phase: 12-topic-based-filter
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/types.ts
  - src/config/schema.ts
  - src/config/loader.ts
  - src/pipeline/filter.ts
  - src/pipeline/run.ts
  - src/state/writer.ts
  - config/firms.yaml
  - test/pipeline/filter.test.ts
  - test/pipeline/run.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 12 adds a global topic-based keyword filter to the pipeline. The implementation is clean and well-structured: `isTopicRelevant()` and `applyTopicFilter()` are pure functions with correct error-pass-through semantics, the fast-path (empty `topics`) is correct, and `writeState` properly merges topic-filtered URLs into `seen.json` so they are not re-evaluated on future runs. The test suite provides good per-behavior coverage for both `isTopicRelevant` and `applyKeywordFilter`.

Three warnings and four info items were found. No critical issues (no security vulnerabilities, no data-loss paths). The most important warning (WR-01) is a logic edge case in `writer.ts` where topic-filtered URLs can be silently dropped from `seen.json` on high-volume runs due to a shared MAX_PER_FIRM cap; the second (WR-02) is a subtle behavioral inconsistency in `isTopicRelevant` where a non-empty but whitespace-only body triggers the permissive pass even when the title contains a topic keyword; the third (WR-03) is a duplicate file-read in `loadTopics()`.

---

## Warnings

### WR-01: Topic-filtered URLs consume the same MAX_PER_FIRM=500 cap as summarized URLs, silently dropping them from seen.json on high-volume runs

**File:** `src/state/writer.ts:112-113`
**Issue:** `topicFilteredUrls` are prepended before `priorFirm.urls` and subject to the same `slice(0, MAX_PER_FIRM)` cap as summarized URLs. On a firm that has already accumulated ~490 prior URLs, a batch of even 15 topic-filtered items can crowd out the most-recently-summarized URLs. Worse, if `summarizedUrls` already fills the 500-slot window, every `topicFilteredUrl` is silently dropped — not recorded in `seen.json` at all. On the next run, the same topic-filtered items re-enter `r.raw`, are filtered again by `applyTopicFilter`, and the cycle repeats indefinitely without error. SPEC-12-REQ-5 ("topic-filtered URLs are recorded as seen") is violated in this edge case.

```typescript
// Current (line 112-113):
const newUrls = [...summarizedUrls, ...topicFilteredUrls];
const merged = [...newUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM);
```

**Fix:** Give topic-filtered URLs their own budget, separate from the summarized-URL budget. One simple approach: after the summarized-URL merge, append topic-filtered URLs up to a secondary cap (e.g. `MAX_TOPIC_FILTERED_PER_FIRM = 200`), then apply the overall cap:

```typescript
const MAX_TOPIC_FILTERED_PER_FIRM = 200;

const summarizedMerge = [...summarizedUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM);
const summarizedSet = new Set(summarizedMerge);
const topicSlice = topicFilteredUrls
  .filter((u) => !summarizedSet.has(u))
  .slice(0, MAX_TOPIC_FILTERED_PER_FIRM);
const merged = [...summarizedMerge, ...topicSlice];
```

This guarantees summarized URLs always win the cap competition, and topic-filtered URLs get a bounded secondary slot rather than silently disappearing.

---

### WR-02: `isTopicRelevant` permissive-empty-body path fires on whitespace-only body even when the title contains a topic keyword — the early return skips the title check

**File:** `src/pipeline/filter.ts:93-102`
**Issue:** The guard `if (!body.trim()) return true` fires for any body that is empty or whitespace-only. This is the correct D-11 permissive bias. However, the control flow also means that when `body` is whitespace-only AND the title does NOT contain any topic keyword, the function still returns `true` — it never evaluates the title. The asymmetry is: a non-empty body requires the keyword to appear in `(title + ' ' + descWindow)`, but an empty body grants a free pass regardless of the title content. This is intentional by design (D-11), but it creates an undocumented behavioral gap:

- `isTopicRelevant('날씨 예보', '', topics)` → `true` (empty body → pass)
- `isTopicRelevant('날씨 예보', 'non-empty unrelated text', topics)` → `false`

In production this means an item whose body fetch fails will always pass even if its title is clearly off-topic. This is the accepted tradeoff, but the comment at line 94 says "body is empty or whitespace-only" without explaining that the title is also not checked. A developer reading test case (e) in the test file ("empty body — title has NO topic keyword → true") may believe this is intentional; it is, but the current naming ("permissive on empty body") under-documents that the title check is bypassed too.

More importantly: test case (a) is labeled "Title match with empty body → true (permissive: empty body always passes)" — the test passes because the body is empty, NOT because the title matched. If the implementation were changed to `if (!body.trim()) return evaluateTitleOnly(title, topics)`, test (a) would still pass but test (e) would fail. This means test (a) does NOT cover the title-match-with-non-empty-body scenario, which is actually the critical code path tested by cases (b)/(c).

**Fix (minimal — improve comment clarity):**

```typescript
// D-11: if body is empty or whitespace-only, return true immediately
// (permissive bias regardless of title content — body fetch failure must
// never silently discard a potentially relevant item).
// NOTE: this means the title is NOT evaluated when body is empty. An item
// with a clearly off-topic title + empty body still passes. This is the
// accepted tradeoff; see SPEC-12-REQ-3.
if (!body.trim()) return true;
```

**Fix (structural — if stricter semantics are desired in a future phase):**

```typescript
if (!body.trim()) {
  // Still evaluate title alone so clearly off-topic items with empty bodies
  // can be filtered. Falls back to full pass if topics is empty.
  const titleHaystack = title.toLowerCase();
  return Object.values(topics).some((keywords) =>
    keywords.some((k) => titleHaystack.includes(k.toLowerCase())),
  );
}
```

The minimal fix (comment clarification) is sufficient for now. Flag for a follow-up if false-positive volume on empty-body items becomes a problem.

---

### WR-03: `loadTopics()` reads and parses `config/firms.yaml` a second time — duplicate I/O and duplicate validation on every pipeline run

**File:** `src/config/loader.ts:69-79`
**Issue:** `loadTopics()` performs a full `readFile` + `yaml.parse` + `FirmsConfigSchema.safeParse` cycle, entirely duplicating what `loadFirms()` already did moments earlier in `run.ts` (lines 139-141). In the happy path this is a minor inefficiency; in the error path it means `firms.yaml` validation errors are printed twice and two separate `throw new Error('Invalid firms.yaml')` calls execute (whichever fires first wins — the second is never reached, but the code silently depends on that ordering). On a slow filesystem or a very large YAML file the double-parse is also observable.

```typescript
// run.ts lines 139-141 — two separate file reads:
const allFirms = await loadFirms();       // readFile + parse + safeParse
const recipient = await loadRecipient();
const topics = await loadTopics();        // readFile + parse + safeParse again
```

**Fix:** Extend `loadFirms()` to return the full parsed config (or add a `loadConfig()` function that returns `{ firms, topics }`), eliminating the second parse. Alternatively, cache the parsed result in the module:

```typescript
// Option A — single unified loader (preferred):
export async function loadConfig(options: LoadFirmsOptions = {}): Promise<{
  firms: FirmConfig[];
  topics: TopicConfig;
}> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  const all = result.data.firms as FirmConfig[];
  return {
    firms: options.includeDisabled ? all : all.filter((f) => f.enabled),
    topics: result.data.topics as TopicConfig,
  };
}
```

---

## Info

### IN-01: `applyTopicFilter` fast-path computes `Object.values(topics).flat()` only to check `.length`, then discards the result — redundant allocation

**File:** `src/pipeline/filter.ts:121-122`
**Issue:** The fast-path guard materializes an array of all keywords to check if it is empty, but never uses the flattened array downstream. `isTopicRelevant` re-flattens via `Object.values(topics).some(...)` on every call.

```typescript
// Current:
const allKeywords = Object.values(topics).flat();
if (allKeywords.length === 0) return results;
```

**Fix:** Check `Object.keys(topics).length === 0` instead — the schema guarantees all topic entries have at least one keyword when the key exists, and the schema default is `{}` (empty object). This avoids the allocation:

```typescript
if (Object.keys(topics).length === 0) return results;
```

Alternatively, check whether any topic has keywords (handles the edge case where a topic key exists but its list is empty):

```typescript
if (!Object.values(topics).some((kws) => kws.length > 0)) return results;
```

---

### IN-02: `loadTopics()` casts `result.data.topics` with `as TopicConfig` — unnecessary cast because the zod schema already guarantees the type

**File:** `src/config/loader.ts:78`
**Issue:** `FirmsConfigSchema` types `topics` as `z.record(z.string(), z.array(z.string()))` with `.default({})`, so `result.data.topics` is already `Record<string, string[]>` — identical to `TopicConfig`. The `as TopicConfig` cast bypasses TypeScript's type checker without adding safety.

```typescript
return result.data.topics as TopicConfig;  // unnecessary cast
```

**Fix:** Remove the cast:

```typescript
return result.data.topics;
```

Same pattern applies in `loadFirms()` at line 61 (`result.data.firms as FirmConfig[]`), which is a pre-existing issue.

---

### IN-03: `run.ts` logs topic-filtered items with `console.log` — inconsistent with the pipeline's structured logging approach; no count summary logged

**File:** `src/pipeline/run.ts:243-248`
**Issue:** The D-10 logging block uses bare `console.log` for per-item skip lines. Every other pipeline stage logs via `reporter.section(...)`. Using `console.log` here means the skip lines appear unconditionally on every run (including CI), bypassing the `reporter` abstraction that the tests use to verify stage outcomes.

Additionally, there is no aggregate count log (e.g., "N items topic-filtered across M firms") at the `reporter.section` level, making the topic filter stage invisible in the `--check:firm` dev-path output.

```typescript
// Current (lines 243-248):
for (const r of topicFiltered) {
  if (r.error || !r.topicFiltered?.length) continue;
  for (const item of r.topicFiltered) {
    console.log(`[filter] skipped — no topic match: ${item.title}`);
  }
}
```

**Fix:** Add a `reporter.section` summary line, and gate the per-item `console.log` lines behind an env flag (e.g. `VERBOSE=1`) or remove them in favor of the summary:

```typescript
const totalTopicFiltered = topicFiltered.reduce(
  (n, r) => n + (r.topicFiltered?.length ?? 0),
  0,
);
reporter.section(
  'topic-filter',
  topicFiltered
    .map((r) => `${r.firm.id}: ${r.raw.length} passed, ${r.topicFiltered?.length ?? 0} filtered`)
    .join(' | '),
);
if (totalTopicFiltered > 0) {
  for (const r of topicFiltered) {
    if (r.error || !r.topicFiltered?.length) continue;
    for (const item of r.topicFiltered) {
      console.log(`[topic-filter] skipped — no topic match: ${item.title}`);
    }
  }
}
```

---

### IN-04: `test/pipeline/filter.test.ts` has no tests for `applyTopicFilter` — only `isTopicRelevant` is tested; the wrapper function and its `topicFiltered` field are not covered

**File:** `test/pipeline/filter.test.ts:185-250`
**Issue:** The test file imports `isTopicRelevant` (the pure primitive) but does not import or test `applyTopicFilter` (the wrapper that populates `r.topicFiltered`). The `r.topicFiltered` field on `FirmResult` — which `writeState` reads at line 109 to merge URLs into `seen.json` — has no direct test coverage. In particular:

- The "error pass-through returns same reference" invariant for `applyTopicFilter` is untested.
- The "items failing the filter move to `r.topicFiltered`, not simply discarded" contract is untested.
- The "no mutation" invariant is untested for `applyTopicFilter`.
- The fast-path (empty `topics` → returns original results reference) is untested.

The run.ts integration test mocks `applyTopicFilter` away entirely, so there is no integration-level coverage of the `topicFiltered` population either.

**Fix:** Add a `describe('applyTopicFilter', ...)` block to `test/pipeline/filter.test.ts` mirroring the `applyKeywordFilter` contract tests:

```typescript
import { applyKeywordFilter, applyTopicFilter, isTopicRelevant } from '../../src/pipeline/filter.js';

describe('applyTopicFilter', () => {
  it('(1) fast path — empty topics → returns same reference', () => { ... });
  it('(2) items failing topic filter move to r.topicFiltered', () => { ... });
  it('(3) items passing topic filter remain in r.raw', () => { ... });
  it('(4) error pass-through — FirmResult with error returned unchanged', () => { ... });
  it('(5) no mutation — input results unchanged', () => { ... });
  it('(6) D-11 permissive — empty body item stays in r.raw', () => { ... });
});
```

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
