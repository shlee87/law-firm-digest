---
phase: 04-js-rendered-tier-conditional
plan: 07
subsystem: scraping
tags: [playwright, probe, js-render, selectors, verification, lee-ko, yoon-yang, barun, latham]

requires:
  - phase: 04-js-rendered-tier-conditional-01
    provides: FirmSchema superRefine that admits type='js-render' + wait_for
  - phase: 04-js-rendered-tier-conditional-02
    provides: parseListItemsFromHtml shared extractor (two URL branches)
  - phase: 04-js-rendered-tier-conditional-03
    provides: scrapeJsRender with browser-injection + three error-class shapes
provides:
  - Throwaway Playwright probe script (scripts/probe-js-render.ts) that runs the production scraper against live firm URLs
  - Paste-ready YAML configs for lee-ko, barun, latham firms (plan 08 input)
  - Flagged production blocker for yoon-yang (extractor needs third URL-resolution branch)
  - Canonical barun newsletter URL (barunlaw.com/barunnews/N) — previously unknown
affects: [04-08, future plans adding new js-render firms]

tech-stack:
  added: []
  patterns:
    - "Probe-before-enable discipline — never land enabled:true in firms.yaml without a live probe run"
    - "Throwaway scripts in scripts/ reuse src/scrapers/* unchanged (same code path as production)"
    - "Probe extension pattern: probe script tracks the extractor's resolution branches one-to-one"

key-files:
  created:
    - scripts/probe-js-render.ts
    - .planning/phases/04-js-rendered-tier-conditional/04-07-PROBE-RESULTS.md
  modified: []

key-decisions:
  - "Phase 2 audit hint for lee-ko was wrong — actual selectors are .leeko-new-newsletter__item, not ul#contentsList > li; lee-ko needs onclick-regex branch because href='javascript:void(0);' onclick='goDetail(N)'"
  - "barun canonical URL is https://barunlaw.com/barunnews/N; Phase 2 audit candidate baruninews.com has dead DNS"
  - "yoon-yang cannot be enabled without extractor patch — uses href='javascript:doView(N)' with NO onclick attr, neither existing parseListItemsFromHtml branch captures it"
  - "Probe script extended to support --link-onclick-regex + --link-template (mirrors parseListItemsFromHtml two-branch resolution) so lee-ko could be verified"

patterns-established:
  - "Pattern: Probe script mirrors extractor branches — when extractor gains a new URL branch, probe gains matching CLI flags (Rule 2 applied to scripts/probe-js-render.ts during execution)"
  - "Pattern: Network politeness ledger — probe sessions record aggregate requests-per-firm for CLAUDE.md budget audit"

requirements-completed: []

duration: ~25min
completed: 2026-04-19
---

# Phase 4 Plan 07: JS-Render Probe Summary

**Live-verified wait_for + list_item + title + link selectors for 3 of 4 target js-render firms (lee-ko, barun, latham fully ready; yoon-yang flagged as production-blocked until extractor patch).**

## Performance

- **Duration:** ~25 min (including probe extension, discovery curls, four Playwright probes, documentation)
- **Started:** 2026-04-19T02:30Z (approx — Playwright install trigger)
- **Completed:** 2026-04-19T02:55Z (approx)
- **Tasks:** 2 (Task 1 autonomous + Task 2 live probes)
- **Files created:** 2 (probe script + PROBE-RESULTS.md)

## Accomplishments

- `scripts/probe-js-render.ts` throwaway probe shipped; reuses `scrapeJsRender` unchanged (production code path verified end-to-end).
- All 4 target firms probed live against real production URLs; 4/4 extracted ≥1 item.
- **lee-ko (6 items, 5.2s):** full selector rewrite vs. Phase 2 audit hint; onclick-regex branch required.
- **barun (10 items, 1.2s):** URL + selectors derived from scratch (no audit hints); canonical URL discovered.
- **latham (16 items, 1.6s):** audit placeholder selectors verified verbatim.
- **yoon-yang (12 items, 17s):** title/list selectors verified but flagged as production-blocked — extractor needs new URL-resolution branch.
- PROBE-RESULTS.md carries paste-ready YAML blocks for plan 08 + Rule 2 extractor-patch escalation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/probe-js-render.ts throwaway probe** — `3bfb6cc` (feat)
2. **Task 1 extension: Support onclick-regex link branch** — `6101c8a` (feat) — Rule 2 auto-added during live run to enable lee-ko probe
3. **Task 2: Run 4 live probes + write PROBE-RESULTS.md** — `6e606ec` (chore)

**Plan metadata:** [final commit hash] (docs: complete plan)

## Files Created/Modified

- `scripts/probe-js-render.ts` — New throwaway Playwright probe; accepts `--firm`, `--url`, `--wait-for`, `--list-item`, `--title`, plus either `--link` OR `--link-onclick-regex + --link-template`. Reuses `scrapeJsRender` from production.
- `.planning/phases/04-js-rendered-tier-conditional/04-07-PROBE-RESULTS.md` — Full probe logs, verified YAML blocks (plan 08 paste source), deviation table, extractor-patch escalation.

## Per-firm results

| Firm | Verified? | Items | Probe time | Changed from audit hint? |
|------|-----------|-------|------------|--------------------------|
| lee-ko | ✓ | 6 | 5217ms | **Yes — full rewrite.** Audit hint `ul#contentsList > li` wrong; actual `.leeko-new-newsletter__item` + onclick-regex branch. |
| yoon-yang | ⚠ partial | 12 | 17170ms | **Yes — title selector.** `.tit` (not `.title`); URLs blocked pending extractor patch. |
| barun | ✓ | 10 | 1188ms | **N/A — no audit hints.** URL + selectors derived from scratch; canonical URL `barunlaw.com/barunnews/N` discovered. |
| latham | ✓ | 16 | 1632ms | **No deviation.** YAML placeholders verbatim. |

## Decisions Made

- **Probe extended with onclick-regex branch (Rule 2).** lee-ko's `href="javascript:void(0);" onclick="goDetail(N)"` shape is handled by production extractor's second branch, but original probe CLI only exposed the href-anchor branch. Extending the probe was necessary to verify lee-ko rather than punt its verification to plan 08's post-paste failure.
- **barun URL is `barunlaw.com/barunnews/N`, NOT `/barunnews/N/newsLetter`.** Audit suggested the latter suffix; the shorter form returned the same page with a simpler URL.
- **yoon-yang flagged rather than forced.** Alternative would have been crafting a `javascript:` URL-encoded config and hoping canonicalizeUrl+email render it sensibly. Rejected — would ship broken email links. Proper fix is an extractor patch in plan 08 (or a dedicated follow-up plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended probe with onclick-regex link branch**

- **Found during:** Task 2 (live lee-ko probe, attempt 1 returned exit 2 playwright-timeout on seed selectors; curl inspection revealed onclick-dispatcher URL pattern)
- **Issue:** Probe CLI only accepted `--link <sel>` (href-anchor branch). The production extractor `parseListItemsFromHtml` supports two URL-resolution branches (`selectors.link` AND `selectors.link_onclick_regex + link_template`), but the probe only exercised one. lee-ko uses the second branch; without probe support, lee-ko could not be verified live before plan 08.
- **Fix:** Added `--link-onclick-regex` + `--link-template` CLI flags with mutually-exclusive validation (either `--link` OR both onclick flags required). Probe now constructs the synthesized `FirmConfig.selectors` with matching keys so both production branches are reachable.
- **Files modified:** `scripts/probe-js-render.ts`
- **Verification:** `pnpm typecheck` clean; lee-ko probe re-run succeeded with 6 items and clean `https://leeko.com/leenko/news/newsLetterView.do?...` URLs.
- **Committed in:** `6101c8a` (separate from Task 1 `3bfb6cc` — kept atomic so audit trail shows the extension was a live-run discovery, not part of the original plan)

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Extension necessary for completeness of Task 2 acceptance (all 4 firms verified). No scope creep — probe is still a throwaway that mirrors production extractor branches one-to-one.

## Issues Encountered

- **Phase 2 audit hint drift:** The audit-suggested selectors for lee-ko (`ul#contentsList > li` / `.title`) are **not present anywhere on the live page**. This validates the plan's core premise (D-03: always re-verify before enabling). Without this probe, plan 08 would have landed a broken lee-ko config.
- **yoon-yang URL shape not captured by extractor:** `href="javascript:doView(N)"` with no `onclick` attribute — neither branch of `parseListItemsFromHtml` handles this. Escalated as a Rule 2 recommendation to plan 08 (add `link_href_regex + link_template` branch OR extend onclick branch to fall back to href). PROBE-RESULTS.md documents both options with the recommendation for Option A (explicit new branch).
- **barun audit URL dead:** `www.baruninews.com` has dead DNS (HTTP 000). Discovered canonical via `barunlaw.com/barunnews/N`. Server-rendered HTML — js-render tier works as a superset; future plan may demote to html tier for ~80% speedup.

## User Setup Required

None — probe is a throwaway script, not production code. Playwright chromium install was performed during execution (`pnpm exec playwright install chromium --only-shell`).

## Next Phase Readiness

- **Plan 08 input ready.** PROBE-RESULTS.md contains paste-ready YAML blocks for 3/4 firms: lee-ko, barun, latham.
- **Plan 08 must address yoon-yang blocker** before enabling: add `link_href_regex + link_template` branch to `parseListItemsFromHtml` (+ schema field) OR extend existing onclick branch. Keep `enabled: false` for yoon-yang until then.
- **Canonical probe tool retained.** `scripts/probe-js-render.ts` is not deleted — it remains a reusable verification tool when Phase 5+ considers new js-render firms.

See [04-07-PROBE-RESULTS.md](./04-07-PROBE-RESULTS.md) for the canonical detailed output.

## Self-Check: PASSED

- `scripts/probe-js-render.ts` — FOUND
- `.planning/phases/04-js-rendered-tier-conditional/04-07-PROBE-RESULTS.md` — FOUND
- `.planning/phases/04-js-rendered-tier-conditional/04-07-SUMMARY.md` — FOUND
- Commit `3bfb6cc` (Task 1 probe script) — FOUND in git log
- Commit `6101c8a` (Rule 2 onclick-regex extension) — FOUND in git log
- Commit `6e606ec` (Task 2 probe results) — FOUND in git log
- Acceptance: `grep -c "wait_for:" PROBE-RESULTS.md` = 4 (≥ 4 required) — PASS
- Acceptance: `grep -c "scrapeJsRender" scripts/probe-js-render.ts` = 2 (exactly 2 required) — PASS
- Acceptance: `pnpm typecheck` — PASS (clean after both probe commits)

---
*Phase: 04-js-rendered-tier-conditional*
*Completed: 2026-04-19*
