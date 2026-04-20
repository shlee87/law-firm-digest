# Phase 6: Firm Audit + Probe - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 06-firm-audit-probe
**Areas discussed:** Probe form & invocation, Scope coverage, Detail-identity signal, AUDIT.md structure + remediation

---

## Probe form & invocation

### Q1. Audit probe 코드를 어디에 두고 어떻게 실행할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| A. 프로덕션 코드 + `pnpm audit:firms` | `src/audit/firmAudit.ts` 로직 + `src/cli/auditFirms.ts` CLI + pnpm script. Phase 11 cron 게이트 재사용 가능. 기존 `scripts/detail-page-audit.ts`는 마이그레이션 후 삭제. | ✓ |
| B. `scripts/` 확장만 | 기존 script에 js-render+rss+AUDIT.md writer 추가, 이름은 `scripts/firm-audit.ts`로 재명명. 간단하지만 throwaway 폴더에 장기 재사용 도구를 둠. | |
| C. `check:firm --all --audit` 확장 | 기존 CLI에 flag 추가. 새 파일 없지만 "개별 firm 점검"과 "전수 진단 리포트" 의미 섞임. | |
| D. 일회용 (throwaway) | Phase 6 끝나면 삭제. Phase 11 검증은 수동. 작업량 최소. | |

**User's choice:** A. 프로덕션 코드 + pnpm audit:firms
**Notes:** 첫 질문은 jargon-heavy로 느꼈다는 피드백 → 배경 + 시나리오 + CLI 예시 표 재설명 후 결정.

### Q2. `audit:firms` 종료 시 exit code 정책은?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-loud: non-OK 있으면 exit 1 | Memory 'aggressive failure detection' 정렬. Phase 11 CI 빨간색 강제. | ✓ |
| Report-only: 항상 exit 0 | 리포트만 쓰고 CI 정상. 수동 승인 의존. | |
| Exit code severity tiers | 0=all OK / 1=non-OK / 2=runtime/usage. 세밀. | |

**User's choice:** Fail-loud: non-OK 있으면 exit 1
**Notes:** 구현은 3단계 (0/1/2) 유지 — "non-OK=1, runtime=2, usage=2"로 타이트.

---

## Scope coverage

### Q3. Audit가 커버할 firm 범위는?

| Option | Description | Selected |
|--------|-------------|----------|
| enabled=true 12개 + cooley(disabled) 옵션 flag | 기본 enabled, `--include-disabled`로 cooley baseline. Phase 9 pre/post 기록 명확. | ✓ |
| enabled=true 12개만 | AUDIT-01 literal. cooley baseline은 Phase 9 당일에 별도 측정. | |
| 전체 13개 무조건 | cooley도 보통 firm 취급. noise 큼 (disabled 때문에 항상 non-OK). | |

**User's choice:** enabled=true 12개 전부 + cooley(disabled) 옵션 flag

### Q4. Audit probe가 tier별로 어디까지 확인할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| RSS=list만, HTML/JS-render=list+detail | RSS는 피드 구조상 detail-identical 불필요. HTML/JS-render는 N=2 detail fetch + body 검사. | ✓ |
| 모든 tier list+detail 동일 수행 | RSS도 각 item의 link URL fetch. 정보 가치 대비 시간·네트워크 비용. | |
| RSS=skip 완전 제외 | AUDIT-01 "every enabled firm" 위반. | |

**User's choice:** RSS=list만, HTML/JS-render=list+detail
**Notes:** "tier가 의미하는 게 뭐냐"는 clarification 질문 → tier 정의 표(rss/html-plain/html-onclick/js-render)와 list 단계/detail 단계 설명 후 재답변.

---

## Detail-identity signal

### Q5. Detail-identity signal 조합은?

| Option | Description | Selected |
|--------|-------------|----------|
| Combined: exact-hash + jaccard≥0.9 + title-token + length<100 | 4-signal OR. Memory 'aggressive detection' 정렬. micro-diff SPA 포착. 오탐 라이즈: 약간. | ✓ |
| Exact hash + length<100 | 현 script + empty-body. micro-diff SPA 놓침. | |
| Jaccard only (title-token 제외) | 한국어/영어 혼재 tokenize 복잡도 피함. | |
| CLI flag로 signal 선택 | `--strict` 시 추가 signal. 운영자 flag 누락 시 silent noise. | |

**User's choice:** Combined multi-signal (exact-hash + jaccard 0.9 + title-token + length<100)

### Q6. Status vocab 매핑 — signal 여러 개 트리거 시?

| Option | Description | Selected |
|--------|-------------|----------|
| Length<100=detail-empty, 나머지=detail-identical | Empty body는 독립 카테고리 (404/fetch-fail). 나머지 signal은 detail-identical로 통합. evidence 컬럼에 signal 명시. | ✓ |
| Signal별 세분화 status | detail-identical-exact / -fuzzy / -generic / -empty. SC-3 고정 vocab 위반. | |

**User's choice:** Length<100=detail-empty, 나머지=detail-identical

---

## AUDIT.md structure + remediation

### Q7. AUDIT.md 구조는?

| Option | Description | Selected |
|--------|-------------|----------|
| 하이브리드: 상단 요약 테이블 + 하단 per-firm evidence | Planner one-glance + 사람 읽기 편함. Phase 7/8/9 routing 자동 가능. | ✓ |
| 단일 테이블만 (structured) | 짧음. Evidence 컬럼 축약 — Phase 11 재검증 시 증거 부족. | |
| Per-firm 섹션만 (서술형) | 증거 풍부. grep 친화성 ↓. | |

**User's choice:** 하이브리드

### Q8. Remediation vocab 고정 여부?

| Option | Description | Selected |
|--------|-------------|----------|
| 고정 vocab + Target Phase 권장 매핑 | 5종 enum: enable-js-render-detail / fix-selector / disable-firm / migrate-to-sitemap / monitor. 각각 Phase 매핑. Phase 7/8/9 자동 routing 가능. | ✓ |
| 자유 서술형 | Free-form. planner 머신 routing 불가. | |
| 고정 vocab (Phase 매핑 없음) | vocab 고정만. Phase 경계는 planner 판단. | |

**User's choice:** 고정 vocab + Target Phase 권장 매핑

---

## Claude's Discretion

- `firmAudit.ts` 내부 함수 분할 / 네이밍 / 모듈 경계.
- AUDIT.md 테이블 컬럼 폭·정렬·emoji 사용 여부.
- Per-firm evidence 섹션 내부 정보 순서.
- Playwright 브라우저 인스턴스 공유 범위 (js-render firm 전체 공유 vs firm별 신규).
- loadFirms() enabled 필터 확장 방식 (신규 variant 함수 vs 기존 함수에 flag).
- 추가 CLI flag (`--firm <id>`, `--json`) — Phase 6 불필요, backwards-compatible 추가 가능.

## Deferred Ideas

- Per-firm baseline 저장/비교 (추세 분석) — Phase 10 DQOBS 또는 v1.2 backlog.
- `--strict` flag로 signal 선택 — 현재는 combined-always.
- Signal별 세분화 status — SC-3 위반.
- Sample size N=3/5 옵션 — v1.2 backlog.
- AUDIT.md JSON 출력 포맷 — 사용 경험 쌓인 후 판단.
- `--firm <id>` 단일 firm audit — check:firm과 중복, 필요 시 추후 추가.
- GHA workflow_dispatch 통합 — Phase 11 소관.
