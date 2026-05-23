# Roadmap: LegalNewsletter

**Created:** 2026-04-16
**Last reorganized:** 2026-05-23 (v1.1 milestone close)

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (informally shipped; never formally archived through `/gsd:complete-milestone` — see PROJECT.md for v1.0 retro)
- ✅ **v1.1 Data-Quality Hardening** — Phases 6–13 (shipped 2026-05-23, archived to `milestones/v1.1-*`)
- 📋 **v1.2** — TBD (start with `/gsd:new-milestone`)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–5)</summary>

- [x] Phase 1: Foundation + Vertical Slice — one firm end-to-end (fetch → dedup → summarize → email → state commit), all "cheap now" pitfalls baked in
- [x] Phase 2: Multi-Firm HTML Tier + Failure Isolation — all 12 firms via tiered fetch (RSS + cheerio HTML), one firm's breakage never zeros the digest
- [x] Phase 3: Observability + Dev Loop — staleness alerts, step summary, archive, `check:firm` CLI, operational README
- [x] Phase 4 (+ 4.1): JS-Rendered Tier — Playwright tier for firms requiring JS rendering; link-extractor generalization
- [x] Phase 5: Triggered Polish — v1.x backlog items, only items with active triggers shipped

Full v1.0 phase details preserved in git history (see commits before 2026-04-19).

</details>

<details>
<summary>✅ v1.1 Data-Quality Hardening (Phases 6–13) — SHIPPED 2026-05-23</summary>

- [x] Phase 6: Firm Audit + Probe (5/5 plans) — `pnpm audit:firms` CLI with 4-signal detail-identity classifier
- [x] Phase 7: SPA-Aware Detail Tier (6/6 plans) — `detail_tier: 'js-render' | 'static'` per-firm config
- [x] Phase 8: Hallucination Guard (6/6 plans) — 3-layer defense (body shape + prompt rule + cluster detector)
- [x] Phase 9: Cooley Sitemap Tier (3/3 plans) — `type: sitemap` w/ CF bypass via Playwright XML fetch
- [x] Phase 10: Data-Quality Observability (3/3 plans) — 9-column step-summary + low-conf detector + DRY_RUN emission
- [x] Phase 11: Cron Resumption Gate (3/3 plans) — TLS chain fix + `restoreFetchHost` helper + cron uncommented
- [x] Phase 12: Topic-Based Filter (2/2 plans) — 5-area keyword filter (VC/securities, 공정거래, 개인정보, 노동법, IP)
- [x] Phase 13: Gemini RPD Daily/Weekly Split (7/7 plans) — `runDaily` + `runWeekly` entry points with forbidden-import contracts

Full milestone details: `.planning/milestones/v1.1-ROADMAP.md`
Audit report: `.planning/milestones/v1.1-MILESTONE-AUDIT.md`
Requirements snapshot: `.planning/milestones/v1.1-REQUIREMENTS.md`

</details>

### 📋 v1.2 (Planned — start with `/gsd:new-milestone`)

Carried-over tech debt from v1.1 (see MILESTONES.md → "Known deferred items"):

- `scripts/sync-schedule.ts` rewrite to handle daily+weekly split (currently overwrites Phase 13 cron split if run)
- Backfill Phase 10 + 11 VERIFICATION.md (work shipped; goal-backward audit skipped)
- Backfill Phase 11-03-SUMMARY.md
- `pnpm audit:firms` regen for fresh `06-AUDIT.md` (remove stale freshfields row)
- Metadata reconciliation: REQUIREMENTS.md DQOBS-* + RESUME-* checkboxes ↔ phase SUMMARYs

## Progress

| Milestone | Phases | Plans | Status      | Shipped    |
| --------- | ------ | ----- | ----------- | ---------- |
| v1.0 MVP  | 1–5    | 30+   | ✅ Complete | (pre-2026-04-19; not formally archived) |
| v1.1 Data-Quality Hardening | 6–13 | 28 | ✅ Complete | 2026-05-23 |
| v1.2      | TBD    | TBD   | 📋 Planned  | —          |
