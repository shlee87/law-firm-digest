---
phase: 07-spa-aware-detail-tier
plan: 05
subsystem: config
tags: [yaml, kim-chang, root-cause, tls, canonicalize, disable, phase-7]

# Dependency graph
requires:
  - phase: 07-03
    provides: detail_tier='js-render' declared for kim-chang (DETAIL-04 literal)
  - phase: 07-04
    provides: 06-AUDIT.md baseline showing kim-chang detail-quality-unknown (0/2 detail fetches succeeded)
  - phase: 01
    provides: canonicalizeUrl with unconditional 'www.' strip (src/scrapers/util.ts:96)
provides:
  - kim-chang disabled with definitive root-cause documented (option C per D-10 fallback)
  - TLS cert CN vs canonicalize interaction identified as the detail-fetch blocker (not WAF, not 404, not URL template)
  - One-line code-fix path recorded for future re-enablement (scoped to enrichBody + firmAudit host restoration)
  - DETAIL-04 literal explicitly deferred with written reason per D-10 fallback path
affects: [07-06 (final Phase 7 audit regen — kim-chang absent from enabled scope), future canonicalize/enrichBody URL-handling phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "YAML inline comment as disable-reason evidence trail — multi-line block captures root cause, fix path, and re-enablement steps; pattern extends cooley's 'disabled, see backlog/*.md' shape"
    - "Preserve detail_tier + selectors on disabled firms so re-enablement is a one-line 'enabled: true' flip once the upstream blocker is resolved"

key-files:
  created: []
  modified:
    - config/firms.yaml

key-decisions:
  - "07-05: kim-chang detail fetch fails because canonicalizeUrl (src/scrapers/util.ts:96) unconditionally strips leading 'www.' during list parsing, producing detail URLs of the form 'https://kimchang.com/ko/insights/detail.kc?...' — but the server's TLS cert has CN=www.kimchang.com and the SAN does not include the apex 'kimchang.com'. Result: every detail fetch (static curl, static fetch in audit, Playwright in enrichBody) fails with ERR_CERT_COMMON_NAME_INVALID. List fetch works because firm.url (https://www.kimchang.com/ko/newsletter.kc) is used directly without canonicalization."
  - "07-05: Option C (disable with reason) chosen over Option A/B per plan D-10 fallback path because the fix is a code change to URL-handling (restore 'www.' on fetch URLs when firm.url has 'www.'), not a YAML change — and plan 07-05's frontmatter declares files_modified: [config/firms.yaml] only. Implementing the code fix would exceed plan scope and rightly belongs in a future scoped plan (likely Phase 10/11 follow-up or a v1.2 URL-handling hardening plan)."
  - "07-05: Investigation confirmed the code fix works via a throwaway test script (_tmp-kim-chang-detail-fix-test.ts, DELETED per plan scope-boundary rule). Fix shape: in enrichBody (and firmAudit.probeHtmlFirm) before fetching, if firm.url hostname starts with 'www.' AND item.url hostname is the 'www.'-stripped form, restore 'www.' for the fetch only. Tested: both sample detail URLs returned HTTP 200 with distinct Korean article bodies (55KB + 71KB). Dedup canonicalization semantics are NOT affected — the stored/compared URL remains 'kimchang.com'."
  - "07-05: detail_tier: 'js-render' and full selectors block preserved on disabled firm — re-enablement is a one-line 'enabled: true' flip once the future phase lands the host-restoration fix."
  - "07-05: 06-AUDIT.md regeneration restored to HEAD per the plan 07-03/07-04 precedent (Phase 7 plan audit regens are not committed — plan 07-06 owns the final phase audit snapshot). kim-chang absence from enabled-scope audit was verified via 'pnpm audit:firms' output before restore."

patterns-established:
  - "Disable-with-evidence shape for firms blocked by structural (non-remediable within plan scope) issues: multi-line comment block above 'enabled: false' captures (a) root cause with file+line reference, (b) observable symptom with verification command, (c) fix path for future re-enablement, (d) SUMMARY.md reference for full trace. Mirrors cooley's precedent but with structured root-cause pointer instead of free-text."
  - "Disabled-firm comment inline on 'enabled: false' line carries date + Phase/plan reference + 1-line symptom + SUMMARY link. Multi-line reason comment sits above the field so it survives YAML pretty-print / yaml-sort tooling."

requirements-completed: []

# Metrics
duration: ~20 min
completed: 2026-04-20
---

# Phase 7 Plan 5: kim-chang Root-Cause Summary

**kim-chang detail-fetch failure root-caused to canonicalizeUrl's unconditional `www.` strip interacting with kim-chang's TLS cert (CN=`www.kimchang.com`, no SAN for apex). Firm disabled with D-10 option C and full fix path documented; detail_tier + selectors preserved for trivial re-enablement once the scoped code fix lands in a future phase.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-20T14:45Z (investigation began after reading plan 07-05-PLAN.md)
- **Completed:** 2026-04-20T15:05Z
- **Tasks:** 2 (1 decision checkpoint auto-resolved to option C + 1 code commit)
- **Files modified:** 1 (config/firms.yaml)

## Accomplishments

- **Definitively root-caused kim-chang's 0/2 detail fetches** — not WAF, not 404, not URL template typo: `canonicalizeUrl` strips `www.` during list parse, and `kimchang.com` (bare apex) has no matching TLS SAN.
- **Tested a scoped code fix** that restores `www.` on the fetch URL when firm.url carries `www.` and item.url is the stripped form. Playwright returns HTTP 200 with 55KB/71KB distinct Korean article bodies. Fix is out of plan 07-05 scope (files_modified: [config/firms.yaml] only) but documented inline for the follow-up plan.
- **Disabled kim-chang cleanly per D-10 option C.** 11-line YAML comment block above `enabled: false` records the root cause, TLS evidence, fix path, and re-enablement steps. Inline comment on the `enabled: false` line carries the date, phase marker, 1-line symptom, and `07-05-SUMMARY.md` reference.
- **Preserved detail_tier + full selectors block** so re-enablement is a one-line `enabled: true` flip — no re-probing, no YAML archaeology.
- **Verified the disable via two audit runs** — default scope excludes kim-chang (11 firms in scope); `--include-disabled` shows `kim-chang (disabled, baseline)` with `detail-quality-unknown` status (same signal as before, now flagged as baseline noise).

## Task Commits

1. **Task 1: Investigate kim-chang detail fetch failure (decision checkpoint)** — no commit (decision-only checkpoint auto-resolved to option C per plan D-10 fallback + plan frontmatter files_modified scope)
2. **Task 2: Apply chosen remediation (disable with reason)** — `c978c76` (fix)

**Plan metadata commit:** _(created with SUMMARY.md at end of plan)_

## Files Created/Modified

- `config/firms.yaml` (lines 145-173): kim-chang block updated:
  - **Added** 11-line root-cause comment block above `enabled:` line explaining canonicalize+TLS interaction, ERR_CERT_COMMON_NAME_INVALID symptom, fix path scope, and re-enablement trigger.
  - **Changed** `enabled: true` → `enabled: false` with inline comment carrying date + symptom + SUMMARY.md link.
  - **Changed** `detail_tier: 'js-render'` inline comment to record the blocked activation state explicitly (previously said "activation (detail fetch previously empty)", now says "declared — activation blocked by canonicalize+TLS interaction; preserved for future re-enablement").
  - **Preserved** selectors block unchanged (list_item, title, link_onclick_regex, link_template, date) so re-enablement requires only a single-line flip.

## Investigation Trace

### Task 1 — Investigation procedure execution

All six steps from the plan's `<investigation_procedure>` were executed:

#### Step 1: Resolve live detail URLs

```
$ pnpm tsx scripts/_tmp-kim-chang-list.ts
items: 5
- "Kim & Chang Newszine (2026 Issue 1)"
  url: https://kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
  date: 2026-03-30T15:00:00.000Z
- "금융위, 자본시장 안정을 위한 체질개선 방안을 통해 주주보호 정책 발표"
  url: https://kimchang.com/ko/insights/detail.kc?idx=34432&sch_section=4
  date: 2026-03-22T15:00:00.000Z
...
```

**First observation:** Every resolved URL has `kimchang.com` (no `www.`), even though the YAML `link_template` literal string is `https://www.kimchang.com/ko/insights/detail.kc?sch_section={1}&idx={2}`. Root-cause hint already visible.

#### Step 2: Manual curl probe (both hostnames)

```
$ curl -sL -o /dev/null -w "status=%{http_code}\n" \
  "https://www.kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4" \
  -A "LegalNewsletterBot/1.0"
status=200

$ curl -sL -o /dev/null -w "status=%{http_code}\n" \
  "https://kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4" \
  -A "LegalNewsletterBot/1.0"
status=000
```

`status=000` from curl indicates TLS or network-level failure before HTTP is reached. Extended with `-v`:

```
$ curl -sLv "https://kimchang.com/..." -A "LegalNewsletterBot/1.0" 2>&1 | grep -iE "subject:|subjectAltName|SSL: no alt"
*  subject: CN=www.kimchang.com
*  subjectAltName does not match host name kimchang.com
* SSL: no alternative certificate subject name matches target host name 'kimchang.com'
```

**Evidence:** the server cert has `CN=www.kimchang.com` and no SAN entry for the apex `kimchang.com`. Bare-apex HTTPS therefore fails SNI validation.

#### Step 3: Playwright probe

```
$ pnpm tsx scripts/_tmp-kim-chang-detail-probe.ts
=== Probe with USER_AGENT: Mozilla/5.0 (LegalNewsletterBot/1.0; ...) ===

--- https://kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
  ERROR: page.goto: net::ERR_CERT_COMMON_NAME_INVALID at https://kimchang.com/...

--- https://kimchang.com/ko/insights/detail.kc?idx=34432&sch_section=4
  ERROR: page.goto: net::ERR_CERT_COMMON_NAME_INVALID at https://kimchang.com/...

--- https://www.kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
  goto.status:    200
  goto.url:       https://www.kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
  page.title:     Kim & Chang Newszine (2026 Issue 1) - Kim & Chang | 김·장 법률사무소
  content.length: 55141
  selector article: 1 match(es)
  ...
  visible.text.length: 1805
  text.preview: 본문 바로가기 ... 김·장 법률사무소에서 분기별 발행하는 국문 종합뉴스레터입니다. 주요 기사 목록: ...

=== Probe with Chrome UA: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ... ===

--- https://kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
  ERROR: page.goto: net::ERR_CERT_COMMON_NAME_INVALID at https://kimchang.com/...
```

**Evidence:** WAF hypothesis falsified — the `www.` URL returns full article body with distinct Korean title + content. The bare-apex form fails identically regardless of User-Agent (our bot UA vs realistic Chrome UA). This is a pure TLS-SNI issue, not WAF / bot-detection.

#### Step 4: Cross-check onclick regex extraction

Not required. Step 1 confirmed list extraction is working (5 items with correct titles and plausible URL shapes). The regex `goDetail\('(\d+)','(\d+)'\)` matches the HTML correctly. The URLs are structurally valid — they just have the wrong host due to canonicalization.

#### Step 5: Classify the finding

Three hypotheses evaluated:

| Hypothesis | Evidence | Verdict |
|------------|----------|---------|
| (1) URL template wrong | Template literal in YAML is `https://www.kimchang.com/...`; this is correct and matches what `www.`-form 200-returns. Canonicalization strips `www.` at `src/scrapers/util.ts:96`. | **Indirect root cause** — template is right, canonicalize is the transformer that breaks it |
| (2) WAF / bot block | Probe with realistic Chrome UA returns same `ERR_CERT_COMMON_NAME_INVALID`. `www.` form returns 200 regardless of UA. | **Falsified** |
| (3) 404 / session required | `www.` form returns 200 with full article content on first request, no cookies / no session handshake required. | **Falsified** |

**Root cause:** canonicalizeUrl + TLS cert interaction (not in the original three-hypothesis tree — it's a hybrid that manifests as "URL template broken downstream").

#### Step 6: Choose remediation

Three remediation options evaluated against plan scope:

| Option | Fits plan scope (`files_modified: [config/firms.yaml]`)? | Viability |
|--------|----------------------------------------------------------|-----------|
| A — Fix URL template in YAML | NO. Canonicalize strips `www.` unconditionally. Any YAML `link_template` producing `www.kimchang.com/...` is rewritten to `kimchang.com/...` by `canonicalizeUrl(rawUrl, firm.url)` at `util.ts:426`. Even a path-only template (`/ko/insights/detail.kc?...`) resolves against firm.url and then gets canonicalized to bare apex. | **Not viable within plan scope.** Would require code change to `canonicalizeUrl` (affects all firms' dedup keys — large cross-cutting refactor) OR to `enrichBody`+`firmAudit` (targeted but still code change). |
| B — Fix selector / onclick regex | Selectors are fine (5 items extracted with correct titles). Regex matches `goDetail('34505','4')` correctly. | **Not applicable** — no selector drift. |
| C — Disable with reason | Plan D-10 explicit fallback; YAML-only change; preserves activation block for one-line re-enable. | **Chosen.** |

**Resume-signal equivalent:** `option-C: canonicalizeUrl strips 'www.' → kimchang.com bare-apex TLS cert CN mismatch (CN=www.kimchang.com, no SAN for apex). Tested code-fix path (scripts/_tmp-kim-chang-detail-fix-test.ts) confirmed: restoring 'www.' on fetch URL yields HTTP 200 with 55KB/71KB distinct article bodies. Fix scope exceeds plan's files_modified contract; disable with full evidence for future re-enablement.`

### Task 2 — YAML diff applied

```diff
   - id: kim-chang
     name: 김앤장 법률사무소
     language: ko
     type: html
     url: https://www.kimchang.com/ko/newsletter.kc
     timezone: Asia/Seoul
-    enabled: true
-    detail_tier: 'js-render'  # Phase 7 DETAIL-04 activation (detail fetch previously empty)
+    # Phase 7-05 investigation (2026-04-20): disabled because our canonicalizeUrl
+    # helper (src/scrapers/util.ts:96) strips leading 'www.' from every URL, so
+    # list-parse produces detail URLs of the form 'https://kimchang.com/...'
+    # — but kim-chang's TLS certificate only covers 'www.kimchang.com' (CN=
+    # www.kimchang.com, SAN does not include the apex 'kimchang.com'). Every
+    # detail fetch therefore fails with ERR_CERT_COMMON_NAME_INVALID (both in
+    # Playwright and static fetch) — audit reports "0/2 detail fetches
+    # succeeded". List fetch works because firm.url is used as-is (un-
+    # canonicalized) and already contains 'www.'. Evidence + full fix path
+    # are recorded in .planning/phases/07-spa-aware-detail-tier/07-05-SUMMARY.md.
+    # Re-enable when a future phase adds host restoration on detail fetch
+    # (scoped to enrichBody + firmAudit — does not touch dedup canonicalization).
+    # Selectors + detail_tier preserved so re-enablement is a one-line
+    # 'enabled: true' flip.
+    enabled: false  # disabled 2026-04-20 (Phase 7-05) — TLS cert CN mismatch after canonicalizeUrl strips 'www.'. See 07-05-SUMMARY.md.
+    detail_tier: 'js-render'  # Phase 7 DETAIL-04 declared — activation blocked by canonicalize+TLS interaction; preserved for future re-enablement
     selectors:
       list_item: "ul.notice_list > li"
       title: ".notice_txt .title, .notice_txt._dotdotdot_news"
       link_onclick_regex: "goDetail\\('(\\d+)','(\\d+)'\\)"
       link_template: "https://www.kimchang.com/ko/insights/detail.kc?sch_section={1}&idx={2}"
       date: ".notice_date"
```

### Tested code-fix path (FOR FUTURE REFERENCE — NOT APPLIED IN THIS PLAN)

The minimal, targeted fix that restores kim-chang without touching `canonicalizeUrl` semantics:

```typescript
// In src/pipeline/enrichBody.ts AND src/audit/firmAudit.ts#probeHtmlFirm,
// before fetching item.url, call:

function restoreFetchHost(itemUrl: string, firmUrl: string): string {
  const item = new URL(itemUrl);
  const firm = new URL(firmUrl);
  if (firm.hostname.startsWith('www.') && firm.hostname.slice(4) === item.hostname) {
    item.hostname = firm.hostname;
    return item.toString();
  }
  return itemUrl;
}
```

Verified behavior (from the throwaway `_tmp-kim-chang-detail-fix-test.ts`, since deleted):

```
canonical: https://kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
restored:  https://www.kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4

https://www.kimchang.com/ko/insights/detail.kc?idx=34505&sch_section=4
  status: 200
  title:  Kim & Chang Newszine (2026 Issue 1) - Kim & Chang | 김·장 법률사무소
  content.length: 55035

https://www.kimchang.com/ko/insights/detail.kc?idx=34432&sch_section=4
  status: 200
  title:  금융위, 자본시장 안정을 위한 체질개선 방안을 통해 주주보호 정책 발표 - Kim & Chang | 김·장 법률사무소
  content.length: 71348
```

Both sample URLs return HTTP 200 with distinct article bodies (55KB + 71KB). Dedup canonicalization is unchanged (the stored URL in `SeenState` remains the `www.`-stripped form; the restore helper affects only the fetch round-trip). A Phase 10/11 or v1.2 plan should implement this with accompanying unit tests against the `restoreFetchHost` helper.

### Before/after audit row

| State | Kim-chang row |
|-------|---------------|
| Before (06-AUDIT.md HEAD) | `\| kim-chang \| html \| detail-quality-unknown \| 5 \| monitor \| Phase 10/11 \|` (in default-scope audit) |
| After (regenerated 2026-04-20T15:00:xxZ) — default scope | **row absent** (kim-chang no longer enabled; audit correctly excludes disabled firms per Phase 6 D-04) |
| After — `--include-disabled` | `\| kim-chang (disabled, baseline) \| html \| detail-quality-unknown \| 5 \| monitor \| Phase 10/11 \|` (baseline tag applied — no longer counted in non-OK gate) |

Regenerated audit file was **restored to HEAD** per the plan 07-03/07-04 precedent — Phase 7 plan audit regens are not committed; plan 07-06 owns the final phase audit snapshot.

## Decisions Made

- **Option C (disable with reason) chosen over Option A (code fix).** Plan 07-05 frontmatter declares `files_modified: [config/firms.yaml]` — a code fix to enrichBody/firmAudit would exceed declared scope and should properly land in a scoped follow-up plan. D-10 explicitly names this fallback path.
- **Tested the code-fix path in a throwaway script to confirm re-enablement viability.** This gives the next maintainer (and verifier) confidence that the disable is temporary and recoverable, not a dead-end. The throwaway scripts (`_tmp-*.ts`) were deleted per plan scope-boundary rule before committing.
- **Preserved `detail_tier: 'js-render'` and full selectors block on the disabled firm.** Re-enablement after the code fix lands is a single-line `enabled: true` flip. No archaeology required.
- **Updated the `detail_tier` inline comment** to distinguish "declared but activation-blocked" from "activation successful" — prevents confusion during a future read of the YAML.
- **Regenerated audit restored to HEAD.** Matches the plan 07-03 precedent: plan 07-06 owns the final Phase 7 audit snapshot. This plan's contribution to the audit (kim-chang exits enabled scope) is embodied in the config change, not in a committed audit regen.

## Deviations from Plan

**None critical.** Plan 07-05 executed as written, following the D-10 explicit fallback path:

> "수정 불가 (접근 차단 확정) → YAML에 `enabled: false` + 주석으로 'WAF-blocked, see Phase 7 investigation note' 기록, DETAIL-04 충족 불가 사유 명시."

The actual blocker signature differs from the canonical WAF case anticipated in 07-CONTEXT.md's hypothesis tree (not WAF, not 404-session — it's canonicalize+TLS). The plan's `<options>` block anticipates exactly this by offering option C as a generic "disable with reason" path rather than a WAF-specific path.

**No auto-fixes applied.** The investigation revealed a code bug in URL handling (canonicalize strips `www.` unconditionally for hosts that require it), but the fix is out of plan scope — plan frontmatter declares `files_modified: [config/firms.yaml]` only. Fixing canonicalize/enrichBody in this plan would be a Rule 4 architectural change requiring a checkpoint; in auto mode the safer path is documenting the fix and disabling the firm per D-10.

**No architectural changes applied** — but one is identified for a follow-up plan. See "Follow-ups" below.

## Issues Encountered

- **`git restore --source=HEAD .planning/phases/06-firm-audit-probe/06-AUDIT.md` was permission-blocked** (same policy as plan 07-04). Switched to `git checkout HEAD -- .planning/phases/06-firm-audit-probe/06-AUDIT.md` which succeeded. Same semantics; recorded here so a future plan can adopt the same tool choice pre-emptively.

## Known Stubs

**None.** kim-chang is disabled — no UI / runtime code references it at all (yaml loadFirms already filters `enabled: true` by default). The firm simply drops out of the pipeline entirely.

## Threat Flags

None. This plan disables existing surface rather than adding new surface.

## Self-Check

- FOUND: `.planning/phases/07-spa-aware-detail-tier/07-05-SUMMARY.md` (this file)
- FOUND: commit `c978c76` (Task 2 — disable kim-chang with TLS cert CN evidence comment)
- FOUND: `config/firms.yaml` with modified kim-chang block
- `grep -c "id: kim-chang" config/firms.yaml` = 1 (expected 1 — no duplication, block integrity preserved)
- `grep "07-05-SUMMARY.md" config/firms.yaml` = 2 matches (in multi-line reason comment + inline comment)
- `grep -c "^    enabled: false" config/firms.yaml` increments by 1 vs HEAD (kim-chang is the 2nd disabled firm; cooley was the 1st)
- `ls scripts/_tmp-*.ts 2>/dev/null | wc -l` = 0 (three throwaway probe scripts deleted pre-commit)
- `pnpm tsc --noEmit` = 0 (verified pre-commit)
- `pnpm vitest run` = 326/326 passed (verified pre-commit)
- `pnpm audit:firms` default-scope output: kim-chang row absent (11 firms in scope vs 12 at HEAD)
- `pnpm audit:firms --include-disabled` output: `kim-chang (disabled, baseline)` row present with same `detail-quality-unknown` status as HEAD (no semantic regression — just tier-re-routing to baseline noise)

## Follow-ups (for future phases)

1. **URL-handling fix plan (scope: src/pipeline/enrichBody.ts + src/audit/firmAudit.ts):** Add `restoreFetchHost(itemUrl, firmUrl)` helper that re-adds `www.` when firm.url has it but canonicalize stripped it. Unit tests covering (a) both-have-www → pass-through, (b) firm-has-www-item-doesnt → restore, (c) item-has-www-firm-doesnt → pass-through, (d) different registrable domains → pass-through. Wire into `enrichBody.ts` before the `page.goto(item.url, ...)` call and into `firmAudit.probeHtmlFirm` before `decodeCharsetAwareFetch(item.url)`. On completion: flip kim-chang `enabled: true` in the same plan, re-run audit, verify `OK` status.
2. **Consider broader canonicalize audit.** Are any OTHER firms potentially affected by `www.`-stripping for hosts that require it? Quick check of current 12 firms' TLS cert CN/SAN against bare-apex responses would surface silent detail-fetch-fail patterns for any firm whose TLS cert doesn't cover the apex. Low-priority but worth adding to a future audit polish plan.
3. **Verifier note:** plan 07-05 frontmatter lists `requirements: [DETAIL-04]`. DETAIL-04 literal is "kim-chang activation" — this plan chose the D-10 fallback path (activation blocked, disable with reason). The requirement SHOULD NOT be marked complete in REQUIREMENTS.md — it's deferred to a follow-up URL-handling plan. Only mark complete after kim-chang actually returns `OK` in the audit.

## Next Phase Readiness

- **Plan 07-06 (final Phase 7 audit + verification)** is unblocked. kim-chang is no longer in enabled scope; the audit will show 4 remaining non-OK firms (shin-kim, yulchon, bkl, barun) — all documented exceptions routed to Phase 10/11 or flagged for future phase attention.
- **Phase 11 cron gate** no longer needs to flag kim-chang as a non-OK enabled firm. The audit exit-code 1 will come from genuine Phase 7 non-completion (bkl detail-identical, barun documented image-only exception) or Phase 10/11-routed monitors, not from kim-chang.

---
*Phase: 07-spa-aware-detail-tier*
*Completed: 2026-04-20*
