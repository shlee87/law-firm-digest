---
phase: 11
plan: "01"
subsystem: scrapers/pipeline/audit/config
tags: [url-fix, tls, www-restore, bkl, kim-chang, re-enable]
dependency_graph:
  requires: [07-05, 07-06]
  provides: [restoreFetchHost, bkl-re-enabled, kim-chang-re-enabled]
  affects: [src/pipeline/enrichBody.ts, src/audit/firmAudit.ts, config/firms.yaml]
tech_stack:
  added: []
  patterns: [restoreFetchHost pure helper, TDD RED/GREEN]
key_files:
  created: []
  modified:
    - src/scrapers/util.ts
    - src/pipeline/enrichBody.ts
    - src/audit/firmAudit.ts
    - test/scrapers/util.test.ts
    - test/config/loader.test.ts
    - config/firms.yaml
decisions:
  - restoreFetchHost operates only on the fetch URL; canonical item.url (www-stripped) preserved for dedup
  - loader.test.ts DISABLED_FIRM_ID switched from bkl to shin-kim (Rule 1 fix — bkl now enabled)
metrics:
  duration: "~5 min"
  completed: "2026-04-21"
  tasks: 2
  files: 6
---

# Phase 11 Plan 01: restoreFetchHost + bkl/kim-chang Re-enablement Summary

**One-liner:** Pure `restoreFetchHost(itemUrl, firmUrl)` helper restores `www.` on detail fetch URLs for TLS-sensitive firms (bkl apex-redirect, kim-chang CN mismatch), wired into enrichBody and firmAudit, re-enabling both firms with bkl body selector added.

## What Was Implemented

### `restoreFetchHost` helper (`src/scrapers/util.ts`)

New exported pure function placed after `canonicalizeUrl`:

```typescript
export function restoreFetchHost(itemUrl: string, firmUrl: string): string
```

**Logic:** If `firm.url` hostname starts with `www.` AND `firm.url` hostname without `www.` equals the item URL hostname exactly, restore `www.` on the item URL for the fetch. All other cases (both have www, neither has www, different domains) return `itemUrl` unchanged.

**Root cause fixed:** `canonicalizeUrl` (DEDUP-02) unconditionally strips `www.` from every stored URL. Two firms required `www.` for TLS:
- **kim-chang:** TLS cert CN=`www.kimchang.com` — apex fetch fails with `ERR_CERT_COMMON_NAME_INVALID`
- **bkl:** Apex `bkl.co.kr` issues HTTP 302 → `https://www.bkl.co.kr/` (path-stripped homepage redirect) — Playwright follows and lands on homepage, not article

The canonical `item.url` (www-stripped) is **never modified** — dedup semantics are fully preserved.

### Wired into `src/pipeline/enrichBody.ts`

In the `needsPlaywrightDetail` branch, before `page.goto(...)`:

```typescript
const fetchUrl = restoreFetchHost(item.url, r.firm.url);
await page.goto(fetchUrl, { timeout: DETAIL_PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
```

`item.url` (canonical) is preserved in the result spread — only the goto target uses the restored host.

### Wired into `src/audit/firmAudit.ts`

Three call sites updated:

1. **`probeHtmlFirm`** (static fetch path): `restoreFetchHost(item.url, firm.url)` before `decodeCharsetAwareFetch(fetchUrl)`. Canonical URL stored in `bodies[].url`.
2. **`probeJsRenderFirm`** (Playwright path): `restoreFetchHost(item.url, firm.url)` before `detailPage.goto(fetchUrl, ...)`.
3. **`probeSitemapFirm`** (Playwright path): Same pattern — no-op for cooleygo.com (no www. in firm.url), safe to call universally.

## Config Changes (`config/firms.yaml`)

### kim-chang
- `enabled: false` → `enabled: true`
- Comment updated: `re-enabled 2026-04-21 (Phase 11-01) — restoreFetchHost fix landed`
- `detail_tier: 'js-render'` and all selectors unchanged

### bkl
- `enabled: false` → `enabled: true`
- Comment updated: `re-enabled 2026-04-21 (Phase 11-01) — restoreFetchHost fix landed`
- `detail_tier: 'js-render'` unchanged
- **Added** `body: ".view-type1"` under selectors — Phase 7-06 confirmed this selector yields distinct 842ch/992ch/894ch content per article (infoNo 6542/6541/6540)

## Test Results

### TDD Gate
- **RED commit:** `bab2d6d` — 5 `restoreFetchHost` tests failing (`restoreFetchHost is not a function`)
- **GREEN commit:** `882292d` — all 51 util.test.ts tests passing after implementation

### Full Suite
- **448 tests passing** (31 test files)
- `pnpm tsc --noEmit` — clean, no errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] loader.test.ts DISABLED_FIRM_ID was `bkl` — now enabled**
- **Found during:** Full test suite run after config changes
- **Issue:** `test/config/loader.test.ts` hardcoded `const DISABLED_FIRM_ID = 'bkl'`. Tests 1, 2, 3, 5 assert that `bkl` does NOT appear in `loadFirms()` (enabled-only) result. After re-enabling bkl, these 4 tests failed.
- **Fix:** Switched `DISABLED_FIRM_ID` to `'shin-kim'` (still disabled, Thawte TLS chain issue — distinct from www-canonicalize root cause). Updated comment explaining the history.
- **Files modified:** `test/config/loader.test.ts`
- **Commit:** `882292d` (same commit as implementation)

The loader.test.ts comment at line 44-48 explicitly anticipated this exact situation: "If bkl is re-enabled in a future phase, pick whichever firm in config/firms.yaml has enabled:false at that time." Fix was straightforward and within scope.

## Known Stubs

None — no placeholder data, no hardcoded empty collections, no TODO/FIXME introduced.

## Threat Flags

None — `restoreFetchHost` is a pure URL-string transformation with no network I/O, no auth surface, and no new trust boundary. The function explicitly avoids cross-domain host substitution (different-domain case is a pass-through).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/scrapers/util.ts` exists | FOUND |
| `src/pipeline/enrichBody.ts` exists | FOUND |
| `src/audit/firmAudit.ts` exists | FOUND |
| `test/scrapers/util.test.ts` exists | FOUND |
| `config/firms.yaml` exists | FOUND |
| `11-01-SUMMARY.md` exists | FOUND |
| RED commit `bab2d6d` exists | FOUND |
| GREEN commit `882292d` exists | FOUND |
| 448 tests passing | CONFIRMED |
| `pnpm tsc --noEmit` clean | CONFIRMED |
