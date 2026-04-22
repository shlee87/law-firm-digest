# Phase 12: Topic-Based Filter — Specification

**Created:** 2026-04-22
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

The pipeline filters each newsletter item by keyword matching against title and body text, so only items related to VC/securities, 공정거래, 개인정보, 노동법, or IP are passed to Gemini summarization and included in the digest. When in doubt, items pass (permissive bias — false negatives are not acceptable).

## Background

Currently the pipeline summarizes every item with a non-empty body, regardless of legal topic. This means Gemini API quota is spent on articles about general corporate governance, marketing updates, and firm announcements that are not relevant to the subscriber's practice areas. Phase 12 adds a topic relevance gate between body enrichment and Gemini summarization. The gate uses keyword matching (no additional AI calls) so it costs zero extra Gemini RPD.

## Requirements

1. **Topic keyword config**: A `topics` section exists in `config/firms.yaml` (or a new top-level config file) containing Korean and English keywords for each of the 5 target topics.
   - Current: No topic keywords exist anywhere in the config or codebase
   - Target: `config/firms.yaml` (or `config/topics.yaml`) contains a `topics` key with keyword lists for `vc_securities`, `fair_trade`, `privacy`, `labor`, `ip`
   - Acceptance: Editing the keyword list in config changes filter behavior without any code change; `pnpm tsc --noEmit` passes after config change

2. **Keyword filter function**: A pure function `isTopicRelevant(title: string, body: string, topics: TopicConfig): boolean` returns `true` if title OR body contains at least one keyword from any topic (case-insensitive, partial match acceptable).
   - Current: No such function exists
   - Target: Exported function in `src/pipeline/` (or `src/scrapers/util.ts`) with the above signature
   - Acceptance: `vitest` unit tests pass for: (a) title match only, (b) body match only, (c) both match, (d) no match → false, (e) empty body → true (permissive)

3. **Permissive on empty body**: Items whose body extraction failed (empty string or body extraction marker) automatically pass the filter — they are never filtered out due to body fetch failure.
   - Current: N/A
   - Target: `isTopicRelevant(title, '', topics)` returns `true` for any title
   - Acceptance: Unit test confirms empty-body items return `true` from `isTopicRelevant`

4. **Pipeline integration**: The filter runs after `enrichBody` and before Gemini `summarize`. Items that do not pass are added to `seen.json` (deduped as normal) but are NOT summarized and NOT included in the digest.
   - Current: All enriched items proceed to `summarize`
   - Target: The pipeline calls `isTopicRelevant` on each enriched item; non-matching items go to `seen.json` only; matching items continue to `summarize`
   - Acceptance: `pnpm dry-run` output shows a log line for each filtered item (e.g., `[filter] skipped — no topic match: <title>`) and those items do NOT appear in the digest HTML

5. **Filtered items in seen.json**: Items filtered out by topic are recorded in `seen.json` under their firm with the same URL-recording mechanism as summarized items, so they are not re-fetched and re-evaluated in future runs.
   - Current: N/A
   - Target: After a dry-run (or real run), filtered-out items appear in `seen.json` alongside passed items
   - Acceptance: Running the pipeline twice on the same data: second run shows `dedup: 0 new` for filtered items, confirming they are in `seen.json`

6. **No extra Gemini API calls**: The topic filter uses keyword matching only — no AI model calls are made for classification.
   - Current: N/A
   - Target: Zero additional Gemini API invocations in the filter step
   - Acceptance: Code review confirms no `genai` or `summarize` calls in the filter function; `pnpm dry-run` with `GEMINI_API_KEY` unset still runs the filter step without error

## Boundaries

**In scope:**
- Topic keyword configuration (in `config/firms.yaml` or `config/topics.yaml`)
- `isTopicRelevant` keyword matching function (title + body, case-insensitive)
- Pipeline integration: filter step between `enrichBody` and `summarize`
- `seen.json` recording for filtered-out items (same mechanism as passed items)
- `[filter] skipped` log line in dry-run output for filtered items
- Vitest unit tests for the filter function

**Out of scope:**
- Per-firm topic configuration (all 13 firms use the same topic list) — deferred to v2
- Gemini-based classification (keyword-only for v1) — deferred to v2
- Performance dashboard / filter-rate metrics in DQOBS — separate backlog item
- Automatic keyword learning / ML — out of scope permanently for this phase
- UI for managing keywords — keywords managed by direct file edit only

## Constraints

- Keywords MUST be in config (not hardcoded in `src/`) — non-developer must be able to add a keyword by editing one file
- No additional Gemini API calls for the filter step — Gemini RPD budget is not affected
- Filter must run AFTER body enrichment (needs body text for matching), BEFORE summarization
- When body is empty or unavailable, item PASSES filter (permissive — false negatives are not acceptable per D-01)
- Must not break existing 448+ unit tests

## Acceptance Criteria

- [ ] `config/firms.yaml` (or `config/topics.yaml`) contains `topics` section with keyword lists for all 5 practice areas
- [ ] `isTopicRelevant('', body, topics)` returns `true` when body contains a keyword
- [ ] `isTopicRelevant(title, '', topics)` returns `true` when title contains a keyword AND body is empty (permissive)
- [ ] `isTopicRelevant(title, body, topics)` returns `false` when neither title nor body contains any keyword
- [ ] `isTopicRelevant(title, '', topics)` returns `true` when body is empty (regardless of title match)
- [ ] `pnpm dry-run` logs `[filter] skipped` for each filtered item
- [ ] Items filtered out do NOT appear in the digest HTML
- [ ] Items filtered out DO appear in `seen.json` after a run
- [ ] `pnpm vitest run` passes with 448+ tests (new filter tests included)
- [ ] `pnpm tsc --noEmit` exits 0

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                          |
|--------------------|-------|------|--------|------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | 5 topics, keyword-based, permissive bias       |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Explicit out-of-scope: per-firm, Gemini, ML    |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Keywords in config, no extra Gemini RPD        |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | dry-run log + vitest + seen.json check         |
| **Ambiguity**      | 0.16  | ≤0.20| ✓      |                                                |

## Interview Log

| Round | Perspective     | Question summary                          | Decision locked                                              |
|-------|-----------------|-------------------------------------------|--------------------------------------------------------------|
| 1     | Researcher      | Classification input (title vs body)      | Title + body both used for keyword matching                  |
| 1     | Researcher      | Non-relevant item handling                | seen.json + skip (not re-evaluated each run)                 |
| 2     | Researcher      | Classification method                     | Keyword-based v1; Gemini classifier deferred to v2           |
| 2     | Simplifier      | Filter scope                              | All 13 firms equally (no per-firm config)                    |
| 3     | Boundary Keeper | Explicit out-of-scope                     | Per-firm topics, Gemini classifier, dashboard, ML all out    |
| 3     | Boundary Keeper | Keyword management location               | config/firms.yaml (or config/topics.yaml) — not src/         |
| 4     | Failure Analyst | Worse failure mode                        | False negative — permissive filter (empty body = pass)       |
| 4     | Failure Analyst | Acceptance verification method            | dry-run manual confirmation + vitest unit tests              |

---

*Phase: 12-topic-based-filter*
*Spec created: 2026-04-22*
*Next step: /gsd:discuss-phase 12 — implementation decisions (keyword list design, filter function location, pipeline wiring)*
