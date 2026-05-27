# Roadmap: LegalNewsletter

**Created:** 2026-04-16
**Last reorganized:** 2026-05-24 (v1.2 milestone open)

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (informally shipped; never formally archived through `/gsd:complete-milestone` — see PROJECT.md for v1.0 retro)
- ✅ **v1.1 Data-Quality Hardening** — Phases 6–13 (shipped 2026-05-23, archived to `milestones/v1.1-*`)
- 🚧 **v1.2 Coverage & Closure** — Phases 14–16 (in progress, opened 2026-05-24)

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

### 🚧 v1.2 Coverage & Closure (In Progress) — Opened 2026-05-24

**Milestone Goal:** v1.1 close 과정에서 드러난 운영 footgun + 문서 메타데이터 누락 + 큐레이션 사각지대(월–화 48시간 fetch gap)를 한 번에 정리해 production 안정성과 artifact 정합성을 v1.1 shipping 수준에 맞춘다. No new user-facing features — pure operational + documentation tightening.

- [ ] **Phase 14: Scheduling Coverage** — Close the Monday fetch gap and remove the sync-schedule footgun (SCHED-01 + SCHED-02)
- [ ] **Phase 15: v1.1 Phase Closure Backfills** — Write the missing VERIFICATION.md + 11-03-SUMMARY.md artifacts (CLOSURE-01 + CLOSURE-02)
- [ ] **Phase 16: v1.1 Metadata Hygiene** — Reconcile traceability + regen 06-AUDIT.md + document freshness policy (META-01 + META-02)

## Phase Details

### Phase 14: Scheduling Coverage
**Goal**: Pipeline fetches new items on every weekday (no >24h gap) and the `sync-schedule` tooling no longer silently regresses the Phase 13 daily/weekly cron split.
**Depends on**: v1.1 complete (Phases 6–13)
**Requirements**: SCHED-01, SCHED-02
**Success Criteria** (what must be TRUE):
  1. After one full week of production runs, every weekday (Mon–Sun) shows at least one successful daily fetch in GHA run history — no >24h gap between consecutive fetches
  2. `daily.yml` cron triggers on Monday (in addition to Tue–Sun) and `weekly.yml` cron continues to fire on Monday at a separated time, with `concurrency: digest-pipeline` lock preventing overlap
  3. Running `pnpm sync-schedule` either (a) leaves both `daily.yml` + `weekly.yml` byte-identical to their pre-run state, or (b) returns "command not found" / equivalent failure because the script + package.json entry were removed
  4. A documented policy exists (in CLAUDE.md or settings.yaml header) explaining how cron schedules are edited after this phase
**Plans**:
- [x] 14-01-PLAN.md — SCHED-01 functional: daily.yml + weekly.yml cron split (add Mon to daily, shift weekly to Mon 06:00 KST)
- [ ] 14-02-PLAN.md — SCHED-02 mechanical cleanup: delete sync-schedule.ts + package.json entry + toCron() + settings.yaml ref; add CLAUDE.md edit policy + STATE.md acceptance note

### Phase 15: v1.1 Phase Closure Backfills
**Goal**: Every shipped v1.1 phase has both a per-plan SUMMARY.md and a goal-backward VERIFICATION.md, restoring full v1.1 archive integrity.
**Depends on**: Phase 14 (independent in scope, but ordered after so production-impact work ships first)
**Requirements**: CLOSURE-01, CLOSURE-02
**Success Criteria** (what must be TRUE):
  1. `10-VERIFICATION.md` exists at the archived Phase 10 path with frontmatter `status: passed` (or `gaps_found` with documented gaps), backfilled goal-backward against DQOBS-01/02/03 evidence including the quick-task 260523-mtz fix (commit 04a572e)
  2. `11-03-SUMMARY.md` exists documenting the cron-uncomment outcome with explicit commit references to `daily.yml:27` + `weekly.yml:30`
  3. `11-VERIFICATION.md` exists with frontmatter `status: passed` and evidence against RESUME-01 (smoke test 2026-04-21 + production runs 26335283814 + 26335329895 on 2026-05-23) and RESUME-02 (cron lines factually uncommented in both yml files)
  4. Every v1.1 phase (06–13) now has both SUMMARY.md (per plan) AND VERIFICATION.md — no remaining "(work shipped, audit skipped)" gaps from the v1.1 audit
**Plans**: TBD

### Phase 16: v1.1 Metadata Hygiene
**Goal**: Archived v1.1 metadata (traceability table + plan SUMMARYs + audit artifact) accurately reflects shipped state, and a freshness policy documents when `pnpm audit:firms` must be re-run.
**Depends on**: Phase 15 (META-01 cross-walks against the VERIFICATION outcomes from Phase 15)
**Requirements**: META-01, META-02
**Success Criteria** (what must be TRUE):
  1. `milestones/v1.1-REQUIREMENTS.md` traceability table shows DQOBS-01/02/03 + RESUME-01/02 + CONF-06 as `[x]` with phase + commit evidence (no `[ ]` checkboxes remain for shipped reqs)
  2. v1.1 Phase 10/11/12 plan SUMMARYs list actual closed REQ-IDs in `requirements-completed` frontmatter (no empty `[]` arrays; Phase 12 SUMMARYs cross-walk phase-local `SPEC-12-REQ-*` IDs to top-level `CONF-06`)
  3. `06-AUDIT.md` reflects current `config/firms.yaml` — no `freshfields` row, regenerated via `pnpm audit:firms`
  4. A freshness policy for `pnpm audit:firms` is documented in CLAUDE.md or in `06-AUDIT.md` header (e.g., "after every `firms.yaml` change" or "monthly")
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–5 (collapsed) | v1.0 | 30+/30+ | Complete | (pre-2026-04-19) |
| 6–13 (collapsed) | v1.1 | 28/28 | Complete | 2026-05-23 |
| 14. Scheduling Coverage | v1.2 | 1/2 | In Progress|  |
| 15. v1.1 Phase Closure Backfills | v1.2 | 0/TBD | Not started | - |
| 16. v1.1 Metadata Hygiene | v1.2 | 0/TBD | Not started | - |

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1–5 | 30+ | ✅ Complete | (pre-2026-04-19; not formally archived) |
| v1.1 Data-Quality Hardening | 6–13 | 28 | ✅ Complete | 2026-05-23 |
| v1.2 Coverage & Closure | 14–16 | TBD | 🚧 In progress | — |
