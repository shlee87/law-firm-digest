# Phase 14: Scheduling Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 14-scheduling-coverage
**Areas discussed:** Commit shape, CLAUDE.md policy 위치, settings.yaml schedule block 처리, Verification approach
**Mode:** standard discuss (no --auto, no --power)
**Driver:** orchestrate_sh V2-discuss Round 4 (inline)

---

## Gray Area Selection (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Commit shape & plan따지기 힌트 (Recommended) | 5개 requirement을 몇 commit으로 — atomic / SCHED-01·02 분리 / file-shape-기반 | ✓ |
| CLAUDE.md policy 위치 | freshness policy + cron 절차를 기존 "## Conventions" / 새 top-level / Project Constraints 어디에 | ✓ |
| settings.yaml schedule block 처리 | zod schema 유지하면서 블록을 (a) header만 정리 / (b) 값 축소 / (c) 완전 제거 | ✓ |
| Verification approach | weekly만 dispatch (SPEC min) / daily+weekly 둘 다 + STATE 노트 / 둘 다 + 1주 production observation | ✓ |

**User picked: ALL 4 areas.**

---

## Commit shape

| Option | Description | Selected |
|--------|-------------|----------|
| 2 commits: SCHED-01 → SCHED-02 (Recommended) | 1st = functional (cron 변경), 2nd = mechanical (스크립트 제거 + 문서). bisect 경계 명확 | ✓ |
| 1 atomic commit (전체 1회에) | Phase 전체 한 commit. 디바이스 조각 없음 / bisect 시 구분 불가 |  |
| 5 commits (requirement별) | requirement당 1 commit. 추적성 최대 / R-03(변경 없음 증명)은 commit이 안 생김 / solo project 과잉 |  |

**User's choice:** 2 commits: SCHED-01 → SCHED-02
**Notes:** Plan-phase는 plan 2-3개로 구성 (SCHED-02 cleanup을 script+config / CLAUDE.md 분리도 가능).

---

## CLAUDE.md policy 위치

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 "## Conventions" 아래 subsection (Recommended) | 비어 있는 Conventions 섹션 활용. Phase 16 audit:firms policy도 같은 자리 → conventions 누적 일관성 | ✓ |
| 새 top-level "## Scheduling" 섹션 | cron 관련 정보 자체 완결성 / Phase 16과 구조 불일치 |  |
| Project-level "## Project" 하위 | 기존 Constraints 아래 / 일상 운영 절차에 부적합 |  |

**User's choice:** 기존 "## Conventions" 아래 subsection
**Notes:** subsection 정확한 제목은 Claude's Discretion (`### Workflow scheduling` 또는 `### Cron edit policy` 등).

---

## settings.yaml schedule block 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 블록 유지 + header·코멘트를 "현재 미사용" 표시 (Recommended) | zod parse OK / "schedule은 yml에서 관리" pointer / sync-schedule 언급 제거 / 가장 명확 | ✓ |
| 블록 축소 + 값을 placeholder로 | 최소 placeholder 값 + 코멘트 / "이 값이 잠재적으로 의미 있다"는 혼동 가능 |  |
| 블록 완전 제거 + zod schema도 optional로 | SPEC out-of-scope 위반 — zod schema 수정은 v1.3+로 명시 |  |

**User's choice:** 블록 유지 + header·코멘트를 "현재 미사용" 표시
**Notes:** SPEC가 zod schema 수정을 out-of-scope으로 lock했으므로 옵션 (c)는 선택 불가. 새 header 코멘트 정확한 문구는 Claude's Discretion.

---

## Verification approach

| Option | Description | Selected |
|--------|-------------|----------|
| daily + weekly 둘 다 dispatch + STATE.md 노트 (Recommended) | `gh workflow run` 두 번 / 양쪽 yml syntax 즉시 검증 / Phase 11 D-03 acceptance note 패턴 | ✓ |
| weekly만 dispatch (SPEC minimum) | SPEC minimum / daily yml 오류는 자연 trigger까지 모름 |  |
| 둘 다 dispatch + 1주 production observation | 1주 history 직접 확인 / phase가 1주 봉쇄됨 / SPEC이 이미 1주 봉쇄 거부 |  |

**User's choice:** daily + weekly 둘 다 dispatch + STATE.md 노트
**Notes:** STATE.md 노트 형식 — `YYYY-MM-DD Phase 14 cron split: daily/weekly workflow_dispatch 검증 완료 — daily run ID {N1}, weekly run ID {N2}. 다음 자연 schedule trigger 확인은 1주 내 production history에서.`

---

## Done gate

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context (Recommended) | CONTEXT.md 작성 + commit + V2-discuss 다음 라운드로 복귀 | ✓ |
| Explore more gray areas | settings.yaml 정확한 문구 / yml 코멘트 국어 선택 / plan-phase plan 개수 hint 등 |  |

**User's choice:** I'm ready for context.

---

## Claude's Discretion

다음 항목은 plan-phase / executor 재량:
- CLAUDE.md `### Workflow scheduling` 정확한 제목
- settings.yaml schedule 블록 새 header 코멘트 정확 문구
- daily.yml / weekly.yml header comment (cron line 위)의 새 문구
- 두 commit message의 정확한 wording (스타일은 Phase 13 commits 참조)
- src/config/loader.ts의 `toCron()` + 위 코멘트(line 85-86) 제거 시 spacing/alignment

## Deferred Ideas

- src/config/schema.ts의 SettingsSchema.schedule 제거 — v1.3+
- settings.yaml schedule 블록 자체 제거 — v1.3+
- audit:firms CI 통합 — REQUIREMENTS out-of-scope
- cron 변경 자동 알람 — 기존 Issue-on-failure로 충분

## Subagent context (orchestrate flow)

- 이 discuss-phase는 `/gsd:orchestrate_sh`의 V2-discuss Round 4 인라인 dispatch 결과로 실행됨.
- dep-aware rank = (1, -14) — Phase 14가 Phase 15를 unblock하므로 V2-discuss에서 최우선 인라인 픽.
- Phase 15/16은 strict dep-block으로 deferred — 다음 mode-transition gate에서 roll-back으로 처리 예정.
