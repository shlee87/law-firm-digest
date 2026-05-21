# Phase 13: 매일 스크래핑 + 주 1회 이메일 발송 분리 (Gemini RPD 분산) — Specification

**Created:** 2026-05-20
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

`src/pipeline/run.ts` 의 12-step canonical sequence 를 두 entry point 로 분리한다 — `daily` 는 화~일 매일 fetch+enrich+filter+dedup+summarize 까지 수행해 결과를 `state/pending.json` 에 누적하고, `weekly` 는 월요일 1회 pending 을 읽어 compose+send+archive 하고 pending 을 truncate 한다. 그 결과 Gemini API 호출이 7일에 분산되어 단일 weekly run 의 RPM bottleneck (10 RPM × 50–100 items = 5–10분 + 429 위험) 이 daily 당 평균 ≤ 15 호출로 떨어진다.

## Background

**Current state (2026-05-20):**
- `.github/workflows/daily.yml` cron 이 `0 12 * * 1` (월요일 1회) 로 설정되어 있고 `config/settings.yaml` 의 `schedule.days: weekly` 와 sync 되어 있다 (2026-04-23 caf74f0).
- `src/pipeline/run.ts` 는 단일 transaction 으로 12-step 전체 (fetch → enrich → filter → dedup → summarize → compose → send → archive → state) 를 한 run 안에서 실행한다.
- `src/main.ts` (cron entry) 와 `src/cli/checkFirm.ts` (dev entry) 모두 같은 `runPipeline()` 를 호출하고 옵션 flag 로만 분기한다 (Phase 3 D-09).
- `state/seen.json` 만 존재 (v1 schema, 500-cap/firm, URL 리스트 only). "요약은 끝났지만 아직 안 보낸 아이템" 개념이 없다 — 요약은 메모리에만 머문다.
- Volume 측정: 9개 enabled firm × 주 5.5–11 items/firm ≈ **주 50–100 items** (사용자 직접 확인, archive 기반).
- Gemini constraint: `gemini-2.5-flash` = 10 RPM / 250 RPD, `gemini-2.5-flash-lite` = 15 RPM / 1,000 RPD fallback.

**The gap:**
- 현재 weekly cron 으로 묶여 있어 월요일 단일 run 에 50–100 호출이 한꺼번에 발생 → RPM 10/min 으로 5–10분 소요 + 중간에 429 retry 폭증 위험.
- daily 분산 으로 호출당 평균 ~ 7–15 호출 / day 로 떨어지면 RPM ceiling 안에서 90초 안에 끝나고 RPD 도 안전한 여유가 생긴다.
- 이를 위해 필요한 것: (a) pipeline 의 8–12 단계를 daily 에서 분리, (b) summarize 결과를 7일 동안 들고 갈 `state/pending.json` storage, (c) workflow 파일 2개 (`daily.yml` + `weekly.yml`) 와 mode flag 한 entry 또는 분리 entry, (d) pending+seen 의 atomic git commit 으로 race 방지.

## Requirements

1. **Daily entry point**: 화~일 매일 fetch+enrich+filter+dedup+summarize 까지 수행하고 pending 에 append.
   - Current: `pnpm dev` (또는 cron) 가 `runPipeline()` 호출해 12-step 전체 1회 실행. summarize 결과는 메모리에만 존재했다가 send 후 사라짐.
   - Target: `pnpm tsx src/main.ts --mode=daily` (또는 동등) 가 1~7 단계만 수행하고 결과 `SummarizedItem[]` 를 `state/pending.json` 에 append. 8–12 (compose+send+archive+stepSummary+state) 는 실행하지 않음.
   - Acceptance: vitest fixture 에서 fetched 3-item 입력 → pending.json 의 `items` 배열 길이가 +3 되고 각 entry 에 `summarizedAt: ISO8601` 가 박혀 있고, sendMail mock 호출 횟수 = 0, writeArchive mock 호출 횟수 = 0.

2. **Weekly entry point**: 월요일 1회 pending 을 읽어 compose+send+archive 하고 pending 을 truncate.
   - Current: 동일 `runPipeline()` 이 8–12 단계 (compose+send+archive+stepSummary+state) 를 12-step transaction 의 일부로 수행. pending 개념 없음.
   - Target: `pnpm tsx src/main.ts --mode=weekly` 가 fetch/summarize 단계 건너뛰고 pending.json 의 `items` 만 읽어 composeDigest → sendMail → writeArchive → pending.items truncate → writeState 수행.
   - Acceptance: vitest fixture 에서 pending 5건 초기 상태 → mode=weekly run → sendMail mock 1회 호출 (5건 포함), writeArchive mock 1회 호출, run 종료 후 pending.json 의 `items.length === 0` 이고 `windowStart` 가 새 시각으로 갱신.

3. **Pending storage schema**: `state/pending.json` 이 명시적 v1 schema 로 정의되고 시작 시 zod 검증.
   - Current: 파일 자체 부재. 요약 결과 누적할 곳 없음.
   - Target: `state/pending.json` 가 `{ version: 1, windowStart: string (ISO8601), items: SummarizedItem[] }` shape. zod 스키마가 `src/state/pendingTypes.ts` (또는 동등 위치) 에 정의되어 시작 시 검증. 잘못된 shape 는 정확한 JSON path 와 함께 fail-fast.
   - Acceptance: vitest 가 (a) valid pending.json 로딩, (b) `version: 2` 시 명시적 `STATE_VERSION_DRIFT` 에러, (c) `items[0].summaryModel` 누락 시 zod 경로 포함 에러 — 3 케이스 모두 expected.

4. **Atomic commit invariant**: daily run 의 git commit 은 `pending.json` 과 `seen.json` 을 하나의 commit 으로 묶는다.
   - Current: `git-auto-commit-action@v6` 가 `state/seen.json` (+ 일부 archive) 만 commit. pending 개념 없음.
   - Target: daily.yml 의 commit step 이 `file_pattern: state/pending.json state/seen.json` 으로 두 파일 동시 commit. summarize 직후 pending 에 쓰기 전에 runner 가 죽으면 양쪽 다 안 쓰임 (다음 run 이 동일 입력 재처리 = idempotent recovery).
   - Acceptance: GHA workflow log grep 이 daily commit 메시지마다 `state/pending.json` 와 `state/seen.json` 두 변경을 동시에 포함하는지 확인 (또는 unit-level: `commit()` helper 가 두 path 를 함께 stage 하는지).

5. **Empty week heartbeat**: weekly run 시 pending.items.length === 0 이라도 이메일 발송.
   - Current: DEDUP-03 = "신규 하나라도 있는 날에만 발송" (silent day 룰).
   - Target: weekly cadence 의 DEDUP-03 override. pending 0건 시 `[법률 다이제스트] YYYY-MM-DD (이번 주 신규 없음)` 제목으로 heartbeat 발송. 시스템이 살아있다는 신호 + footer 의 failed-firm/DQOBS marker 는 여전히 전달.
   - Acceptance: vitest fixture 에서 pending 0건 → weekly run → sendMail mock 1회 호출, subject 가 `(이번 주 신규 없음)` 또는 동등 마커 포함.

6. **GHA workflow 2-file split**: `daily.yml` + `weekly.yml` 분리, 각각 단일 cron + 단일 mode.
   - Current: 단일 `daily.yml` (cron `0 12 * * 1`), 단일 entry `tsx src/main.ts`.
   - Target: `daily.yml` (cron `0 12 * * 2-7,0`, entry `tsx src/main.ts --mode=daily`), `weekly.yml` (cron `0 12 * * 1`, entry `tsx src/main.ts --mode=weekly`). 양쪽 모두 `workflow_dispatch: {}` 유지하여 manual 트리거 는 workflow 별 동작 (daily.yml dispatch = daily mode, weekly.yml dispatch = weekly mode). `concurrency: digest-pipeline` group 은 두 workflow 가 공유 (seen.json 충돌 방지).
   - Acceptance: `.github/workflows/daily.yml` 의 cron line grep = `'0 12 * * 2-7,0'`, `.github/workflows/weekly.yml` 의 cron line grep = `'0 12 * * 1'`, 두 파일 모두 `concurrency: digest-pipeline` 와 `workflow_dispatch: {}` 포함.

7. **RPM 분산 관측 가능성**: daily run 당 Gemini 호출 횟수가 GHA step-summary 또는 로그에 명시되어 사후 검증 가능.
   - Current: Phase 10 DQOBS 가 per-firm 메트릭은 출력하지만 "이 run 에서 Gemini 를 몇 번 불렀나" 의 단일 숫자는 직접 표시되지 않음.
   - Target: `Recorder` (또는 동등 observability) 가 `geminiCallCount` 를 record 하고 step-summary table 의 top line 또는 별도 metric row 로 출력. weekly run 의 `geminiCallCount` 는 0 (compose+send 만).
   - Acceptance: 실제 GHA workflow_dispatch 일주일 dry 실행 후 — daily run 의 `geminiCallCount` 평균 ≤ 15, 최대 ≤ 50; weekly run 의 `geminiCallCount` === 0. GHA log grep 가능 마커 `[METRIC] geminiCallCount=N`.

## Boundaries

**In scope:**
- `pnpm tsx src/main.ts --mode=daily|weekly` mode flag 와 main.ts 의 mode 분기
- `runPipeline()` 의 daily-path / weekly-path 분기 (또는 두 함수로 추출)
- `state/pending.json` 신규 파일, zod schema, reader/writer 모듈
- `.github/workflows/daily.yml` cron 변경 (`0 12 * * 2-7,0`) + entry 에 `--mode=daily` 추가
- `.github/workflows/weekly.yml` 신규 파일 (cron `0 12 * * 1`, entry `--mode=weekly`)
- daily commit step 의 `file_pattern` 에 `state/pending.json` 추가 (seen.json 과 atomic)
- `Recorder` 에 `geminiCallCount` 카운터 추가 + step-summary line
- weekly empty heartbeat 메일 (DEDUP-03 override) + 제목 마커
- vitest 4개 시나리오: AC-2 (daily e2e), AC-3 (weekly e2e), AC-3 변형 (empty week heartbeat), schema validation

**Out of scope:**
- `config/settings.yaml` 의 `schedule.days: weekly` 정의 자체 — 이미 sync 되어 있고 Phase 13 은 cron 분리만 다룸 (의미 변경은 다음 phase 후보)
- `pnpm sync-schedule` 스크립트 확장 — daily/weekly 분리 후 settings.yaml → 두 workflow sync 는 별도 phase (이번엔 수동으로 2개 cron 동기)
- "수요일 daily 만 돌리고 싶다" 같은 day-of-week 선택 UI — settings.yaml 의 `days` field 확장은 별도 phase
- Gemini 호출의 fine-grained rate-limit 제어 (현재 `p-limit(3)` 유지 — 분산 자체로 충분)
- pending 의 별도 archive (`state/pending-sent/YYYY-WW.json`) — archive/ HTML 과 중복이므로 제외, send 후 단순 truncate
- weekly send 실패 시 retry workflow — 기존 SMTP retry (EMAIL-07) 와 fail-loud 그대로 사용
- 새 firm 이 주중에 추가되었을 때의 bootstrap 특수 처리 — Phase 1 의 DEDUP-05 first-run bootstrap 룰이 daily entry 에서 자동 작동
- pending.json 의 schema migration (v1 → v2) — 현재 v1 만 정의, 미래 migration 은 별도 phase

## Constraints

- Gemini call concurrency 는 기존 `p-limit(3)` 유지 (`config/settings.yaml`'s `gemini.concurrency: 3`).
- daily run 시간 ≤ 90초 목표 (현재 weekly 가 5–10분 걸릴 수 있는 것 대비).
- `state/pending.json` 파일 크기 ≤ 100KB (100 items × ~1KB summary metadata).
- `concurrency: digest-pipeline` group 은 daily.yml 과 weekly.yml 이 **공유**해야 함 — 월요일 02:00 KST daily (일요일 23:00 UTC = `* * 0`) 와 09:00 KST weekly 가 같은 seen.json/pending.json 을 쓸 수 있어 race 가능. cancel-in-progress: false 유지.
- 모든 git commit 메시지에 `[skip ci]` 포함 (기존 DEDUP-06 룰).
- 모든 mode 분기는 main.ts 의 first-import-after-dotenv 위치 (gemini.ts fail-loud 보존).
- Acceptance AC-4 (RPM 관측) 는 manual workflow_dispatch 일주일 dry 실행이 필요하므로 verify 단계에서 사용자 수동 검증 필요 — automated CI 로는 vitest fixture 까지만.

## Acceptance Criteria

- [ ] `pnpm tsx src/main.ts --mode=daily` 가 sendMail mock 호출 0, writeArchive mock 호출 0, pending.json items 길이 입력 신규 수만큼 증가, seen.json urls 도 동일 수만큼 증가
- [ ] `pnpm tsx src/main.ts --mode=weekly` 가 pending.items === 5 초기 → sendMail 1회 (5건 포함) → writeArchive 1회 → pending.items === 0 → windowStart 갱신
- [ ] `pnpm tsx src/main.ts --mode=weekly` 가 pending.items === 0 초기 → sendMail 1회 (heartbeat 마커 포함 subject) → writeArchive 1회
- [ ] `state/pending.json` 의 잘못된 shape (version: 2, items[0].summaryModel 누락 등) 가 시작 시 zod path 포함 에러 발생 — 3 케이스 모두 vitest covered
- [ ] `.github/workflows/daily.yml` 의 cron === `'0 12 * * 2-7,0'`, entry === `tsx src/main.ts --mode=daily`, file_pattern 에 `state/pending.json` 와 `state/seen.json` 포함
- [ ] `.github/workflows/weekly.yml` 신규 존재, cron === `'0 12 * * 1'`, entry === `tsx src/main.ts --mode=weekly`, concurrency group === `digest-pipeline`
- [ ] `pnpm vitest run` pass — 신규 시나리오 4개 포함하여 기존 테스트 전부 green
- [ ] manual workflow_dispatch 로 일주일 daily + 1 weekly run 후 GHA log grep `[METRIC] geminiCallCount=` 의 daily 평균 ≤ 15, weekly === 0

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                 |
|--------------------|-------|------|--------|-----------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Split point + storage + workflow file structure all locked            |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Explicit out-of-scope list (8 items, sync-schedule 등 후속 phase로 분리)  |
| Constraint Clarity | 0.80  | 0.65 | ✓      | RPM 10/min, RPD 250, p-limit(3), 90초 budget, file size cap 명시          |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 8 pass/fail (1 은 manual workflow_dispatch 검증, 나머지는 vitest/grep)     |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      |                                                                       |

## Interview Log

| Round | Perspective              | Question summary                                          | Decision locked                                                                              |
|-------|--------------------------|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| 1     | Researcher               | Phase trigger 와 volume?                                  | RPM bottleneck 분산 / 주 50–100 items                                                          |
| 2     | Researcher + Simplifier  | Pipeline split point + pending storage 위치?              | C (daily=1~7+seen+pending, weekly=8~12) / 신규 `state/pending.json`                            |
| 3     | Boundary Keeper          | Workflow file 구조? Manual dispatch? Empty week?         | 2-file split (daily.yml + weekly.yml) / 워크플로우별 동작 / heartbeat 메일 발송 (DEDUP-03 override) |
| 4     | Failure Analyst          | Race (commit 도중 죽음)? Acceptance criteria 조합?       | pending+seen atomic git commit / AC-1+AC-2+AC-3+AC-4 모두                                       |

---

*Phase: 13-1-gemini-rpd*
*Spec created: 2026-05-20*
*Next step: /gsd:discuss-phase 13 — implementation decisions (mode flag 형식, Recorder geminiCallCount 위치, pending reader/writer module 경계 등)*
