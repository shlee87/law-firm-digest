# Roadmap: LegalNewsletter

**Created:** 2026-04-16
**Last reorganized:** 2026-05-28 (v1.2 milestone shipped)

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (informally shipped; never formally archived through `/gsd:complete-milestone` — see PROJECT.md for v1.0 retro)
- ✅ **v1.1 Data-Quality Hardening** — Phases 6–13 (shipped 2026-05-23, archived to `milestones/v1.1-*`)
- ✅ **v1.2 Coverage & Closure** — Phases 14–17 (shipped 2026-05-28, archived to `milestones/v1.2-*`)
- 📋 **v1.3** — Awaiting `/gsd:new-milestone`

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

<details>
<summary>✅ v1.2 Coverage & Closure (Phases 14–17) — SHIPPED 2026-05-28</summary>

- [x] Phase 14: Scheduling Coverage (2/2 plans) — Monday cron added (`daily.yml` `0 12 * * 0-6`); `weekly.yml` shifted to Mon 06 KST; `sync-schedule` footgun removed; CLAUDE.md cron edit policy. *Code-verified; time-delayed Monday-cron observability audit deferred to 2026-06-03 per pre-staged `14-VERIFICATION.md` `human_verification:` block.*
- [x] Phase 15: v1.1 Phase Closure Backfills (2/2 plans) — `10-VERIFICATION.md` + `11-03-SUMMARY.md` + `11-VERIFICATION.md` backfilled with cited evidence (DQOBS-01/02/03, RESUME-01/02, commit `04a572e`, GHA runs `26335283814`/`26335329895`).
- [x] Phase 16: v1.1 Metadata Hygiene (3/3 plans) — v1.1 traceability table 4-col with evidence pins; Phase 10/11/12 SUMMARY `requirements-completed` frontmatter backfilled; `06-AUDIT.md` regenerated via `pnpm audit:firms` + CLAUDE.md audit freshness policy.
- [x] Phase 17: Summary Failure UX Cleanup (3/3 plans, INSERTED from backlog 999.1 mid-milestone) — `renderArticle()` failed branch removes title duplication + raw error JSON; `parseRetryDelaySeconds` + async `onFailedAttempt` sleep (60s cap) honors Gemini 429 retryDelay; CLAUDE.md free-tier RPM table updated to flash `5 (observed 2026-05-27)` + flash/flash-lite quota-pool shared note.

Full milestone details: `.planning/milestones/v1.2-ROADMAP.md`
Audit report: `.planning/milestones/v1.2-MILESTONE-AUDIT.md`
Requirements snapshot: `.planning/milestones/v1.2-REQUIREMENTS.md`

</details>

### 📋 v1.3 (Planned)

Awaiting `/gsd:new-milestone` — questioning → research → requirements → roadmap.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–5 (collapsed) | v1.0 | 30+/30+ | Complete | (pre-2026-04-19) |
| 6–13 (collapsed) | v1.1 | 28/28 | Complete | 2026-05-23 |
| 14–17 (collapsed) | v1.2 | 10/10 | Complete | 2026-05-28 |

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1–5 | 30+ | ✅ Complete | (pre-2026-04-19; not formally archived) |
| v1.1 Data-Quality Hardening | 6–13 | 28 | ✅ Complete | 2026-05-23 |
| v1.2 Coverage & Closure | 14–17 | 10 | ✅ Complete | 2026-05-28 |
