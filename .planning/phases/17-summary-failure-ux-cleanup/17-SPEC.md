# Phase 17: Summary Failure UX Cleanup — Specification

**Created:** 2026-05-27
**Ambiguity score:** 0.15 (gate: ≤ 0.20, inline-written from ROADMAP+REQUIREMENTS — implementation choice still open)
**Requirements:** 1 locked (FAIL-UX-01)

## Goal

Gemini summary 실패 시(429 quota / safety block / Zod parse 실패) 다이제스트 이메일 본문에 (a) title 텍스트가 두 번 나타나거나 (b) raw error JSON / 에러 코드 / quota 메시지 / stack trace 단편이 수신자에게 노출되는 현상을 제거한다. 동시에 operator-visible failure signal(`console.error` + step summary `summaryModel: 'failed'` 카운트)은 그대로 유지하고, `CLAUDE.md`의 free-tier RPM 표를 2026-05-27 실측치(`gemini-2.5-flash: 5 RPM`, flash + flash-lite RPM 풀 공유)에 맞춰 갱신한다.

## Background

2026-05-27 daily digest에서 Latham & Watkins "EU ETS: European Commission Announces Additional Flexibilities, Including Updated Benchmarks" 기사가:

1. **title 중복**: 카드 헤딩 `<a>`에 title 한 번, 본문 `<p>`에도 동일 title이 또 한 번 노출 — `src/summarize/gemini.ts:188-194`가 실패 시 `summary_ko = item.title`로 폴백하고, `src/compose/templates.ts:198-199`가 `summaryText = summary_ko ?? title`을 그대로 본문에 렌더하기 때문.
2. **에러 JSON 노출**: 빨간 mini-badge에 `{"error":{"code":429,"message":"You exceeded your current quota, please check yo` 까지 노출 — `templates.ts:178`이 `it.summaryError.slice(0, 80)` 형태로 잘라 그대로 표시.

GHA log(run 26512695491, 2026-05-27 13:02 UTC)에서 확인된 원인:
- 모델은 이미 `gemini-2.5-flash-lite`로 폴백한 뒤에도 막힘
- quota metric은 `generativelanguage.googleapis.com/generate_content_free_tier_requests`, `limit: 5, model: gemini-2.5-flash` — RPM 5 cap에 걸린 것 (CLAUDE.md `Critical Correction` 표는 flash 10 RPM이라 적혀있음 — outdated)
- flash + flash-lite가 같은 `gemini-2.5-flash` quota metric을 공유 — 모델 폴백만으로는 429 unstick 불가능
- `retryDelay: "39.347610487s"` — p-retry default backoff schedule이 39초까지 늘어나지 못해 재시도 포기

다른 4개 아이템은 정상 요약 성공(5 items 중 1건만 실패). 즉 quota burst가 분 단위로 짧게 발생한 케이스라 retryDelay만 honor해도 대부분 회복 가능.

## Requirements

1. **No title duplication in failed-item render**: `summaryModel === 'failed'`인 article 카드에서 title 텍스트가 본문 paragraph에 그대로 다시 나타나지 않는다.
   - Current: `src/compose/templates.ts:198-199`가 `<p>${escapeHtml(summaryText)}${badge}</p>` 렌더, summaryText = `summary_ko ?? title` 이고 fail path가 `summary_ko = item.title`로 세팅 → 본문에 title 그대로 노출. 해당 컴포넌트는 `templates.ts:173 renderArticle()`.
   - Target: discuss-phase에서 둘 중 하나 결정 — (A) failed 아이템을 기존 `renderDemotedBlock` (`templates.ts:204-216`, "⚠ 품질 의심 — 요약 숨김")으로 강등해서 제목 + 링크만 표시, OR (B) `renderArticle()` 내에서 failed 시 body `<p>` 자체를 omit하고 작은 "요약 실패, 원문 참조" 태그만 표시. 두 옵션 모두 title 중복을 제거한다.
   - Acceptance: 단위 테스트 신설 `src/compose/templates.test.ts` — fixture `it.summaryModel === 'failed'` + `it.summary_ko === it.title` 일 때 generated HTML에서 escaped title 문자열이 `<a>`와 본문에 동시에 나타나지 않을 것 (`occurrences(escapedTitle, html) === 1`). 옵션 (A) 채택 시 demoted 블록 내 occurrence 1회로 충족.

2. **No raw error JSON in recipient-visible HTML**: 실패 아이템 렌더에서 수신자가 보는 HTML/text 어디에도 다음 패턴이 노출되지 않는다: `"code":\s*\d+`, `"error"\s*:\s*\{`, `"quota"`, `"RESOURCE_EXHAUSTED"`, `retryDelay`, `stack trace 줄`, `exceeded your current quota`.
   - Current: `templates.ts:178` 가 `escapeHtml(it.summaryError.slice(0, 80))` 형식으로 badge 안에 raw JSON을 그대로 80자까지 노출.
   - Target: 실패 시 badge text는 사용자 친화적인 짧은 문구만 (예: `요약 실패 — 원문 참조`, `요약 일시 불가`). `summaryError`는 console + step-summary에서만 사용하고 user-facing HTML에는 전달되지 않는다.
   - Acceptance: 같은 fixture로 unit test — `grep -E '"code":\s*[0-9]+|"error"\s*:\s*\{|RESOURCE_EXHAUSTED|exceeded your current quota|retryDelay|\\bgenerativelanguage\\.googleapis\\b' generated_html` → 0 매치. 동시에 `console.error` mock에서 `[summarize] ... FAILED` 라인은 여전히 호출됨(operator signal 보존).

3. **Operator-visible failure signal preserved**: 실패가 silent하게 사라지지 않는다.
   - Current: `src/summarize/gemini.ts:181-183`의 `console.error('[summarize] model=${model} url=${url} FAILED: ${scrubbed}')` 라인이 stderr로 GHA log에 남고, step-summary recorder가 `summaryModel: 'failed'` 카운트를 9-column 표에 기록.
   - Target: 위 두 signal이 그대로 작동. 추가로 `summaryError` 원문은 step-summary observability 경로에서 계속 접근 가능(단, recipient HTML로는 leak되지 않음).
   - Acceptance: regression test — fail path 호출 후 (a) `console.error` mock에 `[summarize]` 시작 라인 1회 이상 호출, (b) `step-summary` writer가 받는 input record에 해당 item의 `summaryModel === 'failed'`와 `summaryError` 둘 다 살아있음, (c) 출력된 `email.html` payload에는 `summaryError` 문자열이 escape된 형태로도 등장하지 않음.

4. **CLAUDE.md free-tier RPM table updated**: 프로젝트 stack-doc의 Gemini free-tier 현실 표가 2026-05-27 실측치를 반영한다.
   - Current: `CLAUDE.md` "Critical Correction: Gemini Free-Tier Reality (April 2026)" 표가 `gemini-2.5-flash | 10 RPM | 250 RPD` 로 적혀 있음. flash + flash-lite quota pool 공유 사실은 미기재.
   - Target: 표가 (a) `gemini-2.5-flash`의 RPM 컬럼을 `5 (observed 2026-05-27)` 또는 동등 표기로 갱신, (b) 표 아래 또는 인접 단락에 "flash + flash-lite share the same `gemini-2.5-flash` quota metric — model fallback alone does NOT unstick a 429" 명시.
   - Acceptance: `grep -nE 'gemini-2\.5-flash.*\b5\b.*RPM|RPM.*\b5\b.*flash' CLAUDE.md` → 매치. `grep -nE 'share.*quota|same.*quota.*metric|fallback.*does NOT unstick' CLAUDE.md` → 매치. 변경된 단락이 기존 "Critical Correction" 헤더 아래에 위치.

5. **(Optional, discuss-phase에서 결정) Honor `retryDelay` in p-retry**: 429 응답의 `retryDelay` 필드(예: `"39.347610487s"`) 를 p-retry가 백오프 schedule에 반영해서, 다음 분 quota window 회복까지 실제로 기다린다.
   - Current: `src/summarize/gemini.ts`의 p-retry config는 onFailedAttempt에서 model fallback만 수행. 기본 retry schedule은 약 5번 / 지수 백오프 → 39초 대기 도달 전에 포기.
   - Target (discuss-phase 옵션): (a) p-retry minTimeout/maxTimeout 늘려 default schedule만으로 39+초 도달, (b) onFailedAttempt에서 `error.message` 또는 `error.errorDetails`로 retryDelay 파싱 후 명시적 `await sleep(N)`, OR (c) 이 요건을 별도 backlog로 분리하고 P17에서는 UX 정리만 처리.
   - Acceptance: 옵션 (a)/(b) 채택 시 unit test — mock 429 응답에 `retryDelay: 30s` 포함, p-retry가 최소 25초 이상 대기 후 재시도; 옵션 (c) 채택 시 backlog 항목 추가 commit 1건 + 본 SPEC requirement 5 항목을 `Decision: deferred to backlog` 로 mark.

## Boundaries

### In scope
- `src/compose/templates.ts` — `renderArticle()` / `renderDemotedBlock()` 변경 (failed 분기 추가 또는 demoted 라우팅)
- `src/summarize/gemini.ts` — (옵션 5 채택 시) p-retry config + onFailedAttempt 변경
- `src/compose/templates.test.ts` (or `src/compose/digest.test.ts`) — 회귀 테스트 추가
- `CLAUDE.md` — Gemini free-tier 표 + flash/flash-lite quota pool 공유 명시
- (옵션 5 채택 시) `src/summarize/gemini.test.ts` — retryDelay honor 테스트

### Out of scope
- 새 ESCALATION 이메일 라우팅(예: 실패 시 별도 알림 메일)
- Daily-vs-weekly 호출 분배 재설계 (Phase 13에서 이미 분리됨)
- Concurrency cap(`p-limit`) 값 자체 변경 — retryDelay honor만 추가하고 cap은 그대로
- 추가 fallback 모델 도입(예: gemini-2.5-pro) — free-tier RPD 제약 + CLAUDE.md `no paid API` 원칙에 충돌
- 다국어 fail 문구 (한국어 단일 문구로 통일)
- 사용자가 직접 retry trigger 하는 UI/엔드포인트 — 자동 cron만 사용

### Explicit non-features
- 실패 item을 cron next-run으로 큐잉해서 다음 다이제스트에 끼워넣는 carry-over 메커니즘
- 누적 실패 카운터 또는 dashboard
- Email "이 아이템은 요약 실패" 자체에 대한 사용자 답변 기능

## Acceptance Criteria

각 requirement의 Acceptance 라인이 PASS 조건. 종합 게이트:

1. `pnpm vitest run` (또는 동등) → 새 fixture 기반 templates 회귀 테스트 + 기존 488 테스트 모두 green.
2. Plan/execute가 manual smoke (dry-run + 인공 429 mock) → 생성 HTML에 raw error JSON pattern 0회, title 중복 0회, badge에 사용자 친화 문구만.
3. `git diff CLAUDE.md` → free-tier 표가 flash 5 RPM + quota pool 공유 명시.
4. operator signal regression: GHA log fixture 또는 unit-test mock에서 `[summarize] ... FAILED:` 라인이 stderr로 emit, step-summary 9-col 표의 `summaryModel: failed` 카운트가 정확.
5. (옵션 5 채택 시) mock 429 응답 + retryDelay 30s → p-retry 25초+ 대기 검증; 미채택 시 backlog 항목 commit.

## Open Questions (for discuss-phase)

- (Q1) Requirement 1 옵션 (A) demoted 강등 vs (B) body 생략 + 미니 태그 — 어느 쪽이 다이제스트의 시각적 일관성에 더 맞는가? 현재 demoted 블록은 "품질 의심"이라는 단어로 묶여 있어 "요약 실패"와는 어감이 다름.
- (Q2) Badge 문구 — `요약 실패 — 원문 참조` / `요약 일시 불가` / `Summary unavailable` 중 톤은? 기존 ⚠ 본문 없음, ⚠ 품질 의심, ⚠ 30일 이상 새 글 없음 톤과 맞춤.
- (Q3) Requirement 5(retryDelay honor)를 본 phase에 포함할지 별도 backlog로 분리할지. 포함 시 `src/summarize/gemini.ts` 변경 + retry-time-related unit test 1~2개 추가. 분리 시 다음 phase에서 실패율 자체를 줄이는 작업.
- (Q4) CLAUDE.md RPM 표 갱신 시 (a) 단일 행을 in-place 수정 + 표 아래 "Observed 2026-05-27" 단락 추가 vs (b) "Critical Correction" 섹션 자체에 2026-05-27 update note 단락 prepend.
- (Q5) escapeHtml 패스를 거친 후에도 raw JSON pattern이 detection되는지 정규식 기준 — `&quot;code&quot;` 같은 escape 변형도 deny-list에 포함할 것인가?

## Status

Locked except for items marked "(discuss-phase에서 결정)" or "(옵션 5)" — discuss-phase가 5개 open question을 해결하면 SPEC.md가 fully locked로 전환된다.
