# Phase 16: v1.1 Metadata Hygiene — Specification

**Created:** 2026-05-26
**Ambiguity score:** 0.134 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

v1.1 archived metadata 3종(traceability table, plan SUMMARY frontmatter, 06-AUDIT.md)이 실제 shipped 상태와 정확히 일치하고, `pnpm audit:firms` 재실행 시점을 CLAUDE.md의 단일 정책 단락이 정의한다.

## Background

v1.1 milestone audit (`.planning/milestones/v1.1-MILESTONE-AUDIT.md`, 2026-05-23)는 코드가 정상 출고된 상태에서도 metadata가 다음 3가지 방식으로 drift되어 있다고 보고했다:

1. **traceability `[ ]` 미체크** — `.planning/milestones/v1.1-REQUIREMENTS.md` 하단 traceability table에 DQOBS-01(line 253), DQOBS-02(line 254), DQOBS-03(line 255), RESUME-01(line 256), RESUME-02(line 257), CONF-06(line 218) 6개가 여전히 `Pending`/`[ ]`. 본문 REQ 정의 라인(63/142–144/148–149)도 동일.

2. **`requirements-completed:` frontmatter 부재 또는 비어있음** — Phase 10 SUMMARY 3개(10-01, 10-02, 10-03)와 Phase 11 SUMMARY 2개(11-01, 11-02)는 frontmatter에 `requirements-completed:` field 자체가 없음. Phase 12 SUMMARY 2개(12-01, 12-02)는 field는 있지만 phase-local `SPEC-12-REQ-*` IDs만 채워져 있고 top-level `CONF-06`과의 cross-walk이 없음(12-01에는 `SPEC-12-REQ-{1,2,3,6}` 명시, 12-02는 비어있음).

3. **`06-AUDIT.md` stale** — `.planning/phases/06-firm-audit-probe/06-AUDIT.md`(생성 2026-04-21T04:54:48.088Z)이 firms.yaml에서 2026-05-18에 제거된 `freshfields` 행을 여전히 포함. AUDIT-03 deliverable("re-runnable artifact reflecting current config")이 실효적으로 깨진 상태. `config/firms.yaml:181`이 제거 사실을 코멘트로 남겼지만 audit artifact 재생성 절차는 문서화 부재 — 누가, 언제 다시 돌려야 하는지에 대한 정책 없음.

Phase 15(v1.1 Phase Closure Backfills)가 Phase 10/11의 VERIFICATION.md를 backfill 완료하면, META-01의 traceability flip에 인용할 "evidence 출처"가 그 VERIFICATION 파일들로 확정 가능 — 따라서 Phase 16은 Phase 15 산출물을 cross-reference할 수 있는 시점에 실행된다(`Depends on: Phase 15`). Phase 12 VERIFICATION은 이미 `status: passed`(2026-05-23 재검증) — 이미 인용 가능.

freshness policy 위치는 Round 1에서 CLAUDE.md로 lock — 06-AUDIT.md는 `pnpm audit:firms` 재실행 시 header까지 regenerate될 가능성이 있어 정책이 사라질 위험이 있고, CLAUDE.md는 GSD/Claude 세션이 자동 로드해 firms.yaml 편집 직후 자연스러운 루틴으로 연결된다.

## Requirements

1. **Traceability flip (v1.1 reqs)**: `v1.1-REQUIREMENTS.md` traceability table의 6개 행이 `[x] Complete`로 갱신되고, 본문 REQ 정의 줄도 `- [x]`로 갱신된다.
   - Current: traceability table 253~257행이 `| {REQ-ID} | Phase {N} | Pending |`, CONF-06 218행이 `| CONF-06 | Phase 2 | Pending |`. 본문 정의 라인(63, 142–144, 148–149)이 `- [ ]`.
   - Target: 6개 모두 `Complete` (혹은 동등한 `[x]` 표기) + 해당 phase reference 정확. CONF-06의 Phase 매핑은 `Phase 12`로 갱신(v1.1 audit이 명시: "CONF-06 satisfied by Phase 12 topic filter"). 본문 정의 라인 6개가 `- [x]`.
   - Acceptance: `grep -nE "DQOBS-01.*Pending|DQOBS-02.*Pending|DQOBS-03.*Pending|RESUME-01.*Pending|RESUME-02.*Pending|CONF-06.*Pending" .planning/milestones/v1.1-REQUIREMENTS.md` → 0 매치. `grep -cE "^\- \[ \] \*\*(DQOBS-0[123]|RESUME-0[12]|CONF-06)\*\*" .planning/milestones/v1.1-REQUIREMENTS.md` → 0. `grep -nE "\| CONF-06 \|" .planning/milestones/v1.1-REQUIREMENTS.md` → "Phase 12" 포함한 줄.

2. **Phase + commit evidence per flipped REQ**: 각 flipped row 옆 또는 인접 부분에 phase + commit 증거가 명시된다.
   - Current: traceability table에 evidence column 없음.
   - Target: 변경 방식은 discuss-phase 결정(예: 4번째 컬럼 추가 vs Status column에 commit 단축 hash inline vs evidence 단락 추가). 단, DQOBS-01은 `260523-mtz` quick task + commit `04a572e` 인용 필수, RESUME-01은 GHA run `26335283814` 또는 `26335329895` 인용 필수, RESUME-02는 `daily.yml:27` + `weekly.yml:30` 인용 필수, CONF-06은 Phase 12 + 12-VERIFICATION.md 인용 필수.
   - Acceptance: `grep -E "04a572e|260523-mtz" .planning/milestones/v1.1-REQUIREMENTS.md` → 매치. `grep -E "26335283814|26335329895" .planning/milestones/v1.1-REQUIREMENTS.md` → 매치. `grep -E "daily\.yml:?27|weekly\.yml:?30" .planning/milestones/v1.1-REQUIREMENTS.md` → 두 reference 모두 매치. `grep -E "12-VERIFICATION|Phase 12" .planning/milestones/v1.1-REQUIREMENTS.md` 가 CONF-06 인접 컨텍스트에 매치.

3. **Phase 10 SUMMARY frontmatter backfill**: 3개 SUMMARY에 `requirements-completed:` field가 신설되고, 실제 닫은 DQOBS REQ-ID가 채워진다.
   - Current: `.planning/phases/10-data-quality-observability/10-01-SUMMARY.md`, `10-02-SUMMARY.md`, `10-03-SUMMARY.md` 3개 모두 frontmatter에 `requirements-completed:` field 부재(awk 검색 결과 0 라인).
   - Target: 3개 모두 frontmatter에 `requirements-completed:` 추가 + plan별 합리적 분담(예: 10-01=DQOBS-01, 10-02=DQOBS-02/03, 10-03=DQOBS-03 등 — 정확한 매핑은 discuss-phase에서 SUMMARY 본문/PLAN 본문 대조로 결정). 합집합으로 DQOBS-01, DQOBS-02, DQOBS-03 3개 ID 모두 최소 한 SUMMARY에 등장.
   - Acceptance: `for f in .planning/phases/10-data-quality-observability/*-SUMMARY.md; do awk '/^---$/{c++; next} c==1 && /requirements-completed/{found=1} END{exit !found}' "$f" || echo MISSING:"$f"; done` → 0 MISSING. `grep -lE "DQOBS-01" .planning/phases/10-data-quality-observability/*-SUMMARY.md` → 최소 1개. `grep -lE "DQOBS-02" ...` → 최소 1개. `grep -lE "DQOBS-03" ...` → 최소 1개.

4. **Phase 11 SUMMARY frontmatter backfill**: 11-01, 11-02 SUMMARY에 `requirements-completed:` field가 신설된다.
   - Current: `.planning/phases/11-cron-resumption-gate/11-01-SUMMARY.md`와 `11-02-SUMMARY.md` 2개 frontmatter에 `requirements-completed:` field 부재.
   - Target: 2개 모두 frontmatter에 field 신설. 11-01 = URL/TLS 복원 plan, 11-02 = TLS chain fix plan, 11-03(Phase 15가 생성)이 cron uncomment = RESUME-02. 따라서 RESUME-01 evidence 분배는 11-01/11-02/11-03 본문 검토 후 결정 — 단 모든 REQ-ID는 최소 한 SUMMARY에 등장해야 합집합 evidence가 성립. (11-03-SUMMARY는 Phase 15에서 RESUME-01/02 둘 다 인용 가능하게 작성하기로 Phase 15 SPEC에서 lock.)
   - Acceptance: `for f in .planning/phases/11-cron-resumption-gate/11-01-SUMMARY.md .planning/phases/11-cron-resumption-gate/11-02-SUMMARY.md; do awk '/^---$/{c++; next} c==1 && /requirements-completed/{found=1} END{exit !found}' "$f" || echo MISSING:"$f"; done` → 0 MISSING. 11-01과 11-02의 `requirements-completed:` 합집합이 RESUME-01 또는 RESUME-02 중 최소 1개 포함.

5. **Phase 12 SUMMARY CONF-06 cross-walk**: 12-01, 12-02 SUMMARY 본문에 "SPEC-12-REQ-* ↔ CONF-06" cross-walk 단락이 추가된다.
   - Current: 12-01 frontmatter `requirements-completed: [SPEC-12-REQ-1, SPEC-12-REQ-2, SPEC-12-REQ-3, SPEC-12-REQ-6]`, 12-02는 비어있음. 둘 다 top-level CONF-06과의 명시적 연결 없음.
   - Target: 12-01, 12-02 SUMMARY 본문(또는 frontmatter 추가 메모 필드)에 "Cross-walk: SPEC-12-REQ-{N..} satisfies top-level CONF-06 ({선택적 keyword filter})." 한 줄 이상. 기존 frontmatter `requirements-completed:` 배열은 유지(phase-local 히스토리 보존). 12-02도 본문 SPEC-12-REQ 매핑 추가.
   - Acceptance: `grep -lE "Cross-?walk.*CONF-06|CONF-06.*satisfied|satisfies.*CONF-06" .planning/phases/12-topic-based-filter/12-01-SUMMARY.md .planning/phases/12-topic-based-filter/12-02-SUMMARY.md` → 두 파일 모두 매치. `grep -E "SPEC-12-REQ" .planning/phases/12-topic-based-filter/12-02-SUMMARY.md` → 매치.

6. **`06-AUDIT.md` regenerated from current firms.yaml**: `pnpm audit:firms` 재실행으로 `freshfields` 행이 제거된 fresh artifact가 생성된다.
   - Current: `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 13행이 `| freshfields | rss | OK | 40 | n/a | n/a |`. `config/firms.yaml` 181행이 "(freshfields removed by user 2026-05-18)" 코멘트로 firm 제거 사실 보존.
   - Target: `06-AUDIT.md`에 freshfields 행 부재. header의 `_Generated by_ `pnpm audit:firms` _at_ {TIMESTAMP}` 라인이 Phase 16 실행 일자(2026-05-26 이후)로 갱신.
   - Acceptance: `grep -nE "^\| freshfields " .planning/phases/06-firm-audit-probe/06-AUDIT.md` → 0 매치. `grep -nE "Generated by.*audit:firms.*at" .planning/phases/06-firm-audit-probe/06-AUDIT.md` 가 `2026-05-26` 또는 그 이후 타임스탬프를 포함한 줄을 반환. `pnpm audit:firms` 명령 자체가 0 exit로 성공 — 재실행 가능 상태 확인.

7. **Freshness policy in CLAUDE.md**: `pnpm audit:firms` 재실행 trigger와 책임자를 CLAUDE.md 한 단락에서 정의한다.
   - Current: `CLAUDE.md`(global + project)에 `audit:firms` 또는 `06-AUDIT.md` 관련 정책 부재.
   - Target: project `CLAUDE.md`(`/Users/seonghoonyi/Documents/projects/legalnewsletter/CLAUDE.md`)에 "Audit freshness policy" 또는 동등 헤더 단락 추가. 단락은 최소 (a) trigger("`config/firms.yaml` 편집 후" 또는 명시된 주기), (b) command(`pnpm audit:firms`), (c) commit 책임("audit 실행자가 06-AUDIT.md 변경분을 같은 PR에서 commit") 3가지를 포함.
   - Acceptance: `grep -niE "audit:firms|06-AUDIT" CLAUDE.md` → 매치. 매치된 단락에 trigger + command + commit 책임 3요소가 모두 등장 (다단계 검증은 verify-work이 prose 단락을 직접 확인).

## Boundaries

**In scope:**
- `.planning/milestones/v1.1-REQUIREMENTS.md`의 traceability table + 본문 REQ 라인 6개 (DQOBS-01/02/03, RESUME-01/02, CONF-06) `[ ]` → `[x]` 갱신
- 동 파일에 phase + commit/run-ID/file:line evidence 6건 명시
- `.planning/phases/10-data-quality-observability/10-{01,02,03}-SUMMARY.md` frontmatter에 `requirements-completed:` field 신설
- `.planning/phases/11-cron-resumption-gate/11-{01,02}-SUMMARY.md` frontmatter에 `requirements-completed:` field 신설
- `.planning/phases/12-topic-based-filter/12-{01,02}-SUMMARY.md` 본문에 "SPEC-12-REQ-* ↔ CONF-06" cross-walk 단락 추가
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 재생성 (via `pnpm audit:firms`)
- 프로젝트 `CLAUDE.md`에 audit:firms freshness policy 단락 추가

**Out of scope:**
- v1.0 REQUIREMENTS(`milestones/v1.1-REQUIREMENTS.md`에 인용된 FETCH-01/02 등) `[ ]` → `[x]` 갱신 — v1.1 audit이 명시적으로 "Out of scope" 표시; v1.0이 formal archive 받은 적이 없는 별도 milestone 영역. v1.3+ 별도 cleanup phase 영역.
- Phase 15가 backfill하는 10-VERIFICATION.md / 11-VERIFICATION.md / 11-03-SUMMARY.md 자체의 작성 — Phase 15 책임.
- Phase 12 VERIFICATION.md 수정 — 이미 `status: passed` 재검증(2026-05-23T14:31:42Z). 재작업 금지.
- daily.yml/weekly.yml/sync-schedule 변경 — Phase 14 책임.
- `pnpm audit:firms` CI 통합(자동 fail-on-drift) — REQUIREMENTS.md Out-of-scope에서 명시적으로 over-engineering 판정. 본 phase는 manual 재실행 정책만.
- 11-03-SUMMARY.md의 frontmatter `requirements-completed:` 값 — Phase 15 SPEC에서 lock(빈 배열이 아닌 실제 ID 리스트). Phase 16은 이를 읽어 traceability evidence로 사용할 뿐 수정하지 않음.
- 새로운 audit signal/scoring 룰 추가 — `auditFirms.ts` 로직 변경 없음. 본 phase는 기존 스크립트를 그대로 재실행할 뿐.
- v1.1 milestone audit 자체(`v1.1-MILESTONE-AUDIT.md`) 수정 — historical artifact.

## Constraints

- **Phase 15 dependency**: META-01의 traceability flip은 Phase 15가 산출하는 10-VERIFICATION.md / 11-VERIFICATION.md의 `status: passed` 상태를 evidence로 인용 가능해야 한다. 따라서 Phase 16 시작 시점은 Phase 15 완료 후. 이는 ROADMAP `Depends on: Phase 15`로 이미 명시.
- **Frontmatter convention parity**: Phase 10/11 SUMMARY에 신설하는 `requirements-completed:` field 위치/들여쓰기는 같은 phase의 기존 frontmatter(예: 10-01-SUMMARY의 `decisions:`, `metrics:` 키와 같은 깊이)와 일치. YAML parse 호환성 유지.
- **Phase 12 본문 수정만**: Phase 12 SUMMARY의 frontmatter `requirements-completed:` 기존 값(`SPEC-12-REQ-*`)을 수정/제거하지 않는다 — phase-local 히스토리 보존. cross-walk은 본문에 별도 단락으로.
- **No code execution side-effects beyond audit:firms**: 본 phase의 유일한 실행 명령은 `pnpm audit:firms`. `pnpm sync-schedule`(Phase 14에서 제거), 워크플로우 trigger, gemini 호출 등 부수효과 금지.
- **Evidence honesty**: traceability flip은 evidence 출처가 실재할 때만 — Phase 15의 VERIFICATION.md가 `gaps_found` 상태로 마무리되면 그 REQ는 `[x]`가 아닌 `[~]`(부분) 또는 `gaps`로 표시(정확한 표기 컨벤션은 discuss-phase 결정). 사후 청소가 status를 위장하지 않는다.
- **Path stability**: v1.1 phase dir들이 여전히 `.planning/phases/`에 위치(미archival). 본 phase는 `/gsd:cleanup`을 호출하지 않으며 archival도 수행하지 않음.

## Acceptance Criteria

- [ ] `grep -nE "(DQOBS-01|DQOBS-02|DQOBS-03|RESUME-01|RESUME-02|CONF-06).*Pending" .planning/milestones/v1.1-REQUIREMENTS.md` → 0 매치.
- [ ] `grep -cE "^\- \[ \] \*\*(DQOBS-0[123]|RESUME-0[12]|CONF-06)\*\*" .planning/milestones/v1.1-REQUIREMENTS.md` → 0.
- [ ] `grep -nE "\| CONF-06 \|" .planning/milestones/v1.1-REQUIREMENTS.md` → "Phase 12" 포함.
- [ ] `grep -E "04a572e|260523-mtz" .planning/milestones/v1.1-REQUIREMENTS.md` → 매치.
- [ ] `grep -E "26335283814|26335329895" .planning/milestones/v1.1-REQUIREMENTS.md` → 매치.
- [ ] `grep -E "daily\.yml:?27" .planning/milestones/v1.1-REQUIREMENTS.md` AND `grep -E "weekly\.yml:?30" .planning/milestones/v1.1-REQUIREMENTS.md` → 둘 다 매치.
- [ ] Phase 10 SUMMARY 3개 + Phase 11 SUMMARY 2개에서 모두 `awk '/^---$/{c++; next} c==1 && /^requirements-completed:/' {파일}` → 비공백 매치 (field 신설 확인).
- [ ] Phase 10 SUMMARYs 합집합에 DQOBS-01, DQOBS-02, DQOBS-03 3개 ID 모두 최소 1회 등장.
- [ ] Phase 11 SUMMARYs 합집합에 RESUME-01 또는 RESUME-02 중 최소 1개 등장(11-03은 Phase 15가 둘 다 인용 — 본 phase의 11-01/11-02는 적절한 분담).
- [ ] `grep -lE "Cross-?walk.*CONF-06|satisfies.*CONF-06" .planning/phases/12-topic-based-filter/12-01-SUMMARY.md .planning/phases/12-topic-based-filter/12-02-SUMMARY.md` → 두 파일 모두 반환.
- [ ] `grep -nE "^\| freshfields " .planning/phases/06-firm-audit-probe/06-AUDIT.md` → 0 매치.
- [ ] `.planning/phases/06-firm-audit-probe/06-AUDIT.md` header 타임스탬프가 `2026-05-26` 이후.
- [ ] `pnpm audit:firms` 명령이 0 exit (재실행 가능 상태).
- [ ] `grep -niE "audit:firms" CLAUDE.md` → 매치, 그리고 매치된 단락 내에 (trigger 조건 + 명령 + commit 책임) 3요소 모두 prose로 존재.
- [ ] 본 phase의 모든 commit이 `.github/workflows/`, `src/`, `scripts/`, `config/` 디렉토리를 건드리지 않음 (06-AUDIT.md 갱신, REQUIREMENTS.md 갱신, SUMMARY 갱신, CLAUDE.md 갱신만 — 단, `pnpm audit:firms` 자체는 `config/firms.yaml`을 read-only로 사용).

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                                          |
|--------------------|-------|------|--------|------------------------------------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | META-01 6 flips + META-02 audit regen + freshness policy 위치(CLAUDE.md) lock                  |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | v1.0 reqs OUT, Phase 12 VERIFICATION OUT, Phase 14/15 scope OUT, CI 통합 OUT — 모두 명시           |
| Constraint Clarity | 0.78  | 0.65 | ✓      | Phase 15 dep, frontmatter parity, evidence honesty, audit:firms만 실행 허용                       |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 15개 grep/exit-code/타임스탬프 기반 pass/fail check                                                |
| **Ambiguity**      | 0.134 | ≤0.20| ✓      |                                                                                                |

## Interview Log

| Round | Perspective     | Question summary                                                                | Decision locked                                                                                  |
|-------|-----------------|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| 1     | Boundary Keeper | META-02 freshness policy 위치 (CLAUDE.md vs 06-AUDIT.md header vs 둘 다)        | CLAUDE.md 단일 정책 단락 (06-AUDIT.md는 audit:firms 재실행 시 header overwrite 위험 있음)         |
| 1     | Boundary Keeper | Phase 12 SUMMARYs CONF-06 cross-walk 방식 (문서적 vs frontmatter 추가 vs 대체) | 문서적 cross-walk 본문 단락 추가; 기존 SPEC-12-REQ-* frontmatter 유지(phase-local 히스토리 보존) |

---

*Phase: 16-v1-1-metadata-hygiene*
*Spec created: 2026-05-26*
*Next step: /gsd:discuss-phase 16 — implementation decisions (evidence column shape in traceability, frontmatter field 정확한 위치, audit:firms 재실행 시점, CLAUDE.md 정책 단락 정확한 위치/제목)*
