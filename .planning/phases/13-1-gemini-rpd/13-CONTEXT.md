# Phase 13: 매일 스크래핑 + 주 1회 이메일 발송 분리 (Gemini RPD 분산) - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

`src/pipeline/run.ts`의 12-step canonical sequence를 두 entry point로 분리한다. Daily (화~일)는 fetch+enrich+filter+dedup+summarize까지 수행해 결과를 `state/pending.json`에 누적하고, Weekly (월요일)는 pending을 읽어 compose+send+archive 후 pending을 truncate한다. 결과적으로 Gemini API 호출이 7일에 분산되어 단일 weekly run의 RPM bottleneck이 daily당 평균 ≤ 15 호출로 떨어진다.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7개 requirements가 잠겨 있습니다.** 전체 requirement 정의, boundary, acceptance criteria는 `13-SPEC.md` 참조.

Downstream agents (gsd-phase-researcher, gsd-planner)는 planning/implementing 전에 반드시 `13-SPEC.md`를 읽어야 합니다. Requirements는 여기 중복되지 않습니다.

**In scope (from SPEC.md):**
- `pnpm tsx src/main.ts --mode=daily|weekly` mode flag와 main.ts의 mode 분기
- `runPipeline()`의 daily-path / weekly-path 분기 (또는 두 함수로 추출)
- `state/pending.json` 신규 파일, zod schema, reader/writer 모듈
- `.github/workflows/daily.yml` cron 변경 (`0 12 * * 2-7,0`) + entry에 `--mode=daily` 추가
- `.github/workflows/weekly.yml` 신규 파일 (cron `0 12 * * 1`, entry `--mode=weekly`)
- daily commit step의 `file_pattern`에 `state/pending.json` 추가 (seen.json과 atomic)
- `Recorder`에 `geminiCallCount` 카운터 추가 + step-summary line
- weekly empty heartbeat 메일 (DEDUP-03 override) + 제목 마커
- vitest 4개 시나리오: AC-2 (daily e2e), AC-3 (weekly e2e), AC-3 변형 (empty week heartbeat), schema validation

**Out of scope (from SPEC.md):**
- `config/settings.yaml`의 `schedule.days: weekly` 정의 자체
- `pnpm sync-schedule` 스크립트 확장
- day-of-week 선택 UI
- Gemini 호출의 fine-grained rate-limit 제어 (현재 `p-limit(3)` 유지)
- pending의 별도 archive
- weekly send 실패 시 retry workflow
- 새 firm bootstrap 특수 처리
- pending.json의 schema migration (v1 → v2)

</spec_lock>

<decisions>
## Implementation Decisions

### Pipeline 분기 구조

- **D-01:** `runPipeline()`을 `runDaily()` + `runWeekly()` 두 함수로 분리한다 (옵션 B). 단일 함수 + mode 옵션이 아님. 이유: (a) SPEC.md 본문이 "두 entry point로 분리"라고 명시, (b) Daily와 Weekly는 같은 일의 모드 변형이 아니라 도메인이 다른 두 작업 (fetch+summarize vs compose+send), (c) 타입 시스템이 cross-mode invariant 강제 — `runDaily`는 `sendMail`을 import도 안 함, `runWeekly`는 `fetchAll`을 import도 안 함, (d) solo dev cognitive load: 각 파일 ~100~120줄로 머리에 담기 쉬움.
- **D-02:** Shared setup helper는 `prepareRun()` 또는 작은 중복 허용. Solo project 컨텍스트에서 premature abstraction 회피 (CLAUDE.md "Three similar lines is better than a premature abstraction" 원칙). 실제 작성 시 7~8줄짜리 setup이 두 함수 모두에 필요하면 helper로 추출, 더 적으면 inline 허용.
- **D-03:** `src/cli/checkFirm.ts`는 Phase 3 D-09 패턴 유지하되, 내부적으로 `runDaily()`를 재사용한다 (check:firm은 개념적으로 daily의 dry-run 모드). `runPipeline()` 그 자체를 import하던 부분 → `runDaily({skipGemini: true, ...})`로 변경.

### Mode flag 파싱 + default 동작

- **D-04:** Mode flag 없이 `pnpm tsx src/main.ts` 호출 시 → `process.exit(2)` + `Usage: --mode=daily|weekly` 메시지로 fail-fast. 이유: aggressive failure detection 원칙. 수동 dispatch에서 mode 빼먹은 실수가 조용히 daily/weekly로 흘러가 메일 안 나가는 silent failure 방지.
- **D-05:** `package.json` scripts 업데이트:
  - `dev`: `tsx src/main.ts --mode=daily` (기존 → 명시적 daily)
  - `dev:weekly`: `tsx src/main.ts --mode=weekly` (신규)
  - `dry-run`은 daily 기준 유지 (`DRY_RUN=1 tsx src/main.ts --mode=daily`); weekly용은 필요 시 추가
- **D-06:** argv 파싱은 `checkFirm.ts`의 hand-rolled `parseArgs(argv)` 패턴 재사용. Node `util.parseArgs`는 도입하지 않음 (codebase 일관성 우선). `--mode=daily` 와 `--mode daily` 양쪽 형식 모두 허용.

### Pending storage 모듈 + PendingItem shape

- **D-07:** `PendingItem`은 `SummarizedItem`을 그대로 재사용하지 않고 별도 타입으로 정의한다. 이유: (a) `SummarizedItem.description` (=본문)이 디스크에 박히면 COMP-05 ("뉴스레터 전문 저장·재배포 금지") 위반, (b) `isClusterMember`는 runtime-only (types.ts 주석에 "MUST NOT be persisted" 명시), (c) 타입 시스템이 이 invariant를 강제 — 누가 실수로 `JSON.stringify(summarizedItem)`을 못 함. 변환 함수 `toPendingItem(s: SummarizedItem, now: Date): PendingItem`을 거쳐야만 디스크 도달.

  ```typescript
  export interface PendingItem {
    firmId: string;
    title: string;
    url: string;
    publishedAt?: string;
    language: Language;
    summary_ko: string | null;
    summaryConfidence: 'high' | 'medium' | 'low';
    summaryModel: string;
    summaryError?: string;
    summarizedAt: string;  // ISO8601 — daily run이 박는 시각
    // description, isClusterMember, isNew 의도적 부재
  }

  export interface PendingState {
    version: 1;
    windowStart: string;   // ISO8601 — pending window 시작 시각
    items: PendingItem[];
  }
  ```

- **D-08:** Pending 모듈은 `src/state/pending.ts` 단일 파일. seen.json의 `reader.ts`+`writer.ts` 분리 패턴은 따라가지 않는다. 이유: (a) pending은 항상 read+write가 함께 쓰임 (daily: read→append, weekly: read→truncate) — atomic invariant가 한 파일에서 한눈에 보여야 함, (b) seen 분리는 reader 38줄 + writer 153줄 양쪽 다 큰 모듈이기 때문이었고, pending은 그렇지 않음, (c) solo project file count 최소화.
- **D-09:** Pending API: `readPending()`, `appendPending(items)`, `truncatePending()` 세 개만 export. `writePending(state)`는 노출 안 함. 이유: 호출자가 windowStart를 직접 만질 길 차단. `appendPending`은 windowStart 보존하고 items만 push, `truncatePending`은 windowStart를 `new Date().toISOString()`로 리셋하면서 items=[].
- **D-10:** zod schema (`PendingItemSchema`, `PendingStateSchema`)는 `src/state/pending.ts` 내부에 정의. 별도 `pendingSchema.ts` 파일 안 만듦. SPEC AC-3은 "zod 스키마가 src/state/pendingTypes.ts (또는 동등 위치)"라 명시 — "동등 위치"로 pending.ts 채택. type + schema가 한 파일에 있으면 maintenance 시 한눈에 일치 확인 가능.
- **D-11:** Cold-start / ENOENT 처리: 기존 `state/reader.ts` 패턴 mirror. ENOENT → DEFAULT 반환 (`{version:1, windowStart: new Date().toISOString(), items:[]}`). 그 외 모든 에러 (bad JSON, version drift, zod fail) → throw로 fail-loud.

### Cluster/LowConfidence detection 위치

- **D-12:** `detectHallucinationClusters` + `detectLowConfidence`는 **weekly에만** 실행한다. Daily에서 호출 안 함. 이유: daily는 firm당 평균 1~2건만 처리 → cluster 검출 임계값(3+) 절대 미달 → daily detection은 영구히 0건 (무력). Weekly가 한 주치 누적 (firm당 5~12건) 보고 cluster 잡는 게 Phase 8 GUARD-03 원래 의도 ("simulated bkl batch where 5 items share..."). Daily 흐름에서 detector 코드 자체 제거.
- **D-13:** `markers` (`DataQualityMarker[]`)는 `pending.json`에 저장하지 않는다. Weekly run마다 readPending → detectHallucinationClusters → detectLowConfidence로 재계산. 이유: (a) detector는 pure function, 50~100건 처리에 <10ms — 캐싱 가치 없음, (b) pending.json schema 단순 유지 (저장 불필요한 정보는 두지 않음), (c) "지난 주 markers가 잘못 박혀 이번 주에 따라옴" 같은 stale bug 가능성 원천 차단.
- **D-14:** `restoreFirmsFromPending(pending: PendingState, allFirms: FirmConfig[]): FirmResult[]` helper 추가. PendingItem들을 firmId로 grouping해 `r.summarized`에 채우고, `r.raw`/`r.new`는 `[]`, `r.firm`은 firms.yaml lookup. 이유: 기존 `detectHallucinationClusters` / `detectLowConfidence` / `composeDigest` 시그니처를 손대지 않고 재사용. Phase 8/10에서 안정화된 detector 코드 그대로 유지. Generic 리팩터링은 변경 표면 너무 큼 (detector 2개 + composeDigest + 6개 테스트 파일).

### Empty-week heartbeat 합성

- **D-15:** 별도 `composeHeartbeat(recipient, fromAddr, now): EmailPayload` 함수 작성. `composeDigest()` 손 안 댐. 이유: composeDigest는 이미 분기 많음 (warnings, markers, failed-firms) — heartbeat 분기 끼우면 가독성 저하. Heartbeat은 본질적으로 단순 (subject + 2~3줄 body)이라 별도 함수가 자연스러움. composeDigest의 test snapshot 안 깨짐.
- **D-16:** Heartbeat subject: `[법률 다이제스트] {YYYY-MM-DD} (이번 주 신규 없음)`. EMAIL-04 prefix `[법률 다이제스트]` 유지 (스팸 필터 안정). `(N firms, M items)` 자리에 `(이번 주 신규 없음)` 마커. 날짜는 KST 기준 (composeDigest와 동일하게 `formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd')`).
- **D-17:** Heartbeat body: 최소한만.
  ```html
  <h1>법률 다이제스트 — {YYYY-MM-DD}</h1>
  <p>이번 주 새 뉴스레터가 없습니다.</p>
  <p>시스템은 정상 작동 중입니다.</p>
  ```
  Failed-firm footer / DQOBS markers는 의도적 부재. Weekly run에서는 fetch 안 함 → 에러 firm 없음, items 0건 → marker 생성 불가능.

### geminiCallCount 계측

- **D-18:** `src/summarize/gemini.ts`에 module-level counter 도입.
  ```typescript
  let geminiCallCount = 0;
  export function getGeminiCallCount(): number { return geminiCallCount; }
  export function resetGeminiCallCount(): void { geminiCallCount = 0; }
  ```
  실제 `ai.models.generateContent({...})` 호출 직전마다 `geminiCallCount++`. 이유: (a) fallback (`gemini-2.5-flash` → `gemini-2.5-flash-lite`) 호출도 RPD quota 소비 → 둘 다 카운트 필요, (b) p-retry 내부 재시도도 자동 포함, (c) post-summarize tally (`summaryModel`만 보고 추정)는 fallback이 일어난 아이템 1개를 1로 셈 → 부정확. Daily 50건 cap이 RPD 250/일 cap에 근접하므로 정확도 중요.
- **D-19:** `runDaily()` 시작 시 `resetGeminiCallCount()` 호출, 끝나기 직전에 `getGeminiCallCount()` 읽어 step-summary로 전달. `runWeekly()`도 동일하게 reset/read (weekly에서는 Gemini 호출 안 하므로 항상 0).
- **D-20:** Module-level state는 보통 anti-pattern이지만, 여기서는 단일 process 단일 run lifecycle 안에서만 사용 + test가 매번 `resetGeminiCallCount()` 호출로 격리 → 안전. Recorder에 주입하는 대안(`summarize(item, body, models, prompt, recorder)`)은 호출자 chain까지 recorder 들고 내려가야 해서 변경 표면 큼.

### Step-summary 출력 형식

- **D-21:** `geminiCallCount`는 마크다운 테이블 **위쪽 첫 줄**에 출력.
  ```markdown
  [METRIC] geminiCallCount=12

  | firm | fetched | new | summarized | ... |
  ```
  이유: (a) AC-7 grep marker `[METRIC] geminiCallCount=N` 그대로 매치, (b) 시각적으로 가장 위에 → 운영자가 가장 먼저 확인하는 신호.
- **D-22:** Daily와 Weekly 둘 다 [METRIC] 출력. Weekly는 항상 `0`. AC-7 명시: "weekly run의 geminiCallCount === 0".

### Pending 파일 atomic commit

- **D-23:** GHA workflow의 git-auto-commit-action step에서 daily는 `file_pattern: 'state/pending.json state/seen.json'` (공백 구분), weekly는 `file_pattern: 'state/pending.json state/seen.json archive/**/*.html'`. 양쪽 모두 atomic commit (단일 commit에 두 state 파일 동시 포함). 이유: SPEC AC-4. summarize 직후 pending 쓰기 전에 runner가 죽으면 양쪽 다 안 쓰여 idempotent recovery.

### Claude's Discretion

- composeHeartbeat HTML 정확한 스타일링 (font-size, color 등) — 단순 inline style 사용 권장
- `restoreFirmsFromPending`에서 firmId에 해당하는 firm이 firms.yaml에서 없어진 경우 처리 (예: 사용자가 firm 비활성화 후 weekly 실행) — 가장 안전: 해당 PendingItem 무시하고 warn 로그
- `prepareRun()` helper를 진짜 만들지 inline 중복을 허용할지는 plan 단계에서 실측 후 결정
- `--mode=daily --firm=cooley` 같은 조합 처리 (CLI dev path) — checkFirm.ts와의 옵션 충돌 방지 전략

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/13-1-gemini-rpd/13-SPEC.md` — Phase 13의 7개 requirements, boundaries, constraints, acceptance criteria (전부 locked)

### Pipeline architecture
- `src/pipeline/run.ts` — 현재 `runPipeline()` 12-step canonical sequence; Phase 13에서 `runDaily()` + `runWeekly()`로 추출 대상
- `src/main.ts` — 현재 cron entry point; mode flag 파싱 + dispatch 추가 대상
- `src/cli/checkFirm.ts` — `parseArgs(argv)` 패턴 (D-06에서 재사용); `runPipeline()` 호출부 → `runDaily()`로 마이그레이션 (D-03)
- `.planning/phases/01-foundation-vertical-slice/01-11-PLAN.md` — Phase 1 OPS-03 run-transaction ordering (`fetch → dedup → summarize → email → state`); D-01 split에서 이 순서 보존 필수

### State / pending storage
- `src/state/reader.ts` — seen.json reader, ENOENT 처리 + version guard 패턴 (D-11에서 mirror)
- `src/state/writer.ts` — seen.json writer, atomic tmp+rename + DRY_RUN gate 패턴 (pending.ts에서 mirror)
- `src/types.ts` — `SummarizedItem`, `SeenState`, `FirmResult` 타입 정의; `PendingItem`/`PendingState`를 여기 또는 `src/state/pending.ts`에 추가
- COMP-05 (REQUIREMENTS.md §COMP) — "뉴스레터 전문 저장·재배포 금지"; D-07 별도 PendingItem 타입의 근거

### Detection (Phase 8 + Phase 10)
- `src/pipeline/detectClusters.ts` — `detectHallucinationClusters` 함수, `DataQualityMarker` 타입; D-12에서 weekly로 이동
- `src/pipeline/detectLowConfidence.ts` — `detectLowConfidence` 함수; D-12에서 weekly로 이동
- `.planning/phases/08-hallucination-guard/08-CONTEXT.md` — GUARD-01..04 결정, cluster threshold = 3 고정값 (D-12에서 weekly cumulative batch에 적용)
- `.planning/phases/10-data-quality-observability/10-CONTEXT.md` — DQOBS-01..03, Recorder 확장 패턴 (D-18 geminiCallCount이 동일 패턴 따라감)

### Compose / email
- `src/compose/digest.ts` — `composeDigest()` 시그니처; D-14 `restoreFirmsFromPending`이 이 시그니처에 맞춰 변환, D-15 `composeHeartbeat`은 이와 별도 함수
- EMAIL-04 (REQUIREMENTS.md §EMAIL) — subject 패턴 `[법률 다이제스트] YYYY-MM-DD (...)`; D-16 heartbeat subject가 이 prefix 유지
- DEDUP-03 (REQUIREMENTS.md §DEDUP) — "신규 하나라도 있는 날에만 발송" silent-day 룰; weekly에서는 D-15 heartbeat로 override (SPEC §Requirement 5)

### Observability
- `src/observability/recorder.ts` — `Recorder` 클래스, `FirmMetrics` 인터페이스; geminiCallCount는 별도 module-level (D-18) — Recorder에 추가하지 않음
- `src/observability/summary.ts` — `writeStepSummary` (`$GITHUB_STEP_SUMMARY` append), `renderMarkersMarkdown`; D-21 `[METRIC] geminiCallCount=N` 라인 추가 위치

### GHA workflows
- `.github/workflows/daily.yml` — 현재 cron `0 12 * * 1` (월요일), entry `tsx src/main.ts`; cron을 `0 12 * * 2-7,0`로 변경 + entry에 `--mode=daily` 추가 + file_pattern에 `state/pending.json` 추가 (D-23)
- `.github/workflows/weekly.yml` — 신규 파일, cron `0 12 * * 1`, entry `tsx src/main.ts --mode=weekly`, file_pattern에 pending+seen+archive (D-23). `concurrency: digest-pipeline` group은 daily와 공유 (SPEC constraint)
- `config/settings.yaml` — `schedule.cron`은 SPEC §Out of scope (현재 weekly로 sync되어 있으나 Phase 13에서 의미 변경은 다음 phase)

### Prior Phase decisions
- Phase 3 D-09 — cron과 CLI가 `runPipeline()` 공유; D-01/D-03에서 부분 계승 (CLI → `runDaily()`)
- Phase 1 plan 11 — `[skip ci]` 룰, atomic-ish writeState; D-23 atomic commit에 적용
- Phase 10 D-07 — `renderMarkersMarkdown` shared between DRY_RUN stdout과 step-summary; D-21에서 동일 helper 패턴 적용 가능

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/state/reader.ts` / `writer.ts` 패턴**: ENOENT → DEFAULT, version guard throw, atomic tmp+rename, DRY_RUN gate — `src/state/pending.ts`가 그대로 mirror (D-08, D-11)
- **`src/cli/checkFirm.ts` `parseArgs(argv)` 패턴**: hand-rolled argv 파싱, exit code 2 = usage error — `src/main.ts`의 mode flag 파싱에 재사용 (D-06)
- **`src/observability/summary.ts` `writeStepSummary`**: `$GITHUB_STEP_SUMMARY` env-gated append, `renderMarkersMarkdown` helper — `[METRIC] geminiCallCount=N` 라인 prepend 추가 위치 (D-21)
- **`src/compose/digest.ts` `composeDigest`**: 기존 시그니처 유지, `restoreFirmsFromPending`이 PendingItem → FirmResult[] 변환해 그대로 흘려 보냄 (D-14)
- **`src/pipeline/detectClusters.ts` + `detectLowConfidence.ts`**: pure function, signature 그대로 weekly path에서 호출 (D-12)
- **`date-fns-tz` `formatInTimeZone`**: composeDigest와 archive writer에서 이미 KST 포맷용으로 사용 중 — composeHeartbeat (D-16)에서도 동일 idiom

### Established Patterns

- **12-step canonical sequence 주석**: `run.ts` 헤더에 fail-loud + run-transaction ordering 설명. Phase 13에서 두 파일(`runDaily.ts` + `runWeekly.ts`)로 분할되어 각자의 sequence comment를 가짐
- **REPLACE-NOT-ACCUMULATE in Recorder**: `recorder.firm(id).fetched(n)`은 replace; module-level `geminiCallCount`는 ACCUMULATE (단일 run lifecycle 안에서) — 다른 의미론이라 Recorder에 안 넣음 (D-20)
- **DRY_RUN 4-site containment**: gmail.ts, state/writer.ts, archive/writer.ts, main.ts. Phase 13의 `pending.ts`도 DRY_RUN gate 필요 (writeFile 부분만, 계산은 그대로 실행). 추가 시 Pattern 2 containment 주석 갱신
- **`[skip ci]` in commit messages**: Phase 13 daily.yml + weekly.yml 모두 보존 (DEDUP-06)
- **`concurrency: digest-pipeline, cancel-in-progress: false`**: daily.yml + weekly.yml 양쪽이 공유 group → seen.json/pending.json 동시 쓰기 race 차단

### Integration Points

- **`src/main.ts`**: 현재 `runPipeline()` 직접 호출. Phase 13에서 `parseArgs` → `if (mode === 'daily') runDaily() else runWeekly()` 분기 + fail-fast on missing mode
- **`src/cli/checkFirm.ts`**: `runPipeline` import → `runDaily` import로 변경, options 매핑 조정 (D-03)
- **`scripts/sync-schedule.ts`** (있다면): SPEC out-of-scope — Phase 13에서 손대지 않음. 다음 phase 후보
- **`package.json` scripts**: `dev` 의미 변경 (D-05). README 업데이트 필요 시 backlog 추가

</code_context>

<specifics>
## Specific Ideas

- **Test fixture 재사용**: 기존 Phase 8 GUARD-03 fixture (5건 같은 prefix bkl batch)를 weekly path 테스트에 그대로 흘려보낼 수 있음 — pending.json에 5건 채우고 `runWeekly()` 호출 → markers 검증
- **manual workflow_dispatch**: SPEC AC-7의 "manual workflow_dispatch 일주일 dry 실행"은 자동 CI로 검증 불가 → 일주일치 manual trigger 후 GHA log에서 `[METRIC] geminiCallCount=` grep으로 평균/최대 검증. 사용자 수동 검증 필요한 acceptance criterion으로 분리 표시
- **Empty heartbeat 자주 발생할 가능성**: 사용자 직접 측정에서 주 50~100 items였으나 일부 firm은 일주일에 0건. 1년 중 명절/연휴 주는 pending 매우 소량 가능 → heartbeat 본문이 너무 빈약하면 어색할 수 있으므로 향후 "다음 daily 예정 시각" 정도 추가 여지 (D-17 minimal 시작, 운영 중 폴리시)
- **gemini.ts module-level counter 테스트**: `beforeEach(resetGeminiCallCount)` 패턴으로 격리. Vitest의 `vi.isolate`나 `vi.resetModules()` 까지는 필요 없을 듯

</specifics>

<deferred>
## Deferred Ideas

- **`config/settings.yaml`의 `schedule.days: weekly` 의미 변경**: 현재 sync된 상태 (월요일 weekly cron)지만 Phase 13 이후 cron이 2개로 갈라지면서 settings.yaml의 `schedule.days`가 모호해짐. 다음 phase 후보로 분리 (SPEC out-of-scope §1)
- **`pnpm sync-schedule` 스크립트 확장**: settings.yaml → 두 workflow sync. 별도 phase (SPEC out-of-scope §2)
- **Day-of-week 선택 UI**: settings.yaml의 `schedule.days` field 확장으로 "수요일 daily 만 돌리고 싶다" 같은 선택. 별도 phase (SPEC out-of-scope §3)
- **Pending 별도 archive (`state/pending-sent/YYYY-WW.json`)**: archive/ HTML과 중복이라 제외, send 후 truncate (SPEC out-of-scope §5)
- **Weekly send 실패 시 retry workflow**: 기존 SMTP retry (EMAIL-07) + fail-loud로 충분 (SPEC out-of-scope §6)
- **새 firm 주중 추가 시 bootstrap 특수 처리**: Phase 1 DEDUP-05 first-run bootstrap 룰이 daily entry에서 자동 작동 (SPEC out-of-scope §7)
- **pending.json schema migration (v1 → v2)**: 현재 v1만 정의. 미래 schema 변경은 별도 phase (SPEC out-of-scope §8)
- **Heartbeat 본문 풍부화**: "다음 daily 예정 시각", "지난 daily run 통계", "이번 주 fetch는 했는데 dedup으로 다 걸러진 firm 목록" 등 — 운영하면서 가치 보이면 별도 polish phase로
- **gemini.ts에 Recorder 주입 (D-18 대안)**: module-level counter가 거추장스러워지거나 multi-run lifecycle 필요해지면 그때 마이그레이션 고려

</deferred>

---

*Phase: 13-1-gemini-rpd*
*Context gathered: 2026-05-21*
