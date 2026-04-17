---
phase: 01-foundation-vertical-slice
plan: 08
subsystem: compose
tags: [compose, html, email, template, snapshot, xss, b3-placeholder]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: pnpm skeleton + pinned date-fns-tz 3.2.0 (plan 01-01)
  - phase: 01-foundation-vertical-slice
    provides: FirmResult / SummarizedItem / EmailPayload types (plan 01-03)
provides:
  - "src/compose/templates.ts: renderHtml(firms, dateKst) + local escapeHtml/escapeAttr helpers; B3 null-summary placeholder '요약 없음 — 본문 부족'"
  - "src/compose/digest.ts: composeDigest(results, recipient, fromAddr, now?) pure function returning EmailPayload"
  - "test/compose/digest.test.ts: 5 it-blocks (subject format, XSS escape, B3 placeholder, snapshot, zero-item firm exclusion)"
  - "test/compose/__snapshots__/digest.test.ts.snap: 21-line locked HTML snapshot for regression guard"
affects: [01-10, 01-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function composer — composeDigest takes data + config, returns EmailPayload; no I/O, no side effects. Snapshot testing becomes trivial because same input → same output byte-for-byte"
    - "Injectable clock — composeDigest(results, recipient, fromAddr, now: Date = new Date()) lets tests pin the KST date; production path omits now and uses wall clock. One signature, deterministic tests"
    - "Escape-at-insertion-site — renderHtml calls escapeHtml/escapeAttr inline at every ${interpolation}, no 'sanitize then trust' intermediate layer. Makes XSS audit a grep for unescaped \${it.title} / \${it.summary_ko} / \${r.firm.name} — expected to return zero"
    - "Single user-facing null-summary placeholder — B3 revision standardized '요약 없음 — 본문 부족' across both Gemini failure ('failed') and SUMM-06 skip ('skipped') origins. Templates don't branch on summaryModel — only on summary_ko === null — so upstream policy can add new null-origins without template churn"
    - "Firm-filter before both count and body — firmsWithNew = results.filter(r => r.summarized.length > 0) used for subject count AND renderHtml input. Errored/empty firms never leak into digest"

key-files:
  created:
    - src/compose/templates.ts
    - src/compose/digest.ts
    - test/compose/digest.test.ts
    - test/compose/__snapshots__/digest.test.ts.snap
  modified: []

key-decisions:
  - "escapeHtml/escapeAttr kept LOCAL (not exported) — templates.ts is the only user-controlled-to-HTML boundary in the codebase; exporting would invite reuse elsewhere, which would fragment the XSS surface. Keep the escape vocabulary scoped to its single caller"
  - "B3 placeholder rendered based on summary_ko null-ness, NOT summaryModel — templates don't care whether Gemini failed or main.ts skipped. Both produce null; both render identical placeholder. Zero branching overhead, future-proof against new null-origins"
  - "Snapshot committed to the repo rather than inline via toMatchInlineSnapshot — external .snap file makes whitespace-preserving diffs readable in PR review and survives test-runner quirks that reformat inline snapshots"
  - "Date escape is defense-in-depth, not functional — formatInTimeZone returns ISO format with only digits and hyphens, no special chars. escapeHtml(dateKst) adds zero practical protection today but costs zero at runtime and survives a future 'date formatter changed' regression"
  - "'1 firms' grammar oddity preserved per CONTEXT.md D-06 — no pluralization branching, no Intl.PluralRules. Single user reads this email; grammar is not worth a branch"

requirements-completed:
  - EMAIL-01
  - EMAIL-02
  - EMAIL-04

# Metrics
duration: ~2 min
completed: 2026-04-17
---

# Phase 01 Plan 08: Email Digest Composition Summary

**Pure-function composer (composeDigest) + HTML template (renderHtml) + snapshot test — locks the email rendering surface behind two tiny files with escape-at-insertion XSS defense and a standardized Korean B3 placeholder that treats Gemini-failure and SUMM-06-skipped identically.**

## Performance

- **Duration:** ~2 min (121 seconds wall-clock from plan start to final snapshot write)
- **Started:** 2026-04-17T14:37:00Z
- **Completed:** 2026-04-17T14:39:01Z
- **Tasks:** 3
- **Files created:** 4 (src/compose/templates.ts 59 LoC, src/compose/digest.ts 38 LoC, test/compose/digest.test.ts 115 LoC, snapshot 21 lines)
- **Commits:** 3 task commits + final metadata commit

## Accomplishments

- All three EMAIL requirements (EMAIL-01/02/04) satisfied in 97 LoC of production code + 115 LoC of tests + a 21-line locked snapshot.
- `pnpm typecheck` exits 0 after every task.
- `pnpm test` exits 0; total test count rose from 24 → 29 (+5 new blocks in digest.test.ts).
- B3 null-summary placeholder `요약 없음 — 본문 부족` is the sole visible message for null-summary items regardless of origin (Gemini `failed` or main.ts `skipped`) — verified in the snapshot: both non-null-summary fixture items render the placeholder on lines 13 and 17 of `digest.test.ts.snap`.
- XSS defense verified at the snapshot level: fixture title `Second <Article> with HTML-ish Title` renders as `Second &lt;Article&gt; with HTML-ish Title` (line 12 of snapshot). `<script` substring absent from snapshot and from all template output paths.

## Files Created

### src/compose/templates.ts (59 lines)

One export: `renderHtml(firms: FirmResult[], dateKst: string): string`.

Two local helpers (not exported):
- `escapeHtml(s)` — escapes `&`, `<`, `>` to entity form. Used for element text (title, summary, firm.name, date).
- `escapeAttr(s)` — escapes `"`, `&`, `<`, `>` to entity form. Used for href.

Structure invariants (all grep-verified):
- `<!doctype html>` start
- Single `<h1 style="font-size:22px;">법률 다이제스트 ${dateKst}</h1>`
- Per-firm `<section><h2 style="font-size:18px;...">${firm.name}</h2>...</section>` block
- Per-item `<div><a href="..."><title></a></div><p>...</p></div>` block
- **B3 null-summary branch:** `summary_ko ? <p color:#333>${summary_ko}</p> : <p color:#999 font-style:italic>요약 없음 — 본문 부족</p>`
- `<footer>AI 요약 — 원문 확인 필수</footer>` trailer

No `<img>`, no `<script>`, no external fonts, no link-tracking JS, no data-* attrs.

### src/compose/digest.ts (38 lines)

One export: `composeDigest(results: FirmResult[], recipient: string, fromAddr: string, now: Date = new Date()): EmailPayload`.

Implementation flow:
1. `firmsWithNew = results.filter(r => r.summarized.length > 0)` — zero-item firms excluded everywhere.
2. `dateKst = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd')` via `date-fns-tz`.
3. `itemCount = firmsWithNew.reduce((n, r) => n + r.summarized.length, 0)`.
4. `subject = \`[법률 다이제스트] ${dateKst} (${firmsWithNew.length} firms, ${itemCount} items)\`` — exact D-06 literal.
5. `html = renderHtml(firmsWithNew, dateKst)`.
6. Return `{ subject, html, to: recipient, from: fromAddr }`.

No plaintext alternative (D-08 deferred). `EmailPayload` in types.ts has no `text` field — confirmed.

### test/compose/digest.test.ts (115 lines)

Five it-blocks:
1. **Subject per D-06 format** — asserts `payload.subject === '[법률 다이제스트] 2026-04-17 (1 firms, 3 items)'` with KST-aligned fixed date 2026-04-17T09:00:00.000Z (= 18:00 KST).
2. **HTML escape + content** — asserts `&lt;Article&gt;` present (XSS escape), Korean summary substring present, href attribute intact, `<h1`/`<h2` structure present, `<script` absent.
3. **B3 null-summary placeholder** — asserts `요약 없음 — 본문 부족` appears exactly 2x (once for the `failed` fixture item, once for the `skipped` fixture item), and the old `(요약 실패 — 원문 확인)` variant does NOT appear anywhere.
4. **Snapshot stability** — `toMatchSnapshot()` against the Cooley fixture.
5. **Zero-item firm exclusion** — prepends a zero-summarized Cooley FirmResult to the fixture, asserts subject still says `(1 firms,` not `(2 firms,`.

### test/compose/__snapshots__/digest.test.ts.snap (21 lines)

Locked HTML for the 3-item Cooley fixture. Will fail-loud on any accidental template drift.

## Task Commits

| Task | Hash | Message |
|------|------|---------|
| 1: templates.ts (renderHtml + escape + B3 placeholder) | `d0a55b8` | feat(01-08): add HTML email template renderer with XSS defense + B3 placeholder |
| 2: digest.ts (composeDigest + D-06 subject) | `7011b15` | feat(01-08): add composeDigest with D-06 subject format (EMAIL-01/02/04) |
| 3: digest.test.ts + snapshot | `a9e408f` | test(01-08): snapshot test for composeDigest + B3 null-summary assertions |

## Decisions Made

Documented inline in frontmatter `key-decisions`. Highlights:

1. **escapeHtml/escapeAttr kept local** in templates.ts — templates is the ONLY user-controlled-to-HTML boundary in Phase 1, so exporting would invite fragmentation of the XSS surface. Single file owns the escape vocabulary.
2. **B3 branches on `summary_ko === null`, NOT on `summaryModel`** — Gemini-failed and main-skipped both null the summary; templates treat them identically. New null-origins in future phases won't require template changes.
3. **External .snap file** over `toMatchInlineSnapshot` — keeps PR diffs readable, survives inline-snapshot formatter quirks.
4. **Date escape is defense-in-depth** — `formatInTimeZone` returns `YYYY-MM-DD` (digits + hyphens only) today, but `escapeHtml(dateKst)` costs zero and survives future formatter changes.
5. **'1 firms' grammar oddity preserved per D-06** — no pluralization branching; single-user recipient makes grammar not worth a branch.

## Deviations from Plan

**None.** All three code blocks came straight from the plan's `<interfaces>` section. No Rule 1–3 deviations fired:
- No bugs discovered in copied blocks.
- No missing critical functionality (XSS escape is fully in scope and was already in the plan).
- No blocking issues (date-fns-tz 3.2.0 already pinned from plan 01-01; `formatInTimeZone` works without extra setup).

Zero auto-fixes applied.

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `pnpm typecheck` clean | PASS |
| `pnpm test` green (snapshot + assertions) | PASS — 29 total tests pass (24 prior + 5 new) |
| `<script` grep on HTML snapshot returns 0 | PASS — `grep -c '<script' test/compose/__snapshots__/digest.test.ts.snap` = 0 |
| Subject matches D-06 exactly for fixture input | PASS — `[법률 다이제스트] 2026-04-17 (1 firms, 3 items)` asserted with `toBe()` |
| B3 placeholder `요약 없음 — 본문 부족` in templates.ts AND in fixture assertion | PASS — appears 1x in templates.ts source, 2x in snapshot (one per null-summary fixture item) |

## Sample Render (Visual QA Reference)

From the committed snapshot (test/compose/__snapshots__/digest.test.ts.snap):

```html
<!doctype html><html><body style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:16px;">
    <h1 style="font-size:22px;">법률 다이제스트 2026-04-17</h1>
    <section><h2 style="font-size:18px;margin:24px 0 8px 0;">Cooley</h2>
      <div style="margin:0 0 16px 0;">
        <div><a href="https://cooley.com/news/insight/2026/2026-04-15-ai-reg">AI Regulation Update April 2026</a></div>
        <p style="margin:4px 0 0 0;color:#333;">4월 AI 규제 동향을 정리한 요약입니다. 핵심 3가지 변경사항을 다룹니다.</p>
      </div>
      <div style="margin:0 0 16px 0;">
        <div><a href="https://cooley.com/news/insight/2026/2026-04-10-ma">Second &lt;Article&gt; with HTML-ish Title</a></div>
        <p style="margin:4px 0 0 0;color:#999;font-style:italic;">요약 없음 — 본문 부족</p>
      </div>
      <div style="margin:0 0 16px 0;">
        <div><a href="https://cooley.com/news/insight/2026/2026-04-05-privacy">Title-only Article (B3 skipped)</a></div>
        <p style="margin:4px 0 0 0;color:#999;font-style:italic;">요약 없음 — 본문 부족</p>
      </div></section>
    <footer style="margin-top:32px;color:#888;font-size:12px;">AI 요약 — 원문 확인 필수</footer>
  </body></html>
```

Three items visible:
- Item 1 (Gemini-summarized): Korean summary in `color:#333`.
- Item 2 (Gemini failed, `summaryModel: 'failed'`): italic grey B3 placeholder. Title escaped to `&lt;Article&gt;`.
- Item 3 (main.ts skipped, `summaryModel: 'skipped'`): italic grey B3 placeholder — IDENTICAL to item 2's placeholder, as B3 revision requires.

## B3 Placeholder Verification

Per plan `<output>` requirement: "confirm the B3 placeholder text appears exactly once in templates.ts and matches the fixture test's expectation."

```bash
# B3 placeholder string count in templates.ts source
grep -c "요약 없음 — 본문 부족" src/compose/templates.ts
# → 1

# B3 placeholder string count in test file source (fixture assertion)
grep -c "요약 없음 — 본문 부족" test/compose/digest.test.ts
# → 1 (inside the regex /요약 없음 — 본문 부족/g)

# B3 placeholder string count in rendered snapshot
grep -c "요약 없음 — 본문 부족" test/compose/__snapshots__/digest.test.ts.snap
# → 2 (one per null-summary fixture item — 'failed' and 'skipped')
```

Match confirmed: templates.ts renders the placeholder 1x in source; test regex asserts 2x in rendered output; fixture produces exactly 2 null-summary items.

## Threat Model Mitigations Applied

All four mitigations from plan's `<threat_model>` are present in code:

| Threat ID | Mitigation | Verified By |
|-----------|------------|-------------|
| T-08-01 (scraped title → HTML XSS) | `escapeHtml(it.title)` at every title interpolation | Snapshot line 12: `&lt;Article&gt;` |
| T-08-02 (Gemini summary → HTML XSS) | `escapeHtml(it.summary_ko)` when non-null | templates.ts renders `escapeHtml(it.summary_ko)` only |
| T-08-03 (url → href attribute injection) | `escapeAttr(it.url)` at href | templates.ts line 31 |
| T-08-06 (null-summary ambiguity) | Standardized `요약 없음 — 본문 부족` for all null-summary items | Test it-block #3 asserts 2x placeholder match |

T-08-04 (info disclosure) and T-08-05 (subject XSS) are `accept` dispositions in the threat model — no mitigation code required.

## Known Stubs

**None.** No empty-data UI flows, no placeholder components that receive mock data. The B3 `요약 없음 — 본문 부족` string is a first-class documented UI state (the explicit user-facing message for null-summary items), not a stub — it is the canonical rendering for that data condition.

## Next Phase Readiness

Ready for Wave 3 downstream consumers:

- **plan 01-10 (mailer):** can `import { composeDigest } from '../compose/digest.js'` to produce the EmailPayload it passes to nodemailer. Signature is stable: `composeDigest(results, recipient, fromAddr, now?)` → `EmailPayload { subject, html, to, from }`.
- **plan 01-11 (main.ts orchestrator):** will call `composeDigest(firmResults, recipient, fromAddr)` after `summarizeAll` and `dedupAll`. No `now` arg needed in production. The early-exit path (when `firmsWithNew.length === 0` OR `itemCount === 0`) can be implemented in main.ts by checking `payload.subject` contains `(0 firms, 0 items)` OR inspecting `firmsWithNew` directly — cleaner to pre-check `results.every(r => r.summarized.length === 0)` in main.ts and skip send entirely.
- **Regression guard:** any accidental HTML template drift (whitespace, inline style change, new wrapper element, escape-helper bug) will fail the snapshot on the next `pnpm test` run — fast feedback in CI.

## Self-Check: PASSED

- `src/compose/templates.ts` exists on disk.
- `src/compose/digest.ts` exists on disk.
- `test/compose/digest.test.ts` exists on disk.
- `test/compose/__snapshots__/digest.test.ts.snap` exists on disk.
- Task 1 commit `d0a55b8` present in `git log --oneline -5`.
- Task 2 commit `7011b15` present in `git log --oneline -5`.
- Task 3 commit `a9e408f` present in `git log --oneline -5`.
- `pnpm typecheck` exits 0.
- `pnpm test` exits 0 (29 tests pass).
- All acceptance-criterion greps from Tasks 1–3 pass.
- B3 placeholder appears 1x in templates.ts source, 2x in rendered snapshot (per fixture's 2 null-summary items).

---
*Phase: 01-foundation-vertical-slice*
*Plan: 08*
*Completed: 2026-04-17*
