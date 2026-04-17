# Phase 1: Foundation + Vertical Slice - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 01-foundation-vertical-slice
**Areas discussed:** Seed firm, Recipient email location, Email subject / HTML style, First-run bootstrap policy

---

## Seed firm

| Option | Description | Selected |
|--------|-------------|----------|
| Cooley (US) | US 대형 로펌, RSS 제공 가능성 높음, 영어. 상대적으로 쉬운 path — Phase 1 문제 격리 | ✓ |
| Latham & Watkins (US) | 대형 로펌, RSS 제공, Context7/연구에서도 자주 언급됨 | |
| Clifford Chance (UK) | UK 대형 로펌, RSS 제공 가능성 높음, 영어 | |
| 지평 (Jipyong, KR) | 중형 한국 로펌 — 어렵지만 한국어 인코딩/파싱 이슈를 먼저 받으려면 | |

**User's choice:** Cooley (US) — recommended default
**Notes:** 영문 + RSS로 파이프라인 증명 → 한국 로펌은 Phase 2에서 확장

---

## Recipient email location

| Option | Description | Selected |
|--------|-------------|----------|
| config/recipient.yaml 아래 | Private repo 기준, 편집하기 쉽고 git 이력 추적. 수정 끝: GitHub 웹 UI에서 commit 하나, 또는 local push | ✓ |
| GHA Secret (RECIPIENT_EMAIL) | 혹시 private이 아니거나 future에 public 전환 예정일 때 안전. 변경: GitHub Settings > Secrets에서 수정 (약간 긁심) | |
| Hybrid — env var fallback, YAML override 가능 | 기본값은 `$RECIPIENT_EMAIL` env 읽고, `firms.yaml·notifications.recipient` 있으면 그 값으로 override | |

**User's choice:** config/recipient.yaml 별도 파일
**Notes:** Private repo 유지 전제하에 편집 편의성 우선. 환경변수 override hook은 `.env.example`에 남겨두기로 추가 결정.

---

## Email subject pattern

| Option | Description | Selected |
|--------|-------------|----------|
| `[법률 다이제스트] YYYY-MM-DD (N firms, M items)` | Research 추천. 한국어 prefix + 날짜 + 간략 집계. 스팸 필터 안정성 높음 | ✓ |
| `[법률 Digest] YYYY-MM-DD (N개 로펌, M개 신규)` | 집계도 한국어 포함 — 전부 한국어 근사 | |
| `Legal Digest YYYY-MM-DD` | 오로지 영어, 간결. 이메일 미리보기에서 좋을 수 있음 | |

**User's choice:** `[법률 다이제스트] YYYY-MM-DD (N firms, M items)` — recommended default

---

## HTML body style

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | 제목 큼도 heading, 로펌별 section(h2), 아이템은 제목(굵음, 링크) + 한줄 간격 후 요약 텍스트. inline CSS 최소화 — 모바일 가독성 우선 | ✓ |
| Structured cards | 각 아이템이 border/padding 있는 box — 시각적 계층 보호되지만 테마 관리 복잡도 증가 | |
| Rich (로펌별 색 구분, 아이콘) | 로펌별 accent color, 실무 분야 태그 채 색 — 화려하지만 유지보수 비용 높음 | |

**User's choice:** Minimal — recommended default

---

## First-run bootstrap policy

| Option | Description | Selected |
|--------|-------------|----------|
| 전부 seen으로 마킹 | 처음 실행 시 과거 아이템 모두 state에 저장, 다음날부터 신규만 발송. 파이프라인 검증은 DRY_RUN=1로. Noise 없는 깨끗한 시작 | ✓ |
| 최근 3건 'hello world' 발송 | 처음에 최근 3건을 제목+요약으로 한 번 보내고, 해당 URL은 state에 기록. 파이프라인 실제 작동 시각적으로 확인. 수신함이 조금 짜깁함 | |
| Workflow_dispatch 한번 실행 → 감사 리포트만 이메일, 그 다음 cron부터 노말 동작 | 최소 실행: 몇 건 찾았고, 어떤 URL들을 seen에 넣는지만 요약 메일로 보내고 시작 | |

**User's choice:** 전부 seen으로 마킹 — recommended default
**Notes:** 파이프라인 검증은 DRY_RUN으로, 실제 이메일 수신함은 Day 2부터 깨끗하게 출발.

---

## Claude's Discretion

Discussion에서 "you decide"로 직접 지정된 항목은 없음. 단, CONTEXT.md의 Claude's Discretion 섹션에 implementation-level 판단 권한(JSON 포맷, Gemini prompt 문구, CSS 속성 등)을 명시해둠.

## Deferred Ideas

- **HTML 플레인텍스트 멀티파트** (PLAIN-01) — 특정 클라이언트 렌더링 이슈 관찰 시 v1.x
- **로펌별 색상/아이콘 강조** — minimal 결정에 따라 보류. 로펌 12개 + 스타일 요구 시 v2
- **Workflow_dispatch 수동 URL 투입** (MANUAL-01) — LinkedIn 등 비정기 글 포착 필요 시
- **수신자를 GHA Secret으로 이전** — public 전환 등 특정 트리거 발생 시

---

*Log generated: 2026-04-16 after Phase 1 discuss-phase session.*
