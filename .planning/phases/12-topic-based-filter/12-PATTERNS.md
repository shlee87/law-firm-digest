# Phase 12: Topic-Based Filter - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/pipeline/filter.ts` | utility (pure filter) | transform | `src/pipeline/filter.ts` (self — add alongside `applyKeywordFilter`) | exact |
| `src/pipeline/run.ts` | orchestrator | request-response | `src/pipeline/run.ts` (self — insert call at line ~233) | exact |
| `src/state/writer.ts` | utility (I/O) | CRUD | `src/state/writer.ts` (self — extend merge loop) | exact |
| `src/types.ts` | model | n/a | `src/types.ts` (self — extend `FirmResult`) | exact |
| `config/firms.yaml` | config | n/a | `config/firms.yaml` (self — add `topics:` block at top) | exact |
| `src/config/schema.ts` | config validation | n/a | `src/config/schema.ts` (self — add `TopicConfig` zod schema) | exact |
| `src/config/loader.ts` | config loader | request-response | `src/config/loader.ts` (self — add `loadTopics()` helper) | exact |
| `test/pipeline/filter.test.ts` | test | transform | `test/pipeline/filter.test.ts` (self — add `isTopicRelevant` suite) | exact |

---

## Pattern Assignments

### `src/pipeline/filter.ts` — add `isTopicRelevant` and `applyTopicFilter`

**Analog:** `src/pipeline/filter.ts` (existing `applyKeywordFilter`)

**Design invariants to mirror** (lines 1–35 header comment):
- PURE — no I/O, no env reads. Same inputs → same outputs.
- ERROR PASS-THROUGH — `FirmResult` with `.error` returned by reference, unchanged.
- NO MUTATION — return new objects via spread.
- BODY ASSUMPTION — reads `item.description` (populated post-`enrichWithBody`).
- QUOTA GUARD — runs BEFORE `dedupAll`/`summarize`.

**Imports pattern** (line 36):
```typescript
import type { FirmResult } from '../types.js';
```
New export also needs `TopicConfig` from types:
```typescript
import type { FirmResult, TopicConfig } from '../types.js';
```

**Core filter pattern to copy** (lines 38–63 — the entire `applyKeywordFilter` body):
```typescript
export function applyKeywordFilter(results: FirmResult[]): FirmResult[] {
  return results.map((r) => {
    // Error pass-through — same reference.
    if (r.error) return r;

    const firm = r.firm;
    const inc = (firm.include_keywords ?? []).map((k) => k.toLowerCase());
    const exc = (firm.exclude_keywords ?? []).map((k) => k.toLowerCase());

    // Fast path — no filters configured.
    if (inc.length === 0 && exc.length === 0) return r;

    const filtered = r.raw.filter((item) => {
      const descWindow = (item.description ?? '').slice(0, 500);
      const haystack = (item.title + ' ' + descWindow).toLowerCase();

      const includeOk =
        inc.length === 0 || inc.some((k) => haystack.includes(k));
      const excludeOk = exc.every((k) => !haystack.includes(k));

      return includeOk && excludeOk;
    });

    return { ...r, raw: filtered };
  });
}
```

**New `isTopicRelevant` function contract** (pure, no I/O):
```typescript
// Pure function — no I/O, no env. Same inputs → same outputs.
// D-11: empty body → returns true (permissive bias; body fetch failure
// must never silently discard a potentially relevant item).
export function isTopicRelevant(
  title: string,
  body: string,
  topics: TopicConfig,
): boolean {
  // Permissive on empty body (SPEC req 3 / D-11).
  if (!body) return true;

  const descWindow = body.slice(0, 500);
  const haystack = (title + ' ' + descWindow).toLowerCase();

  // ANY keyword from ANY topic area is sufficient to pass.
  return Object.values(topics).some((keywords) =>
    keywords.some((k) => haystack.includes(k.toLowerCase())),
  );
}
```

**New `applyTopicFilter` function contract** (wraps `isTopicRelevant`, mirrors `applyKeywordFilter` shape):
```typescript
// D-08: runs AFTER applyKeywordFilter, BEFORE dedupAll.
// Items failing the topic filter land in r.topicFiltered (not r.raw)
// so writeState can merge their URLs into seen.json (SPEC req 5 / D-09).
// Logging happens in run.ts, not here (pure function invariant).
export function applyTopicFilter(
  results: FirmResult[],
  topics: TopicConfig,
): FirmResult[] {
  // Fast path: if topics config is empty, pass everything through unchanged.
  const allKeywords = Object.values(topics).flat();
  if (allKeywords.length === 0) return results;

  return results.map((r) => {
    // Error pass-through — same reference.
    if (r.error) return r;

    const passed: RawItem[] = [];
    const topicFiltered: RawItem[] = [];

    for (const item of r.raw) {
      if (isTopicRelevant(item.title, item.description ?? '', topics)) {
        passed.push(item);
      } else {
        topicFiltered.push(item);
      }
    }

    return { ...r, raw: passed, topicFiltered };
  });
}
```
Note: `RawItem` needs to be imported from `'../types.js'`.

---

### `src/pipeline/run.ts` — insert `applyTopicFilter` call

**Analog:** `src/pipeline/run.ts` (self), line ~233 where `applyKeywordFilter` is already called.

**Import addition** (lines 67–87 import block — add one line):
```typescript
import { applyKeywordFilter, applyTopicFilter } from './filter.js';
```

**Existing call at line 233** (do not modify):
```typescript
const filtered = applyKeywordFilter(enriched);
reporter.section(
  'filter',
  filtered.map((r) => `${r.firm.id}: ${r.raw.length} after filter`).join(' | '),
);
```

**New call to insert immediately after** (before `dedupAll` at line 239):
```typescript
const topicFiltered = applyTopicFilter(filtered, topics);
// D-10: log per-item skip lines for every filtered item.
for (const r of topicFiltered) {
  if (r.error || !r.topicFiltered?.length) continue;
  for (const item of r.topicFiltered) {
    console.log(`[filter] skipped — no topic match: ${item.title}`);
  }
}

const deduped = dedupAll(topicFiltered, seen);
```

`topics` must be loaded earlier in the function, alongside `loadFirms`:
```typescript
const topics = await loadTopics();
```

**`writeState` call** (line 401 — update argument):
```typescript
await writeState(seen, topicFiltered);   // was: clusterAdjusted → stay as is
```
The merge into `topicFiltered` URLs is handled inside `writeState` itself (see writer pattern below). The pipeline passes `topicFiltered` results (which carry `r.topicFiltered` arrays) down to `writeState` — no other change to the call site.

---

### `src/state/writer.ts` — extend merge loop

**Analog:** `src/state/writer.ts` (self), lines 100–119 (subsequent-run merge branch).

**Existing merge pattern** (lines 100–119):
```typescript
// Subsequent runs: merge newly-summarized URLs on top of prior urls.
const existing = new Set(priorFirm.urls);
const newUrls = r.summarized
  .map((it) => it.url)
  .filter((u) => !existing.has(u));
const merged = [...newUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM);
```

**Extended pattern** — also merge `r.topicFiltered` URLs:
```typescript
// D-09: merge topic-filtered URLs alongside summarized URLs so they
// are recorded as seen and not re-evaluated on future runs (SPEC req 5).
const existing = new Set(priorFirm.urls);
const summarizedUrls = r.summarized
  .map((it) => it.url)
  .filter((u) => !existing.has(u));
const topicFilteredUrls = (r.topicFiltered ?? [])
  .map((it) => it.url)
  .filter((u) => !existing.has(u) && !summarizedUrls.includes(u));
const newUrls = [...summarizedUrls, ...topicFilteredUrls];
const merged = [...newUrls, ...priorFirm.urls].slice(0, MAX_PER_FIRM);
```

**DRY_RUN log pattern to mirror** (lines 130–138):
```typescript
if (isDryRun()) {
  const total = Object.values(next.firms).reduce(
    (n, f) => n + f.urls.length,
    0,
  );
  console.log(
    `[DRY_RUN] would write ${path} with ${total} URLs across ${Object.keys(next.firms).length} firms`,
  );
  return;
}
```
No change needed to this block — it reads the merged `next.firms` which already reflects the extended merge.

---

### `src/types.ts` — extend `FirmResult`

**Analog:** `src/types.ts` (self), lines 101–112 (`FirmResult` interface).

**Existing `FirmResult` interface** (lines 101–112):
```typescript
export interface FirmResult {
  firm: FirmConfig;
  raw: RawItem[];
  new: NewItem[];
  summarized: SummarizedItem[];
  error?: {
    stage: 'fetch' | 'parse' | 'dedup' | 'summarize';
    message: string;
    stack?: string;
  };
  durationMs: number;
}
```

**Extension** — add one optional field after `summarized`:
```typescript
  topicFiltered?: RawItem[];  // Phase 12 D-09: items excluded by topic filter; merged into seen.json
```

**New `TopicConfig` type to add** (alongside `FirmResult`):
```typescript
// Phase 12: mapping of topic area name → keyword list (e.g. vc_securities → [...]).
// Populated from config/firms.yaml `topics:` block via loadTopics().
export type TopicConfig = Record<string, string[]>;
```

---

### `config/firms.yaml` — add `topics:` block

**Analog:** `config/firms.yaml` (self) — existing top-of-file comment block style (lines 1–38).

**Pattern to copy:** the existing file header style uses YAML comments above each field explaining usage for non-developers. The new `topics:` block must follow the same convention.

**Placement:** top of file, BEFORE the `firms:` list. This mirrors the CONTEXT D-06 decision.

**Format template** (copy existing comment verbosity):
```yaml
# =============================================================
# 토픽 필터 키워드 (Phase 12)
# -------------------------------------------------------------
# 아래 키워드 중 하나라도 뉴스레터 제목 또는 본문(앞 500자)에 포함된
# 항목만 Gemini 요약·다이제스트에 포함됩니다.
# 키워드는 대소문자 무관 부분 문자열 매칭입니다.
# 키워드를 추가하려면 해당 토픽 리스트에 '- 키워드' 한 줄을 추가하세요.
# 코드 변경 없이 이 파일만 수정하면 됩니다.
# -------------------------------------------------------------
topics:
  vc_securities:
    - VC
    - 벤처
    # ... (all D-01 keywords per CONTEXT.md decisions)
  fair_trade:
    - 공정거래
    # ... (all D-02 keywords)
  privacy:
    - 개인정보
    # ... (all D-03 keywords)
  labor:
    - 노동
    # ... (all D-04 keywords)
  ip:
    - 특허
    # ... (all D-05 keywords)
```

---

### `src/config/schema.ts` — add `TopicConfig` zod schema

**Analog:** `src/config/schema.ts` (self), lines 180–184 (`FirmsConfigSchema`).

**Existing top-level schema pattern** (lines 180–184):
```typescript
export const FirmsConfigSchema = z
  .object({
    firms: z.array(FirmSchema).min(1),
  })
  .strict();
```

**New schema to add** — extend `FirmsConfigSchema` to accept the optional `topics:` key, OR add a separate `TopicsSchema`:

Option A (extend `FirmsConfigSchema` — single parse call, simpler):
```typescript
export const FirmsConfigSchema = z
  .object({
    topics: z.record(z.string(), z.array(z.string())).optional().default({}),
    firms: z.array(FirmSchema).min(1),
  })
  .strict();
```

Option B (separate schema — cleaner type boundary, requires two parse calls in loader):
```typescript
export const TopicsSchema = z
  .object({
    topics: z.record(z.string(), z.array(z.string())).optional().default({}),
  })
  .passthrough();  // .passthrough() so firms: key doesn't fail this partial parse
```

**Recommendation:** Option A — extend `FirmsConfigSchema`. Keeps `.strict()` at the file level, avoids a second `readFile` call, and is consistent with how `RecipientSchema` handles its single unified parse. Note: `FirmsConfigSchema` currently uses `.strict()` — removing `.strict()` or adding the `topics` key to the object shape is required (cannot add unknown keys to a strict schema).

---

### `src/config/loader.ts` — add `loadTopics()` helper

**Analog:** `src/config/loader.ts` (self), lines 50–63 (`loadFirms`).

**Existing `loadFirms` pattern** (lines 50–63):
```typescript
export async function loadFirms(
  options: LoadFirmsOptions = {},
): Promise<FirmConfig[]> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  const all = result.data.firms as FirmConfig[];
  return options.includeDisabled ? all : all.filter((f) => f.enabled);
}
```

**New `loadTopics()` helper** — reads the same `firms.yaml`, reuses the same parse+validate path:
```typescript
import type { TopicConfig } from '../types.js';

export async function loadTopics(): Promise<TopicConfig> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  // FirmsConfigSchema now includes topics: with .default({}) so this
  // is always a defined Record<string, string[]> (never undefined).
  return result.data.topics as TopicConfig;
}
```

Note: if `FirmsConfigSchema` is extended (Option A above), `loadFirms` and `loadTopics` share one parse call's validation path. They can be consolidated into a single internal `parseFirmsYaml()` helper to avoid reading the file twice if both are called in sequence from `run.ts`.

---

### `test/pipeline/filter.test.ts` — add `isTopicRelevant` suite

**Analog:** `test/pipeline/filter.test.ts` (self), existing `applyKeywordFilter` suite (lines 56–183).

**Import pattern to extend** (lines 17–19):
```typescript
import { describe, it, expect } from 'vitest';
import { applyKeywordFilter } from '../../src/pipeline/filter.js';
import type { FirmConfig, FirmResult } from '../../src/types.js';
```
Extended:
```typescript
import { applyKeywordFilter, isTopicRelevant } from '../../src/pipeline/filter.js';
import type { FirmConfig, FirmResult, TopicConfig } from '../../src/types.js';
```

**Helper factory pattern to copy** (lines 21–54 — `makeFirm` / `makeResult`):
```typescript
function makeTopics(overrides: Partial<TopicConfig> = {}): TopicConfig {
  return {
    vc_securities: ['VC', '벤처', 'startup', 'securities'],
    fair_trade: ['공정거래', 'antitrust'],
    privacy: ['개인정보', 'privacy', 'GDPR'],
    labor: ['노동', 'employment'],
    ip: ['특허', 'patent', 'trademark'],
    ...overrides,
  };
}
```

**Test cases to implement** (per SPEC acceptance criteria):

| Test # | Behavior | Key assertion |
|--------|----------|---------------|
| (a) | title match only | `isTopicRelevant('VC 투자', '', topics)` → `true` |
| (b) | body match only | `isTopicRelevant('generic title', '특허 분쟁 사례', topics)` → `true` |
| (c) | both title and body match | still `true` |
| (d) | no match anywhere | `isTopicRelevant('Weather report', 'rain tomorrow', topics)` → `false` |
| (e) | empty body → permissive | `isTopicRelevant('any title', '', topics)` → `true` regardless of title |
| (f) | case-insensitive | `isTopicRelevant('PATENT dispute', 'details', topics)` → `true` |
| (g) | body[:500] window | keyword beyond char 500 is invisible (mirrors filter.test.ts test 6) |
| (h) | empty topics config | `isTopicRelevant(title, body, {})` → depends on impl (empty body rule still applies; non-empty body with empty topics → `false` OR `true` — decide and document in test) |

**Test structure pattern to follow** (lines 56–58 of filter.test.ts):
```typescript
describe('isTopicRelevant', () => {
  it('(a) title match — body empty → true (permissive + title keyword hit)', () => {
    const topics = makeTopics();
    expect(isTopicRelevant('VC 투자 규제', '', topics)).toBe(true);
  });

  it('(e) empty body → true regardless of title (SPEC req 3 / D-11)', () => {
    const topics = makeTopics();
    // Even a title with NO topic keyword passes when body is empty.
    expect(isTopicRelevant('오늘의 날씨', '', topics)).toBe(true);
  });
  // ... etc.
});
```

---

## Shared Patterns

### Error Pass-Through
**Source:** `src/pipeline/filter.ts` lines 41–41 and `src/state/writer.ts` lines 68–70
**Apply to:** `applyTopicFilter` in `filter.ts`, merge loop extension in `writer.ts`
```typescript
// In applyTopicFilter:
if (r.error) return r;

// In writeState:
if (r.error) continue;
```

### No-Mutation / Spread Pattern
**Source:** `src/pipeline/filter.ts` line 61
**Apply to:** `applyTopicFilter` return value
```typescript
return { ...r, raw: passed, topicFiltered };
```

### Zod safeParse + stderr + throw
**Source:** `src/config/loader.ts` lines 55–63
**Apply to:** `loadTopics()` — same error reporting shape
```typescript
const result = FirmsConfigSchema.safeParse(yaml);
if (!result.success) {
  console.error('config/firms.yaml validation failed:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  throw new Error('Invalid firms.yaml');
}
```

### `.strict()` on Zod schemas
**Source:** `src/config/schema.ts` lines 52, 180–184
**Apply to:** any new top-level schema shape (if `TopicsSchema` is added separately, decide `.strict()` vs `.passthrough()` carefully — see Option A/B note above)

### DRY_RUN gate (write side only)
**Source:** `src/state/writer.ts` lines 130–139
**Apply to:** `writeState` extension — no new gate needed; the existing one covers the extended merge

### Vitest `describe`/`it`/`expect` structure
**Source:** `test/pipeline/filter.test.ts` lines 17–18, 56–183
**Apply to:** new `isTopicRelevant` test suite in the same file

---

## No Analog Found

All 8 files have direct analogs in the existing codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `src/pipeline/`, `src/config/`, `src/state/`, `src/types.ts`, `test/pipeline/`, `config/`
**Files read:** 8 source files fully read
**Pattern extraction date:** 2026-04-21
