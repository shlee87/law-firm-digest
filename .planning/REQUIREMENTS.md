# Requirements: LegalNewsletter v1.2

**Defined:** 2026-05-24
**Milestone:** v1.2 Coverage & Closure
**Context:** v1.1 close (2026-05-23) shipped 8 phases successfully but the milestone audit surfaced 5 carryover items + 1 newly-identified curation gap. v1.2 closes all six with no new user-facing features — pure operational + documentation tightening.

**Inherits:** All v1.0 + v1.1 Validated requirements (see `milestones/v1.0-*` and `milestones/v1.1-REQUIREMENTS.md`).

## v1.2 Requirements

### Scheduling (SCHED)

Operational cron coverage + sync-script integrity. User-facing impact: monday newsletters are no longer silently missed.

- [x] **SCHED-01**: Pipeline fetches new newsletter items at least once every 24 hours across all weekdays (no >24h fetch gap). Currently 일–화 사이 ~48시간 gap because daily.yml excludes Monday (weekly.yml owns Mon). Add Monday daily fetch — daily and weekly may run on the same day if their times are separated (e.g., daily 21:00 KST / weekly 06:00 KST) and `concurrency: digest-pipeline` lock continues to prevent overlap.

- [x] **SCHED-02**: `pnpm sync-schedule` does not silently overwrite the Phase 13 daily/weekly cron split. The script either (a) is rewritten to read `config/settings.yaml` and update BOTH `daily.yml` and `weekly.yml` in lockstep, or (b) is removed entirely and replaced with a documented manual-edit policy in CLAUDE.md / settings.yaml header. Acceptance: running `pnpm sync-schedule` (if kept) leaves split intact, OR `package.json` script is removed and `pnpm` no longer accepts the command.

### Phase Closure (CLOSURE)

v1.1 phases that shipped code without their goal-backward verification artifact. Required for v1.1 archive integrity.

- [ ] **CLOSURE-01**: `.planning/milestones/v1.1-phases/10-data-quality-observability/10-VERIFICATION.md` exists with `status: passed` (or `gaps_found` with documented gaps), backfilled goal-backward against DQOBS-01/02/03 evidence (including the post-v1.1-close fix at commit 04a572e for DQOBS-01). Phase dirs may have been archived to `milestones/v1.1-phases/` by this point — write the verification at whichever path the phase currently lives.

- [ ] **CLOSURE-02**: Phase 11 (Cron Resumption Gate) closure artifacts complete: (a) `11-03-SUMMARY.md` written documenting the actual cron uncomment outcome with commit references (cron is uncommented in `.github/workflows/daily.yml:27` + `weekly.yml:30`), and (b) `11-VERIFICATION.md` written with `status: passed`, evidence against RESUME-01 (smoke test 2026-04-21 + production verification 2026-05-23 workflow_dispatch runs 26335283814 + 26335329895) and RESUME-02 (cron lines factually uncommented).

### Metadata Hygiene (META)

Archived artifact accuracy + audit freshness.

- [x] **META-01**: `.planning/milestones/v1.1-REQUIREMENTS.md` traceability table reflects actual shipped state — DQOBS-01/02/03, RESUME-01/02, and CONF-06 (satisfied by Phase 12 topic filter) flipped from `[ ]` to `[x]` with phase + commit evidence. Also update any `requirements-completed: []` empty arrays in `milestones/v1.1-phases/{10,11,12}/SUMMARYs` to list the actual REQ-IDs each plan closed (Phase 12 SUMMARYs need cross-walk from local `SPEC-12-REQ-*` IDs to top-level `CONF-06`).

- [x] **META-02**: `pnpm audit:firms` re-run produces fresh `06-AUDIT.md` reflecting current `config/firms.yaml` (no `freshfields` row — that firm was removed 2026-05-18). Policy: document in CLAUDE.md or `06-AUDIT.md` header how often this should be re-run (e.g., "after every `firms.yaml` change" or "monthly").

## Future Requirements (deferred — re-evaluate at v1.3)

None currently identified. v1.2 is intentionally a cleanup milestone — new feature ideas should be captured via `/gsd:plant-seed` for surfacing at v1.3 planning.

## Out of Scope (explicit)

| Feature | Reason |
|---------|--------|
| Topic filter keyword expansion (e.g., adding 환경/M&A/세무) | User opted for "표시만" route in 2026-05-23 conversation. Display-only footer shipped in quick task 260523-oi6. Re-scope when user actually wants more keyword categories. |
| Per-item topic tag display in digest email | Same as above — quick task delivered footer-level disclosure; per-item tagging is over-engineered for current need. |
| Phase dirs archival from `.planning/phases/` → `milestones/v1.1-phases/` | Deferred during v1.1 close (user chose "Skip" on phase archival prompt). Run `/gsd:cleanup` later if disk clutter becomes a concern. NOT a v1.2 requirement. |
| Topic filter accuracy review (false positive / false negative analysis on `[filter] skipped` lines) | Different milestone — would need labeled sample dataset + scorecard. Capture as seed if pattern accuracy concerns surface. |
| Adding `pnpm audit:firms` to CI (auto-fail on drift) | Over-engineering for single-developer project. META-02 documentation suffices. Revisit if multiple contributors join. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHED-01 | Phase 14 — Scheduling Coverage | Complete |
| SCHED-02 | Phase 14 — Scheduling Coverage | Complete |
| CLOSURE-01 | Phase 15 — v1.1 Phase Closure Backfills | Pending |
| CLOSURE-02 | Phase 15 — v1.1 Phase Closure Backfills | Pending |
| META-01 | Phase 16 — v1.1 Metadata Hygiene | Complete |
| META-02 | Phase 16 — v1.1 Metadata Hygiene | Complete |
