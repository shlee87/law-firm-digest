# Phase 6: Firm Audit + Probe - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 9 (6 new + 2 modified + 1 deleted)
**Analogs found:** 8 / 9 (writer.ts has no direct analog — composes new pattern)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/audit/firmAudit.ts` (new) | service / orchestrator | request-response (per firm fan-out) | `src/pipeline/fetch.ts` (Promise.allSettled per-firm) + `src/pipeline/run.ts:130-162` (chromium lifecycle) + `scripts/detail-page-audit.ts` (body-hash seed) | exact (composed from 3 sources) |
| `src/audit/types.ts` (new) | model | n/a (types only) | `src/types.ts` (FirmConfig / RawItem / FirmResult discriminated unions) | exact |
| `src/audit/signals.ts` (new) | utility | transform (pure functions) | `scripts/detail-page-audit.ts:25` (bodyHash seed); no internal jaccard/title-token analog yet | role-match (TDD-style pure utils, like `src/scrapers/util.ts` pure helpers) |
| `src/audit/writer.ts` (new) | service / serializer | transform (object → string) | `src/compose/digest.ts` (template-literal HTML rendering with snapshot test) | role-match |
| `src/cli/auditFirms.ts` (new) | controller / CLI | request-response | `src/cli/checkFirm.ts` (argv parser + CliReporter + exit codes 0/1/2) | exact |
| `test/audit/signals.test.ts` (new) | test | n/a | `test/scrapers/util.test.ts` (pure-function unit tests with vitest) | role-match |
| `test/audit/firmAudit.test.ts` (new) | test | n/a | `test/pipeline/fetch.test.ts` (orchestrator with mocked scrapers) | exact |
| `test/audit/writer.test.ts` (new) | test | n/a | `test/compose/digest.test.ts` + `test/compose/__snapshots__/digest.test.ts.snap` (external `.snap` for markdown/HTML) | exact |
| `src/config/loader.ts` (modified) | model loader | request-response | self (extend with `LoadFirmsOptions`) | self |
| `package.json` (modified) | config | n/a | self (mirror `"check:firm": "tsx src/cli/checkFirm.ts"` script entry) | self |
| `scripts/detail-page-audit.ts` (deleted) | n/a | n/a | n/a (logic ported into `src/audit/firmAudit.ts` + `src/audit/signals.ts`) | n/a |

## Pattern Assignments

### `src/audit/firmAudit.ts` (orchestrator, request-response fan-out)

**Primary analog:** `src/pipeline/fetch.ts` (per-firm isolation) + `src/pipeline/run.ts` (chromium lifecycle).
**Secondary analog (port source):** `scripts/detail-page-audit.ts` (body-hash seed).

**Imports pattern** (mirror `src/pipeline/fetch.ts:35-44`):
```typescript
import pLimit from 'p-limit';
import { writeFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import { loadFirms } from '../config/loader.js';
import { fetchRobots, isAllowed } from '../scrapers/robots.js';
import { scrapeRss } from '../scrapers/rss.js';
import { scrapeHtml } from '../scrapers/html.js';
import { scrapeJsRender } from '../scrapers/jsRender.js';
import { decodeCharsetAwareFetch, extractBody } from '../scrapers/util.js';
import { scrubSecrets } from '../util/logging.js';
import { USER_AGENT } from '../util/logging.js';
import { classifyDetailIdentity } from './signals.js';
import { renderAuditMarkdown } from './writer.js';
import type { AuditRow, AuditReport, RunOptions } from './types.js';
import type { FirmConfig } from '../types.js';
```

Note the `.js` import suffix even on `.ts` source — required by ESM + tsx (verified across all `src/` files).

**Per-firm Promise.allSettled isolation** — copy structure from `src/pipeline/fetch.ts:46-118`:
```typescript
// Source: src/pipeline/fetch.ts:46-118 (Phase 2 D-P2-03 isolation invariant)
export async function fetchAll(
  firms: FirmConfig[],
  recorder?: Recorder,
  browser?: Browser,
): Promise<FirmResult[]> {
  const limit = pLimit(3);

  const settled = await Promise.allSettled(
    firms.map((firm) =>
      limit(async (): Promise<FirmResult> => {
        const started = Date.now();
        try {
          // robots gate
          const origin = new URL(firm.url).origin;
          const disallows = await fetchRobots(origin);
          if (!isAllowed(firm.url, disallows)) {
            throw new Error(`robots.txt disallows ${firm.url}`);
          }
          // tier dispatch
          let raw: RawItem[];
          switch (firm.type) {
            case 'rss':       raw = await scrapeRss(firm); break;
            case 'html':      raw = await scrapeHtml(firm); break;
            case 'js-render': raw = await scrapeJsRender(firm, browser!); break;
            default: throw new Error(`firm ${firm.id}: unknown tier ${String(firm.type)}`);
          }
          return { firm, raw, new: [], summarized: [], durationMs: Date.now() - started };
        } catch (err) {
          const message = scrubSecrets((err as Error).message);
          return {
            firm, raw: [], new: [], summarized: [],
            error: { stage: 'fetch', message },
            durationMs: Date.now() - started,
          };
        }
      }),
    ),
  );

  // Defense-in-depth: settled-rejected branch synthesizes a FirmResult.
  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const reason = r.reason;
    const message = scrubSecrets(reason instanceof Error ? reason.message : String(reason));
    return {
      firm: firms[i], raw: [], new: [], summarized: [],
      error: { stage: 'fetch', message }, durationMs: 0,
    };
  });
}
```

**Apply to audit:** identical shape, but inner block returns `AuditRow` instead of `FirmResult`. Each catch path produces a row with `status: 'list-fail'` (or appropriate non-OK status) — no row is ever lost.

**Chromium lifecycle pattern** — copy from `src/pipeline/run.ts:154-162` and `:317-324`:
```typescript
// Source: src/pipeline/run.ts:154-162 (Phase 4 D-05 — short-circuit launch)
const hasJsRender = firms.some((f) => f.type === 'js-render');
let browser: Browser | undefined;
if (hasJsRender) {
  browser = await chromium.launch({ headless: true });
}
try {
  // ... fan-out per firm, passing `browser` into js-render branch ...
} finally {
  // Source: src/pipeline/run.ts:317-324 — close runs on throw too
  if (browser) {
    await browser.close();
  }
}
```

**Body-hash signal port** — port from `scripts/detail-page-audit.ts:20-43` and EXTEND with 3 more signals (Phase 6 D-07). The original is the seed:
```typescript
// Source: scripts/detail-page-audit.ts:21-32 (TO BE PORTED then file DELETED)
const bodies: { url: string; title: string; body: string; bodyHash: string }[] = [];
for (const item of items.slice(0, 2)) {
  try {
    const { html } = await decodeCharsetAwareFetch(item.url);
    const body = extractBody(html, firm.selectors?.body);
    const hash = `${body.length}:${body.slice(0, 50).replace(/\s+/g, '')}`;
    bodies.push({ url: item.url, title: item.title, body, bodyHash: hash });
  } catch (e) {
    // per-detail-page isolation
  }
}
```
The hash function moves into `src/audit/signals.ts` as `bodyHash()`. The HTML detail-fetch loop stays in `firmAudit.ts#probeHtmlFirm`.

**JS-render detail fetch (NEW for Phase 6)** — extends `src/scrapers/jsRender.ts:77-115` pattern (per-firm context, but with detail-page goto added):
```typescript
// Pattern reference: src/scrapers/jsRender.ts:77-114 (list page only)
// EXTEND for Phase 6: same context, ALSO fetch N=2 detail pages.
const context = await browser.newContext({ userAgent: USER_AGENT });
try {
  const listPage = await context.newPage();
  await listPage.goto(firm.url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
  await listPage.waitForSelector(firm.wait_for!, { timeout: 15_000, state: 'attached' });
  const listHtml = await listPage.content();
  const items = parseListItemsFromHtml(listHtml, firm);
  await listPage.close();

  const bodies: { url: string; title: string; body: string }[] = [];
  for (const item of items.slice(0, 2)) {
    const detailPage = await context.newPage();
    try {
      // Phase 4 D-14 — detail-page wait is domcontentloaded ONLY (no firm.wait_for).
      await detailPage.goto(item.url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
      const detailHtml = await detailPage.content();
      const body = extractBody(detailHtml, firm.selectors?.body);
      bodies.push({ url: item.url, title: item.title, body });
    } catch {
      // per-detail isolation — successful count < 2 → detail-quality-unknown
    } finally {
      await detailPage.close();
    }
  }
  return { items, bodies };
} finally {
  await context.close();
}
```

Note: `WAIT_TIMEOUT_MS = 15_000` and `GOTO_TIMEOUT_MS = 15_000` constants exist in `src/scrapers/jsRender.ts:45-46` — re-declare locally OR `export` them from `jsRender.ts` (implementer's discretion; re-declare keeps audit decoupled).

**Output path constant** (D-09 / Integration Points — locked):
```typescript
const AUDIT_OUTPUT_PATH = '.planning/phases/06-firm-audit-probe/06-AUDIT.md';
```
Hardcoded inside `firmAudit.ts` — Phase 11 cron gate will reference the same constant.

**Scrub-and-rewrap error handling pattern** — same as `src/pipeline/fetch.ts:101-103`:
```typescript
const message = scrubSecrets((err as Error).message);
```
Always pipe error messages through `scrubSecrets` from `src/util/logging.ts` before they hit the row's evidence column.

---

### `src/audit/types.ts` (model, types only)

**Analog:** `src/types.ts` — discriminated-union style + critical-invariants header comment.

**Header comment pattern** (mirror `src/types.ts:1-22`):
```typescript
// Canonical typed contracts for the firm-audit probe (Phase 6).
//
// Critical invariants enforced at type level:
//   - Status is one of 6 literal strings (SC-3 vocab)
//   - Remediation is one of 5 literal strings (D-10 vocab)
//   - remediation === null IFF status === 'OK' (TS can't enforce; documented)
//   - targetPhase === null IFF remediation === null
//   - tier mirrors FirmType from src/types.ts (rss / html / js-render)
```

**Discriminated string-literal unions** — Pattern 4 in RESEARCH.md, lines 537-562:
```typescript
export type Status =
  | 'OK'
  | 'list-fail'
  | 'selector-empty'
  | 'detail-identical'
  | 'detail-empty'
  | 'detail-quality-unknown';

export type Remediation =
  | 'enable-js-render-detail'
  | 'fix-selector'
  | 'disable-firm'
  | 'migrate-to-sitemap'
  | 'monitor';

export interface AuditRow {
  firmId: string;
  firmName: string;
  tier: 'rss' | 'html' | 'js-render';   // mirror FirmType
  status: Status;
  items: number;
  remediation: Remediation | null;       // null only when status='OK'
  targetPhase: string | null;            // null only when status='OK'
  evidence: string;                      // free-form for human reader
  disabled: boolean;                     // (disabled, baseline) tag (D-05)
}

export interface AuditReport {
  rows: AuditRow[];
  runMetadata: {
    startedAt: string;       // ISO 8601
    finishedAt: string;
    includeDisabled: boolean;
    totalFirms: number;
    okCount: number;
    nonOkCount: number;
    probeVersion?: string;   // git rev-parse HEAD; 'unknown' fallback
  };
  outputPath: string;
}

export interface RunOptions {
  includeDisabled?: boolean;
  reporter?: { section(name: string, detail: string): void };
}
```

**TS interface comment style:** `src/types.ts:43-65` — short trailing comments noting required-by-schema-but-optional-here are the convention.

---

### `src/audit/signals.ts` (utility, pure-function transforms)

**Analog:** No direct equivalent for jaccard / title-token. Closest in spirit: pure helpers in `src/scrapers/util.ts` (e.g., `parseListItemsFromHtml`, `extractBody`) — testable, no I/O, no shared state.

**Port source:** `scripts/detail-page-audit.ts:25` — `bodyHash()`.

**Function signatures** (per RESEARCH.md Pattern 3, lines 372-528):
```typescript
// Signal 1 — port from scripts/detail-page-audit.ts:25
export function bodyHash(body: string): string {
  return `${body.length}:${body.slice(0, 50).replace(/\s+/g, '')}`;
}

export function exactHashMatch(bodyA: string, bodyB: string): boolean {
  return bodyHash(bodyA) === bodyHash(bodyB);
}

// Signal 2 — NEW
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

export function jaccardTokenSimilarity(bodyA: string, bodyB: string): number {
  const tokensA = new Set(tokenize(bodyA));
  const tokensB = new Set(tokenize(bodyB));
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

// Signal 3 — NEW
export function extractTitleTokens(title: string): string[] {
  // Hangul syllable blocks U+AC00-U+D7AF; CJK U+4E00-U+9FFF; Latin word chars.
  const matches =
    title.match(/[\uAC00-\uD7AF\u4E00-\u9FFF]{2,}|[A-Za-z0-9_]{2,}/g) ?? [];
  return matches.map((t) =>
    /^[A-Za-z0-9_]+$/.test(t) ? t.toLowerCase() : t,
  );
}

export function titleTokensPresentInBody(title: string, body: string): number {
  const tokens = extractTitleTokens(title);
  if (tokens.length === 0) return 0;
  const bodyLower = body.toLowerCase();
  return tokens.filter((t) => bodyLower.includes(t.toLowerCase())).length;
}

// Signal 4 — NEW (separate-status branch per D-08)
export const BODY_TOO_SHORT_THRESHOLD = 100;

export function bodyTooShort(body: string): boolean {
  return body.length < BODY_TOO_SHORT_THRESHOLD;
}

// Combined classifier — RESEARCH.md L482-527
export interface DetailSignalResult {
  status: 'OK' | 'detail-identical' | 'detail-empty' | 'detail-quality-unknown';
  evidence: string;
}

export function classifyDetailIdentity(
  bodies: { url: string; title: string; body: string }[],
): DetailSignalResult {
  // ... per RESEARCH.md L482-527 — copy verbatim
}
```

**Pitfall guard (RESEARCH.md Pitfall 1, L649-654):** title-token signal MUST tighten condition to `titleTokensA === 0 && totalTokensA > 0 && titleTokensB === 0 && totalTokensB > 0`. Vacuous trigger (title with zero ≥2-char tokens) is a false-positive failure mode.

**Header doc style** — match `src/scrapers/util.ts:155-172` (long-form JSDoc with rationale + edge-case notes). Each signal function gets a JSDoc block explaining what it catches and why the threshold/regex is what it is.

---

### `src/audit/writer.ts` (serializer, transform — no direct analog)

**Closest analog:** `src/compose/digest.ts` (HTML rendering via template literal) + `test/compose/__snapshots__/digest.test.ts.snap` (snapshot pattern). The digest composer hand-rolls HTML; the audit writer hand-rolls Markdown. Same approach.

**Why no direct analog:** No prior phase produces a Markdown report. RESEARCH.md "Don't Hand-Roll" §line 631 explicitly endorses hand-formatted template literals over a markdown library — output is small (≤13 rows).

**Pattern to apply (RESEARCH.md Pattern 4, L530-579):** TS exhaustiveness check for both `Status` and `Remediation` enums:
```typescript
function remediationToTargetPhase(r: Remediation): string {
  switch (r) {
    case 'enable-js-render-detail': return 'Phase 7';
    case 'fix-selector':            return 'Phase 7';
    case 'disable-firm':            return 'immediate';
    case 'migrate-to-sitemap':      return 'Phase 9';
    case 'monitor':                 return 'Phase 10/11';
    default: {
      // TS will flag this as unreachable. Adding a new Remediation value
      // without updating this switch fails `pnpm typecheck`.
      const _exhaustive: never = r;
      throw new Error(`Unhandled remediation: ${_exhaustive as string}`);
    }
  }
}
```
Apply the same `never` exhaustiveness pattern when rendering status-specific evidence formatting in the per-firm evidence section.

**Markdown structure (D-09 hybrid format):**
1. Top: summary table `| Firm | Tier | Status | Items | Remediation | Target Phase |`
2. Middle: `## <id> (tier, status)` per-firm sections with list URL/HTTP code, items, detail sampling, root cause, remediation, target phase
3. Bottom: metadata block (timestamp, includeDisabled, OK/non-OK counts, probeVersion)

**Atomicity (RESEARCH.md Pitfall 6):** ONE `writeFile` call at the end — never `appendFile` per row. Build the full string in memory.

---

### `src/cli/auditFirms.ts` (controller, CLI request-response)

**Analog:** `src/cli/checkFirm.ts` (canonical CLI shape).

**Imports pattern** (mirror `src/cli/checkFirm.ts:17-19`):
```typescript
import { runAudit } from '../audit/firmAudit.js';
import type { Reporter } from '../pipeline/run.js';   // reuse existing Reporter interface
```
Reuse the existing `Reporter` interface (`src/pipeline/run.ts:87-89`) — no need to re-declare. CONTEXT.md says CliReporter is the canonical I/O pattern.

**Argv parser pattern** (mirror `src/cli/checkFirm.ts:21-54`):
```typescript
interface ParsedArgs {
  includeDisabled: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const includeDisabled = args.includes('--include-disabled');
  // Reject unknown flags fail-loud (matches checkFirm.ts:36-48 strictness).
  for (const a of args) {
    if (a !== '--include-disabled') {
      console.error(`Unknown argument: ${a}`);
      console.error('Usage: pnpm audit:firms [--include-disabled]');
      process.exit(2);
    }
  }
  return { includeDisabled };
}
```

**CliReporter pattern** (verbatim from `src/cli/checkFirm.ts:56-60`):
```typescript
class CliReporter implements Reporter {
  section(name: string, detail: string): void {
    console.log(`  ${name.padEnd(18)}: ${detail}`);
  }
}
```

**Main + exit-code dispatcher pattern** (mirror `src/cli/checkFirm.ts:62-112`):
```typescript
async function main(): Promise<number> {
  const { includeDisabled } = parseArgs(process.argv);
  try {
    const report = await runAudit({ includeDisabled, reporter: new CliReporter() });
    // Open Question 1 — disabled rows do NOT participate in exit code.
    const enabledRows = report.rows.filter((r) => !r.disabled);
    const nonOk = enabledRows.filter((r) => r.status !== 'OK');
    console.log(`[audit:firms] ${report.rows.length} firm(s) probed; ${nonOk.length} non-OK (enabled)`);
    console.log(`[audit:firms] wrote ${report.outputPath}`);
    return nonOk.length === 0 ? 0 : 1;
  } catch (err) {
    console.error(`[audit:firms] error: ${(err as Error).message}`);
    return 2;   // D-03 — runtime/usage error
  }
}

// Belt-and-suspenders top-level catch (verbatim from checkFirm.ts:107-112).
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[audit:firms] fatal: ${(err as Error).message}`);
    process.exit(2);
  });
```

**Exit code semantics (D-03):** 0 = all enabled OK / 1 = at least one enabled non-OK / 2 = runtime or usage error. Note: differs from `check:firm` where `1` is runtime error — audit's `1` is the "found broken firm" semantic (deliberately fail-loud per Memory's "aggressive failure detection" preference).

---

### `src/config/loader.ts` (modified — add `LoadFirmsOptions`)

**Analog:** self.

**Current shape** (`src/config/loader.ts:43-53`):
```typescript
export async function loadFirms(): Promise<FirmConfig[]> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  return result.data.firms.filter((f) => f.enabled) as FirmConfig[];
}
```

**Modification pattern (RESEARCH.md L696-715):**
```typescript
export interface LoadFirmsOptions {
  includeDisabled?: boolean;
}

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

**Backwards-compatibility check:** All existing call sites pass `loadFirms()` with no args → behavior unchanged. Verified call sites: `src/main.ts`, `src/cli/checkFirm.ts:73`, `src/pipeline/run.ts:132`. The `options: LoadFirmsOptions = {}` default makes the change zero-impact.

**Pitfall (RESEARCH.md Pitfall 4):** Don't forget to remove the `.filter((f) => f.enabled)` when `includeDisabled === true` — easy to overlook.

---

### `package.json` (modified — add audit:firms script)

**Analog:** existing `"check:firm": "tsx src/cli/checkFirm.ts"` (line 9).

**Pattern:**
```json
{
  "scripts": {
    "dev": "tsx src/main.ts",
    "dry-run": "DRY_RUN=1 tsx src/main.ts",
    "check:firm": "tsx src/cli/checkFirm.ts",
    "audit:firms": "tsx src/cli/auditFirms.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```
No new dependencies. Insertion point: after `check:firm`, before `test` (keeps CLI tools grouped).

---

### `scripts/detail-page-audit.ts` (deleted)

**Action:** `git rm scripts/detail-page-audit.ts` in the SAME commit that lands `src/audit/firmAudit.ts` + `src/audit/signals.ts` (RESEARCH.md "Runtime State Inventory" / Build artifacts row, L644).

**Verification before delete:**
1. `bodyHash` logic at `scripts/detail-page-audit.ts:25` is reproduced in `src/audit/signals.ts#bodyHash`.
2. The `decodeCharsetAwareFetch` + `extractBody` detail-fetch loop at `:21-30` is reproduced inside `src/audit/firmAudit.ts#probeHtmlFirm`.
3. No other file in the repo imports `scripts/detail-page-audit.ts` (it's a standalone script — `Grep "detail-page-audit"` should return only doc references).

---

### `test/audit/signals.test.ts` (test, vitest pure-function unit)

**Analog:** `test/scrapers/util.test.ts` (closest pure-function unit-test layout in the repo).

**Vitest scaffold pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  tokenize,
  extractTitleTokens,
  titleTokensPresentInBody,
  bodyHash,
  exactHashMatch,
  jaccardTokenSimilarity,
  bodyTooShort,
  classifyDetailIdentity,
} from '../../src/audit/signals.js';

describe('tokenize', () => {
  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
  // ... per RESEARCH.md L867-880
});
```

**Test cases to cover (RESEARCH.md L867-880):**
- `tokenize`: empty / whitespace-only / KO+EN mixed / consecutive-whitespace
- `extractTitleTokens`: `"M&A 시장 동향"` → `['시장', '동향']`; `"Recent Tax Policy Updates"` → `['recent','tax','policy','updates']`; `"K-IFRS 도입 영향"` → `['ifrs','도입','영향']`
- `titleTokensPresentInBody`: case-insensitive English; presence count
- `bodyHash` / `exactHashMatch`: identity, length-difference, first-50-only sensitivity
- `jaccardTokenSimilarity`: 1.0 / 0.0 / both-empty edge cases
- `bodyTooShort`: 99 / 100 / 0 boundaries
- `classifyDetailIdentity`: every status path, INCLUDING the Pitfall 1 "title with zero ≥2-char tokens AND distinct bodies → OK" guard

---

### `test/audit/firmAudit.test.ts` (test, vitest with mocks)

**Analog:** `test/pipeline/fetch.test.ts:1-80` — exact pattern for mocking scrapers + robots.

**Mock setup pattern** (from `test/pipeline/fetch.test.ts:7-19`):
```typescript
vi.mock('../../src/scrapers/rss.js', () => ({ scrapeRss: vi.fn() }));
vi.mock('../../src/scrapers/html.js', () => ({ scrapeHtml: vi.fn() }));
vi.mock('../../src/scrapers/jsRender.js', () => ({ scrapeJsRender: vi.fn() }));
vi.mock('../../src/scrapers/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/scrapers/util.js')>();
  return {
    ...actual,
    decodeCharsetAwareFetch: vi.fn(),
    // keep extractBody real — it's pure
  };
});
vi.mock('../../src/scrapers/robots.js', () => ({
  fetchRobots: vi.fn(async () => [] as string[]),
  isAllowed: vi.fn(() => true),
}));
```

**Fixture firm definitions** — copy `test/pipeline/fetch.test.ts:29-60` shape (rssFirm / htmlFirm / jsFirm).

**Integration assertions:**
- HTML-tier firm with mocked detail returning identical bodies → `AuditRow.status === 'detail-identical'`
- HTML-tier firm with mocked detail returning distinct bodies → `AuditRow.status === 'OK'`
- HTML-tier firm with detail fetch throwing both times → `AuditRow.status === 'detail-quality-unknown'`
- One firm throws synchronously outside try (defense-in-depth Promise.allSettled branch) → row still produced with `list-fail`
- `--include-disabled` semantics: assert `loadFirms({ includeDisabled: true }).length` includes cooley row

---

### `test/audit/writer.test.ts` (test, vitest snapshot)

**Analog:** `test/compose/digest.test.ts` + `test/compose/__snapshots__/digest.test.ts.snap` (the only existing external snapshot in the repo).

**Snapshot test pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { renderAuditMarkdown } from '../../src/audit/writer.js';
import type { AuditReport } from '../../src/audit/types.js';

describe('renderAuditMarkdown', () => {
  it('matches snapshot for one row of each status × tier combination', () => {
    const report: AuditReport = {
      rows: [
        { firmId: 'rss-ok', firmName: 'RSS OK', tier: 'rss', status: 'OK',
          items: 5, remediation: null, targetPhase: null,
          evidence: '5 items', disabled: false },
        { firmId: 'html-id', firmName: 'HTML Identical', tier: 'html',
          status: 'detail-identical', items: 12,
          remediation: 'enable-js-render-detail', targetPhase: 'Phase 7',
          evidence: 'exact-hash, jaccard=1.00, title-tokens 0/3 & 0/2',
          disabled: false },
        // ... one row per Status × Tier combination
      ],
      runMetadata: {
        startedAt: '2026-04-19T12:00:00.000Z',
        finishedAt: '2026-04-19T12:01:30.000Z',
        includeDisabled: false,
        totalFirms: 12, okCount: 9, nonOkCount: 3,
        probeVersion: 'abc1234',
      },
      outputPath: '.planning/phases/06-firm-audit-probe/06-AUDIT.md',
    };
    expect(renderAuditMarkdown(report)).toMatchSnapshot();
  });
});
```

**Snapshot file location:** `test/audit/__snapshots__/writer.test.ts.snap` (mirror `test/compose/__snapshots__/digest.test.ts.snap`).

**Pitfall 7 guard:** add `test/audit/__snapshots__/` to `.prettierignore` (verify if it isn't already covered by the existing pattern).

---

## Shared Patterns

### Pattern S1: ESM `.js` import suffix on TS source

**Source:** repo-wide convention (every `src/` and `test/` file).
**Apply to:** every new `import` statement in `src/audit/*` and `src/cli/auditFirms.ts`.

```typescript
import { runAudit } from '../audit/firmAudit.js';   // .js NOT .ts
```
Required by tsx + Node 22 ESM. Build-fails if you write `.ts`.

---

### Pattern S2: USER_AGENT + scrubSecrets are mandatory

**Source:** `src/util/logging.ts` — single source of truth.
**Apply to:** every new file that does HTTP fetch OR catches an error message.

```typescript
import { USER_AGENT, scrubSecrets } from '../util/logging.js';

// Every fetch must pass USER_AGENT
await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

// Every caught error message must scrub before logging/storing
const message = scrubSecrets((err as Error).message);
```

CONTEXT.md "Established Patterns" L163: "Honest User-Agent + robots.txt — audit probe도 동일 UA". CLAUDE.md "Honest User-Agent + robots.txt" project constraint.

---

### Pattern S3: Robots.txt gate before any tier dispatch

**Source:** `src/pipeline/fetch.ts:58-64`.
**Apply to:** `src/audit/firmAudit.ts` per-firm probe block — call BEFORE the tier switch.

```typescript
const origin = new URL(firm.url).origin;
const disallows = await fetchRobots(origin);
if (!isAllowed(firm.url, disallows)) {
  // For audit: produce row with status='list-fail', evidence='robots.txt disallows ...'
  // (per Open Question 2 — always run robots check, even for --include-disabled)
}
```

---

### Pattern S4: pLimit(3) concurrency cap (politeness)

**Source:** `src/pipeline/fetch.ts:51`.
**Apply to:** `src/audit/firmAudit.ts` outer firm fan-out.

```typescript
import pLimit from 'p-limit';
const limit = pLimit(3);
await Promise.allSettled(firms.map((firm) => limit(async () => probeFirm(firm))));
```

CONTEXT.md L162: "audit probe도 동일 제한. 단, Playwright js-render detail은 브라우저 리소스 고려해 p-limit(2) 또는 순차 실행 고려." → implementer's discretion for js-render inner detail loop.

---

### Pattern S5: Reporter interface — reuse, don't redefine

**Source:** `src/pipeline/run.ts:87-89`:
```typescript
export interface Reporter {
  section(name: string, detail: string): void;
}
```
**Apply to:** `src/cli/auditFirms.ts` — `import type { Reporter } from '../pipeline/run.js'`. Don't redeclare in `src/audit/types.ts`.

---

### Pattern S6: TS exhaustiveness `never` check on switch over enum

**Source:** RESEARCH.md Pattern 4 L530-579 (no existing direct analog in repo, but project convention is "discriminated unions for fail-loud").
**Apply to:** `src/audit/writer.ts` (Remediation → Target Phase mapping AND Status → markdown formatter).

```typescript
default: {
  const _exhaustive: never = r;
  throw new Error(`Unhandled value: ${_exhaustive as string}`);
}
```
Adding a 6th `Remediation` value without updating the switch fails `pnpm typecheck` — this is the enum enforcement teeth that D-10 demands.

---

### Pattern S7: External `.snap` for Markdown/HTML output

**Source:** `test/compose/__snapshots__/digest.test.ts.snap` — only existing example.
**Apply to:** `test/audit/__snapshots__/writer.test.ts.snap`.

Use `expect(...).toMatchSnapshot()` (NOT `toMatchInlineSnapshot()`) — keeps PR diffs readable on Markdown-heavy output. Add the directory to `.prettierignore` if needed.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/audit/writer.ts` | serializer | transform | No prior phase produces a Markdown report. The closest pattern (digest.ts → HTML) is structurally similar (template literal + snapshot test) but the output format is different. RESEARCH.md "Don't Hand-Roll" L631 explicitly endorses hand-rolled template literals here. Use Pattern S6 (TS exhaustiveness) + Pattern S7 (external snapshot) to compose this from scratch. |

## Metadata

**Analog search scope:** `src/`, `scripts/`, `test/`, `package.json`, `.planning/phases/06-firm-audit-probe/`
**Files scanned:** ~25 (loader, fetch, run, jsRender, html, rss, util, robots, types, logging, checkFirm, detail-page-audit, probe-js-render, fetch.test, digest.test, loader.test, package.json, plus context/research)
**Pattern extraction date:** 2026-04-19
