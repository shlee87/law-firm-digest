# Phase 2: Multi-Firm HTML Tier + Failure Isolation — Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 14 (5 NEW, 9 EDIT)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Change | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/scrapers/html.ts` | NEW | scraper | request-response | `src/scrapers/rss.ts` | exact (sibling scraper) |
| `src/scrapers/util.ts` | EDIT | utility | pure transform + request-response | self (existing pure helpers) | self-extension |
| `src/pipeline/fetch.ts` | EDIT | orchestrator | fan-out + aggregate | self (existing `fetchAll`) | self-refactor |
| `src/pipeline/enrichBody.ts` | NEW | pipeline step | request-response (per item) | `src/pipeline/fetch.ts` (pLimit + per-firm try/catch); `src/scrapers/util.ts` (fetch+cheerio) | role+flow match via composition |
| `src/pipeline/filter.ts` | NEW | pipeline step | pure transform | `src/pipeline/dedup.ts` (pure `FirmResult[]→FirmResult[]`) | exact |
| `src/pipeline/dedup.ts` | EDIT | pipeline step | pure transform | self (existing `dedupAll` bootstrap branch) | self-extension |
| `src/mailer/gmail.ts` | EDIT | boundary | request-response with retry | `src/summarize/gemini.ts` (p-retry v8 usage) | flow-match (both wrap an external call in pRetry) |
| `src/compose/templates.ts` | EDIT | renderer | pure transform | self (existing `renderHtml`, `escapeHtml`) | self-extension |
| `src/config/schema.ts` | EDIT | config | validation | self (existing `FirmSchema`) | self-extension |
| `src/types.ts` | EDIT | type contract | — | self (existing `FirmConfig`) | self-extension |
| `config/firms.yaml` | EDIT | config data | — | self (existing `cooley` entry) | self-extension |
| `test/scrapers/html.test.ts` | NEW | test | fixture-based | `test/scrapers/rss.test.ts` | exact |
| `test/pipeline/filter.test.ts` | NEW | test | pure-fn | `test/pipeline/dedup.test.ts` | exact |
| `test/pipeline/enrichBody.test.ts` | NEW | test | mock-fetch | `test/scrapers/rss.test.ts` (fetch mock pattern) | flow-match |

## Pattern Assignments

### `src/scrapers/html.ts` (NEW — scraper, request-response)

**Analog:** `src/scrapers/rss.ts`

**Module docstring pattern** (rss.ts L1-28) — copy the docstring structure: purpose, invariants (timezone contract, per-item isolation), linked RESEARCH.md refs.

**Import + USER_AGENT pattern** (rss.ts L30-35):
```typescript
import { USER_AGENT } from '../util/logging.js';
import { canonicalizeUrl } from './util.js';
import type { FirmConfig, RawItem } from '../types.js';
```
For html.ts: ADD `decodeCharsetAwareFetch`, `parseDate` from `./util.js`, plus `import * as cheerio from 'cheerio'`. USER_AGENT is consumed INSIDE `decodeCharsetAwareFetch` (not directly here).

**Per-firm function signature + throw-on-HTTP-fail pattern** (rss.ts L62-72):
```typescript
export async function scrapeRss(firm: FirmConfig): Promise<RawItem[]> {
  const res = await fetch(firm.url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(firm.timeout_ms ?? 20000),
  });
  if (!res.ok) {
    throw new Error(`RSS fetch ${firm.id}: HTTP ${res.status}`);
  }
```
Copy the `{firm.id}: HTTP {status}` error-message shape — `templates.ts` footer classifier (Example 2 L748-755) parses `HTTP (\d{3})` to synthesize `http-{status}` errorClass. Same shape for HTML so the footer taxonomy stays unified.

**Per-item try/catch isolation pattern** (rss.ts L82-101):
```typescript
try {
  const url = canonicalizeUrl(item.link ?? '', firm.url);
  // ... build RawItem ...
  items.push({...});
} catch {
  // Skip malformed item — don't tank the whole feed on a single bad row.
}
```
Copy this try/catch-per-item discipline INSIDE the `$(list_item).each(...)` loop. RESEARCH Example 4 L831-876 shows the exact shape.

**Core HTML scraper body** — use RESEARCH.md Example 4 (lines 816-889) verbatim as starting point; the scrapeHtml skeleton already composes `decodeCharsetAwareFetch` → `cheerio.load` → `.each()` with both plain-href and onclick-extract branches.

**Returned RawItem shape** (rss.ts L88-96) — MUST be identical to rss.ts output so `dedupAll` remains tier-agnostic:
```typescript
items.push({
  firmId: firm.id,
  title: item.title ?? '(untitled)',
  url,
  publishedAt,
  language: firm.language,
  description: item.description ?? item.summary ?? undefined,
});
```
For html.ts: `description: undefined` (enrichWithBody populates body separately per RESEARCH Example 4 L871).

---

### `src/scrapers/util.ts` (EDIT — utility, pure + request-response helpers)

**Analog:** self (existing pure helpers `canonicalizeUrl`, `parseDate`, `TRACKING_PARAMS`).

**TRACKING_PARAMS extension pattern** (util.ts L31-47) — ADD three entries per D-P2-16:
```typescript
export const TRACKING_PARAMS: readonly string[] = [
  // ... existing 15 entries ...
  'page',        // NEW: legacy ASP pagination (로고스); never item identity
  's_type',      // NEW: 로고스 search-type ambient param
  's_keyword',   // NEW: 로고스 search-keyword ambient param
];
```
Keep the comment block structure; add a NOTE block documenting the D-P2-16 rationale.

**New helper: `decodeCharsetAwareFetch`** — drop into util.ts per RESEARCH Pattern 1 (L318-356):
```typescript
import iconv from 'iconv-lite';
import { USER_AGENT } from '../util/logging.js';

export async function decodeCharsetAwareFetch(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ html: string; status: number; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTML fetch ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? '';
  let charset = /charset=([A-Za-z0-9_-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  if (!charset || charset === 'iso-8859-1') {
    const head = buf.subarray(0, 4096).toString('ascii');
    charset = /<meta[^>]+charset=["']?([A-Za-z0-9_-]+)/i.exec(head)?.[1]?.toLowerCase() ?? charset ?? 'utf-8';
  }
  const normalized = charset === 'euc-kr' || charset === 'ks_c_5601-1987' ? 'cp949' : charset;
  const html = normalized === 'utf-8' || normalized === 'utf8' ? buf.toString('utf8') : iconv.decode(buf, normalized);
  return { html, status: res.status, finalUrl: res.url };
}
```
Docstring pattern to follow (matches existing `parseDate` docstring on L110-132): mention Pitfall #3 (EUC-KR BOM quirks, RESEARCH L619-624) even though not shipping code for it in v1.

**New helper: `extractBody` body-chain** — use RESEARCH Pattern 2 (L366-434) verbatim. Pure function, no fetch. Lives in util.ts because both rss.ts (teaser-only feeds) and html.ts detail pages feed it.

---

### `src/pipeline/fetch.ts` (EDIT — orchestrator, fan-out+aggregate)

**Analog:** self (existing `fetchAll`).

**Current structure** (fetch.ts L39-78):
```typescript
export async function fetchAll(firms: FirmConfig[]): Promise<FirmResult[]> {
  const limit = pLimit(3);
  return Promise.all(
    firms.map((firm) =>
      limit(async (): Promise<FirmResult> => {
        const started = Date.now();
        try {
          const origin = new URL(firm.url).origin;
          const disallows = await fetchRobots(origin);
          if (!isAllowed(firm.url, disallows)) throw new Error(`robots.txt disallows ${firm.url}`);
          const raw = await scrapeRss(firm);
          return { firm, raw, new: [], summarized: [], durationMs: Date.now() - started };
        } catch (err) {
          return { firm, raw: [], new: [], summarized: [], error: { stage: 'fetch', message: scrubSecrets((err as Error).message) }, durationMs: Date.now() - started };
        }
      }),
    ),
  );
}
```

**Transform per Pitfall 1 defense + D-P2-09 tier dispatch** — replace `Promise.all` + per-firm try/catch with `Promise.allSettled` + synthesize `FirmResult` for rejected; add `switch(firm.type)` branch. Use RESEARCH Example 1 (L690-740) as the full target shape.

**Key invariants to preserve:**
- `pLimit(3)` stays (FETCH-03).
- Robots gate stays BEFORE tier dispatch (COMP-03).
- `scrubSecrets` wraps error message (existing L70).
- `durationMs` captured on both success and failure paths.
- Output array length === input `firms.length` (shape invariant from current L13-15 module comment).

**Tier dispatch pattern** (from RESEARCH Example 1 L711-720):
```typescript
let raw;
switch (firm.type) {
  case 'rss':    raw = await scrapeRss(firm); break;
  case 'html':   raw = await scrapeHtml(firm); break;
  case 'js-render': throw new Error(`firm ${firm.id}: js-render tier is Phase 4 territory`);
}
```
The `js-render` branch MUST throw (not silently skip) so the failure-isolation path logs it in the email footer — a config mistake that activates js-render will be loudly visible.

---

### `src/pipeline/enrichBody.ts` (NEW — pipeline step, request-response per item)

**Analogs (composite):**
- `src/pipeline/fetch.ts` L39-44 for the `pLimit` + per-firm orchestration shell.
- `src/scrapers/rss.ts` L82-101 for the per-item try/catch-and-continue pattern.
- `src/scrapers/util.ts` new `decodeCharsetAwareFetch` + `extractBody` helpers as the leaf operations.

**Per-firm pLimit(1) + 500ms delay pattern** (per D-P2-10; no Phase 1 analog — copy pLimit import from fetch.ts L19):
```typescript
import pLimit from 'p-limit';
import { decodeCharsetAwareFetch, extractBody } from '../scrapers/util.js';
import type { FirmResult } from '../types.js';

export async function enrichWithBody(results: FirmResult[]): Promise<FirmResult[]> {
  return Promise.all(
    results.map(async (r) => {
      if (r.error || r.raw.length === 0) return r;       // skip failed + empty firms
      const perFirm = pLimit(1);                         // sequential within firm (D-P2-10)
      const enriched = await Promise.all(
        r.raw.map((item, idx) =>
          perFirm(async () => {
            if (idx > 0) await new Promise((res) => setTimeout(res, 500));  // 500ms min delay
            try {
              const { html } = await decodeCharsetAwareFetch(item.url, { timeoutMs: 20_000 });
              const body = extractBody(html, r.firm.selectors?.body);
              return { ...item, description: body || item.description };
            } catch {
              return item;  // leave description as-is; summary will be low-confidence
            }
          }),
        ),
      );
      return { ...r, raw: enriched };
    }),
  );
}
```

**Error-handling discipline** (copy from rss.ts L97-100 + fetch.ts L62-74):
- Per-item try/catch — one detail-page 404 doesn't kill the firm.
- Failed firms (`r.error` set) pass through untouched — mirrors `dedupAll` error pass-through (dedup.ts L46).
- NO throw from enrichWithBody itself — contract is same-length `FirmResult[]` output.

**COMP-05 strict invariant** (RESEARCH L572 + research body section):
- Body populated by WRITING INTO `item.description` (existing optional field on `RawItem`). Do NOT add a new `body` field to `RawItem` type — RESEARCH L572 prohibits persisting bodies and the state writer already excludes `description`. Keeping it on `description` satisfies both "pipeline-only" and "flows into summarize()".
- Alternative path per RESEARCH Example 3 L793-795 defines `EnrichedItem extends RawItem { body?: string }` as a pipeline-only type. Planner can choose; overloading `description` is simpler and already state-writer-safe.

---

### `src/pipeline/filter.ts` (NEW — pipeline step, pure transform)

**Analog:** `src/pipeline/dedup.ts`

**Module docstring invariant pattern** (dedup.ts L1-37) — copy the five-invariants block structure: PURE, ERROR PASS-THROUGH, NO MUTATION, CANONICAL URL ASSUMPTION (adapt to "canonical description field already populated"), and a reference to test contract.

**Pure function signature** (dedup.ts L40-43):
```typescript
export function dedupAll(results: FirmResult[], seen: SeenState): FirmResult[] {
  return results.map((r) => { ... });
}
```
For filter.ts — same shape, but no second argument (firm config already carries `include_keywords` / `exclude_keywords`):
```typescript
export function applyKeywordFilter(results: FirmResult[]): FirmResult[] {
  return results.map((r) => { ... });
}
```

**Error pass-through pattern** (dedup.ts L45-46):
```typescript
if (r.error) return r;  // same reference — pass-through
```
Copy verbatim. Test `toBe(errorResult)` reference check from dedup.test.ts L130 should be mirrored in filter.test.ts.

**Core filter logic** — use RESEARCH Example 3 (L787-814) verbatim:
```typescript
const inc = (firm.include_keywords ?? []).map((k) => k.toLowerCase());
const exc = (firm.exclude_keywords ?? []).map((k) => k.toLowerCase());
if (inc.length === 0 && exc.length === 0) return r;      // fast path: no filter
const filtered = r.raw.filter((item) => {
  const haystack = (item.title + ' ' + (item.description ?? '').slice(0, 500)).toLowerCase();
  const includeOk = inc.length === 0 || inc.some((k) => haystack.includes(k));
  const excludeOk = exc.every((k) => !haystack.includes(k));
  return includeOk && excludeOk;
});
return { ...r, raw: filtered };
```
Note: mutate the `raw` array (not `new`) because pipeline order is `fetch → enrich → filter → dedup → summarize` per RESEARCH L571 — filter runs before dedup, so `r.new` is still `[]`.

**No-mutation test pattern** (dedup.test.ts L134-143):
```typescript
const before = JSON.stringify(results);
applyKeywordFilter(results);
expect(JSON.stringify(results)).toBe(before);
```

---

### `src/pipeline/dedup.ts` (EDIT — pipeline step, pure transform)

**Analog:** self (existing bootstrap branch, dedup.ts L46-55).

**Current bootstrap guard** (dedup.ts L48-55):
```typescript
const priorFirm = seen.firms[r.firm.id];
if (!priorFirm) {
  return { ...r, new: [] };
}
```

**Extension per D-P2-08** — treat `{urls: [], lastNewAt: null}` as bootstrap too:
```typescript
const priorFirm = seen.firms[r.firm.id];
// D-09 first-run bootstrap: absent OR manually-cleared empty state. The
// empty-state branch (D-P2-08) prevents back-catalog flood after manual
// state edits (WR-05 from Phase 1 code review).
if (!priorFirm || (priorFirm.urls.length === 0 && priorFirm.lastNewAt === null)) {
  return { ...r, new: [] };
}
```

**Comment block to add** — extend the existing invariant #2 (dedup.ts L13-18) with a sub-bullet for the D-P2-08 empty-state bootstrap; reference RESEARCH Pitfall 6 (L640-645).

**Test addition** (dedup.test.ts L46-63 template) — add an `it('(D-P2-08) empty-state bootstrap — priorFirm exists but urls:[] and lastNewAt:null → new:[]')` case that mirrors the existing bootstrap test but with a populated seen state whose firm entry is zero-urls.

---

### `src/mailer/gmail.ts` (EDIT — boundary, request-response with retry)

**Analog:** `src/summarize/gemini.ts` (p-retry v8 usage in the same codebase).

**p-retry v8 import + destructured onFailedAttempt signature** (gemini.ts L23):
```typescript
import pRetry, { AbortError } from 'p-retry';
```
And callback shape (gemini.ts L82-88):
```typescript
onFailedAttempt: ({ error }) => {
  const anyErr = error as unknown as { status?: number; name?: string; message: string };
  if (anyErr.status === 429 && model === 'gemini-2.5-flash') { ... }
  if (anyErr.name === 'ZodError') throw new AbortError(anyErr.message);
},
```
This is the v8 destructured-context shape (NOT v6's `(err: Error) => void`). RESEARCH L646-651 flags signature drift as a regression risk — the mailer MUST use the same shape as gemini.ts.

**Current 535 detection pattern** (gmail.ts L48-63) — preserve exactly, but wrap in AbortError instead of re-throw:
```typescript
const anyErr = err as { responseCode?: number; response?: string; message?: string };
if (
  anyErr.responseCode === 535 ||
  (typeof anyErr.response === 'string' && anyErr.response.includes('535'))
) {
  console.error('GMAIL_AUTH_FAILURE: App Password invalid or revoked.');
  console.error('Regenerate at https://myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD secret.');
  throw new AbortError(`SMTP 535 auth: ${scrubSecrets(anyErr.message ?? String(err))}`);  // <-- CHANGED: AbortError not plain Error
}
```
Keep: the field-rename defense (A4 defensive check), the literal `GMAIL_AUTH_FAILURE` marker, the recovery URL, `scrubSecrets`.

**Full retry wrapper pattern** — use RESEARCH Pattern 3 (L443-500) verbatim. Structure:
```typescript
const sendOnce = async () => {
  try {
    await transporter.sendMail({...});
  } catch (err) {
    // 535 → AbortError (no retry)
    // other non-5xx (code < 500 || >= 600) → AbortError (no retry)
    // 5xx or code missing → plain Error (retryable)
  }
};
await pRetry(sendOnce, {
  retries: 3,
  factor: 2,
  minTimeout: 2_000,
  maxTimeout: 8_000,
  onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
    console.warn(`[SMTP retry ${attemptNumber}/${attemptNumber + retriesLeft}] ${error.message}`);
  },
});
```

**DRY_RUN short-circuit** (gmail.ts L27-31) — preserve verbatim as the first check, BEFORE the transporter is created. Pattern 2 DRY_RUN containment still applies; the retry wrapping only affects the post-DRY_RUN path.

**W2 fail-loud invariant** (gmail.ts module docstring L10-12) — current invariant says "EXACTLY ONE error-catching block". Phase 2 changes this count to TWO (one inside `sendOnce` classifier, one optionally in the outer pRetry catch if needed for logging). Update the module docstring invariant text to reflect the new count; grep gate in the plan will enforce via a locked number.

---

### `src/compose/templates.ts` (EDIT — renderer, pure transform)

**Analog:** self (existing `renderHtml`, local `escapeHtml` / `escapeAttr`).

**Module docstring pattern** (templates.ts L1-20) — extend the docstring block to include the failed-firm footer rationale (D-P2-04) and the `errorClass` taxonomy.

**Existing escapeHtml contract** (templates.ts L50-52 — LOCAL, not exported):
```typescript
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
```
**Phase 1 decision (01-08): escapeHtml stays local to templates.ts.** RESEARCH Example 2 L776-784 proposes a slightly richer escape (also `"` and `'`). Planner should choose one and use it consistently — simplest path is to extend the existing regex to `/[&<>"']/g` so the footer and existing body share one escaper. Either way, **do NOT export escapeHtml** — that was a locked Phase 1 decision.

**New `classifyError` helper + `renderFailedFirmsFooter`** — use RESEARCH Example 2 (L743-785) verbatim. Key pieces:
```typescript
function classifyError(msg: string, stage: string): string {
  if (msg.includes('robots.txt disallows')) return 'robots-blocked';
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return 'fetch-timeout';
  const http = /HTTP (\d{3})/.exec(msg);
  if (http) return `http-${http[1]}`;
  if (/ENOTFOUND|DNS/i.test(msg)) return 'dns-fail';
  if (stage === 'parse' || /parse|selector/i.test(msg)) return 'parse-error';
  if (/selectors? (miss|not found)/i.test(msg)) return 'selector-miss';
  return 'unknown';
}
```
The regex `HTTP (\d{3})` couples to rss.ts/html.ts error format — the `{firm.id}: HTTP {status}` shape documented in the `src/scrapers/html.ts` section above.

**Wire footer into renderHtml** — current renderHtml (templates.ts L43-48) emits a footer inline:
```typescript
return `<!doctype html><html><body ...>
  <h1 style="...">법률 다이제스트 ${escapeHtml(dateKst)}</h1>
  ${sections}
  <footer style="margin-top:32px;color:#888;font-size:12px;">AI 요약 — 원문 확인 필수</footer>
</body></html>`;
```
Extend: accept `failed: FirmResult[]` as a second argument, insert `${renderFailedFirmsFooter(failed)}` BEFORE the existing `AI 요약 — 원문 확인 필수` line (per D-P2-04 structure). The composer (`src/compose/digest.ts`) will pass in the failed firms.

**Update `composeDigest`** (digest.ts L32-37): currently filters `firmsWithNew`; add parallel `firmsWithErrors = results.filter((r) => r.error)` and pass both to `renderHtml`:
```typescript
const failed = results.filter((r) => r.error);
const html = renderHtml(firmsWithNew, dateKst, failed);
```

**Snapshot test update** (test/compose/digest.test.ts L111-119) — extend the fixture with a failed-firm `FirmResult` (`error: { stage: 'fetch', message: 'HTTP 503' }`) to lock the footer rendering. The `expect(payload.html).toMatchSnapshot()` will regenerate automatically.

---

### `src/config/schema.ts` (EDIT — config, validation)

**Analog:** self (existing `FirmSchema`, schema.ts L12-37).

**Current `.selectors` inner object** (schema.ts L27-33):
```typescript
selectors: z
  .object({
    list_item: z.string(),
    title: z.string(),
    link: z.string(),
    date: z.string().optional(),
  })
  .optional(),
```

**D-P2-15 extension (onclick-link firms) + D-P2-02 body override** — replace with:
```typescript
selectors: z
  .object({
    list_item: z.string(),
    title: z.string(),
    link: z.string().optional(),                          // CHANGED: now optional (was required)
    link_onclick_regex: z.string().optional(),             // NEW: D-P2-15
    link_template: z.string().regex(/^(https?:\/\/|\/)/).optional(), // NEW: D-P2-15 + Pitfall 5 guard
    date: z.string().optional(),
    body: z.string().optional(),                           // NEW: D-P2-11 per-firm body override
  })
  .refine(
    (s) => !!s.link || (!!s.link_onclick_regex && !!s.link_template),
    { message: 'Each firm needs either selectors.link OR (selectors.link_onclick_regex + selectors.link_template)' },
  )
  .optional(),
```

**D-P2-07 keyword filter extension** — ADD at the FirmSchema top level (after `timeout_ms`):
```typescript
include_keywords: z.array(z.string()).optional().default([]),
exclude_keywords: z.array(z.string()).optional().default([]),
```

**`.strict()` boundary** (schema.ts L37) — the strict mode is a CONF-02 invariant. Every new field above must be declared here, or YAML will reject them at load time. This is INTENTIONAL. The planner must add all four new fields (`link_onclick_regex`, `link_template`, `body`, `include_keywords`, `exclude_keywords`) to the zod schema in the SAME commit as the YAML additions, or validation fails.

---

### `src/types.ts` (EDIT — type contract)

**Analog:** self (existing `FirmConfig`, types.ts L17-33).

**Mirror schema extensions in the TS interface** (types.ts L17-33):
```typescript
export interface FirmConfig {
  id: string;
  name: string;
  language: Language;
  type: FirmType;
  url: string;
  timezone: string;
  enabled: boolean;
  selectors?: {
    list_item: string;
    title: string;
    link?: string;                     // CHANGED: optional
    link_onclick_regex?: string;        // NEW
    link_template?: string;             // NEW
    date?: string;
    body?: string;                      // NEW
  };
  user_agent?: string;
  timeout_ms?: number;
  include_keywords?: string[];           // NEW
  exclude_keywords?: string[];           // NEW
}
```

Preserve the existing docstring block (types.ts L1-12) — "SINGLE SOURCE OF TRUTH" + "DO NOT redeclare these shapes elsewhere" is a locked invariant. Add a sub-bullet noting that `include_keywords` / `exclude_keywords` default to `[]` at schema validation, so runtime code can assume they are defined arrays (but keeping them optional on the interface matches the zod `.optional().default([])` output type).

**FirmType enum widening** (types.ts L14): the `'js-render'` literal already exists. No change needed — the config `type` enum (schema.ts L20) is still `['rss', 'html']` only (js-render is Phase 4). Keep types.ts `FirmType` as-is; the mismatch is intentional (runtime rejects 'js-render' at schema.parse before the TS type is ever populated).

**RawItem unchanged** (types.ts L35-42). Bodies flow through the existing optional `description` field per the COMP-05 strict rule — no new field needed. Do NOT add a `body` field here.

---

### `config/firms.yaml` (EDIT — config data)

**Analog:** self (existing `cooley` entry, firms.yaml L33-40).

**Existing entry format** (firms.yaml L33-40):
```yaml
firms:
  - id: cooley
    name: Cooley
    language: en
    type: rss
    url: https://cooleygo.com/feed/
    timezone: America/Los_Angeles
    enabled: true
```

**Add 8 new entries per D-P2-14 (Option A+B: 9 live + 3 disabled placeholders)** — use RESEARCH L168-183 table for the canonical spec. RESEARCH L529-544 shows the kim-chang onclick-extract example format:
```yaml
  - id: kim-chang
    name: 김앤장 법률사무소
    language: ko
    type: html
    url: https://www.kimchang.com/ko/newsletter.kc
    timezone: Asia/Seoul
    enabled: true
    selectors:
      list_item: "ul.notice_list > li"
      title: ".notice_txt .title, .notice_txt._dotdotdot_news"
      link_onclick_regex: "goDetail\\('(\\d+)','(\\d+)'\\)"
      link_template: "https://www.kimchang.com/ko/insights/detail.kc?sch_section={1}&idx={2}"
      date: ".notice_date"
```

**Comment header preservation** (firms.yaml L1-31) — keep the existing Korean header comment block; add a Phase 2 section noting the tier split (3 RSS / 4 plain-href HTML / 2 onclick-extract HTML / 3 disabled). Reference D-P2-14 for the firm selection rationale.

**Disabled placeholder pattern** (per D-P2-14) — disabled entries still need valid YAML shape:
```yaml
  - id: lee-ko
    name: 광장
    language: ko
    type: html
    url: https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR
    timezone: Asia/Seoul
    enabled: false  # JS-render required — defer to Phase 4
    selectors:      # placeholder selectors; not exercised while disabled
      list_item: "ul#contentsList > li"
      title: ".title"
      link: "a"
```
`loadFirms()` filters to `enabled === true` (loader.ts L52), so disabled entries never reach the pipeline. But the full zod shape still applies — selectors must satisfy the refinement (either `link` OR `link_onclick_regex`+`link_template`).

---

### `test/scrapers/html.test.ts` (NEW — test, fixture-based)

**Analog:** `test/scrapers/rss.test.ts`

**Fixture-mock-fetch pattern** (rss.test.ts L35-68) — copy verbatim:
```typescript
let originalFetch: typeof fetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

it('parses fixture into RawItem[] with canonical URLs', async () => {
  const html = await readFile(new URL('../fixtures/shin-kim.list.html', import.meta.url), 'utf8');
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  ) as typeof fetch;
  const items = await scrapeHtml(shinKim);
  expect(items.length).toBeGreaterThan(0);
  expect(items[0]).toMatchObject({ firmId: 'shin-kim', language: 'ko' });
  expect(items[0].url).not.toMatch(/utm_source/);
});
```

**New fixtures to create under `test/fixtures/`:**
- `shin-kim.list.html` — plain-href listing page (3+ items, `.post-prime > a.text[href]`)
- `bkl.list.html` — onclick-extract listing page (`onclick="goView('123456')"`)
- `korean-cp949.html` — CP949-encoded Korean page for charset helper test
- Follow existing `test/fixtures/cooley.rss.xml` naming convention.

**HTTP error propagation test** (rss.test.ts L102-107):
```typescript
it('throws on non-OK response', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as typeof fetch;
  await expect(scrapeHtml(shinKim)).rejects.toThrow(/HTTP 503/);
});
```
Error message shape `{firm.id}: HTTP {status}` couples to the footer `classifyError` regex — locking this is important.

**Onclick-extract test** (new):
```typescript
it('extracts URLs from onclick attribute via regex + template', async () => {
  // html has <a onclick="goView('9999')">title</a>
  // expect output url === canonicalizeUrl('.../informationView.do?infoNo=9999&lang=ko', firm.url)
});
```

**Charset-aware test** (new, using cp949 fixture):
```typescript
it('decodes CP949 HTML correctly', async () => {
  const buf = await readFile(new URL('../fixtures/korean-cp949.html', import.meta.url));
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(buf, { status: 200, headers: { 'content-type': 'text/html; charset=euc-kr' } }),
  ) as typeof fetch;
  const items = await scrapeHtml(firmWithCp949);
  expect(items[0].title).toContain('한국어');  // decoded correctly
});
```

---

### `test/pipeline/filter.test.ts` (NEW — test, pure-fn)

**Analog:** `test/pipeline/dedup.test.ts`

**Fixture builder pattern** (dedup.test.ts L30-43):
```typescript
function makeResult(raw: Array<{ url: string; title: string; description?: string }>): FirmResult {
  return {
    firm: cooley,
    raw: raw.map((r) => ({ firmId: 'cooley', title: r.title, url: r.url, language: 'en', description: r.description })),
    new: [],
    summarized: [],
    durationMs: 0,
  };
}
```

**Test matrix to cover (adapt from dedup.test.ts L45-143):**
1. No filter — empty `include_keywords` + empty `exclude_keywords` → results unchanged.
2. `include_keywords` AND-match — only items with at least one keyword in title+body[:500] kept.
3. `exclude_keywords` OR-kill — any item with any exclude keyword dropped.
4. Both filters combined — include passes + exclude kills.
5. Case-insensitive matching — `Include_KEYWORD` in title matches `include_keyword` config.
6. Error pass-through — `r.error` set → `toBe(r)` reference unchanged.
7. No mutation — `JSON.stringify(before) === JSON.stringify(after)`.
8. Empty raw — `r.raw: []` → unchanged (no crash).

---

### `test/pipeline/enrichBody.test.ts` (NEW — test, mock-fetch)

**Analog:** `test/scrapers/rss.test.ts` (fetch mock pattern)

**Test matrix:**
1. Populates `description` from fetched body (happy path).
2. Per-firm sequential — verify pLimit(1) by asserting fetch-call ordering with a stubbed delayed resolver.
3. 500ms min delay — inject a fake timer (`vi.useFakeTimers()`) and assert interval between fetches ≥ 500ms for items 2+.
4. Item-level failure isolation — one item's fetch throws; other items still enriched.
5. Firm-level `r.error` pass-through — early return, no fetches triggered.
6. `firm.selectors.body` override — when set, uses that selector ahead of the generic chain.

---

## Shared Patterns

### Error message shape `{firm.id}: HTTP {status}`
**Source:** `src/scrapers/rss.ts` L68
**Apply to:** `src/scrapers/html.ts`, `src/scrapers/util.ts#decodeCharsetAwareFetch`
```typescript
throw new Error(`RSS fetch ${firm.id}: HTTP ${res.status}`);
```
**Downstream coupling:** `src/compose/templates.ts#classifyError` parses `/HTTP (\d{3})/` → `http-{status}` errorClass. Any scraper that throws on HTTP fail MUST use this exact shape so the footer taxonomy stays unified.

### scrubSecrets on every logged error
**Source:** `src/util/logging.ts` L15-26 (definition); `src/pipeline/fetch.ts` L70, `src/mailer/gmail.ts` L63, `src/summarize/gemini.ts` L96 (usage)
**Apply to:** `src/pipeline/fetch.ts` (already uses), new catch in `src/mailer/gmail.ts` pRetry wrapper, any new error logging in `src/pipeline/enrichBody.ts` if it chooses to log failures.
```typescript
import { scrubSecrets } from '../util/logging.js';
// ...
message: scrubSecrets((err as Error).message)
```
COMP-01 invariant: user-facing error text always passes through `scrubSecrets` before logging or email rendering.

### USER_AGENT via `../util/logging.js`
**Source:** `src/util/logging.ts` L12-13
**Apply to:** `src/scrapers/html.ts` (indirectly via `decodeCharsetAwareFetch`), `src/scrapers/util.ts` new helper, `src/scrapers/robots.ts` (already uses), `src/scrapers/rss.ts` (already uses)
```typescript
import { USER_AGENT } from '../util/logging.js';
headers: { 'User-Agent': USER_AGENT }
```
FETCH-04 / Pitfall 9: every outbound HTTP call carries the honest bot UA. No browser-emulating UAs anywhere.

### Per-item try/catch-and-continue
**Source:** `src/scrapers/rss.ts` L82-101
**Apply to:** `src/scrapers/html.ts` (inside `$(list_item).each`), `src/pipeline/enrichBody.ts` (inside `r.raw.map`).
Discipline: one malformed row never tanks the whole firm. Empty catch block is acceptable and established.

### Pure-function module docstring block
**Source:** `src/pipeline/dedup.ts` L1-37
**Apply to:** `src/pipeline/filter.ts` (NEW)
Five-invariants preamble: PURE, ERROR PASS-THROUGH, NO MUTATION, canonical-assumption, test-contract-reference. Treat as a template for any new pure pipeline step.

### pLimit import + usage
**Source:** `src/pipeline/fetch.ts` L19, L40; `src/main.ts` L72
**Apply to:** `src/pipeline/enrichBody.ts` (per-firm pLimit(1) per D-P2-10).
```typescript
import pLimit from 'p-limit';
const limit = pLimit(N);
await limit(async () => { ... });
```

### p-retry v8 destructured `onFailedAttempt({ error })`
**Source:** `src/summarize/gemini.ts` L82-88
**Apply to:** `src/mailer/gmail.ts` pRetry wrapper.
```typescript
import pRetry, { AbortError } from 'p-retry';
onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => { ... }
```
Never use v6 `(err: Error) => void` signature — RESEARCH Pitfall 7 (L646-652) flags this as a known regression risk.

### DRY_RUN check sites — exactly two (enforced by grep gate)
**Source:** `src/env.ts` (single helper); check sites: `src/mailer/gmail.ts` L27, `src/state/writer.ts` L95
**Apply to:** NO NEW CHECK SITES in Phase 2. Pattern 2 prohibits scattered DRY_RUN checks; the existing two remain the only sanctioned sites. `enrichWithBody`, `applyKeywordFilter`, `scrapeHtml` must NOT import `isDryRun`. The Phase 1 grep gate counts `isDryRun` imports globally — adding a third would fail the gate.

### Local (non-exported) escapeHtml
**Source:** `src/compose/templates.ts` L50-52
**Apply to:** `src/compose/templates.ts` (NEW `renderFailedFirmsFooter` uses the SAME local helper — do NOT export it, do NOT duplicate it in a separate file).
Phase 1 01-08 locked decision: escapeHtml stays local to templates.ts. If the footer needs richer escape (including `"` and `'`), extend the existing regex — do not introduce a second escaper.

## No Analog Found

No Phase 2 files lack an analog in Phase 1. Every new file (`scrapers/html.ts`, `pipeline/enrichBody.ts`, `pipeline/filter.ts`) composes existing Phase 1 patterns (rss.ts scraper shell, fetch.ts orchestration, dedup.ts pure-fn) rather than introducing novel architecture. The only net-new external dependency is `iconv-lite@0.7.2`, consumed inside `decodeCharsetAwareFetch` — a single leaf operation, not a new architectural pattern.

## Metadata

**Analog search scope:** `src/**/*.ts`, `test/**/*.ts`, `config/**/*.yaml`
**Files scanned:** 18 source files + 6 test files + 2 config files = 26 files
**Pattern extraction date:** 2026-04-17
**Upstream inputs consumed:** `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` (244 lines), `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-RESEARCH.md` (1,009 lines)
