# Phase 14: Scheduling Coverage - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

GH Actions cron 분리(daily Mon 21:00 KST 추가, weekly Mon 06:00 KST 이동) + `sync-schedule` footgun 영구 제거(스크립트 + package.json entry + toCron() helper) + cron 편집 정책 CLAUDE.md 문서화. 새로운 capability 없음 — SCHED-01 / SCHED-02 두 requirement의 implementation 결정만.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `14-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `14-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `.github/workflows/daily.yml` cron line + header comment 갱신 (Mon 추가)
- `.github/workflows/weekly.yml` cron line + header comment 갱신 (Mon 06:00 KST로 이동)
- `scripts/sync-schedule.ts` 파일 삭제
- `package.json`의 `"sync-schedule"` script entry 제거
- `config/settings.yaml`의 schedule 섹션 헤더 코멘트 정리
- `CLAUDE.md`의 cron 변경 절차 + Phase 13 day-7/day-0 lesson 문서화
- `src/config/loader.ts`의 `toCron()`: import 없으면 함께 제거 (사용처 있으면 그대로 둠)

**Out of scope (from SPEC.md):**
- `src/config/schema.ts`의 `SettingsSchema.schedule` zod schema 제거 (v1.3+ 영역)
- daily.yml/weekly.yml의 concurrency block, permissions block, steps 본체, Issue-on-failure step 수정
- settings.yaml의 `recipient`, `gemini`, `digest`, `prompt` 섹션
- 새 workflow 파일 추가
- 1주 production observation을 phase 종료 게이트로 사용
- 알람 추가 (기존 "Open issue on failure" step이 schedule trigger 실패를 잡음)

</spec_lock>

<decisions>
## Implementation Decisions

### Commit shape
- **D-01:** 2 commits, ordered functional → mechanical.
  - **Commit 1 (SCHED-01 functional):** `.github/workflows/daily.yml` + `.github/workflows/weekly.yml`의 cron line + 그 위 header comment 갱신만. 두 yml의 concurrency/permissions/steps은 변경 없음.
  - **Commit 2 (SCHED-02 mechanical cleanup):** `scripts/sync-schedule.ts` 삭제 + `package.json`의 `"sync-schedule"` script entry 제거 + `src/config/loader.ts`의 `toCron()` 제거(grep 확인 결과 sync-schedule.ts가 유일 import — 함께 제거 확정) + `config/settings.yaml` schedule 블록 header 코멘트 갱신 + `CLAUDE.md` Conventions 섹션에 cron 편집 정책 추가.
  - 이유: functional change(cron 변경)와 mechanical cleanup(스크립트·문서 정리)을 분리하면 git bisect / 롤백 시 명확한 경계가 됨. 단일 atomic commit은 디바이스가 단순하나 cron이 문서/스크립트 정리와 함께 묶이면 bisect 불가. 5 commits(requirement별)는 solo project에 과잉이고 R-03("concurrency 유지") 같은 "변경 없음 증명"은 commit이 안 생김.

### CLAUDE.md policy 위치
- **D-02:** 기존 `## Conventions` 섹션 아래 새 subsection `### Workflow scheduling (cron edit policy)`(또는 동등한 한국어/영어 제목 — Claude's Discretion).
  - 내용 요소: (a) "변경 시 `.github/workflows/daily.yml` + `weekly.yml`의 `schedule.cron` 두 줄을 직접 편집한다 → commit → 푸시 후 `gh workflow run {daily,weekly}.yml`로 즉시 검증", (b) Phase 13 lesson: "day-7과 day-0을 같이 쓰지 않는다 — GH Actions가 Sun alias 충돌로 reject. 안전한 형태는 `0-6`, `*`, 또는 `0,1,2-6` 류 collision-free 표현", (c) "두 cron의 시간은 분리 유지 — concurrency: digest-pipeline lock으로 직렬화는 되지만, 동일 시간 트리거는 한쪽이 다른 쪽을 기다리는 슬롯 슬립 발생".
  - 이유: 현재 `## Conventions`는 비어 있음. cron 정책 + Phase 16의 audit:firms freshness 정책이 둘 다 "운영 절차"라는 같은 카테고리에 속함 — 두 phase의 문서가 같은 Conventions 단면에 누적되면 future maintainer가 한 곳에서 모든 운영 규칙을 본다. 새 top-level `## Scheduling` 섹션은 audit:firms와 구조 불일치를 만들고, `## Project` Constraints 하위는 high-level budget/AI 제약과 일상 운영 절차를 섞음.

### settings.yaml schedule block 처리
- **D-03:** schedule 블록을 코드로 유지하고(zod parse 호환), 위 코멘트 단락을 "현재 미사용" 안내로 교체.
  - 새 header 코멘트 텍스트(권장 문구 — Claude's Discretion):
    ```
    # --------------------------------------------------------------
    # 발송 일정 (현재 미사용)
    # --------------------------------------------------------------
    # ⚠ 이 schedule 블록은 현재 사용되지 않습니다.
    #   실제 cron 일정은 .github/workflows/daily.yml + weekly.yml에서 직접 관리합니다.
    #   변경 절차는 CLAUDE.md의 "Workflow scheduling" 섹션을 참조하세요.
    #   (zod 호환을 위해 블록 자체는 남겨두지만 값은 무시됩니다.)
    ```
  - 기존 `time_utc` + `days` 값은 그대로 유지(아무 시그널도 보내지 않는 placeholder 역할). `sync-schedule` 언급 라인 제거.
  - 이유: zod schema(`SettingsSchema.schedule`)는 SPEC out-of-scope으로 손대지 않음. 블록을 완전 제거하면 schema-validation 깨짐. 블록을 축소하면 "이 값이 잠재적으로 의미 있다"는 혼동이 남음. "현재 미사용" 명시가 가장 명확.

### Verification approach
- **D-04:** `gh workflow run daily.yml && gh workflow run weekly.yml` 두 워크플로우 모두 `workflow_dispatch` 트리거 → 둘 다 성공으로 yml syntax 검증. STATE.md에 Phase 11 D-03 스타일의 한 줄 acceptance note 추가:
  - 형식: `YYYY-MM-DD Phase 14 cron split: daily/weekly workflow_dispatch 검증 완료 — daily run ID {N1}, weekly run ID {N2}. 다음 자연 schedule trigger 확인은 1주 내 production history에서.`
  - 1주 production observation은 phase 종료 게이트로 사용하지 않음(SPEC out-of-scope 명시). 대신 STATE.md note가 후속 audit 시점에 history 확인을 트리거.
  - 이유: SPEC minimum(weekly만 dispatch)은 daily.yml의 yml syntax 오류를 자연 trigger까지 모름. 두 yml 모두 dispatch는 1분 추가 노력으로 양쪽 cron 표현 모두 GH Actions parser가 받았다는 즉시 증거 확보. Phase 11 D-03이 이미 같은 패턴을 verified로 사용했음.

### Claude's Discretion
- CLAUDE.md `### Workflow scheduling` subsection의 정확한 제목 (한/영, "Workflow scheduling" vs "Cron edit policy" vs "Scheduling")
- settings.yaml schedule 블록의 새 header 코멘트 정확한 문구
- daily.yml header comment(line 27 위)의 새 문구 — 현재 "Phase 13: 화~일 매일 21:00 KST (월요일은 weekly.yml 이 담당)" → "매일(월~일) 21:00 KST" 류 갱신
- weekly.yml header comment(line 30 위) — 새 시간대 KST 표기 정확 문구
- 두 commit message의 정확한 wording (스타일은 기존 patterns 따름 — Phase 13 commits를 참조)
- src/config/loader.ts의 `toCron()` + 그 함수 위 코멘트 line 85-86 동시 제거 시 정렬/spacing

### Folded Todos
(N/A — `gsd-sdk query todo.match-phase 14`가 0 매치 반환)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 14 spec (locked requirements)
- `.planning/phases/14-scheduling-coverage/14-SPEC.md` — **Locked requirements — MUST read before planning.** 5 requirements (SCHED-01 cron, weekly shift, concurrency 유지, sync-schedule 제거, CLAUDE.md 정책), boundaries, 10개 pass/fail acceptance criteria.

### Project-level
- `.planning/PROJECT.md` — Constraints 섹션(budget $0, robots.txt politeness, 단일 파일 편집 UX, secrets 정책)
- `.planning/REQUIREMENTS.md` §SCHED — SCHED-01/02 원문 (line 13~17), Out-of-scope 명시 (Topic filter expansion 등)
- `.planning/ROADMAP.md` Phase 14 entry — Success Criteria 4건 (line 56~64)
- `.planning/STATE.md` Accumulated Context 섹션 — Phase 13 cron lesson recap (`0,2-6` 패턴 + day-7/day-0 충돌)

### Prior phase artifacts (cron-relevant)
- `.planning/phases/11-cron-resumption-gate/11-CONTEXT.md` §decisions — D-03 "STATE.md acceptance note 형식", D-04 "re-disable protocol" (cron 문제 발생 시 응답 패턴)
- `.planning/phases/13-1-gemini-rpd/13-CONTEXT.md` §decisions — D-04 aggressive failure detection 원칙 (sync-schedule 제거 후 "command not found" loud-fail 정당화)
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md` `gaps.integration` 항목 — Phase 11-cron-resumption-gate audit이 "sync-schedule overwrites Phase 13 split" footgun을 TECH-DEBT로 식별

### Implementation surface (touch list)
- `.github/workflows/daily.yml` — cron line 27 + 그 위 코멘트
- `.github/workflows/weekly.yml` — cron line 30 + 그 위 코멘트
- `scripts/sync-schedule.ts` — 파일 전체 삭제
- `package.json` — `scripts."sync-schedule"` 키 제거
- `src/config/loader.ts:85-100` — `toCron()` 함수 + 위 코멘트 제거 (유일 import는 sync-schedule.ts)
- `config/settings.yaml:22-39` — schedule 블록 위 코멘트 갱신
- `CLAUDE.md` — `## Conventions` 섹션 아래 새 subsection 추가

### GitHub Actions cron reference
- (외부) GH Actions cron syntax — day-of-week 필드에서 `0` 과 `7` 동시 사용 시 reject (Sun alias 충돌, Phase 13 lesson)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/sync-schedule.ts` 정규식 `( +- cron: ')[^']*(')` — 본 phase에서 스크립트를 삭제할 것이므로 재사용 아님이지만, cron line 식별 패턴 참고용으로 유효.
- `concurrency: digest-pipeline` lock 패턴 — 두 yml 모두에 이미 적용됨, 변경 금지.
- `git-auto-commit-action@v7` 패턴 + `[skip ci]` commit message convention — Phase 13 D-23 atomic state commit 그대로 유지.

### Established Patterns
- **GH Actions cron in yml:** 두 yml은 `on.schedule.cron` 한 줄 + 그 위 코멘트로 cadence 표현. 단일 진실 원천이 yml 자체(설정 파일이 아님 — sync-schedule 제거 후 더더욱).
- **Aggressive failure detection (Phase 13 D-04):** pnpm script가 사라지면 `pnpm sync-schedule`은 "Command 'sync-schedule' not found"로 시끄럽게 실패 — 본 phase의 acceptance criterion이 이를 명시.
- **STATE.md acceptance note (Phase 11 D-03):** 운영 변경 후 한 줄 기록(날짜 + 결과 + 환경 식별자) — Phase 14 verification에 동일 패턴 적용.
- **Solo project + premature abstraction 회피 (CLAUDE.md):** sync-schedule + toCron + settings.yaml.schedule가 단 한 user(자기 자신)를 위해 만들어진 자동화였음 → 사용 빈도 vs lockstep 유지 비용 trade-off에서 제거가 이김.

### Integration Points
- **GH Actions runner** — yml 변경 시 `gh workflow run` API로 즉시 dispatch 가능. 본 phase의 verification은 GH Actions UI가 아닌 CLI(`gh`)로 수행.
- **No code path integration** — `src/` 코드에서 settings.yaml schedule 블록을 import하는 곳 없음(zod schema는 정의만, 실제 schedule 값을 읽는 runtime 코드 없음). 따라서 schedule 블록 시그널을 줄여도 src/ 동작 변화 없음.
- **CLAUDE.md downstream readers** — GSD/Claude 세션이 자동 로드, Phase 16 META-02도 같은 파일의 같은 Conventions 섹션에 추가 예정 → 두 phase가 conventions 블록을 함께 만든다.

</code_context>

<specifics>
## Specific Ideas

- daily 7일 uniform 21:00 KST + weekly Mon 06:00 KST 분리 — REQUIREMENTS.md 예시 그대로 채택.
- Verification은 CLI(`gh workflow run`)로 수행, GH Actions 웹 UI 클릭 의존하지 않음.
- 정책 단락에 "현재 두 yml의 cron 값" 인용은 포함하지 않음 — 값이 바뀔 때마다 CLAUDE.md를 동기화해야 하는 새 footgun이 됨. 대신 "두 yml의 schedule.cron을 편집한다"는 절차만 기술.

</specifics>

<deferred>
## Deferred Ideas

- `src/config/schema.ts`의 `SettingsSchema.schedule` zod schema 제거 — v1.3+ cleanup phase. 현 phase는 schema parse 호환만 유지.
- settings.yaml schedule 블록 자체 제거 + zod `optional()` 전환 — v1.3+.
- `pnpm audit:firms` CI 통합(자동 fail-on-drift) — REQUIREMENTS.md Out-of-scope으로 명시 (single-developer project에서 over-engineering).
- cron 변경 시 자동 알람(slack/email) — 기존 "Open issue on failure" step이 모든 schedule trigger 실패를 issue로 잡으므로 별도 알람 불필요.
- daily.yml + weekly.yml의 cron 외 yml 블록 정리 (concurrency, permissions, steps의 미세 hygiene) — 본 phase에서 일체 변경 금지(SPEC out-of-scope).

### Reviewed Todos (not folded)
(N/A — todo.match-phase가 0 매치)

</deferred>

---

*Phase: 14-scheduling-coverage*
*Context gathered: 2026-05-26*
