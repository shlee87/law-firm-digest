# Phase 4: JS-Rendered Tier (conditional) - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Activate the Playwright-based `js-render` tier so that the firms whose newsletter list pages are JavaScript-rendered (RSS 없음 + 서버 렌더 HTML도 비어 있음) can finally contribute items to the daily digest. Completes the JS-render branch of `FETCH-01` that Phase 2 left as `throw "Phase 4 territory"`.

**In scope:**
- Add `'js-render'` to the zod `type` enum in `src/config/schema.ts` (Phase 1 01-03 deliberately rejected it; Phase 2 02-01 kept that rejection).
- New `src/scrapers/jsRender.ts` returning the existing `RawItem[]` contract — shared with `rss.ts` and `html.ts`.
- Replace `case 'js-render': throw` in `src/pipeline/fetch.ts` with a real dispatch that takes a shared `Browser` handle.
- Extend `enrichBody` so that for `js-render` firms it can fall back to Playwright if the static body extractor returns too little text.
- Extend `runPipeline()` (Phase 3 D-09) to own the `Browser` launch/close lifecycle so `check:firm <id>` inherits the same behavior.
- GHA workflow adds `playwright install chromium --only-shell` step + `actions/cache@v4` keyed on Playwright version, keeping total run under 3 min.
- Activate 4 firms via `config/firms.yaml` with `type: js-render`, per-firm `wait_for` selector, and `enabled: true`.

**Out of scope (explicitly):**
- Full chromium (non-shell) install — we stay on `--only-shell` per PROJECT.md stack lock.
- Rich wait-contract YAML shape (object with `timeout_ms` / `network_idle`) — stays a future extension if a specific firm proves it needs it.
- Adding Kirkland or any firm beyond the four listed below — US slot is already covered by Cooley + Skadden.
- Per-firm browser binaries or multi-browser support — chromium only, v1.
- Gemini quota work (`QUOTA-01`) triggered by the extra body fetches — Phase 5 territory.
- Observability changes beyond adding new `errorClass` values — Phase 3 staleness banner is the backstop as-is.

</domain>

<decisions>
## Implementation Decisions

### Firm roster (final for Phase 4)

- **D-01:** Four firms are activated with `type: js-render`:
  - `lee-ko` (광장) — KR — list page `<ul id="contentsList">` is JS-populated; already exists as `enabled: false` placeholder in `config/firms.yaml:166`.
  - `yoon-yang` (화우) — KR — `/kor/insights/newsletters` skeleton is JS-populated; `/eng/` robots-blocked so we must use KR path; already exists as `enabled: false` placeholder.
  - `latham` (Latham & Watkins) — US — already exists as `enabled: false` placeholder; Phase 4 research must re-verify JS-render triggers and locate the list-page wait selector.
  - `barun` (바른) — KR — **newly added** as a 5th placeholder-then-activated firm. Phase 2 audit flagged it JS-render (02-RESEARCH.md:149) but it was never added to `firms.yaml`. Phase 4 adds the YAML block AND enables it in the same milestone.
- **D-02:** Kirkland (previously flagged JS-render in Phase 2 research) is **not** added. US coverage is considered complete via `cooley` (RSS) + `skadden` (HTML). Re-opening US slot is a Phase 5 triggered item.
- **D-03:** The exact per-firm `wait_for` selector is NOT locked here — the phase research step must verify (live fetch + browser DevTools) that the named selector actually appears on each firm's rendered page. `lee-ko`'s `"ul#contentsList > li"` is a hint from Phase 2 audit, not a locked contract.

### Detail-page strategy (enrichBody for js-render firms)

- **D-04:** Static-first with Playwright fallback. `src/pipeline/enrichBody.ts` keeps its existing generic `fetch` + `cheerio` chain as the first attempt for js-render firms' detail pages. If the extracted body is shorter than a threshold (recommended: 200 chars after whitespace-normalization), re-fetch the same URL through Playwright in the firm's existing `BrowserContext` and re-run the generic extractor on the hydrated HTML.
- **D-05:** Browser lifecycle — one `chromium.launch()` per run, shared across all js-render firms. Per-firm `browser.newContext()` so cookies/storage don't bleed across firms. All pages (list + any detail fallback) for a given firm reuse that firm's `BrowserContext`. Context closed after the firm's scrape+enrich finishes; browser closed at end of `runPipeline()`.
- **D-06:** No body-cache persistence. A re-run of the same day's items would re-fetch — consistent with D-P2-12.

### Failure mode (aggressive detection)

- **D-07:** Per-firm failures follow the existing Phase 2 `Promise.allSettled` pattern — a single firm's throw isolates to that firm's `FirmResult.error`, footer lists it in the sent email.
- **D-08:** **Exit-1-after-email rule:** at the end of `runPipeline()`, if ANY js-render firm ended with `FirmResult.error` populated, the process `exit(1)` **after** `mailer.sendMail` has resolved and **after** `writeState` has committed. Ordering matters: email + state must still land so rss/html firms deliver their value that day.
- **D-09:** The `exit(1)` triggers the Phase 1 `if: failure()` GHA step which auto-opens a bilingual (EN/KR) GitHub Issue with a remediation table. New `errorClass` values must be represented in that remediation table so the issue body is useful.
- **D-10:** New `errorClass` taxonomy entries (extend Phase 2 `classifyError`):
  - `browser-launch-fail` — `chromium.launch()` or `playwright install` surfaces threw. Usually infra: cache miss / apt dep / disk space.
  - `playwright-timeout` — `waitForSelector(wait_for)` exceeded 15s. Usually firm content: selector drift / network slowness / site down.
  - `selector-miss` — page loaded, wait selector matched, but the downstream `list_item` selectors extracted zero items. Usually content: `list_item` drift.
- **D-11:** No js-render-specific top-of-email banner. Phase 3's 30-day staleness detector (`OPS-04`) is the backstop for a firm that goes silent, regardless of cause.

### Wait-contract (YAML schema extension)

- **D-12:** New required YAML field for `type: js-render` firms: `wait_for: "<css-selector>"`. Zod enforces: when `type === 'js-render'`, `wait_for` must be a non-empty string. `rss` and `html` firms must NOT have `wait_for` (strict schema).
- **D-13:** Playwright timeout for `waitForSelector` is **15000 ms**, hardcoded in `scrapers/jsRender.ts`. Not exposed via YAML in v1. If a future firm proves 15s is too short, promote to a richer wait-contract shape (`{ selector, timeout_ms }`).
- **D-14:** `wait_for` is used only for the list page. Detail-page fallback Playwright calls use `waitForLoadState('domcontentloaded')` with the same 15s timeout — no per-firm detail selector in v1.

### Claude's Discretion

- Exact threshold for "body too short, fall back to Playwright" (recommended: 200 chars post-normalization).
- `BrowserContext` user-agent string (recommended: reuse the existing `LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)` via `browser.newContext({ userAgent })`).
- `scrapers/jsRender.ts` internal shape — whether it accepts `browser` as a parameter or constructs its own. Recommended: injected, so tests can pass a mock and `runPipeline()` controls lifetime.
- How `runPipeline` handles the case where zero js-render firms are enabled (recommended: skip browser launch entirely; saves 1.5s when all 4 are temporarily `enabled: false`).
- Retry policy for `browser-launch-fail` specifically (recommended: one retry only, then give up and classify; this keeps the 3-min budget intact).
- `pnpm check:firm <js-render-id>` output when the fallback Playwright path triggers (recommended: print a "⚠ static fallback → Playwright" line so the developer sees why the run took longer).

### Folded Todos

None — `gsd-sdk query todo.match-phase 4` returned no pending todos matching Phase 4 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + Roadmap
- `.planning/ROADMAP.md` §"Phase 4: JS-Rendered Tier (conditional)" — goal, success criteria, entry gate, 3-min runtime budget.
- `.planning/REQUIREMENTS.md` §"Fetch (FETCH)" L12 — FETCH-01 tier-strategy contract; Phase 4 completes the JS-rendered branch.
- `.planning/PROJECT.md` — stack lock (Playwright 1.58.x `--only-shell`, `actions/cache@v4`), $0 budget, Gemini 250 RPD Flash quota.

### Prior phase decisions (carry-forward)
- `.planning/phases/01-foundation-vertical-slice/01-CONTEXT.md` — Phase 1 decisions: canonicalizeUrl, DRY_RUN containment, run-transaction ordering, User-Agent string, `if: failure()` GHA step with remediation table.
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — especially D-P2-03 (`Promise.allSettled`), D-P2-04 (email footer format + `errorClass` taxonomy — extended here), D-P2-09 (tier dispatch — `js-render` case was a throw), D-P2-14 (roster Option A+B; the three `enabled: false` placeholders this phase activates).
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-RESEARCH.md` §"Audit findings" L145-152 — empirical verdicts for lee-ko, yoon-yang, barun, latham confirming JS-render necessity. Phase 4 research must re-verify these with current (2026-04-18+) fetches.
- `.planning/phases/03-observability-dev-loop/03-CONTEXT.md` — D-09 `runPipeline({firmFilter, skipEmail, skipStateWrite, skipGemini, saveHtmlPath})` refactor; this is where js-render `Browser` lifecycle attaches. D-01..D-04 30-day staleness detector serves as backstop for D-11.

### Code context
- `src/config/schema.ts:8-20` — zod `FirmSchema`; L20 `type: z.enum(['rss', 'html'])` must extend to include `'js-render'`; `wait_for` field must be added with conditional refinement.
- `src/types.ts` — `FirmType` TS mirror already includes `'js-render'` (intentional TS/zod mismatch from 01-03); removing the mismatch here is part of the schema extension.
- `src/pipeline/fetch.ts:60-80` — D-P2-09 tier-dispatch switch; `case 'js-render':` currently throws `'Phase 4 territory'` — replace with `scrapeJsRender(firm, browser)` call.
- `src/scrapers/rss.ts`, `src/scrapers/html.ts` — return shape reference for the new `jsRender.ts`.
- `src/scrapers/util.ts` — `canonicalizeUrl`, `extractOnclickHref`, `TRACKING_PARAMS` are scraper-agnostic and apply to js-render items too.
- `src/pipeline/enrichBody.ts` — D-P2-02 generic body extractor; js-render firms share it as the first attempt, with Playwright fallback added.
- `src/pipeline/run.ts` (Phase 3 D-09) — composition-root owner of `Browser` lifecycle; `main.ts` and `cli/checkFirm.ts` both depend on it.
- `src/mailer/gmail.ts` — run-transaction ordering: email MUST succeed before any `exit(1)` for the D-08 rule to work.
- `config/firms.yaml:165-200` — current `enabled: false` placeholder block for lee-ko / yoon-yang / latham; Phase 4 adds a `barun` block here and flips `enabled: true` on all four.

### External specs / infra
- `.github/workflows/daily.yml` — where `playwright install chromium --only-shell` step is added, where `actions/cache@v4` keys on Playwright version, where the `if: failure()` Issue-opener already lives (Phase 1 01-12).
- Playwright docs §Browsers `--only-shell` — chromium-only shell install keeps binary at ~100MB vs ~300MB full set.
- PROJECT.md §"Cache `~/.cache/ms-playwright` across GHA runs with `actions/cache`" — cache path + keying convention.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Tier-dispatch switch** (`src/pipeline/fetch.ts:67-76`) — `case 'js-render': throw ...` is the exact hook point. Replace throw with `scrapeJsRender(firm, browser)`.
- **`RawItem[]` contract** (shared by `rss.ts` and `html.ts`) — `jsRender.ts` returns the same shape; everything downstream (canonicalizeUrl, dedup, enrichBody, filter, summarize, compose) is tier-agnostic and requires zero change for js-render items.
- **`BrowserContext`-aware User-Agent** — `browser.newContext({ userAgent: 'LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)' })` reuses the same UA string already vouched for across all other tiers (Phase 1 `FETCH-04`, robots.txt compliance).
- **`Promise.allSettled` boundary** (D-P2-03) — per-firm failure isolation is free; `scrapeJsRender` just needs to throw on failure and the existing wrapping converts it to `FirmResult.error`.
- **`classifyError` taxonomy** (Phase 2 `util.ts`) — extend with the three new classes (D-10); downstream email footer and step summary row code renders them with zero structural change.
- **`runPipeline()`** (Phase 3 D-09, `src/pipeline/run.ts`) — composition root to attach `Browser` lifecycle to. `main.ts` and `cli/checkFirm.ts` both call this function; js-render support added here propagates to both consumers automatically.
- **`enrichBody` generic selector chain** (D-P2-02) — stays unchanged as the static first-attempt for js-render detail pages; add a tier-aware branch (`firm.type === 'js-render' && bodyLen < 200`) that invokes a new `enrichBodyViaPlaywright(item, ctx)` helper reusing the firm's `BrowserContext`.

### Established Patterns
- **Run-transaction ordering** (Phase 1 OPS-03): fetch → dedup → summarize → email → state. Phase 4's new `exit(1)` (D-08) must fire AFTER state-commit completes, not between email and state, so `seen.json` stays consistent with what the recipient was told.
- **DRY_RUN containment** (Phase 1 Pattern 2): `check:firm` (Phase 3 D-09) already passes `skipEmail: true, skipStateWrite: true, skipGemini: true` to `runPipeline`. Playwright launch itself is NOT side-effectful in that sense, but the CLI entrypoint should additionally surface "would-summarize" output specifically flagged when a firm needed Playwright fallback (D-15 Claude's Discretion).
- **KST timezone canonicalization** (Phase 1) — js-render firms' list-page rendered dates are parsed by the same `parseDate` helper; no new timezone logic.
- **Fail-loud philosophy** (Phase 1 `FETCH-06`, Phase 2 SMTP 535) — D-08/D-09 extend this to Playwright: any js-render firm failure = red workflow after-the-fact, Issue opens automatically.
- **Atomic state write** (Phase 1 01-10) — `exit(1)` happens after `writeState`; if the process dies between email and state, state is stale and next run re-emails. That's existing Phase 1 behavior; Phase 4 does not change it.

### Integration Points
- **`src/scrapers/jsRender.ts` (NEW)** — `scrapeJsRender(firm: FirmConfig, browser: Browser) → Promise<RawItem[]>`. Opens a fresh `BrowserContext`, navigates to `firm.url`, awaits `firm.wait_for` selector (15s timeout), reads `page.content()`, feeds to the same cheerio-based list-item extraction helper used by `scrapers/html.ts`, closes context.
- **`src/scrapers/util.ts`** — extract a shared `parseListItemsFromHtml(html, selectors) → RawItem[]` so `html.ts` and `jsRender.ts` share the HTML → RawItem logic. Avoids drift between tiers.
- **`src/pipeline/fetch.ts:74-77`** — swap `case 'js-render': throw` for `case 'js-render': raw = await scrapeJsRender(firm, browser); break;`. `browser` threaded in from `runPipeline`.
- **`src/pipeline/enrichBody.ts`** — thread a `browser` (or `BrowserContext` per firm) through the enrich stage. Add tier-aware Playwright fallback when `firm.type === 'js-render'` and static body < 200 chars.
- **`src/pipeline/run.ts`** — wrap the existing pipeline in a `try { browser = await chromium.launch() } finally { await browser?.close() }`. Skip launch when zero js-render firms are enabled (micro-optimization, see Claude's Discretion).
- **`src/cli/checkFirm.ts` (Phase 3)** — no interface change; when `<id>` resolves to a js-render firm, the shared `runPipeline` handles browser lifecycle transparently; CLI output prints "⚠ static fallback → Playwright" line when the enrichBody fallback fires.
- **`config/firms.yaml`** — flip `enabled: true` on lee-ko, yoon-yang, latham blocks; add a brand-new barun block with `type: js-render`, `wait_for`, selectors, `timezone: Asia/Seoul`, `enabled: true`. Update top-of-file Phase 4 comment block documenting the `wait_for` field.
- **`src/config/schema.ts`** — extend `type` enum, add conditional `wait_for` field with a zod `.superRefine` to require it when `type === 'js-render'`.
- **`.github/workflows/daily.yml`** — add `- name: Install Playwright chromium` step with `actions/cache@v4` keyed on `${{ hashFiles('pnpm-lock.yaml') }}-playwright-${{ env.PLAYWRIGHT_VERSION }}` (or similar version-aware key). Step runs before `pnpm start`.

</code_context>

<specifics>
## Specific Ideas

- `lee-ko` seed wait_for hint from Phase 2 audit: `"ul#contentsList > li"`. Phase 4 research must verify this still matches in a live 2026-04-18+ browser session before planning locks it into `firms.yaml`.
- `yoon-yang` seed wait_for hint: `"ul.board-card-list > li"` (from audit notes "empty `<ul id=\"contentsList\" class=\"board-card-list\">`"). Same verification requirement.
- `barun` and `latham` wait_for selectors are NOT known from Phase 2 audit — Phase 4 research must produce them via live DevTools inspection.
- Email footer row when Playwright infrastructure fails should make the common case scannable at a glance — e.g., four identical rows showing `browser-launch-fail: chromium executable not found` signals "infra problem, not content problem" without reading details.
- `pnpm check:firm lee-ko` should FEEL the same as `pnpm check:firm cooley` — stage-by-stage text output, just with an extra "⚠ static fallback → Playwright" line visible when it fires on the detail page.

</specifics>

<deferred>
## Deferred Ideas

- **Kirkland (and any other JS-render US firms)** — deferred to a Phase 5 triggered item if the `skadden` + `cooley` US signal turns out insufficient in practice. No active trigger condition today.
- **Rich wait-contract YAML shape** (`wait_for: { selector, timeout_ms, network_idle }`) — promote when any of the 4 Phase 4 firms proves 15s fixed timeout is insufficient OR network-idle-based waiting is required. Current form is progressive-enhancement-ready.
- **Body cache across runs** — Phase 5 `CACHE-01` territory. Triggers when re-summarization burns duplicate Gemini quota.
- **Multi-browser support (firefox, webkit)** — v2. No v1 firm requires it; chromium shell is sufficient.
- **Per-firm detail-page `wait_for_detail` selector** — would let us skip the static-first attempt for firms whose detail pages are known JS-only. Deferred until a concrete firm proves detail pages always fail static (D-04 handles this case adaptively today).
- **Playwright step summary metrics** — "js-render firms: browser launch X ms, N page loads, M fallback triggers" — promote to Phase 5 `QUOTA-01` / observability work if runtime budget becomes a concern.

</deferred>

---

*Phase: 04-js-rendered-tier-conditional*
*Context gathered: 2026-04-18*
