# Phase 17: Summary Failure UX Cleanup - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Gemini summary 실패 시(429 quota / safety block / Zod parse 실패) 다이제스트 이메일 본문에 (a) title 텍스트가 두 번 노출되거나 (b) raw error JSON / 에러 코드 / quota 메시지 / stack trace 단편이 수신자에게 노출되는 현상을 제거. 동시에 operator-visible failure signal(console.error + step summary `summaryModel: 'failed'` 카운트)은 보존하고, `CLAUDE.md`의 free-tier RPM 표를 2026-05-27 실측치(`gemini-2.5-flash: 5 RPM`, flash + flash-lite RPM 풀 공유)에 맞춰 갱신. retryDelay honor를 통해 quota burst 재발 시 자동 회복까지 본 phase에서 처리.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `17-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `17-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `src/compose/templates.ts` — `renderArticle()` 변경 (failed 분기에서 body `<p>` omit + 미니 태그)
- `src/summarize/gemini.ts` — p-retry config + onFailedAttempt에서 retryDelay 필드 honor
- `src/compose/templates.test.ts` (or `src/compose/digest.test.ts`) — failed-render 회귀 테스트 추가
- `src/summarize/gemini.test.ts` — retryDelay honor unit test 추가
- `CLAUDE.md` — Gemini free-tier 표 + flash/flash-lite quota pool 공유 명시

**Out of scope (from SPEC.md):**
- 새 ESCALATION 이메일 라우팅
- Daily-vs-weekly 호출 분배 재설계 (P13 완료)
- Concurrency cap(`p-limit`) 값 자체 변경 — retryDelay honor만 추가
- 추가 fallback 모델 도입 (free-tier 제약 + paid API 금지)
- 다국어 fail 문구 (한국어 단일)
- 사용자 직접 retry trigger UI/엔드포인트
- Carry-over 메커니즘(실패 item을 다음 cron run에 재시도)
- 누적 실패 카운터 또는 dashboard

</spec_lock>

<decisions>
## Implementation Decisions

### Failed-item render strategy
- **D-01:** Failed 아이템은 `renderDemotedBlock`으로 강등하지 않고, 현재의 `renderArticle()` 구조 안에서 처리한다. `summaryModel === 'failed'` 분기를 추가해 본문 `<p>` 자체를 omit하고 제목+링크는 그대로 노출한다. 'failed'(요약 시도 실패)와 'demoted'(cluster detector 강등) 의 semantic 차이를 시각적으로 보존하기 위함.
- **D-02:** 제목 바로 아래에 작은 monospace 태그 한 줄로 실패 표시. 스타일은 기존 meta-line(date/firm)과 동일 레벨 — `font-family: ${FONT_MONO}; font-size: 10–11px; letter-spacing: 0.12em; color: ${COLOR.muted}` 또는 동등. 빨간 errInk 컬러는 더 이상 본문에 노출되지 않음.

### Failed badge wording
- **D-03:** Badge 문구는 `⚠ 요약 일시 불가`. 이유: (a) 기존 배지 톤 일관성 ('⚠ 본문 없음', '⚠ 품질 의심 — 요약 숨김', '⚠ 30일 이상 새 글 없음'), (b) "원문 읽기 →" 링크가 카드 하단에 이미 있어 별도 행동 안내 불필요, (c) "일시"가 일시적 현상임을 암시해 수신자 안심.

### Error JSON leak prevention
- **D-04:** `it.summaryError` 문자열은 user-facing HTML payload 어디에도 전달하지 않는다. 현재 `templates.ts:178`의 `escapeHtml(it.summaryError.slice(0, 80))` 호출 경로를 제거. `summaryError`는 `console.error` (gemini.ts:181-183) + step-summary observability recorder 두 곳에서만 사용한다.
- **D-05:** 회귀 테스트는 escapeHtml 변형까지 deny-list에 포함한 regex로 검증한다 — `"code":\s*\d+`, `&quot;code&quot;:`, `"error"\s*:\s*\{`, `&quot;error&quot;`, `RESOURCE_EXHAUSTED`, `exceeded your current quota`, `retryDelay`, `generativelanguage\.googleapis` 패턴 모두 generated HTML에서 0회.

### retryDelay honor (scope decision)
- **D-06:** Requirement 5 (retryDelay honor)는 본 phase에 포함한다. `src/summarize/gemini.ts` `onFailedAttempt` 콜백에서 429 error의 `errorDetails[].retryDelay` 필드(또는 메시지 본문의 `"Please retry in Ns"` 패턴)를 파싱 → `await new Promise(r => setTimeout(r, N*1000))` 후 재시도. p-retry의 default backoff schedule은 그대로 유지하되, parsed retryDelay와 default 중 더 큰 값을 사용. 별도 backlog 분리 시 같은 실패가 다음 RPM burst에 재발할 위험 + 같은 파일 두 번 손대는 작업이 비효율.

### CLAUDE.md RPM table update
- **D-07:** `## Critical Correction: Gemini Free-Tier Reality` 표의 `gemini-2.5-flash` 행 RPM 컬럼을 `5 (observed 2026-05-27)`로 in-place 수정. 표 바로 아래에 단락 한 줄 prepend — `> **Observed 2026-05-27:** flash + flash-lite share the same `gemini-2.5-flash` quota metric — model fallback alone does NOT unstick a 429.` 형식.

### Operator signal preservation
- **D-08:** 다음 두 경로는 변경 없이 유지: (a) `src/summarize/gemini.ts:181-183`의 `console.error('[summarize] model=${model} url=${url} FAILED: ${scrubbed}')` 라인, (b) step-summary recorder가 `summaryModel: 'failed'` + `summaryError` 둘 다 수신. 변경은 templates.ts의 user-facing rendering 경로에만 적용.

### Claude's Discretion
- 실패 태그의 정확한 색상 / margin / padding 값 — UI-SPEC.md 없이 진행하므로 기존 mono-meta 스타일 mirror.
- `errorDetails[].retryDelay` 파싱 시 SDK가 노출하는 필드명 / 폴백 정규식 패턴 — Google `@google/genai` SDK 1.49.x의 실제 error shape 확인 후 결정.
- D-05 회귀 테스트의 정확한 fixture 데이터 (제목, URL, summaryError 샘플) — 2026-05-27 실제 에러 본문 발췌 + 합성 fixture.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec / requirements
- `.planning/phases/17-summary-failure-ux-cleanup/17-SPEC.md` — **Locked requirements — MUST read before planning.** 5 requirements + Acceptance lines + Boundaries.
- `.planning/REQUIREMENTS.md` §FAIL-UX-01 — Top-level requirement statement with consequence and acceptance.
- `.planning/ROADMAP.md` §"Phase 17" — Phase goal + 5 success criteria (parallel to SPEC requirements 1–5).

### Affected source
- `src/compose/templates.ts:173-202` — `renderArticle()` 현재 구현 (failed 분기에서 body `<p>` 노출 + slice(0,80) error badge)
- `src/compose/templates.ts:204-216` — `renderDemotedBlock()` (참고용 — failed 아이템을 여기로 라우팅하지 않기로 결정됨, D-01)
- `src/summarize/gemini.ts:94-194` — `summarize()` 함수 (175-194 catch 블록이 `summary_ko = item.title` + `summaryModel = 'failed'` + `summaryError` 세팅)
- `src/summarize/gemini.ts` p-retry 호출부 — `onFailedAttempt` 콜백에 retryDelay honor 추가 대상

### Stack docs
- `CLAUDE.md` "## Critical Correction: Gemini Free-Tier Reality (April 2026)" — 갱신 대상 표
- `@google/genai` 1.49.x error shape — D-06 구현 시 SDK 실제 필드 확인 필요 (context7 또는 official docs)

### Prior context
- Phase 13 (Gemini RPD Daily/Weekly Split) plan/summary — `summary_ko = item.title` fallback 패턴이 Phase 8 hallucination guard에서 도입된 history 참조
- 2026-05-27 production failure log — GHA run `26512695491` (`gh run view 26512695491 --log` 에서 `[summarize] model=gemini-2.5-flash-lite url=...EU ETS... FAILED:` 라인)

### Project meta
- `CLAUDE.md` "Cron edit policy" — 본 phase는 cron 변경 없음 (out of scope) but 일반 정책 참조용

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`renderArticle()` in `src/compose/templates.ts:173`** — 현재 article 카드 렌더링. failed 분기를 여기에 추가하면 단일 함수 한 곳만 손대고 변경 끝.
- **`escapeHtml()` / `escapeAttr()`** — 이미 존재하는 sanitize utility. badge 텍스트 escaping 그대로 활용.
- **`FONT_MONO` / `COLOR.muted` / `COLOR.warnBorder`** — meta-line 및 다른 ⚠ 배지에서 사용하는 스타일 토큰. D-02 태그 구현 시 그대로 미러링.
- **`scrubSecrets()` in `src/util/logging.js`** — `summaryError`가 API key / App password 우연 echo 시 사용. user-facing path에서 제거되지만 console.error 경로에서는 유지.
- **`p-retry` library** — `onFailedAttempt` 콜백이 이미 정의되어 model fallback(flash → flash-lite) 처리 중. retryDelay sleep을 같은 콜백에 append하면 됨.

### Established Patterns
- **3-tier failure semantics** — `summaryModel: 'skipped' | 'failed' | 'ok'` + cluster-detector demoted. 이 3개를 conflation하지 않는 게 D-01의 근거.
- **HTML 인라인 스타일 정책** — 이메일 클라이언트 호환을 위해 inline style만 사용 (no `<style>` block). D-02 태그도 inline.
- **Acceptance를 grep으로 검증** — Phase 14/15/16 모두 SPEC.md의 Acceptance를 `grep -E` 명령으로 검증 가능하게 표현. D-05 deny-list regex가 그대로 검증식이 됨.
- **Frontmatter `requirements-completed`** — Phase 16에서 정착시킨 SUMMARY 컨벤션. P17 SUMMARY에도 `FAIL-UX-01` 명시.

### Integration Points
- `src/main.ts` orchestrator는 변경 없음 — summarize 결과를 templates에 그대로 전달하므로 template 변경만으로 효과 발생.
- `src/pipeline/runDaily.ts` + `runWeekly.ts` — 변경 없음. summaryModel 카운트는 이미 step-summary 경로로 흐름.
- `src/observability/summary.ts` (step-summary writer) — `summaryError` 보존을 위해 input record shape 그대로 유지 (D-08).
- `.github/workflows/daily.yml` + `weekly.yml` — 변경 없음. retryDelay sleep으로 인해 한 run의 wall-clock이 최대 +60초 증가 가능하지만 GHA 6시간 timeout 내 여유.

</code_context>

<specifics>
## Specific Ideas

- 2026-05-27 daily digest (Gmail thread `19e698f697123ed8`)의 Latham EU ETS 카드가 회귀 테스트 reference visual. 변경 후 같은 모양 fixture에서 본문 `<p>` 없이 제목 + `⚠ 요약 일시 불가` 라인 + "원문 읽기 →" 만 나오는 모습이 expected.
- 실패 케이스 GHA log 라인 (`run 26512695491` 13:04:20Z) — `retryDelay: "39.347610487s"` 값이 D-06의 sleep 인자 파싱 테스트 fixture로 직접 사용 가능.
- 기존 ⚠ 배지 톤 (3종) — 새 태그 `⚠ 요약 일시 불가`가 시각적으로 그 셋과 같은 weight여야 함. 빨간 errInk가 아니라 muted gray.

</specifics>

<deferred>
## Deferred Ideas

- **다중 fallback 모델 도입** (예: gemini-2.5-pro 추가 시도) — free-tier RPD + `no paid API` 원칙 위반 가능성. v1.3+ 재논의.
- **실패 item carry-over** (다음 cron run에서 재시도해 다음 다이제스트에 끼워넣기) — 별도 stateful queue 필요, 본 phase 범위 초과.
- **누적 실패 dashboard** — observability 확장, 별도 phase.
- **사용자 직접 retry trigger UI** — 본 프로젝트는 cron-only, no user-facing app surface.
- **다국어 fail 문구** (영문 사용자 추가 시) — 현재 다이제스트 자체가 한국어 + 영문 혼재이지만 모든 메타 UI 문구는 한국어 단일이므로 일관성 유지.

</deferred>

---

*Phase: 17-summary-failure-ux-cleanup*
*Context gathered: 2026-05-27*
