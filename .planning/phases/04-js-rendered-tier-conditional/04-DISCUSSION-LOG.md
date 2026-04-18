# Phase 4: JS-Rendered Tier (conditional) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 04-js-rendered-tier-conditional
**Areas discussed:** Firm roster, Detail-page strategy, Failure mode, Wait-contract shape

---

## Firm roster

### Q1: Add Barun (바른) to Phase 4 scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add placeholder + enable | Adds `barun` as a 4th js-render firm; Phase 4 adds the firms.yaml block AND flips enabled:true after smoke test. KR coverage 4 → 5 live. | ✓ |
| No — skip Barun | Keeps Phase 4 scope to the 3 existing placeholders (lee-ko, yoon-yang, latham). Promote via Phase 5 if Barun content matters later. | |

**User's choice:** Yes — add placeholder + enable
**Notes:** Phase 2 research (02-RESEARCH.md:149) flagged barun as JS-rendered but it was never placeholdered. User opted to include it now.

### Q2: Add Kirkland to Phase 4 scope?

| Option | Description | Selected |
|--------|-------------|----------|
| No — Skadden already covers US slot | US coverage satisfied by Cooley + Skadden. Adding Kirkland is duplicate US signal for a $0 project. (Recommended.) | ✓ |
| Yes — add Kirkland too | Adds kirkland firms.yaml entry + enables alongside latham. js-render tier becomes 5 firms (with barun), US js-render firm count becomes 2. | |

**User's choice:** No — Skadden already covers US slot
**Notes:** Matches Phase 2 Option A+B rationale (D-P2-14) — backup pool already filled US slot via Skadden.

---

## Detail-page strategy

### Q1: How should the detail-page (second GET) fetch work for js-render firms?

| Option | Description | Selected |
|--------|-------------|----------|
| Static-first, Playwright fallback | Try enrichBody static fetch first. If body too short, re-fetch via Playwright in same browser context. Fastest when detail pages are server-rendered (common); self-heals otherwise. (Recommended.) | ✓ |
| Always Playwright for js-render firms | Every detail fetch uses Playwright. Simpler code path, adds ~12-15s daily runtime. | |
| Always static, fail loudly if empty | Never use Playwright for details. Accepts degraded summaries if a firm's detail pages turn out JS-only. | |

**User's choice:** Static-first, Playwright fallback
**Notes:** Threshold for "body too short" set as Claude's discretion — recommended 200 chars post-normalization (see CONTEXT.md `<decisions>` Claude's Discretion).

### Q2: If detail fetch falls back to Playwright, reuse the same browser context used for the list page?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse context — one browser per firm | Single BrowserContext per js-render firm, used for list page + any detail fallbacks. Browser launch cost amortized. (Recommended.) | ✓ |
| Fresh context per page | New context for every page. Stricter isolation, pays launch cost per navigation. | |

**User's choice:** Reuse context — one browser per firm
**Notes:** User asked "어떤게 좋을까?" (which is better?); Claude explained the launch-cost tradeoff and recommended context reuse; user accepted. Rationale: public newsletter pages don't set meaningful per-page state, so isolation gain from fresh contexts is zero while launch cost is ~1.5s per context.

---

## Failure mode

### Q1: When Playwright fails (browser-launch, cache miss, apt dep), how should the run behave?

| Option | Description | Selected |
|--------|-------------|----------|
| Degrade gracefully — ship digest, footer js-render failures | Per-firm error capture, rss/html firms still deliver. Matches Phase 2 Promise.allSettled pattern. (Initially recommended.) | |
| Fail loud — whole run red | Abort before email send; operator Issue fires but loses rss/html content. | |
| Hybrid — ship digest AND fail the step | Send the 9-firm digest, then fail the step after email. Email + Issue signals. Chosen instead of degrade-gracefully. | ✓ |

**User's choice:** Hybrid — ship digest AND fail the step
**Notes:** User pushed back on initial "degrade gracefully" recommendation with "Q1은 빠른대응을 위해서 둘다 하는게 낫지 않아?" Claude revised recommendation, user agreed. Key consideration: user prioritizes fast detection (email + Issue both fire) over noise reduction.

### Q1 refinement: When does the hybrid exit(1) trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Only when ALL 4 js firms fail with infra error (browser-launch-fail/playwright-init-fail) | Strictest — avoids false alarms for selector-miss on one firm. (Initially recommended.) | |
| If 1+ js firms fail | Loosest — any js-render firm failure fires Issue. More noise but fastest detection. | ✓ |
| If 2+ js firms fail | Middle ground. | |

**User's choice:** If 1+ js firms fail
**Notes:** User selected the most aggressive signal policy. Accepted that selector-miss on a single firm will also fire an Issue — consistent with user's overall preference for fast detection over noise reduction.

### Q2: Persistent js-render firm failure signal — should it surface anywhere beyond the email footer?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Phase 3 staleness banner (30-day) | Existing D-01 30-day detector catches firms with zero new items regardless of cause. Zero new code. (Recommended.) | ✓ |
| Add js-tier-specific daily marker | When all 4 js firms fail same day, extra top banner. Adds template branch. | |

**User's choice:** Reuse Phase 3 staleness banner (30-day)
**Notes:** User asked for clarification ("뭐가 더 나아?"), Claude explained the "signal splitting" cost of adding a new banner vs. reusing the 30-day staleness detector; user accepted the reuse option.

---

## Wait-contract shape

### Q: Wait-contract YAML schema — which form?

| Option | Description | Selected |
|--------|-------------|----------|
| Simple — wait_for: "<selector>" string | Per-firm YAML gets a single `wait_for` string. Timeout fixed in code (15s). Non-dev-edit friendly. (Recommended.) | ✓ |
| Rich — {selector, timeout_ms?, network_idle?} object | Per-firm tuning for slow SPAs. Extra YAML knobs add cognitive load even when not needed. | |
| Middle — wait_for string, timeout logged per-firm | YAML stays simple but runtime logs per-firm selector-wait duration for future tuning basis. | |

**User's choice:** Simple — wait_for: "<selector>" string
**Notes:** User asked for clarification on what "simple form" meant; Claude explained the full Playwright page lifecycle (empty skeleton → XHR → populated DOM) and why `waitForSelector` is the right primitive. User then accepted the simple form. Rich form remains a progressive-enhancement option if a concrete firm proves 15s timeout is insufficient.

---

## Claude's Discretion

- Exact "body too short" threshold for Playwright fallback trigger (recommended: 200 chars post-normalization).
- BrowserContext user-agent string reuse (recommended: existing `LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)`).
- `scrapers/jsRender.ts` internal shape — whether browser injected vs. constructed.
- Browser launch skip when all js-render firms disabled.
- Retry policy for `browser-launch-fail` (recommended: one retry max).
- `pnpm check:firm` output formatting for static → Playwright fallback triggers.

## Deferred Ideas

- Kirkland or additional US JS-render firms (promote via Phase 5 if skadden + cooley US coverage turns out insufficient).
- Rich wait-contract YAML shape (`{selector, timeout_ms, network_idle}`) — progressive enhancement when a firm proves 15s is insufficient.
- Body cache across runs (Phase 5 CACHE-01 triggered item).
- Multi-browser support (firefox, webkit) — v2.
- Per-firm `wait_for_detail` selector for known-JS detail pages.
- Playwright-specific step summary metrics (launch time, fallback count).

## Language preference observed

User conducted this discussion in a mix of Korean and English. Technical terms (YAML fields, function names, code paths) in English; reasoning, pushback, and clarifications in Korean. User repeatedly requested plain-language Korean re-explanations when jargon stacked up (e.g., "한국말로 방금한거 다시설명해줘", "이건 뭐야?"). Future discuss-phase sessions should default to mixed-language presentation with concrete scenarios upfront.
