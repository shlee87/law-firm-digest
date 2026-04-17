---
phase: 01-foundation-vertical-slice
plan: 04
subsystem: scrapers
tags: [canonicalize, dedup, pure-function, tdd, timezone, date-fns-tz]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: src/types.ts + date-fns-tz dep pinned (plan 01-03 + 01-01)
provides:
  - "src/scrapers/util.ts: canonicalizeUrl(input, base?) + parseDate(raw, tz) + TRACKING_PARAMS const"
  - "test/scrapers/util.test.ts: 18-assertion vitest suite locking DEDUP-02 vectors + DST boundary parseDate vectors"
affects: [01-05, 01-06, 01-09, 01-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical-form-as-state-key — every URL that enters SeenState flows through canonicalizeUrl first, so dedup compares canonical-to-canonical and can never silently split the table"
    - "Scheme preservation by design — http:// and https:// variants remain distinct post-canonicalization; divergence from RESEARCH.md L547-552 expected-output vector 3 documented in-function and in test comment"
    - "Readonly exported TRACKING_PARAMS — list is the single source of truth; plan 05+ imports rather than redeclares"
    - "Stable param sorting via clear-then-re-append — u.search = '' then append in alphabetical order so serialization is deterministic regardless of input order"
    - "TDD RED→GREEN lockstep — test/scrapers/util.test.ts authored first with import that fails at module-not-found; implementation added second; commit graph preserves both states for audit"
    - "date-fns-tz single wrap-site for timezone math — parseDate is the only caller of fromZonedTime in the codebase, so any future date-fns-tz semantics change has one repair point"

key-files:
  created:
    - src/scrapers/util.ts
    - test/scrapers/util.test.ts
  modified: []
  removed: []

key-decisions:
  - "Scheme is preserved, not collapsed — canonicalizeUrl lowercases the scheme but does not force-upgrade http→https. RESEARCH.md L547-552 vector 3 shows an http input collapsing to an https output; the plan flagged this as a documented divergence and the implementation follows the plan's explicit contract. If product later wants http→https collapse, it becomes a v1.x follow-up schema change to canonicalizeUrl AND a one-time retro-canonicalize pass over SeenState."
  - "TRACKING_PARAMS exported as readonly array (not a closed-over local const) so downstream modules and tests can reference the authoritative list. Keeping it as an exported binding avoids the anti-pattern of re-declaring the same list in plan 05 rss.ts or in documentation."
  - "parseDate returns date-fns-tz's toISOString() output verbatim — always ends in .000Z and always has millisecond precision. Test 'returns ISO-8601 Z-suffixed string' locks this regex-level contract so no caller accidentally relies on a shorter form."
  - "18 total test assertions (13 canonicalizeUrl + 5 parseDate) — exceeds the plan's 'at least 10 + 4' floor. Added one extra collapse-check assertion that asserts all three https vectors normalize to the same output via Set-of-1 check, and one extra separation test for session-identifying params (sessionid/token/sid) so T-04-02 has its own locked vector."

requirements-completed:
  - DEDUP-02

# Metrics
duration: ~3 min
completed: 2026-04-17
---

# Phase 01 Plan 04: canonical URL normalization + date parser Summary

**DEDUP-02's hot-path pure function (canonicalizeUrl) and Pitfall 3/6's timezone guard (parseDate) shipped together under TDD, 18 assertions green, scheme preservation made explicit contract.**

## Performance

- **Duration:** ~3 min (152 seconds wall-clock from plan start to SUMMARY completion)
- **Started:** 2026-04-17T14:17:50Z
- **Completed:** 2026-04-17T14:20:22Z
- **Tasks:** 2 (RED + GREEN)
- **Files created:** 2 (`src/scrapers/util.ts` + `test/scrapers/util.test.ts`)
- **Commits:** 2 task commits

## Accomplishments

- `src/scrapers/util.ts` (134 LoC with generous JSDoc) lands as the single canonicalization authority for the entire pipeline. DEDUP-02's four test vectors now collapse exactly as intended: the three https variants normalize to one string, and the http variant preserves its scheme by design.
- `test/scrapers/util.test.ts` (134 LoC, 18 assertions) locks the contract: 13 canonicalizeUrl vectors (including the full 12-marketing-tracker strip, separate session-param strip, relative-URL resolution, and the Set-of-1 DEDUP-02 collapse check) + 5 parseDate vectors (KST no-DST, PDT DST, PST non-DST, UTC passthrough, ISO-8601 regex shape).
- **RED/GREEN gate sequence present in git log:** `test(01-04)` at `accf217` preceding `feat(01-04)` at `bbcf289` — TDD ordering holds.
- `pnpm test` shows `18 passed (18)` in 483ms after Task 2 (GREEN state confirmed).
- `pnpm typecheck` exits 0 cleanly.
- `TRACKING_PARAMS` length verified at exactly 15 (12 marketing + 3 session).
- Smoke-verified the three https DEDUP-02 vectors all canonicalize to `https://cooley.com/news/insight/2026/2026-04-15-ai-reg` and the http vector canonicalizes to `http://cooley.com/news/insight/2026/2026-04-15-ai-reg` (scheme preserved — documented contract).

## Files Created

### src/scrapers/util.ts (134 lines)

Two exports + one data const:

| Export | Shape | Purpose |
|--------|-------|---------|
| `TRACKING_PARAMS` | `readonly string[]` of 15 entries | Single source of truth for stripped query keys; downstream plans reference rather than redeclare |
| `canonicalizeUrl(input: string, base?: string): string` | pure function | DEDUP-02 canonical form: lowercase scheme, lowercase host, strip `www.`, drop fragment, delete tracking params, alphabetize remaining params, strip non-root trailing slash |
| `parseDate(raw: string, tz: string): string` | pure function | Wraps `fromZonedTime` to produce a UTC ISO-8601 string with millisecond precision (`.000Z`) |

Design notes embedded in file comments:

- **Canonicalization step order matters** — protocol/host lowercase before fragment clear before tracking-param delete before param sort before trailing-slash strip. Reordering would change output for edge cases (e.g. a tracking param named after the fragment).
- **Root preservation** — `pathname === '/'` is explicitly guarded with a length check so `cooley.com/` stays `https://cooley.com/`, not the ambiguous `https://cooley.com`.
- **Scheme preservation** — function lowercases protocol but does not force-upgrade `http→https`. This is called out in the function JSDoc AND in a test-file comment so any future code reader sees the divergence from RESEARCH.md vector 3 is deliberate, not a bug.
- **IANA timezone errors surface at parse time** — `fromZonedTime` throws `RangeError` on unknown zone; zod `FirmSchema` (plan 03) constrains timezones at config load, so reaching `parseDate` with an invalid zone implies a schema regression (T-04-04 mitigation).

### test/scrapers/util.test.ts (134 lines)

Two `describe` blocks, 18 total `it` assertions:

**canonicalizeUrl (13 assertions):**
1. Strips `www.` subdomain
2. Strips `utm_source` (DEDUP-02 vector 1)
3. No-op on already-canonical form (DEDUP-02 vector 2)
4. Strips trailing slash from non-root path with scheme preserved (DEDUP-02 vector 3)
5. Strips fragment AND trailing slash (DEDUP-02 vector 4)
6. Preserves root `/`
7. Lowercases hostname (`COOLEY.COM` → `cooley.com`)
8. Lowercases scheme (`HTTPS://` → `https://`)
9. Strips all 12 marketing tracking params in one go
10. Strips 3 session-identifying params (sessionid, token, sid) — locks T-04-02 mitigation
11. Preserves non-tracking params, sorted alphabetically
12. Resolves relative URL against base
13. Set-of-1 assertion that the three https DEDUP-02 vectors all collapse to one output

**parseDate (5 assertions):**
1. Asia/Seoul (UTC+9, no DST) — primary RESEARCH.md L671 vector
2. America/Los_Angeles in April (PDT, UTC-7)
3. America/Los_Angeles in January (PST, UTC-8) — DST boundary guard
4. UTC passthrough
5. ISO-8601 Z-suffix regex shape

## Task Commits

| Task | Hash | Gate | Message |
|------|------|------|---------|
| 1: Write failing tests (RED) | `accf217` | RED | test(01-04): add failing test for canonicalizeUrl + parseDate |
| 2: Implement util.ts (GREEN) | `bbcf289` | GREEN | feat(01-04): implement canonicalizeUrl + parseDate (DEDUP-02) |

REFACTOR gate not triggered — implementation landed minimal per the `<interfaces>` contract; no cleanup needed.

## Decisions Made

See frontmatter `key-decisions` block for the full list. Summary:

1. **Scheme preservation is the canonical contract.** RESEARCH.md vector 3 (`http://` input → `https://` expected output) is a documented divergence: the function lowercases the scheme but does not collapse http/https. The test for vector 3 asserts `http://cooley.com/news/insight/2026/2026-04-15-ai-reg` (trailing slash stripped, scheme kept). If product later wants http→https collapse, it's a v1.x change requiring a retro-canonicalize pass over SeenState — not a silent behavior change.
2. **TRACKING_PARAMS exported, not inlined.** Plans 05+ and future non-dev documentation reference this list by import, so there's a single authoritative location to update if (e.g.) LinkedIn adds a new `li_fat_id` tracker.
3. **18 assertions (13 + 5) — above the plan's 10 + 4 floor.** The two extras are: (a) Set-of-1 collapse check that all three https DEDUP-02 vectors normalize identically, and (b) standalone session-param test separating T-04-02 mitigation from marketing-tracker mitigation.

## Deviations from Plan

**None of the Rule 1–3 deviation categories fired.** The implementation code block came verbatim from the plan's `<interfaces>` section; no bugs, no missing critical functionality, no blocking issues.

One documented divergence (not a Rule deviation — explicitly called out in the plan itself): **scheme preservation for DEDUP-02 vector 3.** The plan's `<interfaces>` block (lines 85-93) acknowledged the `http://` input vs `https://` expected output mismatch and directed the executor to "follow RESEARCH.md's explicit note — implement as `canonicalizeUrl` does (preserves scheme), and make the test for input 3 assert the canonical form `http://cooley.com/news/insight/2026/2026-04-15-ai-reg`". This is what was implemented; the executor-level decision was which form to assert in the test, and the in-file JSDoc + test-file comment both document the rationale.

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `pnpm test` green after Task 2 | PASS — 18/18 assertions pass in 483ms |
| `pnpm typecheck` clean | PASS — tsc --noEmit exits 0 |
| All 4 DEDUP-02 test vectors collapse (three https to one, http preserving scheme) | PASS — smoke-verified via `pnpm tsx` one-shot, output matches |
| parseDate output always UTC ISO with Z suffix | PASS — regex assertion `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` passes |

## Success Criteria

| Criterion | Status |
|-----------|--------|
| DEDUP-02 fully satisfied by canonicalizeUrl implementation | PASS |
| Timezone Pitfall 3/6 protection via parseDate (consumed by plan 05 rss.ts) | PASS (contract locked by tests) |
| Pure function invariants: same input → same output, no I/O, no env reads | PASS — neither function reads `process.env`, `Date.now()`, or the filesystem |

## Known Stubs

**None.** `src/scrapers/util.ts` has no TODO/FIXME/placeholder markers, no hardcoded empty returns, no "coming soon" strings. Both exported functions are complete implementations. Grep for stub markers returned zero hits.

## Threat Flags

No new threat surface introduced. All four plan-declared threats (T-04-01 through T-04-04) are mitigated as designed:

- **T-04-01 Tampering (malformed URL):** `new URL(input, base)` throws on invalid input; plan 05 rss.ts is the first caller and will wrap the throw at the item boundary (not the firm boundary).
- **T-04-02 Information Disclosure (session-bearing URL params):** `TRACKING_PARAMS` explicitly strips `sessionid`, `token`, `sid`; locked by dedicated test.
- **T-04-03 DoS (pathologically long URL):** Accepted — Node's URL parser has internal limits and would throw rather than hang. No length gate added.
- **T-04-04 Tampering (unknown IANA zone):** `fromZonedTime` throws `RangeError` on unknown zone; zod schema (plan 03) already constrains timezone format at config-load time.

## Next Phase Readiness

Plan 05 (rss.ts) can now assume:

- `import { canonicalizeUrl, parseDate, TRACKING_PARAMS } from '../scrapers/util.js'` works with the NodeNext `.js` extension convention established in plan 03.
- `canonicalizeUrl(item.link, firm.url)` handles absolute + relative + www-prefixed + tracking-parammed + fragment-ed RSS item URLs in one call.
- `parseDate(pubdate, firm.timezone)` produces a UTC ISO string that SeenState can use directly as the `lastNewAt` value.
- Changing either function's behavior for any input in the test suite is a breaking state-format change — the test file is the canonical contract.

## Self-Check: PASSED

- `src/scrapers/util.ts` exists on disk.
- `test/scrapers/util.test.ts` exists on disk.
- Both task commits (`accf217`, `bbcf289`) present in `git log --oneline`.
- `pnpm test` exits 0 with 18/18 assertions passing.
- `pnpm typecheck` exits 0.
- TRACKING_PARAMS grep count = exactly 15 entries.
- DEDUP-02 smoke-run confirms the three https vectors produce `https://cooley.com/news/insight/2026/2026-04-15-ai-reg` and the http vector produces `http://cooley.com/news/insight/2026/2026-04-15-ai-reg` (both expected).
- RED gate (`test(01-04)`) ordered before GREEN gate (`feat(01-04)`) in git log — TDD sequence preserved.

---
*Phase: 01-foundation-vertical-slice*
*Plan: 04*
*Completed: 2026-04-17*
