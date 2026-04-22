# Phase 7: SPA-Aware Detail Tier - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 4 production files + 1 schema test file + 4 YAML firm blocks
**Analogs found:** 4 / 4 (all modifications have in-repo precedent from Phases 1/2/4/6)

Phase 7 is a **surgical retrofit of three production files** — no new modules, no new scrapers, no new CLI entry points. The task is to (a) add a zod field, (b) flip one branch in `enrichBody.ts` from `type`-gated to `detail_tier`-gated, (c) extend one boolean in `run.ts`, and (d) edit `config/firms.yaml` (6 firms add `detail_tier: js-render`, 4 firms get selector repairs). Every pattern needed already lives in the codebase.

## File Classification

| File (modify) | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/config/schema.ts` | schema (zod validation) | config-load validation | `FirmSchema` lines 52-122 (Phase 1 CONF-02 + Phase 4 superRefine) | **exact (self-extension)** |
| `src/pipeline/enrichBody.ts` | pipeline stage (detail fetch) | per-item request-response with Playwright fallback | `src/pipeline/enrichBody.ts` lines 120-151 (Phase 4 D-04) + `src/audit/firmAudit.ts#probeJsRenderFirm` lines 161-201 (Phase 6 Playwright detail-fetch pattern) | **exact (branch replacement)** |
| `src/pipeline/run.ts` | composition root | one-line predicate expansion | `src/pipeline/run.ts` line 157 (`hasJsRender` computation) | **exact (self-extension)** |
| `config/firms.yaml` | YAML config data | declarative per-firm config | `lee-ko`, `yoon-yang` blocks (Phase 4 `type: js-render` firms, lines 167-196) | **exact (add one field)** |
| `test/config/schema.test.ts` | test (schema validation) | schema-under-test assertions | `FirmSchema (Phase 4 js-render extensions)` describe block lines 118-195 | **exact (add describe block)** |

## Pattern Assignments

### `src/config/schema.ts` (schema, config-load validation)

**Analog:** Self — extend existing `FirmSchema` per Phase 1 CONF-02 + Phase 4 superRefine pattern.

**Where to add** (in FirmSchema object literal, after line 101 `exclude_keywords`, before `.strict()` at line 103):

**Pattern to follow — optional-with-default fields already present** (lines 65, 99-101):
```typescript
enabled: z.boolean().default(true),
// ...
timeout_ms: z.number().int().positive().default(20000),
include_keywords: z.array(z.string()).optional().default([]),
exclude_keywords: z.array(z.string()).optional().default([]),
```

**Target shape** per D-03 (add as sibling of above):
```typescript
// NEW — Phase 7 DETAIL-01/05. Controls the detail-fetch path independently
// of `type` (which governs list-page fetch). 'js-render' makes enrichBody
// ALWAYS route detail fetches through Playwright (D-07 — no static attempt).
// Defaults to 'static' so unmodified firms keep exact Phase 6 semantics
// (DETAIL-03 backwards-compat literal).
detail_tier: z.enum(['js-render', 'static']).default('static').optional(),
```

**Strict-mode propagation is automatic** (line 103 `.strict()`):
```typescript
  })
  .strict()           // <-- already rejects unknown top-level keys like `detail_tierr`
  .superRefine((firm, ctx) => {
```

**DETAIL-05 zod error message is automatic** — `.strict()` + `z.enum([...])` produces a path-qualified error of the shape `firms[N].detail_tier: Invalid enum value. Expected 'js-render' | 'static', received 'invalid-value'`. **No manual error construction needed** — copy the Phase 4 superRefine style only if a cross-field rule emerges (none expected for detail_tier per D-05 decisions: `type` and `detail_tier` are orthogonal).

**FirmConfig type must also be extended** — `src/types.ts` line 43-65 has the hand-written `FirmConfig` interface:
```typescript
export interface FirmConfig {
  id: string;
  // ...
  wait_for?: string;
  // <- ADD HERE:
  detail_tier?: 'js-render' | 'static';
  selectors?: { ... };
```
This is the same hand-maintained shadow of the zod schema (see existing `wait_for?: string` at line 51 — a sibling optional field that mirrors the zod definition).

---

### `src/pipeline/enrichBody.ts` (pipeline stage, per-item detail fetch)

**Analog A:** Self — the existing Phase 4 D-04 branch at lines 120-151 shows the exact Playwright fetch shape (`newContext → newPage → goto → content → extractBody`).

**Analog B:** `src/audit/firmAudit.ts` lines 178-195 — Phase 6 detail-probe loop uses the SAME pattern (per-item context → goto domcontentloaded → page.content() → extractBody). Phase 7's detail-fetch and Phase 6's audit-probe must stay semantically identical so audit predictions match production behavior (D-11 verification contract).

**Imports pattern** (lines 64-68 — already has everything needed):
```typescript
import pLimit from 'p-limit';
import type { Browser } from 'playwright';
import { decodeCharsetAwareFetch, extractBody } from '../scrapers/util.js';
import { USER_AGENT } from '../util/logging.js';
import type { FirmResult } from '../types.js';
```
**No new imports required** — the Playwright branch to be written uses only already-imported symbols.

**Current branch to REMOVE** (lines 110-161 — the entire `try { ... } catch { ... }` block wrapping the static-first + type-gated-Playwright-fallback logic):
```typescript
// Static first — existing logic unchanged (keeps Phase 2 semantics for rss/html).
try {
  const { html } = await decodeCharsetAwareFetch(item.url, {
    timeoutMs: r.firm.timeout_ms ?? 20_000,
  });
  const staticBody = extractBody(html, r.firm.selectors?.body);

  // D-04 Playwright fallback for js-render firms. Conditions:
  //   - firm.type must be 'js-render' (rss/html ignore this branch)
  //   - static body under threshold (signal too weak)
  //   - browser must be available (runPipeline only launches when hasJsRender)
  if (
    r.firm.type === 'js-render' &&
    staticBody.length < STATIC_BODY_MIN_CHARS &&
    browser
  ) {
    try {
      const ctx = await browser.newContext({ userAgent: USER_AGENT });
      try {
        const page = await ctx.newPage();
        await page.goto(item.url, {
          timeout: DETAIL_PAGE_TIMEOUT_MS,
          waitUntil: 'domcontentloaded',
        });
        const hydratedHtml = await page.content();
        const hydratedBody = extractBody(
          hydratedHtml,
          r.firm.selectors?.body,
        );
        if (hydratedBody.length > staticBody.length) {
          return { ...item, description: hydratedBody };
        }
      } finally {
        await ctx.close();
      }
    } catch { /* per-item isolation */ }
  }

  if (staticBody && staticBody.length > 0) {
    return { ...item, description: staticBody };
  }
  return item;
} catch { /* per-item isolation */ return item; }
```

**Replacement shape** per D-05 + D-07 + D-08 + D-09:
```typescript
// D-07: detail_tier === 'js-render' → Playwright ONLY, no static attempt.
// The static path is SKIPPED entirely (the `type`-gated threshold-based
// fallback cannot see bkl's "long-but-identical" landing HTML, so we can't
// reuse it). Browser presence is guaranteed by run.ts hasJsRender check (D-06).
if (r.firm.detail_tier === 'js-render' && browser) {
  try {
    const ctx = await browser.newContext({ userAgent: USER_AGENT });
    try {
      const page = await ctx.newPage();
      await page.goto(item.url, {
        timeout: DETAIL_PAGE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      const hydratedHtml = await page.content();
      const hydratedBody = extractBody(
        hydratedHtml,
        r.firm.selectors?.body,
      );
      if (hydratedBody && hydratedBody.length > 0) {
        return { ...item, description: hydratedBody };
      }
      return item;
    } finally {
      await ctx.close();
    }
  } catch {
    // Per-item isolation (D-P2-03 mirror) — one failed Playwright detail fetch
    // does not poison sibling items. Leave description unchanged.
    return item;
  }
}

// detail_tier === 'static' (or unset, defaulted by zod) → existing static path.
try {
  const { html } = await decodeCharsetAwareFetch(item.url, {
    timeoutMs: r.firm.timeout_ms ?? 20_000,
  });
  const staticBody = extractBody(html, r.firm.selectors?.body);
  if (staticBody && staticBody.length > 0) {
    return { ...item, description: staticBody };
  }
  return item;
} catch {
  return item;
}
```

**Constants to retain** (lines 70-72):
```typescript
const INTER_FETCH_DELAY_MS = 500;
const STATIC_BODY_MIN_CHARS = 200; // D-04 / Research §10 threshold
const DETAIL_PAGE_TIMEOUT_MS = 15_000; // D-14
```
`STATIC_BODY_MIN_CHARS` may become unused after the branch replacement — **delete it if unused** to avoid dead code (`eslint no-unused-vars`).

**Per-firm isolation + 500ms politeness gate MUST remain** (lines 98-108 — above the replaced branch, unchanged):
```typescript
const perFirm = pLimit(1); // sequential within firm (D-P2-10)

const enrichedRaw = await Promise.all(
  r.raw.map((item, idx) =>
    perFirm(async () => {
      // Min-delay gate: first item no wait; items 2+ wait INTER_FETCH_DELAY_MS.
      if (idx > 0) {
        await new Promise((res) =>
          setTimeout(res, INTER_FETCH_DELAY_MS),
        );
      }
      /* ... replaced branch goes here ... */
    }),
  ),
);
```

**Cross-firm isolation + upstream pass-through** (lines 92-96, unchanged):
```typescript
return Promise.all(
  results.map(async (r) => {
    if (r.error) return r;        // pass-through failed firms
    if (r.raw.length === 0) return r;
    // ...
```

**Header comment update required** — lines 35-53 describe the Phase 4 D-04 fallback semantics (`triggered when static extractBody returns fewer than 200 chars`). After the branch flip, these become stale. Rewrite to describe the new D-05/D-07 semantics: "gated on `firm.detail_tier === 'js-render'`, skips static fetch entirely."

---

### `src/pipeline/run.ts` (composition root, one-line predicate)

**Analog:** Self — line 157 `hasJsRender` computation.

**Current** (lines 154-161):
```typescript
// D-05 / Phase 4 RESEARCH §4 — launch ONE chromium per run, shared across
// all js-render firms. Short-circuit when no firm needs it (§8) — saves
// ~1.2s on days when all js-render firms are disabled.
const hasJsRender = firms.some((f) => f.type === 'js-render');
let browser: Browser | undefined;
if (hasJsRender) {
  browser = await chromium.launch({ headless: true });
}
```

**Target per D-06** — expand the predicate only:
```typescript
// D-05 / Phase 4 RESEARCH §4 — launch ONE chromium per run, shared across
// all js-render firms. Phase 7 DETAIL-02 extension: an html-tier firm with
// detail_tier='js-render' (bkl, kim-chang) also requires the browser for
// per-item detail fetches in enrichBody.ts, so include them in the gate.
const hasJsRender = firms.some(
  (f) => f.type === 'js-render' || f.detail_tier === 'js-render',
);
let browser: Browser | undefined;
if (hasJsRender) {
  browser = await chromium.launch({ headless: true });
}
```

**Lifecycle MUST NOT be touched** — the `try { ... } finally { if (browser) await browser.close(); }` pattern at lines 163-324 is Phase 1 locked composition-root order. Phase 7 extends only the **launch condition**, not the launch/close lifecycle nor ordering.

**Pattern reuse (do not re-implement):** `src/audit/firmAudit.ts` line 210 already uses the exact same `hasJsRender = firms.some(f => f.type === 'js-render')` pattern — Phase 7 changes do **not** require modifying firmAudit.ts because the audit probe runs list+detail through Playwright per-tier (so its browser launch is already correctly triggered by `type: js-render` for the audit's own scope). Phase 7 `detail_tier` is a PRODUCTION-PATH field; the audit probe reads `type` for tier dispatch and always fetches N=2 details regardless.

---

### `config/firms.yaml` (YAML config data, per-firm)

**Analog:** `lee-ko` block (lines 167-180) + `yoon-yang` block (lines 182-196) — the Phase 4 `type: js-render` shape with a `selectors` sub-block. Phase 7 adds **one line** (`detail_tier: 'js-render'`) to 6 firms and **re-tunes selector strings** for 4 firms.

**Pattern A: add `detail_tier: 'js-render'` to 6 firms** (D-04):

Insertion point — **between** `enabled:` and `selectors:` (matches Phase 4 ordering convention where tier-routing fields cluster above `selectors:`). Example applied to `bkl`:

Current (lines 152-164):
```yaml
  - id: bkl
    name: 태평양
    language: ko
    type: html
    url: https://www.bkl.co.kr/law/insight/informationList.do?lang=ko
    timezone: Asia/Seoul
    enabled: true
    selectors:
      list_item: "ul li.info-item, ul li"
      title: ".info-title, .title"
      link_onclick_regex: "goView\\('(\\d+)'\\)"
      link_template: "/law/insight/informationView.do?infoNo={1}&lang=ko"
      date: ".info-date, .date"
```

Target:
```yaml
  - id: bkl
    name: 태평양
    language: ko
    type: html
    url: https://www.bkl.co.kr/law/insight/informationList.do?lang=ko
    timezone: Asia/Seoul
    enabled: true
    detail_tier: 'js-render'  # Phase 7 — list is static HTML, detail is SPA (v1.0 UAT hallucination)
    selectors:
      list_item: "ul li.info-item, ul li"
      title: ".info-title, .title"
      link_onclick_regex: "goView\\('(\\d+)'\\)"
      link_template: "/law/insight/informationView.do?infoNo={1}&lang=ko"
      date: ".info-date, .date"
```

**Apply to six firms** (D-04 list):
- `bkl` (line ~152) — new remediation: `detail-identical` → `OK` after flip
- `kim-chang` (line ~138) — new remediation + possible root-cause investigation (D-10)
- `lee-ko` (line ~167) — migration: existing `type: js-render` firm, make detail_tier explicit
- `yoon-yang` (line ~182) — migration
- `barun` (line ~199) — migration
- `latham` (line ~214) — migration

**Pattern B: YAML header block explanation** — the existing comment block at lines 1-46 explains every field. Add a stanza describing `detail_tier` matching the prose style of existing entries at lines 13-17:
```yaml
#   detail_tier : detail 페이지 fetch 방식.
#                 - 생략 시 기본값 'static' (Phase 1-6 behavior)
#                 - 'js-render' 시 enrichBody 가 Playwright 로 detail 페이지를 가져옵니다.
#                   list 페이지는 static HTML 인데 detail 페이지만 SPA 인 경우(bkl, kim-chang).
#                 - type: js-render 인 firm 도 명시적으로 선언 권장 (Phase 7 migration).
```
(D-04 / CONF-07 non-developer editability.)

**Pattern C: selector repairs for 4 firms** (D-11 selector-fix scope):
- `logos` (line ~102): current `list_item: ".board-box .list tr"` returns 0 items per 06-AUDIT.md. Iterate via `pnpm check:firm logos` on live HTML.
- `skadden` (line ~124): current `list_item: ".views-row"` returns 0 items per 06-AUDIT.md. Iterate via `pnpm check:firm skadden`.
- `lee-ko` (line ~167): detail body 36/32 chars per 06-AUDIT.md. Consider adding `selectors.body` override (existing precedent: `shin-kim` line 87 uses `body: ".post-content"`).
- `barun` (line ~199): detail body 0/0 chars per 06-AUDIT.md. May need both `list_item` tune AND `selectors.body` override.

**Selector workflow:** `pnpm check:firm <id>` (Reporter-backed) → inspect extractor output → adjust YAML → re-run `pnpm audit:firms` → verify 06-AUDIT.md row flips to `OK`. This is the established Phase 6 iteration loop.

---

### `test/config/schema.test.ts` (test, schema validation assertions)

**Analog:** `describe('FirmSchema (Phase 4 js-render extensions)', ...)` block at lines 118-195.

**Pattern** — add a new `describe` block mirroring the Phase 4 structure:
```typescript
describe('FirmSchema (Phase 7 detail_tier extension)', () => {
  const htmlBase = {
    id: 'test-html-firm',
    name: 'Test HTML Firm',
    language: 'ko' as const,
    type: 'html' as const,
    url: 'https://example.com/news',
    timezone: 'Asia/Seoul',
    enabled: true,
    selectors: { list_item: 'li', title: '.t', link: 'a' },
  };

  it('accepts detail_tier: "js-render" on an html firm', () => {
    const r = FirmSchema.safeParse({ ...htmlBase, detail_tier: 'js-render' });
    expect(r.success).toBe(true);
  });

  it('accepts detail_tier: "static" on any tier', () => {
    const r = FirmSchema.safeParse({ ...htmlBase, detail_tier: 'static' });
    expect(r.success).toBe(true);
  });

  it('defaults detail_tier to "static" when omitted', () => {
    const r = FirmSchema.safeParse(htmlBase);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.detail_tier).toBe('static');
  });

  it('rejects detail_tier: "invalid-value" with path-qualified zod error (DETAIL-05)', () => {
    const r = FirmSchema.safeParse({ ...htmlBase, detail_tier: 'invalid-value' });
    expect(r.success).toBe(false);
    // DETAIL-05 literal — error must mention the invalid value AND the field path.
    expect(JSON.stringify(r.error?.issues)).toContain('detail_tier');
  });
});
```

This mirrors `rejects js-render firm with no wait_for field` (lines 138-145) pattern: `safeParse → success false → stringify issues → toContain field name`.

## Shared Patterns

### Per-item isolation (try/catch inside `Promise.all` map)
**Source:** `src/pipeline/enrichBody.ts` lines 100-169 (pattern) + `src/scrapers/util.ts#parseListItemsFromHtml` lines 419-454 (per-row pattern).
**Apply to:** The new Playwright branch in `enrichBody.ts` — one failed Playwright detail fetch must NOT tank sibling items of the same firm, and must NOT bubble up as `FirmResult.error` (which is reserved for list-page failures per Phase 2 D-P2-03).

Established idiom — **outer try swallows, inner finally always closes browser context**:
```typescript
try {
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const page = await ctx.newPage();
    await page.goto(item.url, { timeout: DETAIL_PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    // ...
  } finally {
    await ctx.close();   // always close — prevents zombie contexts on throw
  }
} catch {
  // per-item isolation — no rethrow
  return item;
}
```

### Shared chromium + per-item BrowserContext
**Source:** `src/pipeline/run.ts` lines 157-161 (launch) + `src/pipeline/enrichBody.ts` lines 126-144 (per-item context) + `src/audit/firmAudit.ts` lines 176-200 (per-firm context + per-item page).
**Apply to:** The new enrichBody branch. **Do not** launch a new browser — use the injected `browser?: Browser` parameter.

Contract:
- `browser` is injected, never a module singleton.
- `browser.newContext({ userAgent: USER_AGENT })` per item (current enrichBody pattern; audit uses per-firm — enrichBody's per-item choice is deliberate for cookie/session isolation, D-09).
- `context.close()` in `finally` — matches Phase 4 D-05 pattern, prevents leaked contexts on Playwright TimeoutError.
- `browser.close()` is owned exclusively by `run.ts` outer finally (line 321-323). **enrichBody must NEVER call browser.close()**.

### zod `.strict()` + optional-with-default + path-qualified errors
**Source:** `src/config/schema.ts` lines 52-103.
**Apply to:** The new `detail_tier` field. `.strict()` at line 103 is inherited — no additional declaration needed. `z.enum([...]).default('static').optional()` produces path-qualified errors automatically (DETAIL-05 free).

Established idiom for enum field with default:
```typescript
detail_tier: z.enum(['js-render', 'static']).default('static').optional(),
```
(Mirrors `type: z.enum(['rss', 'html', 'js-render'])` at line 60, minus `.default()` because `type` is required.)

### Playwright goto + content pattern
**Source:** `src/scrapers/jsRender.ts` lines 77-90 (list-page) + `src/audit/firmAudit.ts` lines 180-188 (detail-page).
**Apply to:** The new enrichBody detail-fetch branch.

The detail-page variant (matches firmAudit probeJsRenderFirm, NOT jsRender.ts's list-page variant — detail pages must **not** `waitForSelector(firm.wait_for)` because `wait_for` is a list-page-only selector):
```typescript
const page = await ctx.newPage();
await page.goto(item.url, {
  timeout: DETAIL_PAGE_TIMEOUT_MS,
  waitUntil: 'domcontentloaded',
});
const hydratedHtml = await page.content();
const hydratedBody = extractBody(hydratedHtml, r.firm.selectors?.body);
```

### Body extraction (selector chain + fallback)
**Source:** `src/scrapers/util.ts#extractBody` lines 241-294.
**Apply to:** Both the new Playwright branch AND the retained static branch. Single source of truth (D-08). The per-firm override at `firm.selectors?.body` lets lee-ko / barun tighten extraction without touching code.

### YAML `type: js-render` firm block shape
**Source:** `config/firms.yaml` lines 167-196 (lee-ko, yoon-yang) — the canonical Phase 4 shape.
**Apply to:** The 4 existing js-render firms getting `detail_tier:` added, plus the ordering convention (`enabled:` → new `detail_tier:` → `selectors:`).

### YAML comment convention (Korean, non-developer-facing)
**Source:** `config/firms.yaml` lines 1-46 (header block) + inline comment at line 55 (`enabled: false  # disabled 2026-04-19 — cooleygo.com /feed/ CF-blocked ...`).
**Apply to:** The `detail_tier:` explanation stanza in the header AND any inline comment on the new field (e.g., bkl: `# v1.0 UAT hallucination incident`, kim-chang: `# WAF-blocked, see Phase 7 investigation note` if disabled per D-10 fallback).

### Audit report as verification source
**Source:** `src/audit/firmAudit.ts` + `.planning/phases/06-firm-audit-probe/06-AUDIT.md`.
**Apply to:** Every Phase 7 Success Criterion (D-11). Planner MUST NOT invent new verification commands — every SC reads the `Status` column of the generated report. Commands: `pnpm audit:firms` (full regression), `pnpm check:firm <id>` (iteration on single firm during selector fix).

## No Analog Found

**None.** Every modification in Phase 7 has a direct in-repo precedent:

| Target | Precedent |
|--------|-----------|
| zod enum field with default | `type: z.enum(...)` at schema.ts:60 |
| zod schema test with `toContain` assertion | Phase 4 js-render extensions block at schema.test.ts:118-195 |
| Playwright detail fetch with per-item context | enrichBody.ts:125-144 (current Phase 4 D-04 branch) |
| Body selector chain + firm-override | util.ts#extractBody:241-294 |
| `hasJsRender` predicate expansion | run.ts:157 self-extension |
| Add field to existing YAML firm block | Phase 4 added `wait_for:` to lee-ko/yoon-yang/latham/barun |
| Selector string tune based on live probe | Phase 2 shin-kim/yulchon/skadden selector iteration |
| Verification via `pnpm audit:firms` | Phase 6 promoted this tool as single source of truth |

The only "unknown" in Phase 7 is kim-chang's root-cause analysis (D-10) — but even that has precedent: Phase 4's `scripts/probe-js-render.ts` is the established tool for single-firm Playwright debugging.

## Metadata

**Analog search scope:**
- `src/config/` (schema, loader, types)
- `src/pipeline/` (run, enrichBody, fetch, filter, dedup)
- `src/scrapers/` (rss, html, jsRender, util)
- `src/audit/` (firmAudit — Phase 6 verification source)
- `src/cli/` (checkFirm, auditFirms)
- `test/config/` (schema.test for test pattern)
- `config/firms.yaml` (YAML shape + comment convention)
- `.planning/phases/04-js-rendered-tier-conditional/` (shared chromium pattern)
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` (verification input)

**Files read (non-overlapping ranges):**
- `src/pipeline/enrichBody.ts` (full, 176 lines)
- `src/pipeline/run.ts` (full, 326 lines)
- `src/config/schema.ts` (full, 144 lines)
- `src/scrapers/jsRender.ts` (full, 127 lines)
- `src/scrapers/util.ts` (full, 490 lines)
- `config/firms.yaml` (full, 226 lines)
- `src/audit/firmAudit.ts` (lines 1-250 of 293)
- `src/cli/checkFirm.ts` (lines 1-60 of ~100)
- `src/config/loader.ts` (full, 63 lines)
- `src/types.ts` (lines 40-95 targeted)
- `test/config/schema.test.ts` (lines 115-195 targeted)
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` (lines 1-80)

**Pattern extraction date:** 2026-04-19
