---
phase: 01-foundation-vertical-slice
plan: 03
subsystem: core
tags: [types, env, logging, schema, loader, zod, yaml, foundation]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: pnpm skeleton + pinned deps (plan 01-01)
  - phase: 01-foundation-vertical-slice
    provides: config/firms.yaml seeded with Cooley RSS (plan 01-02)
provides:
  - "src/types.ts: authoritative typed contracts (FirmConfig, RawItem, NewItem, SummarizedItem, FirmResult, RunReport, SeenState, RecipientConfig, EmailPayload)"
  - "src/env.ts: isDryRun() — single read site for process.env.DRY_RUN"
  - "src/util/logging.ts: scrubSecrets() helper + USER_AGENT constant"
  - "src/config/schema.ts: zod 4 schemas (FirmSchema, FirmsConfigSchema, RecipientSchema), all .strict()"
  - "src/config/loader.ts: loadFirms() + loadRecipient() with D-05 env override"
affects: [01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source-of-truth typed contracts — downstream modules never redeclare pipeline shapes, always import from src/types.ts"
    - "Single-read-site for DRY_RUN — src/env.ts isDryRun() is the only caller of process.env.DRY_RUN (Pattern 2 enforcement against env-check scatter)"
    - "Length-gated secret scrubbing — scrubSecrets skips env values <=8 chars to avoid false-positive substring replacement"
    - "zod .strict() everywhere — unknown YAML keys fail validation; typos surface at startup (CONF-02 fail-fast)"
    - "safeParse + format() for human-readable config errors — loadFirms prints result.error.format() tree to stderr so non-dev users see 'firms[0].timezone: Required' rather than a stack trace"
    - "Env-wins fallback — process.env.X ?? parsed.x pattern (D-05) for any value a deployer might override without a code commit"
    - "ESM NodeNext — all relative imports carry .js extension (required by moduleResolution: NodeNext)"

key-files:
  created:
    - src/types.ts
    - src/env.ts
    - src/util/logging.ts
    - src/config/schema.ts
    - src/config/loader.ts
  modified: []
  removed:
    - src/placeholder.ts

key-decisions:
  - "Removed src/placeholder.ts in the Task 1 commit (plan note directive): now that real src modules exist, the tsc-include shim from plan 01-01 is no longer needed and its continued presence would be a documented-stub lie in downstream SUMMARYs"
  - "scrubSecrets uses split+join (not regex replace) to avoid regex-escaping bugs if a secret ever contained regex metacharacters; split+join treats the needle literally"
  - "Length gate (val.length > 8) on secret scrubbing: a literal empty string or trivial test placeholder in env would otherwise match everywhere in output (''.split matches every boundary). Gate is generous enough that real Gemini / Gmail credentials (both >>8 chars) always pass"
  - "FirmSchema.type uses z.enum(['rss', 'html']) — 'js-render' is deliberately excluded per plan contract so Phase 4 extension requires a schema change, not just a config-file change (explicit contract surface)"
  - "loadFirms uses safeParse (not parse) so error.format() can be printed; loadRecipient uses parse because recipient errors are terminal and a raw ZodError stack is acceptable for a single-field schema"
  - "Hardcoded paths 'config/firms.yaml' and 'config/recipient.yaml' in loader — plan 01-11 orchestrator calls these with no args, and parameterizing would invite test-vs-prod drift"

requirements-completed:
  - CONF-02
  - CONF-03
  - DEDUP-07
  - COMP-01
  - COMP-05
  - OPS-10

# Metrics
duration: ~2 min
completed: 2026-04-17
---

# Phase 01 Plan 03: core type + config loader foundation Summary

**Typed pipeline contracts, DRY_RUN single-site helper, secret scrubber, and zod 4 YAML loader with D-05 env override — the contract layer every Wave 2 plan depends on.**

## Performance

- **Duration:** ~2 min (129 seconds wall-clock from plan start to final commit)
- **Started:** 2026-04-17T14:12:41Z
- **Completed:** 2026-04-17T14:14:50Z
- **Tasks:** 3
- **Files created:** 5
- **Files removed:** 1 (`src/placeholder.ts`, per plan note)
- **Commits:** 3 task commits

## Accomplishments

- Five foundation files land with a combined 204 LoC: `src/types.ts` (92), `src/env.ts` (1), `src/util/logging.ts` (26), `src/config/schema.ts` (49), `src/config/loader.ts` (36).
- `pnpm typecheck` and `pnpm test` both exit 0 after every task (vitest has no test files yet — `passWithNoTests: true` from plan 01-01 keeps it green).
- Smoke-verified end-to-end config loading against the real `config/firms.yaml` from plan 01-02: `loadFirms()` returns 1 enabled firm (`cooley`); `loadRecipient()` returns `sarakim1705@gmail.com` from YAML when `RECIPIENT_EMAIL` is unset, and returns `alt@example.com` when `RECIPIENT_EMAIL=alt@example.com` is set — confirming D-05 env-wins semantics.
- `src/placeholder.ts` removed in the Task 1 commit as instructed by the plan note ("delete src/placeholder.ts in the same or final commit so the codebase has no stub files").
- Plan verification invariants both hold:
  - `grep -r "DRY_RUN" src/ | wc -l` = **1** (only in `src/env.ts:1`) — Pattern 2 enforced
  - `export.*USER_AGENT` appears exactly **1** time (only in `src/util/logging.ts`) — single source of truth for FETCH-04
- zod version confirmed as **4.3.6** (package: `zod@^4.3.6` via pnpm-lock).

## Files Created

### src/types.ts (92 lines)

Authoritative contracts for the entire pipeline. Interfaces exported: `FirmConfig`, `RawItem`, `NewItem`, `SummarizedItem`, `FirmResult`, `RunReport`, `SeenState`, `RecipientConfig`, `EmailPayload`. Type aliases: `FirmType`, `Language`.

Type-level invariants enforced (compile-time guards, not runtime checks):

| Invariant | Enforcement |
|-----------|-------------|
| `SeenState.version === 1` (DEDUP-07) | Literal type `version: 1;` — any other value is a TS error at the construction site |
| `SummarizedItem.summary_ko` nullable (SUMM-04) | Type `string \| null` — summarizer must explicitly decide per item, no implicit empty string |
| `FirmConfig.timezone` required (CONF-05) | Non-optional field on the interface — firms.yaml missing timezone fails at parse time (zod) AND fails at every call site (tsc) |
| `RawItem.description` optional | Present for RSS bodies, undefined for HTML list items — summarizer conditional in plan 01-08 |
| `SummarizedItem` has **no** body field (COMP-05) | Interface extends `NewItem`, which only has title/url/publishedAt/description — body is never persisted |

### src/env.ts (1 line)

```typescript
export const isDryRun = (): boolean => process.env.DRY_RUN === '1';
```

Only exported function. Any additional code in this file invites DRY_RUN check scatter, which plan 01-11 / 01-09 / 01-10 would then have to lint against. Keeping this file minimal IS the pattern.

### src/util/logging.ts (26 lines)

Two exports:

- `USER_AGENT` = `'LegalNewsletterBot/1.0 (+https://github.com/Phantompal/legalnewsletter)'` — the single source of truth for FETCH-04 politeness. Plan 01-05 RSS fetcher imports from here.
- `scrubSecrets(input: string): string` — iterates `['GEMINI_API_KEY', 'GMAIL_APP_PASSWORD']`, and for each env var with `length > 8`, replaces all occurrences in `input` with `***REDACTED***` using literal split+join.

Design notes captured in file comments:

- `split+join` over regex.replace because a secret value could contain regex metacharacters; split+join treats the needle literally.
- Length gate (`> 8`) guards against false-positive replacement when an env var is accidentally set to a short / empty value (e.g. the literal string `"test"` during CI dry-runs).

### src/config/schema.ts (49 lines)

Three zod 4 schemas, all `.strict()` for unknown-key rejection:

- `FirmSchema` — 10 fields: `id` (`/^[a-z0-9-]+$/`), `name`, `language` (`ko|en`), `type` (`rss|html` only — js-render is Phase 4), `url` (valid URL), `timezone` (IANA `/^[A-Za-z_]+\/[A-Za-z_]+$/`), `enabled` (default true), `selectors?` (nested object), `user_agent?`, `timeout_ms` (default 20000).
- `FirmsConfigSchema` — `{ firms: z.array(FirmSchema).min(1) }`. Empty firms fails validation (CONF-01).
- `RecipientSchema` — `{ recipient: z.string().email() }`.

### src/config/loader.ts (36 lines)

- `loadRecipient(): Promise<string>` — reads `config/recipient.yaml`, parses via `yaml.parse`, validates via `RecipientSchema.parse`, returns `process.env.RECIPIENT_EMAIL ?? parsed.recipient` (D-05 env-wins). `ZodError` propagates — main.ts catches and scrubs.
- `loadFirms(): Promise<FirmConfig[]>` — reads `config/firms.yaml`, parses via `yaml.parse`, validates via `FirmsConfigSchema.safeParse`, prints `result.error.format()` tree to stderr on failure then throws `Error('Invalid firms.yaml')`. On success returns `result.data.firms.filter(f => f.enabled) as FirmConfig[]`.

Imports use NodeNext `.js` extensions: `from './schema.js'`, `from '../types.js'`.

## Task Commits

| Task | Hash | Message |
|------|------|---------|
| 1: types + env + logging (+ remove placeholder) | `aa48ae8` | feat(01-03): add src/types.ts + env.ts + logging.ts foundation |
| 2: zod 4 schemas | `15cc1e5` | feat(01-03): add zod 4 schemas for firms.yaml + recipient.yaml |
| 3: YAML loader with D-05 env override | `f8548d2` | feat(01-03): add src/config/loader.ts with D-05 env override |

## Decisions Made

Documented inline in the frontmatter `key-decisions` block. Summary:

1. **Removed `src/placeholder.ts`** in the Task 1 commit per the plan's explicit note — now that `src/types.ts` + `src/env.ts` + `src/util/logging.ts` exist, the tsc-include shim from plan 01-01 is no longer needed. Leaving it would be a documented-stub in future SUMMARYs.
2. **scrubSecrets uses split+join, not regex**, to avoid metacharacter-escape bugs.
3. **Length gate `> 8`** on scrubSecrets guards against false-positive replacement when an env var is accidentally empty / short.
4. **FirmSchema.type excludes 'js-render'** deliberately — Phase 4 extension requires an explicit schema change, not just a config-file change.
5. **safeParse for loadFirms, parse for loadRecipient** — recipient is a single-field terminal error (raw ZodError OK); firms config is multi-field and deserves the formatted error tree for non-dev users.
6. **Hardcoded paths in loader** — plan 01-11 orchestrator calls these with zero args; parameterizing would invite test-vs-prod drift.

## Deviations from Plan

**None of the Rule 1–3 deviation categories fired.** All code blocks came straight from the `<interfaces>` section in 01-03-PLAN.md; no bugs, no missing critical functionality, no blocking issues. The one delta worth flagging — removing `src/placeholder.ts` — was **explicitly directed by the plan's `<notes>` block** ("When you add real `src/*.ts` files here, delete `src/placeholder.ts` in the same or final commit"), so it is in-plan flow, not a deviation.

zod version: **4.3.6** — matches plan requirement (`zod@^4.3.6` in plan 01 package.json), NOT zod 3.

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `pnpm typecheck` passes cleanly after all three tasks land | PASS |
| `config/firms.yaml` from plan 02 loads successfully | PASS — smoke-tested, returns 1 enabled firm (cooley) |
| zod 4 is installed (not zod 3) | PASS — 4.3.6 via `node_modules/zod/package.json` |
| DRY_RUN predicate is the ONLY `process.env.DRY_RUN` read in the codebase | PASS — `grep -r "DRY_RUN" src/` returns exactly 1 line (src/env.ts:1). Will rise to 3 after plans 09 + 10 import isDryRun, as predicted. |
| `USER_AGENT` constant is exported exactly once | PASS — `export.*USER_AGENT` grep returns 1 match (src/util/logging.ts) |

## Smoke Tests (beyond acceptance grep)

```bash
# D-05 env override wins
RECIPIENT_EMAIL=alt@example.com pnpm tsx -e "import('./src/config/loader.js').then(m => m.loadRecipient().then(console.log))"
# → alt@example.com

# YAML fallback when env unset
pnpm tsx -e "import('./src/config/loader.js').then(m => m.loadRecipient().then(console.log))"
# → sarakim1705@gmail.com

# loadFirms parses real config/firms.yaml from plan 01-02
pnpm tsx -e "import('./src/config/loader.js').then(m => m.loadFirms().then(r => console.log('loaded', r.length, 'enabled firm(s):', r.map(f=>f.id).join(','))))"
# → loaded 1 enabled firm(s): cooley
```

All three smoke tests passed during execution.

## Known Stubs

**None.** The only stub previously in the tree (`src/placeholder.ts` from plan 01-01) was explicitly removed in the Task 1 commit per plan directive. No UI surfaces exist yet, and no hardcoded empty-data flows exist anywhere in the new files.

## Next Phase Readiness

All Wave 2 plans in Phase 01 (01-04 through 01-10) can now assume:

- `import { ... } from '../types.js'` (or `../../types.js`) resolves to the full contract set — no shape-guessing or inline type redeclaration needed anywhere downstream.
- `import { isDryRun } from '../env.js'` is the one-and-only DRY_RUN check site. Plan 01-09 (state writer) and plan 01-10 (mailer) will be the 2 and 3 additional import sites — bringing the `grep -r "DRY_RUN" src/` count to 3, as predicted in the verification block.
- `import { scrubSecrets, USER_AGENT } from '../util/logging.js'` is ready for every error-handling site (COMP-01) and for every outbound HTTP fetcher (FETCH-04).
- `import { loadFirms, loadRecipient } from './config/loader.js'` is the orchestrator's entry point for config — fail-fast semantics, D-05 env override, no surprises.

## Self-Check: PASSED

- All 5 new files exist on disk (`src/types.ts`, `src/env.ts`, `src/util/logging.ts`, `src/config/schema.ts`, `src/config/loader.ts`).
- `src/placeholder.ts` no longer exists on disk (intentional removal).
- All 3 task commits (`aa48ae8`, `15cc1e5`, `f8548d2`) present in `git log`.
- `pnpm typecheck` exits 0.
- `pnpm test` exits 0 (no test files, `passWithNoTests: true`).
- Grep verification invariants (DRY_RUN=1 site, USER_AGENT=1 export) both hold.
- Smoke tests for env override, YAML fallback, and real firms.yaml load all pass.

---
*Phase: 01-foundation-vertical-slice*
*Plan: 03*
*Completed: 2026-04-17*
