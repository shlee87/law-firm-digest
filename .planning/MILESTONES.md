# Milestones

## v1.1 — Data-Quality Hardening (Shipped: 2026-05-23)

**Phases completed:** 8 phases (6–13), 28 plans, 56 tasks
**Cron status:** Restored — daily (Tue–Sun 21:00 KST) + weekly (Mon 21:00 KST)
**Audit status:** `tech_debt` (no blockers; 5 doc/footgun items deferred to v1.2)

### Key accomplishments

1. **Phase 6 — Firm Audit + Probe.** `pnpm audit:firms` CLI with a 4-signal detail-identity classifier (exact-hash, Jaccard ≥0.9, title-token-zero, body-too-short) re-discovered + diagnosed the v1.0 hallucination class per-firm. Wired with 3-tier exit codes; the live run flagged bkl detail-identical bodies (root cause for the v1.0 UAT regression).

2. **Phase 7 — SPA-Aware Detail Tier.** Added `detail_tier: 'js-render' | 'static'` to FirmSchema with zod default + superRefine. 6 firms opted into JS-rendered detail extraction via shared Playwright browser. Disabled `bkl` + `kim-chang` with documented `canonicalizeUrl` ↔ `www.` interaction as PASSED WITH EXCEPTIONS — both re-enabled in Phase 11 via `restoreFetchHost`.

3. **Phase 8 — Hallucination Guard (3 layers).** Layer 1: pre-summarize body-shape short-circuit (<100 chars → title verbatim). Layer 2: Gemini prompt rule + structured `responseSchema`. Layer 3: post-summarize cluster detector (3+ identical 50-char prefixes within firm → demote to `confidence: low`, emit `HALLUCINATION_CLUSTER_DETECTED` stderr marker + email footer + step-summary section).

4. **Phase 9 — Sitemap Tier.** New `type: sitemap` firm type using Playwright `context.request.get` (CF bypass) + cheerio XML parsing + lastmod-sorted top-N. Cooley migrated off CF-blocked RSS; `pnpm check:firm cooley` reports 10/10 enriched bodies. SITEMAP-01..05 all green; 394 tests pass.

5. **Phase 10 — Data-Quality Observability (DQOBS).** 9-column step-summary table (avg body length, GUARD trigger count, H/M/L confidence distribution) + low-confidence detector + email footer integration + DRY_RUN stdout emission. Fixed in v1.1 close via quick task 260523-mtz (`isEmptyFirm` predicate widened to 4-signal so weekly observability rows render).

6. **Phase 11 — Cron Resumption Gate.** TLS chain fix for shin-kim (Thawte intermediate via `NODE_EXTRA_CA_CERTS`) + `restoreFetchHost` shared helper (unblocked bkl + kim-chang). All previously-disabled firms re-enabled. Cron uncommented in both `daily.yml` + `weekly.yml`.

7. **Phase 12 — Topic-Based Filter.** Pre-summarize keyword filter on 5 topic areas (VC/securities, 공정거래, 개인정보, 노동법, IP) configurable per-firm. Cuts noise + reduces Gemini call volume. Verified live in production daily run 26335283814 — 20+ `[filter] skipped` log lines on both English and Korean titles.

8. **Phase 13 — Gemini RPD Daily/Weekly Split.** `runDaily` (Tue–Sun: fetch → enrich → summarize → append pending) + `runWeekly` (Mon: read pending → compose → send → archive → truncate) with forbidden-import contracts between modes. RPD spread across 7 days. Manual `workflow_dispatch` verification on 2026-05-23 confirmed end-to-end daily + weekly with real email delivered.

### Known deferred items (v1.2 backlog)

- `scripts/sync-schedule.ts` footgun: would overwrite Phase 13 split cron if run
- Phase 10 + 11 VERIFICATION.md never written (code shipped; goal-backward audit skipped)
- Phase 11-03-SUMMARY.md missing (cron uncomment outcome present in codebase but no formal closure summary)
- `06-AUDIT.md` stale (lists removed `freshfields`) — `pnpm audit:firms` regenerates cleanly
- Metadata drift: Phase 10/11 SUMMARYs have empty `requirements-completed: []`; Phase 12 uses phase-local IDs; REQUIREMENTS.md DQOBS-* + RESUME-* checkboxes still `[ ]` despite work shipped

### Known scope notes

- Phases 12 + 13 were not in the original v1.1 "Phase 6–11" scope. Both were absorbed into v1.1 as the cron stayed paused: Phase 12 (topic filter) cut noise before cron resumption; Phase 13 (daily/weekly split) addressed RPD distribution. Both shipped before cron actually resumed.
- v1.0 was never formally archived through `/gsd:complete-milestone` (only this v1.1 close populates `.planning/milestones/`). Several v1.0 REQUIREMENTS.md checkboxes remain `[ ]` despite shipping — out of scope for v1.1 close.

---
