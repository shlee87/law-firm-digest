---
phase: 07-spa-aware-detail-tier
plan: 06
subsystem: verification
tags: [phase-7, verification, audit, uat, hallucination-regression, bkl, kim-chang, canonicalize]

# Dependency graph
requires:
  - phase: 07-01
    provides: detail_tier zod enum + path-qualified error for invalid values (SC-4 evidence)
  - phase: 07-02
    provides: enrichBody detail_tier-gated Playwright branch + 5-test replacement block
  - phase: 07-03
    provides: 6-firm YAML migration + header stanza
  - phase: 07-04
    provides: logos/skadden list selectors + lee-ko/barun body selectors
  - phase: 07-05
    provides: kim-chang disabled with canonicalize+TLS root cause (option C per D-10)
provides:
  - Regenerated 06-AUDIT.md as Phase 7 / Phase 11 verification artifact
  - 07-VERIFICATION.md mapping SC-1..4 to evidence (PASSED / DEFERRED dispositions)
  - bkl disabled with Rule-2 deviation (same canonicalize+www root cause as kim-chang — HTTP 302 path-stripping redirect to homepage)
  - Definitive identification that bkl + kim-chang share ONE follow-up plan (restoreFetchHost helper)
affects: [08-hallucination-guard (defense-in-depth ready), 11-cron-resumption-gate (must verify bkl+kim-chang remain disabled or follow-up lands first), future URL-handling plan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 7-06 disable-with-evidence for bkl mirrors 07-05 kim-chang pattern: 35-line root-cause comment block above 'enabled: false' + inline comment with date + symptom + SUMMARY link; detail_tier + selectors preserved for one-line re-enablement"
    - "VERIFICATION.md 'DEFERRED WITH DOCUMENTED REASON' SC disposition — plan author explicitly authored this branch for SC-3 (07-05 option C); 07-06 extended the pattern to SC-2 (bkl) when the UAT regression surfaced the identical root cause"

key-files:
  created:
    - .planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md
    - .planning/phases/07-spa-aware-detail-tier/deferred-items.md (eslint findings, out-of-scope)
  modified:
    - .planning/phases/06-firm-audit-probe/06-AUDIT.md (regenerated twice — once at Task 1, once after bkl disable)
    - config/firms.yaml (bkl enabled:true → false — Rule 2 deviation during Task 3 UAT check)

key-decisions:
  - "07-06: Task 3 UAT DRY_RUN probe revealed bkl still produces identical 5277-char body content across all 9 items (nav wrapper starting with 'INTRO NEWS INSIGHTS ABOUT ABOUT BKL 론스타 · 쉰들러 ISDS...'). v1.0 (2026-04-19) hallucination symptom persisted despite plan 07-03 activation of detail_tier: js-render."
  - "07-06: Root cause identified — SAME as kim-chang 07-05. canonicalizeUrl strips 'www.' from detail URLs → bkl.co.kr (bare apex) returns HTTP 302 Location: https://www.bkl.co.kr/ (path-stripping redirect to homepage root, not www-preservation). Playwright follows redirect, lands on homepage; .view-type1 on homepage = nav wrapper (identical). bkl + kim-chang are ONE follow-up plan (restoreFetchHost helper in enrichBody + firmAudit), not two separate fixes."
  - "07-06: Correct body selector for bkl article page IS '.view-type1' — verified distinct across infoNo 6542 (842ch 부고...영결식 엄수), 6541 (992ch 배명인 前 법무부 장관 별세), 6540 (894ch 박지연 변호사...ALB 우수 변호사 50인). Inert today but documented in disable comment so re-enablement is 2-line (enabled:true + body:'.view-type1')."
  - "07-06: Rule-2 deviation applied (disable bkl) rather than Rule-4 checkpoint (stop and ask). Rationale: user memory preference is 'aggressive failure detection — solo-operated project → loudest alarm over noise'. Disabling the firm eliminates active production hallucination at the cost of 1-line YAML. Reversible in one line once URL-handling plan lands. Alternative (leaving enabled) would violate plan 07-06 must_haves 'the v1.0 UAT hallucination symptom for bkl is gone'."
  - "07-06: SC-2 disposition set to DEFERRED WITH DOCUMENTED REASON (parallel to SC-3/kim-chang). Plan's must_haves.truths require SC-2 demonstrably true but do not author a DEFERRED branch for SC-2 (unlike SC-3 which has explicit 'option C' OR-branch). 07-06 extends the DEFERRED pattern to SC-2 when the UAT regression surfaced the IDENTICAL root cause as 07-05's option-C case — treating this as 'option C for bkl' rather than a new category."
  - "07-06: yoon-yang showed transient list-fail in the second audit run (Playwright 15s timeout; fetch took 9.87s via check:firm, close to boundary). Re-ran audit; yoon-yang returned to OK. NOT a regression, just Playwright timeout flakiness. Final audit run captures OK status."
  - "07-06: Audit-vs-production dispatch gap is NOT a false-positive for bkl (called out in 07-03/07-04 concerns) — it's a TRUE production signal. The audit's static-path probe for type=html firms happens to correctly detect bkl's hallucination because the underlying URL-handling bug affects ALL fetch paths (static + Playwright), not just the static one."
  - "07-06: ESLint reports 2 pre-existing issues (test/audit/signals.test.ts:143 unused-vars error; test/config/schema.test.ts:344 unused-disable warning). Both landed during Phase 6 / Phase 7-01, NOT caused by 07-06. Logged to deferred-items.md per scope boundary rule; typecheck + vitest remain green."

patterns-established:
  - "Rule-2 disable-with-evidence for firms blocked by structural code-level issues (canonicalize + TLS or redirect interaction): mirror the kim-chang 07-05 pattern — root-cause comment block + inline enable-false comment + SUMMARY reference; detail_tier + selectors preserved for future one-line flip; body-selector documented in disable comment even if inert today. Applies to bkl 07-06 and should be the default pattern for any similar future discovery."
  - "DEFERRED WITH DOCUMENTED REASON SC disposition is reusable for multiple SCs when the root cause is shared — both SC-2 (bkl) and SC-3 (kim-chang) map to a single URL-handling follow-up plan; VERIFICATION.md makes the shared-follow-up visible so the follow-up plan author treats both firms as a single deliverable."
  - "UAT probe-then-remediate flow within a verification-sweep plan: plan 07-06 Task 3 was authored as a human-verify checkpoint with an explicit 'regression: <details>' resume-signal. In auto-mode the executor ran the probe, discovered regression, identified same root cause as 07-05, applied parallel disposition (disable with evidence), re-regenerated audit, marked SC DEFERRED — functionally equivalent to the human-in-the-loop path but without the pause. Documented as explicit Rule-2 deviation."

requirements-completed: [DETAIL-01, DETAIL-02, DETAIL-03, DETAIL-05]

# Metrics
duration: ~37 min
completed: 2026-04-20
---

# Phase 7 Plan 6: Phase Verification Summary

**Phase 7 closes with PASSED WITH EXCEPTIONS — SC-1/4 PASSED, SC-2/3 DEFERRED with identical root cause (canonicalize+www interaction). Task 3 UAT probe uncovered bkl's v1.0 hallucination still active; Rule-2 deviation disabled bkl (mirroring kim-chang 07-05); shared URL-handling follow-up plan fixes both firms with one restoreFetchHost helper.**

## Performance

- **Duration:** ~37 min
- **Started:** 2026-04-20T14:58:54Z
- **Completed:** 2026-04-20T15:35:30Z
- **Tasks:** 4 (3 commits + 1 auto-resolved checkpoint with deviation)
- **Files modified:** 3 (06-AUDIT.md x2, 07-VERIFICATION.md new, config/firms.yaml deviation)

## Accomplishments

- **SC-1 (DETAIL-01, DETAIL-03) PASSED** — detail_tier field works; unset/static firms unchanged (zero regression across 7 OK enabled firms).
- **SC-4 (DETAIL-05) PASSED** — inline `pnpm tsx -e` schema probe confirms `JSON.stringify(issues)` contains `detail_tier` field path for invalid value; unit test `pnpm vitest run -t "Phase 7 detail_tier extension"` = 4/4 locking the behavior.
- **06-AUDIT.md regenerated twice and committed** as Phase 7 / Phase 11 verification artifact — 7 OK + 3 non-OK enabled (shin-kim list-fail, yulchon detail-quality-unknown, barun detail-empty, all Phase 10/11 monitor or documented exceptions).
- **07-VERIFICATION.md created** mapping each SC to evidence with explicit references to prior plan summaries, audit rows, probe outputs, and follow-up plan scope.
- **bkl hallucination root-caused** — NOT a selector problem; SAME canonicalize+www issue as kim-chang. Identified the shared follow-up: ONE `restoreFetchHost(itemUrl, firmUrl)` helper in enrichBody + firmAudit fixes both bkl and kim-chang. Correct bkl body selector (`.view-type1`) verified distinct and documented in disable comment.
- **Full test suite green:** 326/326 tests pass at plan finalization; `pnpm tsc --noEmit` exits 0.

## Task Commits

1. **Task 1: Regenerate audit + full test suite regression sweep** — `eb17ad7` (chore) — initial audit regen (11 firms, bkl still enabled; 4 non-OK including bkl detail-identical)
2. **Task 2: SC-4 zod error probe** — no commit (verification-only; schema-level probe exit 0 + vitest 4/4)
3. **Task 3: UAT regression check (checkpoint:human-verify)** — Regression detected → Rule-2 deviation applied
   - **Deviation commit `a3039af`** (fix) — bkl disabled with 35-line root-cause comment block
   - **Audit re-regen commit `fa25e2b`** (chore) — 10 firms in scope, 7 OK + 3 non-OK enabled (bkl absent)
4. **Task 4: Emit 07-VERIFICATION.md** — `1a45afc` (docs) — SC-1..4 evidence mapping + Phase 7 close-out

**Plan metadata commit:** _(created with SUMMARY.md at end of plan)_

## Files Created/Modified

- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` — regenerated twice; final version (2026-04-20T15:32:42Z) has 10 firms in scope, 7 OK, 3 non-OK (shin-kim, yulchon, barun — all Phase 10/11 monitor or documented exceptions).
- `.planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md` — 100-line Phase 7 close-out mapping SC-1..4 to evidence with "PASSED WITH EXCEPTIONS" overall disposition.
- `.planning/phases/07-spa-aware-detail-tier/deferred-items.md` — eslint findings out-of-scope for 07-06 (2 pre-existing issues).
- `config/firms.yaml` — bkl block updated: 35-line root-cause comment block above `enabled:` line; `enabled: true` → `false` with inline comment; `detail_tier` inline comment updated to record activation-blocked state; selectors preserved unchanged.

## Decisions Made

See key-decisions in frontmatter. Highlights:

- **Rule-2 disposition chosen over Rule-4 checkpoint** for bkl disable — aligned with user memory preference for aggressive failure detection; alternative (leaving enabled) would violate plan must_haves; reversible in one line.
- **SC-2 DEFERRED disposition parallel to SC-3** — SAME root cause (canonicalize+www); extending the plan-authored DEFERRED pattern rather than inventing a new category.
- **Audit regenerated twice** — first run captured initial state (bkl still enabled detail-identical); second run captured final state (bkl disabled, yoon-yang transient timeout recovered). Final artifact is the committed one.
- **Body selector `.view-type1` documented in YAML comment** — inert today but correct for future re-enablement. Mirrors 07-05's pattern of documenting the tested-viable fix path inline even though the fix doesn't land in scope.

## Deviations from Plan

### Rule-2 auto-fix: bkl disable during Task 3 UAT regression check

**1. [Rule 2 - Missing Critical Correctness] Disable bkl to eliminate active production hallucination**

- **Found during:** Task 3 (UAT regression check via DRY_RUN + custom scripts/_tmp-bkl-uat-probe.ts)
- **Issue:** bkl's v1.0 (2026-04-19) hallucination symptom persisted after plan 07-03 activation of detail_tier: js-render. UAT probe showed 9 items with 1 distinct 50-char prefix and 5277-char identical bodies starting with "INTRO NEWS INSIGHTS ABOUT ABOUT BKL 론스타 · 쉰들러 ISDS...". Plan 07-06 must_haves.truths require SC-2 demonstrably true.
- **Root cause investigation:**
  - Probed bkl detail URLs with Playwright; found `.view-type1` returns distinct article bodies on `www.bkl.co.kr` URLs (842/992/894 chars).
  - Production path's fetched URLs were `bkl.co.kr` (no www — canonicalized).
  - `curl -sI "https://bkl.co.kr/law/insight/informationView.do?infoNo=6542&lang=ko"` returned `HTTP 302 Location: https://www.bkl.co.kr/` (path-stripping redirect to homepage).
  - Playwright on the canonicalized URL lands on homepage; `.view-type1` on homepage matches nav wrapper (identical).
  - **Root cause identical to kim-chang 07-05:** canonicalizeUrl strips `www.` unconditionally; bkl's server reacts differently from kim-chang's (redirect vs TLS fail) but both fail under the same upstream bug.
- **Fix applied:** YAML disable with 35-line root-cause comment block (mirrors 07-05 kim-chang pattern). `enabled: true` → `false`. detail_tier + selectors preserved. Inline comment carries date + Phase/plan + 1-line symptom + SUMMARY.md reference.
- **Files modified:** `config/firms.yaml` (1 firm block, lines 175-212).
- **Verification:**
  - `pnpm tsc --noEmit` = 0.
  - `pnpm vitest run` = 326/326 passed.
  - `pnpm audit:firms` regenerated → bkl absent from enabled scope; 7 OK + 3 non-OK remaining enabled firms match documented exceptions.
  - `pnpm audit:firms --include-disabled` would show bkl with its baseline signal (not verified in this run; matches kim-chang's 07-05 pattern).
- **Committed in:** `a3039af` (fix), `fa25e2b` (audit re-regen chore)
- **Scope expansion:** plan 07-06 declared `files_modified: [.planning/phases/06-firm-audit-probe/06-AUDIT.md, .planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md]`; this deviation adds `config/firms.yaml` to the modified set.
- **Rationale for Rule-2 over Rule-4:** Auto-mode user memory preference is "aggressive failure detection / loudest alarm over noise"; disable stops active hallucination under cron; reversible in one line once URL-handling follow-up lands. Documenting as explicit deviation preserves verifier visibility.

---

**Total deviations:** 1 Rule-2 auto-fix (bkl disable; same disposition as kim-chang 07-05 but triggered mid-verification-sweep rather than mid-selector-remediation).
**Impact on plan:** Plan 07-06 must_haves clause for SC-2 is NOT strictly met (the truth "SC-2 is demonstrably true" becomes "SC-2 is DEFERRED WITH DOCUMENTED REASON, same root cause as SC-3"). VERIFICATION.md makes the disposition explicit. Phase 7 closes with PASSED WITH EXCEPTIONS rather than PASSED.

## Issues Encountered

- **yoon-yang transient list-fail in second audit run** — Playwright timeout at 15s boundary; `check:firm yoon-yang` separately succeeded with 12 items in 9.87s. Re-ran audit; yoon-yang returned to OK. Not a regression, just flakiness. Final audit run is the committed artifact.
- **scripts/_tmp-bkl-uat-probe.ts signature drift** — initial probe used `enrichWithBody(items, firm, {browser})` but actual signature is `enrichWithBody(results: FirmResult[], browser)`. Corrected during investigation; temp scripts deleted post-diagnosis.
- **ESLint pre-existing issues surfaced** — 2 findings in test files (signals.test.ts unused-vars error + schema.test.ts unused-disable warning). Not caused by 07-06; documented in `deferred-items.md` per scope boundary.

## Known Stubs

**None** — 07-06 is verification-only + 1 disable deviation. No new runtime code; no UI / data stubs. bkl is disabled (no runtime code references it until future re-enablement).

## Threat Flags

**None** — 07-06 reduces active production surface (bkl disabled stops hallucinated summaries from reaching the user). No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

File/commit existence checks:

- FOUND: `.planning/phases/07-spa-aware-detail-tier/07-06-SUMMARY.md` (this file)
- FOUND: `.planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md` (Task 4 commit `1a45afc`)
- FOUND: `.planning/phases/06-firm-audit-probe/06-AUDIT.md` (Task 1 commit `eb17ad7`, then Task-3-deviation commit `fa25e2b`)
- FOUND: `.planning/phases/07-spa-aware-detail-tier/deferred-items.md` (Task 1 eslint surfacing)
- FOUND: commit `eb17ad7` (chore: initial audit regen)
- FOUND: commit `a3039af` (fix: bkl disable deviation)
- FOUND: commit `fa25e2b` (chore: audit re-regen post-disable)
- FOUND: commit `1a45afc` (docs: 07-VERIFICATION.md)

Content checks:

- `grep -E "^\| bkl .* \| OK \|" .planning/phases/06-firm-audit-probe/06-AUDIT.md` = 0 matches (bkl no longer in enabled scope — SC-2 evidence path replaced with disable-with-reason)
- `grep -cE "^### SC-[1-4]:" .planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md` = 4
- `grep -c "Status:.*PASSED" .planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md` = 3 (overall + SC-1 + SC-4; plan acceptance criterion "≥3" met)
- `grep -c "06-AUDIT.md" .planning/phases/07-spa-aware-detail-tier/07-VERIFICATION.md` = 7 (plan acceptance criterion "≥1" met)
- `pnpm tsc --noEmit` = exit 0
- `pnpm vitest run` = 326/326 passed
- `pnpm audit:firms` = exit 1 (expected — 3 non-OK enabled firms all documented exceptions or Phase 10/11 monitor; exit 2 would be a blocker)
- `grep -c "^    enabled: false" config/firms.yaml` = 3 (cooley + kim-chang + bkl; incremented by 1 vs plan 07-05 close state)

## Next Phase Readiness

- **Phase 8 (Hallucination Guard)** is unblocked. Defense-in-depth against residual edge cases; would have served as second-line defense for bkl hallucination we just disabled out of scope. Phase 8 scope unchanged.
- **Phase 11 (Cron Resumption Gate)** must verify on entry that bkl and kim-chang remain disabled OR that the shared URL-handling follow-up plan has landed. The follow-up plan can execute between Phase 8 and Phase 11, or as a Phase 10 prerequisite.
- **Shared URL-handling follow-up plan (spans: enrichBody + firmAudit + unit tests):**
  - Add `restoreFetchHost(itemUrl, firmUrl)` helper per 07-05-SUMMARY.md §"Tested code-fix path" and 07-06 VERIFICATION.md §SC-2.
  - Unit tests covering: (a) both-have-www → pass-through, (b) firm-has-www-item-doesnt → restore, (c) item-has-www-firm-doesnt → pass-through, (d) different registrable domains → pass-through.
  - On completion: flip bkl + kim-chang `enabled: true`, add `body: ".view-type1"` under `bkl.selectors`, re-run audit, verify OK status for both.
  - Could also opportunistically check other 10 firms for the same bare-apex TLS/redirect risk (quick curl sweep).

---
*Phase: 07-spa-aware-detail-tier*
*Completed: 2026-04-20*
