---
phase: 13-1-gemini-rpd
plan: 04
subsystem: pipeline
tags: [weekly-mode, heartbeat, restore-pending, cross-mode-invariant, d-01, d-12, d-14, d-15, d-22]

# Dependency graph
requires:
  - phase: 13-1-gemini-rpd
    provides: "src/state/pending.ts — readPending + truncatePending + PendingItem/PendingState (plan 13-01)"
  - phase: 13-1-gemini-rpd
    provides: "src/summarize/gemini.ts — resetGeminiCallCount + getGeminiCallCount (plan 13-02)"
  - phase: 13-1-gemini-rpd
    provides: "src/observability/summary.ts — writeStepSummary 4th-arg geminiCallCount (plan 13-02)"
  - phase: 13-1-gemini-rpd
    provides: "src/pipeline/runTypes.ts — RunOptions/RunReport/Reporter/noopReporter (plan 13-03)"
provides:
  - "src/compose/heartbeat.ts — composeHeartbeat pure function (empty-week email)"
  - "src/pipeline/runWeekly.ts — weekly-mode entry function (readPending → restore → detect → compose → send → archive → truncate → state)"
  - "restoreFirmsFromPending helper (D-14) — PendingItem[] → FirmResult[] reconstruction with missing-firm warn+skip"
  - "D-01 cross-mode invariant enforced on weekly side (zero imports from fetch/enrichBody/filter/dedup/playwright/summarize-non-counter)"
  - "D-12 detection runs in weekly only — detectHallucinationClusters + detectLowConfidence call sites confirmed by grep gate"
  - "D-22 [METRIC] geminiCallCount=0 uniform emission for weekly runs (grep marker preserved across daily+weekly)"
affects:
  - "13-05 (main.ts mode dispatch): main() will call runWeekly() when mode==='weekly'"
  - "13-06 (weekly.yml): GHA workflow entry calls `pnpm tsx src/main.ts --mode=weekly` which dispatches into runWeekly"
  - "13-07 (e2e tests): runWeekly + composeHeartbeat are tested at fixture level here; e2e wiring is plan 13-07's scope"

# Tech tracking
tech-stack:
  added: []  # No new deps — uses existing date-fns-tz + zod + node:fs ecosystem
  patterns:
    - "Empty-week heartbeat separate composer (D-15): composeDigest signature untouched; separate composeHeartbeat avoids snapshot drift on the digest path"
    - "restoreFirmsFromPending: type-system-driven invariant — PendingItem omits description/isClusterMember/isNew (COMP-05); restored SummarizedItem has them as undefined; detectors + composeDigest work without modification because none read description"
    - "OPS-03 ordering preserved at the runWeekly transaction boundary: sendMail (L226) < writeArchive (L227) < truncatePending (L235) < writeState (L244)"
    - "Pre-declared markers + resultsForReport outside try block (Pitfall 5 mirror from run.ts:185): finally writeStepSummary sees current run state even on early throw"

key-files:
  created:
    - src/compose/heartbeat.ts
    - src/pipeline/runWeekly.ts
    - test/compose/heartbeat.test.ts
  modified: []

key-decisions:
  - "Phase 13-04: TDD applied at task granularity (Task 1: heartbeat composer) — RED commit (c9a44cb) + GREEN commit (1d7fc22). Task 2 (runWeekly) was tdd='false' per plan because e2e testing belongs in plan 13-07"
  - "Phase 13-04: archivePath plumbed into RunReport — runWeekly's writeArchive call returns the path; passed through RunReport so plan 13-05/13-07 can assert archive landed where expected (parity with runPipeline's runReport.archivePath shape)"
  - "Phase 13-04: payload typed explicitly as EmailPayload via let payload: EmailPayload — without the annotation, TS narrows the heartbeat-vs-digest branch to the first-assigned type and the second branch fails to typecheck"
  - "Phase 13-04: writeState in heartbeat branch passes resultsForReport=[] (empty array) — Phase 1 writer's `for (const r of results)` loop simply doesn't execute, leaving prior firms untouched while lastUpdated advances. W1 sub-acceptance satisfied"
  - "Phase 13-04: header-comment forbidden-import block listed at the bottom of the imports — defensive in-source documentation mirroring the grep gate (same defense-in-depth posture as runDaily.ts)"

patterns-established:
  - "Two-branch composer dispatch (heartbeat vs digest): runWeekly picks the composer based on pending.items.length === 0 — readable single if/else, no inheritance/polymorphism"
  - "Restore helper as PendingItem-to-FirmResult adapter (D-14): keeps Phase 8/10 detector signatures unchanged so a Phase-13 split does NOT cascade into detector + composer refactors"
  - "Missing-firm warn+skip (D-14 Claude's Discretion): runWeekly continues processing remaining items if a firm disappears from firms.yaml mid-week — matches Phase 2 D-P2-03 failure isolation"

requirements-completed: [SPEC-2, SPEC-5]

# Metrics
duration: ~4min
completed: 2026-05-22
---

# Phase 13 Plan 04: runWeekly + composeHeartbeat Summary

**`src/compose/heartbeat.ts` (42 lines) provides the empty-week email composer (D-15/D-16/D-17); `src/pipeline/runWeekly.ts` (262 lines) dispatches between composeHeartbeat (empty pending) and composeDigest+detectors (non-empty pending) per SPEC §Req 5. D-14 `restoreFirmsFromPending` helper rehydrates PendingItem[] into FirmResult[] so Phase 8 + Phase 10 detectors are reused without modification. 479/479 full suite green; D-01 cross-mode invariant + D-12 detection-here-only + D-22 [METRIC] uniform emission all verified by grep gates.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-22T17:36:31Z
- **Completed:** 2026-05-22T17:40:18Z
- **Tasks:** 2 (1 with TDD RED+GREEN, 1 non-TDD)
- **Files modified:** 3 (all new)

## Accomplishments

- `src/compose/heartbeat.ts` (42 lines): pure function composeHeartbeat(recipient, fromAddr, now) → EmailPayload. Subject uses EMAIL-04 prefix + Korean "이번 주 신규 없음" marker (D-16). Body is 2-paragraph minimal Korean (D-17). Does NOT import composeDigest (D-15 separation).
- `test/compose/heartbeat.test.ts` (39 lines): 5 vitest cases covering subject prefix + Korean marker, KST midnight rollover, HTML body content, recipient/from passthrough, and absence of failed-firm/marker block keywords.
- `src/pipeline/runWeekly.ts` (262 lines): two-branch dispatch on `pending.items.length === 0`:
  - empty → `composeHeartbeat` (D-15/D-16/D-17 + SPEC §Req 5 DEDUP-03 override)
  - non-empty → `restoreFirmsFromPending` (D-14) → `detectHallucinationClusters` (D-12 only here) → DQOBS-01 H/M/L tally → `detectLowConfidence` (D-12 only here) → `composeDigest`
- `restoreFirmsFromPending` helper: converts `PendingItem[]` → `FirmResult[]` with firmId grouping. Items from firms missing in `firms.yaml` are logged via `console.warn` and skipped (D-14 Claude's Discretion — matches Phase 2 D-P2-03 failure isolation).
- OPS-03 ordering preserved at the weekly transaction boundary: `sendMail` (L226) → `writeArchive` (L227) → `truncatePending` (L235) → `writeState` (L244). Failure at any step before truncatePending leaves pending.json intact for manual workflow_dispatch retry.
- D-01 cross-mode invariant verified by grep gate: zero imports from `./fetch.js`, `./enrichBody.js`, `./filter.js`, `./dedup.js`, `playwright`, and zero non-counter imports from `../summarize/gemini.js` (only `resetGeminiCallCount` + `getGeminiCallCount`).
- D-12 verified: both `detectHallucinationClusters` and `detectLowConfidence` are imported + called inside the non-empty branch (grep counts ≥2 each — import + call site + comment references).
- D-22 verified: `resetGeminiCallCount()` at the top of try block, `getGeminiCallCount()` in finally block — passed as 4th arg to `writeStepSummary` so the `[METRIC] geminiCallCount=0` line is emitted uniformly even though weekly never calls Gemini.
- 479/479 full vitest suite green (474 prior + 5 new heartbeat tests; zero regressions in run.ts/runDaily.ts test paths).
- `pnpm typecheck` exits 0.

## Task Commits

Each task committed atomically:

1. **Task 1 RED — failing heartbeat test** — `c9a44cb` (test)
2. **Task 1 GREEN — composeHeartbeat implementation** — `1d7fc22` (feat)
3. **Task 2 — runWeekly with restore+detect+compose+send+truncate** — `85873b7` (feat)

## Files Created/Modified

- `src/compose/heartbeat.ts` (NEW, 42 lines) — empty-week heartbeat composer; pure function; no composeDigest import
- `test/compose/heartbeat.test.ts` (NEW, 39 lines) — 5 vitest cases covering D-15/D-16/D-17 invariants
- `src/pipeline/runWeekly.ts` (NEW, 262 lines) — weekly-mode entry; two-branch dispatch (heartbeat vs digest); restoreFirmsFromPending helper; D-12 detection; OPS-03 ordering; D-22 [METRIC] uniform emission

## Decisions Made

See `key-decisions` frontmatter. Summary:

1. **TDD applied at task granularity, not plan granularity** — Task 1 followed strict RED → GREEN: failing test commit `c9a44cb` (import error from missing module), implementation commit `1d7fc22` (5/5 pass). Task 2 was non-TDD per the plan because end-to-end weekly assertions belong in plan 13-07; here we verify structural invariants via grep gates + the existing full suite.

2. **archivePath plumbed into RunReport** — runWeekly's `writeArchive` returns the path; we capture it and assign to `report.archivePath` so plans 13-05 (main.ts dispatch) and 13-07 (e2e tests) can read it for assertions or DRY_RUN echo, mirroring `runPipeline`'s `RunReport.archivePath` shape.

3. **`let payload: EmailPayload` explicit annotation** — without it, TS would narrow the type to the first-branch's return type and the second branch would fail to typecheck. EmailPayload (from src/types.ts) is the canonical contract both composers honor.

4. **Empty heartbeat branch passes resultsForReport=[] to writeState** — Phase 1 writer's `for (const r of results)` loop simply doesn't execute, leaving prior firms untouched while `lastUpdated` advances to `new Date().toISOString()`. Satisfies W1 sub-acceptance: heartbeat run bumps `seen.lastUpdated`, which the plan 13-07 e2e test asserts.

5. **Header-comment forbidden-import block at the bottom of imports** — mirrors runDaily.ts pattern (defensive in-source documentation). The grep gate enforces the invariant mechanically; the comment block tells future readers "why isn't sendMail forbidden? it IS imported because runWeekly sends" and "why doesn't this file pull from playwright? — same reason fetch.js is absent: weekly does not fetch".

## Deviations from Plan

None on the deviation-rule axis (no Rule 1/2/3 fixes triggered). Two micro-departures from the plan's literal text:

- **Plan AC said `grep -c "formatInTimeZone" src/compose/heartbeat.ts` returns 1** — actual measurement is 2 (one import line + one call). Same plan-authoring imprecision pattern documented in Phase 1 plans (09 mailer single-catch, 11 main.ts DRY_RUN) where a "grep count = 1" target is the natural minimum but the actual file has both import + call. Spirit (single `formatInTimeZone` call site) preserved.
- **Plan AC said `grep -c "이번 주 신규 없음" src/compose/heartbeat.ts` returns 1** — actual measurement is 2 (header comment + subject template). The header comment documents the D-16 marker contract; removing it would weaken the in-source documentation. Spirit (exactly one subject marker emitted at runtime) preserved.

Both grep counts are `≥1` and the file body matches the plan template byte-for-byte. No code-content deviation.

## Issues Encountered

None. Both tasks landed clean; typecheck zero errors throughout; full suite green at every commit boundary (`git bisect` clean).

## Verification Evidence

**Task 1 acceptance gates (composeHeartbeat + tests):**

```
$ pnpm typecheck
(no errors)

$ pnpm vitest run test/compose/heartbeat.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  512ms

$ grep -c "composeHeartbeat" src/compose/heartbeat.ts             → 2 (export + call site marker)
$ grep -c "formatInTimeZone" src/compose/heartbeat.ts             → 2 (import + call)
$ grep -c "이번 주 신규 없음" src/compose/heartbeat.ts             → 2 (header doc + subject template)
$ grep -c "법률 다이제스트" src/compose/heartbeat.ts                 → 3 (header + subject + heading)
$ grep -c "from '../types.js'" src/compose/heartbeat.ts           → 1 (EmailPayload import)
$ grep -vE '^\s*(//|\*|/\*)' src/compose/heartbeat.ts | grep -c "composeDigest"  → 0
```

**Task 2 acceptance gates (runWeekly.ts):**

```
$ pnpm typecheck                                                   → (no errors)
$ grep -c "export async function runWeekly" src/pipeline/runWeekly.ts        → 1
$ grep -c "restoreFirmsFromPending" src/pipeline/runWeekly.ts                → 3 (≥2 required)
$ grep -c "composeHeartbeat" src/pipeline/runWeekly.ts                       → 3 (≥2 required)
$ grep -c "composeDigest" src/pipeline/runWeekly.ts                          → 7 (≥2 required)
$ grep -c "detectHallucinationClusters" src/pipeline/runWeekly.ts            → 5 (≥2 required)
$ grep -c "detectLowConfidence" src/pipeline/runWeekly.ts                    → 5 (≥2 required)
$ grep -c "truncatePending" src/pipeline/runWeekly.ts                        → 4 (≥2 required)
$ grep -c "readPending" src/pipeline/runWeekly.ts                            → 3 (≥2 required)
```

**D-01 cross-mode invariant (forbidden imports — code regions only, comment-stripped):**

```
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runWeekly.ts | grep -c "from './fetch.js'"        → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runWeekly.ts | grep -c "from './enrichBody.js'"   → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runWeekly.ts | grep -c "from './filter.js'"       → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runWeekly.ts | grep -c "from './dedup.js'"        → 0
$ grep -vE '^\s*(//|\*|/\*)' src/pipeline/runWeekly.ts | grep -c "from 'playwright'"        → 0
$ grep -E "^import.*from ['\"]\.\./summarize/gemini\.(js|ts)['\"]" src/pipeline/runWeekly.ts | grep -vE "resetGeminiCallCount|getGeminiCallCount" | wc -l   → 0
```

**OPS-03 ordering (sendMail < writeArchive < truncatePending < writeState):**

```
$ grep -nE "await (sendMail|writeArchive|truncatePending|writeState)\(" src/pipeline/runWeekly.ts
226:      await sendMail(payload);
227:      archivePath = await writeArchive(payload.html, now);
235:    await truncatePending();
244:      await writeState(seen, resultsForReport);
```

**Full test suite:**

```
$ pnpm vitest run
 Test Files  34 passed (34)
      Tests  479 passed (479)
   Duration  40.26s
```

## D-01 Verification (cross-mode invariant on weekly side)

D-01 motivates the entire phase: split runPipeline into runDaily + runWeekly so the compiler enforces cross-mode invariant via import absence. The weekly side now mirrors the daily side's enforcement posture:

1. **Comment documentation:** Header comment at top of runWeekly.ts explicitly enumerates the forbidden modules ("this file DOES NOT IMPORT fetchAll, enrichWithBody, applyKeywordFilter, applyTopicFilter, dedupAll, summarize, chromium/playwright Browser"). Forbidden-import block at the bottom of imports mirrors this list as a comment-only fence.

2. **Compiler:** Every type-level reference to the forbidden modules is absent — runWeekly.ts cannot accidentally call `fetchAll(firms, recorder)` because the name is not in scope. Adding the import would be visible in the diff and rejected at code review (acceptance gate auto-catches at grep level too).

3. **Grep gate:** Six grep counts all return 0 for the forbidden import patterns in code regions (comment-stripped). Future refactors that accidentally pull a forbidden module trigger the gate immediately.

## D-12 Verification (cluster + low-conf detection in weekly only)

D-12 rationale: daily firm-batches (1~2 items/firm) are below the cluster threshold (3+) so detection is permanently no-op on daily; weekly cumulates 50~100 items where the GUARD-03 use case actually fires. Verified in runWeekly.ts:

- `detectHallucinationClusters` imported (line 47) and called inside the non-empty branch (line ~188)
- `detectLowConfidence` imported (line 48) and called after the H/M/L tally inside the non-empty branch (line ~211)
- Both detectors NOT called in the empty/heartbeat branch — there's nothing to detect when items.length === 0
- markers + resultsForReport hoisted above try block so finally writeStepSummary sees them even on early throw (Pitfall 5 mirror from run.ts:185)

## D-14 Verification (restoreFirmsFromPending helper)

D-14 enables Phase 8/10 detectors + composeDigest to remain untouched by Phase 13's split. Verified:

- `restoreFirmsFromPending(pending, allFirms)` defined as a private file-local function (not exported — only used inside runWeekly's non-empty branch)
- Groups PendingItem[] by firmId; firms missing from `firms.yaml` are logged via `console.warn` and skipped (matches Phase 2 D-P2-03 failure isolation)
- Reconstructs SummarizedItem[] with `description` intentionally omitted (COMP-05) — downstream code never reads description (composeDigest reads summary_ko; detectClusters compares summary_ko prefixes; detectLowConfidence reads summaryConfidence)
- Returns FirmResult[] with r.raw=[] and r.new=summarized (cast-bridged via `as unknown as NewItem[]` — SummarizedItem extends NewItem so the shape is compatible)

## Wiring Verification (Plan 13-01 + 13-02 + 13-03 integrated)

**Plan 13-01 (pending storage):** `readPending` + `truncatePending` called in runWeekly:

```typescript
const pending = await readPending();              // line ~165
// ...
await truncatePending();                          // line 235
```

D-09 windowStart immutability honored: runWeekly only reads pending then truncates after sendMail + writeArchive succeed. No `appendPending` call (weekly is the consumer, not the producer).

**Plan 13-02 (geminiCallCount):**

- `resetGeminiCallCount()` at top of try block (line ~145) — defensive even though weekly never calls Gemini (uniform with daily-side reset pattern)
- `getGeminiCallCount()` in finally block (line ~254) passed as 4th arg to `writeStepSummary` — produces `[METRIC] geminiCallCount=0` line at top of every weekly GHA step-summary

The finally placement guarantees the metric line is emitted even on mid-pipeline throw (e.g., readPending ZodError, sendMail SMTP failure). SPEC AC-7 grep marker `[METRIC] geminiCallCount=N` reachable in every weekly run, partial or complete — and uniformly with daily runs.

**Plan 13-03 (runTypes shared module):**

```typescript
import type { RunOptions, RunReport } from './runTypes.js';
import { noopReporter } from './runTypes.js';
```

runWeekly and runDaily now reference the same Reporter/RunOptions/RunReport contract — plan 13-05 main.ts can call either uniformly via `mode === 'daily' ? runDaily() : runWeekly()`.

## OPS-03 Transaction Ordering (weekly side)

The weekly transaction must be recoverable on partial failure. Ordering preserved:

```
sendMail        (L226)  ← runWeekly tries to deliver the email FIRST
writeArchive    (L227)  ← only after mailer success (no orphan archives)
truncatePending (L235)  ← only after archive (failure here would lose the digest)
writeState      (L244)  ← OPS-03 LAST step (lastUpdated refresh)
```

Failure mode coverage:
- **sendMail fails** → archive not written; pending intact; manual workflow_dispatch retries cleanly (idempotent)
- **writeArchive fails** → archive missing but pending intact; manual retry resends the SAME items (Gmail dedup via duplicate Message-Id, but operator sees the duplicate). Acceptable tradeoff for archive being best-effort.
- **truncatePending fails** → pending intact; archive landed; seen.lastUpdated stale; manual retry resends. Same duplicate-message tradeoff.
- **writeState fails** → all prior steps succeeded; only `lastUpdated` is stale. Cosmetic — next daily run advances it via writeState.

## Plan 13-07 Sub-Acceptance (W1) — heartbeat writeState

Plan 13-04's AC-W1 stipulates that the heartbeat path's writeState call must bump `seen.lastUpdated` even though `resultsForReport=[]`. Verified at the code level: Phase 1 writer (`src/state/writer.ts:130-134`) sets `lastUpdated: new Date().toISOString()` unconditionally — the `for (const r of results)` loop body is the only short-circuit, and an empty results array bypasses the body entirely without affecting the final `next: SeenState` assembly.

Plan 13-07's e2e Task 3 AC-3 will exercise this end-to-end (fixture: pending.items=[] → runWeekly → assert seen.lastUpdated changed). If 13-07's existing test doesn't already assert this, the executor adds `expect(seen.lastUpdated).not.toBe(originalLastUpdated)`. This SUMMARY hands off the assertion to plan 13-07.

## Note on run.ts persistence

`src/pipeline/run.ts` remains unchanged in this plan — runWeekly.ts coexists with run.ts (and runDaily.ts). Plan 13-05 will:
- Swap main.ts to dispatch `runDaily()` / `runWeekly()` based on `--mode` flag
- Swap checkFirm.ts from `runPipeline` → `runDaily` (D-03)
- Delete src/pipeline/run.ts after all call sites swap
- Update main.ts header comment "DRY_RUN check sites = 4" → "DRY_RUN check sites = 5" (Pattern 2 containment annotation, deferred from 13-01 + 13-03 per their SUMMARYs)

## Next Phase Readiness

**Ready for plan 13-05 (main.ts dispatch):**

- runWeekly entry function signature matches the RunOptions → Promise<RunReport> contract — `main.ts` dispatch can call `mode === 'weekly' ? runWeekly(opts) : runDaily(opts)` uniformly
- RunOptions fields honored or harmless on weekly side: `skipEmail` (used), `skipStateWrite` (used), `reporter` (used); `firmFilter` (unused — weekly doesn't filter firms), `skipGemini` (unused — weekly doesn't summarize), `saveHtmlPath` (unused — runWeekly doesn't save HTML preview; if needed, plan 13-05 can plumb it in)

**Ready for plan 13-06 (weekly.yml workflow):**

- weekly.yml file_pattern can group `state/pending.json state/seen.json archive/**/*.html` — runWeekly writes/truncates pending and writes seen + creates archive HTML in canonical OPS-03 order, so the atomic commit invariant (D-23) is met by the runWeekly.ts implementation

**Ready for plan 13-07 (e2e tests):**

- `restoreFirmsFromPending` is testable in isolation (private but exposed via runWeekly behavior in e2e fixtures)
- `composeHeartbeat` already has 5 unit tests; 13-07 adds e2e: pending empty → runWeekly → assert sendMail received heartbeat-shaped payload AND seen.lastUpdated bumped
- 13-07 also covers: pending non-empty (5 items) → runWeekly → sendMail received digest payload with 5 items, archive landed, pending.items=0 post-truncate, seen.lastUpdated bumped

## User Setup Required

None — no external service configuration required for this plan. (Plan 13-06 will require GHA secrets for weekly.yml: `GMAIL_APP_PASSWORD`, `RECIPIENT_EMAIL`. Already configured.)

## Threat Flags

None introduced. Three threats from the PLAN frontmatter threat register mitigated:

- **T-13-04-01** (Tampering, restoreFirmsFromPending crash on missing firm) → warn+skip implemented in helper; runWeekly continues with remaining items (Phase 2 D-P2-03 failure isolation mirror)
- **T-13-04-02** (Tampering, mid-run crash between sendMail and truncatePending) → OPS-03 ordering preserved: sendMail (L226) → writeArchive (L227) → truncatePending (L235) → writeState (L244). Failure before truncatePending leaves pending intact for manual retry
- **T-13-04-03** (Information Disclosure, restoreFirmsFromPending sets r.summarized[i].description=undefined) → composeDigest reads summary_ko (not description); detectors compare summary_ko prefixes / read summaryConfidence (not description); explicit comment in restoreFirmsFromPending documents the invariant
- **T-13-04-04** (Injection, heartbeat subject contains attacker-controlled input) → composeHeartbeat receives no user input (Date + hardcoded Korean strings + validated config recipient/fromAddr). Accept disposition
- **T-13-04-05** (Repudiation, D-12 cluster detection inadvertently disabled in weekly) → grep gate in acceptance asserts detectHallucinationClusters + detectLowConfidence imports + calls present (≥2 each)
- **T-13-04-06** (Denial of Service, heartbeat email floods if weekly runs multiple times on same Monday) → concurrency group `digest-pipeline` (plan 13-06 weekly.yml) prevents parallel weekly runs; manual workflow_dispatch x2 sends 2 heartbeats — operator-driven, intentional. Accept disposition

## Self-Check: PASSED

- [x] File `src/compose/heartbeat.ts` exists
- [x] File `src/pipeline/runWeekly.ts` exists
- [x] File `test/compose/heartbeat.test.ts` exists
- [x] Commit `c9a44cb` (test 13-04 heartbeat RED) present in git log
- [x] Commit `1d7fc22` (feat 13-04 heartbeat GREEN) present in git log
- [x] Commit `85873b7` (feat 13-04 runWeekly) present in git log
- [x] `pnpm typecheck` → 0 errors
- [x] `pnpm vitest run` → 479/479 pass (5 new + 474 prior, zero regressions)
- [x] D-01 forbidden-import grep gates all return 0 (cross-mode invariant on weekly side)
- [x] Required wirings (readPending, truncatePending, composeHeartbeat, composeDigest, detectHallucinationClusters, detectLowConfidence, restoreFirmsFromPending) all present (grep counts ≥2 each)
- [x] OPS-03 ordering verified: sendMail (226) < writeArchive (227) < truncatePending (235) < writeState (244)
- [x] D-22 [METRIC] uniform emission: resetGeminiCallCount() at try start, getGeminiCallCount() in finally → writeStepSummary 4th arg
- [x] D-15 composeDigest signature untouched (separate heartbeat composer)

---
*Phase: 13-1-gemini-rpd*
*Completed: 2026-05-22*
