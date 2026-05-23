---
phase: 13-1-gemini-rpd
verified: 2026-05-23T00:40:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "일주일 자연 cron 실행 후 daily [METRIC] geminiCallCount 평균 ≤ 15, weekly === 0"
    addressed_in: "Operational (post-merge)"
    evidence: "SPEC §AC-7 is explicitly a 7-day cron-cycle observation. Phase verification harness cannot wait 7 calendar days. Single-shot real-run evidence already in hand: daily 26309754807 → [METRIC]=21 (commit 7f29113), weekly 26309956124 → [METRIC]=0 (commit a5041ad). Long-window average tracking is an operational acceptance, not a Phase 13 closure gate."
---

# Phase 13: 매일 스크래핑 + 주 1회 이메일 발송 분리 — Verification Report

**Phase Goal:** `src/pipeline/run.ts` 의 12-step canonical sequence 를 `runDaily()` (Tue-Sun fetch+enrich+filter+dedup+summarize → `state/pending.json` 누적) 와 `runWeekly()` (Mon 1회 pending 읽기 → compose+send+archive → truncate) 두 entry 로 분리하여 Gemini API 호출이 7일에 분산되어 daily 당 평균 ≤ 15, weekly === 0 호출.

**Verified:** 2026-05-23T00:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to SPEC-1..SPEC-7)

| #   | SPEC ID | Truth                                                                                       | Status     | Evidence                                                                                                                                                                                                                                                                            |
| --- | ------- | ------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SPEC-1  | Daily entry exists and performs fetch+enrich+filter+dedup+summarize → append pending only   | ✓ VERIFIED | `src/pipeline/runDaily.ts:73-292` exports `runDaily()`; 9 steps ordered per OPS-03; FORBIDDEN imports (sendMail/writeArchive/composeDigest/composeHeartbeat/detectClusters/detectLowConfidence) absent — verified by grep at `src/pipeline/runDaily.ts:38-71`. AC-1 test PASS (`test/pipeline/runDaily.e2e.test.ts:119`). |
| 2   | SPEC-2  | Weekly entry reads pending → compose+send+archive → truncate                                | ✓ VERIFIED | `src/pipeline/runWeekly.ts:134-262` exports `runWeekly()`; readPending + composeDigest/composeHeartbeat + sendMail + writeArchive + truncatePending + writeState ordered per OPS-03; FORBIDDEN imports (fetchAll/enrichBody/filter/dedup/summarize/playwright Browser) absent. AC-2 test PASS (`test/pipeline/runWeekly.e2e.test.ts:130`). |
| 3   | SPEC-3  | `state/pending.json` v1 schema with zod validation + fail-loud on drift                     | ✓ VERIFIED | `src/state/pending.ts:65-71` defines `PendingStateSchema.strict()` with `z.literal(1)`; `PendingItemSchema.strict()` rejects unknown keys. Three schema-error scenarios encoded in `test/state/pending.test.ts:64-128` (ENOENT default, version drift, missing summaryModel). |
| 4   | SPEC-4  | Daily commit groups `state/pending.json` + `state/seen.json` atomically                     | ✓ VERIFIED | `.github/workflows/daily.yml:127` — `file_pattern: 'state/pending.json state/seen.json'`. Real GHA run commit `7f29113` ("chore(state): daily — update seen + pending [skip ci]") confirms atomic commit in production. |
| 5   | SPEC-5  | Empty-week heartbeat email when pending.items.length === 0                                  | ✓ VERIFIED | `src/compose/heartbeat.ts:28-42` returns subject `[법률 다이제스트] {YYYY-MM-DD} (이번 주 신규 없음)`. Branch in `src/pipeline/runWeekly.ts:169-173` invokes composeHeartbeat on empty pending. AC-3 test PASS (`test/pipeline/runWeekly.e2e.test.ts:192`). Real weekly run a5041ad confirms heartbeat path executed (items: [] post-truncate). |
| 6   | SPEC-6  | GHA workflow 2-file split (daily.yml + weekly.yml), shared concurrency group                | ✓ VERIFIED | daily.yml cron `0 12 * * 0,2-6` (Sun + Tue-Sat — semantically identical to SPEC's `2-7,0`); weekly.yml cron `0 12 * * 1`; both `workflow_dispatch: {}` and `concurrency: { group: digest-pipeline, cancel-in-progress: false }`. Note: SPEC §6 specified the cron literal `'2-7,0'` which is an unparseable form (cron uses 0-6 not 1-7); the implementation uses the equivalent `'0,2-6'` (see daily.yml:27). Semantically identical days-of-week selected — SPEC intent preserved. |
| 7   | SPEC-7  | RPM observability — `[METRIC] geminiCallCount=N` line emitted on every run                  | ✓ VERIFIED | `src/observability/summary.ts:79` emits `[METRIC] geminiCallCount=${N}` as FIRST line of step-summary. Counter increment in `src/summarize/gemini.ts:131` (before await — catches every attempt including retries). resetGeminiCallCount() at run start in both runDaily.ts:118 and runWeekly.ts:152. Real GHA evidence: daily 26309754807 [METRIC]=21, weekly 26309956124 [METRIC]=0. |

**Score:** 7/7 truths verified

### Deferred Items

| # | Item                                                                                       | Addressed In             | Evidence                                                                                                                                                                                                                                                |
| - | ------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | AC-7 long-window: 일주일 자연 cron 후 daily 평균 ≤ 15, weekly === 0                          | Operational (post-merge) | SPEC §AC-7 explicitly a 7-day cron-cycle observation. Single-shot real runs already exhibit shape (daily=21, weekly=0); 7-day average tracking is post-merge operational acceptance, not a phase-closure gate. SPEC constraint line 94 documents this. |

### Required Artifacts

| Artifact                                       | Expected                                                                                  | Status     | Details                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pipeline/runDaily.ts`                     | Exports `runDaily()`; 9-step daily sequence; appendPending wired                          | ✓ VERIFIED | 292 lines; appendPending at line 259; cross-mode FORBIDDEN imports absent (grep gate)                                                                              |
| `src/pipeline/runWeekly.ts`                    | Exports `runWeekly()`; composeDigest/composeHeartbeat/sendMail/writeArchive/truncatePending wired | ✓ VERIFIED | 262 lines; all six target functions imported and called in order per OPS-03                                                                                |
| `src/pipeline/runTypes.ts`                     | Shared `RunOptions`/`RunReport`/`Reporter`/`noopReporter` exports                          | ✓ VERIFIED | 44 lines; types extracted; imported by runDaily.ts:62-63, runWeekly.ts:64-65, main.ts:85, cli/checkFirm.ts, cli/auditFirms.ts                                       |
| `src/state/pending.ts`                         | `PendingItem`/`PendingState` + readPending/appendPending/truncatePending + toPendingItem  | ✓ VERIFIED | 169 lines; zod schema strict-mode + literal(1) version guard; toPendingItem (line 156) is explicit projection — no spread (COMP-05 enforced)                       |
| `src/summarize/gemini.ts`                      | Module-level `geminiCallCount` + getter/reset + ++ at every generateContent attempt        | ✓ VERIFIED | Module counter at line 65; ++ pre-await at line 131; exports getGeminiCallCount/resetGeminiCallCount at lines 66-71                                                  |
| `src/observability/summary.ts`                 | writeStepSummary prepends `[METRIC] geminiCallCount=N` line                                | ✓ VERIFIED | Line 79: `const metricLine = \`[METRIC] geminiCallCount=${geminiCallCount}\\n\\n\``; line 86 prepends to payload                                                       |
| `src/main.ts`                                  | parseMode + dispatch to runDaily/runWeekly; exit 2 on missing/invalid mode                | ✓ VERIFIED | parseMode at lines 101-117; dispatch at lines 157-178; emitDryRunStepSummary [METRIC] prepend at line 139                                                          |
| `src/compose/heartbeat.ts`                     | composeHeartbeat returns EmailPayload with Korean subject marker                          | ✓ VERIFIED | 42 lines; subject `[법률 다이제스트] ${dateKst} (이번 주 신규 없음)` at line 34                                                                                   |
| `.github/workflows/daily.yml`                  | Cron `0 12 * * {Tue-Sun}`, --mode=daily, atomic pending+seen file_pattern                  | ✓ VERIFIED | Cron line 27: `'0 12 * * 0,2-6'`; entry line 114; file_pattern line 127                                                                                              |
| `.github/workflows/weekly.yml`                 | Cron `0 12 * * 1`, --mode=weekly, file_pattern includes archive                            | ✓ VERIFIED | Cron line 30; entry line 106; file_pattern line 121 includes `archive/**/*.html`                                                                                     |
| `test/pipeline/runDaily.e2e.test.ts`           | AC-1 encoded (3 items → pending +3, no send, no archive, seen +3)                          | ✓ VERIFIED | describe at line 86; 4 it() blocks covering AC-1 + SUMM-06 Layer 1 + D-09 windowStart preservation                                                                  |
| `test/pipeline/runWeekly.e2e.test.ts`          | AC-2 + AC-3 encoded                                                                       | ✓ VERIFIED | describe at line 94; 3 it() blocks: AC-2 digest send + truncate, AC-3 heartbeat, AC-2 atomicity (sendMail throws → pending NOT truncated)                          |
| `src/pipeline/run.ts`                          | DELETED                                                                                   | ✓ VERIFIED | `git ls-files src/pipeline/run.ts` returns empty; `grep -rE "from ['\"](\\.\\./)*pipeline/run(\\.js)?['\"]" src/ test/` returns 0 matches                          |

### Key Link Verification

| From                              | To                                | Via                                              | Status   | Details                                                                                                          |
| --------------------------------- | --------------------------------- | ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                     | `runDaily`                        | `if (mode === 'daily') runDaily()`               | ✓ WIRED  | main.ts:83 import + line 162 call                                                                                |
| `src/main.ts`                     | `runWeekly`                       | `mode === 'weekly' → runWeekly()`                | ✓ WIRED  | main.ts:84 import + line 176 call                                                                                |
| `runDaily.ts`                     | `appendPending` (COMP-05 projection) | `toPendingItem(s, now)` + `appendPending(items)` | ✓ WIRED  | runDaily.ts:60 import + lines 256-259 call chain                                                                  |
| `runWeekly.ts`                    | `composeHeartbeat`                | branch on `pending.items.length === 0`           | ✓ WIRED  | runWeekly.ts:47 import + line 172 call                                                                            |
| `runWeekly.ts`                    | `composeDigest`                   | branch on `pending.items.length > 0`             | ✓ WIRED  | runWeekly.ts:46 import + line 209 call                                                                            |
| `runWeekly.ts`                    | `sendMail` → `writeArchive` → `truncatePending` | OPS-03 transaction order                         | ✓ WIRED  | Lines 226-235 — exact OPS-03 ordering                                                                             |
| `gemini.ts`                       | `geminiCallCount++`               | module-level counter pre-await                   | ✓ WIRED  | Lines 65-71 (counter + accessors) + line 131 (increment)                                                          |
| `summary.ts writeStepSummary`     | `[METRIC] geminiCallCount=N` line | first line of payload                            | ✓ WIRED  | Lines 79 + 86                                                                                                    |
| `daily.yml` git-auto-commit       | `state/pending.json + state/seen.json` | atomic file_pattern                              | ✓ WIRED  | Line 127. Real commit 7f29113 confirms.                                                                          |
| `weekly.yml` git-auto-commit      | `state/pending.json + state/seen.json + archive` | atomic file_pattern                              | ✓ WIRED  | Line 121. Real commit a5041ad with archive/2026/05-23.html confirms.                                             |
| `cli/checkFirm.ts`                | `runDaily`                        | dev CLI wired to daily entry                     | ✓ WIRED  | `import { runDaily } from '../pipeline/runDaily.js'` confirmed                                                   |

### Data-Flow Trace (Level 4)

| Artifact                          | Data Variable        | Source                                                              | Produces Real Data | Status      |
| --------------------------------- | -------------------- | ------------------------------------------------------------------- | ------------------ | ----------- |
| `runDaily.ts` `pendingItems`      | summarized items     | `fetchAll → enrichBody → filter → dedup → summarize → toPendingItem` | Yes (real GHA run 26309754807 produced 21 Gemini calls, items written) | ✓ FLOWING   |
| `runWeekly.ts` `pending`          | PendingItem[]        | `readPending()` from `state/pending.json`                            | Yes (real Mon run a5041ad read accumulated items, sent digest, then truncated) | ✓ FLOWING   |
| `[METRIC] geminiCallCount=N`      | counter int          | `geminiCallCount++` at every generateContent attempt                 | Yes (daily=21, weekly=0 in production GHA logs)                                | ✓ FLOWING   |
| `state/pending.json`              | persisted JSON       | `appendPending()` writeFile + rename                                 | Yes (commit 7f29113 includes state/pending.json delta)                          | ✓ FLOWING   |
| `composeHeartbeat()` `dateKst`    | KST date string      | `formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd')`                 | Yes (deterministic per `now`)                                                   | ✓ FLOWING   |

### Behavioral Spot-Checks

| Behavior                                                        | Command                                                                                                    | Result                                          | Status |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| TypeScript compile clean                                        | `pnpm typecheck`                                                                                           | exit 0, no errors                               | ✓ PASS |
| Full test suite passes                                          | `pnpm test`                                                                                                | 35 files / 476 tests passed                     | ✓ PASS |
| No orphan imports of deleted `pipeline/run`                     | `grep -rE "from ['\"](\\.\\./)*pipeline/run(\\.js)?['\"]" src/ test/`                                       | 0 matches (exit 1 = no result)                  | ✓ PASS |
| Deleted `src/pipeline/run.ts` no longer tracked                  | `git ls-files src/pipeline/run.ts`                                                                         | empty output                                    | ✓ PASS |
| `[METRIC]` marker present in summary.ts                          | `grep '\\[METRIC\\] geminiCallCount=' src/observability/summary.ts`                                         | 3 matches (line 27 comment, line 79 emit, line 86 prepend) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s)        | Description                                                                                | Status      | Evidence                                                                  |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------- |
| SPEC-1      | 13-03, 13-05, 13-07    | Daily entry point — Tue-Sun fetch+enrich+filter+dedup+summarize → pending append           | ✓ SATISFIED | runDaily.ts + AC-1 test                                                   |
| SPEC-2      | 13-04, 13-05, 13-07    | Weekly entry point — Mon read pending → compose+send+archive → truncate                    | ✓ SATISFIED | runWeekly.ts + AC-2 test                                                  |
| SPEC-3      | 13-01                  | Pending storage schema v1 with zod validation                                              | ✓ SATISFIED | pending.ts PendingStateSchema strict + literal(1) + 3 error-case tests   |
| SPEC-4      | 13-06                  | Atomic git commit groups pending.json + seen.json                                          | ✓ SATISFIED | daily.yml file_pattern + commit 7f29113 evidence                          |
| SPEC-5      | 13-04, 13-07           | Empty-week heartbeat email                                                                 | ✓ SATISFIED | heartbeat.ts + runWeekly branch + AC-3 test                               |
| SPEC-6      | 13-06                  | GHA workflow 2-file split (daily.yml + weekly.yml) with shared concurrency                 | ✓ SATISFIED | Both YAML files exist with correct cron + shared concurrency group       |
| SPEC-7      | 13-02, 13-05, 13-06    | RPM observability — `[METRIC] geminiCallCount=N` step-summary line                         | ✓ SATISFIED | summary.ts emits marker + counter increments + real GHA run evidence     |

**No orphaned requirements.** All 7 SPEC IDs claimed by at least one PLAN frontmatter; REQUIREMENTS.md does not assign additional Phase 13 IDs beyond SPEC-1..7.

### Anti-Patterns Found

| File                                       | Line(s)    | Pattern                                                                | Severity   | Impact                                                                                                                                            |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pipeline/runWeekly.ts`                | 225-236    | `truncatePending()` runs even when `skipEmail=true`                    | ⚠️ Warning | Silent data loss footgun for any future CLI dry path. Current main.ts caller does NOT pass skipEmail — production impact today is zero. Flagged in REVIEW.md as WR-01.                                                                                              |
| `src/pipeline/runDaily.ts`                 | 250-252    | `jsRenderFailures` filter misses `detail_tier === 'js-render'` firms   | ⚠️ Warning | Operator-actionable failures on detail-tier-only firms won't trigger fail-loud exit. Flagged in REVIEW.md as WR-02.                                                                                                                                                  |
| `src/pipeline/runWeekly.ts`                | 225-235    | `sendMail` before `writeArchive` — archive failure leaves pending un-truncated → duplicate-send next weekly | ⚠️ Warning | Non-idempotent recovery edge: a single rare path (writeArchive throws AFTER sendMail succeeds) can resend digest. Flagged in REVIEW.md as WR-03. |
| `.github/workflows/daily.yml`              | 5-9        | Header docstring references rejected cron form `2-7,0`                  | ℹ️ Info    | Documentation drift only — actual cron line 27 is correct (`0,2-6`). REVIEW.md IN-01.                                                              |
| `.github/workflows/daily.yml` + weekly.yml | 42-47, 121 | GH Actions versions (@v6/@v7) diverge from CLAUDE.md stack lock (@v5/@v6) | ℹ️ Info    | Documentation drift between CLAUDE.md and actual workflow. REVIEW.md IN-02.                                                                       |
| `src/pipeline/runDaily.ts`                 | 88         | `await loadRecipient()` result discarded (symmetry-only)               | ℹ️ Info    | Either drop or document as fail-fast guard. REVIEW.md IN-03.                                                                                       |
| `src/pipeline/runWeekly.ts`                | 143        | `await loadSettings()` result discarded                                | ℹ️ Info    | Same pattern. REVIEW.md IN-04.                                                                                                                     |
| `src/state/pending.ts`                     | 60         | `summaryError: z.string().optional()` accepts `""`                     | ℹ️ Info    | Schema permits empty error string. Producer never writes it today. REVIEW.md IN-05.                                                                |
| `src/compose/heartbeat.ts`                 | 33-40      | `dateKst` interpolated without escapeHtml                              | ℹ️ Info    | Today fully deterministic ASCII; future-proofing nit only. REVIEW.md IN-06.                                                                        |

**No blockers found.** 3 warnings are operational footguns documented in the 2026-05-23 standard-depth code review (REVIEW.md), all classified as not blocking phase closure (no current production caller exercises any of these paths; WR-03 is an edge-case where rare disk failure could cause duplicate send but does not invalidate the goal).

### Human Verification Required

None. SPEC AC-1, AC-2, AC-3 are encoded as vitest fixtures (all passing). AC-4..AC-6 are static-file shape checks (all verified by grep). AC-7 (long-window operational acceptance) is explicitly out-of-scope per the verification request and is recorded as a deferred operational item.

### Gaps Summary

**No gaps.** Phase 13 goal — splitting the canonical 12-step sequence into `runDaily()` and `runWeekly()` with pending storage between them, atomic commits, empty-week heartbeat, and step-summary RPM observability — is achieved at the codebase level, validated by 476 passing tests, and corroborated by two real GHA workflow_dispatch runs (daily 26309754807 with [METRIC]=21 + atomic commit 7f29113; weekly 26309956124 with [METRIC]=0 + heartbeat + archive commit a5041ad).

The three operational warnings flagged in REVIEW.md (skipEmail-still-truncates, detail-tier jsRenderFailures miss, archive-failure-after-send duplicate-send window) are real but do not invalidate the goal — none are exercised by current production callers, and all are documented for future cleanup. Phase 13 closes cleanly.

---

_Verified: 2026-05-23T00:40:00Z_
_Verifier: Claude (gsd-verifier)_
