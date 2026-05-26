# Phase 14: Scheduling Coverage — Specification

**Created:** 2026-05-26
**Ambiguity score:** 0.118 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

Pipeline은 매일(월–일) 21:00 KST에 신규 newsletter를 한 번씩 수집해 일–화 사이 ~48h fetch gap을 제거하고, `pnpm sync-schedule` footgun을 영구히 제거(스크립트 + package.json entry 삭제)하여 Phase 13의 daily/weekly cron split이 silent regression을 일으킬 수 없게 만든다.

## Background

현재 `.github/workflows/daily.yml`의 cron은 `'0 12 * * 0,2-6'` (Tue–Sun 21:00 KST, Mon 제외)이고 `weekly.yml`의 cron은 `'0 12 * * 1'` (Mon 21:00 KST, dispatch only — fetch 없음). 그 결과 일요일 21:00 KST fetch와 화요일 21:00 KST fetch 사이에 ~48시간의 무수집 구간이 존재하며, 월요일 발행분이 화요일 운행에서 늦게 잡힌다.

`scripts/sync-schedule.ts`는 `config/settings.yaml`의 generic `schedule.{time_utc, days}` 값을 `toCron()`으로 변환해 daily.yml의 cron line만 정규식으로 덮어쓴다. (a) weekly.yml은 손도 대지 않아 split을 보존하지 못하고, (b) settings.yaml의 현재 `days: weekly` 값은 stale 상태로 — 누군가 무심코 `pnpm sync-schedule`을 실행하면 daily.yml이 `'0 12 * * 1'`로 덮여 daily fetch가 사라진다. settings.yaml header의 “변경 후 터미널에서 `pnpm sync-schedule` 실행” 안내문도 같은 footgun을 부추긴다.

본 phase는 1주 production run을 통해 매일 ≥1회 daily fetch가 GHA history에 남는 것을 확인 가능한 상태로 만든다. iOS / backend deploy 의존성 없음 — 변경 surface는 `.github/workflows/*.yml`, `scripts/sync-schedule.ts`, `package.json`, `config/settings.yaml`, `CLAUDE.md`로 제한된다.

## Requirements

1. **Monday daily fetch**: daily.yml cron이 7일(월–일) 모두에서 21:00 KST에 발사된다.
   - Current: cron `'0 12 * * 0,2-6'` (Mon 제외 → 일–화 사이 ~48h gap)
   - Target: cron `'0 12 * * 0-6'` (또는 동등하게 Mon이 포함되며 GH Actions가 받는 syntax — Phase 13 lesson 준수: `0,2-6` 패턴에서 day-7(=Sun alias) 충돌 회피 형태로 확장). daily.yml header 코멘트는 “화~일” → “매일(월~일)”로 갱신.
   - Acceptance: 변경 후 7일 production window 동안 daily.yml의 GHA run history에 월–일 각 요일에 ≥1회 `Daily Digest` 성공 run이 존재(`workflow_dispatch` 제외, schedule trigger만 카운트). 즉시 검증으로는 `gh workflow view daily.yml --yaml` 출력에 변경된 cron이 보이고 `0-6` (or equivalent) day-of-week field가 Mon을 포함함.

2. **Weekly time-slot shift**: weekly.yml cron이 Mon 06:00 KST로 이동하여 daily Mon 21:00 KST와 시간 분리된다.
   - Current: weekly cron `'0 12 * * 1'` (Mon 21:00 KST — daily Mon이 추가되면 동일 시각 + 동일 day에서 `digest-pipeline` lock 경합)
   - Target: weekly cron `'0 21 * * 0'` (= Sun 21:00 UTC = Mon 06:00 KST). header 코멘트는 “월요일 21:00 KST” → “월요일 06:00 KST = 일요일 21:00 UTC”로 갱신. concurrency group `digest-pipeline`은 유지(불변).
   - Acceptance: weekly.yml cron value가 `'0 21 * * 0'` (혹은 동등한 “Mon 06:00 KST” 표현)으로 변경되고, GHA cron parser가 schedule trigger로 받아들임(`gh workflow view weekly.yml --yaml`에서 확인). 첫 production Mon 사이클에서 weekly run이 06:00 KST 즈음 시작되고 daily Mon 21:00 KST run이 별도로 트리거됨.

3. **Concurrency lock preserved**: `concurrency: digest-pipeline` shared lock이 daily/weekly 양쪽 워크플로우에 그대로 유지된다.
   - Current: `concurrency.group: digest-pipeline`, `cancel-in-progress: false` — 두 파일 모두 동일.
   - Target: 변경 없음. cron line 수정 시 concurrency block / permissions block / steps은 건드리지 않는다.
   - Acceptance: 변경 commit의 diff가 daily.yml은 `on.schedule.cron` 한 줄 + 그 위 코멘트만, weekly.yml은 `on.schedule.cron` 한 줄 + 그 위 코멘트만 변경(plus comment hygiene). `concurrency:` 블록 byte 단위로 동일.

4. **sync-schedule footgun removed**: `scripts/sync-schedule.ts` + `package.json` script entry + settings.yaml header 안내문이 한 commit에서 동시에 정리된다.
   - Current: `scripts/sync-schedule.ts` (37 lines), `package.json:14`의 `"sync-schedule": "tsx scripts/sync-schedule.ts"`, `config/settings.yaml:24`의 “변경 후 터미널에서 `pnpm sync-schedule` 실행 → daily.yml 자동 업데이트” 안내가 footgun을 형성.
   - Target: (a) `scripts/sync-schedule.ts` 파일 삭제, (b) `package.json`의 `"sync-schedule"` 키 제거, (c) `config/settings.yaml`의 schedule 섹션 헤더 코멘트에서 “sync-schedule 실행” 문구 제거 (settings.yaml의 `schedule:` 블록 자체는 historical context로 남기되 “현재 cron은 daily.yml / weekly.yml에서 관리합니다” 안내로 교체), (d) `src/config/loader.ts` 등에서 `toCron()`이 다른 곳에서 import되지 않으면 export도 정리(import되면 그대로 둠).
   - Acceptance: `ls scripts/sync-schedule.ts` → not found, `cat package.json | jq '.scripts."sync-schedule"'` → `null`, `pnpm sync-schedule` 실행 시 pnpm이 “Command 'sync-schedule' not found” 류 메시지로 실패, `grep -n "sync-schedule" config/settings.yaml` → 매치 없음.

5. **Manual-edit policy documented**: 추후 cron 수정 시 어디를 어떻게 편집해야 하는지 CLAUDE.md에 명시한다.
   - Current: cron 수정 안내가 (deprecated) `pnpm sync-schedule`만 지목 — sync-schedule 제거 후에는 안내 부재.
   - Target: `CLAUDE.md`(또는 settings.yaml `schedule:` 블록 header) 둘 중 한 곳에 “cron 변경 절차”를 lock — 절차는 “daily.yml/weekly.yml의 `schedule.cron` 두 줄을 직접 편집 → commit → 푸시 후 첫 schedule trigger로 검증” + Phase 13 lesson 한 줄(“day-7과 day-0을 같이 쓰지 않는다 — GH Actions가 Sun alias 충돌로 reject”). CLAUDE.md “Conventions” 섹션이 자연스러운 위치.
   - Acceptance: `grep -niE "cron|daily\.yml|weekly\.yml" CLAUDE.md` 가 (a) 편집 절차 + (b) Phase 13 day-7/day-0 lesson을 둘 다 포함한 단락을 반환.

## Boundaries

**In scope:**
- `.github/workflows/daily.yml` cron line + header comment 갱신 (Mon 추가)
- `.github/workflows/weekly.yml` cron line + header comment 갱신 (Mon 06:00 KST로 이동)
- `scripts/sync-schedule.ts` 파일 삭제
- `package.json`의 `"sync-schedule"` script entry 제거 (다른 scripts 항목은 건드리지 않음)
- `config/settings.yaml`의 schedule 섹션 헤더 코멘트 정리 (“sync-schedule” 언급 제거 + “cron은 yml에서 관리” 안내 추가)
- `CLAUDE.md`의 cron 변경 절차 + Phase 13 day-7/day-0 lesson 문서화
- `src/config/loader.ts`의 `toCron()` export 유지 여부: 다른 곳에서 import되지 않으면 함께 제거(YAGNI 정리), 사용처 있으면 그대로 둠

**Out of scope:**
- `src/config/schema.ts`의 `SettingsSchema.schedule` zod schema 자체 제거 — settings.yaml의 schedule 블록을 historical context로 유지하기 때문에 schema 정의는 그대로 둔다 (zod에서 `days`, `time_utc` 필드는 여전히 parse됨). schema 정리는 v1.3 + 별도 cleanup phase가 필요할 때 다룸.
- daily.yml/weekly.yml의 concurrency block, permissions block, steps 본체, Issue-on-failure step 수정 — 본 phase는 cron + 그 위 코멘트만 건드린다.
- settings.yaml의 `recipient`, `gemini`, `digest`, `prompt` 섹션 — 본 phase와 무관.
- `.github/workflows/`에 새 workflow 파일 추가(예: 별도 hint generation) — v1.3+ 영역.
- Production GHA run에 대한 1주 actual observation — phase verification은 “7일 wall-clock window 후 history 확인” acceptance를 명시하되, gsd:verify-work 시점에서는 yml 변경 + 한 차례 manual `workflow_dispatch` 성공으로 evidence 확보. 1주 history는 phase 후 1주 시점의 후속 audit 형태로 검증한다(SPEC에 acceptance로 남기되 phase 종료를 1주 봉쇄하진 않음).
- 알람(예: “Mon daily fetch가 빠지면 issue 발생”) 추가 — 기존 “Open issue on failure” step이 이미 모든 schedule trigger 실패를 issue로 잡으므로 OK; 별도 알람은 over-engineering.

## Constraints

- **Phase 13 cron syntax lesson**: GH Actions는 같은 cron expression에서 `0`(Sun)과 `7`(Sun alias)이 동시에 등장하는 day-of-week field를 reject한다. Mon 추가 시 `2-7,0` 형태가 아닌 `0,1,2-6` / `0-6` / `*` 등 collision-free 표현을 사용한다.
- **Concurrency invariant**: daily.yml와 weekly.yml의 `concurrency.group: digest-pipeline` + `cancel-in-progress: false`는 변경 금지 — Mon에 두 run이 동시 트리거될 수 있으므로(시간이 분리되어도 hosting/dispatch delay로 겹칠 가능성 존재) lock으로 serialization 보장.
- **D-23 atomic state commit invariant**: daily.yml의 `git-auto-commit-action` step + weekly.yml의 동일 step은 변경하지 않는다 (pending.json + seen.json 그룹 commit 무결성).
- **No new dependencies**: 본 phase는 코드 삭제 + 워크플로우 수정 + 문서화. 새 npm 패키지나 새 GH Action 추가 없음.
- **No secret changes**: GHA secrets(`GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`, `RECIPIENT_EMAIL`) 어떤 것도 본 phase에서 추가/회전하지 않는다.
- **Backwards compatibility**: settings.yaml 파일은 schema-valid 상태로 유지 (zod parsing이 깨지면 src/main.ts가 boot 실패). schedule 블록 자체는 남기되 의미를 “historical / future-use placeholder”로 재정의.

## Acceptance Criteria

- [ ] `cat .github/workflows/daily.yml | grep "cron:"` 가 Mon을 포함하는 cron expression을 반환한다 (예: `'0 12 * * 0-6'`).
- [ ] `cat .github/workflows/weekly.yml | grep "cron:"` 가 `'0 21 * * 0'` 또는 동등하게 Mon 06:00 KST를 표현하는 cron을 반환한다.
- [ ] 두 yml의 `concurrency:` 블록이 변경 전 commit과 byte-identical (git diff에서 해당 블록이 나타나지 않는다).
- [ ] `ls scripts/sync-schedule.ts` 가 “No such file or directory”로 실패한다.
- [ ] `jq '.scripts."sync-schedule"' package.json` 출력이 `null`이다.
- [ ] `pnpm sync-schedule` 실행 시 pnpm이 “Command 'sync-schedule' not found” 류 메시지로 non-zero exit한다.
- [ ] `grep -nE "sync-schedule" config/settings.yaml` 가 0 매치를 반환한다.
- [ ] `grep -niE "cron|daily\.yml|weekly\.yml" CLAUDE.md` 가 (a) “두 yml의 schedule.cron을 직접 편집” 절차와 (b) “day-7 / day-0 동시 사용 금지” lesson을 모두 포함한 단락을 반환한다.
- [ ] `pnpm typecheck` (TypeScript noEmit) 가 0 exit — sync-schedule 삭제 후 dangling import 없음.
- [ ] 변경 commit 직후 `gh workflow run weekly.yml` (workflow_dispatch) 한 차례 성공 — 이동된 cron이 yml syntax-valid 여부는 GH Actions가 검증.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                              |
|--------------------|-------|------|--------|--------------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Mon fetch 추가 + sync-schedule 영구 제거, 둘 다 측정 가능           |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | In/out scope 명시; settings.yaml schema 정리 명시적 deferral        |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Phase 13 cron lesson + concurrency invariant + D-23 invariant lock |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 10개 pass/fail check, grep/jq/ls 기반 검증 가능                     |
| **Ambiguity**      | 0.118 | ≤0.20| ✓      |                                                                    |

## Interview Log

| Round | Perspective     | Question summary                                       | Decision locked                                                                   |
|-------|-----------------|--------------------------------------------------------|-----------------------------------------------------------------------------------|
| 1     | Boundary Keeper | SCHED-02 scope: sync-schedule 스크립트 어떻게?         | Option B — 스크립트 + package.json entry 제거, settings.yaml 안내문 정리, CLAUDE.md 정책 명시 |
| 1     | Boundary Keeper | SCHED-01 시간대: Mon에 daily + weekly가 어떻게 공존?   | Daily Mon 21:00 KST 유지(daily 7일 uniform) / Weekly Mon 06:00 KST로 이동             |

---

*Phase: 14-scheduling-coverage*
*Spec created: 2026-05-26*
*Next step: /gsd:discuss-phase 14 — implementation decisions (PR shape, edit order, settings.yaml schedule 블록 정리 방식 등)*
