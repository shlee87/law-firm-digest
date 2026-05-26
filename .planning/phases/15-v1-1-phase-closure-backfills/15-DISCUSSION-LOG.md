# Phase 15: v1.1 Phase Closure Backfills - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 15-v1-1-phase-closure-backfills
**Areas discussed:** Backfill method, Frontmatter convention, Commit shape, 11-03-SUMMARY 분량·구조
**Mode:** standard discuss (no --auto, no --power)
**Driver:** orchestrate_sh V2-discuss Round 6 (inline, rolled-back PHASE_LIST=[15,16])

---

## Gray Area Selection (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill method — verify-work vs hand-write (Recommended) | gsd-verifier subagent vs SPEC pin 기반 hand-write | ✓ |
| Frontmatter convention | Phase 12 컴벨 vs 별도 backfill 메타 추가 vs minimum | ✓ |
| Commit shape | 1 atomic / 2 (phase별) / 3 (파일별) | ✓ |
| 11-03-SUMMARY 분량·구조 | Light (~35) / Medium (~70) / Heavy (~130) | ✓ |

**User picked: ALL 4 areas.**

---

## Backfill method

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-write 직접 작성 (Recommended) | SPEC pin이 모든 evidence를 명시 — plan/execute가 SPEC을 task list로 사용 | ✓ |
| /gsd:verify-work 수행 후 결과 저장 | gsd-verifier subagent goal-backward / 세션 늘어남 / 11-03-SUMMARY는 별도 |  |
| Hybrid — SUMMARY hand, VERIFICATION verify-work | 의사결정 채널 둘 — 절충 과잉 |  |

**User's choice:** Hand-write 직접 작성
**Notes:** SPEC.md의 13개 grep/find/test acceptance가 audit rigor를 강제하므로 hand-write여도 quality gate는 동일.

---

## Frontmatter convention

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 12 컴벨 + backfill 메타 추가 (Recommended) | base 키 유지 + backfilled_at / original_completion_date / backfill_reason 3개 추가 | ✓ |
| Phase 12 컴벨 동일, backfill 메타 없이 | grep로 backfill 구분 불가 |  |
| 최소 minimum frontmatter만 | Phase 12와 일관성 깨짐 |  |

**User's choice:** Phase 12 컴벨 + backfill 메타 추가
**Notes:** backfill 사실 honest signaling. future audit이 `grep -lE "backfilled_at"`로 모든 backfill 파일 즉시 식별 가능.

---

## Commit shape

| Option | Description | Selected |
|--------|-------------|----------|
| 2 commits: Phase 10 / Phase 11 분리 (Recommended) | Commit 1 = 10-VERIFICATION / Commit 2 = 11-03-SUMMARY + 11-VERIFICATION (같은 phase dir, cross-reference 순서) | ✓ |
| 1 atomic commit | bisect 시 Phase 10 vs Phase 11 구분 불가 |  |
| 3 commits (파일별) | 11-VERIFICATION이 11-03-SUMMARY 참조 → 순서 의존성 위험 |  |

**User's choice:** 2 commits: Phase 10 / Phase 11 분리

---

## 11-03-SUMMARY 분량·구조

| Option | Description | Selected |
|--------|-------------|----------|
| Light (~30-40 lines, 11-02 스타일) (Recommended) | SPEC 필드 + cron uncomment 사실 + STATE.md acceptance + backfill 사유. 11-02와 동급 mechanical change | ✓ |
| Medium (~60-80 lines) | + Phase 13 split context 서술 + acceptance 디테일 |  |
| Heavy (~120+ lines, 11-01 스타일) | patterns_established / decisions 풍부 — 사후 backfill로 복원 불가 |  |

**User's choice:** Light (~30-40 lines, 11-02 스타일)
**Notes:** 11-03 plan의 실제 작업은 "schedule 블록 uncomment + STATE 한 줄 작성" 수준이라 light가 정직한 분량.

---

## Done gate

Operator는 4개 영역에서 모두 Recommended 선택 후 묵시적으로 CONTEXT.md 작성으로 진행 (orchestrate flow는 추가 "ready for context?" 게이트 없이 자연스럽게 CONTEXT 작성으로 넘어감).

---

## Claude's Discretion

- 10-VERIFICATION.md, 11-VERIFICATION.md 정확한 길이 (Phase 12 124 lines가 ceiling 아님)
- 11-VERIFICATION의 11-03-SUMMARY inline cross-reference 여부
- `original_completion_date:`의 표현 (단일 날짜 vs date range vs varies-per-plan)
- Phase 10 VERIFICATION의 `score` 표현 (Phase 12 "6/6 must-haves" 형식)
- 두 commit message의 정확한 wording

## Deferred Ideas

- 기존 SUMMARYs의 requirements-completed 빈/부재 frontmatter → Phase 16 META-01
- Phase 12 SUMMARYs CONF-06 cross-walk → Phase 16 META-01
- v1.1 REQUIREMENTS traceability flip → Phase 16 META-01
- 06-AUDIT.md regen → Phase 16 META-02
- v1.1 phase dir archival → 본 phase 외 (path 변경되면 cross-ref 깨짐)
- Phase 6/7/8/9/13 VERIFICATION 재검사 — audit이 gap 없음 확인 (별도 milestone)

## Subagent context (orchestrate flow)

- 이 discuss-phase는 `/gsd:orchestrate_sh`의 V2-discuss Round 6 인라인 dispatch 결과로 실행됨.
- mode_tier=V2-discuss, **rolled-back PHASE_LIST=[15,16]** — Phase 14가 outside rolled scope이 되어 Phase 15 dep이 pre-satisfied 처리.
- dep-aware rank = (1, -15) — Phase 15가 Phase 16을 unblock (rolled PL 내 1-hop).
- Phase 16은 strict dep-block으로 deferred — 다음 mode-transition gate에서 추가 roll-back (PHASE_LIST=[16])으로 처리 예정.
