# Phase 8: Hallucination Guard - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8은 **Gemini 요약 단계의 두 겹 방어벽**을 만든다 — (1) Gemini가 본문이 부족/부재/generic할 때 hallucinated summary를 애초에 생성하지 못하도록 차단하는 **pre-summarize guard**, 그리고 (2) 요약이 끝난 뒤 same-firm digest 안에서 첫 50자가 동일한 summary가 3+개 발견되면 hallucination cluster로 간주해 전부 `confidence: 'low'`로 demote + `HALLUCINATION_CLUSTER_DETECTED` 마커를 남기는 **post-summarize cluster detector**. 마커는 GHA step-summary와 이메일 footer 양쪽에 노출되어 운영자가 로그를 열지 않고도 품질 저하를 인지할 수 있다.

Phase 8의 배경: v1.0 Phase 02 UAT (2026-04-19)에서 bkl 9개 item 전부가 generic "법무법인 태평양은 1980년에 설립된..." 요약으로 hallucinate된 incident. 근본 원인은 detail 페이지 SPA 구조로 static fetch가 landing HTML을 반환한 것이었고 Phase 7에서 detail_tier 도입으로 일부 해소됐으나, **defense-in-depth 부재**가 같은 incident 자체를 catch하지 못하게 두고 있다. Phase 8은 Phase 7이 완전히 못 막는 잔여 hallucination failure mode를 잡는 마지막 방어선이다.

**In scope:**
- **GUARD-01**: Gemini 호출 경로에 3-조건 guard 삽입.
  - Case A (body === ''): 서버사이드 short-circuit으로 Gemini 호출 skip.
  - Case B (body.length < 100): 서버사이드 short-circuit.
  - Case C (generic-firm-overview boilerplate): Gemini prompt에 명시 규칙 추가 — Gemini가 판단하여 title verbatim + confidence:low 반환.
  - Case A/B/C 공통 반환 shape: `{ summary_ko: item.title, summaryConfidence: 'low', summaryModel: 'skipped' | 'gemini-2.5-flash'(C의 경우) }`.
- **GUARD-02**: Gemini 모듈에 4-body-shape fixture 테스트 추가 (empty / <100 / generic boilerplate / real 200+).
- **GUARD-03**: Post-summarize cluster detector — firm 단위로 summarize 루프가 끝난 직후, `summary_ko`의 앞 50자가 동일한 item이 3+개이면 전부 `confidence: 'low'`로 덮어쓰고 `console.error('HALLUCINATION_CLUSTER_DETECTED: firm=<id> count=<n>')` 로그.
- **GUARD-04**: 클러스터 감지 시 (a) GHA step-summary(`$GITHUB_STEP_SUMMARY`)에 마커 섹션 append, (b) 이메일 하단에 별도 `<footer class="data-quality">` section 신설하여 affected firm 목록 표시.
- **Phase 1 B3 null-summary 경로 변경**: 현재 `src/pipeline/run.ts:235-243`은 `!item.description`일 때 `summary_ko: null` 반환 — Phase 8은 이 branch를 title-verbatim으로 통일하여 GUARD-01과 동일한 shape로 수렴. 템플릿의 `summary_ko === null` 분기 ("요약 없음 — 본문 부족") 제거.
- **Demoted items 이메일 렌더링**: cluster detector가 demote한 item들은 요약 숨기고 **제목+원문 링크만** 표시 (접기 UI).
- **GUARD 트리거 카운트 노출**: cluster detector 발동 건수를 step-summary / footer에 개수로 표기.

**Out of scope (explicitly):**
- **Per-firm body-quality metric 전수 surfacing** (평균 body length, confidence 분포 컬럼) — Phase 10 (DQOBS-01~03). Phase 8은 cluster 이벤트 flag만, 상시 metric 테이블은 아님.
- **"50% 이상 low confidence면 firm-level 경고" 로직** (DQOBS-02) — Phase 10.
- **DRY_RUN=1 DQOBS metric print** (DQOBS-03) — Phase 10.
- **Generic-boilerplate 서버사이드 pattern library** (로펌별 알려진 boilerplate phrase 사전 매칭) — Case C는 Gemini prompt 규칙으로 처리하며, 결정론적 pattern library는 유지보수 부담 대비 ROI 낮아 v1.2 backlog 후보.
- **Cross-firm cluster detection** — GUARD-03 literal은 "same firm" 범위. 로펌 간 공통 boilerplate 탐지는 Phase 10에서 재검토.
- **Cluster 감지 후 Gemini 재시도 / 본문 재수집 로직** — Phase 8은 "detect & demote & surface"까지. Recovery는 v1.2.
- **Confidence 값 시각 렌더링 (high/medium/low 배지 상시 표시)** — 지금은 cluster-demoted에 한해서만 접기 UI. 모든 item에 confidence 표시는 Phase 10 선택 사항.
- **Cron resumption** — Phase 11.
- **Cooley 복구** — Phase 9.

</domain>

<decisions>
## Implementation Decisions

### GUARD-01 트리거 메커니즘 (Area 1)

- **D-01 (Hybrid gate, 확정)**: 3-조건을 **단일 layer가 아닌 두 layer**로 구현.
  - **Layer 1 — server-side short-circuit** (`src/pipeline/run.ts` 내 summarize step):
    - `body === ''` 또는 `body.trim().length < 100` 이면 Gemini 호출 생략.
    - 반환: `{ summary_ko: item.title, summaryConfidence: 'low', summaryModel: 'skipped' }`.
    - 근거: 결정론적(LLM 확률성 제거) + Gemini 무료 quota (250 RPD) 절약. "짧으면 무조건 거부"는 LLM에 맡길 이유가 없는 선험적 규칙.
  - **Layer 2 — Gemini prompt 규칙** (`src/summarize/prompt.ts`):
    - 기존 preamble/instruction에 명시 규칙 한 문단 추가 — "If the article body appears to be a generic firm-overview or navigation boilerplate (not article-specific), return `summary_ko = <original title verbatim>` and `confidence: 'low'`. Do not fabricate content from the title alone."
    - 근거: "generic firm overview" 판정은 fuzzy(길이는 있으나 article-specific content 부재) — 결정론적 패턴 매칭보다 LLM이 더 안정적. Case A/B는 이미 Layer 1에서 걸러지므로 Gemini에 도달하는 body는 최소 100자.

- **D-02 (Layer 1 threshold = 100자, trim 후)**: `body.trim().length < 100`. Whitespace-only body도 차단. REQUIREMENTS.md GUARD-01 literal 준수. 임계값 튜닝은 Phase 10 관찰 후 backlog.

### B3 path 호환 (Area 2)

- **D-03 (B3 path → title verbatim으로 통일)**: 현재 `src/pipeline/run.ts:235-243`의 `!item.description` 분기가 `summary_ko: null`을 반환하는 것을 **`summary_ko: item.title`로 변경**. `summaryConfidence: 'low'`, `summaryModel: 'skipped'`는 유지. GUARD-01 Layer 1과 동일 shape으로 수렴.

- **D-04 (템플릿 null-branch 제거)**: `src/compose/templates.ts:64` 근처의 `summary_ko === null` → "요약 없음 — 본문 부족" 회색 이탤릭 렌더링 branch **제거**. 템플릿은 이제 confidence 기반 렌더링만 — `confidence === 'low'`일 때 시각 경고 배지(또는 D-07의 접기 처리 대상). Phase 1 B3 snapshot 테스트는 title-verbatim 출력으로 업데이트.

- **D-05 (Phase 1 SUMM-06 caller contract는 유지)**: JSDoc에 적혀있는 "body MUST be a real article body. Do NOT substitute." 원칙은 그대로. D-01 Layer 1과 D-03은 **caller 측 책임(short-circuit 후 title 반환)**을 강화하는 것이지 summarize 함수에 title을 우회 전달하는 패턴이 아님. Gemini는 여전히 실제 body만 받음.

### GUARD-03 Post-summarize cluster detector (Area 3)

- **D-06 (Hook 위치 = `src/pipeline/run.ts:218-257` summarize 루프 직후)**: summarize step의 `Promise.all(deduped.map(...))`이 끝나고 `summarized: FirmResult[]`가 완성된 직후(line ~259 근처) 별도 함수 `detectHallucinationClusters(summarized)` 호출. 반환: 각 firm별 demoted item id set + cluster 마커 메타데이터.

- **D-07 (Signature = summary_ko의 첫 50자 문자열 일치)**: `summary_ko.slice(0, 50)` (trim 없음, 대소문자 유지). 같은 firm 안에서 이 key가 3+개 동일한 group이 있으면 해당 group 전체를 "cluster"로 판정. GUARD-03 literal 준수. `summary_ko`가 null인 item은 signature 계산에서 제외(B3 path 제거 후엔 해당 케이스 없음).

- **D-08 (Demote = confidence overwrite)**: cluster에 속한 모든 item의 `summaryConfidence`를 `'low'`로 덮어씀. 이미 `'low'`였던 경우도 idempotent. `summary_ko` 값 자체는 건드리지 않음(이메일 렌더링 단계에서 접기 처리됨).

- **D-09 (Jaccard 사용 안 함)**: `src/audit/signals.ts`의 `jaccardTokenSimilarity`는 **재사용하지 않음**. GUARD-03 literal이 "first 50 chars identical"이고 prefix 문자열 비교가 더 빠르고 결정적. 향후 cross-firm detection이나 퍼지 매칭 요구사항이 생기면 v1.2에서 재평가.

- **D-10 (False positive 수용)**: "한 firm이 진짜로 비슷한 주제 5건을 발행해서 첫 50자가 우연히 비슷할 수도 있다"는 false positive는 **aggressive failure detection 선호에 따라 수용**. 3+ prefix 일치 = practically hallucination. 로그에 per-item title이 남으므로 운영자가 사후 확인 가능.

### Demoted items email rendering (Area 3)

- **D-11 (접기 UI — 제목+원문 링크만 표시)**: cluster-demoted item은 이메일에서 **요약 텍스트 숨김, 제목+원문 링크만** 표시. 렌더링 형태(예시):
  ```
  📌 bkl 법무법인 태평양
    ⚠ 5개 item 품질 의심으로 접힘 (요약 숨김, 원문 링크만 표시)
      • M&A 규제 개정 안내 → 원문 보기
      • 근로기준법 주요 쟁점 → 원문 보기
      ...
  ```
  근거: hallucinated 요약을 사용자가 읽지 않도록 차단 + 제목/링크는 유지해 관심 item은 원문 직접 확인 가능. False positive 시에도 손실 최소 (링크 한 번 더 클릭).

- **D-12 (접힌 item은 "정상" 섹션과 분리)**: 같은 firm 내에서 cluster-demoted item과 정상 item이 섞여 있다면(예: 3개는 demoted, 2개는 confidence=high) 정상 item은 위쪽에 정상 렌더링, demoted item은 아래쪽에 "⚠ 품질 의심 — 접힘" 블록으로 분리 표시.

- **D-13 (B3 path title-verbatim 렌더링은 접기 UI와 별개)**: D-03에 따른 title-verbatim item(빈 body / <100 자) 중 cluster에 속하지 않은 단건은 **접기 대상 아님** — 제목을 요약 자리에 그대로 표시하되 `⚠ 본문 확보 실패` 경고 배지. 이 구분 이유: cluster는 "데이터가 있는데 가짜스러움"이고 B3 단건은 "데이터가 없음"으로 실패 원인이 달라 시각 신호도 다름.

### GUARD-04 Surfacing layout (Area 4)

- **D-14 (별도 `<footer class="data-quality">` section 신설)**: 기존 `renderFailedFirmsFooter` (수집 실패 firm 목록)는 그대로 두고, 그 아래에 신규 `renderDataQualityFooter(clusterMarkers)` 함수가 생성하는 별도 footer section을 렌더링. 구조:
  ```html
  <footer class="failed-firms">
    ⚠ 이번 실행에서 수집 실패 — 다음 실행에서 재시도됩니다:
    • cooley: http-403 ...
  </footer>
  <footer class="data-quality">
    ⚠ 데이터 품질 경고 — 요약 신뢰도 의심:
    • bkl: HALLUCINATION_CLUSTER_DETECTED (5 items, 요약 숨김)
  </footer>
  ```
  근거: "수집 실패"와 "요약 품질 의심"은 root cause가 다른 문제이며 Phase 10 DQOBS에서 data-quality footer를 per-firm body-length 평균·confidence 분포로 확장할 예정 — 미리 분리해 두는 것이 확장 자리 확보에 자연스러움.

- **D-15 (GHA step-summary 마커 섹션)**: `src/observability/summary.ts:35-53`의 `writeStepSummary` 함수가 기존 per-firm 테이블을 append한 **직후** cluster 마커가 있으면 별도 섹션(markdown `## ⚠ Data Quality Warnings`)을 append. 각 affected firm 한 줄씩: `- **bkl**: HALLUCINATION_CLUSTER_DETECTED — 5 items demoted`. Marker 없는 실행에선 섹션 자체 생략.

- **D-16 (console.error marker 포맷)**: `console.error('HALLUCINATION_CLUSTER_DETECTED: firm=<id> count=<n> signature=\"<first50chars>\"')` — GMAIL_AUTH_FAILURE 패턴과 동일한 1줄 stderr 출력. signature는 디버그 용도 (scrubSecrets pipeline은 이 token에 민감정보 없음을 전제, 실제 summary prefix라 안전).

### Claude's Discretion

- **Layer 2 prompt 문구 정확한 문구**: D-01 Layer 2 추가 규칙의 한글/영문 phrasing은 planner 재량. 기존 prompt.ts preamble 톤과 일치시킬 것. 다만 "return summary_ko = original title verbatim" 과 "return confidence: 'low'" 두 literal은 반드시 포함 (GUARD-01 스펙 지시).
- **접기 UI HTML 구조**: D-11의 `<details><summary>` vs 단순 `<ul>` vs `<table>` 등 구체 구조는 templates.ts 기존 컨벤션 따르기. 이메일 클라이언트 호환성 고려(Gmail은 `<details>` 렌더링 제한적) — 단순 `<ul>`로 안전히 가는 것이 기본.
- **Cluster detector 함수 위치**: `src/pipeline/run.ts` 내부에 인라인 vs `src/pipeline/detectClusters.ts` 분리 — 테스트 격리 관점에서 분리 권장이지만 planner 최종 판단.
- **Fixture 테스트 real body 원천**: GUARD-02 case (d) real article body — v1.0 UAT 이전 실제 로펌 article HTML 발췌 vs 합성 body. 결정론적 snapshot이 중요하므로 합성 body 권장 (200+자, 법률 뉴스 문체, BKL 로고 없는 토픽-특정 텍스트).
- **Layer 1 short-circuit 반환 shape의 model 필드 값**: `summaryModel: 'skipped'` vs `summaryModel: 'guard-short-circuit'` — 기존 B3 `'skipped'` 재사용이 무난. 모니터링 분기가 필요해지면 Phase 10에서 세분화.

### Folded Todos

(해당 없음 — `gsd-sdk todo.match-phase 8` 결과 matched todo 0건.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 8 요구사항

- `.planning/REQUIREMENTS.md` §GUARD (GUARD-01 ~ GUARD-04, line 107-112) — 프롬프트 규칙 literal, 4-body-shape fixture 테스트, 3+ prefix cluster detection 및 demotion, step-summary + email footer surfacing. Locked.
- `.planning/ROADMAP.md` Phase 8 section (line 159-168) — Goal, Success Criteria (SC-1~4), Depends on: Phase 7.

### Incident 배경 (Phase 8의 존재 이유)

- `.planning/backlog/v1.0-data-quality-audit.md` — bkl 9개 item 전부 동일 hallucination이 발견된 UAT incident의 구체 증상 + "Gemini prompt lacks a generic-body hallucination guard — defense-in-depth is missing" 기록. Phase 8이 해결해야 할 실제 사고.
- `.planning/phases/07-spa-aware-detail-tier/07-CONTEXT.md` — Phase 7에서 bkl/kim-chang이 canonicalizeUrl+www 이슈로 DISABLED. Phase 8 cluster detector는 logos/skadden/lee-ko/latham 등 **live firm**에 대해 동작.
- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` — Phase 6이 승격한 진단 도구의 출력. Phase 8 완료 후에도 `pnpm audit:firms`로 hallucination guard 트리거가 detail-identical firm을 포착하는지 확인 가능.

### 수정·확장 대상 코드

- `src/summarize/prompt.ts:30-45` — Gemini JSON schema (confidence enum `['high','medium','low']` 이미 존재, 변경 없음). Line 64-94의 `buildPrompt` 함수 preamble/instruction에 GUARD-01 Layer 2 prompt 규칙 추가.
- `src/summarize/gemini.ts:29-32` — Zod mirror schema. 변경 없음.
- `src/pipeline/run.ts:218-257` — summarize 루프. Line 235-243의 B3 null-return branch를 title-verbatim으로 수정 (D-03) + Layer 1 short-circuit 조건 추가 (D-01) + 루프 완료 직후 cluster detector 호출 (D-06).
- `src/compose/templates.ts:13-16, 62-65` — summary_ko === null 분기 제거 (D-04). Line 120-140 `renderFailedFirmsFooter` 아래에 `renderDataQualityFooter` 신설 (D-14). 접기 UI 구조 (D-11) 추가.
- `src/observability/summary.ts:35-53` — `writeStepSummary`가 cluster 마커 섹션 append (D-15).
- `src/observability/recorder.ts` — cluster 이벤트 기록 필드 추가 (step-summary 테이블에 노출할 카운트).

### 테스트 위치

- `test/summarize/prompt.test.ts` — 기존 prompt 테스트. GUARD-01 Layer 2 규칙 prompt에 들어갔는지 grep/assertion 추가.
- `test/summarize/gemini.test.ts` — **신규 파일**. 4-body-shape fixture 테스트 (GUARD-02) — empty / <100자 / generic boilerplate / real 200+ body. Mock Gemini client (Phase 1 fixture 패턴 재사용 또는 새 mock).
- `test/pipeline/clusterDetection.test.ts` — **신규 파일**. GUARD-03 unit tests — 3+ prefix 일치 시 demote + marker 생성, 2개일 땐 트리거 안 됨, signature는 정확히 첫 50자.
- `test/compose/templates.test.ts` — data-quality footer 렌더링 snapshot + 접기 UI 렌더링 snapshot 추가.
- `test/pipeline/run.test.ts` (또는 해당 위치) — B3 path title-verbatim 변경에 따른 기존 assertion 업데이트.

### 재사용 대상 패턴

- `src/mailer/gmail.ts:93` — `console.error('GMAIL_AUTH_FAILURE: ...')` — 마커 포맷 선례. `HALLUCINATION_CLUSTER_DETECTED`도 같은 패턴 (D-16).
- `src/compose/templates.ts:96-117` `classifyError` + 기존 failed-firms footer — data-quality footer 구조 참고 (D-14).
- `src/util/logging.ts scrubSecrets` — marker 로그가 secrets 포함하지 않도록 확인. summary prefix는 안전.

### 관련 phase 선례

- `.planning/phases/01-foundation-vertical-slice/01-CONTEXT.md` — SUMM-01~06 (Gemini 호출 계약), B3 null-summary path (D-03에서 변경 대상), `"요약 없음 — 본문 부족"` 템플릿 (D-04에서 제거 대상).
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — failed-firms footer + classifyError 패턴 (D-14 참고).
- `.planning/phases/06-firm-audit-probe/06-CONTEXT.md` D-07 — 4-signal detail-identity classifier (exact hash + jaccard + title-token + length<100). Phase 8의 cluster detector는 **summary prefix** 레이어이며 Phase 6의 body-level classifier와 독립. Phase 8 완료 후에도 Phase 6 audit tool이 detail-identical firm을 계속 진단.

### Milestone context

- `.planning/PROJECT.md` Current Milestone: v1.1 — acceptance: "Gemini summary = 실제 내용 반영, cron 재개 후 1주일 hallucination 0건". Phase 8은 이 acceptance의 핵심 gate — cluster marker 0건 + confidence=low 비율 허용치 이하가 Phase 11 cron 재개 조건.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/summarize/prompt.ts` + `src/summarize/gemini.ts`**: JSON schema + Zod mirror가 이미 `confidence: 'low'` 지원 — 스키마 변경 불필요. prompt 문자열만 확장.
- **`src/pipeline/run.ts:235-243` B3 guard**: 이미 `!item.description`일 때 Gemini 호출 우회. D-01 Layer 1 확장은 이 가드를 `body.trim().length < 100`으로 조건 강화 + 반환값을 null → title로 변경하는 것.
- **`src/mailer/gmail.ts:93`**: `console.error('GMAIL_AUTH_FAILURE: ...')` marker pattern 선례. `HALLUCINATION_CLUSTER_DETECTED`도 동일 포맷.
- **`src/compose/templates.ts:120-140` `renderFailedFirmsFooter`**: footer 구조 선례. `renderDataQualityFooter` 신설은 이 함수 바로 아래 같은 패턴.
- **`src/observability/summary.ts:35-53` `writeStepSummary`**: `$GITHUB_STEP_SUMMARY` append 경로 확립. cluster marker 섹션 append도 동일 경로.
- **`src/audit/signals.ts:27-72`**: jaccard/tokenize 유틸. **재사용 안 함** (D-09) — prefix 문자열 비교가 literal 사양이며 더 빠름. 하지만 v1.2 cross-firm detection 시 재평가.

### Established Patterns

- **Phase 1 SUMM-06 caller contract** (`src/summarize/gemini.ts` JSDoc): "body MUST be a real article body. Do NOT substitute title for body." — Phase 8의 Layer 1 short-circuit이 정확히 이 계약의 **caller-side 강제**. summarize 함수는 여전히 real body만 받음.
- **Phase 1 B3 null-summary rendering** (`src/compose/templates.ts`): `summary_ko === null` → "요약 없음 — 본문 부족" 회색 이탤릭. Phase 8이 **제거 대상** (D-04). 모든 low-confidence는 이제 title-verbatim으로 수렴.
- **Phase 2 per-firm Promise.allSettled 격리**: 한 firm의 summarize 실패가 다른 firm 차단 안 함. Cluster detector도 firm 단위로 동작하므로 같은 격리 원칙 유지.
- **Phase 2 failed-firms footer + classifyError**: 수집 실패 firm 목록 footer. Phase 8 data-quality footer는 이 **위가 아니라 아래**에 별도 section으로 추가 (D-14).
- **Phase 4+7 shared chromium lifecycle**: Phase 8은 chromium 건드리지 않음 — guard는 summarize layer 전용.
- **"Aggressive failure detection" 선호** (user memory): D-10 (false positive 수용) + D-11 (접기 UI로 가짜 요약 노출 차단) 둘 다 이 선호에 정렬.
- **"Plain-language questions with concrete examples" 선호** (user memory): 비개발자 친화 문서화 — firms.yaml 주석처럼 템플릿 경고 문구도 사용자가 이해할 수 있게 한글 평문으로.

### Integration Points

- **`package.json`**: 새 script 추가 없음. 기존 test 명령으로 신규 test 파일 자동 실행.
- **`config/firms.yaml`**: Phase 8은 YAML 변경 없음. firm 설정과 무관한 summarize-layer 변경.
- **`.github/workflows/daily.yml`**: Phase 8은 workflow 변경 없음. `$GITHUB_STEP_SUMMARY`는 이미 Phase 3에서 사용 중. 추가 env var 없음.
- **Phase 10 downstream dependency**: Phase 10 DQOBS가 신설 `<footer class="data-quality">` 블록에 per-firm body-length 평균 + confidence 분포 컬럼을 **확장 추가**할 예정. Phase 8은 이 footer의 **최초 shape**을 확정 (cluster marker만).
- **Phase 11 downstream dependency**: Phase 11 cron gate는 수동 `workflow_dispatch` 실행 → 이메일 수신 → 첫 50자 비교로 hallucination 재발 확인. Phase 8의 cluster marker 0건 + digest visual 확인이 cron 재개 조건.

</code_context>

<specifics>
## Specific Ideas

- **v1.0 UAT 재현 기준 (bkl incident)**: 2026-04-19 9개 item 전부 "법무법인 태평양은 1980년에 설립된..." hallucination 패턴이 **재발하면 Phase 8이 감지해야 함**. Phase 7에서 bkl은 disabled이지만, 동일 시나리오를 테스트에서 합성 — 5개 item이 동일 generic body를 받아 Gemini에 들어갔을 때 cluster detector가 첫 50자 일치로 포착하는 통합 테스트 권장.
- **Layer 1과 Layer 2의 정확한 역할 구분**:
  - Layer 1 = "데이터가 부족/없다 — 요약 시도조차 하지 말라." (결정론적)
  - Layer 2 = "데이터는 있는데 이 기사에 관한 게 아니다 — 요약 거부해라." (Gemini 판단)
  - 이 구분을 prompt 주석 + JSDoc에 명시해 downstream planner가 혼동하지 않게 할 것.
- **"사용자가 가짜 요약을 읽지 않게"가 1차 목표**: 모든 결정(D-11 접기 UI, D-14 별도 footer, D-15 step-summary 마커)은 이 한 문장으로 수렴. hallucinated 요약이 사용자 inbox에 도달해 읽히는 것이 Phase 8이 없어서 발생한 사고였고, Phase 8 이후로는 이런 요약이 이메일에 표시되더라도 **눈에 보이지 않게 접혀 있거나 경고 배지가 붙어있어야** 함.
- **Cluster marker 0건 = Phase 11 cron gate의 정상 신호**: 운영 관찰 기간(1주일) 동안 `HALLUCINATION_CLUSTER_DETECTED` 로그가 0회 + 이메일 footer에 `data-quality` 경고 섹션이 안 뜨면 hallucination 재발 없음으로 판정. 1건이라도 뜨면 해당 firm을 원인 조사 후 disable 또는 extractor 수정.
- **Gemini quota 관점**: Layer 1 서버사이드 short-circuit은 현재 Gemini 호출 횟수의 ~10~20% 감소 기대(v1.0 UAT에서 bkl 9 + kim-chang ~5 = 약 14건/일이 "빈/짧은 body" 케이스였음). 250 RPD 한도 내 여유 확보.

</specifics>

<deferred>
## Deferred Ideas

- **Generic-boilerplate 결정론적 pattern library** (로펌별 알려진 "저희는 1980년 설립..." phrase 사전 매칭) — v1.2 후보. 지금은 Layer 2 Gemini prompt가 처리. 유지보수 부담 대비 ROI 낮음.
- **Cross-firm cluster detection** (firm A와 firm B의 item이 같은 prefix) — v1.2. 지금은 same-firm 스코프.
- **Cluster 감지 후 Gemini 재시도 / 본문 재수집 recovery 로직** — v1.2. Phase 8은 detect + demote + surface까지.
- **Per-item confidence 배지 상시 렌더링** (high/medium/low 뱃지 모든 item 옆) — Phase 10 또는 선택 사항.
- **"Firm-level 50% 이상 low confidence면 firm 경고" 로직 (DQOBS-02)** — Phase 10.
- **DRY_RUN=1 DQOBS metric print (DQOBS-03)** — Phase 10.
- **Layer 1 threshold 튜닝** (100자가 적절한지) — Phase 10 observability 누적 데이터로 재평가. 너무 공격적이면 진짜 짧은 알림 item도 접히는 risk, 너무 느슨하면 빠져나가는 hallucination.
- **`summaryModel: 'guard-short-circuit'` 세분 모니터링** — Phase 10 metric surfacing 시 고려. 지금은 기존 `'skipped'` 재사용.
- **Cluster signature로 jaccard 유사도 fallback** — v1.2. 현재 prefix 문자열이 spec literal이고 더 빠름.

### Reviewed Todos (not folded)

(해당 없음 — matched todos 0건.)

</deferred>

---

*Phase: 08-hallucination-guard*
*Context gathered: 2026-04-20*
