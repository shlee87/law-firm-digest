# Phase 7 Verification Report

**Generated:** 2026-04-20
**Status:** PASSED WITH EXCEPTIONS
**Audit artifact:** .planning/phases/06-firm-audit-probe/06-AUDIT.md (regenerated twice by this plan — once at Task 1, once after the 07-06 Task-3 bkl disable deviation)

## Success Criteria → Evidence

### SC-1: detail_tier field works; unset firms behave identically (DETAIL-01, DETAIL-03)

- **Evidence:**
  - 07-01-SUMMARY.md — schema test block added 4 tests covering detail_tier enum (`js-render` | `static`) + default-to-`static` + invalid-value rejection + strict-unknown-key enforcement.
  - 07-02-SUMMARY.md — enrichBody branch flipped from type-gate to detail_tier-gate; static path runs identically for detail_tier='static' or unset (zod-defaulted).
  - Regenerated 06-AUDIT.md — all firms with unset/static detail_tier (clifford-chance, freshfields, shin-kim, yulchon, logos, skadden) show NO regression from their pre-Phase-7 audit status.
  - `pnpm vitest run` = 326/326 passed at plan finalization (includes the 4 Phase 7 schema tests + the 5 replacement enrichBody tests from 07-02).
  - `pnpm tsc --noEmit` = 0.
- **Audit rows (representative — pre/post Phase 7):**
  - `| clifford-chance | rss | OK | 50 | n/a | n/a |` — unchanged.
  - `| freshfields | rss | OK | 40 | n/a | n/a |` — unchanged.
  - `| logos | html | OK | 10 | n/a | n/a |` — flipped from `selector-empty` (plan 07-04 fix, not detail_tier-related; demonstrates no detail_tier regression for logos' static path).
- **Status:** PASSED

### SC-2: bkl shows 2+ items with distinct, non-identical extracted body (DETAIL-02, DETAIL-04)

- **Status:** **DEFERRED WITH DOCUMENTED REASON** (07-06 Rule-2 deviation; parallel to SC-3 disposition for kim-chang 07-05)
- **Original target:** bkl activated with `detail_tier: 'js-render'` (plan 07-03) — Playwright detail fetch was expected to produce distinct bodies.
- **Finding (07-06 Task 3 UAT probe):** bkl still returns identical 5277-char body content across all 9 items, starting with `"INTRO NEWS INSIGHTS ABOUT ABOUT BKL 론스타 · 쉰들러 ISDS..."`. The v1.0 UAT (2026-04-19) hallucination symptom **persists**.
- **Root cause (identical shape to kim-chang 07-05):**
  - `canonicalizeUrl` (src/scrapers/util.ts:96) unconditionally strips leading `www.` during list parsing → detail URLs become `https://bkl.co.kr/law/insight/informationView.do?infoNo=NNNN&lang=ko`.
  - `bkl.co.kr` (bare apex) returns `HTTP 302 → Location: https://www.bkl.co.kr/` — a **path-stripping redirect to homepage root** (not a www-canonicalization redirect that preserves the path).
  - Playwright follows the redirect, lands on `https://www.bkl.co.kr/` (homepage).
  - `extractBody` with any body selector on the homepage returns homepage nav wrapper, which is identical across every detail URL.
- **Mitigation applied in 07-06:**
  - `bkl` disabled (`enabled: false`) with 35-line YAML comment block documenting the root cause, HTTP evidence, correct body selector (`.view-type1`, verified distinct per item: 842ch/992ch/894ch across infoNos 6542/6541/6540), and one-line re-enablement path after the URL-handling fix lands. Commit: `a3039af`.
  - Regenerated audit (`fa25e2b`) shows bkl absent from enabled scope — consistent with kim-chang's 07-05 disposition.
- **Follow-up plan scope** (shared with kim-chang 07-05):
  - Add `restoreFetchHost(itemUrl, firmUrl)` helper in `src/pipeline/enrichBody.ts` + `src/audit/firmAudit.ts#probeHtmlFirm` that restores `www.` on fetch URL when `firm.url.hostname.startsWith('www.')` AND `item.url.hostname === firm.url.hostname.slice(4)`.
  - Unit tests covering: (a) both-have-www → pass-through, (b) firm-has-www-item-doesnt → restore, (c) item-has-www-firm-doesnt → pass-through, (d) different registrable domains → pass-through.
  - On completion: flip `bkl` and `kim-chang` `enabled: true` (one line each), add `body: ".view-type1"` under `bkl.selectors` (already verified), re-run audit, verify `OK` status.
- **Why deferred (not fixed in 07-06):** The fix is a code change to `src/pipeline/enrichBody.ts`, exceeding plan 07-06's declared `files_modified: [06-AUDIT.md, 07-VERIFICATION.md]`. Plan 07-05 identified and tested this same fix but left it for a scoped follow-up plan per Rule 4 (architectural change). Plan 07-06 mirrors that disposition.

### SC-3: kim-chang shows ≥1 item with non-empty body (DETAIL-04)

- **Status:** **DEFERRED WITH DOCUMENTED REASON** (07-05 option C disposition per plan D-10 fallback path)
- **Evidence:** 07-05-SUMMARY.md — kim-chang disabled with 11-line YAML comment block capturing (a) root cause (canonicalizeUrl strips `www.` → `kimchang.com` bare apex has no TLS SAN for apex, only CN=`www.kimchang.com`), (b) symptom (every detail fetch fails with ERR_CERT_COMMON_NAME_INVALID), (c) fix path (same `restoreFetchHost` helper as bkl), (d) one-line re-enablement trigger.
- **Regenerated audit:** kim-chang absent from enabled scope (default audit excludes disabled firms per Phase 6 D-04).
- **Tested code-fix path** (07-05 throwaway probe): `restoreFetchHost` returns HTTP 200 with 55KB/71KB distinct Korean article bodies — re-enablement viable pending URL-handling plan.

### SC-4: detail_tier: 'invalid-value' fails startup with zod path-qualified error (DETAIL-05)

- **Evidence:**
  - Schema-level probe executed via `pnpm tsx -e`:
    ```
    const bad = { id:'test', name:'T', language:'ko', type:'html',
                  url:'https://example.com', timezone:'Asia/Seoul',
                  enabled:true, detail_tier:'invalid-value',
                  selectors:{ list_item:'li', title:'.t', link:'a' } };
    FirmSchema.safeParse(bad)
    ```
    → exit 0, stdout: `OK: error mentions detail_tier`. `JSON.stringify(issues)` contains the `detail_tier` field path (SC-4 literal satisfied).
  - Unit test: `pnpm vitest run test/config/schema.test.ts -t "Phase 7 detail_tier extension"` → 4/4 passed (locks the schema behavior including "rejects detail_tier: 'invalid-value' with path-qualified zod error" assertion — landed in 07-01).
  - Loader-level probe skipped: `src/config/loader.ts` hard-codes `config/firms.yaml` without a path-override parameter. Per plan Task 2 step 2: "If the loader does NOT support a path override... skip this step — step 1's schema-level test is sufficient evidence for SC-4 since zod runs identically whether the source is YAML or literal, and the unit test at `test/config/schema.test.ts` already exercises the same code path."
- **Status:** PASSED

## Out-of-scope residuals

- **shin-kim list-fail** — Phase 10/11 monitor per 06-AUDIT.md (fetch-level failure; not a detail-tier concern; pre-existed Phase 7).
- **yulchon detail-quality-unknown** — Phase 10/11 monitor per 06-AUDIT.md (1/2 detail fetches succeed; not a detail-tier concern; pre-existed Phase 7).
- **barun detail-empty** — Phase 10/11 monitor per 07-04-SUMMARY.md documented exception (image-only HTML email template; zero textual content by design; SUMM-06 B3 guard absorbs; Phase 10/11 OCR or title-only escalation candidate).
- **cooley** — disabled pre-Phase-7 (CF-blocked RSS, separate backlog: `.planning/backlog/cooley-cf-bypass.md`); Phase 9 Sitemap Tier is the named remediation.
- **kim-chang + bkl** — disabled with documented root cause (canonicalize+www interaction). Shared follow-up plan (scope: `src/pipeline/enrichBody.ts` + `src/audit/firmAudit.ts` + unit tests) fixes both firms in one commit.

## Phase 7 close-out

Closing conditions:

- **SC-1: PASSED** — detail_tier field works + backwards compatible (unset firms unchanged).
- **SC-2: DEFERRED WITH DOCUMENTED REASON** — bkl same root cause as kim-chang (canonicalize+www); 07-06 Rule-2 deviation applied (disable with full evidence); follow-up plan shared with kim-chang.
- **SC-3: DEFERRED WITH DOCUMENTED REASON** — 07-05 option C per plan D-10 fallback path.
- **SC-4: PASSED** — schema-level zod probe + unit test both confirm path-qualified error for invalid detail_tier.
- `pnpm vitest run` = 326/326 passed.
- `pnpm tsc --noEmit` exits 0.
- `pnpm audit:firms` regenerated twice (initial Task 1, then post-bkl-disable); final artifact at commit `fa25e2b`.
- UAT Task 3 checkpoint: **regression detected** on bkl hallucination persistence (exact v1.0 symptom); Rule-2 deviation applied (disable); Phase 7 closes with documented exceptions rather than blocking indefinitely.

**Phase 7 status: CLOSED WITH EXCEPTIONS.** Downstream Phase 8 (hallucination guard) can proceed — it is defense-in-depth against residual edge cases and would have been the second-line defense for the bkl hallucination we just disabled out of scope. Phase 11 (cron-gate) must verify that both bkl and kim-chang remain disabled until the shared URL-handling follow-up plan lands, OR that follow-up plan is executed between Phase 8 and Phase 11.

## Deviations from this plan

### Rule-2 auto-fix: bkl disable during Task 3 UAT regression check

- **Trigger:** Task 3 UAT probe revealed bkl's v1.0 hallucination symptom persists (9 items, 1 distinct 50-char prefix, 5277 identical chars starting with homepage nav). Plan 07-06 frontmatter `must_haves.truths` requires SC-2 demonstrably true — not achievable without URL-handling code fix (out of plan scope).
- **Disposition:** Disable bkl with 35-line YAML comment block (same pattern as kim-chang 07-05), re-regenerate audit, document as explicit deviation.
- **Scope expansion:** plan 07-06 declared `files_modified: [06-AUDIT.md, 07-VERIFICATION.md]`; this deviation adds `config/firms.yaml` to the modified set.
- **Rationale:** Alternative (leaving bkl enabled) would allow continued production hallucination under cron — violating the phase's v1.0-regression-eliminated goal. Disable is the "loudest alarm / aggressive failure detection" disposition preferred by the solo-operated project (per user memory). Reversible in one line once the follow-up URL-handling plan lands.
- **Commits:** `a3039af` (YAML disable), `fa25e2b` (audit re-regen).

### Note on audit-vs-production dispatch gap (carried from 07-03, 07-04)

The 06-AUDIT.md's `firmAudit.ts` dispatches by `firm.type` (not `detail_tier`), so html-tier firms with `detail_tier: 'js-render'` still run the static probe path in the audit. For firms where Phase 7's Playwright detail-fetch improvement DOES work correctly but the audit can't observe it, the audit row stays at its pre-Phase-7 status (e.g., bkl pre-disable would have read `detail-identical` in every audit run regardless of production behavior). This is intentional per 07-PATTERNS.md §`src/pipeline/run.ts` line 253. No Phase 7 plan addressed it; a future audit-dispatch-by-detail_tier plan could. For bkl specifically, the post-disable audit correctly reflects the firm's absence from enabled scope; the pre-disable "detail-identical" signal was a TRUE production signal (not a false-positive) because the underlying URL-handling bug means even production Playwright can't reach the article page.
