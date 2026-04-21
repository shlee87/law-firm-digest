# Phase 10: Data-Quality Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `10-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 10-data-quality-observability
**Mode:** discuss (standard)
**Areas discussed:** Table shape + body length, DQOBS-02 flag shape, GUARD column definition, DRY_RUN output

---

## Gray area selection

User selected ALL four identified gray areas to discuss (multiSelect answer).

---

## Area A — Table shape + body length

### A1. Table placement of the 3 new columns

| Option | Description | Selected |
|--------|-------------|----------|
| Append to existing table (9-col wide) | Single table, one scan, one header row. Mobile affordance slightly worse but consistent with GHA UI | ✓ |
| Separate `## Data Quality` table | Clean separation of quality vs ops; cost: same firm info in two places | |
| Hybrid (quality table only when markers > 0) | D-15-aligned but reduces at-a-glance observability | |

**User's choice:** Append to existing (9-col wide).
**Notes:** Preview rendered side-by-side — user confirmed the append layout was readable for their use case.

### A2. AvgBody semantics (stage + units)

| Option | Description | Selected |
|--------|-------------|----------|
| enrichBody `body.length` (UTF-16 code unit) | Most natural in Node/TS, pre-GUARD signal, matches `String.prototype.length` | ✓ |
| UTF-8 byte length (`Buffer.byteLength`) | Fair across CJK vs ASCII firms, requires reader mental model | |
| summarize-input length (title + body) | Final payload to Gemini, but summarize-skipped items complicate the average | |

**User's choice:** enrichBody `body.length`, UTF-16 code unit.
**Notes:** No follow-up needed.

### Claude's Discretion (A)
- Skipped body (<100 chars) INCLUDED in average (low values ARE the signal)
- Integer formatting, no decimals
- Fetched=0 firm → `—`

---

## Area B — DQOBS-02 low-confidence flag signal shape

### B1. Marker type shape

| Option | Description | Selected |
|--------|-------------|----------|
| Extend ClusterMarker into discriminated union (DataQualityMarker) | Single array, single switch, single renderer — minimum call-site churn | ✓ |
| Separate parallel `lowConfidenceMarkers[]` array | Explicit separation, 2x signatures | |
| Generic `DataQualityEvent[]` (event sourcing) | Forward-looking but overbuilt for 2 current types | |

**User's choice:** Extend ClusterMarker (with preview showing the union definition + usage).

### B2. Minimum item-count floor for the 50% threshold

| Option | Description | Selected |
|--------|-------------|----------|
| N ≥ 3 | Statistically meaningful floor; 1/1 and 2/2 low too noisy | ✓ |
| No floor (unconditional ≥50%) | Aggressive detection, memory-aligned but more false positives | |
| N ≥ 2 | Middle ground; still fires on 1/2 = 50% | |

**User's choice:** N ≥ 3.
**Notes:** User memory preference for aggressive detection was considered but user chose statistical sanity over aggression for this particular signal.

### B3. Render location in email footer

| Option | Description | Selected |
|--------|-------------|----------|
| Existing "⚠ Data Quality Warnings" footer alongside cluster markers | Single footer, consistent with Phase 8 D-14/D-15 invisible-when-clean | ✓ |
| Firm section header inline badge (`## Yulchon ⚠ 품질 의심`) | Inline visibility but fragments Data Quality narrative | |
| Both (footer + inline) | Maximum redundancy, aggressive-detection-aligned, but clutter risk | |

**User's choice:** Existing Data Quality footer (with preview).

---

## Area C — GUARD column definition

### C1. What counts toward the GUARD count

| Option | Description | Selected |
|--------|-------------|----------|
| Union (Layer 1 + 2 + 3 summed to one scalar) | Single glance, "bad items in firm"; breakdown lives in logs | ✓ |
| Layer 1 only (summaryModel === 'skipped') | Loses Gemini-recognized boilerplate events | |
| Layer 1 + 2 (pre-summarize guards) | Excludes cluster demotes (but Layer 3 still lowers H/M/L) | |
| Breakdown (S/E/C three fields like 2/1/0) | Maximum info, table-cluttering | |

**User's choice:** Union.

---

## Area D — DQOBS-03 DRY_RUN output format

### D1. DRY_RUN emission shape

| Option | Description | Selected |
|--------|-------------|----------|
| stdout markdown table (same as $GITHUB_STEP_SUMMARY) | Zero-divergence with GHA rendering; terminal readability OK | ✓ |
| Human-friendly label form (`cooley: fetched=10 avg-body=8200 guard=0 h=5 m=1 l=0`) | Easier terminal read, but format drift | |
| Both (markdown + label) | Maximum fidelity + readability, costs output volume | |

**User's choice:** stdout markdown (with preview).

### Claude's Discretion (D)
- Data Quality Warnings block also printed in DRY_RUN when markers exist (parity with GHA)
- `[DRY_RUN]` prefix convention reused from existing DRY_RUN lines
- stdout only (no file write in DRY_RUN)

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:
- Historical trending (time-series store out of budget scope)
- Per-item confidence badges in main digest body (explicitly deferred from Phase 8)
- Config-driven thresholds (v2 candidate)
- Step-summary styling (emoji / color) beyond plain markdown
- Layer-level breakdown in GUARD column
- GHA workflow annotations (`::warning file=...::`)

## External Research

None performed. Design derived fully from existing codebase patterns (Phase 3 Recorder invariants + Phase 8 ClusterMarker / renderDataQualityFooter lineage) and explicit Phase 8 deferrals that named Phase 10 as the owner.

---

*End of discussion log.*
