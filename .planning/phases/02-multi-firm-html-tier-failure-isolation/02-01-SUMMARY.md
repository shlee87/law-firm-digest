---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 01
status: complete
files_modified:
  - src/types.ts
  - src/config/schema.ts
  - config/firms.yaml
  - test/config/schema.test.ts
---

# Plan 02-01 Summary: Config schema + types + firms.yaml extension

## What was built

Extended the Phase 1 config schema/types to support the Phase 2 HTML tier and
populated `config/firms.yaml` with the locked 9-live + 3-disabled firm list
(D-P2-14 Option A+B).

### Schema extensions (`src/config/schema.ts`)
- `selectors.link` — now `.optional()` (was required)
- `selectors.link_onclick_regex` — new (D-P2-15): regex applied to onclick attribute
- `selectors.link_template` — new (D-P2-15) with Pitfall 5 regex guard
  (`/^(https?:\/\/|\/)/` forbids relative templates)
- `selectors.body` — new (D-P2-11): per-firm body override
- `selectors.refine()` — enforces `link XOR (onclick pair)`: each firm needs
  either `selectors.link` OR `(selectors.link_onclick_regex + selectors.link_template)`
- `include_keywords` / `exclude_keywords` — new (D-P2-07, CONF-06): arrays default to `[]`
- `.strict()` preserved on both FirmSchema and FirmsConfigSchema
- `type: z.enum(['rss', 'html'])` unchanged — js-render still rejected at runtime

### Type mirror (`src/types.ts`)
- FirmConfig.selectors widened with `link?`, `link_onclick_regex?`,
  `link_template?`, `body?`
- FirmConfig gains `include_keywords?` / `exclude_keywords?`
- Added docstring sub-bullet noting that include/exclude default to `[]` at
  schema validation, so runtime can assume arrays even though TS marks optional
- `FirmType = 'rss' | 'html' | 'js-render'` left intact (intentional TS/zod
  mismatch per PATTERNS.md L492-494 — runtime rejects 'js-render' before types)

### firms.yaml population (D-P2-14 Option A+B)
Appended 11 new entries beneath the existing Phase 1 `cooley` RSS block:

**Live (9 enabled:true):**
- RSS: cooley (existing), clifford-chance, freshfields
- HTML plain-href: shin-kim, yulchon, logos, skadden
- HTML onclick-extract: kim-chang, bkl

**Disabled placeholders (3 enabled:false):** lee-ko, yoon-yang, latham
(JS-render required; deferred to Phase 4)

Korean header comment block (L1-31) preserved verbatim. A new Phase 2 comment
block documenting the additional schema fields was added before the `firms:`
list so non-developer editors see the CONF-07 field documentation.

### Tests
New file: `test/config/schema.test.ts` — 9 tests covering backward-compat,
onclick pair acceptance, refine rejection, Pitfall 5 link_template guard,
keyword defaults/types, body field, and the `.strict()` regression guard.

## Verification evidence

```
pnpm vitest run test/config/schema.test.ts → 9/9 pass
pnpm typecheck → exit 0
pnpm tsx -e "loadFirms() sort + count" → OK — 9 live firms:
  bkl,clifford-chance,cooley,freshfields,kim-chang,logos,shin-kim,skadden,yulchon
grep -c '^  - id: ' config/firms.yaml → 12
grep -c 'enabled: false' config/firms.yaml → 3
grep -c 'enabled: true' config/firms.yaml → 9
grep -c 'link_onclick_regex:' config/firms.yaml → 2
grep -c 'link_template:' config/firms.yaml → 2
grep -c 'type: html' config/firms.yaml → 9
grep -c 'Phase 2 firm list (D-P2-14 Option A+B' config/firms.yaml → 1
```

## Deviations from plan

None. The skadden selectors in the plan (list_item: `.views-row`, link:
`a.insightful-card, a.highlight-card`) were copied verbatim — no live-probe
adjustment was triggered. Plan 03's live-fixture probe may still observe
wrapper drift; if so it will be documented in 02-03-SUMMARY.

## Downstream hooks (for plans 02-03 / 02-04 / 02-08)

- Plan 03 consumes `selectors.link`, `selectors.link_onclick_regex`,
  `selectors.link_template` to build HTML tier scraper
- Plan 04 consumes `include_keywords` / `exclude_keywords` and
  `selectors.body` for enrichBody + filter pipeline
- Plan 08 wires the new pipeline into main.ts

## Requirements touched

- CONF-04 (enabled flag) — exercised by the 3 disabled placeholder entries
- CONF-06 (keyword filter) — schema field declared, defaults to `[]`
