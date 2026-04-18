# Phase 5: Triggered Polish (v1.x backlog) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 05-triggered-polish-v1-x-backlog
**Areas discussed:** Trigger detection, Promotion workflow, Backlog scope, Phase lifecycle

---

## Trigger detection

### Q1: Numeric-trigger counters — add now or wait?

| Option | Description | Selected |
|--------|-------------|----------|
| Add passive counters now | GHA step-summary rows for QUOTA/ARCH/CACHE observability; no feature code | ✓ |
| Stay strictly zero-code | Eyeball GHA run logs manually; keeps phase definitionally pure | |
| Only QUOTA-01 counter now | Middle ground; QUOTA alone, rest manual | |

**User's choice:** Add passive counters now (Recommended)
**Notes:** Matches user's "aggressive failure detection" / loudest-alarm preference. Counters are observability, not features.

### Q2: Event-based trigger logging location

| Option | Description | Selected |
|--------|-------------|----------|
| CONTEXT.md trigger log + promote to PROJECT.md on fire | Append chronological observations to 05-CONTEXT.md; summarize to PROJECT.md KD when threshold crosses | ✓ |
| PROJECT.md Key Decisions only | Every observation straight into PROJECT.md; simpler but bloats the KD table | |
| Dedicated `.planning/triggers.md` ledger | Separate chronological ledger outside phase dir | |

**User's choice:** CONTEXT.md trigger log + promote to PROJECT.md on fire (Recommended)
**Notes:** Keeps routine observations lightweight; PROJECT.md KD becomes the evidence gate (later formalized as D-07).

---

## Promotion workflow

### Q3: Evidence gate — hard or soft?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate — evidence first, phase second | PROJECT.md KD row MUST exist before `/gsd-insert-phase`; /insert cites the KD row number | ✓ |
| Soft recommendation | Evidence encouraged but not blocking | |

**User's choice:** Hard gate (Recommended)
**Notes:** Success criterion 2 ("trigger evidence captured in PROJECT.md Key Decisions before any code lands") reads as a MUST — operationalized as D-07.

### Q4: Batching policy for concurrent triggers

| Option | Description | Selected |
|--------|-------------|----------|
| One trigger = one 5.x sub-phase | Clean phase boundaries, independent verification/rollback | ✓ |
| Batch related triggers | Bundle triggers that touch the same code area | |
| User picks case by case | No fixed rule | |

**User's choice:** One trigger = one 5.x sub-phase (Recommended)
**Notes:** Matches milestone's established vertical-slice pattern.

---

## Backlog scope

### Q5: Canonical backlog composition

| Option | Description | Selected |
|--------|-------------|----------|
| 8 v2 items + prior-phase deferred | Include the 5 "Phase 5 territory" items from Phase 3/4 deferred sections (Kirkland, rich wait-contract, --json, --fixture, wait_for_detail) | ✓ |
| Exactly the 8 v2 items | Cleaner boundary; /gsd:add-backlog handles the rest | |
| Open-ended — the phase IS the backlog | 8 items as seed; all future ideas land here | |

**User's choice:** 8 v2 items + prior-phase deferred (Recommended)
**Notes:** Explicitly excludes items marked "v2" rather than "Phase 5 territory" (multi-recipient, non-Gmail SMTP, etc.). Final roster = 13 items, frozen after commit.

### Q6: New ideas emerging AFTER this phase

| Option | Description | Selected |
|--------|-------------|----------|
| /gsd:add-backlog — separate system | Phase 5 CONTEXT.md is frozen; new ideas go to 999.x numbering | ✓ |
| Append to Phase 5 CONTEXT.md | Living document; simpler to find but breaks artifact immutability | |

**User's choice:** /gsd:add-backlog (Recommended)
**Notes:** Preserves CONTEXT.md as a decisions snapshot for downstream agents.

---

## Phase lifecycle

### Q7: Where do the numeric-trigger counters land?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Phase 3 step summary via supplement plan | Counters as natural Phase 3 D-09 extension; Phase 5 stays zero-code | ✓ |
| Land under Phase 5 as 05-01-PLAN.md | Honest about counters serving Phase 5, but breaks "nothing pre-committed" | |
| Inline fold into Phase 4's daily.yml edit | Fewest phase-boundary crossings but couples unrelated concerns | |

**User's choice:** Extend Phase 3 step summary via supplement plan (Recommended)
**Notes:** Success criterion 3 ("no item ships speculatively") holds literally. D-13 sequences this AFTER Phase 4 executes to avoid daily.yml merge conflicts.

### Q8: When does Phase 5 show ✓ complete?

| Option | Description | Selected |
|--------|-------------|----------|
| When CONTEXT.md committed + counters land | Parent closes; children (5.x) remain latent | ✓ |
| Never close — stays active until every item triggered/rejected | Rolling v1.x list; reflects "non-committal holding zone" literally | |
| Close at milestone boundary (v1.0 complete) | Explicit closure; untriggered items carry to v1.1+ | |

**User's choice:** When CONTEXT.md committed + counters land (Recommended)
**Notes:** Matches success criterion 3 ("can be closed or indefinitely held open"). Parent closes, 5.x children may never fire — that's fine.

---

## Claude's Discretion

- Exact step-summary counter formatting (⚠ vs ! vs bold) — Phase 3 supplement plan decides, consistent across all three.
- `05-VERIFICATION.md` hand-written vs `/gsd:verify-work` auto-generated — either works.
- PROJECT.md Key Decisions row template wording — establish when first trigger fires, not preemptively.
- Whether `/gsd:add-backlog` entries that could be Phase-5-territory in hindsight get a tag — operator's call at capture time.

## Deferred Ideas

- Auto-firing trigger automation (rejected — human judgment stays in the loop).
- Pretty-formatted Trigger Observations log (plain markdown sufficient).
- Per-item dormancy score (overkill at 13 items).
- Migration of prior-phase deferred sections into 05-CONTEXT.md (keep them as historical artifacts; duplication is the cost of immutability).
- Pre-commit hook enforcing the D-07 evidence gate (promote if discipline slips).
