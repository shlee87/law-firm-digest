# Phase 16: v1.1 Metadata Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 16-v1-1-metadata-hygiene
**Areas discussed:** Traceability 표 형태 & evidence 위치, Frontmatter field shape, CLAUDE.md policy subsection 제목, audit:firms 재실행 시점 + commit shape
**Mode:** standard discuss (no --auto, no --power)
**Driver:** orchestrate_sh V2-discuss Round 8 (inline, further-rolled PHASE_LIST=[16])

---

## Gray Area Selection (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Traceability 표 형태 & evidence 위치 (Recommended) | 4th column / Status inline / 표 아래 단락 | ✓ |
| Frontmatter field shape | plan별 1:1 block list / phase 전체 동일 / inline | ✓ |
| CLAUDE.md policy subsection 제목 + 컨텍스트 | `### Audit freshness (audit:firms)` / `### Firm config audit` / `### Configuration freshness` | ✓ |
| audit:firms 재실행 시점 + commit shape | 3 commits (audit commit3에) / 2 commits / 1 atomic | ✓ |

**User picked: ALL 4 areas.**

---

## Traceability 표 형태

| Option | Description | Selected |
|--------|-------------|----------|
| 4번째 "Evidence" column 추가 (Recommended) | 표 한 눈에 row + status + evidence / grep 깔끔 / v1.0·v1.2 row도 4-col 확장 | ✓ |
| Status 셀에 inline evidence | column 수 유지 / 자동화 grep 패턴 깨짐 |  |
| 표 아래 evidence 단락 | 표 좁음 / evidence와 row 분리 cross-ref 추가 단계 |  |

**User's choice:** 4번째 "Evidence" column 추가
**Notes:** CONF-06 row의 Phase 매핑도 Phase 2 → Phase 12로 정정.

---

## Frontmatter field shape

| Option | Description | Selected |
|--------|-------------|----------|
| plan별 1:1 매핑, YAML block list (Recommended) | 10-01«DQOBS-01 / 10-02«DQOBS-02 / 10-03«DQOBS-03 / 11-01,11-02 «RESUME-01. block list 포맷 (Phase 11 기존 스타일) | ✓ |
| Phase 전체 REQ를 모든 SUMMARY에 동일 | 결정 시간 최소 / 추적 해상도 하락 |  |
| inline 배열 + plan별 1:1 | Phase 12 스타일 / Phase 11 block list와 풍경 차이 |  |

**User's choice:** plan별 1:1 매핑, YAML block list
**Notes:** 정확한 매핑은 plan-phase에서 PLAN 본문 + 11-03 PLAN must_haves + 11-VERIFICATION 본문 대조 후 확정.

---

## CLAUDE.md policy subsection 제목

| Option | Description | Selected |
|--------|-------------|----------|
| `### Audit freshness (audit:firms)` (Recommended) | 명령 이름 괄호 포함 / grep `audit:firms` 즉시 발견 / Phase 14 `### Workflow scheduling`과 구조 동일 | ✓ |
| `### Firm config audit` | 커맨드 이름 제목 제외 / 본문 grep 의존 |  |
| `### Configuration freshness` | 추상화 / future configs 추가 시 cohort 갈래 위험 |  |

**User's choice:** `### Audit freshness (audit:firms)`
**Notes:** 단락 구성 (a)Trigger (b)Command (c)Commit 책임 — Phase 14 패턴 mirror.

---

## audit:firms 재실행 시점 + commit shape

| Option | Description | Selected |
|--------|-------------|----------|
| 3 commits, audit:firms는 commit 3에 (Recommended) | Commit 1 traceability / Commit 2 SUMMARYs+cross-walk / Commit 3 audit+policy. bisect 단위 명확. | ✓ |
| 2 commits (META-01 / META-02) | META-01 하나에 traceability + SUMMARYs 묶기 / ~7 파일 diff 가독성 하락 |  |
| 1 atomic commit | bisect 불가, audit:firms 실행과 문서 수정 섞임 |  |

**User's choice:** 3 commits, audit:firms는 commit 3에 포함

---

## Claude's Discretion

- Evidence column 헤더 정확한 텍스트 (`Evidence` vs `Evidence (commit / run / path)`)
- v1.0 / 미flipped row의 Evidence 셀 표시 (빈 셀 vs `—` vs `n/a`)
- 본문 정의 라인(line 63, 142~149)에 evidence inline 추가 여부 (편향: 표에만)
- 11-01 SUMMARY가 RESUME-01만인지 RESUME-02도 부분 기여하는지 plan 본문 확인 후 매핑
- 12-02 SUMMARY frontmatter `requirements-completed:` 빈 배열 채울 SPEC-12-REQ-N IDs
- CLAUDE.md subsection 한국어/영어 정확한 문구
- 3 commit message 정확한 wording

## Deferred Ideas

- v1.0 traceability evidence backfill → v1.3+
- `SettingsSchema.schedule` 제거 → Phase 14 deferred
- phase dir archival → 본 phase 외 (path 변경 시 META cross-ref 깨짐)
- `requirements-completed:` CI 검출 → over-engineering
- audit:firms CI 통합 → REQUIREMENTS out-of-scope (CLAUDE.md 단락에 "의도적 보류" 명시)
- 06-AUDIT.md "next-due" 일자 자동 계산 → future enhancement

## Subagent context (orchestrate flow)

- 이 discuss-phase는 `/gsd:orchestrate_sh`의 V2-discuss Round 8 인라인 dispatch 결과로 실행됨.
- mode_tier=V2-discuss, **further-rolled PHASE_LIST=[16]** — Phase 14/15 둘 다 outside rolled scope로 빠지면서 Phase 16의 dep [15]가 pre-satisfied 처리.
- dep-aware rank = (0, -16) — rolled PL 내 유일 후보, downstream 없음.
- 이 phase 완료로 V2-discuss 전체 단계 완전 종료 → 원래 PHASE_LIST [14,15,16] 복귀 + V2-plan transition gate 도달.
