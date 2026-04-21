# Roadmap: LegalNewsletter

**Created:** 2026-04-16
**Granularity:** coarse (3–5 phases per milestone)
**Coverage:** 46/46 v1 requirements + 22/22 v1.1 requirements mapped

## Overview

LegalNewsletter ships as a vertical slice first (one firm end-to-end through fetch → dedup → summarize → email → state commit), then scales horizontally (multi-firm HTML tier + per-firm failure isolation), then hardens against silent rot (staleness alerts + dev-loop CLI + archive). A conditional JS-rendered tier follows only if the Phase 2 empirical audit identifies a firm that genuinely requires it. Phase 5 is a triggered backlog — items activate only when their specific pain surfaces. Every PITFALLS.md `[CHEAP NOW]` item lands in Phase 1 or Phase 2 (canonicalization, timezone handling, run-transaction ordering, concurrency key, fail-loud SMTP, secrets hygiene, honest UA + robots.txt); retrofitting any of these is multi-day work on corrupted state.

**v1.1 Data-Quality Hardening (Phase 6–11):** A follow-on milestone triggered by Phase 02 UAT demo (2026-04-19) revealing hallucinated summaries on html-tier firms. The arc is: audit what's actually broken (Phase 6) → fix SPA detail fetching (Phase 7) → add Gemini hallucination guard (Phase 8) → restore Cooley via sitemap tier (Phase 9) → surface body-quality metrics in step summary (Phase 10) → re-enable cron only after all prior gates pass (Phase 11). Phase 11 (Cron Resumption Gate) is explicitly terminal and depends on all prior v1.1 phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): v1.0 milestone work (shipped)
- Integer phases (6–11): v1.1 milestone work (data-quality hardening)
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation + Vertical Slice** - One firm end-to-end through Gemini + Gmail + committed state, with every "cheap now" pitfall baked in
- [x] **Phase 2: Multi-Firm HTML Tier + Failure Isolation** - All 12 firms live via tiered fetch (RSS + cheerio HTML), one firm's breakage never zeros the digest
- [x] **Phase 3: Observability + Dev Loop** - Silent rot becomes visible (staleness alerts, step summary, archive, check:firm CLI, operational README)
- [x] **Phase 4: JS-Rendered Tier (conditional)** - Playwright tier only if Phase 2 audit proves some firm actually requires JS rendering; otherwise skip
- [x] **Phase 5: Triggered Polish (v1.x backlog)** - Each item activates only when its named trigger condition fires; none are pre-committed
- [ ] **Phase 6: Firm Audit + Probe** - Per-firm list/detail probe diagnoses every enabled firm's actual extraction quality and documents remediation paths
- [x] **Phase 7: SPA-Aware Detail Tier** - `detail_tier` config flag lets html-tier firms route their detail fetch through Playwright when their detail pages are JS-rendered (CLOSED WITH EXCEPTIONS — SC-1/4 PASSED, SC-2/3 DEFERRED for bkl+kim-chang shared URL-handling follow-up)
- [ ] **Phase 8: Hallucination Guard** - Gemini prompt and post-summarize detector prevent title-only hallucinations when body is empty, short, or generic-boilerplate
- [x] **Phase 9: Cooley Sitemap Tier** - New `type: sitemap` scraper parses WordPress sitemap XML, restoring Cooley with CF-safe article fetch
- [ ] **Phase 10: Data-Quality Observability** - GHA step-summary and email footer expose per-firm body-quality metrics so degradation is visible without reading logs
- [ ] **Phase 11: Cron Resumption Gate** - Manual dispatch + visual inspection confirms zero hallucination regressions before cron schedule is uncommented

## Phase Details

### Phase 1: Foundation + Vertical Slice
**Goal**: One firm runs end-to-end on GHA cron — fetch → canonical-URL dedup → Gemini Korean summary → Gmail digest → state commit — with every foundational pitfall already solved.
**Depends on**: Nothing (first phase)
**Requirements**: FETCH-03, FETCH-04, DEDUP-01, DEDUP-02, DEDUP-03, DEDUP-04, DEDUP-06, DEDUP-07, SUMM-01, SUMM-02, SUMM-03, SUMM-04, SUMM-05, SUMM-06, EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-06, CONF-01, CONF-02, CONF-03, CONF-05, CONF-07, OPS-01, OPS-02, OPS-03, OPS-06, OPS-10, COMP-01, COMP-02, COMP-03, COMP-04, COMP-05
**Success Criteria** (what must be TRUE):
  1. One real digest arrives in the user's inbox, containing original-language title + Korean summary + source link for each new item from the seeded firm.
  2. Re-running the same GHA workflow does not send a second email (state write happens strictly after email send; `[skip ci]` prevents commit trigger loop; `concurrency: {group: digest-pipeline, cancel-in-progress: false}` prevents parallel-run races).
  3. Two URL variants of the same article (`/insights/foo?utm_source=x`, `https://www.firm.com/insights/foo/`, `/insights/foo`) dedup to one entry in `state/seen.json`.
  4. Invalid YAML or missing required field in `config/firms.yaml` fails startup with a precise path/reason; running with `DRY_RUN=1` prints a full digest preview, skips email send, and does not mutate state.
  5. Gmail SMTP error fails the workflow red (never caught-and-logged); `.env` stays out of git, all secrets flow through GHA Secrets, honest `LegalNewsletterBot/1.0` User-Agent + robots.txt check precede every fetch.
**Plans**: 12 plans
Plans:
- [x] 01-01-PLAN.md — Repo scaffold + tooling + recipient.yaml + README (CONF-03, OPS-10, COMP-01/02/04/05)
- [x] 01-02-PLAN.md — Cooley RSS endpoint probe + firms.yaml with non-dev comment header (CONF-01/02/05/07) [BLOCKING FIRST]
- [x] 01-03-PLAN.md — Types + zod schemas + YAML loader + DRY_RUN helper + scrubSecrets (CONF-02/03, DEDUP-07, COMP-01/05, OPS-10)
- [x] 01-04-PLAN.md — canonicalizeUrl + parseDate pure functions + TDD tests (DEDUP-02)
- [x] 01-05-PLAN.md — robots.txt + RSS scraper + fetch orchestrator (FETCH-03/04, COMP-03)
- [x] 01-06-PLAN.md — Gemini summarizer + prompt/schema with model fallback (SUMM-01..06)
- [x] 01-07-PLAN.md — dedup pure function + D-09 bootstrap + TDD tests (DEDUP-01/03)
- [x] 01-08-PLAN.md — digest composer + minimal HTML template + XSS escape + snapshot test (EMAIL-01/02/04)
- [x] 01-09-PLAN.md — Gmail SMTP mailer with DRY_RUN gate + fail-loud + 535 detection (EMAIL-03/06, OPS-06)
- [x] 01-10-PLAN.md — State reader/writer with version guard + 500-cap + atomic write (DEDUP-04/06/07, OPS-06)
- [x] 01-11-PLAN.md — Composition root main.ts with OPS-03 run-transaction ordering (OPS-03, FETCH-03, DEDUP-03)
- [x] 01-12-PLAN.md — GHA workflow daily.yml + user-secret registration checkpoint (OPS-01/02, DEDUP-06, COMP-01/03/04/05)

### Phase 2: Multi-Firm HTML Tier + Failure Isolation
**Goal**: All 12 target firms (7 KR, 3 US, 2 UK) run daily via the appropriate tier (RSS or HTML+cheerio), with per-firm failure isolation so one firm's scraper breaking never blocks the others.
**Depends on**: Phase 1
**Requirements**: FETCH-01, FETCH-02, DEDUP-05, EMAIL-05, EMAIL-07, CONF-04, CONF-06
**Success Criteria** (what must be TRUE):
  1. Intentionally breaking one firm's selector still produces a digest for the remaining firms, with the failed firm listed in the email footer and its error summary shown.
  2. Tier dispatch (`firm.type: rss | html`) works per firm from `config/firms.yaml`; Korean sites serving EUC-KR / CP949 decode correctly; relative URLs resolve to absolute before canonicalization.
  3. Adding a brand-new firm to `config/firms.yaml` and running once bootstraps its seen-URL set (no back-catalog flood in the next digest); flipping `enabled: false` hides a firm from the run without file deletion.
  4. Per-firm `include_keywords` / `exclude_keywords` filters match against item titles + summaries before Gemini summarization (saves quota on filtered-out items).
  5. SMTP transient 5xx retries with backoff; SMTP 535 authentication failure fails the workflow immediately with a `GMAIL_AUTH_FAILURE` marker and App Password regeneration link in the log.
**Plans**: 8 plans
Plans:
- [x] 02-01-PLAN.md — Schema + types + firms.yaml with 9 live + 3 disabled placeholders (D-P2-14/15/16/17; CONF-04, CONF-06)
- [x] 02-02-PLAN.md — util.ts charset-aware fetch + body extractor + TRACKING_PARAMS extension (D-P2-06/11/16)
- [x] 02-03-PLAN.md — scrapers/html.ts with plain-href + onclick-extract branches (FETCH-01)
- [x] 02-04-PLAN.md — pipeline/enrichBody.ts + pipeline/filter.ts (D-P2-02/07/10; FETCH-01, CONF-06)
- [x] 02-05-PLAN.md — Failed-firm email footer + classifyError (EMAIL-05)
- [x] 02-06-PLAN.md — SMTP selective retry via p-retry v8 + AbortError (EMAIL-07)
- [x] 02-07-PLAN.md — Dedup + writer D-P2-08 empty-state bootstrap guard (DEDUP-05)
- [x] 02-08-PLAN.md — fetch.ts Promise.allSettled + tier dispatch + main.ts wiring + D-P2-13 prompt routing (FETCH-01, FETCH-02, CONF-04)

### Phase 3: Observability + Dev Loop
**Goal**: Silent rot (one firm quietly returning zero items for weeks) becomes observable — in the digest itself, in GHA step summary, and via a single-firm CLI probe. The builder can diagnose and fix a firm without pushing to main and waiting for cron.
**Depends on**: Phase 2
**Requirements**: OPS-04, OPS-05, OPS-07, OPS-08, OPS-09
**Success Criteria** (what must be TRUE):
  1. Artificially setting a firm's `lastNewAt` back 31 days causes the next digest to display a staleness warning at the top of the email with that firm listed.
  2. If the previous successful run is more than 30 hours old, the next digest's header shows a "previous run missed — N hours since last run" banner.
  3. `pnpm check:firm <id>` runs a single firm end-to-end (raw fetch → parsed items → would-summarize → would-render) and prints each stage's output without sending an email or writing state.
  4. Each GHA run publishes a markdown table to `$GITHUB_STEP_SUMMARY` listing per-firm fetched / new / summarized / errors / duration.
  5. Every sent digest is committed to `archive/YYYY/MM-DD.html` in-repo so the history is greppable via `git log`.
**Plans**: TBD

### Phase 4: JS-Rendered Tier (conditional)
**Goal**: Complete the `FETCH-01` tiered-strategy contract by adding Playwright for any firm that genuinely requires JS rendering, verified empirically — or skip the phase entirely if the Phase 2 audit proves no firm needs it.
**Depends on**: Phase 2, Phase 3
**Requirements**: (none — this phase completes the JS-render branch of FETCH-01 only if an audited firm requires it; may be skipped with zero v1 coverage impact)
**Success Criteria** (what must be TRUE):
  1. Phase 2 empirical audit produces a documented per-firm list indicating which (if any) firms return empty results from RSS and cheerio but contain items in a JS-rendered DOM; if the list is empty, this phase is explicitly marked "skipped" in STATE.md and the phase closes.
  2. (If any firms qualify) Those firms return items via `scrapers/jsRender.ts` using Playwright `chromium --only-shell` with a per-firm `wait_for` selector; previously-empty digests for those firms now populate.
  3. (If any firms qualify) Total GHA run time stays under 3 minutes even with the JS-rendered tier active; Playwright browser binary is cached via `actions/cache` keyed on Playwright version.
**Plans**: TBD
**Note**: This phase is conditional. Entry gate: Phase 2 per-firm audit must show at least one firm that genuinely requires JS rendering (browser DevTools confirms items are JS-injected, cheerio fixture returns empty). If the audit shows zero qualifying firms, skip this phase and close it with "skipped — no qualifying firms" — Phase 5 becomes the next phase.

### Phase 5: Triggered Polish (v1.x backlog)
**Goal**: A holding zone for items that only earn their complexity cost when a specific trigger condition fires. Nothing in this phase is pre-committed; items activate individually on observed pain.
**Depends on**: Phase 3, Phase 4
**Requirements**: (none — v2 backlog items from REQUIREMENTS.md §v2: TAG-01, MANUAL-01, LINK-01, QUOTA-01, PLAIN-01, CACHE-01, ARCH-01, STATE-01)
**Success Criteria** (what must be TRUE):
  1. Each v2/v1.x item remains deferred until its named trigger condition is observed and logged (e.g., TAG-01 activates when skim speed degrades; LINK-01 activates when a broken link is clicked; CACHE-01 activates when a retry burns duplicate Gemini quota).
  2. When a trigger fires, the corresponding item is promoted to a planned sub-phase (e.g., 5.1) with its trigger evidence captured in PROJECT.md Key Decisions before any code lands.
  3. No item in this phase ships speculatively — the phase is explicitly non-committal and can be closed (or indefinitely held open) without blocking a milestone.
**Plans**: TBD (activated per trigger)
**Note**: This phase is a triggered backlog, not a planned sprint. `/gsd-insert-phase` is the mechanism for promoting an individual item into a 5.x decimal phase when its trigger fires.

---

## Milestone v1.1 — Data-Quality Hardening

**Goal:** Elevate production output to trustworthy quality — hallucinated summaries eliminated, every enabled firm extracting real article body, Cooley restored, cron resumed.

**Entry condition:** v1.0 Phase 02 UAT (2026-04-19) confirmed that html-tier firms bkl and kim-chang produce hallucinated summaries due to SPA detail pages. Cron paused until all v1.1 acceptance criteria met.

**Arc:** Audit → Fix extraction → Guard summarization → Restore Cooley → Surface quality metrics → Resume cron.

### Phase 6: Firm Audit + Probe
**Goal**: Every enabled firm's actual extraction quality is documented — which firms return real article body, which return SPA/generic content, which fail list fetch entirely — so subsequent phases fix the right things.
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria** (what must be TRUE):
  1. Running the probe against all enabled firms reports item count and selector-match status for each firm's list page (e.g., "bkl: 9 items extracted" or "shin-kim: 0 items — fetch-fail").
  2. Running the probe against bkl fetches 2+ detail URLs and flags identical extracted bodies across distinct URLs as SPA/hallucination risk.
  3. `.planning/phases/06-firm-audit/06-AUDIT.md` exists and contains a per-firm diagnosis row for each enabled firm using the defined status vocabulary (OK / list-fail / selector-empty / detail-identical / detail-empty / detail-quality-unknown).
  4. Each firm row with a non-OK status has an explicit remediation path recorded (one of: enable js-render detail, fix selector, disable firm, or migrate to sitemap tier).
**Plans**: 5 plans
Plans:
- [x] 06-01-PLAN.md — Loader extension (LoadFirmsOptions{includeDisabled}) + audit/types.ts (Status/Remediation/AuditRow/AuditReport/RunOptions) [AUDIT-01/03/04]
- [x] 06-02-PLAN.md — signals.ts 4-signal pure functions + 35-test signals.test.ts (TDD RED→GREEN, Pitfall 1 vacuous-fire guard) [AUDIT-02/03]
- [x] 06-03-PLAN.md — writer.ts markdown serializer + snapshot test + .prettierignore (TS never-exhaustiveness on Status/Remediation enums) [AUDIT-03/04]
- [x] 06-04-PLAN.md — firmAudit.ts orchestrator (allSettled isolation, tier dispatch, Playwright lifecycle, atomic writeFile) + 14 integration tests [AUDIT-01/02/03/04]
- [x] 06-05-PLAN.md — auditFirms.ts CLI + package.json audit:firms script + DELETE scripts/detail-page-audit.ts + human-verify checkpoint [AUDIT-01/03]

### Phase 7: SPA-Aware Detail Tier
**Goal**: Firms whose detail pages are JS-rendered can declare `detail_tier: 'js-render'` in `config/firms.yaml` so their article bodies are fetched via Playwright — independent of how their list page is fetched.
**Depends on**: Phase 6 (audit identifies which firms need js-render detail)
**Requirements**: DETAIL-01, DETAIL-02, DETAIL-03, DETAIL-04, DETAIL-05
**Success Criteria** (what must be TRUE):
  1. A firm with `type: html` and `detail_tier: 'js-render'` in firms.yaml has its detail URLs fetched via Playwright; a firm with no `detail_tier` field behaves identically to before (static fetch, backwards compatible).
  2. After setting `detail_tier: 'js-render'` on bkl, running `pnpm check:firm bkl` shows 2+ items with distinct, non-identical extracted body text (not generic firm landing page).
  3. After setting `detail_tier: 'js-render'` on kim-chang, running `pnpm check:firm kim-chang` shows at least one item with non-empty extracted body.
  4. Setting `detail_tier: 'invalid-value'` in firms.yaml causes startup to fail with a zod error that includes the precise YAML path (e.g., `firms[2].detail_tier`).
**Plans**: 6 plans
Plans:
- [x] 07-01-PLAN.md — detail_tier zod field + FirmConfig TS type + schema test block (DETAIL-01, DETAIL-05)
- [x] 07-02-PLAN.md — enrichBody branch swap (type→detail_tier gate) + run.ts hasJsRender predicate extension (DETAIL-02, DETAIL-03)
- [x] 07-03-PLAN.md — 6-firm YAML migration (bkl/kim-chang/lee-ko/yoon-yang/barun/latham) + header stanza + bkl audit flip verification (DETAIL-04)
- [x] 07-04-PLAN.md — Selector remediation for logos/skadden/lee-ko/barun via probe-fix-probe iteration loop (DETAIL-04)
- [x] 07-05-PLAN.md — kim-chang root-cause investigation + remediation (fix URL | fix selector | disable-with-reason per D-10) (DETAIL-04)
- [x] 07-06-PLAN.md — Full phase verification: regenerate audit + test suite + UAT regression checkpoint + VERIFICATION.md (DETAIL-01..DETAIL-05)

### Phase 8: Hallucination Guard
**Goal**: Gemini is prevented from producing plausible-sounding but fabricated summaries when article body is absent, too short, or generic boilerplate — and clusters of identical summaries within a single firm's digest are automatically detected and flagged.
**Depends on**: Phase 7 (extraction fixed first; guard is defense-in-depth, not the primary fix)
**Requirements**: GUARD-01, GUARD-02, GUARD-03, GUARD-04
**Success Criteria** (what must be TRUE):
  1. Sending an empty body string to the summarizer produces `summary_ko` equal to the item title verbatim and `confidence: 'low'` — not a fabricated 3-sentence summary.
  2. Sending a body shorter than 100 characters or a generic-firm-overview text to the summarizer produces the same title-verbatim + confidence:low result; sending a real article body (200+ chars, content-specific) produces a genuine 3–5 line Korean summary.
  3. After summarizing a simulated bkl batch where 5 items share the same first 50 chars of summary, the run log contains a `HALLUCINATION_CLUSTER_DETECTED` marker with the firm id, and all 5 items are demoted to `confidence: 'low'`.
  4. The `HALLUCINATION_CLUSTER_DETECTED` marker appears in the GHA step-summary output and in the email footer — visible without opening raw logs.
**Plans**: 6 plans
Plans:
- [x] 08-01-PLAN.md — Layer 1 short-circuit + Layer 2 prompt rule + B3 title-verbatim + Gemini API-fail promotion + isClusterMember type (GUARD-01)
- [x] 08-02-PLAN.md — 4-body-shape fixture tests + prompt.test.ts Layer 2 assertions + run.test.ts reconciliation (GUARD-02)
- [x] 08-03-PLAN.md — detectClusters.ts pure function + run.ts hook + markers hoisting + writeStepSummary signature extension (GUARD-03)
- [x] 08-04-PLAN.md — Template D-04 null-branch removal + D-13 B3 badge + D-11/D-12 fold UI + D-14 renderDataQualityFooter + digest.test.ts updates (GUARD-04 email footer)
- [x] 08-05-PLAN.md — clusterDetection.test.ts 12 unit tests (threshold / scope / immutability / multibyte / D-16 format) (GUARD-03)
- [x] 08-06-PLAN.md — writeStepSummary D-15 markdown section rendering + test coverage (GUARD-04 step-summary)

### Phase 9: Cooley Sitemap Tier
**Goal**: Cooley is restored as an active, monitored firm by routing through a new `type: sitemap` scraper that reads WordPress sitemap XML to discover recent articles and Playwright to extract body — bypassing the Cloudflare-blocked RSS endpoint.
**Depends on**: Phase 7 (Playwright detail extraction already generalized; sitemap tier reuses that path)
**Requirements**: SITEMAP-01, SITEMAP-02, SITEMAP-03, SITEMAP-04, SITEMAP-05
**Success Criteria** (what must be TRUE):
  1. `src/scrapers/sitemap.ts` parses `<url><loc><lastmod>` from a given sitemap XML URL and returns the top-N most recent URLs sorted by lastmod descending.
  2. A firm configured with `type: sitemap` and pointing at `https://www.cooleygo.com/post-sitemap.xml` produces items in the digest; Cooley is no longer listed in the email footer as a failed firm.
  3. `pnpm check:firm cooley` reports N > 0 items with non-empty extracted body text for each sampled item.
  4. Firms with existing `type: rss`, `type: html`, or `type: js-render` config are unaffected — no regressions in their fetch behavior (180+ existing tests still pass).
**Plans**: 3/3 complete (09-01 schema, 09-02 scraper, 09-03 pipeline-wiring + Cooley restoration) — Phase 9 CLOSED 2026-04-21

### Phase 10: Data-Quality Observability
**Goal**: Per-firm body-quality metrics (average body length, generic-body guard trigger count, confidence distribution) are visible in the GHA step-summary and email footer so quality degradation surfaces without requiring log inspection.
**Depends on**: Phase 8 (GUARD metrics must exist before they can be surfaced)
**Requirements**: DQOBS-01, DQOBS-02, DQOBS-03
**Success Criteria** (what must be TRUE):
  1. Each GHA run's step-summary table includes per-firm columns for average body length, number of generic-body guard triggers, and confidence distribution (high / medium / low counts).
  2. A simulated run where a firm produces 4 out of 6 items with `confidence: 'low'` causes both the step-summary and the email footer to flag that firm as a data-quality concern.
  3. Running with `DRY_RUN=1` prints the full DQOBS metrics table to stdout without writing state or sending email — usable for pre-cron sanity check.
**Plans**: 3 plans
  - [ ] 10-01-PLAN.md — Recorder extension (FirmMetrics widening + 9-column toMarkdownTable + three new write-sites in run.ts)
  - [ ] 10-02-PLAN.md — DataQualityMarker discriminated union + detectLowConfidence detector + shared renderMarkersMarkdown helper + D-05 Korean wording
  - [ ] 10-03-PLAN.md — RunReport expose markers + firms + main.ts DRY_RUN stdout emission (fourth sanctioned DRY_RUN site)

### Phase 11: Cron Resumption Gate
**Goal**: The daily cron schedule is restored only after a manual end-to-end run confirms zero hallucination regressions across all enabled firms, and that acceptance is recorded with a date in STATE.md.
**Depends on**: Phase 6, Phase 7, Phase 8, Phase 9, Phase 10 (all prior v1.1 phases must be complete)
**Requirements**: RESUME-01, RESUME-02
**Success Criteria** (what must be TRUE):
  1. A manual `workflow_dispatch` run completes successfully and the resulting digest email is visually inspected — every item's Korean summary reflects content specific to that article (not a generic firm description or title verbatim without cause).
  2. `.github/workflows/daily.yml` has its `schedule:` block uncommented and a dated acceptance note is present in STATE.md recording the inspection result and confirming cron resumption.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order. Phase 4 is conditional — skipped if Phase 2 audit shows no qualifying firms. Phase 5 is a triggered backlog. Phase 11 is terminal — must not execute until Phases 6–10 all pass.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Vertical Slice | 12/12 | Complete | 2026-04-17 |
| 2. Multi-Firm HTML Tier + Failure Isolation | 8/8 | Complete | 2026-04-19 |
| 3. Observability + Dev Loop | 5/5 + 1 deferred (03-06 supplement) | Complete | 2026-04-18 |
| 4. JS-Rendered Tier (conditional) | 8/8 | Complete | 2026-04-19 |
| 5. Triggered Polish (v1.x backlog) | 1/1 | Complete (parent-close pending D-10.2) | 2026-04-19 |
| 6. Firm Audit + Probe | 5/5 | Complete | 2026-04-20 |
| 7. SPA-Aware Detail Tier | 6/6 | Complete (with exceptions) | 2026-04-20 |
| 8. Hallucination Guard | 0/0 | Pending | — |
| 9. Cooley Sitemap Tier | 1/3 | Executing | — |
| 10. Data-Quality Observability | 0/0 | Pending | — |
| 11. Cron Resumption Gate | 0/0 | Pending | — |

## ⚠ v1.0 Milestone — Production Readiness Caveat

All 5 phases pass their stated Success Criteria at code-path level (180+ unit
tests, all green). However, a Phase 02 UAT demo on 2026-04-19 revealed that
the actual **production output is not trustworthy**:

- **bkl detail pages are SPA** — every detail URL returns the same landing-page
  HTML, so all items receive an identical generic-firm body. Gemini then
  hallucinates per-item summaries from title alone.
- **kim-chang detail fetches fail** — body stays empty; Gemini hallucinates.
- **shin-kim list fetch fails; logos / skadden list selectors return zero items.**
- **Cooley RSS is Cloudflare-blocked** (separate backlog).
- **Gemini prompt lacks a generic-body hallucination guard** — defense-in-depth
  is missing; there is no prompt-level rule to refuse summary generation when
  the body is empty or looks like a site-wide boilerplate.

**Scheduled cron is paused** (`.github/workflows/daily.yml` `schedule:` commented
out; `workflow_dispatch` remains available for probes). The v1.0 milestone
delivered its planned scope, but a follow-on **v1.1 "data-quality hardening"
milestone is required before the cron can resume**. Full finding list and
proposed phase breakdown:
`.planning/backlog/v1.0-data-quality-audit.md`.

---
*Roadmap created: 2026-04-16*
*v1.1 phases appended: 2026-04-19*
