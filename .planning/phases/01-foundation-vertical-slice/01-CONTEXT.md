# Phase 1: Foundation + Vertical Slice - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

한 개 로펌(Cooley)에 대한 end-to-end 파이프라인: GHA cron → fetch → canonical-URL dedup → Gemini Korean summary → Gmail 통합 다이제스트 → `state/seen.json` 커밋. 모든 `[CHEAP NOW]` 파손 위험 (URL 정규화, 타임존, 트랜잭션 순서, 동시성 키, fail-loud SMTP, secrets 위생, 정직한 UA + robots.txt)은 이 phase에서 선제 해결하고, 다른 11개 로펌은 Phase 2에서 horizontal 확장.

</domain>

<decisions>
## Implementation Decisions

### Seed Firm

- **D-01**: Phase 1 vertical slice의 단일 로펌은 **Cooley** (US, `cooley.com`). RSS 제공 가능성이 높은 영문 로펌으로, 한국어 인코딩 및 복잡 스크래핑 리스크는 Phase 2에서 다룬다.
- **D-02**: Cooley의 정확한 RSS 엔드포인트는 Phase 1 초반 구현 시 `pnpm check:firm cooley` 스타일 probe (혹은 browser DevTools)로 검증. 예상 경로: `/alerts`, `/insights`, `/feed`, `/rss` 중 하나.

### Recipient Email Location

- **D-03**: 수신자 이메일 주소는 **`config/recipient.yaml`** 별도 파일에 둔다 (firms.yaml 과 분리). YAML 구조는 단순 key-value (`recipient: your.email@example.com` 수준). 이유: 저장소는 COMP-04에 따라 private 기본값이며, 사용자가 수신자를 바꿀 때 GitHub 웹에서 파일 하나 편집으로 해결 가능.
- **D-04**: `config/recipient.yaml`은 zod 스키마 검증을 받는다 (잘못된 이메일 포맷 → fail-fast). CONF-02 요건과 일관.
- **D-05**: `.env.example`에도 `RECIPIENT_EMAIL` 항목을 포함해, repo를 public으로 전환하거나 GHA secret 방식으로 바꾸고 싶은 미래 사용자가 override할 수 있는 hook을 남긴다 (env var가 있으면 config를 override하는 fallback 순서).

### Email Subject & HTML Style

- **D-06**: Subject 라인은 `[법률 다이제스트] YYYY-MM-DD (N firms, M items)` 형식으로 고정. 예: `[법률 다이제스트] 2026-04-17 (1 firms, 3 items)`. EMAIL-04 요건과 정합. "1 firms" 같은 문법 오류는 수용 (간결성 우선).
- **D-07**: HTML 바디는 **minimal 스타일**:
  - `<h1>` level로 "법률 다이제스트 YYYY-MM-DD" 제목
  - 로펌별 `<h2>` 섹션 헤더 (Phase 1에서는 Cooley 하나)
  - 각 아이템: 원어 제목(링크로 원문 연결), 그 아래 한국어 요약 텍스트, 섹션 간 시각적 spacing
  - inline CSS 최소 (mobile 가독성, Gmail 렌더링 안정성 우선)
  - 로고/아이콘/색상 강조 없음
- **D-08**: Plaintext fallback(multipart alternative)은 Phase 1에서는 넣지 않음 (PLAIN-01 v1.x deferred 항목). 필요해지면 승격.

### First-Run Bootstrap Policy

- **D-09**: Phase 1 최초 실행 시, Cooley 사이트의 모든 현존 아이템 URL을 `state/seen.json`에 기록하고 **발송은 생략**. 실제 디지털 다이제스트는 "신규 아이템이 처음 등장한 날" 이후에 시작.
- **D-10**: 파이프라인 기능 검증은 **`DRY_RUN=1`** 경로에서 수행 (Gemini 호출하되 이메일 발송과 state 쓰기는 skip). 실제 라이브 첫 실행 전에 DRY_RUN으로 end-to-end 리허설.

### Claude's Discretion

Phase 1 구현 중 Claude가 판단해도 되는 부분:

- `state/seen.json`의 정확한 JSON 키 배치/공백 (schema는 decisions에 따라 `{ version: 1, lastUpdated, firms: {...} }`)
- `config/recipient.yaml`과 `config/firms.yaml`의 구체적 스키마 레이아웃 (단, CONF-02 zod 검증 필수)
- canonical URL 정규화 함수의 정확한 파라미터 목록 (DEDUP-02 요건 충족만 되면 됨)
- Gemini prompt 문구 (한국어 요약 3~5줄, 원문 없으면 `confidence: low`라는 제약만 지키면 됨)
- Minimal HTML 템플릿의 구체적 CSS 속성 선택 (mobile 가독성만 유지)
- 로그 출력 포맷 (OPS-10 민감정보 마스킹만 준수)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — 전체 프로젝트 비전, Core Value, Active 요구사항, Out of Scope 경계, Key Decisions
- `.planning/REQUIREMENTS.md` — 46개 v1 요구사항 (Phase 1 매핑: FETCH-03/04, DEDUP-01/02/03/04/06/07, SUMM-01~06, EMAIL-01~04/06, CONF-01/02/03/05/07, OPS-01/02/03/06/10, COMP-01~05)
- `.planning/ROADMAP.md` §Phase 1 — Phase 1 goal과 success criteria

### Research Outputs (MANDATORY for planning)
- `.planning/research/SUMMARY.md` — 종합 요약 및 phase별 implication (Phase 1 "Foundation + Vertical Slice" 섹션 우선)
- `.planning/research/STACK.md` — 라이브러리 선택 및 버전 (Node 22, `@google/genai` 1.49, cheerio 1.2, nodemailer, `eemeli/yaml`, `zod`, `p-limit`, `p-retry`, `date-fns-tz`, `tsx`, `vitest`). **중요 교정**: Gemini free tier 약 250 RPD (Flash), 리셋 midnight PT.
- `.planning/research/FEATURES.md` — T1~T17 + v1 differentiator 매핑. Phase 1이 포함해야 할 기능 세트
- `.planning/research/ARCHITECTURE.md` — 컴포넌트 경계, 데이터 플로우, state schema, 에러 격리 전략. `types.ts`, `src/config/`, `src/scrapers/`, `src/pipeline/`, `src/summarize/`, `src/compose/`, `src/mailer/`, `src/state/`, `src/main.ts` 구조의 레퍼런스
- `.planning/research/PITFALLS.md` — 17개 pitfall, 특히 Phase 1 `[CHEAP NOW]` 5개 (#3, #4, #5, #6, #10) + Phase 1 런치 전 해결해야 할 #12 (ToS/UA/robots), #14 (App Password revocation), #15 (secrets leakage), #17 (mental-model rot README)

### External / Runtime Docs (Phase 1 구현 시 참조)
- `https://ai.google.dev/gemini-api/docs/rate-limits` — Gemini free tier RPD 실시간 값
- `https://nodemailer.com/usage/using-gmail` — App Password 방식 SMTP 연결 가이드
- `https://github.com/stefanzweifel/git-auto-commit-action` — `[skip ci]`와 `permissions: contents: write` 사용 패턴
- Cooley 공개 뉴스레터/Alerts 페이지 — Phase 1 초기에 RSS 경로 확인용 probe 필요

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

**Greenfield** — 실제 앱 코드는 0줄. 재사용할 기존 컴포넌트/유틸은 아직 없음. `.claude/`, `.opencode/`, `.gsd-patches/`는 GSD 툴링이며 제품 코드와 무관.

### Established Patterns

- **저장소 구조**: 제품 코드는 아직 없으므로 Phase 1 구현 시 `src/` 하위 구조를 처음 확립하게 됨. `research/ARCHITECTURE.md`의 제안을 디폴트로 따른다.
- **Git workflow**: `.gsd-patches` submodule + `scripts/reapply-gsd-local-patches.sh` 체제 유지 (GSD 업데이트 시 로컬 커스텀 보호)
- **`.gitignore`**: `.claude/`, `.opencode/`, `.agents/`, `.env` 등은 이미 무시됨. 새 구현은 `src/`, `config/`, `state/`, `archive/`, `test/`에 올리면 된다.

### Integration Points

- **GHA**: `.github/workflows/daily.yml` 신규 생성 (저장소에 GHA 설정 없음, 자유롭게 구성 가능)
- **비밀정보**: `GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`, (optionally) `GMAIL_FROM_ADDRESS`를 GHA Secrets로 주입. `.env.example`에 동일 키 + `RECIPIENT_EMAIL` override 힌트 포함.
- **Submodule**: `.gsd-patches` submodule을 GHA 체크아웃 시 함께 초기화할지 여부는 Phase 1 GHA 설정에서 결정 (정답: 초기화 **불필요** — 패치는 로컬 개발 편의 목적, 런타임과 무관).

</code_context>

<specifics>
## Specific Ideas

- 사용자 초기 코멘트: "수신인은 바뀔 수 있어." → `config/recipient.yaml`의 정당화 근거.
- 사용자 초기 코멘트: "로펌도 비개발자가 추가하기 쉽게 만들어줘." → Phase 2에서 full 12-firm YAML 확장 시 `config/firms.yaml` 주석 스타일이 결정적. Phase 1에서는 Cooley 하나만 넣되 상단에 "로펌 추가 방법" 주석 템플릿을 미리 깔아둔다.
- 이메일 제목 이모지/장식 **사용 안 함** — 스팸 필터 안정성을 위해 순수 텍스트.
- Plaintext fallback은 deferred (PLAIN-01). Phase 1은 HTML 단일 MIME 파트로 출발.

</specifics>

<deferred>
## Deferred Ideas

- **HTML 플레인텍스트 멀티파트** — PLAIN-01로 v1.x 백로그 (특정 클라이언트 렌더링 이슈 발생 시).
- **로펌별 색상/아이콘 강조** — Phase 1은 minimal 스타일. 로펌이 12개 + 스타일 요구가 있을 경우 v2 candidate.
- **Workflow_dispatch 수동 URL 투입** — MANUAL-01, v1.x 트리거 기반.
- **가상의 phase-level "smoke test" 이메일 발송** — Phase 1에서는 DRY_RUN으로 대체. 필요 시 별도 phase로 승격 가능.
- **수신자를 YAML 대신 GHA Secret으로 이전** — private repo 유지하는 동안은 필요 없음. Public 전환 혹은 다른 사유 발생 시 전환.

</deferred>

---

*Phase: 01-foundation-vertical-slice*
*Context gathered: 2026-04-16*
