# Requirements: LegalNewsletter

**Defined:** 2026-04-16
**Core Value:** 사용자가 직접 로펌 웹사이트를 돌지 않아도, 추적 대상 로펌들의 신규 뉴스레터를 원문 링크와 함께 한국어 요약으로 받아볼 수 있어야 한다.

Derived from `.planning/research/FEATURES.md` categorization (T1–T17 table stakes + 13 v1 differentiators). See FEATURES.md for per-item complexity, dependencies, and rationale.

## v1 Requirements

### Fetching (FETCH)

- [ ] **FETCH-01**: 시스템은 RSS → static HTML → JS-rendered 세 계층의 fetch 전략 중 로펌별 설정에 맞는 방식을 선택해 뉴스레터 목록을 가져온다
- [ ] **FETCH-02**: 한 로펌의 fetch 실패가 다른 로펌 fetch를 중단시키지 않는다 (`Promise.allSettled` 기반 격리)
- [ ] **FETCH-03**: 각 로펌 사이트당 하루 1회·1요청 원칙을 지킨다 (`p-limit(3)` 동시성 제한 포함)
- [ ] **FETCH-04**: 모든 로펌 요청은 정직한 User-Agent (`LegalNewsletterBot/1.0 (+<repo-url>)`)를 사용한다 — 브라우저 위장 금지

### Dedup & State (DEDUP)

- [ ] **DEDUP-01**: 이전 실행에서 본 URL은 다시 발송하지 않는다 (cross-run dedup)
- [x] **DEDUP-02**: URL 비교 전에 canonicalize 한다 (scheme/host 소문자, `www.` 제거, fragment·tracking params 제거, trailing slash 정규화, query param 정렬)
- [ ] **DEDUP-03**: 신규가 하나라도 있는 날에만 이메일을 발송한다 ("오늘은 없음" 메일 금지)
- [ ] **DEDUP-04**: 로펌별 seen URL 목록은 500개로 상한 (newest-first), 넘으면 오래된 것부터 버린다
- [ ] **DEDUP-05**: 새로 추가한 로펌의 첫 실행은 back-catalog 전체를 발송하지 않는다 — 최초 실행 시 seen 상태로 bootstrap
- [ ] **DEDUP-06**: 상태(`state/seen.json`)는 실행 후 repo에 자동 commit 된다 (`[skip ci]` 포함, 무한 루프 방지)
- [x] **DEDUP-07**: state schema는 version 필드를 포함한다 (향후 마이그레이션 대비)

### Summarization (SUMM)

- [x] **SUMM-01**: 각 신규 항목에 대해 Gemini API로 한국어 요약(3~5줄)을 생성한다
- [x] **SUMM-02**: 기본 모델은 `gemini-2.5-flash`, 429 쿼터 초과 시 `gemini-2.5-flash-lite`로 자동 폴백한다
- [x] **SUMM-03**: Gemini 호출은 `responseMimeType: 'application/json'` + `responseSchema`로 구조화된 응답을 강제한다 (`{summary_ko, confidence}`)
- [x] **SUMM-04**: 요약 정보가 부족하거나 본문을 못 읽으면 `confidence: 'low'` + `summary_ko: null`로 분기한다 (환각 방지)
- [x] **SUMM-05**: 요약 생성 시 `temperature: 0.2`로 결정성을 높인다 (재시도 시 아카이브와 발송본 불일치 방지)
- [x] **SUMM-06**: 원어 제목은 Gemini에 들어가지 않고 원문 그대로 보존된다 (번역 왜곡 방지)

### Email Composition & Delivery (EMAIL)

- [ ] **EMAIL-01**: 하루치 신규 항목을 로펌별로 섹션 나눈 하나의 통합 다이제스트 이메일로 발송한다
- [ ] **EMAIL-02**: 각 아이템은 원어 제목 + 한국어 요약 + 원문 링크를 포함한다
- [ ] **EMAIL-03**: Gmail SMTP + App Password로 발송한다 (`nodemailer`)
- [ ] **EMAIL-04**: 제목 패턴은 `[법률 다이제스트] YYYY-MM-DD (N firms, M items)` 형식으로 고정 (스팸 필터 안정성)
- [ ] **EMAIL-05**: 이메일 footer에 실패한 로펌 목록과 실패 사유 요약을 표시한다
- [ ] **EMAIL-06**: SMTP 발송 에러는 워크플로우를 빨간색으로 실패시킨다 — 절대 조용히 삼키지 않는다
- [ ] **EMAIL-07**: SMTP 일시적 5xx 에러는 재시도하고, 535 인증 실패는 명시적 `GMAIL_AUTH_FAILURE` 마커와 함께 즉시 fail

### Config & Extensibility (CONF)

- [x] **CONF-01**: 추적 대상 로펌은 단일 YAML 파일(`config/firms.yaml`)에 선언적으로 정의한다 — 비개발자가 코드 변경 없이 추가/제거 가능
- [x] **CONF-02**: YAML 스키마는 시작 시 zod로 검증, 잘못된 key/value는 정확한 경로와 함께 에러로 fail-fast
- [x] **CONF-03**: 수신 이메일 주소는 config 또는 GHA secret으로 변경 가능 (코드 수정 불필요)
- [ ] **CONF-04**: 각 로펌은 `enabled: true/false` 플래그로 일시 비활성화할 수 있다 (파일 삭제 불필요)
- [x] **CONF-05**: 각 로펌은 `timezone` 필드(IANA 포맷: `Asia/Seoul` 등)를 가진다
- [ ] **CONF-06**: 각 로펌은 선택적 `include_keywords` / `exclude_keywords` 필터를 지원한다
- [x] **CONF-07**: YAML 파일 상단에 비개발자용 주석 예시 포함 (신규 로펌 추가 단계 안내)

### Ops & Reliability (OPS)

- [ ] **OPS-01**: GitHub Actions cron으로 하루 1회 자동 실행 (09:00 UTC = 18:00 KST, midnight 혼잡 회피)
- [ ] **OPS-02**: workflow는 `concurrency: {group: digest-pipeline, cancel-in-progress: false}` 로 동시 실행 충돌 방지
- [ ] **OPS-03**: 실행 순서는 fetch → dedup → summarize → email → state write (state는 이메일 발송 성공 후에만 커밋)
- [ ] **OPS-04**: 로펌별 `lastNewAt`이 30일 이상 지난 경우 다이제스트 상단에 staleness 경고 표시
- [ ] **OPS-05**: 이전 실행 종료가 30시간 이상 오래된 경우 다이제스트 header에 last-run staleness 알림
- [ ] **OPS-06**: `DRY_RUN=1` 환경 변수로 전체 파이프라인 리허설 가능 (Gemini 호출하되 이메일 발송 & state 저장 skip)
- [ ] **OPS-07**: `pnpm check:firm <id>` CLI로 단일 로펌 end-to-end 검증 가능 (raw → parsed → would-summarize → would-render)
- [ ] **OPS-08**: 매 실행마다 로펌별 fetched/new/summarized/errors/duration 표를 `$GITHUB_STEP_SUMMARY`에 출력
- [ ] **OPS-09**: 매일 `archive/YYYY/MM-DD.html`에 발송 다이제스트 사본을 repo에 커밋 (검색 가능한 히스토리)
- [x] **OPS-10**: 구조화된 로그는 로펌별 섹션으로 분리되고 민감정보(시크릿, 인증 토큰)는 마스킹된다

### Compliance & Security (COMP)

- [x] **COMP-01**: 모든 비밀정보(`GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`, 수신자 이메일 등)는 GHA Secrets로 주입 — 저장소에 평문 금지
- [x] **COMP-02**: `.env` 로컬 개발용 파일은 `.gitignore` 처리, `.env.example`만 커밋
- [ ] **COMP-03**: 로펌 스크래핑 전 `robots.txt`를 확인하고 disallow된 경로는 fetch 하지 않는다
- [x] **COMP-04**: 저장소는 기본 private (GHA 무료 티어 2,000 min/월 내에서 충분)
- [x] **COMP-05**: 저작권 이슈 최소화 — 뉴스레터 전문을 저장·재배포하지 않으며, 요약과 원문 링크만 전달

## v2 Requirements

Deferred — 각각은 trigger 조건이 관찰되면 승격.

### Enhancements

- **TAG-01**: 실무 분야 태그 자동 추출 (skim 속도 저하가 관찰되면)
- **MANUAL-01**: `workflow_dispatch` 입력으로 특정 URL 임시 투입 (LinkedIn 등 비정기 글 포착 시)
- **LINK-01**: 매일 HEAD 요청으로 링크 깨짐 검사 (깨진 링크 클릭 경험 발생 시)
- **QUOTA-01**: 실행별 Gemini 쿼터 모니터 (일일 신규 건수가 100건에 근접 시)
- **PLAIN-01**: HTML/plaintext 멀티파트 이메일 (특정 클라이언트 렌더링 이슈 발생 시)
- **CACHE-01**: `state/summary-cache.json` 컨텐츠 해시 기반 요약 캐시 (retry 시 요약 중복 비용 발생 시)
- **ARCH-01**: archive 연도별 분리 및 pruning (`du -sh .git`이 500MB 근접 시)
- **STATE-01**: 로펌별 상태 파일 분리 (`state/seen/<firm>.json` — 동시성 충돌이 `concurrency:` key로도 잡히지 않을 때)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 웹 대시보드 / GUI | $0 제약과 상충 (호스팅 비용). 비개발자 config 접근성은 YAML 주석으로 해결 |
| 다중 수신자 | 개인용 자동화, 단일 수신자로 충분 |
| Unsubscribe 링크 | 개인용이며 메일링 리스트가 아님 |
| 실시간 푸시 알림 | 하루 1회 다이제스트로 노이즈 억제가 설계 목표 |
| 뉴스레터 전문 저장/재배포 | 저작권 이슈 최소화, 요약과 링크만으로 충분 |
| Claude Pro / ChatGPT Plus를 자동화 AI 소스로 사용 | 두 구독은 API 접근을 포함하지 않음 (기술적으로 불가능) |
| 제목까지 한국어 번역 | 법률 용어 왜곡 방지, 사용자 명시적 결정 |
| AI cross-firm 클러스터링 / 중요도 스코어링 | Gemini 추가 호출 = 쿼터 낭비 + 단일 사용자 판단을 대체할 필요 없음 |
| Slack / Discord / Telegram 채널 발송 | 이메일 1채널로 충분, 통합 채널 유지 복잡도 vs 가치 부적합 |
| 하루 2회 이상 다이제스트 | 긴급성 없는 도메인, 1회로 충분 |
| 유료 API / 유료 호스팅 | Budget $0 제약 절대 준수 |
| Vector 검색 / 검색 UI | 아카이브는 git 히스토리로 충분 |

## Traceability

Every v1 requirement maps to exactly one phase. Phase 4 (JS-rendered tier) is conditional — if Phase 2 audit shows no qualifying firms, Phase 4 is skipped and FETCH-01 is considered fully satisfied by the RSS + HTML tiers delivered in Phase 1 / Phase 2.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FETCH-01 | Phase 2 | Pending |
| FETCH-02 | Phase 2 | Pending |
| FETCH-03 | Phase 1 | Pending |
| FETCH-04 | Phase 1 | Pending |
| DEDUP-01 | Phase 1 | Pending |
| DEDUP-02 | Phase 1 | Complete |
| DEDUP-03 | Phase 1 | Pending |
| DEDUP-04 | Phase 1 | Pending |
| DEDUP-05 | Phase 2 | Pending |
| DEDUP-06 | Phase 1 | Pending |
| DEDUP-07 | Phase 1 | Complete |
| SUMM-01 | Phase 1 | Complete |
| SUMM-02 | Phase 1 | Complete |
| SUMM-03 | Phase 1 | Complete |
| SUMM-04 | Phase 1 | Complete |
| SUMM-05 | Phase 1 | Complete |
| SUMM-06 | Phase 1 | Complete |
| EMAIL-01 | Phase 1 | Pending |
| EMAIL-02 | Phase 1 | Pending |
| EMAIL-03 | Phase 1 | Pending |
| EMAIL-04 | Phase 1 | Pending |
| EMAIL-05 | Phase 2 | Pending |
| EMAIL-06 | Phase 1 | Pending |
| EMAIL-07 | Phase 2 | Pending |
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| CONF-04 | Phase 2 | Pending |
| CONF-05 | Phase 1 | Complete |
| CONF-06 | Phase 2 | Pending |
| CONF-07 | Phase 1 | Complete |
| OPS-01 | Phase 1 | Pending |
| OPS-02 | Phase 1 | Pending |
| OPS-03 | Phase 1 | Pending |
| OPS-04 | Phase 3 | Pending |
| OPS-05 | Phase 3 | Pending |
| OPS-06 | Phase 1 | Pending |
| OPS-07 | Phase 3 | Pending |
| OPS-08 | Phase 3 | Pending |
| OPS-09 | Phase 3 | Pending |
| OPS-10 | Phase 1 | Complete |
| COMP-01 | Phase 1 | Complete |
| COMP-02 | Phase 1 | Complete |
| COMP-03 | Phase 1 | Pending |
| COMP-04 | Phase 1 | Complete |
| COMP-05 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 46 total (FETCH 4 + DEDUP 7 + SUMM 6 + EMAIL 7 + CONF 7 + OPS 10 + COMP 5)
- Mapped to phases: 46 ✓
- Unmapped: 0

**Per-phase totals:**
- Phase 1 (Foundation + Vertical Slice): 34 requirements
- Phase 2 (Multi-Firm HTML Tier + Failure Isolation): 7 requirements
- Phase 3 (Observability + Dev Loop): 5 requirements
- Phase 4 (JS-Rendered Tier, conditional): 0 net-new requirements (completes FETCH-01's JS-render branch only if audit qualifies)
- Phase 5 (Triggered Polish, v1.x backlog): 0 v1 requirements (v2 items only, activated on trigger)

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-17 after roadmap traceability population*
