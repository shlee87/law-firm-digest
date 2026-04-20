# Phase 6: Firm Audit + Probe - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

**Phase 6은 진단(diagnosis)만 한다 — 수정(remediation)은 절대 안 한다.**

Phase 6이 생산하는 유일한 deliverable은 `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 리포트. 각 enabled firm의 실제 추출 품질(list fetch · selector match · detail body SPA/identical 여부)을 고정 status vocab (`OK / list-fail / selector-empty / detail-identical / detail-empty / detail-quality-unknown`)으로 분류하고, 각 non-OK 행에 고정 remediation vocab (`enable-js-render-detail / fix-selector / disable-firm / migrate-to-sitemap / monitor`)과 target phase를 매핑한다.

**In scope:**
- 프로덕션 코드로 승격된 audit probe (`src/audit/firmAudit.ts` + `src/cli/auditFirms.ts` + `pnpm audit:firms`).
- 12개 enabled firm 전수 진단 (3 RSS + 6 HTML + 4 JS-render). `--include-disabled` flag 시 cooley 포함.
- Tier 차등 depth: RSS는 list-only, HTML/JS-render는 list + N=2 detail + body identity 검사.
- Multi-signal SPA 감지 (exact hash + jaccard ≥0.9 + title-token presence + length<100).
- 하이브리드 AUDIT.md 포맷 (상단 요약 테이블 + 하단 per-firm evidence 블록).
- `scripts/detail-page-audit.ts` 로직을 `src/audit/`로 이식 후 원본 삭제 — 진단 도구 단일화.
- Phase 11 cron 재개 게이트·Phase 7/8/9 재검증에서 동일 도구 재사용 전제.

**Out of scope (explicitly):**
- **수정 코드**: 새 scraper tier 추가 (sitemap), `detail_tier` schema 확장, Gemini prompt guard, enrichBody 분기 로직 변경 — 전부 Phase 7/8/9가 담당.
- **firms.yaml 편집**: audit는 현 상태를 진단만 함. `detail_tier` 켜기·cooley 복구·firm disable 같은 변경은 Phase 7/9가 실행.
- **baseline 비교 로직**: per-firm 과거 기록과 비교해 "갑자기 generic-body로 변함" 감지 — Phase 10 또는 v1.2 후보. Phase 6 최초 실행 시점엔 baseline 없음.
- **DISCUSSION-LOG 이외의 mutable artifact**: AUDIT.md는 Phase 6 실행 결과의 스냅샷이며, Phase 7/8/9가 AUDIT.md를 읽어 PLAN 만든 후에는 내용이 stale해질 수 있음. stale AUDIT.md는 Phase 11에서 재실행으로 refresh.

</domain>

<decisions>
## Implementation Decisions

### Probe form & invocation (Area 1)

- **D-01:** Audit probe는 프로덕션 코드로 승격. 로직은 `src/audit/firmAudit.ts`, CLI wrapper는 `src/cli/auditFirms.ts`, `package.json`에 `"audit:firms": "tsx src/cli/auditFirms.ts"` 추가. 호출은 `pnpm audit:firms [--include-disabled]`. 근거: Phase 11 cron 재개 게이트 + Phase 7/8/9 각각의 재검증 단계에서 이 도구를 반복 호출함. `scripts/` 폴더는 "NOT shipped in production" 주석이 붙은 throwaway 성격 (probe-js-render.ts 선례)이라 장기 재사용 도구를 두기에 부적절.
- **D-02:** 기존 `scripts/detail-page-audit.ts`는 audit probe 로직 이식 후 **삭제**. 이유: 진단 도구를 한 곳으로 통일 (`src/audit/firmAudit.ts`가 single source of truth). 이식 범위는 length:first50 hash 로직 + loadFirms() + scrapeHtml 호출 패턴. 이식과 동시에 signal 확장 (exact hash + jaccard + title-token + length<100 — D-06 참조).
- **D-03:** Exit code 정책은 **fail-loud 3단계**:
  - `0`: 모든 firm이 OK status.
  - `1`: 하나 이상의 firm이 non-OK status (list-fail / selector-empty / detail-identical / detail-empty / detail-quality-unknown).
  - `2`: runtime error (uncaught throw, config load fail) 또는 usage error (invalid flag).

  Phase 11 cron 재개 게이트에서 `pnpm audit:firms`를 CI step으로 넣으면 non-OK firm 남아있을 때 자동으로 빨간색 실패 → 수동 승인 강제. Memory 'aggressive failure detection' 선호와 정렬.

### Scope coverage (Area 2)

- **D-04:** 기본 스코프 = `config/firms.yaml`에서 `enabled: true`인 12개 firm. 분포: 2 RSS (clifford-chance, freshfields) + 6 HTML (shin-kim, yulchon, logos, skadden, kim-chang, bkl) + 4 JS-render (lee-ko, yoon-yang, latham, barun). **12개 전부 매 실행 시 포함** — 일부 스킵·필터 flag 없음 (AUDIT-01 "every enabled firm" 문구 literal 준수).
- **D-05:** `--include-disabled` flag로 disabled firm 포함 가능. 현재 해당: cooley (CF-blocked RSS, v1.1 Phase 9에서 sitemap tier로 복구 예정). 이 flag의 목적은 **Phase 9 pre/post baseline** — Phase 9 시작 전에 `pnpm audit:firms --include-disabled`로 cooley의 현재 상태(CF-block 지속 여부)를 기록하고, Phase 9 완료 후 동일 flag로 복구 확인. AUDIT.md에서 disabled firm은 `(disabled, baseline)` 꼬리표 붙여 표기.
- **D-06 (중복 번호 주의 — 사실상 Tier depth 정책):** Tier별 probe depth 차등:
  - **RSS tier**: list fetch만. `rss.ts#scrapeRss`로 feed 파싱 → items 개수 확인. 결과 status: `OK` (items >0) / `list-fail` (HTTP/parse error) / `selector-empty` (items=0). **detail-identical / detail-empty 검사 없음** — RSS는 feed `<description>`이 item-level이라 SPA generic-body 구조적으로 발생 불가.
  - **HTML tier** (plain-href + onclick 공통): list fetch → items 추출 → N=2 item의 detail URL에 `decodeCharsetAwareFetch` + `extractBody` → multi-signal identity 검사 (D-07).
  - **JS-render tier**: list는 Playwright `scrapeJsRender`로 fetch (기존 경로 재사용) → items 추출 → N=2 detail URL도 **Playwright**로 fetch (js-render firm의 detail도 JS-rendered라고 가정 — Phase 4 활성화 시 이미 확인됨). 브라우저 인스턴스 공유 (Phase 4 shared-browser 패턴 재사용).

  Sample N=2 고정 (SC-2 "N≥2" 최소값). N 증가는 Phase 6 스코프 외 — v1.2 backlog 후보.

### Detail-identity signal (Area 3)

- **D-07:** HTML/JS-render tier의 detail-identity 판정은 **4-signal combined OR**. 하나라도 트리거되면 non-OK:
  1. **Exact hash match** (`${body.length}:${body.slice(0,50).replace(/\s+/g,'')}` 동일): 현 `detail-page-audit.ts` 로직 이식.
  2. **Jaccard token similarity ≥ 0.9**: 두 body를 whitespace tokenize 후 token 집합의 `|A∩B| / |A∪B|` 계산. 0.9 이상이면 "거의 동일" — micro-diff SPA (전화번호·timestamp 차이만 나는 경우) 포착.
  3. **Title-token presence = 0**: 각 item의 title을 token화 (≥2자 한국어/영어 단어) 후 body에 그 token이 **하나도 안 나오면** 해당 item은 generic (body가 해당 article과 topically 무관). firm의 N=2 item 모두 title-token=0이면 signal 트리거.
  4. **Body length < 100 chars**: 명백히 empty/404 페이지. 이 signal은 **단독 status 분기**로 취급 (D-08).

  AUDIT.md evidence 컬럼에 어떤 signal이 트리거됐는지 명시 (예: `"detail-identical (jaccard=0.94, title-tokens 0/3)"` 또는 `"detail-empty (body=23 chars)"`).

- **D-08:** Status 매핑 규칙:
  - `length<100` 트리거 → **`detail-empty`** (원인이 fetch-fail·404·SPA blank route일 가능성이 크고, 해결책이 detail-identical과 다름 — fetch 자체가 문제이거나 selector가 잘못됨).
  - `exact hash OR jaccard≥0.9 OR title-token=0` 트리거 → **`detail-identical`** (하나의 status로 통합, signal 세부는 evidence 컬럼에).
  - HTML list fetch OK + items=0 → `selector-empty`.
  - HTML/JS-render list fetch 실패 (HTTP error/timeout) → `list-fail`.
  - N=2 detail fetch 중 하나도 성공 못하면 → `detail-quality-unknown` (signal 계산 불가).
  - 모든 signal negative + N=2 detail 둘 다 body >100 + identity 검사 통과 → `OK`.

  Phase 6이 도입하는 status vocab은 SC-3이 명시한 6개 (`OK / list-fail / selector-empty / detail-identical / detail-empty / detail-quality-unknown`)를 literal하게 준수. 추가 세분화 (detail-identical-exact vs -fuzzy 등) 하지 않음.

### AUDIT.md structure + remediation (Area 4)

- **D-09:** AUDIT.md는 **하이브리드 포맷**:
  1. **상단 요약 테이블** (grep-친화): `| Firm | Tier | Status | Items | Remediation | Target Phase |`. Planner·운영자가 one-glance로 non-OK만 필터 가능.
  2. **하단 per-firm evidence 블록** (사람 친화): 각 firm별 `## <id> (tier, status)` 섹션 — list URL·HTTP code, items 수, detail sampling 결과 (URL·length·signal 값), root cause 한 줄, remediation 한 줄, target phase 한 줄.
  3. 맨 하단에 **실행 metadata**: 실행 일시, `--include-disabled` 사용 여부, total firms / OK 개수 / non-OK 개수, probe 도구 버전 (`firmAudit.ts` git commit hash) — Phase 11 재검증에서 "언제 찍은 스냅샷인지" 추적.

- **D-10:** Remediation **고정 vocab** (5종) + Target Phase 권장 매핑:
  - `enable-js-render-detail` → Phase 7 (DETAIL-04): html tier인데 detail이 SPA. 해결: `detail_tier: 'js-render'` 플래그 활성.
  - `fix-selector` → Phase 7: list 페이지 fetch는 OK인데 selector가 0 items (selector bitrot). Phase 7 범위 내에서 per-firm selector 재조정.
  - `disable-firm` → **즉시** (firms.yaml 편집, Phase 7 소관이지만 urgency에 따라 Phase 6 end-of-phase에서도 가능): 사이트 폐쇄·접근 불가 등 복구 가망 없음.
  - `migrate-to-sitemap` → Phase 9 (SITEMAP-04): RSS/HTML 경로가 구조적으로 막혔고, 사이트가 WordPress sitemap을 제공함 (cooley 케이스).
  - `monitor` → Phase 10/11: status가 `detail-quality-unknown` (N=2 fetch 실패 등)처럼 당장 판단 불가한 경우. Phase 10 DQOBS 메트릭 관찰 대상.

  AUDIT.md의 Remediation 컬럼은 이 5개 값 중 하나만 허용. writer 코드가 enum으로 강제 → 오타·신조어 방지.

- **D-11:** AUDIT.md는 **append-only가 아닌 overwrite**. `pnpm audit:firms` 매 실행마다 전체 덮어씀 (상단 metadata의 timestamp로 최신성 판단). Phase 11에서 최종 AUDIT.md는 "재개 승인 당시 스냅샷" 역할이며 git log로 이전 버전 조회.

### Claude's Discretion

- `firmAudit.ts` 내부 함수 분할 (tokenize / jaccard / title-token presence / etc.) — 테스트하기 쉬운 단위로 분해하되 네이밍·모듈 경계는 구현자 재량.
- AUDIT.md 상단 요약 테이블의 컬럼 폭·정렬·emoji 사용 여부 — 가독성 우선, 일관성만 유지.
- Per-firm evidence 섹션 내부 정보 순서 (list 먼저 vs detail 먼저) — 진단 흐름에 맞게.
- `--include-disabled` 외 추가 CLI flag 도입 여부 (`--firm <id>` 단일 firm audit, `--json` 출력 포맷 등) — Phase 6 기본 구현엔 불필요하지만 추후 요구 시 backwards-compatible 추가.
- loadFirms()가 현재 enabled=true 필터를 거치므로 audit 전용 loader (`loadFirmsForAudit(includeDisabled: boolean)`) 신설할지, 기존 loader에 flag 추가할지 — 구현자 재량 (기존 call site 영향 없도록).
- Playwright 브라우저 인스턴스 공유 범위 (js-render firm 전체 공유 vs firm별 신규) — Phase 4 shared-browser 패턴 따르되 메모리·타임아웃 특성 확인 후 결정.

### Folded Todos

(해당 없음 — `gsd-sdk todo.match-phase 6`에서 매칭 todo 0건.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 6 원천 문서

- `.planning/backlog/v1.0-data-quality-audit.md` — Phase 6 발동 원인. bkl/kim-chang/shin-kim/logos/skadden/cooley 각 firm의 구체 증상 + 권장 해결 경로 전수 기록. **Phase 6 planner는 이 문서의 "발견된 bug 목록" 표를 AUDIT.md 초기 상태 기대값으로 참조**.
- `.planning/REQUIREMENTS.md` §AUDIT (AUDIT-01 ~ AUDIT-04) — Phase 6 요구사항 locked.
- `.planning/ROADMAP.md` Phase 6 section — Success Criteria (SC-1~4) 및 dependencies.

### Downstream phase 요구사항 (Phase 6 AUDIT.md가 이들의 input)

- `.planning/REQUIREMENTS.md` §DETAIL (DETAIL-01 ~ DETAIL-05) — Phase 7 입력. remediation `enable-js-render-detail` / `fix-selector` 매핑.
- `.planning/REQUIREMENTS.md` §GUARD (GUARD-01 ~ GUARD-04) — Phase 8 입력. detail-empty/detail-identical firm 목록이 hallucination guard 테스트 픽스처 후보.
- `.planning/REQUIREMENTS.md` §SITEMAP (SITEMAP-01 ~ SITEMAP-05) — Phase 9 입력. remediation `migrate-to-sitemap` 매핑.
- `.planning/REQUIREMENTS.md` §DQOBS, §RESUME — Phase 10/11 입력. remediation `monitor` 매핑.

### 이식·재사용 대상 코드

- `scripts/detail-page-audit.ts` — 이식 후 **삭제**. length:first50 hash 로직의 seed; multi-signal 확장 대상.
- `scripts/probe-js-render.ts` — 참조만 (삭제 X). Playwright launch + wait_for + extract 패턴.
- `src/cli/checkFirm.ts` — Reporter 인터페이스, exit code 규약, argv 파서 스타일 거울.
- `src/pipeline/fetch.ts` — firm.type tier dispatch 로직 재사용.
- `src/scrapers/rss.ts`, `html.ts`, `jsRender.ts` — 각 tier list scraper 직접 호출.
- `src/scrapers/util.ts#decodeCharsetAwareFetch` + `#extractBody` — HTML detail fetch + body 추출.
- `src/scrapers/robots.ts` — robots.txt 준수 (audit도 production pipeline과 동일 예의 수준).
- `src/config/loader.ts#loadFirms` — firms.yaml 로더. `--include-disabled` 지원 확장 대상.

### 이전 phase CONTEXT (결정 선례)

- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — Promise.allSettled 격리 패턴. Phase 6 probe도 한 firm 실패가 나머지 audit 중단시키지 않도록 동일 패턴.
- `.planning/phases/03-observability-dev-loop/03-CONTEXT.md` — `pnpm check:firm` CLI 규약 (Reporter, exit codes, human-readable grep-friendly output).
- `.planning/phases/04-js-rendered-tier-conditional/04-CONTEXT.md` — shared chromium browser 패턴, `--only-shell` 설치, wait_for 15s timeout.
- `.planning/phases/05-triggered-polish-v1-x-backlog/05-CONTEXT.md` — CONTEXT.md을 governance artifact로 frozen하는 컨벤션.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/scrapers/{rss,html,jsRender}.ts`**: tier별 list scraper. audit probe가 list 단계에서 직접 호출.
- **`src/scrapers/util.ts#decodeCharsetAwareFetch`**: 한국어 사이트 EUC-KR/CP949 디코딩 포함 HTTP fetch. HTML tier detail fetch에서 재사용.
- **`src/scrapers/util.ts#extractBody`**: HTML에서 body selector로 본문 추출. 기존 `detail-page-audit.ts`가 사용 중 — audit probe 이식 시 그대로 유지.
- **`src/config/loader.ts#loadFirms`**: YAML 로드 + zod 검증 + enabled:true 필터. audit용으로 `--include-disabled`를 지원하는 variant 필요 (D-05).
- **`src/cli/checkFirm.ts` Reporter 인터페이스**: stage-by-stage 출력용. audit 전용 CliReporter는 stage 대신 per-firm row 출력으로 재설계.
- **`scripts/detail-page-audit.ts`**: length:first50 hash 로직의 seed. D-01/D-02에 따라 `src/audit/firmAudit.ts`로 이식 후 원본 삭제.
- **`scripts/probe-js-render.ts`**: Playwright launch pattern + wait_for 15s timeout. js-render tier detail fetch 구현 시 참조.

### Established Patterns

- **Per-firm 격리 (Promise.allSettled)**: Phase 2에서 확립. audit도 반드시 이 패턴 — 한 firm의 네트워크 타임아웃·파싱 에러가 전체 audit을 중단시키면 안 됨.
- **p-limit(3) 동시성 제한**: Phase 1에서 확립 (politeness). audit probe도 동일 제한. 단, Playwright js-render detail은 브라우저 리소스 고려해 p-limit(2) 또는 순차 실행 고려.
- **Honest User-Agent + robots.txt**: Phase 1 확립. audit probe도 동일 UA (`LegalNewsletterBot/1.0`) + `robots.ts` 선행.
- **exit code 의미론**: `check:firm`은 0=완료 / 1=runtime / 2=usage. audit은 여기에 "1=non-OK firm 발견"이라는 sematic 추가 (D-03).
- **config/firms.yaml 주석 규칙**: 비개발자 편집 가능성 유지. audit probe가 firms.yaml을 읽기만 하므로 규칙 영향 없음.

### Integration Points

- **`package.json` scripts**: `"audit:firms": "tsx src/cli/auditFirms.ts"` 추가.
- **`.planning/phases/06-firm-audit-probe/06-AUDIT.md`**: probe 출력 파일. 경로 고정 (`src/audit/firmAudit.ts` 내부에 하드코딩 — Phase 11 cron 게이트도 동일 경로 기대).
- **Phase 7/8/9 planner 읽기 경로**: downstream 3 phase의 planner는 `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 상단 요약 테이블을 input으로 사용. 매핑: `enable-js-render-detail`/`fix-selector` → Phase 7, `migrate-to-sitemap` → Phase 9, `monitor`(detail-quality-unknown) → Phase 10/11, disable-firm → 즉시 조치.
- **Phase 11 cron 재개 게이트**: `.github/workflows/daily.yml`에 `pnpm audit:firms` step 추가 (workflow_dispatch) — non-OK firm 있으면 exit 1로 CI 빨간색 → 수동 승인 강제. schedule: block uncomment는 이 step PASS 후에만.

</code_context>

<specifics>
## Specific Ideas

- **Memory "aggressive failure detection" 선호**: 다중 signal 조합(D-07)의 근거. 1-signal 현 상태(`detail-page-audit.ts`의 exact hash 단독)는 micro-diff SPA 놓침. 4-signal OR로 가면 false positive가 약간 늘지만 Phase 11 cron 재개 전에 loud alarm이 울리는 쪽이 조용히 지나가는 것보다 낫다.
- **"진단 도구 단일화"**: 현재 `scripts/detail-page-audit.ts` + `scripts/probe-js-render.ts` 둘이 각자 html-tier / js-render-single-firm을 부분 커버. Phase 6은 이 둘의 기능을 `src/audit/firmAudit.ts`로 통합 + 확장. `detail-page-audit.ts`는 이식 후 삭제 (probe-js-render.ts는 single-firm 디버깅용으로 남김 — 범위 다름).
- **"Phase 7/8/9 자동 routing"의 의도**: Remediation 고정 vocab(D-10)의 실용적 가치는 Phase 7 planner가 AUDIT.md를 읽고 `grep "enable-js-render-detail"` / `grep "fix-selector"`로 Phase 7 scope 자동 도출, Phase 9 planner는 `grep "migrate-to-sitemap"`으로 대상 firm 확인. free-form remediation이면 이게 안 됨.
- **v1.0 UAT incident 컨텍스트**: 2026-04-19 nks4860@gmail.com으로 bkl 9개 item digest가 전부 "법무법인 태평양은 1980년에 설립된..."으로 시작하는 동일 요약이었음. Phase 6의 detail-identical signal(D-07)이 이 상황을 재발견할 수 있어야 한다 — AUDIT.md에서 bkl row가 `detail-identical` status로 나와야 Phase 6 성공.

</specifics>

<deferred>
## Deferred Ideas

- **Per-firm baseline 저장/비교**: "정상이던 firm이 갑자기 generic-body로 변함" 감지용 추세 분석. Phase 6 최초 실행엔 baseline 없고, 매번 덮어쓰는 AUDIT.md만으로는 추세 파악 불가. → Phase 10 DQOBS 관찰 대상 또는 v1.2 backlog (`state/audit-baseline.json` 신규 파일).
- **`--strict` flag로 signal 선택**: default는 exact-hash + length<100, --strict 시 jaccard·title-token 추가. 운영자가 noise tolerance 조절. → 현재는 combined-always로 결정 (D-07). flag 누락 시 silent noise 리스크가 더 큼.
- **Signal별 세분화 status** (`detail-identical-exact` / `-fuzzy` / `-generic` 등): SC-3 고정 vocab 위반이라 제외. evidence 컬럼에 signal 명시로 정보 손실 보완.
- **Sample size N 증가 (3, 5)**: SC-2 최소값 N=2 고정. Phase 6 runtime·politeness 고려. N=3 이상은 일부 firm에서 실제 도움이 될 수 있으나 optionalize는 복잡도 증가. → v1.2 backlog 후보.
- **AUDIT.md 포맷 configurability** (JSON 출력 옵션 등): Phase 6 기본은 markdown-only. JSON 필요성은 Phase 7/8/9 planner가 실제 사용해본 후 판단 → v1.2 후보.
- **`--firm <id>` 단일 firm audit**: 개별 firm 재검증용 CLI flag. check:firm이 이미 유사 기능 제공하므로 Phase 6에서는 불필요 — backwards-compatible하게 추후 추가 가능 (Claude's Discretion 범위).
- **robots.txt audit 준수**: audit probe도 `robots.ts` 선행 (이미 Established Patterns에 포함) — 별도 deferred 아님, 결정 일부.
- **GHA workflow_dispatch 통합**: Phase 6 자체에선 local 실행만 고려. Phase 11에서 `.github/workflows/daily.yml`에 audit step 추가는 Phase 11 소관.

### Reviewed Todos (not folded)

(해당 없음 — matched todos 0건.)

</deferred>

---

*Phase: 06-firm-audit-probe*
*Context gathered: 2026-04-19*
