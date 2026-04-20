# Phase 6: Firm Audit + Probe - Research

**Researched:** 2026-04-19
**Domain:** Diagnostic probe for multi-tier scraper extraction quality (RSS / static HTML / JS-rendered) with multi-signal SPA detection
**Confidence:** HIGH

## Summary

Phase 6 is **diagnosis-only**. It promotes the existing `scripts/detail-page-audit.ts` to production code (`src/audit/firmAudit.ts` + `src/cli/auditFirms.ts` + `pnpm audit:firms`), runs against all 12 enabled firms (3 RSS + 6 HTML + 4 JS-render — split correction below), and emits **one Markdown report** at `.planning/phases/06-firm-audit-probe/06-AUDIT.md` with a 6-status vocab plus a 5-value remediation enum.

All scraper, fetch, body-extraction, browser-launch, and config-loader patterns required by Phase 6 are **already shipped** in Phases 1–4. Phase 6 adds three new capabilities on top of that base: (1) **multi-signal detail identity** (exact hash + jaccard ≥ 0.9 + title-token presence + length<100 — combined OR), (2) **enum-enforced remediation column** in the audit writer, and (3) **`--include-disabled` loader variant** to support cooley pre/post-baseline for Phase 9.

**Primary recommendation:** Add a thin `loadFirms({ includeDisabled?: boolean })` option to `src/config/loader.ts` (no breaking change — existing call sites pass nothing and get current behavior); build `src/audit/firmAudit.ts` as a pure orchestrator that returns a typed `AuditReport`; build `src/audit/writer.ts` that serializes `AuditReport → string` with the 5-value `Remediation` enum enforced via a discriminated union (TS exhaustiveness check at the writer's switch will fail-build if a new remediation value lands without writer support); CLI wrapper `src/cli/auditFirms.ts` mirrors `checkFirm.ts` argv + Reporter pattern. Per-firm isolation reuses `Promise.allSettled` exactly like `pipeline/fetch.ts`. Shared chromium browser reuses Phase 4 D-05 lifecycle pattern. Test fixtures: 4 of the 8 existing fixtures are reusable; 2 new fixtures needed (one identical-body SPA pair, one real-body distinct pair).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Probe form & invocation (Area 1):**
- **D-01:** Audit probe is promoted to production code. Logic in `src/audit/firmAudit.ts`, CLI wrapper in `src/cli/auditFirms.ts`, `package.json` adds `"audit:firms": "tsx src/cli/auditFirms.ts"`. Invocation: `pnpm audit:firms [--include-disabled]`. Rationale: Phase 11 cron resumption gate + Phase 7/8/9 each re-invoke this tool. `scripts/` is throwaway-only.
- **D-02:** Existing `scripts/detail-page-audit.ts` is **deleted** after porting its `length:first50` hash logic into `src/audit/firmAudit.ts`. Single source of truth. Port adds the 4-signal extension (D-07).
- **D-03:** Exit-code policy is **fail-loud 3-tier**:
  - `0`: every firm OK
  - `1`: at least one firm non-OK (any of list-fail / selector-empty / detail-identical / detail-empty / detail-quality-unknown)
  - `2`: runtime error (uncaught throw / config load fail) or usage error (invalid flag)

**Scope coverage (Area 2):**
- **D-04:** Default scope = `enabled: true` firms in `config/firms.yaml` — 12 firms. **All 12 always included** — no skip/filter flag in v1.
- **D-05:** `--include-disabled` flag adds disabled firms (currently: `cooley`). Purpose: Phase 9 sitemap pre/post baseline for cooley CF-block status. AUDIT.md tags disabled rows as `(disabled, baseline)`.
- **D-06:** Tier-differentiated probe depth:
  - **RSS tier**: list fetch only via `scrapeRss`. Status: `OK` (items > 0) / `list-fail` (HTTP/parse error) / `selector-empty` (items = 0). NO detail-identity check (RSS `<description>` is per-item, not generic).
  - **HTML tier** (plain-href + onclick variants): list fetch → items → N=2 detail URLs via `decodeCharsetAwareFetch` + `extractBody` → 4-signal identity check.
  - **JS-render tier**: list fetch via `scrapeJsRender` → N=2 detail URLs **also** via Playwright (shared browser, Phase 4 D-05 pattern).
  - Sample N=2 fixed (SC-2 floor). N>2 = v1.2 backlog.

**Detail-identity signal (Area 3):**
- **D-07:** Detail-identity = **4-signal combined OR**. Any trigger → non-OK:
  1. Exact hash match — `${body.length}:${body.slice(0,50).replace(/\s+/g,'')}`
  2. Jaccard token similarity ≥ 0.9 — whitespace tokenize → `|A∩B| / |A∪B|`
  3. Title-token presence = 0 — title's ≥2-char tokens (KO/EN) don't appear in body. If BOTH N=2 items have title-token=0, signal triggers.
  4. Body length < 100 chars — empty/404 page; **separate status branch** (D-08).

  AUDIT.md evidence column shows which signal triggered, e.g., `"detail-identical (jaccard=0.94, title-tokens 0/3)"`.

- **D-08:** Status mapping:
  - `length<100` → **`detail-empty`**
  - `exact OR jaccard≥0.9 OR title-token=0` → **`detail-identical`**
  - HTML list OK + items=0 → `selector-empty`
  - HTML/JS-render list HTTP error/timeout → `list-fail`
  - N=2 detail fetches all fail → `detail-quality-unknown`
  - All signals negative + body>100 + identity OK → `OK`

  Status vocab is **literally the 6 values** SC-3 names — no sub-classes (e.g., no `detail-identical-fuzzy`). Signal detail goes in evidence column.

**AUDIT.md structure + remediation (Area 4):**
- **D-09:** AUDIT.md = **hybrid format**:
  1. Top summary table: `| Firm | Tier | Status | Items | Remediation | Target Phase |` (grep-friendly).
  2. Per-firm evidence blocks: `## <id> (tier, status)` section with list URL/HTTP code, item count, detail sampling (URL · length · signal values), root cause one-liner, remediation one-liner, target phase one-liner.
  3. Bottom metadata: timestamp, `--include-disabled` flag value, total / OK / non-OK counts, probe version (`firmAudit.ts` git commit hash).

- **D-10:** Remediation **fixed vocab (5 values)** + Target Phase mapping:
  - `enable-js-render-detail` → Phase 7 (DETAIL-04)
  - `fix-selector` → Phase 7
  - `disable-firm` → immediate (firms.yaml edit)
  - `migrate-to-sitemap` → Phase 9 (SITEMAP-04)
  - `monitor` → Phase 10/11

  Writer enforces enum — no typos / new values allowed.

- **D-11:** AUDIT.md is **overwrite, not append-only**. `pnpm audit:firms` rewrites the entire file each run; previous versions live in git history.

### Claude's Discretion

- `firmAudit.ts` internal function decomposition (tokenize / jaccard / title-token presence / etc.) — split for testability; naming and module boundaries are implementer's choice.
- AUDIT.md summary table column widths, alignment, emoji — readability first, consistency required.
- Per-firm evidence section info order (list-first vs detail-first) — diagnostic flow.
- Optional CLI flags beyond `--include-disabled` (e.g., `--firm <id>`, `--json`) — out of scope for v1; backwards-compatible additions allowed later.
- `loadFirmsForAudit(includeDisabled)` vs option-flag on existing `loadFirms()` — implementer's choice; existing call sites must not break. **Recommendation below: option-flag with default false (zero-disruption).**
- Playwright browser context sharing scope (per-firm vs whole audit) — follow Phase 4 D-05 (shared browser, per-firm context).

### Deferred Ideas (OUT OF SCOPE)

- Per-firm baseline storage / trend comparison (`state/audit-baseline.json`) — Phase 10 DQOBS or v1.2.
- `--strict` flag to choose signal subsets — combined-always per D-07.
- Sub-classifying `detail-identical-exact` / `-fuzzy` / `-generic` — SC-3 vocab violation.
- Increasing N (3, 5) — v1.2 backlog.
- JSON output format — v1.2 (markdown only in v1).
- `--firm <id>` single-firm audit — `check:firm` already covers single-firm; not duplicating.
- GHA workflow integration (`pnpm audit:firms` step in `daily.yml`) — Phase 11 territory.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | Probe fetches every enabled firm's list page; reports item count + selector match status per firm | `scrapeRss` / `scrapeHtml` / `scrapeJsRender` already return `RawItem[]` and throw on list-fail; per-firm `Promise.allSettled` (`pipeline/fetch.ts:53` pattern) gives the per-firm row → translates directly to status `OK` / `list-fail` / `selector-empty` |
| AUDIT-02 | Probe fetches detail URLs for N≥2 items and cross-compares extracted body — identical bodies flag SPA risk | Existing `decodeCharsetAwareFetch` + `extractBody` (`src/scrapers/util.ts:173 / :241`) provides the body extractor seed; `detail-page-audit.ts:25` already does the 1-signal hash; this research adds 3 more signals (jaccard, title-token, length<100) — implementations below |
| AUDIT-03 | Output written to `.planning/phases/06-firm-audit-probe/06-AUDIT.md` (path corrected from REQ's `/06-firm-audit/`) with 6-status vocab | `src/audit/writer.ts` (new) — discriminated union over status enum, fail-build on missing branch via TS `never` exhaustiveness; markdown formatting via template literal |
| AUDIT-04 | Each non-OK row has explicit remediation path (5-value enum) | Same writer; remediation enum + target phase auto-mapped from status (mapping below) |

**Note on AUDIT-03 path:** REQUIREMENTS.md line 87 names `.planning/phases/06-firm-audit/06-AUDIT.md`, but D-09 + the actual phase folder is `06-firm-audit-probe`. The phase folder name is canonical (already exists, contains 06-CONTEXT.md). The REQUIREMENTS.md path is a stale draft. Plan should write to `.planning/phases/06-firm-audit-probe/06-AUDIT.md`.
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Firm list scraping | Existing scraper layer (`src/scrapers/{rss,html,jsRender}.ts`) | — | Reuse — these are the production scrapers; audit calls them as-is to measure their actual extraction (changing them would defeat the audit's purpose) |
| Detail fetch (HTML tier) | `src/scrapers/util.ts#decodeCharsetAwareFetch` + `extractBody` | — | Reuse — `enrichBody.ts` uses these in production; audit mirrors that path so audit results match production behavior |
| Detail fetch (JS-render tier) | New helper in `src/audit/firmAudit.ts` calling `browser.newContext().newPage().goto(url)` directly | Phase 4 shared `Browser` from `runPipeline` (BUT audit runs standalone — owns its own launch/close) | Audit is invoked outside `runPipeline`; it must own the browser lifecycle. Pattern matches Phase 4 D-05 (one launch, per-firm context, close at end) |
| Multi-signal identity check | New `src/audit/signals.ts` (4 pure functions — testable) | — | Pure-function decomposition matches Phase 1 TDD discipline (canonicalizeUrl, parseDate); each signal is independently testable |
| Per-firm isolation | New `src/audit/firmAudit.ts` orchestrator using `Promise.allSettled` | — | Mirror `pipeline/fetch.ts:53` exactly — one firm's failure (timeout, throw) cannot block others; audit must show every firm a row |
| AUDIT.md serialization | New `src/audit/writer.ts` | — | Pure function `(report: AuditReport) → string`; enum-enforced columns; tested via snapshot |
| CLI wrapper + exit codes | New `src/cli/auditFirms.ts` | Mirrors `src/cli/checkFirm.ts` shape | Same Reporter / argv-parser / fail-loud pattern as existing `check:firm`; exit codes 0/1/2 per D-03 |
| Config loading with disabled firms | Extension to `src/config/loader.ts` (option flag) | — | Single change to one function; existing call sites pass nothing → unchanged behavior |

## Standard Stack

### Core (already installed — no changes)
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| TypeScript | 5.7.x | Type safety for the discriminated-union enum enforcement [VERIFIED: package.json:35] | Already locked across all phases |
| `tsx` | 4.21.x | Run TS without build — same as `check:firm` pattern [VERIFIED: package.json:34] | `package.json` `audit:firms` script invokes this |
| `vitest` | 4.1.4 | Unit + snapshot tests for signal pure functions and writer markdown [VERIFIED: package.json:37] | Project-wide test runner; snapshot file in `__snapshots__/` next to test |
| `cheerio` | 1.2.0 | Already used by `extractBody`; no new use case [VERIFIED: npm view cheerio version → 1.2.0] | Reused via `extractBody` |
| `playwright` | 1.59.1 (caret of 1.58 in package.json) | JS-render detail fetches; reuse Phase 4 chromium shell launch [VERIFIED: npm view playwright version → 1.59.1] | Phase 4 already brings binary cache to GHA |
| `zod` | 4.3.6 | Schema for firm config (already used); NOT used for the remediation enum (TS discriminated union is sufficient — see D-10 enforcement below) [VERIFIED: npm view zod version → 4.3.6] | Reused only via existing `loadFirms` |

### Supporting (no new deps)
| Library | Used For | When |
|---------|----------|------|
| `p-limit` (already in use, v7) | Concurrency cap during HTML detail fetches (politeness) | HTML tier: pLimit(3) firm-level (matches `pipeline/fetch.ts`); JS-render tier: pLimit(2) or sequential (browser memory pressure — see Discretion area) |
| Node 22 native `fetch` | RSS/HTML list + HTML detail | All non-JS tiers — matches existing scraper patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `loadFirms({ includeDisabled })` option | New `loadFirmsForAudit()` function | Either works; option-flag is **less surface area** (one function to grep, one schema to evolve) — recommended |
| TS discriminated union for `Status` / `Remediation` | `zod.enum(...)` runtime validation | Discriminated union is **build-time** enforcement (free, fail-build on bad value); zod is runtime (catches dynamic data — not needed here since all values come from internal code paths) — discriminated union recommended |
| Snapshot test for AUDIT.md output | Inline `expect(...).toMatchInlineSnapshot()` | External `.snap` file — Phase 1 plan 08 precedent (templates.ts snapshot kept in `__snapshots__/`) — keeps PR diffs readable on Markdown-heavy output |
| New chromium launch in audit | Reuse Phase 4 `runPipeline`'s browser via factored helper | Audit is **standalone tool**, not part of runPipeline; reusing means audit becomes coupled to runPipeline. Cleaner to launch its own browser using identical Phase 4 D-05 pattern (header comment can cross-reference). |

**Installation:** None required. All dependencies already locked in `package.json`.

**Version verification:**
```
npm view cheerio version    → 1.2.0    (matches package.json)
npm view playwright version → 1.59.1   (matches package.json caret ^1.58.0)
npm view zod version        → 4.3.6    (matches package.json)
```
All current as of 2026-04-19.

## Architecture Patterns

### System Architecture Diagram

```
                                ┌─────────────────────────────────┐
                                │  pnpm audit:firms [--include-   │
                                │           disabled]              │
                                └──────────────┬──────────────────┘
                                               ↓
                                ┌─────────────────────────────────┐
                                │   src/cli/auditFirms.ts         │
                                │   - parse argv                  │
                                │   - construct CliReporter       │
                                │   - exit code per audit result  │
                                └──────────────┬──────────────────┘
                                               ↓
                                ┌─────────────────────────────────┐
                                │   src/audit/firmAudit.ts        │
                                │   - loadFirms({ includeDisabled})│
                                │   - launch chromium IF any js-  │
                                │     render firm in scope        │
                                │   - Promise.allSettled per firm │
                                │   - writeAuditReport()          │
                                │   - close browser               │
                                └─┬──────────────┬──────────────┬─┘
              ┌───────────────────┘              ↓              └──────────────┐
              ↓                                                                 ↓
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│ probeRssFirm(firm)      │    │ probeHtmlFirm(firm)     │    │ probeJsRenderFirm(firm, │
│   - scrapeRss(firm)     │    │   - scrapeHtml(firm)    │    │                  browser)│
│   - count items         │    │   - sample N=2 detail   │    │   - scrapeJsRender(firm,│
│   - status: OK / list-  │    │     URLs                │    │     browser)            │
│     fail / selector-    │    │   - decodeCharsetAware  │    │   - sample N=2 detail   │
│     empty               │    │     Fetch + extractBody │    │     URLs via Playwright │
│   (NO detail check)     │    │     for each            │    │   - 4-signal check      │
│                         │    │   - 4-signal check      │    │     (same as HTML tier) │
└──────────┬──────────────┘    └──────────┬──────────────┘    └────────────┬────────────┘
           │                              ↓                                  │
           │              ┌─────────────────────────────────┐                │
           │              │ src/audit/signals.ts            │                │
           │              │   exactHashMatch(a, b)          │                │
           │              │   jaccardTokenSimilarity(a, b)  │                │
           │              │   titleTokenPresence(title, body)│               │
           │              │   bodyTooShort(body)            │                │
           │              │   classifyDetailIdentity(...)   │                │
           │              └─────────────────────────────────┘                │
           ↓                              ↓                                   ↓
                          ┌─────────────────────────────────┐
                          │  AuditRow {                     │
                          │    firm, tier, status,          │
                          │    items, remediation,          │
                          │    targetPhase, evidence        │
                          │  }                              │
                          └──────────────┬──────────────────┘
                                         ↓
                          ┌─────────────────────────────────┐
                          │  src/audit/writer.ts            │
                          │   formatSummaryTable(rows)      │
                          │   formatPerFirmEvidence(rows)   │
                          │   formatMetadata(rows, opts)    │
                          │   ↓ string concatenation ↓      │
                          │  return markdown                │
                          └──────────────┬──────────────────┘
                                         ↓
                          ┌─────────────────────────────────┐
                          │  writeFile(                     │
                          │   '.planning/phases/06-firm-    │
                          │    audit-probe/06-AUDIT.md', md)│
                          │  (overwrite — D-11)             │
                          └──────────────┬──────────────────┘
                                         ↓
                          ┌─────────────────────────────────┐
                          │ exit 0 (all OK) / 1 (any non-OK)│
                          │       / 2 (runtime / usage)     │
                          └─────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── audit/                              # NEW directory — Phase 6 lives here
│   ├── firmAudit.ts                    # orchestrator — calls scrapers, runs signals, builds rows
│   ├── signals.ts                      # 4 pure-function signal helpers + classifier
│   ├── writer.ts                       # AuditReport → markdown string (snapshot-tested)
│   └── types.ts                        # AuditRow / AuditReport / Status / Remediation enums
├── cli/
│   ├── checkFirm.ts                    # existing — pattern reference (do NOT modify)
│   └── auditFirms.ts                   # NEW — argv + Reporter + exit code
├── config/
│   └── loader.ts                       # MINIMAL change — add { includeDisabled?: boolean } option
└── scrapers/                           # unchanged
    ├── rss.ts
    ├── html.ts
    ├── jsRender.ts
    └── util.ts                         # decodeCharsetAwareFetch + extractBody reused as-is

test/
├── audit/                              # NEW — mirror src/audit
│   ├── signals.test.ts                 # unit tests for tokenize / jaccard / title-token / length
│   ├── firmAudit.test.ts               # integration: html-tier firm with fixture, js-render fixture
│   └── writer.test.ts                  # snapshot test for AUDIT.md output
│   └── __snapshots__/
│       └── writer.test.ts.snap
└── fixtures/                           # add 2 new — see Test Strategy below
    ├── audit-bkl-identical-pair.html   # NEW — pair of "different URLs, same body" SPA simulation
    └── audit-shin-kim-distinct-pair/   # NEW — pair of "real article bodies, different content"

.planning/phases/06-firm-audit-probe/
├── 06-CONTEXT.md                       # exists
├── 06-DISCUSSION-LOG.md                # exists
├── 06-RESEARCH.md                      # this file
└── 06-AUDIT.md                         # WRITTEN at audit run-time (not committed initially)
```

### Pattern 1: Per-Firm Promise.allSettled Isolation (mirrored from `pipeline/fetch.ts:53`)

**What:** Each firm runs its probe inside its own try/catch; the outer awaits via `Promise.allSettled` so a synchronous throw outside the per-firm try (defense-in-depth) still produces a row instead of nuking the audit.

**When to use:** Always — a probe of N firms must always produce N rows, never N-1.

**Example (verified pattern from `pipeline/fetch.ts:53-117`):**
```typescript
// Source: src/pipeline/fetch.ts (Phase 2 D-P2-03)
const settled = await Promise.allSettled(
  firms.map((firm) =>
    limit(async (): Promise<AuditRow> => {
      try {
        // tier dispatch + status determination
        return await probeFirm(firm, browser);
      } catch (err) {
        // expected error path — convert to row with error status
        return {
          firm,
          tier: firm.type,
          status: classifyError((err as Error).message),
          items: 0,
          remediation: 'monitor',
          targetPhase: 'Phase 10/11',
          evidence: { errorMessage: scrubSecrets((err as Error).message) },
        };
      }
    }),
  ),
);

// Defense-in-depth: settled-rejected branch synthesizes a row
return settled.map((r, i) => {
  if (r.status === 'fulfilled') return r.value;
  return synthesizeErrorRow(firms[i], r.reason);
});
```

**Why this pattern is load-bearing for Phase 6:** D-03's exit-code contract requires the orchestrator to *examine every firm row* to decide exit 0 vs 1. If even one firm's failure prevents that firm's row from existing, the exit code is wrong (would exit 0 spuriously). `Promise.allSettled` guarantees the row exists.

### Pattern 2: Shared chromium Browser, Per-Firm BrowserContext (Phase 4 D-05)

**What:** One `chromium.launch({ headless: true })` for the entire audit; per-firm `browser.newContext({ userAgent: USER_AGENT })`; close context after that firm's probe; close browser at audit end.

**When to use:** Any time multiple js-render firms are probed in one audit run.

**Detail-page extension (NEW for Phase 6):** Phase 4's `scrapeJsRender` only fetches the LIST page. Phase 6 also needs N=2 detail-page fetches per js-render firm. Use the same per-firm `BrowserContext` (already open during list fetch) to fetch the detail pages, then close the context once.

**Wait strategy for detail pages:** Phase 4 D-14 already established that detail-page Playwright fallback uses `waitForLoadState('domcontentloaded')` with 15s timeout — *no per-firm wait_for selector for detail*. Phase 6 follows the same pattern (the firm's `wait_for` is for list-page hydration only).

**Example (extending Phase 4 D-05 pattern):**
```typescript
// Source: src/scrapers/jsRender.ts:77-115 (Phase 4 D-05) — list page fetch
// NEW for Phase 6: stay in the same context for detail fetches.
async function probeJsRenderFirm(
  firm: FirmConfig,
  browser: Browser,
): Promise<{ items: RawItem[]; bodies: { url: string; title: string; body: string }[] }> {
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    // Step 1: list page — reuse scrapeJsRender pattern
    const listPage = await context.newPage();
    await listPage.goto(firm.url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
    await listPage.waitForSelector(firm.wait_for!, { timeout: 15_000, state: 'attached' });
    const listHtml = await listPage.content();
    const items = parseListItemsFromHtml(listHtml, firm);
    await listPage.close();

    if (items.length < 2) {
      return { items, bodies: [] };
    }

    // Step 2: N=2 detail pages — same context, fresh pages
    const bodies: { url: string; title: string; body: string }[] = [];
    for (const item of items.slice(0, 2)) {
      const detailPage = await context.newPage();
      try {
        await detailPage.goto(item.url, { timeout: 15_000, waitUntil: 'domcontentloaded' });
        const detailHtml = await detailPage.content();
        const body = extractBody(detailHtml, firm.selectors?.body);
        bodies.push({ url: item.url, title: item.title, body });
      } catch (err) {
        // per-detail-page isolation — N=2 with one fail is still N=1 → detail-quality-unknown
      } finally {
        await detailPage.close();
      }
    }

    return { items, bodies };
  } finally {
    await context.close();
  }
}
```

### Pattern 3: Multi-Signal Detail Identity (NEW — D-07)

**What:** 4 pure functions, each takes the inputs it needs, returns boolean (or numeric for jaccard). A classifier combines them per D-07/D-08 rules into a `Status` + evidence string.

**Implementation (signal by signal):**

#### Signal 1: Exact hash match (port from `scripts/detail-page-audit.ts:25`)
```typescript
// src/audit/signals.ts
export function bodyHash(body: string): string {
  return `${body.length}:${body.slice(0, 50).replace(/\s+/g, '')}`;
}

export function exactHashMatch(bodyA: string, bodyB: string): boolean {
  return bodyHash(bodyA) === bodyHash(bodyB);
}
```

#### Signal 2: Jaccard token similarity (NEW)

**Algorithm:** whitespace tokenize → `Set` → `|A ∩ B| / |A ∪ B|`. KO/EN mixed content is fine because both languages use whitespace as the primary token boundary; CJK ideographs and Hangul syllable blocks treat each whitespace-separated chunk as one token (no per-character tokenization needed for "are these two bodies almost identical?" comparison).

**Edge cases handled:**
- Both empty → return 1.0 (vacuously identical) — but this case is preempted by `bodyTooShort` signal anyway.
- One empty / other non-empty → returns 0.0 (intersection 0 / union N).

```typescript
// src/audit/signals.ts
export function tokenize(text: string): string[] {
  // Whitespace split, drop empty strings.
  // Korean: each Hangul word / punctuation chunk becomes one token.
  // English: each word becomes one token.
  // No lowercasing — production scrapers don't lowercase, so identity should
  // match what users would actually see.
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
```

**Why whitespace-only (not character-level):** The bug Phase 6 must catch is the bkl-style "every detail URL returns the same landing page" — bodies are *literally identical* (jaccard ~ 1.0). Even firms that differ by phone numbers / timestamps would still have jaccard well above 0.9. Character-level tokenization would catch the same cases but adds complexity (Korean has no character separator) for no detection improvement. **Stick with whitespace.**

**Threshold rationale (≥ 0.9):** D-07 specifies 0.9. Test fixtures should validate this with the bkl case (expect 1.0) and a real-article pair (expect < 0.5 — most articles share fewer than half their tokens).

#### Signal 3: Title-token presence (NEW)

**Algorithm:** Extract ≥2-character tokens from the title (KO Hangul or EN word characters); for each token, check if it appears anywhere in the body (case-insensitive for English; exact for Korean since Hangul has no case). Return count of tokens that appear in the body. Signal triggers when count = 0 across BOTH N=2 items (both items' titles bear no relation to the body — strong SPA signal).

**Tokenization regex for ≥2-char KO/EN tokens:**
```typescript
// src/audit/signals.ts
/**
 * Extract ≥2-character tokens from a title for body presence checking.
 *
 * Token classes:
 *   - Hangul syllable blocks: U+AC00-U+D7AF (가-힣) — 2+ in a row
 *   - CJK unified ideographs: U+4E00-U+9FFF — 2+ in a row (handles Chinese
 *     characters in Korean legal terms, e.g. 改正, 法案)
 *   - Latin word chars: [a-zA-Z0-9_]+ — 2+ in a row
 *
 * Single-character tokens are dropped because they're too noisy (a single
 * Hangul syllable like "법" appears in nearly every legal document; matching
 * it would always pass the presence check, defeating the signal).
 *
 * No stopword list — we want LOW-recall behavior here. A title that shares
 * even ONE meaningful token with the body is "topically related". Stopwords
 * matter when measuring topic overlap; they don't matter for "is this body
 * about a different topic entirely".
 */
export function extractTitleTokens(title: string): string[] {
  // Korean Hangul + CJK + Latin; ≥2 chars; case-folded for Latin only.
  const matches = title.match(/[\uAC00-\uD7AF\u4E00-\u9FFF]{2,}|[A-Za-z0-9_]{2,}/g) ?? [];
  // Lowercase Latin tokens for case-insensitive body match.
  return matches.map((t) => /^[A-Za-z0-9_]+$/.test(t) ? t.toLowerCase() : t);
}

export function titleTokensPresentInBody(title: string, body: string): number {
  const tokens = extractTitleTokens(title);
  if (tokens.length === 0) return 0;
  // Case-insensitive body for Latin tokens. We do this once.
  const bodyLower = body.toLowerCase();
  return tokens.filter((t) => bodyLower.includes(t.toLowerCase())).length;
}
```

**Why this catches bkl:** bkl's hallucinated digest had titles like "M&A 시장 동향" but every body said "법무법인 태평양은 1980년에 설립된...". Title tokens `M&A`, `시장`, `동향` (`M`, `&`, and `A` individually are each <2 chars and `M&A` would be split, but `시장` and `동향` are 2-char Hangul tokens) would be 0/3 present in the boilerplate body. Signal fires.

#### Signal 4: Body too short (length < 100 chars)
```typescript
// src/audit/signals.ts
export const BODY_TOO_SHORT_THRESHOLD = 100;

export function bodyTooShort(body: string): boolean {
  return body.length < BODY_TOO_SHORT_THRESHOLD;
}
```

#### Classifier (combines signals → Status + evidence)
```typescript
// src/audit/signals.ts
export interface DetailSignalResult {
  status: 'OK' | 'detail-identical' | 'detail-empty' | 'detail-quality-unknown';
  evidence: string;
}

export function classifyDetailIdentity(
  bodies: { url: string; title: string; body: string }[],
): DetailSignalResult {
  if (bodies.length < 2) {
    return {
      status: 'detail-quality-unknown',
      evidence: `only ${bodies.length}/2 detail fetches succeeded`,
    };
  }

  const [a, b] = bodies;

  // length<100 — either body — promotes to detail-empty
  if (bodyTooShort(a.body) || bodyTooShort(b.body)) {
    return {
      status: 'detail-empty',
      evidence: `body lengths: item1=${a.body.length}, item2=${b.body.length} (threshold ${BODY_TOO_SHORT_THRESHOLD})`,
    };
  }

  const exact = exactHashMatch(a.body, b.body);
  const jaccard = jaccardTokenSimilarity(a.body, b.body);
  const titleTokensA = titleTokensPresentInBody(a.title, a.body);
  const titleTokensB = titleTokensPresentInBody(b.title, b.body);
  const totalTokensA = extractTitleTokens(a.title).length;
  const totalTokensB = extractTitleTokens(b.title).length;
  const titlePresenceTriggered = titleTokensA === 0 && titleTokensB === 0;

  if (exact || jaccard >= 0.9 || titlePresenceTriggered) {
    const reasons: string[] = [];
    if (exact) reasons.push('exact-hash');
    if (jaccard >= 0.9) reasons.push(`jaccard=${jaccard.toFixed(2)}`);
    if (titlePresenceTriggered) {
      reasons.push(`title-tokens 0/${totalTokensA} & 0/${totalTokensB}`);
    }
    return {
      status: 'detail-identical',
      evidence: reasons.join(', '),
    };
  }

  return {
    status: 'OK',
    evidence: `bodies distinct (jaccard=${jaccard.toFixed(2)}, lengths ${a.body.length}/${b.body.length})`,
  };
}
```

### Pattern 4: Enum-Enforced Writer (D-10 fail-loud)

**What:** `Status` and `Remediation` are TypeScript string-literal unions. The writer's switch statement uses TypeScript's `never` exhaustiveness check — adding a new value without updating the writer fails the build.

**Example (TypeScript discriminated-union exhaustiveness):**
```typescript
// src/audit/types.ts
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
  tier: 'rss' | 'html' | 'js-render';
  status: Status;
  items: number;
  remediation: Remediation | null; // null only when status='OK'
  targetPhase: string | null;       // null only when status='OK'
  evidence: string;                  // free-form for human reader
  disabled: boolean;                  // for `(disabled, baseline)` tag (D-05)
}

// src/audit/writer.ts
function remediationToTargetPhase(r: Remediation): string {
  switch (r) {
    case 'enable-js-render-detail': return 'Phase 7';
    case 'fix-selector':            return 'Phase 7';
    case 'disable-firm':            return 'immediate';
    case 'migrate-to-sitemap':      return 'Phase 9';
    case 'monitor':                 return 'Phase 10/11';
    default: {
      // TypeScript will flag this as unreachable — `r` is `never` here. If a
      // future enum addition lands without a case, the build fails here.
      const _exhaustive: never = r;
      throw new Error(`Unhandled remediation: ${_exhaustive as string}`);
    }
  }
}
```

**Why this is fail-loud:** Adding `'disable-temporarily'` to the `Remediation` union without updating the switch makes `tsc --noEmit` (the existing `pnpm typecheck`) fail. The writer cannot ship a row with an unknown remediation value.

### Pattern 5: Status → Remediation Default Mapping
```typescript
// src/audit/firmAudit.ts — used when constructing AuditRow
export function defaultRemediation(
  status: Status,
  tier: 'rss' | 'html' | 'js-render',
): Remediation | null {
  switch (status) {
    case 'OK':                       return null;
    case 'list-fail':                return 'monitor';        // could be transient — Phase 10 trend
    case 'selector-empty':           return 'fix-selector';
    case 'detail-identical':
      // RSS doesn't reach here (D-06 — RSS skips detail check). HTML →
      // most common cause is SPA detail. JS-render → already JS-render so
      // detail might be a different issue (rare); flag for monitor.
      return tier === 'html' ? 'enable-js-render-detail' : 'monitor';
    case 'detail-empty':
      // Could be 404, fetch fail, or genuinely empty page. Selector or
      // detail-tier — Phase 7 territory either way.
      return 'fix-selector';
    case 'detail-quality-unknown':   return 'monitor';
  }
}
```

The plan should make this default explicit per-firm, so the audit can override (e.g., cooley with `selector-empty` due to CF block → `migrate-to-sitemap`, not `fix-selector`). Implementer's discretion which mechanism (override map keyed by firm id, or post-classification adjustment).

### Anti-Patterns to Avoid

- **Per-character tokenization for jaccard:** Wastes complexity for no signal gain. Whitespace tokenization catches the bkl-class bug with margin to spare.
- **Single-character title tokens:** Single Hangul syllables like `법` appear in nearly every Korean legal document — would always pass body presence check, defeating signal. ≥2 chars is the floor.
- **Hand-rolled enum string validation in writer:** Use TS discriminated union exhaustiveness; don't `if (status === '...')` branches that silently no-op on new values.
- **Calling production `runPipeline` from audit:** Couples audit to mailer/state/Gemini — defeats audit's "diagnostic only" purpose. Audit calls scrapers directly.
- **Letting one firm's throw break the audit:** Always wrap with `Promise.allSettled` (Phase 2 D-P2-03 lesson — re-learning this would be a regression).
- **Writing AUDIT.md mid-loop:** Build full report in memory, then one `writeFile`. Atomic. (D-11 overwrite is implemented as one writeFile call, not append-as-you-go.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP fetch with charset detection | Custom `fetch` + iconv loop | `decodeCharsetAwareFetch` from `src/scrapers/util.ts:173` | Already handles EUC-KR/CP949 for Korean firms — re-implementing risks mojibake |
| HTML body extraction | Custom selector chain | `extractBody` from `src/scrapers/util.ts:241` | Already handles per-firm `selectors.body` override + generic chain + p-dense fallback + noise stripping |
| List-page item parsing | Custom cheerio loop | `parseListItemsFromHtml` from `src/scrapers/util.ts:410` | Already handles all 3 link-extraction modes (object / string / legacy onclick) |
| Browser launch lifecycle | Custom Playwright wrapper | Mirror Phase 4 D-05 pattern from `src/pipeline/run.ts:154-162` | Headless: true, single launch per audit, per-firm context, close at end |
| Per-firm failure isolation | Custom try/catch wrapper | `Promise.allSettled` exactly like `pipeline/fetch.ts:53` | Already has the recorder/error-shape pattern; mirroring it gives behavior parity |
| robots.txt compliance | Skip it (probe is "internal") | Reuse `fetchRobots` + `isAllowed` from `src/scrapers/robots.ts` | The audit hits the same URLs as the production pipeline; same politeness applies (Established Patterns in CONTEXT.md) |
| YAML loading + zod validation | Custom YAML reader | `loadFirms()` extension via option-flag | Existing function is the only place that knows the firms.yaml schema |
| Markdown table generation | Markdown library (e.g., markdown-table) | Hand-formatted template literal | Phase 1 plan 08 precedent (digest HTML is hand-formatted); zero new deps; output is small (≤ 13 rows) |

**Key insight:** Phase 6 is *almost entirely composition* of existing helpers. The only NEW logic is (a) 4 small pure functions for signals, (b) the orchestrator that calls scrapers + signals + writer, and (c) markdown serialization. If a plan task starts inventing new fetch / extract / parse code, it's the wrong task.

## Runtime State Inventory

> Phase 6 is a NEW diagnostic tool, not a rename or migration. Most categories are not applicable.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 6 produces only an overwrite Markdown file (`06-AUDIT.md`); no DB, no `state/seen.json` mutation, no cache | none |
| Live service config | None — runs locally / GHA-on-demand only; does NOT alter `firms.yaml`; does NOT change cron config; does NOT trigger Gemini calls | none |
| OS-registered state | None — Phase 6 does NOT register anything with launchd/systemd/Task Scheduler; cron registration is Phase 11 | none |
| Secrets/env vars | None new — audit uses no Gemini API key, no Gmail App Password (no email send), no recipient config; the only env touched is `process.env` for `USER_AGENT` (already exists) | none |
| Build artifacts | `scripts/detail-page-audit.ts` will be DELETED after porting (D-02). No package re-install — no `pyproject.toml` / `package.json` rename. `package.json` adds one new script entry (`audit:firms`); npm/pnpm does NOT need re-install for adding a script | Plan task: include `git rm scripts/detail-page-audit.ts` in the same commit that lands `src/audit/firmAudit.ts` to keep history coherent |

## Common Pitfalls

### Pitfall 1: Title-token signal triggers on monolingual title without enough tokens
**What goes wrong:** A title like `"M&A"` extracts to zero tokens (because `M`, `&`, `A` are each <2 chars and `M&A` gets split by the regex). Both items have `extractTitleTokens(title).length === 0` → passes the `titlePresenceTriggered` condition vacuously even though the body is real.
**Why it happens:** Empty token list means trivially "all (zero) tokens are absent from body".
**How to avoid:** Tighten the trigger condition: `titleTokensA === 0 && totalTokensA > 0 && titleTokensB === 0 && totalTokensB > 0`. Only fire when there ARE title tokens but NONE appear in body. (Code in Pattern 3 already implements this — make sure tests catch the title-with-zero-tokens case.)
**Warning signs:** Audit reports `detail-identical (title-tokens 0/0)` — the `0/0` is the giveaway. Should be impossible with the tightened check.

### Pitfall 2: Cheerio `extractBody` fallback returns whole page text → jaccard misleadingly high
**What goes wrong:** When `extractBody`'s selector chain misses everything, it falls back to "p-dense parent" or even `$('body').text()`. Two different article URLs whose chrome (header / nav / footer — except wait, `extractBody` already strips those) is identical might score high jaccard.
**Why it happens:** `extractBody` strips `<nav>/<aside>/<footer>/.ad` BUT keeps headings, breadcrumbs, "related articles" sidebars that aren't in the strip list.
**How to avoid:** This is exactly what the bkl bug WAS — every URL returned the same landing page, and even after extractBody's noise-stripping, the body was identical. The signal *should* fire here. Where it would be a *false* positive: two real articles on the same firm sharing 90%+ tokens (very unlikely for distinct article bodies in legal newsletters, which are 500-5000 words on different topics each).
**Warning signs:** Two firms with very short bodies (50-100 chars) showing high jaccard — the body-too-short signal preempts and returns `detail-empty` instead of `detail-identical` (correct outcome). For longer bodies, jaccard ≥ 0.9 is genuinely a strong identical signal.

### Pitfall 3: JS-render detail page wait_for is wrong (firm's `wait_for` is for LIST page)
**What goes wrong:** `firm.wait_for` is the selector for the LIST page hydration. Reusing it on a detail page would either time out (selector doesn't exist on detail page) or wait too long.
**Why it happens:** Easy to write `await page.waitForSelector(firm.wait_for)` on every page.goto.
**How to avoid:** Detail-page goto uses `waitForLoadState('domcontentloaded')` ONLY (Phase 4 D-14 already established this). Code in Pattern 2 above does this correctly — make sure plan tasks reference Phase 4 D-14.
**Warning signs:** Audit times out on every js-render firm's detail check. Logs show `playwright-timeout waiting for {wait_for}` on detail-page step.

### Pitfall 4: `loadFirms()` enabled-filter still applied even with `--include-disabled`
**What goes wrong:** Default `loadFirms()` filters `f => f.enabled` (line 52). Adding the option but forgetting to skip the filter when `includeDisabled === true` means `--include-disabled` does nothing.
**Why it happens:** The filter is a single line, easy to overlook.
**How to avoid:** Schema → array of FirmConfig → if `!includeDisabled` filter to enabled. Test: assert `loadFirms({ includeDisabled: true }).length === 13` (current 12 enabled + 1 disabled cooley).
**Warning signs:** Audit report missing `cooley` row when invoked with `--include-disabled`.

### Pitfall 5: Audit runs but exit code is always 0 (silent failure)
**What goes wrong:** Forgot to scan results and conditionally exit 1.
**Why it happens:** CLI wrapper just `await runAudit()` and exits 0.
**How to avoid:** After receiving the `AuditReport`, inspect `report.rows.some(r => r.status !== 'OK')` and `process.exit(1)` if true. Test the exit code via `pnpm test` integration test invoking the CLI in a child process. (Or unit-test the function that decides exit code separately and trust the CLI just dispatches.)
**Warning signs:** Phase 11 CI gate doesn't fire on actual non-OK firms — audit always green. (Memory's "aggressive failure detection" preference: this would be the worst possible regression.)

### Pitfall 6: `06-AUDIT.md` writes mid-loop and partial file lands on throw
**What goes wrong:** Streaming writes (`fs.appendFile` per row) means a throw in row 7 leaves a 6-row partial file on disk that confuses Phase 7/8/9 planners reading it.
**Why it happens:** Trying to be cute with streaming.
**How to avoid:** Build full markdown string in memory, ONE `writeFile` call. Audit reports are tiny (<10KB) — no streaming needed.
**Warning signs:** AUDIT.md exists but missing rows or has a partial last row.

### Pitfall 7: Snapshot test brittleness on Markdown whitespace
**What goes wrong:** Snapshot test for writer fails on every run because of trailing whitespace / line ending differences.
**Why it happens:** Markdown formatters (Prettier, editor auto-format) re-flow tables and strip trailing whitespace.
**How to avoid:** Use external `.snap` file (matches Phase 1 plan 08 templates.ts precedent — see `src/compose/__snapshots__/templates.test.ts.snap`); add `audit-writer.snap` to `.prettierignore` so editor formatting doesn't touch it; assert exact string match. Alternative: assert specific structural properties (row count, presence of specific firm IDs, exact remediation column values) instead of full snapshot.
**Warning signs:** Test passes locally, fails in CI; or vice versa.

## Code Examples

Verified patterns from existing code that Phase 6 can lift.

### Loading firms with optional disabled inclusion
```typescript
// src/config/loader.ts (modified — minimal change)
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
**Why this is backwards-compatible:** All existing call sites (`src/main.ts`, `src/cli/checkFirm.ts`, `src/pipeline/run.ts:132`) call `loadFirms()` with no args → behavior unchanged.

### CLI wrapper mirroring `checkFirm.ts`
```typescript
// src/cli/auditFirms.ts
import { runAudit } from '../audit/firmAudit.js';

interface ParsedArgs {
  includeDisabled: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const includeDisabled = args.includes('--include-disabled');
  // Reject unknown flags fail-loud
  for (const a of args) {
    if (a !== '--include-disabled') {
      console.error(`Unknown argument: ${a}`);
      console.error('Usage: pnpm audit:firms [--include-disabled]');
      process.exit(2);
    }
  }
  return { includeDisabled };
}

class CliReporter {
  section(name: string, detail: string): void {
    console.log(`  ${name.padEnd(18)}: ${detail}`);
  }
}

async function main(): Promise<number> {
  const { includeDisabled } = parseArgs(process.argv);
  try {
    const report = await runAudit({ includeDisabled, reporter: new CliReporter() });
    const nonOk = report.rows.filter((r) => r.status !== 'OK');
    console.log(`[audit:firms] ${report.rows.length} firm(s) probed; ${nonOk.length} non-OK`);
    console.log(`[audit:firms] wrote ${report.outputPath}`);
    return nonOk.length === 0 ? 0 : 1;
  } catch (err) {
    console.error(`[audit:firms] error: ${(err as Error).message}`);
    return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[audit:firms] fatal: ${(err as Error).message}`);
    process.exit(2);
  });
```

### Per-firm probe with allSettled
```typescript
// src/audit/firmAudit.ts — orchestrator skeleton
import pLimit from 'p-limit';
import { chromium, type Browser } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { loadFirms } from '../config/loader.js';
import { fetchRobots, isAllowed } from '../scrapers/robots.js';
import { scrapeRss } from '../scrapers/rss.js';
import { scrapeHtml } from '../scrapers/html.js';
import { decodeCharsetAwareFetch, extractBody } from '../scrapers/util.js';
import { scrubSecrets } from '../util/logging.js';
import { classifyDetailIdentity } from './signals.js';
import { renderAuditMarkdown } from './writer.js';
import type { AuditRow, AuditReport, RunOptions } from './types.js';
import type { FirmConfig } from '../types.js';

const AUDIT_OUTPUT_PATH = '.planning/phases/06-firm-audit-probe/06-AUDIT.md';

export async function runAudit(options: RunOptions): Promise<AuditReport> {
  const firms = await loadFirms({ includeDisabled: options.includeDisabled });
  const hasJsRender = firms.some((f) => f.type === 'js-render');
  const browser = hasJsRender ? await chromium.launch({ headless: true }) : undefined;
  const startedAt = new Date();

  try {
    const limit = pLimit(3);
    const settled = await Promise.allSettled(
      firms.map((firm) =>
        limit(async (): Promise<AuditRow> => {
          // robots.txt gate — same politeness as production
          const origin = new URL(firm.url).origin;
          const disallows = await fetchRobots(origin);
          if (!isAllowed(firm.url, disallows)) {
            return makeRow(firm, 'list-fail', 0, `robots.txt disallows ${firm.url}`);
          }
          switch (firm.type) {
            case 'rss':       return await probeRssFirm(firm);
            case 'html':      return await probeHtmlFirm(firm);
            case 'js-render': return await probeJsRenderFirm(firm, browser!);
          }
        }),
      ),
    );

    const rows = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : makeRow(
            firms[i],
            'list-fail',
            0,
            scrubSecrets(r.reason instanceof Error ? r.reason.message : String(r.reason)),
          ),
    );

    const report: AuditReport = {
      rows,
      runMetadata: {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        includeDisabled: options.includeDisabled === true,
        totalFirms: rows.length,
        okCount: rows.filter((r) => r.status === 'OK').length,
        nonOkCount: rows.filter((r) => r.status !== 'OK').length,
        // probeVersion intentionally derived at writer.ts via execSync('git rev-parse HEAD')
        // OR via env var if running in GHA — implementer's discretion
      },
      outputPath: AUDIT_OUTPUT_PATH,
    };

    const markdown = renderAuditMarkdown(report);
    await writeFile(AUDIT_OUTPUT_PATH, markdown, 'utf8');
    return report;
  } finally {
    if (browser) await browser.close();
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `scripts/*.ts` for ad-hoc probes (detail-page-audit, probe-js-render, debug-rss) | Production-promoted `src/audit/` for tools that get re-invoked across phases | Phase 6 D-01/D-02 | Audit runs from a stable, tested code path; deletes `detail-page-audit.ts` after port |
| 1-signal exact-hash detection | 4-signal combined-OR (exact + jaccard + title-token + length<100) | Phase 6 D-07 | Catches micro-diff SPAs (timestamp/phone-number differences) that pure exact-hash misses |
| `console.log`-only diagnostic output | Markdown report with grep-friendly summary table + per-firm evidence | Phase 6 D-09 | Phase 7/8/9 planners can parse remediation column to scope their phases automatically |

**Deprecated/outdated (Phase 6 deletes / supersedes):**
- `scripts/detail-page-audit.ts` — superseded by `src/audit/firmAudit.ts` (D-02, delete after port)

**No deprecations external to project.** All pinned packages in `package.json` are current as of 2026-04-19 (verified via `npm view`).

## Test Strategy

### Unit tests (vitest, pure functions)

`test/audit/signals.test.ts`:
- `tokenize`: empty string → []; whitespace-only → []; mixed KO+EN → individual tokens; multiple consecutive whitespace collapsed.
- `extractTitleTokens`: monolingual KO title `"M&A 시장 동향"` → `['시장', '동향']` (M&A split by &, individual letters <2 chars dropped); monolingual EN title `"Recent Tax Policy Updates"` → `['recent', 'tax', 'policy', 'updates']` (lowercased); mixed `"K-IFRS 도입 영향"` → `['ifrs', '도입', '영향']`.
- `titleTokensPresentInBody`: title-tokens all in body → returns N; title-tokens none in body → returns 0; case-insensitive English match (title `'TAX'`, body `'tax law'`) → returns 1.
- `bodyHash`: same body → same hash; different length → different hash; first 50 chars whitespace-stripped.
- `exactHashMatch`: identical strings → true; differ in 51st char → still true (only first 50 hashed); differ in length → false.
- `jaccardTokenSimilarity`: identical bodies → 1.0; disjoint → 0.0; both empty → 1.0; one empty → 0.0; bkl-fixture pair (load both bodies) → ≥ 0.9; real-article pair → < 0.5.
- `bodyTooShort`: 99 chars → true; 100 chars → false; 0 chars → true.
- `classifyDetailIdentity`:
  - `[] or [single]` → `detail-quality-unknown`
  - one body length=50 → `detail-empty`
  - both 200 chars, identical → `detail-identical (exact-hash, jaccard=1.00, title-tokens 0/N & 0/M)` (multiple signals reported)
  - both 200 chars, real distinct articles → `OK`
  - **Pitfall 1 case:** title with zero ≥2-char tokens AND distinct bodies → `OK` (must NOT fire title-token signal vacuously)

### Integration tests (vitest with fixtures)

`test/audit/firmAudit.test.ts`:
- HTML-tier integration: synthetic FirmConfig pointing at fixture-served HTML; mock `decodeCharsetAwareFetch` to return fixture content; assert `probeHtmlFirm` returns AuditRow with status='detail-identical' for the SPA fixture and 'OK' for the real-articles fixture.
- JS-render integration: similar pattern with mocked Playwright (`browser.newContext` returns a stub) — alternatively, mark this test `skipIf(process.env.CI && !process.env.E2E)` and run a real Playwright launch locally.

`test/audit/writer.test.ts`:
- Snapshot test (external `.snap`): construct an `AuditReport` with one row of each status × tier combination → render markdown → match snapshot.
- Property tests: every row's `remediation` is one of the 5 enum values OR null (only when status='OK'); summary table has exactly N rows; per-firm sections have one heading per row.

`test/config/loader.test.ts` (extension):
- Add: `loadFirms({ includeDisabled: true })` includes cooley; `loadFirms()` does not.

### Fixture analysis (from existing `test/fixtures/`)

| Fixture | Reusable for Phase 6? | Use |
|---------|----------------------|-----|
| `bkl.list.html` | ✓ | List-page parsing for HTML tier integration test |
| `shin-kim.list.html` | ✓ | List-page parsing for HTML tier integration test |
| `yulchon.list.html` | ✓ | List-page parsing |
| `cooley.rss.xml` | ✓ | RSS-tier integration (mock fetch) |
| `article-fallback.html`, `article-generic.html`, `article-override.html` | ✓ | Body extraction (already paired with `extractBody` tests) |
| `korean-cp949.html` | ✓ | Charset-aware fetch (already covered) |

**New fixtures needed (2):**
- `audit-bkl-spa-pair-1.html` and `audit-bkl-spa-pair-2.html`: two HTML files representing what bkl returned for two different detail URLs — body content is identical SPA landing page boilerplate. Recreate from the actual bkl bug evidence in `.planning/backlog/v1.0-data-quality-audit.md` line 23 (or fetch live and save once).
- `audit-real-article-pair-1.html` and `audit-real-article-pair-2.html`: two distinct legal articles with different bodies (≥200 chars each, sharing < 50% tokens). Could pull from a working firm like clifford-chance or freshfields.

### Sampling cadence
- **Per task commit:** `pnpm test test/audit/` (signals + writer unit tests, ~1s)
- **Per phase merge:** `pnpm test` (all 180+ existing tests + new audit tests must pass)
- **Phase gate:** `pnpm audit:firms` produces a valid 06-AUDIT.md (manual verification — content reflects real firm state at the time)

## Verifying the bkl Detection (Specifics §4 — Memory's "aggressive failure detection")

The bkl bug: 9 detail URLs all returning the same SPA landing page → Gemini hallucinated 9 identical "법무법인 태평양은 1980년에 설립된..." summaries.

Walking through the 4 signals against this case:

| Signal | bkl evidence | Triggers? |
|--------|--------------|-----------|
| Exact hash | Both bodies are byte-identical landing pages → `bodyHash(a) === bodyHash(b)` | YES |
| Jaccard ≥ 0.9 | Both bodies identical → 1.0 | YES |
| Title-token presence = 0 | Titles are `"M&A 시장 동향"`, `"세법 개정 영향"` etc.; body says `"법무법인 태평양은 1980년에 설립된..."`. `시장`, `동향`, `세법`, `개정` etc. are NOT in the boilerplate body. Both items → 0 tokens present (and `>0` total tokens). | YES |
| Body length < 100 | Landing page is ~2000 chars (firm boilerplate) — not under threshold | NO (correctly — this is `detail-identical`, not `detail-empty`) |

**Result:** Status = `detail-identical`, evidence = `"detail-identical (exact-hash, jaccard=1.00, title-tokens 0/2 & 0/2)"`. Remediation default = `enable-js-render-detail` (since tier=html). Target Phase = Phase 7.

This is exactly what AUDIT.md should show for bkl after Phase 6 runs against the current firms.yaml.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The current `enabled: true` count is 12 firms (3 RSS + 6 HTML + 4 JS-render). [VERIFIED via grep of config/firms.yaml: actual is **2 RSS + 6 HTML + 4 JS-render = 12 enabled**, with cooley `enabled: false`. CONTEXT.md D-04 says "2 RSS (clifford-chance, freshfields)"; this matches.] | Scope coverage table | Low — just count discrepancy in this doc; Phase 6 plan should re-grep at execution time |
| A2 | Snapshot test against `06-AUDIT.md` output is feasible despite content varying with firm runtime state. [ASSUMED] — The writer test uses synthetic AuditReport objects, not live audit runs. The audit-end-to-end test would NOT use a snapshot of the live output (because firm state changes day-to-day); only the writer's pure-function rendering of a fixed input is snapshot-tested. | Test Strategy → Integration tests | Medium — if implementer attempts to snapshot live audit output it will be flaky; plan must clearly distinguish writer test (pure, snapshottable) from end-to-end smoke (manual verification) |
| A3 | `decodeCharsetAwareFetch` and `extractBody` will Just Work on detail pages of all 6 HTML-tier firms. [ASSUMED] — These are production functions used in `enrichBody.ts`; they should work the same way called from audit. But a firm with selectors that fail extractBody's generic chain might return very short bodies (<100 chars), tripping `detail-empty` even when the page has real content. | Pattern 2 / Don't Hand-Roll | Medium — would manifest as false-positive `detail-empty` status. Plan should anticipate by either (a) per-firm body selector override flow already exists in `extractBody`, or (b) audit can document "extraction worked but body too short" in evidence to disambiguate |
| A4 | Writing AUDIT.md inside the audit code (hardcoded path `.planning/phases/06-firm-audit-probe/06-AUDIT.md`) is acceptable; Phase 11 cron-gate workflow expects this exact path. [VERIFIED via CONTEXT.md "Integration Points"] | Architecture diagram | Low — path is locked by D-09; Phase 11 GHA workflow will reference same constant |
| A5 | Korean Hangul whitespace tokenization is sufficient for jaccard signal (no need for morpheme analyzer like mecab-ko). [ASSUMED] — Phase 2 D-P2-07 made the same call for keyword filtering and it has shipped without complaint. The bkl-class bug (literally identical bodies) has jaccard ~1.0 regardless of tokenizer; no signal precision is gained from morpheme analysis. | Pattern 3 Signal 2 | Low — only false-negative would be "two genuinely different articles that share >90% whitespace tokens" which is structurally impossible for real legal articles with different topics |
| A6 | `git rev-parse HEAD` is available at audit runtime to embed `firmAudit.ts` version in metadata footer. [ASSUMED] — Local dev: yes (in repo). GHA: yes (`actions/checkout` provides full git context by default). Detached worktree edge case: would fail. Acceptable to fall back to `'unknown'` string and not block audit. | D-09 metadata | Very low — cosmetic only |
| A7 | Phase 6 should NOT modify production scrapers (`rss.ts`, `html.ts`, `jsRender.ts`) even if the audit reveals scraper bugs. The audit *measures*; remediation lands in Phase 7. [VERIFIED via CONTEXT.md `<domain>` "Phase 6은 진단(diagnosis)만 한다"] | Phase boundary | Low — explicitly locked in CONTEXT.md |

## Open Questions (RESOLVED)

1. **Should `--include-disabled` rows participate in the exit-code calculation?**
   - What we know: D-05 says disabled rows get `(disabled, baseline)` tag in AUDIT.md. D-03 says exit 1 if "any non-OK firm".
   - What's unclear: If cooley is included (--include-disabled) and shows `list-fail` (CF-block as expected), does that fail the audit's exit code? The PRE-baseline run for Phase 9 SHOULD show this as expected baseline (not a regression).
   - **RESOLVED:** Disabled firms do NOT affect exit code. Their rows are informational-only. Implementation: filter to `enabled: true` rows when computing `nonOk.length`. This makes the audit's exit code consistently reflect "enabled production firms broken" — the actionable signal. (Implemented in Plan 06-05 CLI exit-code computation.)

2. **Should the audit run robots.txt checks for `--include-disabled` firms?**
   - What we know: Established pattern says yes (politeness applies even when probing).
   - What's unclear: cooley's robots may explicitly disallow the bot; running anyway might be impolite.
   - **RESOLVED:** Always run robots check. If disallowed, audit row says `list-fail` with reason "robots.txt disallows" — useful baseline. (Implemented in Plan 06-04 orchestrator robots gate, applied uniformly to enabled and disabled firms.)

3. **What's the expected runtime budget for `pnpm audit:firms`?**
   - What we know: Phase 4 budget is 3 minutes for full pipeline (with email send); audit has fewer steps but more detail fetches per firm.
   - What's unclear: 12 firms × (1 list + 2 detail) × ~2-5s each + Playwright startup = ~60-180s estimated.
   - **RESOLVED:** No hard budget; document expected ~2 min in evidence; if Phase 11 GHA gate runs it, ensure step has 5-min timeout. (Documented in Plan 06-05 human-verify checkpoint; Phase 11 owns the GHA timeout.)

4. **Should `firmAudit.ts` write a sentinel file or marker that Phase 11 GHA workflow reads?**
   - What we know: D-03 says exit 1 on non-OK; that's the primary signal.
   - What's unclear: Should the workflow also commit AUDIT.md to git or just leave it on disk?
   - **RESOLVED:** Out of scope for Phase 6. AUDIT.md path is fixed; Phase 11 decides workflow integration (commit-via-`git-auto-commit-action` vs. PR comment vs. step-summary include).

5. **What's the policy when `--include-disabled` is passed but no disabled firms exist?**
   - What we know: Currently 1 disabled firm (cooley); after Phase 9 may be 0.
   - **RESOLVED:** Silently no-op; flag does nothing additional. No special error. (Implicit in Plan 06-04 — when loadFirms returns 0 disabled rows, the orchestrator iterates an empty list with no warning.)

## Environment Availability

> Phase 6 depends on Node 22 + tooling already installed for prior phases. No new system deps.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | Runtime | ✓ | 22.x [VERIFIED via `package.json` `@types/node: ^22`] | — |
| pnpm 9 | Script invocation | ✓ | 9.15.0 [VERIFIED: `package.json#packageManager`] | — |
| Playwright chromium binary | JS-render detail probes | ✓ in dev / GHA | Cached via `actions/cache@v4` (Phase 4 plan 05) | `--include-disabled` does not require browser if 0 js-render firms enabled — short-circuit launch |
| `tsx` | Run TypeScript directly | ✓ | 4.21.x [VERIFIED: `package.json`] | — |
| `vitest` | Unit/snapshot tests | ✓ | 4.1.4 [VERIFIED: `package.json`] | — |
| `git` (for metadata commit hash) | Audit metadata footer (D-09) | ✓ assumed | — | Fall back to `'unknown'` string if `git rev-parse HEAD` fails |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

These directives from `./CLAUDE.md` apply to Phase 6 plans:

- **Budget $0/month** — Phase 6 makes ZERO Gemini API calls (audit is diagnostic-only); ZERO email sends; ZERO third-party API calls beyond direct firm-website fetches that production already does. ✓ inherent compliance.
- **Node 22 LTS, TypeScript via `tsx`, pnpm 9.15.0** — All locked; Phase 6 adds no new toolchain. ✓
- **Stack lock: `@google/genai`, `cheerio` 1.2, `playwright` 1.58, `nodemailer`, `zod` 4** — Phase 6 reuses existing deps. ✓
- **`@google/generative-ai` is FORBIDDEN** (deprecated) — Phase 6 does not import any Gemini SDK. ✓
- **Honest User-Agent + robots.txt** — Audit MUST reuse `USER_AGENT` from `src/util/logging.ts` and call `fetchRobots`/`isAllowed` before every fetch. Plan tasks must include this gate.
- **Secrets never in repo, only via GHA Secrets** — Audit needs no secrets. ✓
- **GSD Workflow Enforcement** — All Phase 6 file changes go through plans, no direct edits. (Phase 6 is being planned now via this research.)

## Sources

### Primary (HIGH confidence)
- **CONTEXT.md** (`.planning/phases/06-firm-audit-probe/06-CONTEXT.md`) — All locked decisions D-01 to D-11
- **REQUIREMENTS.md** §AUDIT (`.planning/REQUIREMENTS.md` lines 85-88) — AUDIT-01..04 verbatim
- **ROADMAP.md** Phase 6 section (`.planning/ROADMAP.md` lines 124-133) — Success criteria SC-1..4
- **v1.0 data-quality audit** (`.planning/backlog/v1.0-data-quality-audit.md`) — Source incident, bkl/kim-chang/shin-kim/logos/skadden symptoms
- **Existing source files (read in full):**
  - `scripts/detail-page-audit.ts` (lines 1-48) — Port source
  - `scripts/probe-js-render.ts` (lines 1-153) — Playwright pattern reference
  - `src/cli/checkFirm.ts` (lines 1-113) — CLI / Reporter pattern
  - `src/scrapers/util.ts` (lines 1-489) — `decodeCharsetAwareFetch`, `extractBody`, `parseListItemsFromHtml`
  - `src/scrapers/{rss,html,jsRender}.ts` — Tier scrapers reused as-is
  - `src/config/loader.ts` (lines 1-53) — Loader extension target
  - `src/pipeline/fetch.ts` (lines 1-145) — `Promise.allSettled` pattern source
  - `src/pipeline/run.ts` (lines 1-326) — Phase 4 D-05 chromium lifecycle
  - `src/types.ts` (lines 1-134) — `FirmConfig` / `RawItem` shapes
  - `config/firms.yaml` (lines 1-226) — Live firm distribution
- **Phase 2/3/4 CONTEXT.md** — Established patterns (Promise.allSettled isolation; CLI Reporter; shared chromium)
- **`package.json`** — Locked dep versions

### Secondary (MEDIUM confidence)
- `npm view cheerio version` → 1.2.0 [VERIFIED 2026-04-19]
- `npm view playwright version` → 1.59.1 [VERIFIED 2026-04-19]
- `npm view zod version` → 4.3.6 [VERIFIED 2026-04-19]
- Context7 `/microsoft/playwright` library — confirmed current versions match training-knowledge expectations [VERIFIED via `npx ctx7 library`]

### Tertiary (LOW confidence)
- None. All claims either verified against shipped source or cited from CONTEXT/REQUIREMENTS/ROADMAP.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already shipped, versions verified against npm registry
- Architecture: HIGH — Phase 6 is composition of existing patterns (Phases 1-4 patterns explicitly reused)
- Pitfalls: HIGH — derived from concrete prior-phase regressions (Phase 1 plan 09 self-grep gate, Phase 4 D-14 detail wait pattern, Phase 2 D-P2-03 isolation)
- Signal algorithms: MEDIUM-HIGH — token regex verified against Korean+English mixed content; jaccard implementation is textbook math; only ASSUMED claim is morpheme-analyzer-not-needed (A5)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — stable domain; recheck if package versions or Phase 4 chromium pattern changes)
