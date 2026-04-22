# Phase 12: Topic-Based Filter - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 12-topic-based-filter
**Areas discussed:** Keyword list content, Filter placement & seen.json, Config file structure

---

## Keyword List Content

### VC/Securities
| Option | Selected |
|--------|----------|
| Starter list: VC, 벤처, 스타트업, 투자, 증권, 공모, 상장, 자본시장, 사모펀드, 벤처캐피탈 + English equivalents | ✓ |
| Custom | |

**Notes:** User confirmed starter list as-is.

### Fair Trade
| Option | Selected |
|--------|----------|
| Starter list: 공정거래, 독점규제, 공정거래위원회, 공정거래법, 불공정거래, 시장지배적지위, 담합, 가격담합, 합병 + English equivalents | ✓ |
| Custom | |

**Notes:** User confirmed starter list as-is.

### Privacy
| Option | Selected |
|--------|----------|
| Starter list: 개인정보, 개인정보보호, 개인정보보호법, 개인정보보호위원회, 데이터, 정보보호, 사이버보안, 정보유출, 해킹, 보안사고 + English equivalents | ✓ |
| Custom | |

**Notes:** First presentation had garbled Korean characters in AskUserQuestion option descriptions. Re-presented as plain text in message body; user confirmed.

### Labor
| Option | Selected |
|--------|----------|
| Starter list: 노동, 근로, 해고, 근로계약, 노동조합, 파업, 단체교섭, 임금, 연장근로, 직장내괴롭힘, 부당해고, 퇴직금 + English equivalents | ✓ |
| Custom | |

**Notes:** Same garbled-character issue. Presented as plain text; user confirmed.

### IP
| Option | Selected |
|--------|----------|
| Modified starter list | ✓ |
| As-is | |

**Notes:** User corrected 라이선스 → 라이센스, 라이선싱 → 라이센싱 (preferred spelling). Resolution: include BOTH spellings since both are used in Korean legal writing.

---

## Filter Placement & seen.json

**Problem explained:** Items filtered out by topic filter are removed from `r.raw` before `dedupAll` and `writeState`. Without extra handling, they are NOT recorded in seen.json and would be re-fetched and re-evaluated on every future run (wasted work).

**SPEC requirement 5:** Filtered items must appear in seen.json.

**Approach discussed:** Extend `FirmResult` with `topicFiltered?: RawItem[]` field; update `writeState` to merge those URLs.

**User:** Initially asked for clarification on the problem (explained in Korean). After explanation, no explicit choice made — implementation delegated to Claude.

---

## Config File Structure

| Option | Selected |
|--------|----------|
| `topics:` block at top of `config/firms.yaml` (before `firms:` list) | ✓ |
| Separate `config/topics.yaml` | |

**Notes:** User confirmed firms.yaml location (also matches SPEC spec interview answer). One file for non-developer edits.

---

## Claude's Discretion

- Exact YAML schema for topics block (nested by topic slug with keyword arrays)
- Whether to use `loadFirms` extension or new `loadTopics` helper
- Zod schema design for `TopicConfig`
- `applyTopicFilter` wrapper function signature

## Deferred Ideas

- Per-firm topic configuration — v2
- Gemini classifier — v2
- Filter-rate metrics in DQOBS — backlog
