---
phase: 12-topic-based-filter
plan: 01
subsystem: config
tags: [zod, yaml, typescript, tdd, topic-filter]

requires: []
provides:
  - TopicConfig type exported from src/types.ts
  - FirmsConfigSchema extended with optional topics field (5 practice areas)
  - loadTopics() exported from src/config/loader.ts
  - config/firms.yaml topics block with D-01..D-05 keywords
  - isTopicRelevant/applyTopicFilter stubs in filter.ts for TDD RED state
  - 8-case isTopicRelevant test suite (RED — Plan 02 turns them GREEN)
affects:
  - 12-02 (depends on TopicConfig, loadTopics, and the RED test suite)

tech-stack:
  added: []
  patterns:
    - TDD RED first — stubs exported to satisfy TypeScript, tests fail at runtime

key-files:
  created:
    - test/pipeline/filter.test.ts (extended with isTopicRelevant describe block)
    - .planning/phases/12-topic-based-filter/12-01-SUMMARY.md
  modified:
    - src/types.ts (TopicConfig type added)
    - src/config/schema.ts (FirmsConfigSchema extended with topics field)
    - src/config/loader.ts (loadTopics() added)
    - src/pipeline/filter.ts (stubs added for TDD RED state)
    - config/firms.yaml (topics block prepended with 5 practice areas)

key-decisions:
  - "Added stubs to filter.ts instead of leaving export absent — tsconfig includes test/**/* so missing export causes TS error; stubs satisfy TypeScript while keeping runtime RED"
  - "Topics block prepended before firms: in YAML to match schema declaration order (topics before firms)"
  - "TopicConfig as Record<string, string[]> — open to arbitrary topic names without code change"

patterns-established:
  - "loadTopics() mirrors loadFirms() exactly — same safeParse+stderr+throw pattern for config validation"
  - "TDD RED stubs: export function that throws 'not implemented' to satisfy TypeScript type-check while deferring implementation"

requirements-completed:
  - SPEC-12-REQ-1
  - SPEC-12-REQ-2
  - SPEC-12-REQ-3
  - SPEC-12-REQ-6

duration: 15min
completed: 2026-04-21
---

# Phase 12-01: Topic Filter Foundation Summary

**TopicConfig type + FirmsConfigSchema topics extension + loadTopics() loader + firms.yaml 5-area keyword block + TDD RED test suite for isTopicRelevant**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-21
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- `TopicConfig = Record<string, string[]>` exported from types.ts — open to non-developer extension
- `FirmsConfigSchema` extended with `topics: z.record(...).optional().default({})` — retains `.strict()`, empty default enables fast-path
- `loadTopics()` added to loader.ts mirroring `loadFirms` safeParse+error pattern exactly
- `config/firms.yaml` `topics:` block added with 5 practice areas (vc_securities, fair_trade, privacy, labor, ip) and all D-01..D-05 keywords including 라이선스/라이센스 variants
- 8-case `isTopicRelevant` test suite in RED state — all 8 fail at runtime (stubs throw), TypeScript compiles clean

## Task Commits

1. **Task 1-2-3 (combined):** `ae6cc08` — TopicConfig, schema, loader, firms.yaml topics, RED tests + stubs

## Files Created/Modified
- `src/types.ts` — `TopicConfig` type appended after `FirmResult`
- `src/config/schema.ts` — `FirmsConfigSchema` extended with `topics` field
- `src/config/loader.ts` — `loadTopics()` added, `TopicConfig` import added
- `src/pipeline/filter.ts` — `TopicConfig` import + `isTopicRelevant`/`applyTopicFilter` stubs
- `config/firms.yaml` — 100-line `topics:` block prepended with comments in Korean
- `test/pipeline/filter.test.ts` — imports extended, `makeTopics()` helper + 8-case describe block appended

## Decisions Made
- Used throwing stubs in filter.ts to satisfy `tsconfig.json` (which includes `test/**/*`) while keeping TDD RED state. Alternative (skip stubs) causes `TS2305` compile error.
- `topics` field placed before `firms` in schema `.object({})` to match the YAML file order — purely cosmetic but aids readability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule — TypeScript RED compatibility] Added throwing stubs to filter.ts**
- **Found during:** Task 3 (adding isTopicRelevant imports to filter.test.ts)
- **Issue:** tsconfig includes `test/**/*`, so importing a non-existent export causes `TS2305` compile error. Plan stated "pnpm tsc --noEmit exits 0" with RED tests — impossible without a stub.
- **Fix:** Added `isTopicRelevant` and `applyTopicFilter` stub exports that throw "not implemented" — satisfies TypeScript, keeps runtime RED.
- **Files modified:** src/pipeline/filter.ts
- **Verification:** `pnpm tsc --noEmit` exits 0; vitest shows 8 failed (runtime throw) + 448 passed.

---

**Total deviations:** 1 auto-fixed (TypeScript RED compatibility)
**Impact on plan:** Essential for stated success criteria (TS clean + RED tests). No scope creep.

## Issues Encountered
None beyond the TypeScript stub requirement above.

## Next Phase Readiness
- Plan 02 can import `TopicConfig` from types.ts and `loadTopics` from loader.ts immediately
- 8 RED tests will turn GREEN when Plan 02 replaces the stubs with real implementations
- `config/firms.yaml` keyword lists are live and will be validated by `loadTopics()` on first run

## Cross-walk

**Cross-walk:** This plan closes `SPEC-12-REQ-1`, `SPEC-12-REQ-2`, `SPEC-12-REQ-3`, `SPEC-12-REQ-6` (phase-local IDs). Together with Plan 12-02's contributions, these satisfy top-level **CONF-06** (`각 로펌은 선택적 include_keywords / exclude_keywords 필터를 지원한다`). Tracked in `.planning/milestones/v1.1-REQUIREMENTS.md` traceability table.

---
*Phase: 12-topic-based-filter*
*Completed: 2026-04-21*
