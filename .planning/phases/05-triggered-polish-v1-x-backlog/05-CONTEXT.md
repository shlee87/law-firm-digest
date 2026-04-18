# Phase 5: Triggered Polish (v1.x backlog) - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A governance/holding zone that catalogs deferred v1.x items with named trigger conditions. No feature code ships under the phase id `5` itself — individual items activate as `5.x` decimal sub-phases when (and only when) their named trigger fires and is logged. This phase exists to make deferral disciplined: triggers are observable, promotion is gated on evidence, and the backlog is scoped and frozen.

**In scope:**
- Enumerate the 13-item backlog (8 v2 items from REQUIREMENTS.md §v2 + 5 items surfaced from Phase 3/4 deferred sections) with concrete trigger conditions per item.
- Define the observation mechanism for each trigger (loud numeric counters for measurable ones, chronological log for event-based ones).
- Lock the promotion ritual (trigger → evidence → PROJECT.md Key Decisions entry → `/gsd-insert-phase` → `5.x` discuss/plan/execute).
- Define what "phase complete" means in the dashboard so the parent `5` can close while children `5.x` remain latent.

**Out of scope (explicitly):**
- Implementing ANY of the 13 backlog items under the phase id `5`. Each item, when triggered, becomes its own `5.x` sub-phase with its own discuss/plan/execute cycle.
- New deferred ideas that emerge AFTER this phase is written — those go to `/gsd:add-backlog` (999.x numbering), not into `05-CONTEXT.md`.
- v2 items that are NOT "Phase 5 territory" (multi-recipient email, non-Gmail SMTP, attachment delivery, title translation, mecab-ko tokenization) — those belong to a future v1.1+ milestone, not this phase.
- Any feature-level code for monitors or caches. The three passive numeric counters we DO add (QUOTA/ARCH/CACHE observability) are scoped as a Phase 3 step-summary supplement — NOT under phase id `5`.

</domain>

<decisions>
## Implementation Decisions

### Backlog roster — 13 items with named triggers

- **D-01:** The canonical Phase 5 backlog is the following 13 items. Each item has a named trigger condition; items NOT in this list do not belong here (route to `/gsd:add-backlog` instead).

| # | Item | Source | Named trigger condition |
|---|------|--------|-------------------------|
| 1 | `TAG-01` | REQUIREMENTS.md §v2 | Skim speed degradation observed (reader spending >5 minutes scanning digest or routinely skipping sections) |
| 2 | `MANUAL-01` | REQUIREMENTS.md §v2 | ≥3 incidents of needing to inject an off-schedule URL (e.g., LinkedIn post, one-off blog) |
| 3 | `LINK-01` | REQUIREMENTS.md §v2 | ≥1 confirmed broken-link click in a received digest (404/410/DNS fail) |
| 4 | `QUOTA-01` | REQUIREMENTS.md §v2 | Any single-day Gemini items count ≥80 (QUOTA-01 counter reaches 80/100, 80% threshold) |
| 5 | `PLAIN-01` | REQUIREMENTS.md §v2 | Specific mail client renders HTML digest illegibly (observed at least once, identifies the client) |
| 6 | `CACHE-01` | REQUIREMENTS.md §v2 | Any single run's CACHE-retry counter ≥5, or summary-retry Gemini spend observably duplicated |
| 7 | `ARCH-01` | REQUIREMENTS.md §v2 | ARCH counter shows `.git` size ≥400 MB (ARCH-01 counter reaches 80% of the 500 MB budget) |
| 8 | `STATE-01` | REQUIREMENTS.md §v2 | ≥1 observed seen.json corruption or dedup miss despite `concurrency:` key |
| 9 | Kirkland JS-render US firm | Phase 4 CONTEXT.md `<deferred>` | Cooley+Skadden US signal insufficient (≥2 weeks with zero US digest items) |
| 10 | Rich wait-contract YAML `{selector, timeout_ms, network_idle}` | Phase 4 CONTEXT.md `<deferred>` | Any of the 4 Phase 4 js-render firms throws `playwright-timeout` within 30 days of activation |
| 11 | `check:firm --json` output flag | Phase 3 CONTEXT.md D-06 | Test automation or scripted consumer needs structured CLI output |
| 12 | `check:firm --fixture` mode (recorded HTML fixtures) | Phase 3 CONTEXT.md D-08 | Live-only testing makes selector iteration painful; ≥3 sessions blocked by rate limits or site instability |
| 13 | Per-firm `wait_for_detail` selector (skip static-first attempt on detail pages) | Phase 4 CONTEXT.md `<deferred>` | Any single firm's detail-page static extraction ratio <20% over 30 days (i.e., Playwright fallback is almost always triggered) |

- **D-02:** Items NOT in this roster that surface post-phase-creation go to `/gsd:add-backlog` (999.x numbering). This keeps Phase 5 CONTEXT.md frozen as a definitional artifact. Rationale: Phase CONTEXT.md is read by downstream agents (researcher, planner) as a decisions snapshot — mutable CONTEXT.md breaks that contract.
- **D-03:** Items marked "v2" in prior CONTEXT.md files but NOT named "Phase 5 territory" (multi-recipient, non-Gmail SMTP, attachment delivery, title translation, mecab-ko tokenization) are OUT of this phase. They belong to the v1.1+ milestone's REQUIREMENTS.md §Active section when that milestone is opened.

### Trigger detection — two-track observation

- **D-04:** Numeric triggers (`QUOTA-01`, `ARCH-01`, `CACHE-01`) are surfaced as passive observability lines in the GHA `$GITHUB_STEP_SUMMARY` table. Format as a trailing row under the existing Phase 3 per-firm table:
  - `Gemini items today: N/100` (QUOTA-01 budget counter; threshold-flag at ≥80)
  - `Repo .git size: N MB / 500 MB budget` (ARCH-01; threshold-flag at ≥400)
  - `Summary retries this run: N` (CACHE-01; threshold-flag at ≥5)
  No feature code ships under Phase 5 for this — the counters are observability, not the features themselves. See D-12 for WHERE the counters land (Phase 3 supplement, not Phase 5).
- **D-05:** Event-based triggers (`TAG-01`, `MANUAL-01`, `LINK-01`, `PLAIN-01`, `STATE-01`, plus the 5 prior-phase items) are logged chronologically inside `05-CONTEXT.md` in a dedicated **Trigger Observations** appendix (see D-08). One-liner per observation: `- 2026-MM-DD [<item-code>] <what-happened>`. No threshold inference is automated; the operator (user) decides when enough observations have accumulated to cross the named trigger condition.
- **D-06:** Threshold numbers in D-01 (≥80 items/day, ≥400 MB, ≥5 retries, ≥3 incidents, ≥2 weeks) are GUIDELINES, not auto-firing automation. A trigger "fires" only when the operator consciously decides it has, at which point the PROJECT.md Key Decisions evidence step (D-09) begins.

### Promotion workflow — evidence-first gate

- **D-07:** When a trigger fires, the operator MUST create a PROJECT.md Key Decisions row citing: (a) the item code (e.g., `QUOTA-01`), (b) the observed evidence (counter value, date range, or list of observations), (c) the decision ("activate as 5.x"). The `/gsd-insert-phase` call MUST then cite that Key Decisions row by number in its opening prompt. No code lands on the `5.x` branch before the evidence row exists. This makes success criterion 2 ("trigger evidence captured in PROJECT.md Key Decisions before any code lands") a hard gate, not a soft expectation.
- **D-08:** One trigger = one `5.x` sub-phase. Even if two unrelated triggers fire in the same week (e.g., `QUOTA-01` and `LINK-01`), they become `5.1` and `5.2` separately. No batching. Rationale: matches the milestone's established vertical-slice pattern, keeps blast radius small, preserves independent rollback.
- **D-09:** The 5.x sub-phase is created via `/gsd-insert-phase 5` (which adds a decimal phase). Each sub-phase then runs the standard discuss → plan → execute cycle with its own CONTEXT/PLAN/VERIFICATION artifacts. Phase 5's parent (`5-CONTEXT.md` — this document) does NOT get re-edited when children land.

### Phase lifecycle — parent closes once, children remain latent

- **D-10:** Phase 5's parent (the `5` id in the dashboard) shows ✓ complete when BOTH of these are true:
  1. This `05-CONTEXT.md` is committed to `dev`.
  2. The Phase 3 supplement plan (D-12) adding the three numeric-trigger counters to `$GITHUB_STEP_SUMMARY` is merged and producing output in at least one GHA run.

  Individual backlog items (5.1 … 5.13) remain LATENT indefinitely thereafter. Their being unfired does NOT hold Phase 5's parent open — the parent closes after D-10.1+D-10.2 and stays closed regardless of how many 5.x children fire later.
- **D-11:** If milestone v1.0 completes before any `5.x` children fire, that is EXPECTED and FINE. Untriggered items carry forward: on the next milestone's roadmap, they either (a) stay dormant under the v1.0 phase-5 banner (history preserved), or (b) get re-scoped into v1.1's §Active requirements if the operator judges their trigger has become inevitable. The `/gsd-complete-milestone` ritual explicitly inspects the `05-CONTEXT.md` roster and records a one-line outcome per item ("fired", "re-scoped to v1.1", "still dormant").

### Counter ownership — Phase 3 supplement, not new Phase 5 plan

- **D-12:** The three passive numeric-trigger counters (D-04) land under Phase 3 via a supplemental plan added AFTER this discuss step. This reopens Phase 3 temporarily to add one plan that extends `writeStepSummary`. Phase 3 already owns `$GITHUB_STEP_SUMMARY` (its D-09 "Step summary writer"), so the counters are a natural observability extension, not new Phase 5 code. Phase 5 thus ships zero code of its own — success criterion 3 ("no item in this phase ships speculatively") holds literally.
- **D-13:** The Phase 3 supplement plan (to be created via `/gsd:plan-phase 3` adding one new plan slot, likely `03-06-PLAN.md`) is a SEPARATE follow-up action. It is listed in the "Next steps" summary at the end of this discuss session, not created inline. The operator runs it after Phase 4 completes (since Phase 4 also touches `daily.yml`, running them in parallel risks merge conflicts on the workflow file).

### Artifacts produced by Phase 5 itself

- **D-14:** Phase 5 produces exactly three artifacts under `.planning/phases/05-triggered-polish-v1-x-backlog/`:
  1. `05-CONTEXT.md` (this document) — the governance/backlog definition.
  2. `05-DISCUSSION-LOG.md` — the standard audit trail from this discuss session.
  3. `05-VERIFICATION.md` — written at Phase 5 closure, asserting D-10.1 + D-10.2 are both met and listing the initial 13-item roster as "all latent".

  No `05-RESEARCH.md`, no `05-*-PLAN.md`. Plans belong to `5.x` children if/when triggered.

### Trigger Observations (append-only log)

**Format:** `- YYYY-MM-DD [<ITEM-CODE>] <one-line observation>`
**Lifecycle:** Entries accumulate chronologically. When enough observations for a single item cross the named trigger condition (D-01 table), the operator copies a summary into PROJECT.md Key Decisions (D-07) and runs `/gsd-insert-phase 5`. The entries that motivated the promotion STAY in this log — they are the evidence trail.

(No observations yet — log starts empty.)

### Claude's Discretion

- Exact column widths and ordering of the step-summary counter rows (D-04) — aesthetic; Phase 3 supplement plan decides.
- Whether threshold-flag formatting in the counters uses `⚠` / `!` / bold / color — pick one and stay consistent; flag at 80% of budget per D-01 thresholds.
- Whether the `05-VERIFICATION.md` file (D-14.3) is auto-generated by `/gsd:verify-work` or hand-written — either is fine; the content is a two-paragraph status, not scored.
- Exact wording of the PROJECT.md Key Decisions row template (D-07) — establish the template when the first trigger actually fires, not preemptively here.
- Whether to add a `[Phase 5]` prefix to /gsd:add-backlog entries that could become Phase-5-territory in hindsight — operator's call at capture time.

### Folded Todos

None — `gsd-sdk query todo.match-phase 5` returned zero pending todos.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing the Phase 3 supplement, or any future 5.x sub-phase.**

### Requirements + Roadmap
- `.planning/ROADMAP.md` §"Phase 5: Triggered Polish (v1.x backlog)" — goal, success criteria, entry gate language ("/gsd-insert-phase is the mechanism for promoting an individual item into a 5.x decimal phase when its trigger fires").
- `.planning/REQUIREMENTS.md` §"v2 Requirements > Enhancements" — the 8 v2 items (TAG-01, MANUAL-01, LINK-01, QUOTA-01, PLAIN-01, CACHE-01, ARCH-01, STATE-01) with their original trigger-condition phrasing.
- `.planning/REQUIREMENTS.md` §"Out of Scope" — items explicitly excluded from v1 AND from Phase 5 (multi-recipient, non-Gmail SMTP, etc.).
- `.planning/PROJECT.md` §"Key Decisions" — the canonical evidence log that MUST contain a row for any trigger before `/gsd-insert-phase` runs (D-07).

### Prior phase decisions (what Phase 5 inherits as "Phase 5 territory")
- `.planning/phases/01-foundation-vertical-slice/01-CONTEXT.md` — Phase 1 canonicalizeUrl, DRY_RUN containment, run-transaction ordering. None directly extend into Phase 5, but the fail-loud philosophy is inherited (D-04 thresholds surface loudly, not silently).
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — D-P2-03 `Promise.allSettled` pattern, D-P2-04 email footer `errorClass` taxonomy. Any 5.x sub-phase that touches fetch/error flow inherits these; do not re-derive.
- `.planning/phases/03-observability-dev-loop/03-CONTEXT.md` — **especially D-06 (`--json` deferred to Phase 5), D-08 (`--fixture` deferred), and D-09 step-summary writer** (the Phase 5 counters attach here per D-12 of this document).
- `.planning/phases/04-js-rendered-tier-conditional/04-CONTEXT.md` `<deferred>` — sources items 9, 10, 13 in the D-01 roster (Kirkland, rich wait-contract, per-firm `wait_for_detail`). Also flags D-08 exit-1-after-email and D-10 errorClass taxonomy that any 5.x sub-phase touching js-render firms must respect.

### Code-context anchors (for any 5.x sub-phase's planner)
- `src/pipeline/run.ts` (Phase 3 D-09 `runPipeline`) — composition root. The Phase 3 counter supplement (D-12) reads counter values from whatever pipeline stage owns them (Gemini calls → `src/summarize/gemini.ts`; retry counts → same; repo size → a new `statFs` call inside `writeStepSummary`).
- `src/mailer/gmail.ts` — run-transaction ordering that any future 5.x item touching email (PLAIN-01, STATE-01 indirectly) must preserve.
- `config/firms.yaml` — schema shape that any future 5.x config change (Kirkland add, `wait_for_detail` field) must extend without breaking existing entries.
- `.github/workflows/daily.yml` — where the Phase 3 supplement's `$GITHUB_STEP_SUMMARY` rows render; also where Phase 4 is concurrently adding Playwright install + cache (coordination via D-13 sequencing).
- `state/seen.json` — any future STATE-01 work must preserve the version field and per-firm 500-cap invariant (Phase 1 D-P1 DEDUP-04/07).

### External specs / infra
- Google Gemini API rate-limit docs — `gemini-2.5-flash` ~250 RPD free tier; QUOTA-01 trigger at 80% means 80 new items/day (each = 1 Gemini call). Source for the 80/100 threshold in D-01.
- Gmail SMTP deliverability — context for future PLAIN-01 work; no new reading here, just noted that Phase 1 EMAIL-03/06 already covered the basics.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`writeStepSummary` (Phase 3 D-09)** — owns the `$GITHUB_STEP_SUMMARY` write. The Phase 3 supplement (D-12) extends this function with three trailing counter rows. No new file needed.
- **`runPipeline` composition root (Phase 3 D-09)** — the counter values (Gemini item count, summary retry count) are already observable inside this function's execution path; they just need to be threaded to `writeStepSummary`.
- **Repo size observation** — `du -sh .git` is a single shell-out; candidate helper: `src/lib/repoSize.ts` exposing `.getGitDirBytes()` as an async function. Alternative: call `du` inline from `writeStepSummary` and parse stdout. Phase 3 supplement picks one.
- **PROJECT.md Key Decisions table** — the markdown table pattern is already established (existing rows document prior phase decisions). New rows for trigger evidence (D-07) follow the same shape: `| Decision | Rationale | Outcome |`.

### Established Patterns
- **Fail-loud philosophy** (Phase 1 FETCH-06, Phase 2 SMTP 535, Phase 4 D-08) — extends directly into D-04: counters surface thresholds visibly, not as buried log lines.
- **Run-transaction ordering** (Phase 1 OPS-03) — fetch → dedup → summarize → email → state. The Phase 3 supplement counters read values AFTER each stage completes and write them during step-summary emission (which happens after the pipeline body). No ordering change.
- **Observability as Phase 3's domain** — all $GITHUB_STEP_SUMMARY and archive work live under Phase 3. Phase 5 counters attach here (D-12) by design.
- **Vertical-slice phase boundaries** — milestone has never batched unrelated concerns into one phase. D-08 extends that pattern: one trigger = one 5.x sub-phase.

### Integration Points
- **Phase 3 supplement plan (future `.planning/phases/03-observability-dev-loop/03-06-PLAN.md` or similar)** — the ONE concrete code action that serves Phase 5's goal. Touches only `writeStepSummary` (append three counter rows) + possibly a tiny `getGitDirBytes` helper. Does NOT touch `config/firms.yaml`, `scrapers/*`, or any feature code.
- **`/gsd-insert-phase 5`** — the sole entry point for 5.x child creation. D-07's hard gate fires BEFORE this command runs (PROJECT.md Key Decisions row first). Downstream agents of `/gsd-insert-phase` should receive the Key Decisions row number as part of the insert prompt.
- **`/gsd:add-backlog`** — where new ideas go once this phase is written (D-02). Phase 5 CONTEXT.md is frozen after commit.
- **`/gsd-complete-milestone`** — at milestone v1.0 closure, inspect this CONTEXT.md's D-01 roster and record per-item outcome per D-11.

</code_context>

<specifics>
## Specific Ideas

- **Counter row format** should make threshold-breach scannable at a glance in a GHA run summary — e.g., `⚠ Gemini items today: 82/100` visually pops vs. `Gemini items today: 82`. Consistent flag character across all three numeric triggers.
- **Trigger Observations log entries** should be terse one-liners — `- 2026-06-12 [LINK-01] clicked Kim&Chang Feb 14 digest link → 404 on their own site, not ours`. Not a paragraph. The point is evidence density, not narrative.
- **PROJECT.md Key Decisions row** for a triggered item looks like: `| Activate 5.x for LINK-01 | Observed 2 broken-link clicks in 2026-06 digests (entries dated 06-12, 06-18 in 05-CONTEXT.md trigger log) | 5.1-broken-link-healthcheck scheduled |`. Matches the existing table's tone.
- **Phase 3 supplement plan scheduling** — run AFTER Phase 4 executes, not in parallel. Both touch `daily.yml` and pre-commit hooks have caught workflow-file merge conflicts before (per Phase 1 01-12 notes on workflow permissions).
- **The 80/100 QUOTA threshold** comes from: `gemini-2.5-flash` free tier is ~250 RPD; 12 firms × ~5 items/day = 60 items/day baseline. 80 items/day is a 33% spike above baseline — clearly abnormal but still survivable, leaving headroom for the flash-lite fallback to take the overflow.

</specifics>

<deferred>
## Deferred Ideas

- **Auto-firing trigger automation** (e.g., GHA workflow auto-runs `/gsd-insert-phase` when a counter crosses threshold). Rejected for v1.x: human judgment is still in the loop per D-06 and success criterion 3. Revisit only if trigger observation itself becomes a chore.
- **Pretty-formatted Trigger Observations log** (e.g., HTML table, date histograms). Plain markdown one-liner is sufficient for a solo-operator log.
- **Per-item "dormancy score"** (how long since each item's trigger was last almost-fired). Useful if the backlog grows past 20 items; overkill at 13.
- **Migration of prior-phase deferred sections into 05-CONTEXT.md's roster** — items 9-13 in D-01 are duplicated from Phase 3/4 `<deferred>` sections rather than moved. This is intentional: the original CONTEXT.md files are historical artifacts and shouldn't be edited after commit. Duplication is the cost of immutability.
- **Automated check that `/gsd-insert-phase 5` always cites a PROJECT.md Key Decisions row number** — D-07 is a discipline rule, not a tool-enforced one. Could be promoted to a pre-commit hook later if the discipline slips.

## Reviewed Todos (not folded)

None — todo matcher returned empty.

</deferred>

---

*Phase: 05-triggered-polish-v1-x-backlog*
*Context gathered: 2026-04-18*
