# Phase 16: v1.1 Metadata Hygiene - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

3종의 v1.1 archived metadata 일치성 작업: (a) v1.1-REQUIREMENTS.md traceability table 6 row flip + evidence column 추가, (b) Phase 10/11/12 SUMMARY frontmatter의 `requirements-completed:` 정합화, (c) 06-AUDIT.md 재생성 + audit:firms freshness policy를 CLAUDE.md 단일 단락에 lock. Phase 15가 산출한 VERIFICATION.md를 evidence source로 cross-reference. 코드 변경 없음 — documentation-only phase.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `16-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `16-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `.planning/milestones/v1.1-REQUIREMENTS.md`의 traceability table + 본문 REQ 라인 6개 (DQOBS-01/02/03, RESUME-01/02, CONF-06) `[ ]` → `[x]`
- 동 파일에 phase + commit/run-ID/file:line evidence 6건 명시
- `.planning/phases/10-data-quality-observability/10-{01,02,03}-SUMMARY.md` frontmatter `requirements-completed:` 신설
- `.planning/phases/11-cron-resumption-gate/11-{01,02}-SUMMARY.md` frontmatter `requirements-completed:` 신설
- `.planning/phases/12-topic-based-filter/12-{01,02}-SUMMARY.md` 본문에 "SPEC-12-REQ-* ↔ CONF-06" cross-walk 단락
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 재생성 (`pnpm audit:firms`)
- 프로젝트 `CLAUDE.md`에 audit:firms freshness policy 단락

**Out of scope (from SPEC.md):**
- v1.0 REQUIREMENTS의 v1.0-area `[ ]` 갱신 (v1.3+ cleanup)
- Phase 15가 backfill하는 10-VERIFICATION / 11-VERIFICATION / 11-03-SUMMARY 자체 작성
- Phase 12 VERIFICATION.md 수정 (이미 `status: passed`)
- daily.yml / weekly.yml / sync-schedule 변경 (Phase 14)
- audit:firms CI 통합 (over-engineering)
- 11-03-SUMMARY의 `requirements-completed:` 값 (Phase 15 SPEC에서 lock)
- 새 audit signal/scoring 룰 추가
- v1.1-MILESTONE-AUDIT.md 자체 수정 (historical artifact)

</spec_lock>

<decisions>
## Implementation Decisions

### Traceability table 형태
- **D-01:** v1.1-REQUIREMENTS.md traceability table을 3-column에서 4-column으로 확장 — `| Requirement | Phase | Status | Evidence |`.
  - **6개 flipped row의 Evidence 셀 값:**
    - DQOBS-01 → `commit 04a572e (quick task 260523-mtz, 4-signal isEmptyFirm)`
    - DQOBS-02 → `10-VERIFICATION.md (Phase 15 backfill, 2026-05-26)`
    - DQOBS-03 → `10-VERIFICATION.md §DQOBS-03`
    - RESUME-01 → `GHA runs 26335283814 + 26335329895 (2026-05-23); 11-VERIFICATION.md`
    - RESUME-02 → `daily.yml:27 + weekly.yml:30 (uncommented); 11-VERIFICATION.md`
    - CONF-06 → `Phase 12-VERIFICATION.md (status: passed, re_verified 2026-05-23)`
  - **v1.0 / 미flipped row의 Evidence 셀:** 4-column 일관성 유지 위해 빈 셀(`—` 또는 공란)로 표시. v1.0 row의 evidence backfill은 본 phase out-of-scope.
  - **본문 정의 라인(line 63, 142–144, 148–149):** 동일한 evidence 인용을 `- [x] **CONF-06**: 각 로펌은 ... — Evidence: Phase 12-VERIFICATION.md` 형태로 추가 가능 (또는 traceability table만 evidence를 들고 본문 정의 라인은 단순 `[x]` flip만 — 후자 권장: 중복 방지).
  - **CONF-06의 Phase 매핑:** traceability table 218행을 `Phase 2` → `Phase 12` 로 정정 (REQUIREMENTS.md 본문에 "satisfied by Phase 12 topic filter" 명시됨).
  - **이유:** 4-column 추가가 SPEC R-02 acceptance를 가장 깔끔하게 만족 (grep `04a572e`, `26335283814`, `daily.yml:?27` 등). 한 표에서 row + status + evidence 모두 한 눈에 — future audit이 traceability와 evidence를 별도 cross-ref 없이 즉시 확인.

### SUMMARY frontmatter shape
- **D-02:** Phase 10/11 SUMMARYs의 `requirements-completed:` 필드를 plan별 1:1 매핑으로 신설, YAML block list 포맷 사용 (Phase 11-01-SUMMARY 기존 스타일 `requirements-completed:\n  - RESUME-XX`).
  - **Phase 10 매핑 (PLAN 본문 + SUMMARY outcome 대조 후 확정):**
    - `10-01-SUMMARY.md`: PLAN이 recorder + 9-col table + bodyLengths/guardCount/confidence write-sites 도입 → DQOBS-01 (per-firm cols). `requirements-completed: [DQOBS-01]` (정확한 ID 매핑은 실제 PLAN 본문 한 번 더 대조 후 plan-phase가 결정).
    - `10-02-SUMMARY.md`: PLAN이 low-confidence detector + footer/step-summary flag → DQOBS-02. `requirements-completed: [DQOBS-02]`.
    - `10-03-SUMMARY.md`: PLAN이 DRY_RUN=1 mode emission → DQOBS-03. `requirements-completed: [DQOBS-03]`.
  - **Phase 11 매핑:**
    - `11-01-SUMMARY.md`: URL/TLS restoreFetchHost + bkl/kim-chang 재활성화. RESUME-01의 "smoke test 통과 + cron resumption gate" 만족에 기여. `requirements-completed: [RESUME-01]`.
    - `11-02-SUMMARY.md`: TLS chain fix (Thawte intermediate). RESUME-01의 cron 활성화 전 quality gate 일부. `requirements-completed: [RESUME-01]`.
    - `11-03-SUMMARY.md`: Phase 15 SPEC에서 `[RESUME-01, RESUME-02]`로 이미 lock — 본 phase는 건드리지 않음.
  - **권장 매핑 방식:** plan-phase가 plan 본문 + 11-03-PLAN의 must_haves + 11-VERIFICATION 본문을 대조해 최종 확정. 위 매핑은 default — 실제 plan-phase에서 PLAN 본문 한 번 더 점검 후 조정 가능.
  - **위치:** 기존 frontmatter의 `metrics:` 블록 직전(가장 자주 사용되는 위치 패턴 — Phase 11-01 SUMMARY 참조). Phase별 frontmatter 키 정렬 순서를 유지하면서 자연스러운 위치에 삽입.
  - **이유:** plan별 1:1 매핑이 META-01 traceability의 evidence와 cross-reference 가능 — 누가 어떤 REQ를 닫았는지 분명. block list 포맷은 Phase 11 기존 SUMMARY 스타일과 일치하므로 다른 phase의 inline 스타일(Phase 12)과 schema 충돌 없이 phase-local 통일성 유지.

### Phase 12 CONF-06 cross-walk
- **D-03:** Phase 12 SUMMARYs의 frontmatter `requirements-completed:` (12-01 = `[SPEC-12-REQ-1, SPEC-12-REQ-2, SPEC-12-REQ-3, SPEC-12-REQ-6]`, 12-02 = empty)는 phase-local 히스토리 보존 위해 수정 금지. 본문에 cross-walk 단락 추가.
  - **단락 위치:** SUMMARY 본문 첫 번째 ## 섹션 직후(또는 마지막에) "## Cross-walk" subsection.
  - **단락 텍스트 템플릿 (12-01):** "**Cross-walk:** This plan closes `SPEC-12-REQ-1`, `SPEC-12-REQ-2`, `SPEC-12-REQ-3`, `SPEC-12-REQ-6` (phase-local IDs). Together with Plan 12-02's contributions, these satisfy top-level **CONF-06** (`각 로펌은 선택적 include_keywords / exclude_keywords 필터를 지원한다`). Tracked in `.planning/milestones/v1.1-REQUIREMENTS.md` traceability table."
  - **12-02 단락:** 동일 패턴, 12-02가 실제로 닫은 SPEC-12-REQ-* IDs(plan 본문 확인 후 — 추정: `SPEC-12-REQ-4` + `SPEC-12-REQ-5`)를 명시 + CONF-06 cross-walk.
  - **12-02 frontmatter `requirements-completed:` 빈 값**: 본 phase에서 12-02의 frontmatter 값도 plan 본문 검토 후 채울 수 있음 — D-02의 일반 원칙이 Phase 12에도 적용. 단 SPEC-12-REQ-* phase-local IDs 사용(CONF-06 추가는 cross-walk 단락에서만).
  - **이유:** SPEC R-05 acceptance가 두 파일 모두에 "Cross-walk: ... CONF-06" 단락을 요구. 기존 frontmatter를 수정하지 않으면 phase-local 히스토리(SPEC-12-REQ-N의 의미 보존) 유지됨. cross-walk은 본문 단락으로 grep 가능(`grep -lE "Cross-?walk.*CONF-06"`).

### CLAUDE.md audit:firms freshness policy
- **D-04:** CLAUDE.md `## Conventions` 섹션 아래 새 subsection `### Audit freshness (audit:firms)` 추가. Phase 14의 `### Workflow scheduling` 다음 위치에 자연스러운 누적.
  - **단락 구성 요소:** (a) Trigger — "`config/firms.yaml` 편집 직후" + "마지막 audit 실행으로부터 6개월 이상 경과 시" (둘 중 어느 조건이라도 충족 시). (b) Command — `pnpm audit:firms`. (c) Commit 책임 — "audit 실행자가 06-AUDIT.md 변경분을 같은 PR/commit에서 함께 commit한다". (d) 출력 위치 reference — "`.planning/phases/06-firm-audit-probe/06-AUDIT.md`에 timestamp 갱신 + 현행 firms.yaml 기준 표 재생성".
  - **단락 전체 권장 텍스트:**
    ```markdown
    ### Audit freshness (audit:firms)

    `pnpm audit:firms`를 재실행해야 하는 조건:
    1. `config/firms.yaml`을 편집한 직후 (firm 추가/제거/disable 토글, tier 변경, selector 수정 등).
    2. 마지막 audit 실행으로부터 6개월 이상 경과 시 (firms가 사이트 변경에 silent drift 했는지 확인 목적).

    실행 절차:
    - `pnpm audit:firms` → `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 가 재생성된다(header timestamp + per-firm 행 갱신).
    - 실행자가 06-AUDIT.md 변경분을 같은 PR/commit에서 함께 commit한다 (drift 상태가 자동 push되지 않도록 manual gate 유지).

    CI 통합(자동 fail-on-drift)은 over-engineering으로 의도적 보류 — single-developer project에서 manual policy가 충분.
    ```
  - **이유:** SPEC R-07 acceptance(grep으로 trigger + command + commit 책임 3요소 prose 발견)를 모두 만족. Phase 14의 `### Workflow scheduling`과 동일한 (a)trigger (b)command (c)commit 책임 구조 — 두 운영 conventions이 같은 형식으로 누적. SPEC out-of-scope(CI 통합)는 단락 마지막에 "의도적 보류"로 명시하여 future maintainer가 "왜 CI에 안 넣었지?" 재논의하지 않음.

### Commit shape
- **D-05:** 3 commits, META scope별 분리.
  - **Commit 1 (META-01a — traceability):** `.planning/milestones/v1.1-REQUIREMENTS.md` 단독 — 4-column 확장 + 6 row flip + evidence + CONF-06 Phase 매핑 정정.
  - **Commit 2 (META-01b — SUMMARYs):** Phase 10/11 SUMMARYs frontmatter + Phase 12 SUMMARYs cross-walk 본문 단락 (총 7 파일 — 10-01/02/03 + 11-01/02 + 12-01/02). 같은 commit으로 묶음 — frontmatter 신설과 cross-walk 단락 모두 "SUMMARY 메타 정합화"라는 단일 의도.
  - **Commit 3 (META-02 — audit + policy):** `pnpm audit:firms` 실행 + `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 재생성 + `CLAUDE.md`의 `### Audit freshness (audit:firms)` subsection 추가. audit 실행과 정책 문서화가 의미적으로 단일 단위.
  - **이유:** META-01의 두 sub-work(traceability table + SUMMARY frontmatter)는 약결합(SUMMARY가 traceability를 import하지 않음)이므로 분리 가능. META-02는 audit 실행 + 정책이 한 단위. bisect 시 META-01 traceability / META-01 SUMMARYs / META-02 정확한 boundary. 1 atomic commit은 META 의도 trace 어려움. 2 commits(META-01 통합)는 ~7 파일이 한 commit에 묶여 diff 가독성 떨어짐.

### audit:firms 재실행 시점
- **D-06:** Commit 3 (META-02) 안에서 실행. plan-phase가 이 commit을 위한 plan을 만들 때 첫 단계로 `pnpm audit:firms` 실행 → 06-AUDIT.md 변경분 확인 → 같은 commit에 staging. Commit 1·2 작성 전에 미리 돌리지 않음 (이전 commit들과 audit 결과의 시점 일관성 유지).
  - **선행 verification:** `config/firms.yaml`의 현재 상태가 `freshfields` 제거 반영(line 181 comment 확인) — 변경분 없으면 audit:firms 실행 결과는 freshfields 행만 제거되어야 함.
  - **이유:** META-02의 SPEC acceptance criterion(`06-AUDIT.md` header timestamp가 `2026-05-26` 이후, `freshfields` 행 부재)는 commit 3 실행 시점에 timestamp가 박혀야 충족. 너무 일찍 실행하면 commit 1·2 작성 중에 audit 결과만 dangling되어 git status가 헷갈림.

### Claude's Discretion
- traceability table의 4번째 column 이름 정확한 표기 (`Evidence` vs `Evidence (commit / run / path)` 등 헤더 상세도)
- v1.0 / 미flipped row의 Evidence 셀 표시 형식 (빈 셀 vs `—` vs `n/a`)
- 본문 정의 라인(line 63, 142~149)에 evidence를 inline 추가할지 vs traceability table에만 둘지 (편향: table에만 — 중복 방지)
- 11-01 SUMMARY가 RESUME-01만 닫는지, RESUME-02도 부분적으로 기여하는지 plan 본문 확인 후 매핑 조정
- 12-02 SUMMARY frontmatter `requirements-completed:` 빈 배열에 채울 SPEC-12-REQ-N IDs (plan 본문 확인 필요)
- CLAUDE.md subsection의 정확한 한국어/영어 텍스트 (위 권장은 한국어 base)
- 3 commit message 정확한 wording

### Folded Todos
(N/A — `gsd-sdk query todo.match-phase 16`이 0 매치 반환)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 16 spec (locked requirements)
- `.planning/phases/16-v1-1-metadata-hygiene/16-SPEC.md` — **Locked requirements — MUST read before planning.** 7 requirements (traceability flip, evidence pins, Phase 10/11 frontmatter, Phase 12 cross-walk, 06-AUDIT regen, CLAUDE.md policy), boundaries, 15개 pass/fail acceptance criteria.

### Phase 15 dependency (META-01 evidence source)
- `.planning/phases/15-v1-1-phase-closure-backfills/15-SPEC.md` — Phase 15가 lock한 backfill 형식 + evidence pin. META-01 traceability flip 시 Phase 15의 11-03-SUMMARY `requirements-completed:` 값 인용.
- `.planning/phases/15-v1-1-phase-closure-backfills/15-CONTEXT.md` — backfill 메타 frontmatter 컨벤션 (`backfilled_at` etc.) — Phase 16이 evidence column에서 backfill VERIFICATION을 인용할 때 형식 참조.

### Backfill source-of-truth (META-01 evidence pins)
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md` `gaps.metadata` 섹션 — META-01 식별의 출처 (empty `requirements-completed: []` + Phase 12 SPEC-local IDs + REQUIREMENTS `[ ]` 미체크).
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md` `tech_debt.06-firm-audit-probe` — META-02 식별 (`freshfields` stale row).

### File-level direct targets
- `.planning/milestones/v1.1-REQUIREMENTS.md` lines 63 (CONF-06), 142–144 (DQOBS-01/02/03), 148–149 (RESUME-01/02), 218 (CONF-06 trace), 253–257 (DQOBS/RESUME trace) — 본문/표 직접 수정 위치.
- `.planning/phases/10-data-quality-observability/10-{01,02,03}-SUMMARY.md` — frontmatter 수정 대상.
- `.planning/phases/11-cron-resumption-gate/11-{01,02}-SUMMARY.md` — frontmatter 수정 대상 (11-03 제외).
- `.planning/phases/12-topic-based-filter/12-{01,02}-SUMMARY.md` — 본문 cross-walk 단락 추가.
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` line 13 — `freshfields` 행 위치 (regen 후 자동 제거).
- `config/firms.yaml:181` — `freshfields removed by user 2026-05-18` 코멘트 (현 상태 reference).
- `CLAUDE.md` — `## Conventions` 섹션 위치 (Phase 14의 `### Workflow scheduling` 다음 줄에 새 subsection 삽입).

### Format reference (Phase 12 + Phase 15 backfill)
- `.planning/phases/12-topic-based-filter/12-VERIFICATION.md` — frontmatter 컴벨 reference (already-passed status, human_verification 키 패턴).
- `.planning/phases/11-cron-resumption-gate/11-01-SUMMARY.md` — `requirements-completed:` block list 스타일 reference.

### Implementation tools
- `package.json:13` — `audit:firms` script entry (`tsx src/cli/auditFirms.ts`).
- `src/cli/auditFirms.ts` — audit:firms CLI 본체 (Phase 16은 변경하지 않음, 실행만).
- `src/audit/firmAudit.ts` — audit 로직 (Phase 16은 변경하지 않음).

### Project-level
- `.planning/PROJECT.md` — Constraints (영향 없음, docs-only phase).
- `.planning/REQUIREMENTS.md` §META — META-01 / META-02 요구사항 원문.
- `.planning/STATE.md` Accumulated Context — Phase 16 entry 블록 ("META-01 cross-walks against fresh VERIFICATION outcomes from Phase 15").

### Prior phase context (style + convention reference)
- `.planning/phases/14-scheduling-coverage/14-CONTEXT.md` §decisions D-02 — `### Workflow scheduling` subsection in CLAUDE.md. Phase 16의 `### Audit freshness` 위치 직속 인접.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 12 VERIFICATION.md frontmatter 컴벨 — Phase 15 backfill에서 이미 재사용 중, META-01 evidence column에서 인용 가능.
- Phase 11-01 SUMMARY의 `requirements-completed:` block list 스타일 — Phase 10/11 SUMMARY frontmatter 신설 시 직접 복사 가능.
- Phase 14의 `### Workflow scheduling` subsection 형식 — `### Audit freshness` subsection 작성 시 trigger/command/commit 책임 3요소 패턴 직접 따름.
- `pnpm audit:firms` CLI — 본 phase에서 1회 실행만 (변경 없음).

### Established Patterns
- **Documentation-only phases:** docs/metadata 변경만 다루는 phase는 commit shape를 의도/scope 단위로 잘게 쪼개는 것이 표준 (Phase 15도 2 commit 분리). 본 phase의 3 commit도 같은 패턴.
- **CLAUDE.md `## Conventions` 누적:** Phase 14가 빈 Conventions 섹션에 `### Workflow scheduling` 추가, Phase 16이 `### Audit freshness` 추가 → conventions가 점진적으로 채워지는 구조.
- **traceability evidence-pin convention:** v1.1 phases 전반에서 evidence는 commit hash / run ID / file:line 조합 — Phase 16 evidence column도 같은 컨벤션.
- **YAML frontmatter block list:** Phase 11 SUMMARYs는 block list (`- RESUME-XX`), Phase 12 SUMMARYs는 inline (`[SPEC-12-REQ-*]`). Phase별 phase-local 일관성 유지 — phase 간 동기화 시도 않음.

### Integration Points
- **Phase 15 dependency (read-side):** Phase 16의 evidence column이 Phase 15의 10-VERIFICATION / 11-VERIFICATION을 reference. Phase 15가 완료된 상태에서 본 phase 시작 (orchestrate dep-aware 확인됨).
- **No code path integration:** `.planning/milestones/v1.1-REQUIREMENTS.md`, `.planning/phases/{10,11,12,06}-*/`, `CLAUDE.md`만 touch. `src/`, `config/`(read-only via audit:firms), `.github/workflows/` 영향 없음.
- **audit:firms re-run side-effects:** `.planning/phases/06-firm-audit-probe/06-AUDIT.md`만 변경. firms.yaml read-only.

</code_context>

<specifics>
## Specific Ideas

- "evidence는 grep 가능해야 함 — `04a572e`, `26335283814`, `daily.yml:?27`, `weekly.yml:?30`, `12-VERIFICATION` 등 모두 SPEC acceptance에서 grep 패턴으로 검증."
- "Phase 12 frontmatter 수정 금지 — phase-local 히스토리 손실 방지. cross-walk은 본문 단락으로만."
- "CLAUDE.md subsection 제목에 `audit:firms` 명령 이름을 괄호로 포함 — grep `audit:firms`이 즉시 해당 단락 발견."
- "audit:firms는 commit 3 안에서 실행 — 너무 일찍 돌려놓고 commit 1·2 작성하지 않음(시점 일관성)."

</specifics>

<deferred>
## Deferred Ideas

- v1.0 traceability `[ ]` row의 evidence backfill — v1.0이 formal archive 받은 적이 없는 별도 milestone 영역. v1.3+.
- `SettingsSchema.schedule` zod schema 제거 — Phase 14 deferred.
- v1.1 phase dir archival → 본 phase 외 (path 변경되면 META 작업 모두 cross-ref 깨짐).
- `requirements-completed:` 빈 배열 자동 검출 + CI fail — over-engineering (single-developer manual policy 충분).
- Phase 12-02 SUMMARY `requirements-completed:` 빈 값에 SPEC-12-REQ-* 채우기 — 본 phase scope 내(D-03 + plan-phase가 plan 본문 검토 후 확정).
- audit:firms CI 통합 — REQUIREMENTS out-of-scope (D-04 단락 마지막에 의도적 보류 명시).
- 06-AUDIT.md header에 "next-due" 일자 자동 계산 + 명시 — 본 phase는 정책 단락만, 자동화는 future enhancement.

### Reviewed Todos (not folded)
(N/A — todo.match-phase가 0 매치)

</deferred>

---

*Phase: 16-v1-1-metadata-hygiene*
*Context gathered: 2026-05-26*
