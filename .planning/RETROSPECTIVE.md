# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — Coverage & Closure

**Shipped:** 2026-05-28
**Phases:** 4 (14–17) | **Plans:** 10 | **Commits:** 54 | **Days:** 4 (2026-05-24 → 2026-05-28)

### What Was Built

- **Phase 14 — Scheduling Coverage.** Monday daily-cron backfill (`daily.yml` `0 12 * * 0-6`) closes the prior ~48h Sun→Tue fetch gap; `weekly.yml` shifted to Mon 06:00 KST with 15h separation + `concurrency: digest-pipeline` lock preserved. `pnpm sync-schedule` script + `src/config/loader.ts` `toCron()` helper deleted; CLAUDE.md `## Conventions > Workflow scheduling` documents the single-source-of-truth cron edit policy. workflow_dispatch runs `26513050608` + `26513052641` confirmed GH Actions parser acceptance.
- **Phase 15 — v1.1 Phase Closure Backfills.** `10-VERIFICATION.md` (status: passed, DQOBS-01/02/03 + commit `04a572e` evidence) + `11-03-SUMMARY.md` + `11-VERIFICATION.md` (RESUME-01/02 + GHA runs `26335283814`/`26335329895`) backfilled goal-backward against shipped code. 11/11 acceptance criteria PASS.
- **Phase 16 — v1.1 Metadata Hygiene.** v1.1 traceability table expanded to 4 columns with 6 REQ flips + evidence pins; Phase 10/11/12 SUMMARY `requirements-completed:` frontmatter backfilled (Phase 12 SUMMARYs cross-walk `SPEC-12-REQ-*` → `CONF-06`); `06-AUDIT.md` regenerated via `pnpm audit:firms` (freshfields row removed); CLAUDE.md `### Audit freshness (audit:firms)` policy subsection added. 15/15 acceptance criteria PASS.
- **Phase 17 — Summary Failure UX Cleanup** (promoted mid-milestone from backlog 999.1). `renderArticle()` failed branch removes title duplication + raw error JSON from recipient HTML — shows only title + muted `⚠ 요약 일시 불가` mono-tag + read-link. `parseRetryDelaySeconds` + async `onFailedAttempt` sleep (60s cap) honors Gemini 429 `retryDelay` field. CLAUDE.md free-tier RPM table updated: `gemini-2.5-flash: 5 (observed 2026-05-27)` + flash/flash-lite shared quota note. 7 new tests; 495/495 total pass.

### What Worked

- **Stage-gated multi-phase orchestration** (`/gsd:orchestrate_sh` v1.14 → v1.15): driving 4 phases through discuss → plan → execute as a single chain kept context warm and avoided per-phase session restart cost. The mode-transition gate at V2-execute → V2-verify aligns with the "desk session ends, mobile/Remote-control begins" cognitive boundary.
- **Inline SDK-level fallback** when nested-Agent unavailable: every phase's executor + verifier flagged `subagent verification skipped (nested-Agent unavailable); SDK-level validation PASS` in OK summary, then the orchestrator routed visible verification work without spawning another Agent. Zero failures introduced by this fallback path.
- **Backlog → active mid-milestone promotion** (Phase 17 from 999.1): production observation (2026-05-27 Latham EU ETS 429 JSON leak in digest) → backlog item → promote to Phase 17 → discuss → plan → execute → verify all in one session. Backlog parking-lot pattern proved its value — the issue would otherwise have lingered.
- **3-source cross-reference** (VERIFICATION.md + SUMMARY frontmatter + REQUIREMENTS.md traceability): caught the v1.2-on-v1.2 traceability drift early at audit time instead of leaking to next milestone.
- **Goal-backward smoke render against real-world fixture** (Latham EU ETS for Phase 17): visual confirmation that the email card matches the intended layout (제목 + ⚠ 요약 일시 불가 + 원문 읽기 →, no body, no JSON) was more convincing than any unit assertion.

### What Was Inefficient

- **Workflow dep-block rule × stage gating contradiction.** P16 depends on P15 → at V2-plan stage P16 became dep-blocked, but V2-plan can never exhaust unless P16 has a PLAN. Required a dep-block override AskUserQuestion mid-orchestration. Same risk surfaces for any in-list dep chain — the workflow should distinguish "blocks plan content" from "blocks execute artifact consumption".
- **Same traceability drift class on v1.2 that v1.2 itself fixed for v1.1.** META-01 flipped 6 REQ checkboxes for v1.1, and the v1.2 close audit found 3 more on v1.2. Could `gsd:complete-milestone` automate the VERIFICATION+SUMMARY-agreed-but-REQUIREMENTS.md-says-Pending checkbox flip going forward?
- **CLAUDE.md free-tier table outdated by 6 months.** The `gemini-2.5-flash: 10 RPM` row only got caught because a production failure forced the lookup. No mechanism to flag stack-doc freshness.
- **`milestone.complete --dry-run` is non-functional** — actually mutates state. Cost a confused minute. Worth a separate fix.
- **Pre-close audit false positives** (P02 + P09 `[resolved]` with 0 pending still flagged) — the audit-open tool surfaces every UAT.md even when fully resolved.

### Patterns Established

- **Inline SPEC.md for backlog-promoted phases**: when a backlog item has well-defined acceptance criteria already (ROADMAP success criteria + REQUIREMENTS entry), Skip spec-phase Socratic refinement and write SPEC.md inline before discuss-phase. Saved ~10 min on Phase 17.
- **Mid-orchestration dep-block override AskUserQuestion**: surface workflow-rule contradictions explicitly instead of deadlock-terminating. Operator gets to choose: override (plan can author with future-state refs) / halt / drop. Documented in telemetry.
- **`human_verification:` block with audit-trigger anchor in STATE.md**: time-delayed criteria (post-deploy cron observability, A/B test windows, etc.) get pre-staged exact CLI commands + STATE.md `Last activity` anchor so the audit window doesn't get forgotten. P14 SC #1 → 14-VERIFICATION.md `human_verification:` array + STATE.md note → audit on 2026-06-03.
- **Failed-render body omit + 3-tier failure semantic preservation**: when a path has multiple failure states (`skipped` vs `failed` vs `demoted`), don't conflate them into the same block. Add a dedicated branch even if it costs ~20 LOC.
- **Evidence pins inside traceability tables**: 4-column `Requirement | Phase | Status | Evidence` with commit hashes + run IDs + file paths in the Evidence cell. Replaces both the legacy `Pending` placeholder and the practice of citing evidence in narrative form elsewhere.

### Key Lessons

1. **`/gsd:orchestrate_sh` v1.14 stage-gated mode boundaries align well with operator session boundaries** — desk for spec/discuss/plan, mobile/remote for execute approvals, single batched deploy at V2-execute → V2-verify transition. v1.15 step 4.6 (deploy checkpoint) was used as a *skipped* gate in v1.2 (docs-only changes, DEPLOY_NEEDED empty) but the gate itself proved low-cost.
2. **Backlog → active promotion is cheap when the bug observation is concrete** — the 2026-05-27 production digest gave a verbatim 80-char error string, a specific firm/article, an exact GHA run ID. Inline SPEC + 3-question discuss + 3-plan execute landed in <1 hour wall-clock from backlog entry to phase-complete.
3. **Doc freshness needs a forcing function.** CLAUDE.md's free-tier RPM table was off by 2× and nobody noticed until quota broke. Future v1.x should consider an "observed-vs-documented" reconciliation step in `audit:firms` or a similar trigger.
4. **The audit's job is to catch its own drift.** The fact that v1.2 closed with the same traceability drift class v1.2 was *built to fix* is the strongest signal we should automate the VERIFICATION+SUMMARY → REQUIREMENTS.md checkbox flip inside `gsd:complete-milestone`.

### Cost Observations

- **Model mix:** ~Opus 4.7 dominant (orchestrator, planner, executor, verifier, code-review-fixer) with Haiku for lightweight Bash + grep + file-find calls.
- **Sessions:** 2 large sessions (2026-05-27 + 2026-05-28 single-session continuation) covering all 4 phases plus the milestone close. Phase 17 + audit + complete-milestone all landed in one continuous session.
- **Notable:** stage-gated orchestration kept the cache warm across phases — re-using context for phases 14→15→16 within a single dispatch round saved per-phase initialization overhead. Nested-Agent unavailability forced inline SDK-level fallback in every spawned executor/verifier — this consumed token budget the verifier subagent would have spent, but the orchestrator absorbed it without notable degradation.

## Cross-Milestone Trends

| Trend | v1.0 | v1.1 | v1.2 |
|-------|------|------|------|
| Test coverage | (informally tracked) | 488/488 at close | 495/495 at close (+7 for FAIL-UX-01) |
| Doc artifacts (SPEC/CONTEXT/SUMMARY/VERIFICATION per phase) | partial | mixed (close audit revealed gaps → v1.2 CLOSURE work) | full (4-artifact set on every phase) |
| Production deploys during milestone | n/a | 1 (cron resumption gate) | 0 (docs/UX only — runtime cron continues without redeploy) |
| Backlog → phase promotions | 0 | 0 | 1 (P17 from 999.1 mid-milestone) |
| Time-delayed criteria deferred | unknown | 0 | 1 (P14 SC #1 → 2026-06-03 audit window) |

### Patterns Persisting

- **Single source of truth for time-sensitive config** (cron, RPM limits): v1.0 had implicit assumption (yml file), v1.1 added the daily/weekly split decision, v1.2 made it an explicit doc policy with edit ritual.
- **Failure semantics as first-class state** (`summaryModel: 'skipped' | 'failed' | 'ok'` + `demoted`): v1.1 introduced the 3-tier model in Phase 8 hallucination guard, v1.2 Phase 17 preserved the distinction at render time.
- **No paid API / $0 budget**: maintained through 3 milestones. Free-tier limits drift (Gemini RPM 10 → 5) caught only after burn — see Lesson 3.

### Patterns Deprecated

- **`pnpm sync-schedule` as cron edit channel**: removed v1.2 Phase 14. Replaced by direct yml editing + CLAUDE.md procedure.
- **Title-as-body fallback for failed Gemini summaries**: removed v1.2 Phase 17. Replaced by body `<p>` omit + mini-tag.
