# Phase 10: Data-Quality Observability - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-firm body-quality metrics (average body length, GUARD trigger count, confidence distribution) are made visible in the GHA step-summary table and the email digest footer — so any quality degradation surfaces without requiring the operator to read GHA logs.

**In scope:**
- Extend `Recorder` + `writeStepSummary` to emit 3 new quality columns
- Extend `classifyError`/`renderDataQualityFooter` patterns for firm-level low-confidence warnings
- DRY_RUN=1 mode parity — same metrics visible on stdout

**Out of scope (belongs in other phases or future milestones):**
- Historical trending / time-series metrics (snapshot-based only — no persistent store beyond state/seen.json)
- Per-item confidence badges in the main digest body (Phase 8 D-04 already handles the template layer; full confidence display is explicitly deferred per Phase 8 CONTEXT.md "Confidence 값 시각 렌더링 상시 표시 — Phase 10 선택 사항", and we are NOT selecting it)
- Config-driven thresholds (50% is hardcoded this phase; parameterization deferred to v2)
- New guard layers — Phase 10 surfaces existing Phase 8 guards, doesn't add new ones
- Fixing shin-kim TLS / bkl / kim-chang — those have separate follow-ups

</domain>

<decisions>
## Implementation Decisions

### A. Step-summary Table Shape (DQOBS-01)
- **D-01:** Extend the existing `Recorder.toMarkdownTable()` 6-column table by appending 3 new columns. Final 9-column shape: `| Firm | Fetched | New | Summ | Errors | Duration | AvgBody | GUARD | H/M/L |`. No second table, no section split — single scan, single header row, consistent with current UI affordance.
- **D-02:** `AvgBody` is the per-firm average of `item.body.length` (UTF-16 code unit) across all items the firm produced in the current run, measured **after `enrichBody` completes** (pre-GUARD, pre-skip-guard, pre-summarize). Skipped items (body trimmed < 100, Phase 8 D-02 Layer 1 short-circuit) are INCLUDED in the average — their low length IS the signal we are trying to surface. Integer format (no decimals). Fetched=0 firm → displayed as `—`.

### B. DQOBS-02 Low-Confidence Flag Signal Shape
- **D-03:** Extend the existing Phase 8 `ClusterMarker` into a discriminated union `DataQualityMarker`. Two kinds: `{ kind: 'cluster', firmId, count }` (existing, unchanged behaviorally) and `{ kind: 'low-confidence', firmId, lowCount, totalCount }` (new). Single `markers: DataQualityMarker[]` array flows through `renderHtml` and `writeStepSummary` — call-site signatures unchanged except the type widens.
- **D-04:** Low-confidence flag triggers when `lowCount / totalCount >= 0.5` AND `totalCount >= 3`. Minimum floor of 3 prevents false positives on sparse-item firms (1/1 and 2/2 low-confidence are too noisy a signal for a flag, though they still show in the H/M/L column).
- **D-05:** Render in the existing `renderDataQualityFooter` ("⚠ Data Quality Warnings" block, Phase 8 D-14) — alongside cluster warnings. Not inline with the firm section header. Example footer rows:
  - `- bkl: HALLUCINATION_CLUSTER_DETECTED — 3개 항목 demote됨`  (cluster, existing)
  - `- yulchon: 4/6 items 품질 의심 (confidence=low 과반)`  (low-confidence, new)
  Empty `markers[]` → footer block omitted entirely (D-15 clean-run invisible invariant preserved).

### C. 'GUARD' Column Definition
- **D-06:** `GUARD` column is a **union count** across all three Phase 8 guard layers per firm:
  - Layer 1: items with `summaryModel === 'skipped'` (body empty / short → Gemini call bypassed)
  - Layer 2: items where Gemini returned `summary_ko === ''` (generic-boilerplate recognized by the model itself) → title-verbatim substitution applied
  - Layer 3: items demoted by the cluster detector (first-50-chars match threshold N≥3 → confidence overwritten to `'low'`)
  Single scalar per firm. Layer-level breakdown (S/E/C) is out of scope for the table — detailed forensics live in GHA logs and post-mortem analysis of `archive/YYYY/MM-DD.html` + `state/seen.json`.

### D. DRY_RUN Output Format (DQOBS-03)
- **D-07:** `DRY_RUN=1` mode emits the **same markdown table** that would be written to `$GITHUB_STEP_SUMMARY` on GHA runs, prefixed with `[DRY_RUN] Step-summary (would-write to $GITHUB_STEP_SUMMARY):` label line. Table content is byte-for-byte what GHA would see — zero divergence between local and production rendering. Same pattern applies to the markers block (`## ⚠ Data Quality Warnings` section when markers are non-empty).
- **D-08:** Output goes to stdout only (mirrors existing DRY_RUN lines for Subject / HTML body / would-write archive / would-write state). No file write in DRY_RUN mode.

### Claude's Discretion
- Formatting micro-choices: whether H/M/L column uses `5/1/0` or `5 / 1 / 0` or `H:5 M:1 L:0`. Keep terse — `5/1/0` preferred unless a Phase 10 plan surfaces a specific readability reason to expand.
- Emoji usage: none unless user opts in. Phase 8 footer uses `⚠` heading; inherit that, no new icons.
- Test-fixture body lengths for unit tests — pick values that clearly cross the 100-char Layer 1 threshold and the 50% low-confidence threshold so boundaries are regression-locked.
- How to handle a firm that errored out at fetch (Fetched=0): keep existing `Errors` column behavior; AvgBody/GUARD/H-M-L render as `—` / `—` / `—` since there's nothing to average.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 10 requirement spec
- `.planning/REQUIREMENTS.md` §131-135 — DQOBS-01/02/03 acceptance criteria (authoritative)
- `.planning/ROADMAP.md:188-196` — Phase 10 goal, success criteria, dependency on Phase 8

### Existing observability infrastructure (extend, do not replace)
- `src/observability/recorder.ts` — `Recorder` class. REPLACE-NOT-ACCUMULATE invariant, PER-FIRM ISOLATION, DETERMINISTIC OUTPUT ORDER, DISABLED-FIRM FILTER. Extend with 3 new fields + 3 new columns in toMarkdownTable()
- `src/observability/summary.ts` — `writeStepSummary()`. ENV-GATED (`$GITHUB_STEP_SUMMARY`), NEVER-THROWS, APPEND-ONLY, 1 MiB truncation handling. Accepts `markers: ClusterMarker[]` — widens to `DataQualityMarker[]` per D-03
- `src/compose/templates.ts` — `renderHtml()` takes `markers: ClusterMarker[]` at line 55 for Phase 8 D-14 Data Quality footer. Same parameter site widens per D-03
- `src/pipeline/run.ts` — Layer 1 short-circuit (`body.trim().length < 100` skip) + `writeStepSummary` call-site in finally block. Emits markers from cluster detector
- `src/pipeline/detectClusters.ts` — source of `ClusterMarker` type; Phase 10 will add low-confidence marker generation in parallel or adjacent module

### Upstream guard layer implementations (sources of truth for the GUARD column)
- `src/pipeline/run.ts` (Layer 1) — `summaryModel === 'skipped'` path
- `src/summarize/gemini.ts` + `src/summarize/prompt.ts` (Layer 2) — empty-string sentinel from Gemini + caller substitution
- `src/pipeline/detectClusters.ts` (Layer 3) — cluster demotion to `'low'` confidence

### Prior phase context (prior decisions that apply unchanged)
- `.planning/phases/08-hallucination-guard/08-CONTEXT.md` — D-04 (template null-branch removed, confidence-based rendering only), D-08 (cluster demote = confidence overwrite, idempotent), D-14 (renderDataQualityFooter pattern), D-15 (clean-run invisible), explicit Phase 10 deferrals listed in "Out of scope" section
- `.planning/phases/03-observability-dev-loop/` — original Recorder design, Pitfall 5 single-appendFile discipline, Pitfall 6 mid-stage-throw honesty invariant. If any Phase 3 artifact exists (e.g. 03-CONTEXT.md), treat its contents as locked

### Pipeline contract
- `.planning/PROJECT.md` — $0 budget, zero-API cost, cron-only execution environment (no persistent DB / background workers). DQOBS metrics must be computable in-process during a single pipeline run, no external calls
- `.planning/STATE.md` §30-40 — "v1.0 regressions status" + active follow-up backlog. Phase 10 must coordinate footer-space budget with Phase 8 cluster markers and any future bkl/kim-chang/shin-kim re-enablement warnings

### Commit-lineage references (recent fixes that affect the landscape)
- `344b65d` (fix(env): load dotenv locally + fail loud when GEMINI_API_KEY missing) — gemini.ts now throws AbortError when key is missing. Test stubbing pattern established in `0493c5a` (vi.stubEnv) — Phase 10 new tests that touch summarize must follow the same pattern
- `3bc05f3` (fix(shin-kim): ... tls-cert-fail classifier) — added new `tls-cert-fail` classifier branch; Phase 10 AvgBody/GUARD computation for disabled firms must respect `DISABLED-FIRM FILTER` invariant (don't render rows for enabled:false firms)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Recorder` class** (`src/observability/recorder.ts`) — Extend with three new per-firm metrics (`bodyLengthSum`, `bodyLengthCount`, `guardCount`, `confidenceH`, `confidenceM`, `confidenceL`). Preserve REPLACE-NOT-ACCUMULATE for scalar fields; body-length needs running sum + count for average computation, or store array of lengths and average at render time (simpler, no per-item divide-by-zero risk). Keep single `firm()` entry point
- **`writeStepSummary`** — already takes `markers`; widen type to `DataQualityMarker[]` and the existing append-to-$GITHUB_STEP_SUMMARY path absorbs the new columns and union markers for free. No new file-IO boundaries
- **`renderDataQualityFooter`** (referenced in `src/compose/templates.ts` Phase 8 D-14) — already the footer location; just add a switch on `marker.kind` to render low-confidence rows alongside cluster rows
- **`ClusterMarker`** type in `src/pipeline/detectClusters.ts` — the discriminated-union widening happens here (or in a new `src/pipeline/markers.ts` co-located with low-confidence marker generation)

### Established Patterns
- **Phase 3 Pitfall 6 (mid-stage throw honesty)**: if fetchAll throws after recording fetched=12 but before enrichBody's body-length record, the Recorder must honestly show fetched=12 + AvgBody=0 (or equivalent null). DO NOT back-fill. Current REPLACE-NOT-ACCUMULATE enforces this for scalars; keep the same discipline for aggregated fields (defer aggregation to render time)
- **Phase 3 D-15 clean-run invisible**: if no markers, no "Data Quality Warnings" section. Phase 10 adds the same discipline to any new output — don't clutter clean runs
- **Phase 8 D-04 confidence-based rendering**: the renderer already has confidence in scope per item. Phase 10 doesn't need per-item changes — only aggregates
- **Phase 1 B3 null-summary branch** (handled in existing templates): summaryModel === 'skipped' items already render with ⚠ 본문 확보 실패 badge. Phase 10 counts these but does NOT change per-item rendering

### Integration Points
- **Recorder write sites** — `src/pipeline/fetch.ts` (fetched + durationMs + errorClass), `src/pipeline/enrichBody.ts` (new: body-length record per item), `src/pipeline/run.ts` (newCount after dedup + summarized + confidence after summarize loop + guard-skip record). One extension site per pipeline stage
- **Marker generation site** — either in `src/pipeline/detectClusters.ts` (alongside existing cluster logic, filter-style over firm results) or a new `src/pipeline/detectLowConfidence.ts` module. Former keeps "detect anomalies" in one place; latter gives marker-generation-per-concern clarity. Planning decision
- **DRY_RUN emission site** — in `src/main.ts` around the existing `[DRY_RUN]` log lines. Call `Recorder.toMarkdownTable()` and render markers section with identical markdown as `writeStepSummary` would. No new helper — just invoke existing functions with `console.log` destination
- **Test boundaries** — vitest unit tests for Recorder aggregate math + marker generation threshold + classifier integration (markers list rendered through renderHtml) + DRY_RUN output assertion. Existing `test/pipeline/run.test.ts` and `test/compose/digest.test.ts` are the nearest neighbors to mirror

</code_context>

<specifics>
## Specific Ideas

No product references or "I want it like X" moments from this discussion. The design was driven by extending existing Phase 3 (Recorder / writeStepSummary) and Phase 8 (ClusterMarker / renderDataQualityFooter) patterns minimally — preserving every invariant those phases locked.

If a future Phase 10 plan needs UX comparisons, the nearest real-world analog for the step-summary is GitHub's own CI summaries (markdown tables with check marks / warnings) — Phase 10 stays inside that idiom.

</specifics>

<deferred>
## Deferred Ideas

- **Historical trending** (DQOBS would become "Cooley's avg body dropped from 8200 to 500 over 7 runs") — requires persistent time-series store beyond state/seen.json. $0 budget constraint and snapshot-based observability posture rule it out for v1.1. Candidate for a future v2 phase if operator signals demand.
- **Per-item confidence badges in the main digest body** — Phase 8 D-04 already handles the template's rendering layer by hiding per-item status; adding per-item H/M/L badges to every article would clutter the primary reading experience. Explicitly deferred per Phase 8 CONTEXT "Phase 10 선택 사항, NOT 선택".
- **Config-driven threshold** (user tunable 50% → 40% / 60% / etc.) — v2 candidate only. v1.1 hardcodes 50% + N≥3 floor per D-04.
- **Step-summary visual styling** (colors, emoji, bold formatting beyond plain markdown) — GitHub's markdown renderer supports emoji/bold but we don't need them. Stay minimal; upgrade only if a demonstrated readability gap emerges.
- **Layer-level breakdown in GUARD column** (S/E/C split like 2/1/0) — deferred per D-06 discussion; if operators later report they need to distinguish Layer 1 vs Layer 3 at a glance, a follow-up plan can split the column.
- **GHA workflow annotation emission** (`::warning file=...::` lines to turn low-confidence firms into PR annotations) — interesting for automated alerting but v1.1 is cron-only (no PRs), not useful today.

</deferred>

---

*Phase: 10-data-quality-observability*
*Context gathered: 2026-04-21*
