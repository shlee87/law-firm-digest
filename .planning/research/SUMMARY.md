# Project Research Summary

**Project:** LegalNewsletter — personal law-firm newsletter aggregator
**Domain:** Cron-driven multi-source scraping + LLM-summarization + email-digest pipeline (single user, $0/mo)
**Researched:** 2026-04-16
**Confidence:** HIGH overall — stack/architecture/features are well-supported by primary sources; one PROJECT.md number needs correction (Gemini RPD) and per-firm anti-bot posture must be verified empirically during Phase 2.

---

## Executive Summary

This project is a **single-process, once-a-day batch pipeline** that wakes up on a GitHub Actions cron, fetches 12 law-firm newsletter pages (7 KR / 3 US / 2 UK), deduplicates against in-repo JSON state, summarizes new items in Korean via the Gemini free tier, and sends one combined digest via Gmail SMTP — then exits. It is not a service. Every design choice (no DB, no queues, no long-lived workers, config-as-file, state-as-git-commit) falls out of the `$0/month` + single-recipient + unattended-cron constraints. The recommended stack is Node 22 LTS + TypeScript, with `@google/genai` (the new GA SDK — **not** the deprecated `@google/generative-ai`), `cheerio` + `feedparser` + `playwright` (tiered per-firm), `nodemailer` for Gmail App Password auth, and `eemeli/yaml` + `zod` for non-developer-editable firm config validated at startup.

The **dominant risk is not catastrophic failure** — it is **silent rot**: one firm's selectors break, it silently returns zero items, and six weeks pass before anyone notices the firm vanished from the digest. The entire design is organized around surfacing that class of failure — per-firm failure isolation via `Promise.allSettled`, stale-firm heuristics (30+ days with no new items → footer warning), mandatory fail-loud on SMTP errors, a digest footer that enumerates broken firms, and a run-transaction ordering (state-write strictly AFTER email-send) that makes retries idempotent. Seventeen table-stakes features (T1–T17) plus twelve near-zero-cost differentiators (D1, D3, D5, D6, D7, D8, D9, D10, D11, D12, D13, D17, D18) must all ship in v1; none are negotiable because each one either is explicitly required by PROJECT.md, prevents a silent failure mode, or is the dev loop that makes every other feature maintainable.

The **build order is opinionated and non-obvious**: ship a vertical slice (one firm, ideally RSS-exposing, end-to-end through Gemini + Gmail + committed state) before adding the second firm. Only after that slice runs autonomously for a few days do you add the HTML-cheerio tier (covers most KR firms), then per-firm failure isolation + concurrency (critical once firm count ≥3), then the Playwright tier (only if any target firm genuinely requires JS rendering — verify first, default is no), then observability polish (GHA step summary, stale-firm alerts, dev-loop CLI). This ordering matters because it front-loads the riskiest integrations (Gemini prompt shape, Gmail App Password, state commit-back) onto a minimum surface area where they can be debugged in hours, not days.

---

## Key Findings

### Recommended Stack

From `STACK.md` (confidence HIGH except where noted):

**Core technologies:**
- **Node.js 22 LTS + TypeScript 5.7 via tsx** — built-in fetch, native ESM, `lts/*` resolves instantly on GHA; Python is equally valid but Node keeps the whole stack (Gemini SDK, cheerio, Playwright, nodemailer) in one language. Deno/Bun rejected for GHA reliability on native modules.
- **`@google/genai` 1.49.x** — the official GA SDK. **Do NOT use `@google/generative-ai`** (deprecated). Auth via `GEMINI_API_KEY` env, auto-detected.
- **`gemini-2.5-flash` (primary) + `gemini-2.5-flash-lite` (fallback on 429)** — **not** `gemini-2.0-flash` (retiring June 2026).
- **`cheerio` 1.2.0 + `feedparser` 2.3.x + `playwright` 1.58.x (tiered)** — RSS first, HTML+cheerio second, Playwright `chromium --only-shell` only for firms that truly need JS rendering. Do NOT default everything to Playwright (150MB binary, 3× runtime).
- **`nodemailer` 6.10.x / 7.x with Gmail App Password** — 2FA required; `GMAIL_APP_PASSWORD` secret; self-to-self Gmail delivery is the lowest-friction $0 path. Resend is a viable backup only if user owns a domain.
- **`eemeli/yaml` 2.7.x + `zod` 3.24.x** — YAML for non-developer config with preserved comments, zod for fail-fast schema validation at startup.
- **In-repo JSON state (`state/seen.json`) + `stefanzweifel/git-auto-commit-action@v6`** — permanent dedup store; **NOT** `actions/cache` (7-day TTL breaks dedup during quiet weeks). `[skip ci]` in commit message required to prevent infinite trigger loop.
- **Supporting:** `p-limit` (concurrency 3), `p-retry` (backoff), `date-fns-tz` (timezone-correct parsing), `vitest` (tests), `tsx` (no-build run).

### Critical Cross-Document Correction: Gemini Free-Tier Quota

**PROJECT.md states "1,500 req/day"** — this is outdated. As of December 2025, Google cut free-tier quotas by 50–80% citing fraud. Current verified ceilings (April 2026):

| Model | RPM | **RPD** | TPM |
|-------|-----|---------|-----|
| `gemini-2.5-flash` (primary) | 10 | **~250** | 250K shared |
| `gemini-2.5-flash-lite` (fallback) | 15 | **~1,000** | 250K shared |
| `gemini-2.5-pro` | 5 | **~100** | 250K shared |

Reset is at **midnight Pacific time** (not UTC — a GHA run at 09:00 UTC is "yesterday" in PT until 08:00 UTC). Google no longer publishes one canonical RPD number; plan for 250 as conservative floor.

**Practical implication:** 12 firms × ~5 new items/day = ~60 summary calls/day — comfortably under 250 RPD Flash, but with much less headroom than PROJECT.md implied. Architecture must handle burst days (a single firm posting a 15-item year-end roundup can spike the day's count) via Flash → Flash-Lite auto-fallback and a `summary_pending` status for items that exceed the daily budget (see Pitfall 10). **PROJECT.md should be updated at the first phase transition to reflect the 250 RPD reality and the reset-at-midnight-PT detail.**

### Expected Features

From `FEATURES.md` (confidence HIGH — driven by explicit PROJECT.md requirements).

**Must have (T1–T17, all non-negotiable — absence causes silent cron failure modes):**
- **T1** YAML declarative firm config; **T2** zod schema validation at startup
- **T3** tiered fetch (RSS → static HTML → JS-render)
- **T4** URL-keyed cross-run dedup; **T5** new-only emission, skip-empty-days
- **T6** Korean Gemini summary (flash primary, flash-lite fallback)
- **T7** single combined digest email; **T8** per-firm sectioning with source links
- **T9** per-firm graceful failure isolation (`Promise.allSettled`); **T10** failure summary in email footer
- **T11** secrets via GHA Secrets (never committed); **T12** configurable recipient
- **T13** scraping politeness (1 req/site/day, honest UA, robots.txt)
- **T14** persistent state committed back to repo with `[skip ci]`
- **T15** timezone-correct schedule (09:00 UTC, not 00:00)
- **T16** idempotent retries (state write strictly AFTER email send)
- **T17** structured per-firm run logs to GHA output

**v1 differentiators that ship immediately (near-zero cost, compound value — all P1):**
- **D1** per-firm include/exclude keyword filters
- **D3** consecutive-failure / stale-firm alert (catches silent decay — THE keystone observability feature)
- **D5** `check:firm <id>` CLI probe (the dev loop)
- **D6** `DRY_RUN=1` full-pipeline rehearsal
- **D7** `archive/YYYY-MM-DD.html` committed digest archive
- **D8** `$GITHUB_STEP_SUMMARY` run dashboard
- **D9** `p-retry` + Gemini model auto-fallback
- **D10** Gemini `responseSchema` structured JSON output (eliminates free-form-text parsing bugs)
- **D11** seen-URL cap at 500 per firm (prevents unbounded state growth)
- **D12** original-language title guard (title never enters Gemini)
- **D13** per-firm `enabled: true/false` flag
- **D17** SMTP retry on transient 5xx
- **D18** first-run bootstrap dedup for newly added firms (prevents 40-item back-catalog flood)

**Defer to v1.x (add when specific pain shows up):**
- D2 practice-area tag extraction; D4 manual URL ingestion via `workflow_dispatch`; D14 link-health HEAD check; D16 per-run Gemini quota monitor; D15 plaintext multipart email.

**Explicitly NOT building (anti-features from PROJECT.md Out-of-Scope, confirmed across FEATURES.md A1–A18):**
- Web UI / dashboard; multi-recipient; unsubscribe link; real-time push; full-body redistribution; title-to-Korean translation; Slack/Discord/Telegram channels; AI cross-firm clustering; importance scoring; multiple digests per day; paid API / paid hosting of any kind.

### Architecture Approach

From `ARCHITECTURE.md` (confidence HIGH on component boundaries, MEDIUM on exact error-boundary tuning).

Single-process batch pipeline with strict one-way dataflow. All boundaries pass typed data (`FirmConfig` → `RawItem[]` → `NewItem[]` → `SummarizedItem[]` → `EmailPayload` → `RunReport`), never raw HTTP responses. Orchestrator in `src/main.ts` is the only place that composes components.

**Major components:**
1. **ConfigLoader** (`src/config/`) — parses `config/firms.yaml`, validates with zod, produces typed `FirmConfig[]`. Fails fast on schema errors with precise paths.
2. **Scraper (tiered)** (`src/scrapers/`) — three strategy files (`rss.ts`, `html.ts`, `jsRender.ts`), dispatched by `firm.type`. Each exports identical `scrape(firm): Promise<RawItem[]>` signature. New scrape strategies = drop a file + register.
3. **FetchOrchestrator** (`src/pipeline/fetch.ts`) — `p-limit(3)` + `Promise.allSettled` with per-firm `try/catch`. Errors become `FirmResult.error` data, never thrown. This is **the keystone reliability feature** — 12 firms × 365 days = ~4,300 fetch events/year; one firm's crash must never kill the run.
4. **Dedup** (`src/pipeline/dedup.ts`) — pure function, `RawItem[] × SeenState → NewItem[]`, trivially testable offline.
5. **Summarizer** (`src/summarize/`) — single-item Gemini call with `responseMimeType: 'application/json'` + `responseSchema` for `{summary_ko, confidence}`, zod-parsed on return. Flash → Flash-Lite fallback on 429; `confidence: low` + null summary path for thin-context items (prevents hallucination).
6. **Composer** (`src/compose/`) — pure template function `SummarizedItem[] → {subject, html, text}`. Snapshot-tested.
7. **Mailer** (`src/mailer/gmail.ts`) — thin nodemailer wrapper; checks `isDryRun()` helper. One of exactly **two** DRY_RUN check-sites.
8. **StateReader/Writer** (`src/state/`) — load `seen.json` at start, merge + trim to 500 per firm + write at end. Second and final DRY_RUN check-site.
9. **RunReporter** (`src/report/`) — markdown to `$GITHUB_STEP_SUMMARY`, stdout logs.
10. **CLI probe** (`src/cli/checkFirm.ts`) — `pnpm check:firm <id>` single-firm end-to-end.

**State schema:** `state/seen.json` = `{version: 1, lastUpdated, firms: {<id>: {urls: string[], lastNewAt}}}`. Per-firm nested (not flat), capped at 500 URLs each, newest-first for clean diffs. `version` field enables future migration. **Canonical URLs only** — tracking params (`utm_*`, `gclid`, `fbclid`, `mc_cid`, etc.) stripped before storage and comparison (see Pitfall 5).

### Critical Pitfalls

From `PITFALLS.md` (17 total; five highest-leverage summarized here — all flagged `[CHEAP NOW]`, all must be addressed in Phase 1 or 2 regardless of scope pressure).

1. **Silent firm-scraper decay (#1) + green-workflow-no-email (#2) [SILENT ROT]** — THE dominant failure class. A firm's selectors break, scraper returns `[]`, pipeline stays green, builder notices 6 weeks later. Prevention: per-firm `lastNewAt` + 30-day staleness warning in digest footer; distinguish "fetched 0 items" from "fetched N, 0 new" in logs; fail the workflow on SMTP send errors (NOT caught-and-logged); assert rendered body non-empty before send. All cheap now, multi-day forensics later.
2. **Non-idempotent retry (#4) + state-race on concurrent runs (#3) [CHEAP NOW]** — re-running a failed GHA run double-summarizes (burning Gemini quota) and double-emails. Prevention: `concurrency: {group: digest-pipeline, cancel-in-progress: false}` at workflow level (ONE YAML line); run-transaction ordering = state write strictly AFTER email send; optional `state/summary-cache.json` keyed by content hash so retries reuse summaries.
3. **URL-based dedup broken by tracking params, fragments, www, trailing slashes (#5) [CHEAP NOW]** — same article linked as `/insights/foo?utm_source=newsletter` and `/insights/foo` appears twice. Prevention: canonicalization helper (lowercase scheme+host, strip `www.`, strip fragment, strip known tracking params, strip trailing slash, sort query params) before storing AND comparing. Retrofitting = re-canonicalizing all historical state. Must land before first production run.
4. **Timezone boundary bugs (#6) [CHEAP NOW]** — bare `new Date(str)` parses unsuffixed dates in process-local zone (UTC on GHA, KST locally → different behavior in dry-run vs prod). KR firms don't DST, US/UK do, GHA cron is UTC — three calendars interacting. Prevention: per-firm `timezone` YAML field (`Asia/Seoul`, `America/New_York`, `Europe/London`); use `date-fns-tz` exclusively; store everything as UTC ISO; dedup by URL (never by `(firm, date)`); test vector: `2026-04-14T23:50:00+09:00` must canonicalize to `2026-04-14T14:50:00Z`.
5. **Gemini non-determinism + hallucination + quota exhaustion (#10) [CHEAP NOW]** — default temperature produces different summaries per call (archive ≠ sent email on retry); model confabulates plausible summaries on thin input; burst days exceed 250 RPD. Prevention: `temperature: 0.2`, `responseSchema` enforced, fetch article body (not just excerpt) before summarizing, prompt-instruct "return `{summary_ko: null, confidence: 'low'}` if content is insufficient"; on 429 honor `retryDelay` field from error body, fall back to Flash-Lite; per-item state tracks `summarizedAt` so `summary_pending` items naturally retry next run without duplicating non-pending items.

**Additional critical pitfalls worth tracking from Phase 1:**
- **#12 Copyright / ToS exposure** — Korean Supreme Court 2021도1533 (Saramin, 2022) held that scraping while concealing UA + ignoring robots.txt = unfair-competition activity. Prevention: honest UA (`LegalNewsletterBot/1.0 (+<repo>)`, not spoofed browser), respect robots.txt on every firm (parse before first scrape), 1 req/site/day, keep repo **private** (GHA private has 2,000 min/month, actual usage ~60 min/month), RSS preferred (explicit automation invitation).
- **#14 Gmail App Password revocation on Google password change** — changing Google account password silently revokes all App Passwords. Document in README at ship: regeneration link + the dependency.
- **#15 Secrets leakage via log objects** — `console.log(err)` on Axios-style errors dumps headers. Prevention: log `err.message` only, never whole error objects; pre-commit check against `.env` in staged files; log-scrubbing helper masking known secret values.
- **#17 Mental-model rot at 6 months** — future-builder can't remember config path, secret names, or how to trigger a manual run. Prevention: ~100-line operational README at v1 ship covering "if email didn't arrive, check: X / Y / Z", how to add a firm, how to debug selectors, required secrets, cron schedule.

---

## Implications for Roadmap

**Build-order signal from the research is unambiguous:** ship a **vertical slice (one firm end-to-end through Gemini + Gmail + committed state)** before adding the second firm. Every horizontal layer afterward is an independently shippable increment.

### Phase 1: Foundation + Vertical Slice (one firm, end-to-end)

**Rationale:** Front-load the riskiest integrations (Gemini prompt shape, Gmail App Password, state commit-back, timezone handling, canonical URLs, compliance stance) onto the smallest possible surface. Debug in hours on one firm before multiplying the problem across 12. Every "cheap now, expensive later" pitfall from PITFALLS.md must land here — they are all foundational decisions that are painful to retrofit.

**Delivers:**
- `types.ts` — complete contract surface for the entire pipeline
- `config/firms.yaml` with ONE entry (ideally an RSS-exposing firm like Cooley Alerts)
- ConfigLoader + zod schema + `.strict()` unknown-key rejection
- One scraper strategy (RSS preferred — simpler, more reliable)
- StateReader / StateWriter with **canonical-URL dedup** + **500/firm cap** + `version: 1` schema field
- Summarizer with `@google/genai`, `temperature: 0.2`, `responseMimeType: 'application/json'`, `responseSchema`, Flash→Flash-Lite fallback, `confidence: low` null-summary path
- Composer → HTML + plaintext + predictable Subject (`[법률 다이제스트] YYYY-MM-DD (N firms, M items)`)
- Mailer with DRY_RUN gate and **fail-loud on SMTP errors**
- Orchestrator wiring with run-transaction ordering (email BEFORE state write)
- Log-scrubbing helper + `.gitignore`-ed `.env` + `.env.example`
- `.github/workflows/daily.yml` with `permissions: contents: write`, `concurrency: {group: digest-pipeline, cancel-in-progress: false}`, `[skip ci]` in state commit, `workflow_dispatch`-only trigger initially (cron enabled at end of phase)
- `COMPLIANCE.md` scaffold + honest User-Agent + robots.txt check + private-repo decision recorded
- One real live run to builder's inbox, confirmed

**Addresses features:** T1, T2, T4 (partial), T5, T6, T7, T8 (partial — one firm), T11, T12, T13, T14, T15, T16, T17, D6, D9, D10, D11, D12, D18

**Avoids pitfalls:** #4 (run-transaction ordering), #5 (canonicalization from day one), #6 (timezone handling baked in), #10 (structured output + temperature), #12 (compliance stance), #14 (App Password docs), #15 (secrets hygiene)

**Exit criterion:** One firm runs autonomously on cron for 3+ days. No duplicates across runs. DRY_RUN prints a clean digest. "Re-run failed jobs" doesn't double-send.

### Phase 2: Multi-Firm HTML Tier + Per-Firm Failure Isolation

**Rationale:** With one firm proven stable, add the HTML+cheerio tier (covers most Korean and many US firms). Once firm count ≥3, per-firm failure isolation (T9) becomes non-negotiable — one firm's selector breakage must not zero out the digest. Korean encoding detection (EUC-KR / CP949 via `iconv-lite`) is cheap to add now, painful to add after selectors exist for all 12 firms.

**Delivers:**
- `scrapers/html.ts` with cheerio + per-firm YAML selectors + relative-URL resolution + encoding detection (`content-type` header + `<meta charset>` fallback + iconv-lite for legacy EUC-KR)
- `scrapers/util.ts` — URL canonicalization, date parsing with timezone, relative-URL absolutization
- `scrapers/index.ts` dispatch by `firm.type`
- FetchOrchestrator with `p-limit(3)` + `Promise.allSettled` + per-firm try/catch + retry via `p-retry`
- Anti-bot challenge-page detection helper (log-only in Phase 2; real action in Phase 3)
- `test/fixtures/<firm>.html` per firm + fixture-based unit tests for each scraper
- All 7 KR firms + 3 US firms + 2 UK firms added to `firms.yaml` with `type: html` (or `type: rss` where available)
- Per-firm `timezone` field + `enabled: true/false` flag + optional `requires_cookie` / `user_agent` overrides
- First-run bootstrap dedup (D18) so adding a firm doesn't flood the first digest with its back catalog

**Addresses features:** T1 (full 12 firms), T3, T8 (full sectioning), T9, D1 (keyword filters can land here), D11, D13, D18

**Avoids pitfalls:** #1 staleness foundations (`lastNewAt` per firm), #3 concurrency race, #8 Korean encoding fragility, #9 anti-bot detection (not evasion)

**Exit criterion:** 12 firms running daily. Intentionally breaking one firm's selector still delivers 11-firm digest with error noted. Re-canonicalization test: dupe URL variants dedup correctly.

### Phase 3: Observability + Alerting + Dev Loop

**Rationale:** With 12 firms live, the silent-rot risk (PITFALLS.md #1, #2, #7) becomes the dominant concern. This phase makes failure visible — both in the digest itself (for the human reader) and in GHA (for the quarterly audit). Also locks down the dev loop so adding / fixing firms doesn't require `git push && wait for cron`.

**Delivers:**
- D3 stale-firm alert — per-firm 30-day staleness → footer warning (moved to digest **top** when present, per UX pitfalls)
- D5 `pnpm check:firm <id>` CLI (dumps raw → parsed → would-summarize → would-render)
- D7 `archive/YYYY-MM-DD.html` committed per day (year-subdirectory layout: `archive/2026/04-16.html`)
- D8 `$GITHUB_STEP_SUMMARY` markdown dashboard — per-firm table with fetched/new/summarized/errors/duration
- D17 SMTP retry on transient 5xx + explicit 535 auth-failure detection → workflow fails red with `GMAIL_AUTH_FAILURE` marker pointing at the regeneration URL
- Last-run-staleness alert — if `state/last-run.json` is >30h old, next digest's header carries "previous run missed — N hours since last run"
- Cron schedule set to `0 9 * * *` (09:00 UTC = 18:00 KST) — avoids midnight-UTC congestion window
- Run-summary includes "Paused firms: X (reason: …)" footer
- README.md written per Pitfall #17 — ≤100 lines, operational content only

**Addresses features:** D3, D5, D7, D8, D17 + operational README

**Avoids pitfalls:** #1 (stale firm), #2 (silent email failure), #7 (cron drift/staleness), #13 (Gmail spam — Subject pattern locked in), #14 (App Password docs), #17 (mental-model rot)

**Exit criterion:** Artificially move a firm's `lastNewAt` back 31 days → next digest shows staleness banner. Invalid `GMAIL_APP_PASSWORD` fails workflow red. Re-run of successful job does not send second email. Cron has fired ±30 min for 5 consecutive days.

### Phase 4: JS-Rendered Tier (only if actually needed)

**Rationale:** Playwright is heavy (~150MB cached binary, 1–3s per run, GHA-minute impact). Add ONLY after empirical verification that some firm(s) genuinely can't be parsed with cheerio. Most Korean law firm sites are server-side rendered. Verification gate: for each firm still failing after Phase 2, `pnpm check:firm <id>` shows empty parsed items AND browser DevTools confirms items are JS-injected. If zero firms qualify, **skip this phase entirely.**

**Delivers:**
- `scrapers/jsRender.ts` with Playwright + `chromium --only-shell` + `page.waitForSelector(wait_for)` + `networkidle` where appropriate
- `actions/cache` on `~/.cache/ms-playwright` keyed by Playwright version
- Per-firm `wait_for: "selector"` YAML field
- `type: js-render` added to FirmType union + zod schema + scrapers/index dispatch
- Fixture capture for JS-rendered firms

**Addresses features:** Completes T3 (all three fetch tiers)

**Avoids pitfalls:** #8 SPA parsing failures, Integration Gotchas (Playwright cache, `--only-shell`, `waitForSelector` vs `networkidle`)

**Exit criterion:** Previously-unparseable firm(s) now return items. Total run time stays under 3 min even with Playwright-tier firms.

### Phase 5: Polish + Quality-of-Life (v1.x backlog)

**Rationale:** Only implement when specific pain emerges. Each item has a named trigger condition.

**Delivers (on-trigger):**
- D2 practice-area tags — when skim becomes slow
- D4 manual URL ingestion via `workflow_dispatch` input — when a LinkedIn-only post is missed
- D14 link-health HEAD check — when builder clicks a broken digest link
- D16 per-run Gemini quota monitor — when new-items/day approaches 100
- D15 plaintext multipart — only if a specific client renders HTML poorly
- Summary cache (`state/summary-cache.json` keyed by content hash) — pairs with idempotent retry; can also land earlier if retry-double-summarize bites
- Archive pruning / year-subdirectory migration — when `du -sh .git` trends toward 500MB
- Per-firm state file split (`state/seen/<firm>.json`) — only if concurrency collisions bite despite `concurrency:` key

**Addresses features:** v1.x differentiators

### Phase Ordering Rationale

- **Dependency:** T14 (state) + T1 (config) gate everything. T4 (dedup) depends on T14. T9 (failure isolation) is meaningless without T3 (multi-firm fetch). D3 (staleness alert) depends on T14 + T9. So: Foundation → Fetch tiers → Observability is the only sane order.
- **Risk front-loading:** Gemini prompt/response shape, Gmail App Password round-trip, `git-auto-commit-action` permissions, and canonical-URL dedup are each 1–2 hour problems in isolation but 1–2 day problems if discovered during multi-firm integration. Phase 1's vertical slice forces them to surface early.
- **"Cheap now, expensive later" forcing function:** Every PITFALLS.md `[CHEAP NOW]` item MUST land in Phase 1 or Phase 2 — specifically canonicalization (#5), timezone handling (#6), run-transaction ordering (#4), `concurrency:` key (#3), fail-loud SMTP (#2), secrets hygiene (#15), honest UA + robots.txt (#12). Retrofitting any of these means re-canonicalizing state history, re-parsing state dates, or hand-diagnosing corrupted `seen.json` — multi-day work each.
- **Observability is a phase, not a sprinkle:** Silent rot is the dominant risk (PITFALLS.md framing). Phase 3 exists as a standalone phase because the staleness + last-run + SMTP-loud-fail + README changes are inseparable: any one without the others still leaves a silent-failure hole.
- **Playwright deferred on purpose:** Heavy, only-if-needed, empirically-verified. Default path is RSS+HTML covers everything.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2:** Per-firm site audit — which of the 12 firms expose RSS? Which serve EUC-KR? Which put `/insights` behind Cloudflare Bot Fight? Only empirical verification (`pnpm check:firm <id>` for each candidate URL) will answer these. Plan a dedicated research pass via `/gsd-research-phase` at Phase 2 entry covering: robots.txt for all 12 firms, RSS feed discovery (`/feed`, `/rss`, `/atom.xml`, `/feed.xml`, `/feeds/posts/default`), response encoding sniffing, initial selector draft.
- **Phase 4 (conditional):** If the Phase 2 audit identifies any JS-rendered firms, research Playwright's 2026 `--only-shell` install pattern + GHA caching specifics + specific `waitForSelector` patterns for the identified firms.

Phases with standard patterns (skip dedicated research):

- **Phase 1:** Extensively documented in STACK.md + ARCHITECTURE.md + PITFALLS.md. No further research needed; proceed directly.
- **Phase 3:** Observability patterns (`$GITHUB_STEP_SUMMARY`, stale-firm heuristic) are mechanical extensions of Phase 1/2 state. README content is documented in PITFALLS.md #17 already.
- **Phase 5:** Pull from v1.x backlog as triggers fire; no upfront research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Context7 official-docs verification for `@google/genai`, `cheerio`, `nodemailer`, `playwright`, `yaml`; cross-referenced with 2026 web sources for version currency. One MEDIUM flag: exact Gemini Flash RPD (Google stopped publishing one canonical number; 250 is conservative floor, design handles quota gracefully either way). |
| Features | HIGH | Every T1–T17 and v1 differentiator traces directly to an explicit PROJECT.md requirement or a documented silent-failure mode. Anti-features all map to PROJECT.md Out-of-Scope with cited rationale. No speculative scope creep. |
| Architecture | HIGH | Canonical ETL shape; component boundaries are data-driven (by `firm.type`, by `DRY_RUN` flag); contracts fully typed in `types.ts`. MEDIUM only on exact per-firm error-boundary tuning (expected — surfaces during Phase 1 implementation). |
| Pitfalls | HIGH for GHA/Gemini/Gmail/state mechanics; MEDIUM on per-firm anti-bot posture and legal analysis | GHA cron behavior, Gemini 429 handling, Gmail App Password revocation, `git-auto-commit-action` loop prevention are all verified from official/community sources. Per-firm Cloudflare/DataDome posture is inherently empirical. Legal analysis (Saramin precedent) surfaces risk; does not substitute for counsel. |

**Overall confidence:** HIGH.

### Gaps to Address

- **Per-firm empirical audit** (handle at Phase 2 entry via `/gsd-research-phase`): for each of the 12 named firms, verify (a) RSS availability, (b) robots.txt permissions on the `/insights` path, (c) response encoding, (d) anti-bot protection status, (e) JS-rendering requirement. Each firm's YAML entry depends on answers. Budget ~1 hour per firm = ~12 hours research, but highly parallelizable and critical to avoid Phase 2 selector churn.
- **Gemini free-tier RPD** may change again (Google has adjusted twice in 14 months). Architecture handles this gracefully (Flash → Flash-Lite fallback, `summary_pending` status, D16 quota monitor deferred to v1.x) so this is a known-unknown, not a blocker. Monitor at each phase transition.
- **PROJECT.md update needed at first `/gsd-transition`:** Replace "1,500 request/day" language in the Gemini-related Context section with "~250 RPD on 2.5 Flash, reset at midnight Pacific; architecture auto-falls-back to Flash-Lite (~1,000 RPD) on quota exhaustion." This correction is cheap at transition time, confusing later.
- **Recipient email location decision** (cheap but not yet made): YAML config vs GHA secret. Recommendation: GHA secret if repo is ever made public; YAML config with inline comment if repo stays private. PROJECT.md says recipient must be "easily changeable in config without code edit" — either location satisfies this. Defer decision to Phase 1 implementation.
- **Playwright tier may not be needed at all.** Phase 4 is conditional. Saves complexity and GHA minutes if Phase 2 audit shows all firms parse cleanly with RSS+cheerio.

---
*Research completed: 2026-04-16*
*Ready for roadmap: yes*
