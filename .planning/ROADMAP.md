# Roadmap: LegalNewsletter

**Created:** 2026-04-16
**Granularity:** coarse (3–5 phases)
**Coverage:** 46/46 v1 requirements mapped

## Overview

LegalNewsletter ships as a vertical slice first (one firm end-to-end through fetch → dedup → summarize → email → state commit), then scales horizontally (multi-firm HTML tier + per-firm failure isolation), then hardens against silent rot (staleness alerts + dev-loop CLI + archive). A conditional JS-rendered tier follows only if the Phase 2 empirical audit identifies a firm that genuinely requires it. Phase 5 is a triggered backlog — items activate only when their specific pain surfaces. Every PITFALLS.md `[CHEAP NOW]` item lands in Phase 1 or Phase 2 (canonicalization, timezone handling, run-transaction ordering, concurrency key, fail-loud SMTP, secrets hygiene, honest UA + robots.txt); retrofitting any of these is multi-day work on corrupted state.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation + Vertical Slice** - One firm end-to-end through Gemini + Gmail + committed state, with every "cheap now" pitfall baked in
- [ ] **Phase 2: Multi-Firm HTML Tier + Failure Isolation** - All 12 firms live via tiered fetch (RSS + cheerio HTML), one firm's breakage never zeros the digest
- [ ] **Phase 3: Observability + Dev Loop** - Silent rot becomes visible (staleness alerts, step summary, archive, check:firm CLI, operational README)
- [ ] **Phase 4: JS-Rendered Tier (conditional)** - Playwright tier only if Phase 2 audit proves some firm actually requires JS rendering; otherwise skip
- [ ] **Phase 5: Triggered Polish (v1.x backlog)** - Each item activates only when its named trigger condition fires; none are pre-committed

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
- [ ] 01-05-PLAN.md — robots.txt + RSS scraper + fetch orchestrator (FETCH-03/04, COMP-03)
- [x] 01-06-PLAN.md — Gemini summarizer + prompt/schema with model fallback (SUMM-01..06)
- [x] 01-07-PLAN.md — dedup pure function + D-09 bootstrap + TDD tests (DEDUP-01/03)
- [ ] 01-08-PLAN.md — digest composer + minimal HTML template + XSS escape + snapshot test (EMAIL-01/02/04)
- [ ] 01-09-PLAN.md — Gmail SMTP mailer with DRY_RUN gate + fail-loud + 535 detection (EMAIL-03/06, OPS-06)
- [ ] 01-10-PLAN.md — State reader/writer with version guard + 500-cap + atomic write (DEDUP-04/06/07, OPS-06)
- [ ] 01-11-PLAN.md — Composition root main.ts with OPS-03 run-transaction ordering (OPS-03, FETCH-03, DEDUP-03)
- [ ] 01-12-PLAN.md — GHA workflow daily.yml + user-secret registration checkpoint (OPS-01/02, DEDUP-06, COMP-01/03/04/05)

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
**Plans**: TBD

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
**Depends on**: Phase 2
**Requirements**: (none — this phase completes the JS-render branch of FETCH-01 only if an audited firm requires it; may be skipped with zero v1 coverage impact)
**Success Criteria** (what must be TRUE):
  1. Phase 2 empirical audit produces a documented per-firm list indicating which (if any) firms return empty results from RSS and cheerio but contain items in a JS-rendered DOM; if the list is empty, this phase is explicitly marked "skipped" in STATE.md and the phase closes.
  2. (If any firms qualify) Those firms return items via `scrapers/jsRender.ts` using Playwright `chromium --only-shell` with a per-firm `wait_for` selector; previously-empty digests for those firms now populate.
  3. (If any firms qualify) Total GHA run time stays under 3 minutes even with the JS-rendered tier active; Playwright browser binary is cached via `actions/cache` keyed on Playwright version.
**Plans**: TBD
**Note**: This phase is conditional. Entry gate: Phase 2 per-firm audit must show at least one firm that genuinely requires JS rendering (browser DevTools confirms items are JS-injected, cheerio fixture returns empty). If the audit shows zero qualifying firms, skip this phase and close it with "skipped — no qualifying firms" — Phase 5 becomes the next phase.

### Phase 5: Triggered Polish (v1.x backlog)
**Goal**: A holding zone for items that only earn their complexity cost when a specific trigger condition fires. Nothing in this phase is pre-committed; items activate individually on observed pain.
**Depends on**: Phase 3 (Phase 4 if it ran, otherwise Phase 3)
**Requirements**: (none — v2 backlog items from REQUIREMENTS.md §v2: TAG-01, MANUAL-01, LINK-01, QUOTA-01, PLAIN-01, CACHE-01, ARCH-01, STATE-01)
**Success Criteria** (what must be TRUE):
  1. Each v2/v1.x item remains deferred until its named trigger condition is observed and logged (e.g., TAG-01 activates when skim speed degrades; LINK-01 activates when a broken link is clicked; CACHE-01 activates when a retry burns duplicate Gemini quota).
  2. When a trigger fires, the corresponding item is promoted to a planned sub-phase (e.g., 5.1) with its trigger evidence captured in PROJECT.md Key Decisions before any code lands.
  3. No item in this phase ships speculatively — the phase is explicitly non-committal and can be closed (or indefinitely held open) without blocking a milestone.
**Plans**: TBD (activated per trigger)
**Note**: This phase is a triggered backlog, not a planned sprint. `/gsd-insert-phase` is the mechanism for promoting an individual item into a 5.x decimal phase when its trigger fires.

## Progress

**Execution Order:**
Phases execute in numeric order. Phase 4 is conditional — skipped if Phase 2 audit shows no qualifying firms. Phase 5 is a triggered backlog.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Vertical Slice | 0/12 | Not started | - |
| 2. Multi-Firm HTML Tier + Failure Isolation | 0/TBD | Not started | - |
| 3. Observability + Dev Loop | 0/TBD | Not started | - |
| 4. JS-Rendered Tier (conditional) | 0/TBD | Not started | - |
| 5. Triggered Polish (v1.x backlog) | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-16*
