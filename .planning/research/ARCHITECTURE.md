# Architecture Research

**Domain:** Personal cron-driven scraping + LLM-summarization + email-digest pipeline (single-process, daily GHA runner)
**Researched:** 2026-04-16
**Confidence:** HIGH on component boundaries and data flow (canonical ETL shape); HIGH on state schema (small enough that the schema IS the design); MEDIUM on exact error-boundary granularity (concrete pattern given, tuning during Phase 1).

---

## Design Premise

This is a **single-process, single-run-per-day batch pipeline** — not a service. It wakes up, does work, commits state, and exits. That premise shapes every decision:

- No long-lived processes → no queues, no workers, no retries that outlive the run.
- One recipient → no user system, no multi-tenancy.
- Config is a file → no admin API, no database of firms.
- State is a git commit → no DB, no migrations.

Architecture complexity should be just barely enough to (a) isolate one firm's failure from another, (b) make the Gemini/SMTP edges swappable for tests, and (c) let a non-developer drop a new firm into YAML without touching code.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                   GitHub Actions Workflow (cron daily)              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  actions/checkout → setup-node → pnpm install → tsx main.ts   │  │
│  └───────────────────┬──────────────────────────┬────────────────┘  │
│                      │ (success)                │ (always)          │
│                      ↓                          ↓                   │
│         git-auto-commit state/          actions-summary write       │
└──────────────────────┼──────────────────────────┼───────────────────┘
                       │                          │
┌──────────────────────┴──────────────────────────┴───────────────────┐
│                          Orchestrator (main.ts)                     │
│   loads config → spawns per-firm pipelines → aggregates → sends     │
└────┬─────────────────┬────────────────┬──────────────┬──────────────┘
     │                 │                │              │
     ↓                 ↓                ↓              ↓
┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────────┐
│  Config  │   │ Fetch-layer  │   │  Dedup   │   │  Summarizer  │
│  Loader  │   │  (per firm)  │   │  (state  │   │  (Gemini)    │
│ + zod    │   │              │   │   diff)  │   │              │
└────┬─────┘   └──────┬───────┘   └────┬─────┘   └──────┬───────┘
     │                │                │                │
     │         ┌──────┴──────┐         │                │
     │         ↓      ↓      ↓         │                │
     │      ┌─────┐┌─────┐┌─────┐      │                │
     │      │ RSS ││HTML ││ JS  │      │                │
     │      │feed-││fetch││play-│      │                │
     │      │parse││+chee││wright│     │                │
     │      └─────┘│rio │ └─────┘      │                │
     │             └─────┘             │                │
     ↓                                  ↓                ↓
┌──────────────────────────────────────────────────────────────┐
│                         Composer                              │
│          RawItem[] → SummarizedItem[] → EmailPayload         │
│                   (Korean digest, HTML + text)               │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ↓
                        ┌─────────────┐        ┌─────────────┐
                        │   Mailer    │        │   State     │
                        │ (nodemailer │        │   Writer    │
                        │  + Gmail)   │        │ (seen.json) │
                        └─────────────┘        └─────────────┘
                               │                      │
                               ↓                      ↓
                        ┌─────────────────────────────────────┐
                        │       Run Reporter (GHA summary)    │
                        └─────────────────────────────────────┘
```

### Component Responsibilities

| # | Component | Owns | Does NOT Own | Implementation |
|---|-----------|------|--------------|----------------|
| 1 | **ConfigLoader** | Parsing `config/firms.yaml`, validating with zod, producing `FirmConfig[]` | Fetching, scraping, summarization | `src/config/loader.ts` — uses `yaml` + `zod`, throws with helpful paths on invalid schema |
| 2 | **Orchestrator** | Run lifecycle, concurrency, failure isolation, timing, final exit code | Domain logic (delegates to everything else) | `src/main.ts` — wires components, owns `Promise.allSettled` over firms |
| 3 | **Scraper (tiered)** | Converting a firm's URL into `RawItem[]` | Dedup, summarization, state | Strategy-per-type: `src/scrapers/rss.ts`, `html.ts`, `jsRender.ts`. All export `scrape(firm: FirmConfig): Promise<RawItem[]>`. |
| 4 | **FetchOrchestrator** (inside Orchestrator) | Picking the right scraper per firm, applying `p-limit` concurrency, per-firm try/catch, retries via `p-retry` | Parsing HTML (delegates) | `src/pipeline/fetch.ts` — dispatches on `firm.type` |
| 5 | **Dedup** | Comparing `RawItem[]` against prior `SeenState` → returns `NewItem[]` + updated seen set | Any I/O | `src/pipeline/dedup.ts` — pure function, trivially testable |
| 6 | **Summarizer** | Calling Gemini with a single-item prompt, parsing structured JSON response, handling 429/safety blocks, model fallback (Flash → Flash-Lite) | Orchestration of multiple items (caller loops) | `src/summarize/gemini.ts` — wraps `@google/genai` with `p-retry` + fallback |
| 7 | **Composer** | Turning `SummarizedItem[]` grouped by firm into `{ subject, html, text }` | Sending | `src/compose/digest.ts` — pure template function |
| 8 | **Mailer** | Sending the composed payload via nodemailer/Gmail. Reads `DRY_RUN` flag and prints instead of sending | Composing the body | `src/mailer/gmail.ts` — thin wrapper around `nodemailer.createTransport` |
| 9 | **StateWriter** | Merging new URL set into `seen.json`, writing it back to disk, bounded to last N per firm | Git ops (GHA action handles push) | `src/state/writer.ts` — pure file I/O, DRY_RUN-aware |
| 10 | **RunReporter** | Emitting GitHub Step Summary markdown + structured logs | Deciding what to report (consumers pass results in) | `src/report/summary.ts` — writes to `$GITHUB_STEP_SUMMARY` file |

### Contracts Between Components

Every boundary passes typed data, never raw responses. This is the whole point of having TypeScript.

```typescript
// src/types.ts  — the complete contract surface

export type FirmType = 'rss' | 'html' | 'js-render';
export type Language = 'ko' | 'en';

export interface FirmConfig {
  id: string;              // slug, stable key into seen.json
  name: string;            // human display name for digest
  language: Language;      // source language (affects prompt)
  type: FirmType;
  url: string;
  // HTML/JS-render only:
  selectors?: {
    list_item: string;
    title: string;
    link: string;         // supports "a@href" attribute extraction
    date?: string;        // optional; falls back to "today" if absent
  };
  // JS-render only:
  wait_for?: string;      // CSS selector that signals page ready
  // Optional polite overrides:
  user_agent?: string;
  timeout_ms?: number;    // default 20000
}

export interface RawItem {
  firmId: string;
  title: string;
  url: string;            // canonical absolute URL — scrapers MUST resolve relative URLs
  publishedAt?: string;   // ISO-8601 if extractable
  language: Language;     // inherited from firm
}

export interface NewItem extends RawItem {
  // same shape as RawItem — narrowed type for "not seen before" items
  isNew: true;
}

export interface SummarizedItem extends NewItem {
  summary_ko: string;     // 3–5 line Korean summary
  summaryConfidence: 'high' | 'medium' | 'low';
  summaryModel: string;   // which Gemini model produced it (or "skipped" if blocked)
  summaryError?: string;  // set if summarization failed — item still included with null summary
}

export interface FirmResult {
  firm: FirmConfig;
  raw: RawItem[];         // everything fetched
  new: NewItem[];         // after dedup
  summarized: SummarizedItem[];
  error?: {               // set if the firm blew up at any stage
    stage: 'fetch' | 'parse' | 'dedup' | 'summarize';
    message: string;
    stack?: string;
  };
  durationMs: number;
}

export interface RunReport {
  startedAt: string;      // ISO
  finishedAt: string;
  firms: FirmResult[];
  digestSent: boolean;
  newItemTotal: number;
  errors: Array<{ firmId: string; message: string }>;
}
```

**Call direction is strictly one-way downstream** — no component upstream of itself, no cycles. `main.ts` is the only place that composes these together.

---

## Recommended Project Structure

```
legalnewsletter/
├── .github/
│   └── workflows/
│       └── daily.yml              # cron schedule + workflow_dispatch trigger
├── config/
│   └── firms.yaml                 # THE non-developer edit surface
├── state/
│   ├── seen.json                  # dedup state (committed back each run)
│   └── last-run.json              # metadata for debugging
├── src/
│   ├── main.ts                    # Orchestrator (entry point for `tsx src/main.ts`)
│   ├── types.ts                   # All shared interfaces (contract surface)
│   ├── config/
│   │   ├── schema.ts              # zod schema for FirmConfig + global config
│   │   └── loader.ts              # YAML → validated FirmConfig[]
│   ├── scrapers/
│   │   ├── index.ts               # dispatch(firm) → pick strategy
│   │   ├── rss.ts                 # feedparser strategy
│   │   ├── html.ts                # fetch + cheerio strategy
│   │   ├── jsRender.ts            # playwright strategy
│   │   └── util.ts                # resolveUrl, parseDate, normalizeTitle
│   ├── pipeline/
│   │   ├── fetch.ts               # runs scrapers with concurrency + per-firm try/catch
│   │   ├── dedup.ts               # RawItem[] × SeenState → NewItem[]
│   │   └── summarize.ts           # NewItem[] → SummarizedItem[] (loops, uses Summarizer)
│   ├── summarize/
│   │   ├── gemini.ts              # @google/genai wrapper, fallback logic
│   │   └── prompt.ts              # Korean summary prompt + responseSchema
│   ├── compose/
│   │   ├── digest.ts              # SummarizedItem[] → EmailPayload
│   │   └── templates/
│   │       ├── digest.html.ts     # template literal HTML (no mjml for v1)
│   │       └── digest.text.ts     # plaintext version
│   ├── mailer/
│   │   └── gmail.ts               # nodemailer wrapper, DRY_RUN-aware
│   ├── state/
│   │   ├── reader.ts              # load seen.json → SeenState
│   │   └── writer.ts              # merge + write seen.json (DRY_RUN-aware)
│   ├── report/
│   │   └── summary.ts             # GHA step summary writer
│   └── cli/
│       └── checkFirm.ts           # `pnpm check:firm <id>` — single-firm probe
├── test/
│   ├── fixtures/
│   │   ├── kimchang.html          # recorded HTML per firm for replay tests
│   │   └── cooley.rss.xml
│   ├── scrapers/
│   │   ├── html.test.ts
│   │   └── rss.test.ts
│   ├── pipeline/
│   │   └── dedup.test.ts          # pure-function tests, highest ROI
│   └── compose/
│       └── digest.test.ts         # snapshot tests on rendered HTML
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Structure Rationale

- **`config/` separated from `src/`**: signals to non-developer users where to edit. Git-friendly path, easy to mention in README: "edit `config/firms.yaml`, commit, push".
- **`src/scrapers/` per strategy, flat not nested**: three types (`rss`, `html`, `jsRender`) stay flat; `index.ts` dispatches. Keeps each under ~100 lines.
- **`src/pipeline/` separate from `src/scrapers/`**: pipeline is the *choreography* (concurrency, retries, try/catch), scrapers are the *workers*. Keeps failure isolation logic in one file.
- **`src/types.ts` at the top level**: every layer imports from here. One source of truth for contracts.
- **`state/` at repo root, not inside `src/`**: it's data, not code. Gets committed back by `git-auto-commit-action` targeting this path.
- **`test/fixtures/`**: recorded HTML/RSS payloads enable offline, deterministic parser tests. Single biggest leverage for keeping the codebase testable as firms change their markup.

---

## Architectural Patterns

### Pattern 1: Strategy Dispatch for Scrapers

**What:** A thin `scrapers/index.ts` picks the implementation based on `firm.type`. Each strategy exports the same function signature.

**When to use:** You have N ways to do the same logical operation, selection is data-driven (from config), and you want adding a new strategy to be "drop a file + add a case".

**Trade-offs:** Slight indirection cost. Pays for itself the first time you add a fourth scrape strategy (e.g. a per-firm custom fetcher for a weird auth-gated site).

**Example:**

```typescript
// src/scrapers/index.ts
import type { FirmConfig, RawItem } from '../types';
import { scrapeRss } from './rss';
import { scrapeHtml } from './html';
import { scrapeJsRender } from './jsRender';

const strategies = {
  'rss': scrapeRss,
  'html': scrapeHtml,
  'js-render': scrapeJsRender,
} as const;

export function scrape(firm: FirmConfig): Promise<RawItem[]> {
  const strategy = strategies[firm.type];
  if (!strategy) throw new Error(`Unknown firm type: ${firm.type}`);
  return strategy(firm);
}
```

### Pattern 2: Per-Firm Failure Isolation via Promise.allSettled

**What:** The orchestrator runs all firms through `Promise.allSettled` wrapped in `p-limit(3)`. A scrape failure becomes a `FirmResult` with `error` set — never a thrown exception that kills the run.

**When to use:** Batch processing N independent units where one failure should not stop the rest.

**Trade-offs:** You must remember to check `error` at every downstream stage (dedup, summarize, compose skip errored firms). Explicit is better than implicit here — a hidden `throw` from one firm that terminates 11 others is catastrophic for a once-a-day job.

**Example:**

```typescript
// src/pipeline/fetch.ts
import pLimit from 'p-limit';
import { scrape } from '../scrapers';
import type { FirmConfig, FirmResult } from '../types';

export async function fetchAll(firms: FirmConfig[]): Promise<FirmResult[]> {
  const limit = pLimit(3);
  return Promise.all(
    firms.map(firm => limit(async (): Promise<FirmResult> => {
      const started = Date.now();
      try {
        const raw = await scrape(firm);
        return { firm, raw, new: [], summarized: [], durationMs: Date.now() - started };
      } catch (err) {
        return {
          firm, raw: [], new: [], summarized: [],
          error: { stage: 'fetch', message: (err as Error).message, stack: (err as Error).stack },
          durationMs: Date.now() - started,
        };
      }
    }))
  );
}
```

### Pattern 3: DRY_RUN as a Side-Effect Flag, Not a Mode

**What:** `DRY_RUN=1` is checked at exactly two places — `mailer/gmail.ts` (print instead of send) and `state/writer.ts` (skip write). Everything upstream runs identically.

**When to use:** Pipelines with a small number of irreversible side effects. Keeps the happy path and the dev path on the same code, avoiding "it worked in dry-run but broke in prod" surprises.

**Trade-offs:** The two check sites must be audited carefully. Lean toward having a single `isDryRun()` helper that both import, not scattered `process.env.DRY_RUN` checks.

**Example:**

```typescript
// src/env.ts
export const isDryRun = () => process.env.DRY_RUN === '1';

// src/mailer/gmail.ts
import { isDryRun } from '../env';
export async function send(payload: EmailPayload) {
  if (isDryRun()) {
    console.log('[DRY_RUN] Email subject:', payload.subject);
    console.log('[DRY_RUN] Email body:\n', payload.text);
    return { sent: false, reason: 'dry-run' };
  }
  return transporter.sendMail(payload);
}
```

### Pattern 4: Structured Output Prompts for Summarizer

**What:** Instead of asking Gemini for free-form Korean text, ask for JSON matching a `responseSchema`. Parse with a zod schema on return.

**When to use:** Any LLM call where downstream code depends on the shape. One prompt-format change should not silently break the composer.

**Trade-offs:** Slightly more verbose prompt, tiny token overhead. Eliminates an entire class of "the model returned English today" bugs.

**Example:**

```typescript
// src/summarize/gemini.ts
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const SummarySchema = z.object({
  summary_ko: z.string().min(10).max(500),
  confidence: z.enum(['high', 'medium', 'low']),
});

const responseSchema = {
  type: 'object',
  properties: {
    summary_ko: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['summary_ko', 'confidence'],
};

export async function summarize(item: NewItem, model = 'gemini-2.5-flash'): Promise<...> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model,
    contents: buildPrompt(item),
    config: { responseMimeType: 'application/json', responseSchema },
  });
  return SummarySchema.parse(JSON.parse(res.text));
}
```

### Pattern 5: State as Append-Bounded Per-Firm URL Sets

**What:** `seen.json` is `Record<firmId, string[]>` where each array is capped at last N URLs (e.g. 500). On each run: read → dedup against — → merge new URLs → trim to cap → write.

**When to use:** Small, bounded state that's read fully into memory each run. The cap prevents unbounded growth over years.

**Trade-offs:** If a firm somehow publishes more than N items in a single window, oldest ones get re-summarized. Cap should be at least 20x typical volume; 500 vs ~5 per day = 100-day window, safe.

---

## Data Flow

### End-to-End Flow (Happy Path)

```
config/firms.yaml
    │
    ↓ [ConfigLoader.load]
FirmConfig[]  ──────────────────────────────────────────────┐
    │                                                        │
    ↓ [FetchOrchestrator.fetchAll]  (p-limit=3, allSettled)  │
    │    per firm:                                           │
    │       scrapers/index.ts → scrapeRss|Html|JsRender      │
    │       → RawItem[]                                      │
    │                                                        │
FirmResult[] (raw populated, error possibly set)             │
    │                                                        │
    ↓ [state/reader.ts] ←────── state/seen.json              │
SeenState = Record<firmId, Set<url>>                         │
    │                                                        │
    ↓ [pipeline/dedup.ts] for each FirmResult                │
    │    raw.filter(item => !seen[firmId].has(item.url))     │
FirmResult[] (new populated)                                 │
    │                                                        │
    ↓ [pipeline/summarize.ts]  (sequential w/ p-limit=3)     │
    │    per NewItem:                                        │
    │       summarize/gemini.ts → SummarizedItem             │
    │       (on 429 → fallback Flash-Lite; on fail → item    │
    │        with summaryError set, still included)          │
FirmResult[] (summarized populated)                          │
    │                                                        │
    ├─→ newItemTotal === 0? ─→ skip composer + mailer  ──────┤
    │                                                        │
    ↓ [compose/digest.ts]                                    │
EmailPayload { subject, html, text }                         │
    │                                                        │
    ↓ [mailer/gmail.ts]  (DRY_RUN-gated)                     │
sent: true / skipped                                         │
    │                                                        │
    ↓ [state/writer.ts]  (DRY_RUN-gated)  ─→ state/seen.json │
    │                                                        │
    ↓ [report/summary.ts] ←─────────────────────────────────-┘
GHA Step Summary markdown
    │
    ↓ (exit 0)
GHA: git-auto-commit-action pushes state/ changes
```

### Transformation Points

| Stage | Input | Output | Transformation |
|-------|-------|--------|----------------|
| Config load | YAML text | `FirmConfig[]` | Parse + zod validate; canonicalize URLs; apply defaults |
| Scrape (RSS) | HTTP response | `RawItem[]` | `feedparser` stream → `{title, link, pubDate}` per entry |
| Scrape (HTML) | HTTP response | `RawItem[]` | `cheerio.load(html)` → iterate `list_item` selector → extract via `selectors.title/link/date` → resolve relative URLs to absolute |
| Scrape (JS) | Rendered page | `RawItem[]` | `playwright.page.$$eval(selectors.list_item, …)` after `wait_for` satisfied |
| Dedup | `RawItem[]` + `SeenState` | `NewItem[]` | Set-difference by `url` (primary key). Title/date are not used — URL changes would look like new items even if content is same, which is acceptable trade-off for simplicity |
| Summarize | `NewItem` | `SummarizedItem` | Gemini call → JSON → zod parse. On error: `{...item, summary_ko: '', summaryError: msg}` (item still flows through) |
| Compose | `SummarizedItem[]` grouped by firm | `EmailPayload` | Group by `firmId`; render HTML template (firm section header + item list); plaintext version for multipart; subject = `"법률 뉴스레터 다이제스트 - YYYY-MM-DD (N건)"` |
| Send | `EmailPayload` | `{sent: boolean}` | `nodemailer.sendMail` |
| State write | `SeenState` + new URLs | updated `seen.json` | Merge new URLs per firm; trim to cap; stable-sort for clean diffs; write with trailing newline |

### Shape of an Item Through the Pipeline

This is the single most important contract. One item from Kim&Chang flows like:

```typescript
// After HTML scrape:
{
  firmId: 'kimchang',
  title: '개인정보보호법 개정안 주요 내용',
  url: 'https://www.kimchang.com/ko/insights/newsletters/2026-04-15',
  publishedAt: '2026-04-15T00:00:00+09:00',
  language: 'ko'
} satisfies RawItem

// After dedup (unchanged shape, narrowed type):
{ ...raw, isNew: true } satisfies NewItem

// After summarize:
{
  ...newItem,
  summary_ko: '2026년 개인정보보호법 개정안이 국회를 통과하여 ...',
  summaryConfidence: 'high',
  summaryModel: 'gemini-2.5-flash'
} satisfies SummarizedItem

// In composed HTML (rendered):
// <section data-firm="kimchang">
//   <h2>김·장 법률사무소</h2>
//   <article>
//     <h3><a href="...">개인정보보호법 개정안 주요 내용</a></h3>
//     <p>2026년 개인정보보호법 개정안이 ...</p>
//     <small>2026-04-15</small>
//   </article>
// </section>
```

---

## State Model

### `state/seen.json` (the only required state file)

```typescript
interface SeenState {
  version: 1;                           // schema version for future migrations
  lastUpdated: string;                  // ISO-8601, for debugging
  firms: Record<string, {               // keyed by FirmConfig.id
    urls: string[];                     // bounded list, max 500, newest first
    lastNewAt: string | null;           // ISO-8601 of last time this firm produced a new item
  }>;
}
```

**Example:**

```json
{
  "version": 1,
  "lastUpdated": "2026-04-16T00:05:12.000Z",
  "firms": {
    "kimchang": {
      "urls": [
        "https://www.kimchang.com/ko/insights/newsletters/2026-04-15",
        "https://www.kimchang.com/ko/insights/newsletters/2026-04-14"
      ],
      "lastNewAt": "2026-04-15T00:00:00+09:00"
    },
    "cooley": {
      "urls": [
        "https://www.cooley.com/news/insight/2026/2026-04-15-ai-regulation"
      ],
      "lastNewAt": "2026-04-15T00:00:00-07:00"
    }
  }
}
```

**Design choices:**
- **Per-firm nested, not flat**: keeps per-firm caps trivial to enforce and avoids firm-A's volume starving firm-B's history.
- **URLs (not hashes)** : human-readable in git diffs. Privacy is not a concern (public newsletter URLs).
- **`urls` as array, not Set**: JSON has no Set. In memory: `new Set(urls)` for O(1) lookup during dedup, `[...set]` to serialize.
- **Cap = 500 per firm**: at ~5 items/day, that's a 100-day lookback window. Well beyond any plausible dedup boundary.
- **Newest first**: when trimming, `slice(0, 500)` keeps recent. Also makes git diffs show the actual new entries at the top.
- **`lastNewAt` metadata**: lets the reporter flag "firm X hasn't published in 45 days — has the page URL changed?" without needing a second file.
- **`version: 1` field**: makes schema migration possible without data loss. If schema changes, write a one-time migrator triggered by version mismatch.

### `state/last-run.json` (optional, nice-to-have)

```typescript
interface LastRunState {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  firmCount: number;
  newItemTotal: number;
  digestSent: boolean;
  errors: Array<{ firmId: string; stage: string; message: string }>;
}
```

Written every run for debugging. Not used by the pipeline itself — purely observability.

### Why NOT a single flat list of URLs

Considered: `{ seen: [...allUrls] }`. Rejected because:
- One firm going silent for months would still hold capacity against another firm's cap.
- Makes "which firm does this URL belong to?" ambiguous during diffing.
- Dedup needs per-firm context for `lastNewAt`.

### Why NOT per-firm files (e.g. `state/kimchang.json`)

Considered. Rejected because:
- 12 files means 12 git entries changing → noisy commit history.
- One merged JSON is atomic — no partial-write states.
- File size stays under 100KB even at full cap for 20 firms.

---

## Build Order / Dependencies

Ship a **vertical slice (one firm end-to-end)** first. Every horizontal layer you add afterwards is an increment that ships on its own.

### Minimum Viable Slice (Phase 1 goal)

**Scope:** One firm (choose the easiest — ideally one with RSS, e.g. Cooley Alerts) → real Gemini → real Gmail → committed state.

**Ship order within the slice:**

1. **Types + Config loader** — `src/types.ts`, `src/config/{schema,loader}.ts`, `config/firms.yaml` with 1 entry. Run `tsx -e "import {loadConfig} from './src/config/loader'; loadConfig().then(console.log)"` to verify.
2. **One scraper (RSS)** — `src/scrapers/rss.ts` + `test/fixtures/cooley.rss.xml` + unit test. Offline test passes.
3. **State reader** — `src/state/reader.ts`. Starts empty, returns empty set if file missing.
4. **Dedup** — `src/pipeline/dedup.ts`. Pure function, trivially unit tested.
5. **Summarizer** — `src/summarize/{gemini,prompt}.ts`. First run hits real Gemini with a real item. This is the moment of truth — validate prompt/response in dev before wiring into pipeline.
6. **Composer** — `src/compose/digest.ts` + HTML template. Snapshot test on rendered output.
7. **Mailer (DRY_RUN first)** — `src/mailer/gmail.ts`. Run with `DRY_RUN=1` locally, confirm printed output looks right. Then run live to own inbox once.
8. **State writer** — `src/state/writer.ts`. Confirms dedup works on the second run.
9. **Orchestrator wiring** — `src/main.ts`. Glues 1–8 together for one firm.
10. **GHA workflow** — `.github/workflows/daily.yml` with `workflow_dispatch`-only trigger initially (no cron yet). Secrets set. Verify one manual run end-to-end.
11. **Enable cron** — add `schedule: - cron: '0 22 * * *'` (or whatever KST-aligned time), merge, watch first automatic run.

**After step 11, you have a working system for one firm.** Everything after is additive.

### Build-Out Order (Phase 2+)

Each increment is independently valuable; can stop at any point:

12. **Second scraper strategy (HTML + cheerio)** — adds Korean firms.
13. **Concurrency + per-firm failure isolation** — `p-limit` + `Promise.allSettled` in `src/pipeline/fetch.ts`. Matters once you have 3+ firms.
14. **Retry policy** — wrap scrape + Gemini calls in `p-retry`. Previously: fail once, report.
15. **Gemini model fallback** — Flash → Flash-Lite on 429.
16. **Run reporter** — GHA step summary with per-firm status table.
17. **Third scraper strategy (Playwright)** — only if any target firm demands JS rendering. Add last because it's the heaviest.
18. **Single-firm CLI probe** — `src/cli/checkFirm.ts` for debugging selector drift.
19. **Polish**: mjml for pretty HTML email, better Korean summarization prompt tuning.

### Dependency Graph (What Blocks What)

```
types.ts  ← everything
    ↓
config/loader.ts ← orchestrator
    ↓
scrapers/rss.ts ─┐
scrapers/html.ts ┼→ pipeline/fetch.ts ← orchestrator
scrapers/js.ts ──┘
    ↓
state/reader.ts → pipeline/dedup.ts ← orchestrator
    ↓
summarize/gemini.ts → pipeline/summarize.ts ← orchestrator
    ↓
compose/digest.ts ← orchestrator
    ↓
mailer/gmail.ts ← orchestrator
state/writer.ts ← orchestrator
report/summary.ts ← orchestrator
```

Test harness for each piece is independent: you can write `test/pipeline/dedup.test.ts` before `src/scrapers/html.ts` exists.

---

## Error Boundaries

### Strategy: **Per-Firm Isolation via `Promise.allSettled`**

The fundamental rule: **a failure at any stage for firm X produces a `FirmResult` with `error` set — it never throws past the orchestrator**.

### Error Boundary Map

| Stage | Boundary Mechanism | Behavior on Failure | Visibility |
|-------|---------------------|---------------------|------------|
| Config load | Orchestrator-level `try/catch` at entry | Exits with non-zero, GHA shows red X, no email, no state write | GHA log + exit code. This is THE fatal stage — bad config means don't run. |
| Scrape (per firm) | `Promise.allSettled` in `pipeline/fetch.ts` + per-firm `try/catch` inside `p-limit` fn | `FirmResult.error = {stage: 'fetch', ...}`, other firms unaffected | Included in run reporter summary |
| Dedup (per firm) | Dedup is pure — only fails on programmer error | Wrap defensively; `error = {stage: 'dedup', ...}` | Run reporter |
| Summarize (per item, per firm) | Per-item `try/catch` in `pipeline/summarize.ts` | Item included with `summary_ko: ''`, `summaryError: msg`. Digest shows "요약 실패 — 원문 링크 참조" for that item | Composer renders degraded, run reporter flags |
| Gemini 429 | `p-retry` with exp backoff + model fallback Flash → Flash-Lite | Transparent recovery; metric in run report | Run reporter shows `summaryModel: 'flash-lite'` |
| Gemini safety block | Check response `promptFeedback.blockReason` | Item gets `summary_ko: ''`, `summaryError: 'safety:BLOCK_REASON'`, still sent | Run reporter |
| Compose | Pure function — only fails on programmer error | Re-throw to orchestrator; if it blows up, skip sending, commit state, exit non-zero | GHA fail |
| Mail send | `try/catch` in orchestrator after compose | Log full payload, skip state write, exit non-zero (so cron retry semantics are available via `workflow_dispatch`) | GHA fail — loud failure intended, silent email loss is the worst outcome |
| State write | `try/catch`, non-fatal if email already sent | Log error, set exit code 1 to surface, but don't re-send email on retry | GHA flag + next run re-sends items |

### Why Mail Failure ≠ State Write Failure

The dangerous interleaving:

```
compose ✓ → mail ✓ → state write ✗
```

If you exit zero, GHA won't commit state (the action runs on success) — next run re-sends all items. Fine.

```
compose ✓ → mail ✗ → (never reached state write)
```

Exit non-zero. State unchanged. Next run tries again. Fine — as long as your prompts are deterministic-enough that the same items produce similar summaries (they will; free-tier temperature is low).

**The one failure that would be bad**: mail sent, state failed to write. We explicitly order these so that state write happens after mail send, and both are inside the orchestrator's try/catch with independent error tracking. If mail succeeds and state write fails, we log loudly and exit non-zero so the user knows to manually run `git add state/ && git commit` on the auto-commit step's workdir. Rare in practice.

### Top-Level Error Handler

```typescript
// src/main.ts (shape)
async function main(): Promise<number> {
  try {
    const firms = await loadConfig();            // throws → 1
    const results = await fetchAll(firms);        // all errors absorbed into results
    const seen = await readState();
    const withNew = dedupAll(results, seen);
    const summarized = await summarizeAll(withNew);
    const newTotal = summarized.flatMap(r => r.summarized).length;

    if (newTotal > 0) {
      const payload = composeDigest(summarized);
      await sendMail(payload);                    // throws → 1 (loud)
    }

    await writeState(seen, summarized);           // throws → 1 (but post-mail)
    await writeReport({ results: summarized, newTotal });
    return 0;
  } catch (err) {
    console.error('FATAL:', err);
    await writeReport({ fatal: (err as Error).message }).catch(() => {});
    return 1;
  }
}

main().then(code => process.exit(code));
```

---

## Testability

### Test Seams

| Seam | What's Mocked | Test File | Why It Exists |
|------|---------------|-----------|---------------|
| `fetch()` global | HTTP responses | `test/scrapers/html.test.ts` | Offline, deterministic parser tests against recorded HTML |
| `feedparser` | RSS byte stream | `test/scrapers/rss.test.ts` | Same, for RSS |
| `@google/genai` client | Structured JSON response | `test/summarize/gemini.test.ts` | Verify prompt shape + response parsing without spending quota |
| `nodemailer.createTransport` | sendMail is spied | `test/mailer/gmail.test.ts` | Verify payload shape without real SMTP |
| File system (`fs/promises`) | in-memory filesystem via `memfs` or tmpdir | `test/state/*.test.ts` | State read/write tests |
| **Nothing** (pure) | — | `test/pipeline/dedup.test.ts`, `test/compose/digest.test.ts` | Dedup and composer are pure — just call with inputs |

### Test Layers

**Layer 1: Unit tests (vitest)** — target >80% coverage on:
- `pipeline/dedup.ts` — pure, critical correctness
- `config/schema.ts` — zod schema boundary cases (empty firms, missing fields, bad URLs)
- `scrapers/rss.ts` + `scrapers/html.ts` against recorded fixtures
- `compose/digest.ts` — snapshot tests on rendered HTML for one, three, ten items

Run: `pnpm test`. Target: under 2 seconds.

**Layer 2: Integration "dry run"** — `DRY_RUN=1 pnpm dev`:
- Real scrape (hits live sites — politely, once).
- Real Gemini (uses dev API key, small quota impact).
- **Skips** mail send (prints to stdout).
- **Skips** state write.

Use before pushing config changes. Catches selector drift, prompt issues.

**Layer 3: Single-firm probe** — `pnpm check:firm cooley`:
- Runs only one firm.
- Dumps raw HTML/RSS → parsed items → would-summarize list → would-send HTML.
- Does not hit Gemini unless `--summarize` flag passed.

Use when adding a new firm to `firms.yaml` — verifies selectors before committing.

**Layer 4: GHA workflow_dispatch** — manual trigger from Actions UI:
- Full live run without waiting for cron.
- Use after first push of cron-enabled workflow.

### Where DRY_RUN Lives

Two checksites, one helper:

```typescript
// src/env.ts
export const isDryRun = () => process.env.DRY_RUN === '1';

// Used in:
// 1. src/mailer/gmail.ts — if (isDryRun()) return printInstead(payload);
// 2. src/state/writer.ts — if (isDryRun()) return;
```

No other site should check this flag. Keeping it to two locations means the dev run truly exercises all pipeline code except the two irreversible side effects.

---

## Extension Points

### Adding a New Firm (Non-Developer Path)

**What the non-developer does:**

1. Open `config/firms.yaml` in any text editor.
2. Copy an existing firm block, change the fields.
3. Commit, push (or edit directly via GitHub web UI → commit).

**That's it.** No code, no install, no restart.

**Example addition:**

```yaml
# config/firms.yaml
firms:
  # ... existing firms ...

  # NEW:
  - id: lee-ko       # lowercase slug — must be unique
    name: 이앤코      # display name shown in digest
    language: ko
    type: html       # html | rss | js-render
    url: https://www.leeko.com/insights
    selectors:
      list_item: ".insight-card"
      title: "h3.card-title"
      link: "a.card-link@href"
      date: "time.published@datetime"
```

**What the code does automatically on next run:**

1. `ConfigLoader` loads the new entry, zod-validates.
2. `FetchOrchestrator` sees `type: html`, dispatches to `scrapers/html.ts`.
3. Scraper uses the YAML selectors directly — no code knows about "lee-ko" specifically.
4. `state/seen.json` gets a new top-level key `"lee-ko"` on first successful run.
5. Composer groups by `firmId`, renders a new section.
6. Run reporter includes lee-ko in its firm-status table.

**Zero files touched in `src/`.**

### What DOES Require Code Change

| Change | Code To Update |
|--------|----------------|
| A firm needs a fundamentally new scrape strategy (e.g. auth cookie, GraphQL API) | Add a new file in `src/scrapers/`, register in `scrapers/index.ts`, add new literal to `FirmType` union in `types.ts`, update zod schema |
| Change prompt template (e.g. want 5-line summary instead of 3) | `src/summarize/prompt.ts` |
| Change digest HTML styling | `src/compose/templates/digest.html.ts` |
| Change state cap (500 → 1000) | `src/state/writer.ts` constant |
| Swap Gemini for another LLM | `src/summarize/gemini.ts` (swap implementation, keep the exported function signature) |
| Change recipient | `config/firms.yaml` has a top-level `email.to` field (recommend placing it there, not in env, so the non-developer owns it) |

### Extension Points Ranked by Likelihood

1. **New firm entry (likely weekly during early life)** → YAML only ✓
2. **Selector adjustment when a firm redesigns** → YAML only ✓
3. **Prompt tuning after reading some digests** → `src/summarize/prompt.ts`
4. **Swap Gmail for different sender** → `src/mailer/gmail.ts`
5. **New scrape strategy** → new file in `src/scrapers/`, register
6. **Add secondary digest (e.g. weekly roll-up)** → new entry point `src/main.ts` → `src/cli/weekly.ts`, scheduled separately

---

## Scaling Considerations

This is a personal tool — scaling means "adding more firms or more recipients," not "millions of users."

| Scale | Adjustment |
|-------|------------|
| 12 firms (current) | Architecture as described. ~1 min runtime. |
| 30 firms | Still fine. Bump `p-limit` to 5. Gemini daily quota still has headroom (30 × 5 items = 150 summaries, within 250 RPD Flash). |
| 60+ firms | Gemini free tier tightens. Options: (a) batch items per firm into a single Gemini call (prompt engineering), (b) switch primary to Flash-Lite (1,000 RPD), (c) accept that some days summarize-partial. |
| 2+ recipients | Add `recipients: [...]` to config; mailer loops or uses BCC. Small refactor. |
| Weekly digest variant | Second entry point, same components. Only composer differs. |
| Web UI | Out of scope — PROJECT.md explicitly excludes. |

### First Bottleneck

**Gemini free tier RPD**, not anything in the code. If a day produces ~50+ new items, flash → flash-lite fallback kicks in. If both exhaust, run reporter flags it and remaining items ship with "요약 대기중" placeholder.

### Second Bottleneck

**GHA minutes on private repo** (2,000/month). At 1 run × ~2 min × 30 days = 60 min/month → 3% of allowance. Scaling firms is linear; reach 1,000 min/month at ~300 firms. Not a real concern.

### Third Bottleneck

**Playwright binary size in GHA cache.** If many firms need JS rendering, cache miss re-downloads ~150MB. Mitigation: aggressive `actions/cache` on `~/.cache/ms-playwright` keyed by Playwright version.

---

## Anti-Patterns

### Anti-Pattern 1: Default Everything to Playwright

**What people do:** "Browsers render JS correctly, let's just use Playwright for all 12 firms."

**Why it's wrong:** Adds ~150MB download on cache miss, 1–3s startup per run, unneeded CPU. Most Korean law firm sites are server-side-rendered and work perfectly with `fetch` + cheerio.

**Do this instead:** Tier per-firm. Use `rss` if available → `html` + cheerio if static → Playwright **only** when cheerio can't see the items because they're injected by client-side JS. Verify during firm onboarding with `pnpm check:firm <id>` — if parsed items are empty from cheerio but visible in a real browser, promote that firm to `js-render`.

### Anti-Pattern 2: Global Try/Catch Around the Whole Main Function

**What people do:** `main().catch(console.error)` and nothing else.

**Why it's wrong:** A parse error in firm 3 of 12 takes down the whole run. You miss today's digest from firms 4–12. Silent failure for one non-critical firm is far better than zero output.

**Do this instead:** `Promise.allSettled` around the firm loop, per-firm try/catch inside, error captured as data in `FirmResult.error`. Fatal errors (config load, compose crash, mail send fail) still exit non-zero.

### Anti-Pattern 3: Storing State in GitHub Actions Cache

**What people do:** Cache `seen.json` using `actions/cache` because it's "the GHA way."

**Why it's wrong:** Cache entries are evicted after 7 days of no reads. If a firm stays quiet for 2 weeks, their historical URLs vanish, and the next run re-sends everything on the page as "new." Mass re-send to your own inbox is annoying; in extreme cases it's email-spam to yourself.

**Do this instead:** Commit `state/seen.json` back to the repo using `git-auto-commit-action`. Permanent, diff-able, survives any quiet period.

### Anti-Pattern 4: Letting Gemini Responses Be Free-Form Text

**What people do:** Prompt Gemini with "Please summarize in Korean in 3-5 lines" and regex-parse the response.

**Why it's wrong:** Model drift changes formatting subtly. English leaks in. Sometimes it numbers lines, sometimes not. Downstream rendering becomes brittle.

**Do this instead:** Use `responseMimeType: 'application/json'` + `responseSchema`. Parse with zod. One prompt change can't silently break the composer.

### Anti-Pattern 5: Committing State Without `[skip ci]`

**What people do:** `git-auto-commit-action` fires → pushes → GHA re-triggers → infinite loop.

**Why it's wrong:** Burns minutes, floods the Actions log, possible rate-limit on the GHA runner.

**Do this instead:** Set `commit_message: 'chore(state): update seen items [skip ci]'` on the action. The `[skip ci]` token is respected by all standard GHA triggers.

### Anti-Pattern 6: Checking `DRY_RUN` in Every Layer

**What people do:** `if (process.env.DRY_RUN) console.log(...)` scattered in 7 files.

**Why it's wrong:** The point of DRY_RUN is to exercise the full pipeline minus irreversible effects. If every layer has a shortcut, the dry run tests a different code path than prod.

**Do this instead:** Check `isDryRun()` at exactly two files — the mailer and the state writer. Every other layer runs identically.

### Anti-Pattern 7: Blowing Up on One Bad YAML Entry

**What people do:** zod throws on malformed firm 7 → main catches → entire run dies.

**Why it's wrong:** 11 good firms don't get their digest because someone's autocomplete added a stray quote.

**Do this instead:** Validate the whole array, but collect errors per-entry. Skip the invalid entry with a loud log in the run summary: "firm 'xyz' skipped due to config error: selectors.title missing". Run continues for the rest. (This is a slight deviation from "fail fast on bad config" — the judgment call is that non-fatal config errors shouldn't cascade for a daily personal job.)

---

## Integration Points

### External Services

| Service | Integration Pattern | Auth | Gotchas |
|---------|---------------------|------|---------|
| Target firm websites | HTTP GET with polite headers (`User-Agent: LegalNewsletterBot/1.0 (+<repo>)`, `If-Modified-Since`) | None | Respect `robots.txt`; some firms rate-limit on User-Agent pattern (use a real-looking UA if blocked); Korean sites may be EUC-KR — decode correctly |
| Gemini API | `@google/genai` SDK | `GEMINI_API_KEY` env var (GHA secret) | Daily RPD is tight — Flash fallback to Flash-Lite; handle 429 with backoff + fallback |
| Gmail SMTP | `nodemailer` with `service: 'Gmail'` | `GMAIL_APP_PASSWORD` env var (GHA secret); requires 2FA enabled | App Password, not account password; 500 emails/day hard cap (irrelevant for this use) |
| GitHub repo (for state persistence) | `stefanzweifel/git-auto-commit-action@v6` | Built-in `GITHUB_TOKEN` | Requires `permissions: contents: write` in workflow; use `[skip ci]` in commit message |
| GitHub Actions runner | `ubuntu-latest`, `actions/setup-node@v5` with `lts/*` | Built-in | Cache `~/.cache/ms-playwright` if using Playwright; cache `node_modules` via pnpm lockfile |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Orchestrator ↔ Scrapers | Function call; returns `Promise<RawItem[]>` | No events, no queue; sync-looking await |
| Orchestrator ↔ Gemini | Function call per item | Rate-limited via `p-limit(3)` to stay under 10 RPM |
| Orchestrator ↔ Gmail | Single function call per run | One email per run, at most |
| Orchestrator ↔ State | File read at start, file write at end | No mid-run state mutation |
| Orchestrator ↔ Report | Writes to `process.env.GITHUB_STEP_SUMMARY` file path, also stdout | GHA-native summary feature |

---

## Sources

- **Context7 `/googleapis/js-genai`**: @google/genai initialization, structured JSON output patterns, rate-limit error shapes
- **Context7 `/cheeriojs/cheerio`**: `cheerio.fromURL()`, `$.extract()` declarative extraction, attribute selector syntax
- **Context7 `/nodemailer/nodemailer`**: Gmail service shortcut, DRY_RUN-friendly transport design
- **Context7 `/microsoft/playwright`**: workflow caching, `--only-shell` installation
- **Official**: [Google AI rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Playwright CI guidance](https://playwright.dev/docs/ci-intro)
- **Pattern reference**: [karlhorky/github-actions-database-persistence](https://github.com/karlhorky/github-actions-database-persistence) — canonical commit-back-state pattern
- **PROJECT.md** + **STACK.md** (this repo) — drove the constraints that shaped component boundaries

---

*Architecture research for: Personal legal-newsletter aggregator — single-run-per-day batch pipeline on GitHub Actions*
*Researched: 2026-04-16*
