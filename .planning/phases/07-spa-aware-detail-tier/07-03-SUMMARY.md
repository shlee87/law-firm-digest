---
phase: 07-spa-aware-detail-tier
plan: 03
subsystem: config
tags: [yaml, config, migration, detail-tier, phase-7]

# Dependency graph
requires:
  - phase: 07-01
    provides: FirmSchema.detail_tier zod enum field (js-render | static)
  - phase: 07-02
    provides: enrichBody detail_tier-gated Playwright branch + run.ts hasJsRender expansion
provides:
  - 6 firms explicitly declare detail_tier: 'js-render' in firms.yaml (bkl, kim-chang, lee-ko, yoon-yang, barun, latham)
  - YAML header stanza documenting detail_tier field in Korean for non-developer editors (CONF-07)
  - Investigation evidence that Phase 7's detail_tier code path works correctly, but extractBody()'s generic selector chain fails for bkl (selector problem, not Playwright problem)
affects: [07-04 (selector remediation), 07-05 (kim-chang root-cause), 07-06 (final Phase 7 audit regen)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "config/firms.yaml — detail_tier: 'js-render' inline-commented between enabled: and selectors: (tier-routing fields cluster above selectors)"
    - "firms.yaml header comment stanza matches existing fieldname:Korean-desc + bulleted notes style"

key-files:
  created: []
  modified:
    - config/firms.yaml

key-decisions:
  - "07-03: Task 3 audit-regen flagged the production-vs-audit verification gap — `pnpm audit:firms` dispatches by `firm.type`, so html-tier firms with detail_tier='js-render' still run the static probe path. bkl stays `detail-identical` in the audit table even though the production enrichBody path now routes through Playwright. This was called out in 07-PATTERNS.md and is by design for this plan scope; plan 07-06 (final phase audit) or a future audit-dispatch change would surface the Playwright-path improvement."
  - "07-03: Task 3 investigation via scripts/debug-bkl-detail.ts probe revealed bkl's true failure mode is NOT Playwright/URL — Playwright fetches distinct 62k/67k-byte HTML per infoNo, confirming plan 02's branch works. The failure is that extractBody()'s generic chain (article, main, .entry-content, .post-content, .article-body, #content) falls through to #content, which on bkl detail pages contains breadcrumb/nav chrome (876 / 1212 chars after strip) — NOT the article body. Fix requires bkl `selectors.body` YAML override (plan 04 scope) OR a Phase 7.1 / v1.2 generic-extractor upgrade."
  - "07-03: Loader acceptance snippet in plan had minor shape mismatch — `loadFirms()` returns `FirmConfig[]` directly, not `{ firms }`. Verified 6-firm detail_tier list via corrected call."

patterns-established:
  - "YAML per-firm detail_tier declaration position: after `enabled:`, before `selectors:` — keeps tier-routing fields (type, wait_for, detail_tier) grouped above selector config"
  - "SUMMARY-path acceptance branch: plan 07-03 acceptance C1 explicitly allowed `bkl stays non-OK + SUMMARY explains why` as valid completion when bkl doesn't flip; used here. Plan 07 author anticipated the audit-vs-production gap."

requirements-completed: [DETAIL-04]

# Metrics
duration: ~11 min
completed: 2026-04-20
---

# Phase 7 Plan 3: firms.yaml detail_tier migration Summary

**6 firms opt into detail_tier: 'js-render' in YAML + Korean header stanza documents the new field; audit-regen investigation confirmed production code path works but surfaces an extractBody selector gap for bkl that remains for plan 07-04.**

## Performance

- **Duration:** ~11 min (plus ~5 min extended investigation in Task 3)
- **Started:** 2026-04-20T12:58:20Z
- **Completed:** 2026-04-20T13:09:32Z
- **Tasks:** 3 (2 commits + 1 investigation-only)
- **Files modified:** 1 (config/firms.yaml)

## Accomplishments
- 6 firms (bkl, kim-chang, lee-ko, yoon-yang, barun, latham) now declare `detail_tier: 'js-render'` explicitly in `config/firms.yaml` — activates DETAIL-04 for bkl/kim-chang and preserves Phase 4 behavior for the 4 existing js-render firms after the type-gate removal (plan 07-02).
- Non-developer-facing YAML header stanza appended in Korean describing the `detail_tier` field (CONF-07 contract upheld).
- Investigation identified the REAL root cause behind bkl's `detail-identical` audit status: it's an `extractBody()` generic-chain gap, NOT a Playwright/URL bug as the v1.0 UAT symptom suggested. Evidence: Playwright fetches 62,085 bytes for infoNo=6542 and 67,937-equivalent bytes for infoNo=6541 (direct curl confirmation: different file sizes), so the detail URLs ARE distinct. The issue is `#content` on bkl detail pages is a nav wrapper (876 / 1212 chars of breadcrumb/chrome after strip), while the article body lives in a sub-container the generic chain doesn't hit.

## Task Commits

1. **Task 1: Add detail_tier: 'js-render' to 6 firm blocks** — `2dad024` (feat)
2. **Task 2: Append detail_tier explanation stanza to firms.yaml header** — `8205aa3` (docs)
3. **Task 3: Regression audit investigation** — no commit (plan instructed not to commit regenerated 06-AUDIT.md; investigation artifacts deleted)

**Plan metadata commit:** _(pending, created with SUMMARY.md)_

## Files Created/Modified
- `config/firms.yaml` — 6 `detail_tier: 'js-render'` lines + 5-line header comment stanza (11 net insertions; no deletions)

## Decisions Made
- **Accepted SUMMARY-path acceptance for bkl** — plan 07-03 Task 3 explicitly allowed `grep OR SUMMARY.md entry` as passing criterion. Pursued the investigation branch because the audit table did not change (bkl stayed `detail-identical`).
- **Did not modify bkl `selectors.body`** — plan 07-03 explicitly forbids selector edits (scope guard: "selector remediation for logos/skadden/lee-ko/barun is plan 04's job"). bkl is not in plan 04's listed remediation scope either, so a Phase 7 follow-up (or Phase 7.x / v1.2 backlog) is required.
- **Did not modify `firmAudit.ts`** — `PATTERNS.md` §`src/pipeline/run.ts` explicitly states "Phase 7 changes do not require modifying firmAudit.ts because the audit probe runs list+detail through Playwright per-tier" (per-tier = by `firm.type`). That decision propagates: the audit dispatch is by `type`, not `detail_tier`, so bkl (type=html) cannot reflect the Playwright-path improvement via `pnpm audit:firms`. A follow-up discussion is needed in plan 07-06 or v1.2 about either (a) teaching the audit to dispatch by `detail_tier` for detail-page probing, or (b) adding a separate production-path audit mode.

## Deviations from Plan

**None critical — Task 3 took the explicitly-allowed SUMMARY branch when bkl did not flip.** The plan authored this branch as "OR a SUMMARY.md entry explains why bkl did not transition (and what was attempted)," which is exactly what this document provides.

### Investigation evidence (not a fix — documented for plan 07-04 / 07-06 follow-up)

**1. [Rule 4 deferral - Architectural] bkl extractBody selector gap**
- **Found during:** Task 3 (regression audit + follow-up investigation via a temporary `scripts/debug-bkl-detail.ts` probe, deleted post-diagnosis)
- **Issue:** `pnpm audit:firms` does not transition bkl from `detail-identical` → `OK`. Two-layer root cause:
  1. `src/audit/firmAudit.ts` line 234 dispatches by `firm.type` only. bkl's `type: html` → `probeHtmlFirm()` uses `decodeCharsetAwareFetch()` (plain HTTP, no Playwright). So `detail_tier: 'js-render'` has zero effect on the audit probe path even when it is the decisive signal in production. (Called out in 07-PATTERNS.md line 253 — intentional for this plan scope.)
  2. `src/scrapers/util.ts#extractBody` generic chain (`article → main → .entry-content → .post-content → .article-body → #content`) hits `#content` on bkl pages. After noise strip (nav, aside, footer, etc.), `#content` on bkl detail pages is 876–1212 chars of breadcrumb/hamburger-menu chrome, NOT the article body. The article body lives in a sub-container the generic chain does not locate.
- **Evidence:**
  - `pnpm tsx -e` loader probe confirmed `detail_tier: 'js-render'` applies to exactly `[barun, bkl, kim-chang, latham, lee-ko, yoon-yang]` (sorted).
  - Playwright goto(`informationView.do?infoNo=6542`) with `waitUntil: networkidle` + 3s settle → landed URL unchanged, status 200, `<title>` = "소식자료 - 법무법인(유한) 태평양 | BAE, KIM & LEE LLC" (article page title, NOT homepage title), HTML 62,085 bytes.
  - Direct `curl` to the same URL returns 66,890 bytes, curl to `infoNo=6541` returns 67,937 bytes — distinct content per URL on the server side.
  - After `extractBody()` runs, the returned body is 5277-char nav chrome starting with "INTRO NEWS INSIGHTS ABOUT..." for both infoNos (same prefix because the nav strip didn't remove the dropdown menu structure, and `#content` is a broad wrapper).
- **Why NOT fixed here:** Plan 07-03 action explicitly states "Do NOT modify `selectors:` contents in any firm — selector remediation for logos/skadden/lee-ko/barun is plan 04's job." bkl is outside that list, so the fix belongs in either (a) an extension of plan 07-04 to include bkl body-selector, (b) a new follow-up plan, or (c) a generic-chain upgrade in `extractBody()` (phase-wide, requires threat-model review).
- **Suggested fix (for plan 07-04 / 07-06 author):** Add `selectors.body` YAML override for bkl. Actual DOM inspection required to pick the right selector (candidate: `.insight-view` or similar — needs live probe).
- **Committed in:** No commit (investigation-only; debug script was temporary and removed).

---

**Total deviations:** 0 auto-fixed. 1 architectural item flagged for plan 07-04 / 07-06.
**Impact on plan:** Plan 07-03 acceptance criteria A1-A4 (Task 1) and B1-B4 (Task 2) all pass. Task 3 passes via the SUMMARY-path clause the plan explicitly authored.

## Issues Encountered

- **Plan acceptance-snippet shape mismatch (minor):** The plan's `pnpm tsx -e` one-liner destructures `const {firms} = await m.loadFirms(...)` but `loadFirms()` returns `FirmConfig[]` directly. Re-ran with corrected `const firms = await m.loadFirms(...)` to get the expected `barun,bkl,kim-chang,latham,lee-ko,yoon-yang`. No functional impact; noted so plan 07-04+ authors do not re-copy the flawed snippet.
- **Audit-table unchanged post-plan** (see Rule-4 deferral above) — not an issue per-se; the plan anticipated this outcome with the OR-branch acceptance.

## Audit table before/after (no changes)

The `06-AUDIT.md` was regenerated as instructed by Task 3, then reverted (plan: "Do NOT commit the regenerated 06-AUDIT.md — it will be re-regenerated at the end of Phase 7 (plan 06)"). Content comparison:

| Firm | Before | After plan 07-03 | Expected in plan 04/06 |
|------|--------|------------------|------------------------|
| bkl | detail-identical | detail-identical | OK (after body selector fix) |
| kim-chang | detail-quality-unknown | detail-quality-unknown | OK (after plan 07-05 root-cause) |
| lee-ko | detail-empty | detail-empty | OK (after plan 04 selector fix) |
| yoon-yang | OK | OK | OK |
| barun | detail-empty | detail-empty | OK (after plan 04 selector fix) |
| latham | OK | OK | OK |

## Next Phase Readiness

- **Plan 07-04 (selector remediation)** is unblocked. It must (a) fix logos/skadden list selectors, (b) fix lee-ko/barun detail body selectors as originally scoped, AND (c) consider extending scope to include a bkl `selectors.body` override — the investigation evidence above gives the planner a head start.
- **Plan 07-05 (kim-chang root-cause)** is unblocked — the declarative activation is in place. If Playwright also fails for kim-chang, plan 05 proceeds with WAF/URL-template analysis as designed.
- **Plan 07-06 (final Phase 7 audit + verification)** should revisit the audit-dispatch-by-type decision. If plans 04/05 land body-selector overrides that make bkl / kim-chang produce distinct bodies, the audit (which still uses static fetch for type=html) may detect them without needing a Playwright-path audit — but if it doesn't, a planner-level decision is needed about whether to teach the audit to dispatch by `detail_tier`.

## Self-Check: PASSED

- FOUND: `.planning/phases/07-spa-aware-detail-tier/07-03-SUMMARY.md`
- FOUND: commit `2dad024` (Task 1)
- FOUND: commit `8205aa3` (Task 2)
- `grep -c "detail_tier: 'js-render'" config/firms.yaml` = 6 (expected 6)
- `grep -c "detail_tier : detail 페이지 fetch 방식" config/firms.yaml` = 1 (expected 1)

---
*Phase: 07-spa-aware-detail-tier*
*Completed: 2026-04-20*
