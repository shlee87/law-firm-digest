# Phase 8: Hallucination Guard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 08-hallucination-guard
**Areas discussed:** GUARD-01 트리거 메커니즘, B3 path 호환, Demoted items email 표시, HALLUCINATION_CLUSTER_DETECTED footer 배치

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| GUARD-01 트리거 메커니즘 | Empty/<100/generic 3조건을 서버사이드로 막을지 / prompt로 막을지 / 하이브리드인지 | ✓ |
| B3 path 호환 | 현재 `summary_ko: null` 반환 B3 branch를 GUARD-01 title-verbatim 요구와 어떻게 맞출지 | ✓ |
| Demoted items email 표시 | cluster로 demote된 item을 이메일에서 어떻게 렌더링할지 | ✓ |
| HALLUCINATION_CLUSTER_DETECTED footer 배치 | 마커를 기존 footer 통합 / 신설 section / inline 중 어디에 둘지 | ✓ |

**User's note:** 모든 영역 선택.

---

## GUARD-01 트리거 메커니즘

| Option | Description | Selected |
|--------|-------------|----------|
| A: 하이브리드 (추천) | 빈 본문 / 100자 미만은 서버사이드 short-circuit, generic boilerplate는 Gemini prompt 규칙 | ✓ |
| B: 순수 프롬프트 | 3조건 전부 Gemini 판단. 단일 책임이지만 LLM 확률성 + quota 소모 | |
| C: 전부 서버사이드 + pattern library | 3조건 전부 결정론적. Generic phrase 사전 리스트 유지보수 부담 | |

**User's choice:** A. 하이브리드.

**Notes:**
- 처음엔 옵션만 제시했으나 user가 "이 가드가 무엇을 예방하기 위한 것인지 좀더 쉽게 설명해줘. 비개발자도 알아들을 수 있게"라고 요청.
- 이에 답하여 bkl UAT incident (9개 item 전부 동일 hallucination) 평문 설명 + Guard 1/Guard 2 두 겹 방어벽 개념 + 3가지 케이스(empty / <100 / generic) 시나리오를 제시한 뒤 재질문.
- User language memory: plain-language + concrete examples 선호 — 메모리 패턴대로 재설명 후 결정 수집.

---

## B3 path 호환 — null vs title verbatim

| Option | Description | Selected |
|--------|-------------|----------|
| A: B3 경로를 title verbatim으로 통일 (추천) | `summary_ko: null` → `summary_ko: item.title`. 템플릿 null-branch 제거. GUARD-01과 동일 shape | ✓ |
| B: B3 null 유지 + 새 title-verbatim 경로 별도 | 2가지 low-confidence 모양 공존. 네트워크 실패 vs 콘텐츠 실패 구별 가능 | |
| C: null 케이스 완전 제거 | 모든 low-confidence가 title verbatim. 템플릿의 "요약 없음" 메시지 완전 제거 | |

**User's choice:** A. B3 통일.

**Notes:** A와 C가 실질적으로 같은 방향이나 A는 "B3 path를 바꿈"에 초점, C는 "null 케이스 자체 제거"에 초점. 두 접근을 CONTEXT.md D-03/D-04에서 합쳐서 기술 — B3 branch를 title-verbatim으로 변경하면서 템플릿 null-branch도 같이 제거.

---

## Demoted items email 표시

| Option | Description | Selected |
|--------|-------------|----------|
| B: 접기 — 제목+링크만 (추천) | hallucinated 요약은 아예 숨기고 제목+원문 링크만 표시. False positive 시 손실 최소 | ✓ |
| A: 정상 표시 + 경고 배지 | 요약 그대로 두고 제목 옆 ⚠ 배지만 | |
| C: 개수만 표시 (완전 숨김) | "5개 item 품질 의심 — 제외" 개수만. 제목도 안 보임 | |
| D: 요약 그대로 + footer 경고 | 현상 유지에 가깝고 footer에만 신호. 약한 조치 | |

**User's choice:** B. 접기.

**Notes:** "aggressive failure detection / loudest alarm" 메모리 선호와 일치. 사용자가 가짜 요약을 읽지 않게 하는 것이 1차 목표.

---

## HALLUCINATION_CLUSTER_DETECTED footer 배치

| Option | Description | Selected |
|--------|-------------|----------|
| A: 별도 `<footer class="data-quality">` section 신설 (추천) | 기존 failed-firms footer 아래 별도 section. Phase 10 DQOBS 확장 자리 자연스러움 | ✓ |
| B: 기존 footer에 subsection 통합 | 하나의 footer에 [수집 실패] [품질 경고] subsection. 이슈 섞임 | |
| C: firm 섹션 header에 inline | 해당 firm 섹션 헤더 옆 ⚠. 정보 중복 (섹션 이미 접혀있음) | |

**User's choice:** A. 별도 section 신설.

**Notes:** Phase 10 (DQOBS-01) per-firm body-length + confidence 분포 metric을 확장할 자리로 미리 분리.

---

## Claude's Discretion

- Layer 2 prompt 문구 정확한 phrasing
- 접기 UI HTML 구조 (`<details>` vs `<ul>` — Gmail 호환성 고려)
- Cluster detector 함수를 run.ts 인라인 vs 별도 파일 분리
- Fixture 테스트의 real body 합성 vs 실제 HTML 발췌
- Layer 1 short-circuit 반환의 summaryModel 값 세분화 여부

## Deferred Ideas

- Generic-boilerplate 결정론적 pattern library — v1.2
- Cross-firm cluster detection — v1.2
- Cluster 감지 후 recovery 로직 — v1.2
- Per-item confidence 배지 상시 렌더링 — Phase 10 선택
- Firm-level "50% low confidence면 경고" (DQOBS-02) — Phase 10
- Layer 1 threshold 튜닝 (100자 적정성) — Phase 10 관찰 후 재평가
