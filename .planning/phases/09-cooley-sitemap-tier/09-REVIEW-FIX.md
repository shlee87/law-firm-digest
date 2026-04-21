---
phase: 09-cooley-sitemap-tier
fixed_at: 2026-04-20T22:26:00Z
review_path: .planning/phases/09-cooley-sitemap-tier/09-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-04-20T22:26:00Z
**Source review:** .planning/phases/09-cooley-sitemap-tier/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (critical + warning; 0 critical + 4 warnings)
- Fixed: 4
- Skipped: 0

All four in-scope warnings were addressed. The five Info-severity findings
(IN-01 … IN-05) are out of scope for this iteration (fix_scope =
critical_warning) and remain unchanged.

## Fixed Issues

### WR-01: Network-level throws in `scrapeSitemap` bypass classifier-coupled error shape

**Files modified:** `src/scrapers/sitemap.ts`, `test/scrapers/sitemap.test.ts`
**Commit:** b98741f
**Applied fix:** Wrapped `context.request.get` in an inner try/catch that
re-throws transport-level failures (DNS, connection reset, TLS, Playwright
request timeout) with the classifier-coupled `scrapeSitemap {firm.id}: fetch
failed — {cause}` shape. The outer `finally { await context.close(); }` still
runs on both code paths so the BrowserContext cleanup invariant is preserved.
Updated the module header's error-shape contract to document the new
`fetch failed` variant alongside the existing HTTP / malformed-XML /
zero-items shapes. Added a regression test that stubs a
`net::ERR_NAME_NOT_RESOLVED` reject on `context.request.get` and asserts both
the new prefix and that `context.close()` still fires exactly once.

### WR-02: `canonicalizeUrl` strips `www.` from sitemap detail URLs — replicates the 07-05/07-06 root cause for Cooley

**Files modified:** `test/scrapers/sitemap.test.ts`, `config/firms.yaml`
**Commit:** 25e2f63
**Applied fix:** Chose reviewer option (a) — pin current behavior with a
regression test + document the risk in firms.yaml so the operator is aware
of the fragile apex dependency. The new test `'emits canonicalized detail
URL (www. stripped, trailing slash dropped) — WR-02 regression pin'`
asserts the exact `https://cooleygo.com/share-incentives-employees-uk`
output from the fixture entry, so a future accidental change to
`canonicalizeUrl` is caught. The Cooley firms.yaml block was expanded with
a 13-line note flagging the TLS/apex-redirect risk and referencing the
planned `restoreFetchHost` follow-up (07-05-SUMMARY.md) which will resolve
bkl + kim-chang + Cooley-apex-risk in a single scoped change. Option (b)
(fast-track `restoreFetchHost`) was not pursued in this review-fix
iteration because its scope touches `enrichBody` + `firmAudit` + the
dedup/canonicalization contract and is out of character for a code-review
patch pass.

### WR-03: Explicit `detail_tier: 'static'` on a sitemap firm passes schema but is silently overridden at runtime

**Files modified:** `config/firms.yaml`, `src/config/schema.ts`
**Commit:** 769a5b8
**Applied fix:** Chose the reviewer's "at minimum" path — document the soft
violation in both the operator-facing YAML comment and the schema's internal
maintainer comment. firms.yaml's `detail_tier` field comment now explicitly
warns (in Korean, matching the rest of the file) that sitemap firms should
not set `detail_tier` because `'js-render'` is rejected by zod superRefine
and `'static'` is schema-accepted but runtime-ignored. schema.ts's
superRefine block now documents WR-03 as a known soft-violation and
references the proper fix (zod v4 `.catch()` or loader post-parse default
application) as a deferred follow-up that would touch backwards-compat
across all tiers. No runtime behavior change.

### WR-04: `enrichBody.ts` allocates a fresh `BrowserContext` per detail item inside the per-firm pLimit(1) loop

**Files modified:** `src/pipeline/enrichBody.ts`
**Commit:** 4e2ca9f
**Applied fix:** Scoped to the documentation-drift portion explicitly flagged
by the reviewer ("the implementation drifted from the comment"). The module
header used to describe BrowserContext discipline as "per-firm" but the
actual code opens a fresh context per detail item inside the pLimit(1) loop.
Rewrote the comment to accurately describe the per-ITEM pattern, note the
fresh-cookie-jar property it provides (prevents session leak between
articles within a firm), and document WR-04's performance-vs-correctness
tradeoff so future readers know the runtime refactor was explicitly deferred
by the reviewer ("treat this as a future optimization candidate rather than
a blocker"). No runtime change. Performance refactor (hoist
`newContext`/`close` out of per-item loop) left for a follow-up once the
cookie-leak analysis for the other js-render firms (bkl, kim-chang, lee-ko,
yoon-yang, barun, latham) concludes.

## Skipped Issues

None — all four in-scope warnings were successfully addressed.

## Out-of-Scope (Info findings, not attempted this iteration)

IN-01 through IN-05 are Info severity and outside this review-fix run's
scope (fix_scope = critical_warning). They remain untouched:
- IN-01: Rename `hasJsRender` → `needsChromium` at call sites
- IN-02: `titleFromUrl` Unicode-safe first-char uppercasing
- IN-03: Deduplicate `probeSitemapFirm` / `probeJsRenderFirm` detail-probe loop
- IN-04: Strengthen `'defaults to DEFAULT_LATEST_N=10'` assertion with a 15+ entry fixture
- IN-05: Minor schema.ts comment trimming (superseded once WR-03 proper-fix lands)

## Verification

- `npx tsc --noEmit`: clean (no errors introduced)
- `npx vitest run`: **29 files, 396 tests passed**
- Each fix committed atomically with `fix(09): {WR-ID} {description}` format
- Every modified file listed after the commit message (multi-file fixes
  bundled into a single commit per finding)

---

_Fixed: 2026-04-20T22:26:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
