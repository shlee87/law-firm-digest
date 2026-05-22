# Phase 13: 매일 스크래핑 + 주 1회 이메일 발송 분리 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 13-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 13-1-gemini-rpd
**Mode:** discuss (SPEC-locked — implementation decisions only)
**Areas discussed:** runPipeline 분기 방식, pending 모듈 경계 + PendingItem shape, Cluster/LowConfidence detection 위치, Empty-week heartbeat + geminiCallCount 세부

---

## Area 1: runPipeline() 분기 방식

### Q1: runPipeline()을 어떻게 분기하시겠어요?

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 runPipeline + mode 옵션 | RunOptions에 `mode?: 'daily'|'weekly'` 추가. step 7 이후에 if(mode==='daily') return pending-append; if(mode==='weekly') skip fetch→summarize 분기. 기존 12-step canonical sequence comment 유지, test fixture 재활용. 단점: 대형 if-branch 두 개, ad-hoc 흐름. | |
| runDaily + runWeekly 삼형제 (shared helpers) | runPipeline()를 두 함수로 추출. 공통 setup (loadFirms/readState/browser launch)은 prepareRun() helper. runDaily: fetch→enrich→filter→dedup→summarize→appendPending→writeState. runWeekly: readPending→detectClusters→composeDigest→sendMail→writeArchive→truncatePending. main.ts가 mode에 따라 둘 중 하나 호출. 장점: 각 펜의 책임이 명확, test가 깔끔. 단점: shared helper signature 필요, 12-step comment 재구성. | ✓ |

**User's choice:** runDaily + runWeekly 두 함수로 분리 (옵션 B)

**Notes:**
- 사용자가 "context 넓혀서 자세히 설명" 요청 → 두 옵션의 (1) RunOptions/RunReport 타입 변화, (2) 파일 구조, (3) 함수 본문, (4) 테스트 스타일, (5) 1년 뒤 디버깅 시나리오, (6) 미래 변경 시나리오 비교
- 그 후 "추천은? 어떤 기준으로 선택해야해?" 요청 → 옵션 B 추천 + 세 가지 판단 기준 제시
- 추천 근거: (a) SPEC.md 문구 "두 entry point로 분리" 명시, (b) 타입 시스템이 invariant 강제 → 사용자 "aggressive failure detection" 선호와 일치, (c) Solo dev cognitive load, (d) Daily/Weekly가 도메인이 다른 두 작업
- 옵션 A의 강점(Phase 3 D-09 연속성)은 Phase 13에서 어차피 깨지는 영역이라 손실 작음

### Q2: --mode 플래그 없이 호출될 때 어떻게 할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| Error fail-fast (추천) | process.exit(2) + 'Usage: --mode=daily|weekly'. package.json scripts 업데이트: dev→'tsx src/main.ts --mode=daily', dev:weekly 신규 추가. 이유: aggressive failure detection 원칙. 수동 dispatch에서 조용한 실수 안 생김. | ✓ |
| default daily | flag 없으면 daily 모드. `pnpm dev` 그대로 돌아감. 단점: weekly 조용한 실행 가능성 (manual dispatch 시 항상 daily로 돌아감) — weekly가 안돼서 조용히 메일 안 나갈 수 있음. | |

**User's choice:** Error fail-fast

---

## Area 2: pending 모듈 경계 + PendingItem shape

### 발표된 추천 (한 묶음으로 확인받음)

| Decision | Description | Selected |
|----------|-------------|----------|
| PendingItem 타입 | SummarizedItem 재사용 X — 별도 타입 (`description`, `isClusterMember` 자동 제외, COMP-05 타입에 박힘). 변환 함수 `toPendingItem(s, now)`. | ✓ |
| 파일 구조 | `src/state/pending.ts` 단일 파일 (schema + read/append/truncate + toPendingItem). seen.json의 reader/writer 분리 패턴 안 따라감. | ✓ |
| API | `readPending()`, `appendPending(items)`, `truncatePending()`. `writePending` 노출 안 함 (windowStart 실수 차단). | ✓ |
| zod schema | 같은 파일 내 PendingItemSchema + PendingStateSchema 정의. 별도 `pendingSchema.ts` 안 만듦. | ✓ |

**User's choice:** "추천대로 가자."

**Notes:**
- 사용자가 컨텍스트 전체 설명 + 추천 제시 받은 후 한 번에 확인
- COMP-05 ("뉴스레터 전문 저장·재배포 금지") 위반 방지가 별도 타입 결정의 핵심 근거
- `isClusterMember`는 types.ts 주석에 "MUST NOT be persisted" 명시 → 타입 시스템에 박는 게 자연스러움

---

## Area 3: Cluster/LowConfidence detection 위치

### 발표된 추천 (한 묶음으로 확인받음)

| Decision | Description | Selected |
|----------|-------------|----------|
| Detection 위치 | weekly에만 실행. Daily에서는 호출 안 함. 이유: daily는 firm당 1~2건 → cluster threshold(3+) 미달 → daily detection 영구히 0건. Weekly가 한 주치 누적 보고 cluster 잡는 게 Phase 8 GUARD-03 원래 의도. | ✓ |
| markers 저장 | pending.json에 저장 안 함. Weekly run마다 재계산. 이유: detector는 pure function 50건에 <10ms, 캐싱 가치 없음. stale bug 가능성 차단. | ✓ |
| PendingItem → 기존 detector | `restoreFirmsFromPending(pending, allFirms): FirmResult[]` helper 추가. 기존 detector + composeDigest 시그니처 손 안 댐. Generic 리팩터링(검토됨)은 변경 표면 너무 큼. | ✓ |

**User's choice:** "응 가자."

**Notes:**
- "Detector는 한 batch 안에서 검출" 의도 — Phase 13에서 "한 batch = 한 weekly run의 pending"으로 자연스럽게 매핑됨
- 옵션 ㄴ (generic detector 리팩터링)은 변경 표면(detector 2개 + composeDigest + 6개 테스트 파일) 대비 이득 작음 → "Three similar lines is better than a premature abstraction"
- restoreFirmsFromPending이 ~20줄짜리 변환 함수 (description='' 박고 isNew:true 추가)

---

## Area 4: Empty-week heartbeat + geminiCallCount 세부

### Part 1: Heartbeat — 발표된 추천

| Decision | Description | Selected |
|----------|-------------|----------|
| composeHeartbeat() 별도 함수 | composeDigest 손 안 댐. composeDigest는 이미 분기(warnings, markers, failed-firms) 많음 — heartbeat까지 끼우면 가독성 저하. Heartbeat은 본질적으로 단순 → 별도 함수가 자연스러움. | ✓ |
| Subject | `[법률 다이제스트] YYYY-MM-DD (이번 주 신규 없음)`. EMAIL-04 prefix 유지 (스팸 필터 안정). | ✓ |
| Body | 최소: "이번 주 새 뉴스레터가 없습니다." + "시스템은 정상 작동 중입니다." 두 줄. Failed-firm/DQOBS footer 의도적 부재 (weekly는 fetch 안 함, items 0건이라 marker 생성 불가능). | ✓ |

### Part 2: geminiCallCount — 발표된 추천

| Decision | Description | Selected |
|----------|-------------|----------|
| 계측 지점 | `src/summarize/gemini.ts` module-level counter. 실제 `ai.models.generateContent()` 호출 직전 increment. 이유: fallback (flash → flash-lite) + p-retry 재시도까지 정확히 카운트. Post-summarize tally는 부정확. | ✓ |
| API surface | `getGeminiCallCount()`, `resetGeminiCallCount()` export. runDaily/runWeekly 시작 시 reset, 끝에 read. | ✓ |
| Recorder 통합 안 함 | Recorder에 카운터 추가하는 대안은 호출자 chain까지 Recorder 들고 내려가야 해서 변경 표면 큼. Module-level은 단일 run lifecycle 안에서 안전. | ✓ |
| step-summary 위치 | 마크다운 테이블 **위쪽 첫 줄**: `[METRIC] geminiCallCount=N`. AC-7 grep marker 그대로 매치. 시각적으로 가장 먼저 확인하는 신호. | ✓ |
| Daily/Weekly 출력 | 둘 다 [METRIC] 출력. Weekly는 항상 0. AC-7 명시: "weekly run의 geminiCallCount === 0". | ✓ |

**User's choice:** "응 가자."

**Notes:**
- Daily 50건 cap이 RPD 250/일 cap에 근접 → 정확도가 중요한 이유
- Module-level counter는 보통 anti-pattern이지만 단일 process 단일 run lifecycle + test 격리 가능해 안전
- composeHeartbeat은 향후 본문 풍부화 여지 있음 (지난 daily 통계, 다음 cron 시각 등) — Deferred로 분리

---

## Claude's Discretion (Plan 단계에서 결정)

- composeHeartbeat HTML 정확한 스타일링 (font-size, color 등) — 단순 inline style 사용 권장
- `restoreFirmsFromPending`에서 firmId에 해당하는 firm이 firms.yaml에서 없어진 경우 처리
- `prepareRun()` helper를 진짜 만들지 inline 중복을 허용할지는 plan 단계 실측 후
- `--mode=daily --firm=cooley` 같은 조합 처리 (CLI dev path)

---

## Deferred Ideas

- `config/settings.yaml`의 `schedule.days: weekly` 의미 변경 — 다음 phase
- `pnpm sync-schedule` 스크립트 확장 — 다음 phase
- Day-of-week 선택 UI — 별도 phase
- Pending 별도 archive — 제외 (HTML archive와 중복)
- Weekly send 실패 retry workflow — 기존 SMTP retry로 충분
- 새 firm 주중 추가 bootstrap — 기존 DEDUP-05로 자동 처리
- pending.json schema migration (v1 → v2) — 미래
- Heartbeat 본문 풍부화 — 운영하며 가치 보이면 별도 polish phase
- gemini.ts에 Recorder 주입 (D-18 대안) — 필요해지면 마이그레이션
