# Phase 17: Summary Failure UX Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 17-summary-failure-ux-cleanup
**Mode:** fast (inline SPEC + 3 batched gray areas)
**Areas discussed:** Failed-render strategy, Badge wording, retryDelay scope

---

## Failed-render strategy

| Option | Description | Selected |
|--------|-------------|----------|
| B — body omit + 미니 태그 | `renderArticle()`에 failed 분기 추가, body `<p>` 자체를 drop, 제목 아래 작은 monospace 태그. 'failed' state 의미 보존. 변경 파일: `src/compose/templates.ts` 한 곳. | ✓ |
| A — demoted block 강등 | `renderDemotedBlock`을 재사용. 코드 추가 거의 없음. 단점: 'failed' + 'cluster-suspect' 시각적으로 같아져 운영자가 원인 구분 어려움. | |

**User's choice:** B
**Notes:** 3-tier failure semantics(`skipped` / `failed` / `demoted`)의 시각적 구별을 유지하는 것이 운영 관점에서 더 중요. demoted 블록을 conflation하면 cluster detector 동작과 Gemini 실패를 같은 화면으로 묶게 됨.

---

## Badge wording

| Option | Description | Selected |
|--------|-------------|----------|
| ⚠ 요약 일시 불가 | 기존 배지 톤 일관성. "일시"가 일시적 현상 암시 → 수신자 안심. "원문 읽기 →" 링크가 카드 하단에 이미 있어 별도 action 안내 불필요. | ✓ |
| ⚠ 요약 실패 | 현재 문구 유지 (단 raw JSON 제거). 검색성과 특이성 명확. | |
| ⚠ 요약 표시 자제 | AI failure를 드러내지 않는 수동적 표현. 투명성 떨어지는 트레이드오프. | |

**User's choice:** ⚠ 요약 일시 불가
**Notes:** 기존 ⚠ 본문 없음 / ⚠ 품질 의심 / ⚠ 30일 이상 새 글 없음 의 톤과 매치. "일시"가 핵심.

---

## retryDelay scope

| Option | Description | Selected |
|--------|-------------|----------|
| 포함 | P17에 `src/summarize/gemini.ts` 변경까지 묶음. onFailedAttempt에서 retryDelay 파싱 → sleep. unit test 1-2개. ~30 LOC. 2026-05-27 RPM burst 재발 시 자동 회복. | ✓ |
| 별도 backlog (P18 또는 999.x) | P17 = UX 전용으로 좁힘. 1-2 plan으로 끝. 동적 retry 로직은 별도 phase에서 명시적으로. 트레이드오프: 같은 실패 다음 RPM burst에 재발 위험 + 같은 파일 두 번 손대는 작업. | |

**User's choice:** 포함
**Notes:** 증상(UX) + 근본 원인(retry policy)을 한 phase에서 같이 해결. SPEC.md 옵션 5도 본 결정에 따라 "포함" 으로 lock.

---

## Claude's Discretion

- 실패 태그의 정확한 색상 / margin / padding 값 — 기존 mono-meta 스타일 mirror (no UI-SPEC.md required).
- `errorDetails[].retryDelay` 파싱 방식 — `@google/genai` SDK 1.49.x error shape 확인 후 결정.
- D-05 회귀 테스트 fixture의 정확한 샘플 — 2026-05-27 실제 에러 본문 발췌 + 합성 fixture.
- CLAUDE.md RPM 표 갱신 시 sub-paragraph 정확한 문구 — 의도만 lock.

## Deferred Ideas

- 다중 fallback 모델(gemini-2.5-pro 등) — free-tier 제약 위반 가능, v1.3+ 재논의.
- 실패 item carry-over — stateful queue 필요, 본 phase 초과.
- 누적 실패 dashboard — observability 확장, 별도 phase.
- 사용자 직접 retry trigger UI — 본 프로젝트는 cron-only.
- 다국어 fail 문구 — 본 다이제스트는 메타 UI 단일 한국어.
