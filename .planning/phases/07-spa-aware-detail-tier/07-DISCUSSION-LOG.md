# Phase 7: SPA-Aware Detail Tier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 07-spa-aware-detail-tier
**Areas discussed:** Phase 7 scope 경계, js-render firms migration 전략, detail_tier='js-render' 동작 semantics, kim-chang 활성화 방식

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 7 scope 경계 | DETAIL-01~05만 다룰지, 아니면 06-AUDIT.md가 Phase 7로 라우팅한 fix-selector firms(logos/skadden/lee-ko/barun)까지 포함할지 | ✓ |
| js-render firms migration 전략 | 기존 4개 js-render firms(lee-ko/yoon-yang/latham/barun)의 detail_tier 처리 — type-gate 제거 vs 유지, 명시적 YAML vs auto-default | ✓ |
| detail_tier='js-render' 동작 semantics | 항상 Playwright vs static 먼저 + 짧으면 fallback | ✓ |
| kim-chang 활성화 방식 | DETAIL-04 literal vs 06-AUDIT.md monitor 라우팅 충돌 해결 | ✓ |

**User's choice:** 4개 모두 논의.

---

## Phase 7 scope 경계

| Option | Description | Selected |
|--------|-------------|----------|
| 모두 Phase 7에 포함 | detail_tier + 4개 selector fix를 하나의 Phase 7로. 06-AUDIT.md 라우팅과 일치. | ✓ |
| Phase 7은 detail_tier만, selector는 Phase 7.1 신설 | decimal phase(7.1)으로 분리. ROADMAP SC와 일치 유지. | |
| Phase 7은 detail_tier만, selector는 Phase 10 deferred | DQOBS가 감지 시 대응. | |
| Phase 7은 detail_tier + logos/skadden list-selector만 | lee-ko/barun detail은 Phase 8 GUARD에 위임. | |

**User's choice:** 모두 Phase 7에 포함.
**Notes:** "audit에서 문제 보이는 firm 다같이 잡고 cron 재개" 관점에서 일관된 단위로 처리.

---

## js-render firms migration 전략

| Option | Description | Selected |
|--------|-------------|----------|
| B. YAML에 6개 firm 명시 (Recommended) | bkl/kim-chang/lee-ko/yoon-yang/latham/barun 전부 detail_tier: 'js-render' 명시. default는 순수하게 'static'. type-gate 제거. | ✓ |
| A. Schema가 type에서 추론 | zod superRefine에서 type==='js-render'이면 detail_tier default='js-render'. YAML 수정 불필요. | |
| D. type-gate 제거 + audit으로 잡기 | YAML 미수정 firm은 audit에서 detail-empty로 바로 드러남. cron paused라 리스크 낮음. | |
| C. 두 조건 OR (legacy+new) | type==='js-render'과 detail_tier==='js-render' OR. YAML 0줄 수정. 단점: semantic 중복. | |

**User's choice:** B. YAML에 6개 firm 명시.
**Notes:** 사용자가 "plain language + concrete scenario"로 재설명 요청 후 선택. 비개발자도 YAML만 보고 어느 firm이 js-detail인지 즉시 파악 가능 + memory 'aggressive failure detection' 선호와 정렬.

---

## detail_tier='js-render' 동작 semantics

| Option | Description | Selected |
|--------|-------------|----------|
| 항상 Playwright (Recommended) | static fetch 스킵, 바로 Playwright. DETAIL-02 literal 일치. bkl의 long-but-identical 케이스 확실히 해결. +2분/run. | ✓ |
| static 먼저 + 짧으면 fallback | 기존 threshold<200 로직 유지. Playwright 비용 절감. 단 bkl 케이스 안 잡힘. | |
| 항상 Playwright + static과 length 비교해 더 긴 쪽 | 둘 다 가져오고 비교. 2배 요청, bkl 여전히 위험. | |

**User's choice:** 항상 Playwright.
**Notes:** bkl이 실제로 generic-landing HTML이 3,000자라 threshold fallback으로는 못 잡는다는 구체 증거 제시 후 선택.

---

## kim-chang 활성화 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 활성화 + 검증 + 실패 시 원인 조사까지 Phase 7 (Recommended) | detail_tier: 'js-render' 켜고 pnpm audit:firms 검증. Playwright도 실패하면 root-cause(URL template/WAF) 조사 Phase 7 내에서 수행. | ✓ |
| 활성화 + 검증만, 실패 시 Phase 10/11 defer | 06-AUDIT.md monitor 라우팅 존중. 실패하면 Phase 11 cron gate blocker로 남김. | |
| 활성화 보류, DETAIL-04 scope 축소 | bkl만 activate, kim-chang은 Phase 10 monitor로 이동. REQUIREMENTS.md 갱신. | |

**User's choice:** 활성화 + 검증 + 원인 조사까지 Phase 7.
**Notes:** DETAIL-04 literal 준수 + "Phase 10은 observability이지 fix가 아니다" 논리로 Phase 7에 포함 확정.

---

## Claude's Discretion (user가 위임한 영역)

- selector-fix 4개 firms 접근 방식 (firm당 1 plan vs 묶기 vs probe-driven): planner 재량.
- logos/skadden detail_tier 프로모션 판단 (list selector 수정 후 detail이 여전히 empty면): planner + Phase 7 실행 중 판단.
- lee-ko/barun body selector 형태 (firm-specific CSS vs util.ts 기본 체인): 실제 HTML 관찰 후 결정.
- kim-chang root-cause 조사 방법론 (DevTools 수동 / probe-js-render.ts 재사용 / 신규 script): planner 재량.
- YAML 주석 포맷: 기존 firms.yaml 주석 컨벤션 따름.
- enrichBody.ts 분기 구조 스타일 (if/else vs early-return): readability 기준.

## Deferred Ideas (Phase 7 외 기록)

- Per-firm detail_tier 세분화 (`js-render-with-wait` 등) — v1.2
- shared BrowserContext per run (vs per-item) — v1.2
- Per-firm timeout 커스터마이즈 — v1.2
- Concurrent detail fetches within firm — 제외 (politeness 충돌)
- `detail_tier: 'auto'` 자동 감지 — v1.2 (4-signal 기반)
- detail_tier='static' firms에 short-body fallback — 제외 (semantic 혼탁)
- AI 기반 selector auto-remediation — v1.2
- kim-chang 완전 차단 시 대체 firm — v1.2 milestone

## External Research

없음 — 모든 결정은 기존 코드베이스(`src/pipeline/enrichBody.ts`, `src/pipeline/run.ts`, `src/config/schema.ts`, `config/firms.yaml`)와 prior context(06-AUDIT.md, 06-CONTEXT.md, v1.0-data-quality-audit.md)로부터 도출됨.
