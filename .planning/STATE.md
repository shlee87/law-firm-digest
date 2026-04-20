---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: data-quality-hardening
status: defining_requirements
stopped_at: null
last_updated: "2026-04-19T21:00:00Z"
last_activity: 2026-04-19
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** 사용자가 직접 로펌 웹사이트를 돌지 않아도, 추적 대상 로펌들의 신규 뉴스레터를 원문 링크와 함께 한국어 요약으로 받아볼 수 있어야 한다.
**Current focus:** Phase 05 — triggered-polish-v1-x-backlog

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-19 — Milestone v1.1 Data-Quality Hardening started

**⚠ Known production regressions (discovered 2026-04-19 via Phase 02 UAT demo):**
- bkl detail URLs are SPA — all items receive identical landing-page body → hallucinated summaries
- kim-chang detail fetches fail — empty body → hallucinated summaries
- shin-kim list fetches fail; logos/skadden zero-item selector bitrot
- Gemini prompt lacks generic-body hallucination guard (defense-in-depth missing)
- cooley RSS CF-blocked (separate backlog: .planning/backlog/cooley-cf-bypass.md)
- Full audit: .planning/backlog/v1.0-data-quality-audit.md

**Note on plan counter:** Phase 5 was pre-planned (1 governance plan) before Phase 4 execution began. Phase 4 is now executing; Phase 5 remains planned but unexecuted pending Phase 4 completion. The `state.advance-plan` call against this Current Position ran at a moment when it still pointed at Phase 5, incrementing that phase's plan-1-of-1 counter — the real advancement this session was Phase 4 plan 0→1.

**Note on Phase 04.1:** Side-phase inserted between Phase 04 plan 07 (probe results) and plan 08 (firm activation) to remove the yoon-yang extractor blocker identified in 04-07-PROBE-RESULTS.md. Phase 04.1 contains a single plan (04.1-01) that generalized `selectors.link` to a union (string | LinkExtractor). Phase 04 resumes at plan 04-08 after 04.1 completion. The `state.advance-plan` handler bumped Phase 04's plan counter (3→4) because it doesn't model sub-phases; actual Phase 04 completion remains at 7/8.

## Performance Metrics

**Velocity:**

- Total plans completed: 39
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |
| 01 | 12 | - | - |
| 03 | 5 | - | - |
| 04 | 8 | - | - |
| 05 | 1 | - | - |
| 02 | 8 | - | - |

**Recent Trend:**

- Last 5 plans: (none)
- Trend: N/A

*Updated after each plan completion*
| Phase 01-foundation-vertical-slice P01 | 15 min | 3 tasks | 11 files |
| Phase 01-foundation-vertical-slice P02 | 10 min | 3 tasks | 2 files |
| Phase 01-foundation-vertical-slice P03 | 2 min | 3 tasks tasks | 5 files files |
| Phase 01-foundation-vertical-slice P04 | 3 min | 2 tasks tasks | 2 files files |
| Phase 01-foundation-vertical-slice P06 | ~4 min | 2 tasks | 2 files |
| Phase 01-foundation-vertical-slice P07 | ~2 min | 2 tasks | 2 files |
| Phase 01-foundation-vertical-slice P08 | ~2 min | 3 tasks tasks | 4 files files |
| Phase 01-foundation-vertical-slice P09 | ~2 min | 1 tasks | 1 files |
| Phase 01-foundation-vertical-slice P10 | ~3 min | 4 tasks | 4 files |
| Phase 01-foundation-vertical-slice P05 | ~5 min | 4 tasks tasks | 5 files files |
| Phase 01-foundation-vertical-slice P11 | ~7 min | 1 tasks tasks | 1 files files |
| Phase 01-foundation-vertical-slice P12 | ~2h | 2 tasks tasks | 1 file files |
| Phase 04-js-rendered-tier-conditional P01 | 2min | 3 tasks | 3 files |
| Phase 04-js-rendered-tier-conditional P02 | 5min | 3 tasks | 3 files |
| Phase 04-js-rendered-tier-conditional P03 | 13min | 3 tasks | 4 files |
| Phase 04 P04 | ~12min | 5 tasks tasks | 7 files files |
| Phase 04-js-rendered-tier-conditional P05 | 3min | 1 tasks | 1 files |
| Phase 04-js-rendered-tier-conditional P06 | 5min | 3 tasks | 3 files |
| Phase 04-js-rendered-tier-conditional P07 | 25min | 2 tasks tasks | 2 files files |
| Phase 04.1-link-extractor-generalization P01 | ~7min | 3 tasks tasks | 5 files files |
| Phase 04-js-rendered-tier-conditional P08 | 12min | 3 tasks tasks | 2 files files |
| Phase Phase 05-triggered-polish-v1-x-backlog PP01 | ~3min | 3 tasks tasks | 1 file files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1 is a vertical slice (one firm end-to-end) — not horizontal layering
- Every `[CHEAP NOW]` pitfall from PITFALLS.md must land in Phase 1 or Phase 2
- Phase 4 (Playwright) is conditional on Phase 2 empirical audit
- Phase 5 is a triggered backlog, not a planned sprint
- [Phase 01-foundation-vertical-slice]: Pinned packageManager to pnpm@9.15.0 so setup-node@v6 cache: 'pnpm' resolves deterministically in GHA and locally (W3)
- [Phase 01-foundation-vertical-slice]: Installed pnpm via 'npm install -g pnpm@9.15.0' instead of corepack because corepack 0.30.0 on Node 23.6.1 fails signature verification when fetching latest pnpm; CI via setup-node@v6 + pnpm/action-setup@v4 is unaffected
- [Phase 01-foundation-vertical-slice]: Added transient src/placeholder.ts so tsc 5.9 does not emit TS18003 on greenfield tree; plan 01-02 will remove this file when real src modules land
- [Phase 01-foundation-vertical-slice]: 01-02: www.cooley.com exposes no RSS; seed URL set to https://cooleygo.com/feed/ (Cooley GO, Option B). Canonical id 'cooley' kept as state key — Phase 2 may add separate entries for additional Cooley surfaces without collision.
- [Phase 01-foundation-vertical-slice]: 01-03: Removed src/placeholder.ts in Task 1 commit per plan directive — now that real src modules exist (types/env/logging/schema/loader) the tsc-include shim from 01-01 is no longer needed
- [Phase 01-foundation-vertical-slice]: 01-03: FirmSchema.type = z.enum(['rss','html']) — js-render deliberately excluded so Phase 4 extension requires explicit schema change, not just a config-file change
- [Phase 01-foundation-vertical-slice]: 01-03: scrubSecrets uses split+join (not regex.replace) with length gate val.length>8 — avoids regex-metachar escape bugs AND prevents false-positive replacement when env var is empty or a short test placeholder
- [Phase 01-foundation-vertical-slice]: 01-04: canonicalizeUrl preserves scheme (lowercases only) — RESEARCH.md L547-552 vector 3 (http input, https expected) treated as documented divergence; http/https stay distinct post-canonicalization. Any future collapse requires v1.x schema change + retro-canonicalize pass over SeenState.
- [Phase 01-foundation-vertical-slice]: 01-04: TRACKING_PARAMS (15 entries: 12 marketing + 3 session) exported as readonly const from src/scrapers/util.ts so plan 05 rss.ts and any future documentation import the authoritative list rather than redeclaring.
- [Phase 01-foundation-vertical-slice]: 01-06: p-retry v8 onFailedAttempt callback receives RetryContext { error, attemptNumber, ... } — destructured { error } in gemini.ts; drifts from v6 pattern in PATTERNS.md L602 (err: any). Without this fix, SUMM-02 429 fallback + ZodError AbortError escalation would silently fail at runtime.
- [Phase 01-foundation-vertical-slice]: 01-06: Context7 confirmed @google/genai 1.50.1 API shape unchanged from PATTERNS.md expectations — constructor new GoogleGenAI({ apiKey }), ai.models.generateContent({ model, contents, config }), config.responseMimeType/responseSchema/temperature at top level (not generationConfig.*), response.text as getter. Zero SDK drift.
- [Phase 01-foundation-vertical-slice]: 01-06: SUMM-06 enforced as two-layer defense — prompt.ts grep gate (machine-verifiable: no 'item.title' substring anywhere in file) + gemini.ts JSDoc caller contract (four marker strings: 'SUMM-06 caller contract', 'body MUST be a real article body', 'Do NOT substitute', 'summaryModel: skipped'). Plan 11 main.ts owns the runtime bypass branch (!item.description → skip summarize() entirely).
- [Phase 01-foundation-vertical-slice]: 01-07: dedupAll bootstrap branch preserves r.raw via spread — upholds B1 cross-plan contract with plan 10 writer, which seeds seen.firms[id].urls from r.raw on first run. Returning without raw would break the D-09 silently (first run seeds empty state, second run emits the whole back-catalog).
- [Phase 01-foundation-vertical-slice]: 01-07: Error pass-through in dedup is reference-equal (toBe(errorResult)), not shallow-cloned — plan 11's failed-firm aggregation can depend on reference equality. Test locks this so any future refactor that accidentally clones the error branch fails immediately.
- [Phase 01-foundation-vertical-slice]: 01-08: escapeHtml/escapeAttr kept LOCAL (not exported) in templates.ts — compose is the only user-controlled-to-HTML boundary; exporting would fragment the XSS surface. Single file owns the escape vocabulary.
- [Phase 01-foundation-vertical-slice]: 01-08: B3 null-summary branch keyed on summary_ko === null, NOT on summaryModel — templates don't distinguish Gemini 'failed' from main.ts 'skipped'. Both produce null → both render '요약 없음 — 본문 부족'. Zero branching overhead; new null-origins in future phases won't require template changes.
- [Phase 01-foundation-vertical-slice]: 01-08: Snapshot stored in external .snap file (not toMatchInlineSnapshot) — keeps PR diffs readable on whitespace-heavy HTML and survives inline-snapshot formatter quirks.
- [Phase 01-foundation-vertical-slice]: 01-09: Dual-field 535 detection (responseCode === 535 OR response.includes('535')) — A4 defensive check survives nodemailer field-rename in a minor release without losing the GMAIL_AUTH_FAILURE operator recovery marker
- [Phase 01-foundation-vertical-slice]: 01-09: W2 single-catch grep invariant required rewording header comments to avoid self-triggering the gate — the literal 'catch (' bytes were replaced with 'error-catching block' and 'catch-open tokens' so 'grep -cE catch \(' src/mailer/gmail.ts returns exactly 1
- [Phase 01-foundation-vertical-slice]: 01-09: catch (err) + 'const anyErr = err as { responseCode?; response?; message? }' preferred over 'catch (err: any)' — typecheck-clean under strict config while preserving the defensive dual-field 535 probe
- [Phase 01-foundation-vertical-slice]: 01-09: 'text:' field deliberately absent from sendMail call per D-08 HTML-only — adding plaintext in Phase 2 would require EmailPayload.text addition first, forcing explicit contract conversation before mailer change
- [Phase 01-foundation-vertical-slice]: Plan 10: bootstrap seeds from r.raw (B1); version guard throws not silent-resets (DEDUP-07); atomic tmp+rename (POSIX); isDryRun() call sites = 2 (gmail+writer); 5 test assertions covering 500-cap/DRY_RUN/error/bootstrap/absent-firm
- [Phase 01-foundation-vertical-slice]: 01-05: B2 regression gate uses two-layer defense — grep-count == 0 for 'parseDate' token in src/scrapers/rss.ts (comment text rewritten to avoid the literal) AND runtime test asserting 'Tue, 15 Apr 2026 12:00:00 GMT' round-trips to '2026-04-15T12:00:00.000Z' not PDT/PST-shifted; catches both static and dynamic regressions
- [Phase 01-foundation-vertical-slice]: 01-05: Fabricated RSS fixture over live-recorded Cooley feed — deterministic GMT pubDates in the fixture enable exact-string B2 round-trip assertion that a shifting live feed could not support; live feed fetched separately for SUMMARY evidence (HTTP 200, 15 items, same URL as plan 01-02)
- [Phase 01-foundation-vertical-slice]: 01-05: PATTERNS.md feedparser this-typing [CONFIRM AT PLAN] resolved without cast — feedparser v2.3.1 ships its own index.d.ts with 'on(event: readable, listener: (this: FeedParser) => void)', so this.read() inside the listener types as FeedParser.read() without executor-side assertion; @types/feedparser is deprecated stub and irrelevant
- [Phase 01-foundation-vertical-slice]: 01-05: Hand-rolled robots.txt parser kept for Phase 1 per RESEARCH.md L613 — User-agent:* section + Disallow prefix match only; no wildcard, no Allow override, no per-bot agent. Phase 2 will reconsider swap to robots-parser pkg when firm count grows past one
- [Phase 01-foundation-vertical-slice]: 01-11: main.ts composition root follows RESEARCH.md §Pattern 1 run-transaction ordering verbatim; ONE shared pLimit(3) across all firms (not per-firm) for FETCH-03 global concurrency; B3 truthy guard 'if (!item.description)' short-circuits before summarize() to enforce SUMM-06 at orchestrator level (title NEVER reaches Gemini); writeState lives OUTSIDE the DEDUP-03 branch so bootstrap seeding and lastUpdated both advance on zero-new days
- [Phase 01-foundation-vertical-slice]: 01-11: DRY_RUN header comment was reworded from literal 'isDryRun' token to 'env dry-run helper' so grep -c isDryRun src/main.ts stays at 0 (Pattern 2 acceptance gate) — same self-invalidating-grep mitigation pattern as plan 09 mailer.ts single-catch gate
- [Phase 01-foundation-vertical-slice]: 01-11: DRY_RUN=1 smoke test proved first-run bootstrap wiring end-to-end — 15 Cooley URLs fetched → dedupAll D-09 bootstrap returned new:[] → summarize skipped (zero Gemini calls) → DEDUP-03 skipped email → writer DRY_RUN branch logged 'would write 15 URLs across 1 firms' (B1 seeding from r.raw). Disk untouched; exit 0
- [Phase 01-foundation-vertical-slice]: 01-12: Live-verification surfaced 3 bugs unit tests could not catch (pnpm/action-setup v5 rejects combined version+packageManager, Gemini short-excerpt collapse, failure observability gap) — Phase 2+ should treat first live-dispatch run as true acceptance for GHA changes, not just grep gates
- [Phase 01-foundation-vertical-slice]: 01-12: pnpm/action-setup pinned to @v5 (plan suggested @v4) with NO version input — package.json#packageManager (pnpm@9.15.0) is single source of truth per W3. Specifying both causes ERR_PNPM_BAD_PM_VERSION on v5
- [Phase 01-foundation-vertical-slice]: 01-12: Added if: failure() step that auto-opens bilingual (EN/KR) GitHub Issue with symptom-to-fix remediation table (ZodError, 535/GMAIL_AUTH_FAILURE, 401/API_KEY_INVALID, 429, ENOTFOUND) — operator MTTR drops from 'grep 500-line logs' to 'read issue, apply fix, click Re-run'. Required permissions: issues: write (still minimum scope)
- Phase 04-01: superRefine applied after .strict() — zod v4 preserves unknown-field rejection through returned ZodEffects (regression test locked via Test 6 of new describe block)
- Phase 04-01: Single schema + superRefine chosen over discriminatedUnion — avoids duplicating shared fields across three branches for one conditional field (wait_for)
- Phase 04-02: parseListItemsFromHtml helper takes (html, firm) not (html, firm, selectors) — matches existing scrapeHtml pattern; caller avoids 4-arg duplication
- Phase 04-02: normalizeDateString promoted from html.ts file-local to util.ts exported helper — avoids cross-tier file dependency between jsRender.ts and html.ts
- Phase 04-02: missing-selectors branch returns [] instead of throwing — lets scrapeHtml preserve historical no-throw (D-P2-03) while jsRender.ts can wrap with its own selector-miss classification
- Phase 04-02: fetch + charset-aware decode stays in html.ts, not lifted into util.parseListItemsFromHtml — jsRender.ts owns its own network stack via Playwright, so the helper handles only string → items
- Phase 04-03: playwright resolved to 1.59.1 (pnpm ^1.58.0 spec — latest matching minor); stack lock permits via caret-range pinning
- Phase 04-03: scrapeJsRender(firm, browser) uses Pattern 1 Browser-injection — composition root owns launch/close, scraper owns only per-firm BrowserContext; enables mock-based testing without chromium binary
- Phase 04-03: Three error-message shapes (browser-launch-fail / playwright-timeout / zero items extracted (selector-miss)) are load-bearing — coupled to classifyError regex in compose/templates.ts; must not modify without lockstep classifier update
- Phase 04-03: waitUntil='domcontentloaded' + state='attached' + hardcoded 15s timeouts (D-13) — 'load' too strict for SPAs, 'networkidle' redundant with wait_for; no YAML exposure of timeout in v1
- Phase 04-04: Widened classifyError playwright-timeout regex to /playwright-timeout|waitForSelector|TimeoutError\.?.*Playwright/i — original research regex missed literal token scrapers/jsRender.ts emits
- Phase 04-04: runPipeline owns chromium Browser lifecycle with hasJsRender short-circuit — rss-only/html-only runs skip launch (no chromium dependency surface on non-js-render runs)
- Phase 04-04: Browser close in OUTER finally wrapping existing step-summary finally — order: email→archive→state→stepSummary→browser.close→return; main.ts exit(1) AFTER return so exit is strictly post-cleanup (D-08)
- Phase 04-04: Existing test (3) 'Phase 4 territory' updated in Task 1 commit (not Task 5) to keep git bisect clean — suite green at every commit boundary
- Phase 04-05: Remediation row text for browser-launch-fail avoids literal 'actions/cache@v4' substring to satisfy grep-count == 1 acceptance criterion
- Phase 04-06: STATIC_BODY_MIN_CHARS=200 (Research §10) — signal/noise floor below which Gemini summary universally falls to confidence:low. Higher → too many fallbacks → 3-min budget risk; lower → miss real cases
- Phase 04-06: longer-of-(static, hydrated) wins; equal-length defaults to static — defensive arbitration prevents hydrated regression where same-length but different (worse) text would replace static
- Phase 04-06: per-firm BrowserContext opened+closed per fallback ATTEMPT (not per firm) — keeps cookies/storage isolated per article AND lets per-item try/catch isolate context-creation failures
- Phase 04-06: Reporter-line for 'static fallback → Playwright' (Claude's Discretion #6) intentionally NOT plumbed — would clutter CLI; per-firm step-summary body-counts already expose the signal at the right granularity. Phase 5 promotion candidate
- Phase 04-07: Phase 2 audit hint drift confirmed — lee-ko's ul#contentsList > li does not exist on live page; actual selector is .leeko-new-newsletter__item. Plan 07's probe-before-enable discipline (D-03) validated — plan 08 would have shipped broken selectors without this step.
- Phase 04-07: yoon-yang cannot be enabled until parseListItemsFromHtml gains a third URL-resolution branch (link_href_regex + link_template) for href='javascript:doView(N)' shape without onclick attr. Plan 08 must either add the branch or keep yoon-yang enabled: false.
- Phase 04-07: barun canonical newsletter URL is https://barunlaw.com/barunnews/N (discovered live); Phase 2 audit candidate www.baruninews.com has dead DNS. Server-rendered HTML; js-render tier works as a superset.
- Phase 04-07: Probe script extended with --link-onclick-regex + --link-template (Rule 2 during live run) so the probe CLI mirrors parseListItemsFromHtml's two URL-resolution branches one-to-one; necessary to verify lee-ko without falsely failing plan scope.
- Phase 04.1-01: LinkExtractorSchema as zod union — not discriminated — keeps YAML clean (no redundant type tag); .strict() on inner schema catches typos like 'attr:' vs 'attribute:' at config-load time
- Phase 04.1-01: extractLinkUrl returns raw URL (pre-canonicalize); caller applies canonicalizeUrl — preserves pure helper + matches parseListItemsFromHtml's resolve→canonicalize separation
- Phase 04.1-01: legacy link_onclick_regex + link_template kept valid indefinitely; migration to Mode 1 object form is triggered (firm site change, future sunset), not forced — zero churn for kim-chang and bkl
- Phase 04.1-01: yoon-yang unblocked — plan 04-08 can now activate with link: { selector: a, regex: 'doView\\((\\d+)\\)', template: '/kor/insights/newsletter/{1}' } YAML-only (no code change)
- Phase 04-08: Firm activation via verbatim PROBE-RESULTS paste — no selector adjustments needed; plan executed as written
- Phase 04-08: yoon-yang activated YAML-only via Phase 04.1-01 LinkExtractor union — no parseListItemsFromHtml patch needed; PLAN's pre-supposed Rule 2 extractor work was obviated by the 04.1 generalization that landed earlier
- Phase 04-08: barun detail-page body extraction returns 0/10 (generic chain + Playwright fallback both empty) — documented as Phase 5 polish candidate; inert today since dedup=0 new and SUMM-06 B3 guard absorbs the missing body gracefully
- Phase 05-01: Governance-only plan (files_modified: []) — emitted 05-VERIFICATION.md asserting 13-item D-01 roster LATENT, D-10.1 met (CONTEXT.md committed), D-10.2 pending (Phase 3 supplement counter rows for QUOTA-01/ARCH-01/CACHE-01 scheduled post-Phase-4). Phase 5 parent cannot close until D-10.2 lands.
- Phase 05-01: Tasks 1 and 2 (grep-based cross-checks) produced zero artifacts; evidence lives in 05-01-SUMMARY.md. Only Task 3 (VERIFICATION.md) committed individually — honors files_modified:[] contract without losing evidence trail.

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 2 entry:** per-firm empirical audit required (RSS / robots.txt / encoding / anti-bot status for all 12 firms) — trigger `/gsd-research-phase` before planning Phase 2
- **PROJECT.md correction pending:** Gemini free-tier RPD text needs update at first `/gsd-transition` (current PROJECT.md Context references ~250 RPD reality; initial draft once said 1,500 — verify latest wording)
- **Recipient email location decision:** YAML vs GHA secret — defer to Phase 1 implementation
- ~~Plan 08 must add parseListItemsFromHtml link_href_regex+link_template branch (or fallback) before enabling yoon-yang in firms.yaml — current extractor cannot resolve href='javascript:doView(N)' without onclick attr~~ **RESOLVED by Phase 04.1-01** — selectors.link is now a union (string | LinkExtractor); yoon-yang is expressible as `link: { selector: 'a', regex: 'doView\\((\\d+)\\)', template: '/kor/insights/newsletter/{1}' }` (04.1-01-SUMMARY.md)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-19T17:54:00.320Z
Stopped at: Completed 05-triggered-polish-v1-x-backlog-01-PLAN.md
Resume file: None

**Planned Phase:** 05 (triggered-polish-v1-x-backlog) — 1 plans — 2026-04-18T19:04:37.083Z
