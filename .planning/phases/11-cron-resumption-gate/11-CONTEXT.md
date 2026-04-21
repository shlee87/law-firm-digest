# Phase 11: Cron Resumption Gate - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The daily cron schedule is restored only after a manual `workflow_dispatch` run confirms zero hallucination regressions across **all 13 enabled firms** (including bkl, kim-chang, shin-kim which must be re-enabled before this gate), and that acceptance is recorded with a dated, signed note in STATE.md.

**In scope:**
- Re-enable bkl, kim-chang, shin-kim (URL-handling fix prerequisite — must land before Phase 11 entry)
- One manual `workflow_dispatch` run
- Full per-item visual inspection against original articles
- Uncomment `schedule:` in `.github/workflows/daily.yml`
- Record signed acceptance note in STATE.md

**Out of scope:**
- Any new feature work
- Automated inspection tooling
- CI-enforced quality gates (Phase 10 DQOBS surfaces metrics; this phase is manual sign-off only)

</domain>

<decisions>
## Implementation Decisions

### Firm eligibility gate
- **D-01:** All 3 currently-disabled firms (bkl, 김앤장, 세종) MUST be re-enabled before Phase 11 proceeds. Phase 11 does NOT accept "10 out of 13 is good enough" — the cron must resume with all enabled firms working. The URL-handling fix (restoreFetchHost helper) is a blocking prerequisite.

### Inspection method
- **D-02:** Full per-item inspection — every item in the digest email is clicked through to the original article and the Korean summary is compared against the article body. Acceptance criterion: no item's summary is a generic firm description or verbatim title without cause. This is stricter than sampling.

### Acceptance note format
- **D-03:** STATE.md acceptance note must include: date (YYYY-MM-DD), pass/fail verdict, inspector name/handle. Example: `2026-04-22 수동 검수 완료, 전 항목 원문 대조 이상 없음. cron 복원 승인 (검수자: seonghoonyi)`.

### Re-disable protocol
- **D-04:** If quality degrades after cron is re-enabled (e.g., a firm's site layout changes causing body extraction to fail), the response is: (1) comment out `schedule:` in `daily.yml`, (2) add a blocker note in STATE.md with the affected firm and symptom, (3) fix the root cause, (4) re-run Phase 11 inspection before uncommenting again. No automated re-disable — manual action only.

### Claude's Discretion
- Exact wording of the blocker note template in STATE.md
- Whether to add a comment above the schedule: line in daily.yml referencing the acceptance date
- Order of steps in the plan (re-enable firms → smoke test individually → run workflow_dispatch → inspect → uncomment → record)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — RESUME-01, RESUME-02 acceptance criteria (authoritative)

### Workflow file
- `.github/workflows/daily.yml` — The `schedule:` block to uncomment (line 37). Includes the original cron expression `0 9 * * *` (09:00 UTC = 18:00 KST, OPS-01) and the pause comment explaining why it was disabled.

### State
- `.planning/STATE.md` — Where the dated acceptance note must be recorded. See existing session continuity and blocker format patterns in the file.

### Disabled firm fix prerequisites
- `.planning/phases/07-spa-aware-detail-tier/` — 07-05-SUMMARY.md (kim-chang URL-handling root cause) and 07-06-SUMMARY.md (bkl same root cause). The `restoreFetchHost` fix approach is documented here.
- `config/firms.yaml` — bkl, kim-chang, shin-kim all have `enabled: false` with explanatory comments. One-line `enabled: true` flip after fix.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/scrapers/util.ts:96` — `canonicalizeUrl` — the function that strips `www.` and causes bkl/kim-chang failures. The fix is to add `restoreFetchHost(itemUrl, firmUrl)` in `enrichBody` before the detail fetch.
- `pnpm check:firm` CLI — Use this to smoke-test individual firms after re-enabling, before running full `workflow_dispatch`.

### Established Patterns
- Phase 7 established the disable-with-evidence-comment pattern for bkl and kim-chang. Re-enablement is a one-line `enabled: true` flip once the URL fix lands.
- Phase 8 SUMM-06 / Layer 1-3 guards are in place — hallucination defense is live. Phase 11 is final human sign-off, not a code safety net.

### Integration Points
- `.github/workflows/daily.yml` line 37: `# schedule:` — uncomment this line and the line below it.
- `STATE.md` — append acceptance note after the last session continuity entry.

</code_context>

<specifics>
## Specific Ideas

- The URL-handling fix (restoreFetchHost) was prototyped in a throwaway script during Phase 7-05 and confirmed working — bkl/kim-chang both return HTTP 200 with distinct article bodies once `www.` is preserved. Implementation is known; it just hasn't been committed yet.
- Inspection should use the actual Gmail inbox (not dry-run HTML) — real delivery confirms the full pipeline end-to-end.

</specifics>

<deferred>
## Deferred Ideas

- Automated hallucination regression test suite (would run as part of CI instead of manual inspection) — out of scope for v1.1, candidate for v2
- Per-firm quality score threshold that auto-disables a firm when body quality drops — Phase 10 DQOBS metrics surface the signal; automated enforcement is a future gate

</deferred>

---

*Phase: 11-cron-resumption-gate*
*Context gathered: 2026-04-21*
