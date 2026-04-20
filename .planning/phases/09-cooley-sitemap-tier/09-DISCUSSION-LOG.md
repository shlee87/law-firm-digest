# Phase 9: Cooley Sitemap Tier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 09-cooley-sitemap-tier
**Areas discussed:** (none selected — user chose "proceed without discussion")

---

## Gray Areas Presented (but not selected)

User was offered 4 gray areas for discussion and chose to skip all of them ("1번 진행"), deferring all 4 to Claude's Discretion with reasonable defaults applied in CONTEXT.md.

| Area | Description | Decision path |
|------|-------------|---------------|
| XML parsing strategy | cheerio xmlMode vs fast-xml-parser vs regex; sitemap_index nesting scope | Default: cheerio xmlMode (existing dep), no nested index support (D-08, D-09) |
| Body selector config | `.post-content` hardcode vs firm config field | Default: hardcode, deferred firm config field to separate phase (D-11) |
| Time filter vs latest_n | top-N only vs adding time window | Default: latest_n only — sufficient for Cooley's post cadence (D-09) |
| Sitemap fetch failure | Retry strategy vs existing error isolation | Default: reuse existing FETCH-02 pattern, no new retry logic (D-15) |

**Rationale for skip:** Phase 9 requirements (SITEMAP-01~05) + backlog doc `.planning/backlog/cooley-cf-bypass.md` already locked the approach (Tier 1 — new `sitemap` scraper, `.post-content` body, latest_n default 10, reuse js-render detail path). Remaining gray areas are all implementation-detail-level with clear reasonable defaults — user correctly identified that interactive discussion would add little value here.

## Claude's Discretion

- XML parsing library choice (defaulted to cheerio xmlMode)
- Body selector configurability (defaulted to hardcoded `.post-content`)
- latest_n constant location (schema.ts vs sitemap.ts)
- SitemapFirmSchema superRefine depth
- Backlog file archival path layout
- sitemap.ts function signature / export structure
- Fixture sizing

## Deferred Ideas (captured in CONTEXT.md `<deferred>`)

- Body selector firm-config field (future sitemap firms)
- sitemap_index.xml nested support
- Time-window filter layered on top of latest_n
- CF bypass generalization (Playwright-through-feed endpoint)

## External Research Performed

None — this workflow step did not invoke the phase-researcher. Downstream `/gsd:plan-phase 9` will optionally spawn gsd-phase-researcher if required.

## Pre-loaded Context Sources

- `.planning/PROJECT.md` (Phase 8 evolution note confirming v1.1 milestone state)
- `.planning/REQUIREMENTS.md` (SITEMAP-01 through SITEMAP-05)
- `.planning/ROADMAP.md` (Phase 9 block: goal, depends on, success criteria)
- `.planning/backlog/cooley-cf-bypass.md` (CF probe analysis + approach recommendation)
- `config/firms.yaml` (Cooley block line 54-60, disabled state)
- `src/scrapers/rss.ts`, `src/scrapers/jsRender.ts`, `src/scrapers/util.ts` (tier module patterns)
- `src/pipeline/fetch.ts`, `src/pipeline/enrichBody.ts` (dispatch integration points)
- `src/config/schema.ts` (FirmSchema type enum)
- Prior phase CONTEXT.md files (Phase 7 detail_tier foundations)
