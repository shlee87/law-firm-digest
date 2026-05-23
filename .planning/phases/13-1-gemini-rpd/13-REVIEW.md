---
phase: 13-1-gemini-rpd
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - .github/workflows/daily.yml
  - .github/workflows/weekly.yml
  - package.json
  - src/cli/auditFirms.ts
  - src/cli/checkFirm.ts
  - src/compose/heartbeat.ts
  - src/main.ts
  - src/pipeline/runDaily.ts
  - src/pipeline/runTypes.ts
  - src/pipeline/runWeekly.ts
  - src/state/pending.ts
  - src/summarize/gemini.ts
  - src/observability/summary.ts
  - test/compose/heartbeat.test.ts
  - test/main.test.ts
  - test/pipeline/guard01Layer1.test.ts
  - test/pipeline/runDaily.e2e.test.ts
  - test/pipeline/runWeekly.e2e.test.ts
  - test/state/pending.test.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 13 splits the LegalNewsletter pipeline into daily (scrape -> summarize -> pending append) and weekly (read pending -> compose -> send -> archive -> truncate) modes. The split is well-executed: cross-mode forbidden-import invariants are enforced by the absence of imports + grep gates, the `geminiCallCount` module-level counter is sound under Node's single-threaded event loop, `toPendingItem` is an explicit projection that prevents COMP-05 body leakage, the strict zod schema enforces shape at the persistence boundary, and the shared `concurrency: digest-pipeline` GH Actions lock prevents seen/pending race between weekly and a Sunday daily overshooting into Monday.

Three warnings were found:

1. `runWeekly` truncates pending even when `skipEmail: true`, which is silent data loss for any future CLI dry path that passes the option.
2. `runDaily.jsRenderFailures` only counts firms with `firm.type === 'js-render'`, missing failures whose JS-rendering is via `detail_tier === 'js-render'` (the same surface checked by `hasJsRender` at browser launch).
3. `runWeekly` ordering issue: a `writeArchive` failure AFTER a successful `sendMail` leaves pending un-truncated, which guarantees a duplicate digest on the next weekly run.

Info items cover doc-comment drift (header docstring referencing a rejected cron form), unused-variable patterns from "symmetry" comments, and a few minor diagnostic-readability nits.

## Warnings

### WR-01: runWeekly truncates pending even when skipEmail=true (potential silent data loss)

**File:** `src/pipeline/runWeekly.ts:225-236`
**Issue:** When `skipEmail: true` is passed via `RunOptions`, `sendMail` and `writeArchive` are skipped, but `truncatePending()` still runs unconditionally on line 235. Any future caller (e.g., a `pnpm check:weekly` analogue of `check:firm`, or a one-off operator dry-run) that wants to inspect pending without sending will silently lose the entire pending window. The current production caller (`src/main.ts`) does not pass `skipEmail`, so impact today is zero — but the `skipEmail` field is declared on `RunOptions` and the comment in `runTypes.ts:9-11` explicitly says weekly "honors" it, creating a footgun.
**Fix:**
```ts
// src/pipeline/runWeekly.ts (around line 235)
if (!skipEmail) {
  await sendMail(payload);
  archivePath = await writeArchive(payload.html, now);
  reporter.section('send', `archive=${archivePath}`);
  // D-09: truncate only when send + archive succeeded.
  await truncatePending();
  reporter.section('truncate', 'pending cleared');
} else {
  reporter.section('would-send', payload.subject);
  reporter.section('would-truncate', 'skipped (skipEmail=true)');
}
```
Alternative: remove `skipEmail` from `RunOptions` entirely and from the runTypes comment if the feature is not actually wanted — Plan 13-05 already flags this with "simplifies if both daily+weekly end up not using it".

### WR-02: jsRenderFailures misses detail_tier='js-render' firms

**File:** `src/pipeline/runDaily.ts:250-252`
**Issue:** The exit-code-1 gate (Phase 4 D-08) counts only firms where `r.firm.type === 'js-render'`, but the browser launch decision on lines 104-109 considers both `f.type === 'js-render' || f.detail_tier === 'js-render' || f.type === 'sitemap'`. A firm with `type: 'html'` and `detail_tier: 'js-render'` that errors during enrichment will NOT trigger the fail-loud exit even though it consumed the browser and exhibited the same operator-actionable failure class. Result: js-rendering regressions on detail-tier-only firms go unnoticed in the cron failure-issue auto-opener.
**Fix:**
```ts
const jsRenderFailures = summarized.filter(
  (r) =>
    r.error != null &&
    (r.firm.type === 'js-render' || r.firm.detail_tier === 'js-render'),
).length;
```
Decide whether `type === 'sitemap'` should also count — if sitemap firms launch the browser they should likely participate in the same fail-loud gate.

### WR-03: writeArchive failure after sendMail success will resend on next weekly run

**File:** `src/pipeline/runWeekly.ts:225-235`
**Issue:** OPS-03 ordering puts `sendMail` before `writeArchive` before `truncatePending`. If `writeArchive` throws (disk full, permission, ENOSPC) AFTER `sendMail` succeeded, `truncatePending` never runs. The auto-issue opens. On the next weekly run (or manual `workflow_dispatch` retry), the same pending payload is read, the same digest composed, and `sendMail` fires again — the recipient gets a duplicate. SPEC says "idempotent recovery" but recovery here re-sends rather than skipping; archive failure is the one non-idempotent slot in the transaction.
**Fix:** Two non-exclusive options:
1. Reorder: `writeArchive(payload.html, now)` BEFORE `sendMail(payload)`. Archive failure then aborts before sending, preserving idempotency. The composed HTML doesn't depend on a successful send. This trades "archive only when sent" for "archive only when composed" — a defensible trade because writeArchive is local disk, far less likely to fail than SMTP.
2. Capture a "sent but not archived" sentinel by truncating pending immediately after sendMail, with archive as best-effort post-truncate (never blocks the run, similar to writeStepSummary). Skips duplicate-send risk at the cost of losing archive on the failure path.
Option 1 is cleaner; the only loss is that a successful archive no longer implies a successful send. Document via comment.
```ts
// Option 1:
let archivePath: string | undefined;
if (!skipEmail) {
  // Phase 13 W-03 fix: archive first so a disk failure does not leave
  // pending un-truncated after a successful send. Archive write is
  // local + cheap; sendMail is network + lossy. Archive failure aborts
  // BEFORE network egress => no duplicate-send window.
  archivePath = await writeArchive(payload.html, now);
  await sendMail(payload);
  reporter.section('send', `archive=${archivePath}`);
}
```

## Info

### IN-01: daily.yml header comment references rejected cron form

**File:** `.github/workflows/daily.yml:5-9`
**Issue:** The header docstring says `cron '0 12 * * 2-7,0'` but the actual cron expression on line 27 is `'0 12 * * 0,2-6'` (which is correct — `0,2-6` = Sun, Tue, Wed, Thu, Fri, Sat). The phase notes describe `2-7,0` as a "parser-rejected form" that was hot-fixed. The header docstring still references the rejected form, which will mislead future readers who diff the actual cron against the comment.
**Fix:**
```yaml
# Runs src/main.ts --mode=daily at 12:00 UTC (21:00 KST) every Tue-Sun (cron
# `0 12 * * 0,2-6` — Mon excluded because weekly.yml owns Mon at the same
```
(replace `2-7,0` with `0,2-6` in line 6)

### IN-02: GitHub Action version drift vs CLAUDE.md stack lock

**File:** `.github/workflows/daily.yml:42,47,121`, `.github/workflows/weekly.yml:45,47,116`
**Issue:** Workflows use `actions/checkout@v6`, `actions/setup-node@v6`, `stefanzweifel/git-auto-commit-action@v7`. The project CLAUDE.md "GitHub Actions" row pins these to `@v5`, `@v5`, `@v6` respectively. Either CLAUDE.md is stale (these have been upgraded) or the workflows are ahead of the lock. Either way it's a documentation drift worth resolving so future readers do not run into "v5 was tested, v6 is here, did anyone verify?" ambiguity.
**Fix:** Decide which is the source of truth and update the other. If the upgrades are intentional, update CLAUDE.md's stack table. If the workflows drifted, downgrade them to match the lock.

### IN-03: runDaily loads recipient purely for "symmetry"

**File:** `src/pipeline/runDaily.ts:86-89`
**Issue:** `await loadRecipient()` is called and its result discarded. The comment explains the call is for "symmetry with runWeekly contract" and to catch a future render-preview wiring. Cost is one zod parse of a tiny YAML — but the call now happens on every daily cron tick (6 days/week) and a misconfigured recipient would fail-loud at this line even though daily never sends. That is arguably a feature (catches recipient misconfig before Monday's weekly explodes) but is currently undocumented as a feature.
**Fix:** Either remove the call (recipient validation is purely a weekly concern), or convert the side-effect-only call into an explicit fail-fast guard with a comment:
```ts
// Pre-validate recipient config so a malformed RECIPIENT_EMAIL surfaces
// on Tue's daily run instead of waiting for Monday's weekly to crash.
await loadRecipient();
```

### IN-04: runWeekly loadSettings result discarded

**File:** `src/pipeline/runWeekly.ts:143`
**Issue:** Same pattern as IN-03 — `await loadSettings();` is called purely "for parity / future use". The result is not assigned. The same cost/benefit applies. If the intent is purely pre-validation, name it.
**Fix:** Same as IN-03 — either drop or add an explicit fail-fast comment.

### IN-05: PendingItemSchema accepts empty optional summaryError

**File:** `src/state/pending.ts:60`
**Issue:** `summaryError: z.string().optional()` accepts the empty string `""`. The producer `gemini.ts:193` always passes a non-empty `scrubbed` value, so today nothing writes `""`. But the schema does not prevent it; an upstream refactor could silently start persisting empty error strings that pass validation and confuse the operator (a "failed" item with empty error message).
**Fix:**
```ts
summaryError: z.string().min(1).optional(),
```

### IN-06: composeHeartbeat does not escape dateKst into HTML

**File:** `src/compose/heartbeat.ts:33-40`
**Issue:** `dateKst` is interpolated into `<h1>` and `<title>` text via template literal. The value comes from `formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd')` which is fully deterministic ASCII (`YYYY-MM-DD`) — no XSS risk today. Recipient and from address are NOT interpolated into HTML. This is purely a future-proofing nit: if anyone later adds user-supplied content into the heartbeat (e.g., a `note` field from a YAML setting), an HTML-escape pass at the boundary would be required.
**Fix:** No change required today; flag for future-proofing only. If the heartbeat ever interpolates anything other than `dateKst`, add `escapeHtml()` at the boundary.

---

_Reviewed: 2026-05-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
