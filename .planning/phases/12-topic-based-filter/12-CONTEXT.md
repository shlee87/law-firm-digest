# Phase 12: Topic-Based Filter - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a global topic relevance filter between body enrichment and Gemini summarization. Only items matching at least one keyword from the 5 configured practice areas (VC/securities, 공정거래, 개인정보, 노동법, IP) proceed to Gemini. Filtered-out items are recorded in seen.json to prevent re-evaluation on future runs. Zero additional Gemini API calls.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `12-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `12-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Topic keyword configuration in `config/firms.yaml` (topics: block)
- `isTopicRelevant(title, body, topics)` pure keyword-matching function
- Pipeline integration: topic filter step between `enrichWithBody` and `dedupAll`
- `seen.json` recording for filtered-out items (same mechanism as passed items)
- `[filter] skipped` log line in dry-run output per filtered item
- Vitest unit tests for the filter function

**Out of scope (from SPEC.md):**
- Per-firm topic configuration — deferred to v2
- Gemini-based classification — deferred to v2
- Performance dashboard / filter-rate metrics in DQOBS — separate backlog item
- Automatic keyword learning / ML — permanently out of scope

</spec_lock>

<decisions>
## Implementation Decisions

### Keyword List Content (user-confirmed 2026-04-21)

All five practice areas with Korean and English keywords:

**D-01: vc_securities**
- Korean: `VC, 벤처, 스타트업, 투자, 증권, 공모, 상장, 자본시장, 사모펀드, 벤처캐피탈`
- English: `startup, securities, fund, private equity, investment, listing, IPO`

**D-02: fair_trade**
- Korean: `공정거래, 독점규제, 공정거래위원회, 공정거래법, 불공정거래, 시장지배적지위, 담합, 가격담합, 합병`
- English: `antitrust, competition, cartel, merger control, M&A`

**D-03: privacy**
- Korean: `개인정보, 개인정보보호, 개인정보보호법, 개인정보보호위원회, 데이터, 정보보호, 사이버보안, 정보유출, 해킹, 보안사고`
- English: `privacy, personal data, GDPR, data protection, cybersecurity, breach, data leak`

**D-04: labor**
- Korean: `노동, 근로, 해고, 근로계약, 노동조합, 파업, 단체교섭, 임금, 연장근로, 직장내괴롭힘, 부당해고, 퇴직금`
- English: `labor, employment, dismissal, redundancy, collective bargaining, strike, wages, overtime`

**D-05: ip**
- Korean: `특허, 상표, 저작권, 지식재산, 영업비밀, 실용신안, 디자인권, 침해, 라이선스, 라이센스, 라이선싱, 라이센싱`
- English: `patent, trademark, copyright, intellectual property, trade secret, infringement, licensing, IP`

Note: 라이선스/라이센스 both included — both spellings common in Korean legal writing.

### Config Location

**D-06:** Topics block added at top of `config/firms.yaml` as a `topics:` section, before the `firms:` list. Single file for non-developer edits. Format:

```yaml
topics:
  vc_securities:
    - VC
    - 벤처
    # ...
  fair_trade:
    - 공정거래
    # ...
```

### Filter Function Location

**D-07:** `isTopicRelevant(title, body, topics)` exported from `src/pipeline/filter.ts` alongside the existing `applyKeywordFilter`. Both are pipeline-specific pure functions — co-locating keeps the filter contract in one file.

### Pipeline Integration

**D-08:** Topic filter runs as a second pass AFTER `applyKeywordFilter` (per-firm include/exclude) and BEFORE `dedupAll`. The existing `applyKeywordFilter` call in `run.ts` remains unchanged. A new `applyTopicFilter(results, topics)` function wraps `isTopicRelevant` for each item.

Pipeline order (unchanged from SPEC.md):
```
enrichWithBody → applyKeywordFilter (per-firm) → applyTopicFilter (global) → dedupAll → summarize
```

### seen.json for Filtered Items

**D-09:** `FirmResult` gets a new optional field `topicFiltered?: RawItem[]` populated by `applyTopicFilter`. `writeState` merges those URLs into the per-firm seen list alongside `r.summarized` URLs. Prevents re-evaluation on next run (SPEC requirement 5).

### Log Format

**D-10:** Per-item console.log in `run.ts` after `applyTopicFilter` call:
```
[filter] skipped — no topic match: <title>
```
Emitted for every item in `r.topicFiltered` (if array exists and is non-empty).

### Empty Body Behavior

**D-11:** `isTopicRelevant(title, '', topics)` returns `true` when body is empty — permissive bias per SPEC requirement 3. This is the function contract, enforced by unit test.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 Requirements
- `.planning/phases/12-topic-based-filter/12-SPEC.md` — Locked requirements, boundaries, acceptance criteria. MUST read before planning.

### Existing Pipeline Integration Points
- `src/pipeline/filter.ts` — Existing `applyKeywordFilter` (per-firm). `isTopicRelevant` and `applyTopicFilter` are added here.
- `src/pipeline/run.ts` — Pipeline composition root. New `applyTopicFilter` call inserted after line ~233 (`applyKeywordFilter` call).
- `src/state/writer.ts` — `writeState` must be updated to merge `topicFiltered` URLs into seen.json.
- `src/types.ts` — `FirmResult` interface extended with `topicFiltered?: RawItem[]`.
- `config/firms.yaml` — `topics:` block added at file top. Schema in `src/config/schema.ts` must be updated.

### Test Patterns
- `test/pipeline/filter.test.ts` — Existing filter tests. New `isTopicRelevant` unit tests added here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `applyKeywordFilter` in `filter.ts`: case-insensitive substring match on `(title + ' ' + description.slice(0, 500))` — `isTopicRelevant` uses the identical matching strategy (D-P2-07).
- `FirmResult.raw`: already carries `RawItem[]` with `title` and `description` populated post-enrich. `isTopicRelevant` reads these directly.
- `writeState` bootstrap path: already seeds from `r.raw` — extending it to also consume `r.topicFiltered` follows the same pattern.

### Established Patterns
- **Pure function invariant**: `filter.ts` is pure (no I/O, no env). `isTopicRelevant` must follow the same contract — logging happens in `run.ts`, not in the filter function.
- **Error pass-through**: `applyKeywordFilter` returns error results unchanged (`if (r.error) return r`). `applyTopicFilter` must mirror this.
- **No mutation**: filter returns new objects via spread. `applyTopicFilter` must not mutate input.

### Integration Points
- `run.ts` line ~233: `const filtered = applyKeywordFilter(enriched)` — `applyTopicFilter` call is inserted immediately after, consuming `filtered` and returning `topicFiltered` results.
- `config/schema.ts`: Zod schema for `FirmConfig` already loaded via `loadFirms()`. A new top-level `TopicConfig` schema is needed alongside it; `loadFirms` or a new `loadTopics` helper loads it.
- `config/loader.ts`: `loadFirms()` must be extended (or `loadTopics()` added) to parse the `topics:` section from `firms.yaml`.

</code_context>

<specifics>
## Specific Ideas

- User confirmed both Korean spellings of license terms: `라이선스`/`라이센스` and `라이선싱`/`라이센싱` — include BOTH variants in the IP keyword list so neither spelling is missed.
- Keyword matching uses case-insensitive substring (same as existing `applyKeywordFilter`) — no tokenization, no regex, Korean particles are acceptable false-negative risk for v1.
- Body window for matching: `description.slice(0, 500)` — same as per-firm filter. Consistent with existing D-P2-07 design.

</specifics>

<deferred>
## Deferred Ideas

- Per-firm topic configuration (override global topics per firm) — v2 per SPEC.md out-of-scope
- Gemini-based semantic classifier — v2 per SPEC.md out-of-scope
- Filter-rate metrics in DQOBS dashboard — separate backlog item
- mecab-ko tokenization for better Korean particle handling — future improvement (deferred from per-firm filter too)
- Automatic keyword learning / ML — permanently out of scope per SPEC.md

</deferred>

---

*Phase: 12-topic-based-filter*
*Context gathered: 2026-04-21*
