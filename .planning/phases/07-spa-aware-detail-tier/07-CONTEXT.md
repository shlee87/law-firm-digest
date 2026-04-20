# Phase 7: SPA-Aware Detail Tier - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7은 **list-page fetch 방식과 detail-page fetch 방식을 독립적으로 제어**할 수 있는 설정 경로를 만든다 — `firm.detail_tier: 'js-render' | 'static'` field를 schema에 추가하고, `enrichBody`의 Playwright 분기를 기존 `type === 'js-render'` gate에서 `detail_tier === 'js-render'` gate로 교체한다.

Phase 7의 배경은 v1.0 UAT에서 드러난 bkl hallucination incident다: bkl은 `type: html`(목록은 정적 HTML)이지만 detail URL(`informationView.do?infoNo=N`)이 SPA라 모든 item에 동일한 landing HTML이 반환됨 → Gemini가 이를 기반으로 9개 item 전부 "법무법인 태평양은 1980년에 설립된..."으로 hallucinate. 오늘의 `type`-gated fallback 로직은 bkl 같은 "목록 static + detail SPA" 조합을 표현하지 못한다.

**In scope:**
- `detail_tier` zod schema 추가 (DETAIL-01/05) — optional field, default `'static'`.
- `src/pipeline/enrichBody.ts`의 type-gated Playwright fallback을 **detail_tier-gated always-Playwright 분기**로 교체 (DETAIL-02).
- `src/pipeline/run.ts`의 `hasJsRender` check 확장 — detail_tier에도 반응.
- 6개 firm에 `detail_tier: 'js-render'` 명시: **bkl, kim-chang** (DETAIL-04 직접) + **lee-ko, yoon-yang, latham, barun** (기존 js-render firms, migration으로 명시 추가).
- **Selector audit remediation** (06-AUDIT.md이 Phase 7로 라우팅한 4개 firm):
  - `logos` (list-selector empty): list_item 셀렉터 교체.
  - `skadden` (list-selector empty): list_item 셀렉터 교체.
  - `lee-ko` (detail body 36/32 chars): detail body selector 조정 (detail_tier 전환 후 재검증).
  - `barun` (detail body 0/0 chars): 동일.
- kim-chang 활성화 후 **root-cause 조사 포함** — `detail_tier: 'js-render'`로 설정 후 `pnpm audit:firms`가 여전히 실패하면 Phase 7 내에서 URL 템플릿 검증·WAF signature 분석 수행, fix 또는 명시적 `disable` 사유 YAML 주석 기록.
- Verification 도구: `pnpm audit:firms` (Phase 6이 승격한 single source of truth). 각 SC는 audit report의 status 컬럼을 읽어 판정.

**Out of scope (explicitly):**
- **Gemini hallucination guard** (empty/generic body → title-verbatim 규칙) — Phase 8 (GUARD-01~04).
- **Cooley sitemap tier** (`type: sitemap` scraper) — Phase 9 (SITEMAP-01~05).
- **Per-firm body-quality metric surfacing** (GHA step-summary 컬럼, email footer 플래그) — Phase 10 (DQOBS-01~03).
- **Cron schedule resumption** (`.github/workflows/daily.yml`의 `schedule:` uncomment) — Phase 11 (RESUME-01~02).
- **shin-kim list-fail** — 06-AUDIT.md가 `monitor → Phase 10/11`로 라우팅. Phase 7에서 건드리지 않음 (fetch 자체가 죽는 건 selector 문제가 아니라 네트워크/블록이며, DETAIL 요구사항 외).
- **yulchon `detail-quality-unknown`** — 06-AUDIT.md가 `monitor`로 라우팅, DQOBS가 추적할 대상. 선택적으로 probe만 하되 config 수정 안 함.
- **`detail_tier` 기반 per-firm 재시도 정책·타임아웃 커스터마이즈** — 현재 DETAIL_PAGE_TIMEOUT_MS (15s) 하드코딩 유지. Per-firm tuning은 v1.2 backlog.
- **Sample N 증가** — audit는 N=2 detail 샘플 고정(Phase 6 D-06). Phase 7은 이 기본값 유지.

</domain>

<decisions>
## Implementation Decisions

### Scope boundary (Area 1)

- **D-01 (Phase 7 = detail_tier + selector remediation):** ROADMAP SC는 `detail_tier` flag와 bkl/kim-chang 활성화만 명시하지만, **06-AUDIT.md가 Phase 7로 라우팅한 모든 firm을 하나의 phase 단위로 처리**한다. 즉 selector-empty/detail-empty로 분류된 4개 firm (logos, skadden, lee-ko, barun)의 selector 수정까지 Phase 7 scope. 근거: v1.1 milestone acceptance는 "각 enabled firm의 detail body가 실제 article content를 포함"이며, selector bitrot으로 0 items인 firm이 남아있으면 cron 재개 게이트(Phase 11)를 통과할 수 없음 — 논리적으로 묶는 게 맞음. PR 1개가 커지는 것보다 "audit report의 Phase 7 행이 전부 OK로 변함"이라는 단일 검증 축이 가치.

- **D-02 (REQUIREMENTS.md 업데이트 필요):** DETAIL-01~05는 현재 selector 수정을 언급하지 않음. Phase 7 planner가 실제 작업을 PLAN.md에 분해할 때 "SELECTOR-01: logos list_item 셀렉터 교체", "SELECTOR-02: skadden list_item" 등 phase-local task id로 기술하고, REQUIREMENTS.md에는 "06-AUDIT.md remediation 반영" 요구사항을 추가할지 planner가 판단. 기존 DETAIL-01~05 의미는 그대로.

### Schema & migration (Area 2)

- **D-03 (Schema shape):** `src/config/schema.ts`의 `FirmSchema`에 `detail_tier: z.enum(['js-render', 'static']).default('static').optional()` 추가. `.strict()` 유지 — 오타시 `firms[N].detail_tier` 경로 포함된 zod 에러. DETAIL-05 만족.

- **D-04 (Migration = explicit YAML for 6 firms):** 다음 6개 firm에 `detail_tier: 'js-render'` 명시 추가:
  - **bkl** — v1.0 UAT에서 detail-identical 확인 (SC-2 검증 대상).
  - **kim-chang** — DETAIL-04 literal 준수 (SC-3 검증 대상).
  - **lee-ko, yoon-yang, latham, barun** — 기존 `type: js-render` firms. 이들은 현재 `type` 기반 자동 Playwright fallback에 의존 중이라, type-gate 제거(D-05) 시 detail extraction이 static only로 퇴행. 명시 선언으로 퇴행 방지 + 비개발자도 YAML만 보고 "어느 firm이 detail을 js로 뽑는지" 한눈에 파악.

  나머지 firms(clifford-chance·freshfields·shin-kim·yulchon·logos·skadden·disabled cooley)는 default `'static'` 유지 — YAML 수정 불필요, DETAIL-03 backwards compat literal 준수. 이 중 logos/skadden은 selector 수정 후 detail page fetch가 실패하면 Phase 7 내에서 `detail_tier: 'js-render'`로 프로모션 가능 (Claude's Discretion).

- **D-05 (enrichBody.ts type-gate 제거):** `src/pipeline/enrichBody.ts` line ~120의 `if (r.firm.type === 'js-render' && staticBody.length < 200 && browser)` 분기 **완전 제거**. 대체 로직:
  ```
  if (r.firm.detail_tier === 'js-render') {
    // Playwright only — static fetch 스킵
    const hydratedBody = await fetchViaPlaywright(browser, item.url, firm.selectors?.body);
    return { ...item, description: hydratedBody };
  } else {
    // 기존 static fetch 경로 (현재 코드와 동일)
  }
  ```
  type과 detail_tier는 **관심사 분리** — `type`은 list fetch 방식만 제어, `detail_tier`는 detail fetch 방식만 제어. Phase 8+ 유지보수에서 두 flag의 semantic overlap 없음.

- **D-06 (Browser launch trigger 확장):** `src/pipeline/run.ts` line ~157의 `hasJsRender` 계산을 다음과 같이 수정:
  ```
  const hasJsRender = firms.some(f => f.type === 'js-render' || f.detail_tier === 'js-render');
  ```
  Phase 4에서 세운 "shared chromium per run" 패턴 유지. html-tier firm도 detail_tier='js-render'이면 browser 인스턴스 필요.

### detail_tier='js-render' semantics (Area 3)

- **D-07 (항상 Playwright — static fetch 스킵):** `detail_tier: 'js-render'`인 firm의 detail fetch는 **static fetch를 시도하지 않고 바로 Playwright로** 가져온다. 근거: bkl의 실제 동작을 보면 static fetch는 ~수천 자의 generic landing HTML을 반환하는데(length 임계치 미달 조건이 False) threshold 기반 fallback은 이를 못 잡음. DETAIL-02 literal ("instead of static fetch")과 일치. 성능 영향: +2~3초/item × 6 firms × ~5 items ≈ +2분/run → GHA 2,000분/월 한도 내 충분.

- **D-08 (Body selector 재사용):** Playwright로 가져온 `page.content()` HTML에 동일한 `extractBody(html, firm.selectors?.body)` 체인 적용. firm이 `selectors.body`를 지정하지 않으면 util.ts의 기본 selector 사슬 사용. Phase 4 js-render firms가 이미 이 패턴으로 동작 중 — 재사용.

- **D-09 (Per-item BrowserContext 유지):** 현재 enrichBody.ts가 item마다 `browser.newContext({ userAgent: USER_AGENT })`를 새로 만들고 try/finally로 close하는 패턴 유지. 쿠키·세션 격리 + Phase 4 shared-browser 패턴과 정렬. Context reuse 최적화는 v1.2 backlog.

### kim-chang handling (Area 4)

- **D-10 (kim-chang = activate + verify + root-cause within Phase 7):** DETAIL-04 literal 준수하여 `detail_tier: 'js-render'` 추가. 활성화 후 `pnpm audit:firms`로 검증:
  - **Playwright fetch 성공 → `OK` status**: 끝. SC-3 ("kim-chang shows at least one non-empty body") 충족.
  - **Playwright fetch 여전히 실패 → `detail-empty` 또는 `detail-quality-unknown`**: Phase 7 내에서 root-cause 조사:
    1. URL 템플릿 `detail.kc?sch_section={1}&idx={2}` 실제 브라우저로 열어 404/WAF challenge 확인.
    2. 실제 kimchang.com detail URL 패턴 수동 probe (DevTools → Network 탭으로 실제 요청 URL 캡처).
    3. 수정 가능 → `link_template` 업데이트 + 재검증.
    4. 수정 불가 (접근 차단 확정) → YAML에 `enabled: false` + 주석으로 "WAF-blocked, see Phase 7 investigation note" 기록, DETAIL-04 충족 불가 사유 명시.

  Phase 10/11 monitor로 defer하지 않는 이유: Phase 10은 observability (metric surfacing), Phase 11은 cron gate — **kim-chang을 고치거나 disable 사유를 기록하는 작업은 그 둘 사이에 낄 자리가 없음**. Phase 7 scope에 포함해 확정.

### Verification

- **D-11 (Phase 6 도구 재사용):** 모든 Phase 7 Success Criteria는 `pnpm audit:firms` 출력(`.planning/phases/06-firm-audit-probe/06-AUDIT.md`)의 status 컬럼을 읽어 판정:
  - SC-1 (detail_tier field 동작 + 미설정 firm 호환): default `'static'`이면 기존 firms audit status 변동 없음.
  - SC-2 (bkl 2+ distinct bodies): audit report에서 bkl row가 `detail-identical` → `OK`로 전환.
  - SC-3 (kim-chang ≥1 non-empty body): kim-chang row가 `detail-quality-unknown`/`detail-empty` → `OK` (또는 D-10 fallback 경로).
  - SC-4 (`detail_tier: 'invalid-value'` → zod error): 수동 테스트로 확인 (audit 도구 무관).

  추가로 selector-fix 4개 firms도 audit report에서 `selector-empty`/`detail-empty` → `OK`로 전환 확인.

### Claude's Discretion

- **selector-fix 4개 firms 접근 방식**: firm당 1 plan으로 나눌지 / 한 plan에 묶을지 / probe-driven 이터레이션으로 할지는 planner 재량. `pnpm check:firm <id>`으로 live HTML 확인 → 셀렉터 조정 → `pnpm audit:firms`로 전체 회귀 확인 루프가 기본 패턴.
- **logos/skadden detail page tier 판정**: list 셀렉터 수정 후 detail page가 여전히 empty면 `detail_tier: 'js-render'`로 프로모션 여부 — 실제 detail URL을 브라우저로 열어보고 판단. Phase 7 내에서 해결.
- **lee-ko/barun body selector 형태**: `selectors.body`를 firm-specific CSS 셀렉터로 추가할지 / util.ts 기본 체인에 맡길지 — 실제 detail HTML 관찰 후 결정. firm-specific이 더 견고하면 YAML에 body selector 명시.
- **kim-chang root-cause 조사 방법론**: DevTools 수동 probe vs `scripts/probe-js-render.ts` 재사용 vs 신규 probe 스크립트 — planner 재량.
- **YAML 주석 포맷**: 새로 추가되는 `detail_tier:` 줄에 비개발자용 인라인 주석 (`# detail 페이지가 JS로 렌더링되는 firm`) 삽입 여부 — firms.yaml의 기존 주석 컨벤션 따를지 planner 재량.
- **enrichBody.ts의 if/else vs early-return 구조**: D-05의 새 분기 구조 구현 스타일 — readability 기준으로 결정.

### Folded Todos

(해당 없음 — `gsd-sdk todo.match-phase 7`에서 매칭 todo 0건.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 요구사항

- `.planning/REQUIREMENTS.md` §DETAIL (DETAIL-01 ~ DETAIL-05) — `detail_tier` field, Playwright routing, default static, bkl/kim-chang activation, zod error message requirements. Locked.
- `.planning/ROADMAP.md` Phase 7 section — Goal, Success Criteria (SC-1~4), `Depends on: Phase 6`.

### Audit input (06-AUDIT.md이 Phase 7의 input)

- `.planning/phases/06-firm-audit-probe/06-AUDIT.md` — **Phase 7 planner의 핵심 입력**. 8개 non-OK firm 중 4개 (bkl, logos, skadden, lee-ko, barun) + kim-chang까지 Phase 7 remediation. Status 컬럼으로 verification 판정.
- `.planning/phases/06-firm-audit-probe/06-CONTEXT.md` §canonical_refs + D-10 (remediation vocab) — `enable-js-render-detail` / `fix-selector` 매핑 근거.
- `.planning/backlog/v1.0-data-quality-audit.md` — bkl UAT incident의 구체 증상(9개 item 전부 동일 hallucination), kim-chang detail fetch 실패의 배경("WAF or URL pattern" 추정), v1.1 Phase cycle의 설계 의도.

### 수정·교체 대상 코드

- `src/config/schema.ts` — `FirmSchema`에 `detail_tier` 필드 추가 (D-03). Zod `.strict()` + `.superRefine()` 기존 패턴 유지.
- `src/pipeline/enrichBody.ts` — D-05 분기 교체 대상. 기존 line ~120의 `type === 'js-render'` gate 제거. Per-firm isolation, per-item try/catch, 500ms politeness delay, BrowserContext 패턴은 유지.
- `src/pipeline/run.ts` — D-06 `hasJsRender` 계산 수정 (line ~157). Composition root 순서는 변경 금지 (Phase 1 lock).
- `config/firms.yaml` — 6개 firm에 `detail_tier: 'js-render'` 명시 (D-04). logos/skadden/lee-ko/barun의 selector 수정.

### 재사용 대상 패턴

- `src/scrapers/jsRender.ts` — Playwright launch/wait_for/content() 패턴. enrichBody의 detail-tier Playwright 호출부는 이 모듈의 패턴 참조(launch는 run.ts에서 이미 수행하므로 context만).
- `src/scrapers/util.ts#extractBody` + `#decodeCharsetAwareFetch` — body 추출 공통 함수. Playwright path도 `page.content()` HTML에 동일하게 적용 (D-08).
- `src/cli/checkFirm.ts` — 개별 firm 수동 probe. selector-fix 이터레이션 도구.
- `src/audit/firmAudit.ts` + `src/cli/auditFirms.ts` + `pnpm audit:firms` — Phase 7의 **유일한 verification 채널** (D-11). Phase 6이 승격함.

### 관련 phase 선례

- `.planning/phases/04-js-rendered-tier-conditional/04-CONTEXT.md` — shared chromium per run, `--only-shell` 설치, 15s wait_for timeout, `newContext + newPage + goto(waitUntil: 'domcontentloaded')` 패턴. Phase 7은 이 모든 패턴을 detail fetch에 동일 적용.
- `.planning/phases/02-multi-firm-html-tier-failure-isolation/02-CONTEXT.md` — `Promise.allSettled` per-firm isolation, `decodeCharsetAwareFetch` charset 처리. Phase 7의 per-item isolation 기반.
- `.planning/phases/06-firm-audit-probe/06-CONTEXT.md` D-07/D-08 — 4-signal detail-identity classifier (exact hash + jaccard + title-token + length<100). Phase 7 수정 후 bkl이 `detail-identical`에서 탈출하는지 이 classifier가 판정.

### Milestone context

- `.planning/PROJECT.md` Current Milestone: v1.1 Data-Quality Hardening — acceptance: "각 enabled firm detail body = 실제 article content, Gemini summary = 실제 내용 반영". Phase 7은 이 acceptance의 선행 조건.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/pipeline/enrichBody.ts`**: 기존 파일 그대로 구조 유지. 교체 지점은 **딱 한 곳** — line 120-151 근처의 `type === 'js-render' && staticBody.length < 200` 분기. 나머지(500ms delay, per-firm pLimit(1), per-item try/catch, newContext 패턴)는 그대로.
- **`src/pipeline/run.ts` line ~157**: `hasJsRender` 계산 한 줄 수정으로 browser launch 조건 확장 (D-06).
- **`src/config/schema.ts` FirmSchema**: zod `.strict()` + `.default()` + `.superRefine()` 패턴이 이미 확립됨 (Phase 1/4). `detail_tier` 추가는 이 패턴 순수 연장.
- **`src/audit/firmAudit.ts`**: Phase 6이 승격한 진단 도구. 코드 변경 없이 `pnpm audit:firms` 실행만으로 Phase 7 SC 검증 가능.
- **`src/cli/checkFirm.ts`**: selector 디버깅 시 firm 단위로 전체 파이프라인 실행 (`pnpm check:firm <id>`). selector-fix 이터레이션 도구.
- **`scripts/probe-js-render.ts`**: single-firm Playwright 디버깅용. kim-chang root-cause 조사 시 재사용 가능 (D-10 fallback 경로).

### Established Patterns

- **Per-firm Promise.allSettled 격리** (Phase 2 D-P2-03): 한 firm의 Playwright 실패가 다른 firm을 막으면 안 됨. enrichBody가 이미 per-item try/catch로 준수 중.
- **Shared chromium per run** (Phase 4): `chromium.launch({ headless: true })`는 run.ts 상단에서 1번만, `browser.close()`는 finally에서 1번만. Phase 7은 **브라우저 launch 조건만 확장**, lifecycle은 그대로.
- **zod `.strict()` + path-aware error** (Phase 1 CONF-02): 정확한 YAML 경로(`firms[N].detail_tier`) 포함 에러 메시지 자동 생성. DETAIL-05 요구사항은 이 패턴으로 무료로 충족.
- **YAML 비개발자 편집 가능성** (Phase 1 CONF-07): `config/firms.yaml` 상단 주석 블록으로 필드 설명. `detail_tier` 필드도 이 주석 블록에 설명 추가 필요.
- **fail-loud run-transaction 순서** (Phase 1 OPS-03): fetch → enrich → filter → dedup → summarize → email → state 순서 절대 변경 금지. Phase 7은 enrich 단계 **내부**만 수정.
- **Memory "aggressive failure detection" 선호**: 4개 selector-fix firm이 Phase 7 OK로 전환 안 되면 `pnpm audit:firms`가 exit 1 → CI 빨간불 → Phase 11 cron gate를 blocker로 잡음.

### Integration Points

- **`package.json`**: 새 script 추가 없음. 기존 `"audit:firms": "tsx src/cli/auditFirms.ts"` + `"check:firm"` 그대로 Phase 7 검증에 사용.
- **`config/firms.yaml`**: 6개 firm (bkl, kim-chang, lee-ko, yoon-yang, latham, barun) 블록에 `detail_tier: 'js-render'` 한 줄씩 추가. 4개 firm (logos, skadden, lee-ko, barun) selector 블록 수정.
- **`.github/workflows/daily.yml`**: Phase 7에서 workflow 수정 없음. Phase 11에서 `pnpm audit:firms` step 추가 시 참고.
- **Phase 8 downstream dependency**: Phase 8 hallucination guard는 Phase 7이 detail body를 실제 article content로 채워준다는 전제 하에 동작 — empty/short body 케이스가 대폭 줄어듦. Phase 7 완료 후 Phase 8이 처리할 잔여 failure modes만 남음.
- **Phase 9 downstream dependency**: Phase 9 sitemap tier는 Phase 7의 Playwright-based detail fetch 경로를 재사용한다고 ROADMAP에 명시. D-07의 "detail_tier='js-render' → 항상 Playwright" 의미론이 Phase 9의 sitemap firms에도 적용되도록 설계.

</code_context>

<specifics>
## Specific Ideas

- **v1.0 UAT 재현 기준 (bkl)**: 2026-04-19 nks4860@gmail.com으로 도착한 bkl 9개 item digest에서 모든 요약이 "법무법인 태평양은 1980년에 설립된..."으로 시작했다. Phase 7 완료 후 동일 manual run에서 이 hallucination pattern이 사라져야 한다. 검증 방법: `workflow_dispatch`로 run → digest 수신 → bkl 섹션의 첫 50자 5개 이상 비교 → 서로 다르면 PASS.
- **"Playwright는 DETAIL-02 literal"**: "When `detail_tier: 'js-render'`, `enrichBody` fetches each item's detail URL via Playwright ... instead of static fetch" — 이 문장은 "대신"이라는 literal이 있음. D-07의 always-Playwright 결정은 이 literal과 정렬.
- **kim-chang은 "모르는 실패"**: 현재 아무도 kim-chang detail URL이 WAF인지 URL pattern인지 확인 안 함. Phase 7 Task에서 이걸 **실제로 브라우저로 열어보는** 수동 probe가 요구됨. "추정"으로 끝내지 말고 "WAF challenge 화면이 뜨는가 / 404가 뜨는가 / JS를 기다리면 본문이 나오는가" 중 정답을 찾을 것.
- **audit report의 Phase 7 행 = 진행 보드**: Phase 7 planner가 06-AUDIT.md를 읽을 때, 행이 6개 (bkl, logos, skadden, kim-chang, lee-ko, barun) + 재검증 대상. 각 행이 OK로 전환되는 과정이 곧 Phase 7의 진행률. planner는 이 6개를 개별 plan task id로 분해 권장.

</specifics>

<deferred>
## Deferred Ideas

- **Per-firm `detail_tier` 세분화 옵션** (예: `js-render-with-wait`, `js-render-lite`): 현재는 js-render/static 이분. 특정 firm이 wait_for 형식을 detail에도 필요로 하면 v1.2 후보. 지금은 Playwright `domcontentloaded` + 고정 15s timeout 공통 사용.
- **shared BrowserContext per run** (vs per-item): 현재 item마다 newContext. 성능 개선 여지 있으나 cookies·세션 격리 변동 리스크. v1.2 후보.
- **Per-firm timeout 커스터마이즈**: DETAIL_PAGE_TIMEOUT_MS=15000 하드코딩. 느린 firm은 firm.detail_timeout_ms 필드로 override. v1.2 후보.
- **Concurrent detail fetches within firm** (pLimit(2) 등): 현재 firm 내부는 sequential (politeness). 일부 firm은 parallel이 안전할 수 있으나 1-req/firm-day 정신에 충돌. 제외.
- **`detail_tier: 'auto'` 자동 감지**: static fetch 시 body<200이면 Playwright로 자동 escalation. Phase 7 type-gated fallback의 본래 의도였지만 bkl처럼 "long-but-identical" 케이스를 놓침 — D-07에서 의도적으로 제외. v1.2에서 4-signal 기반 detection으로 돌아올 수 있음 (Phase 6 D-07 참조).
- **Playwright fallback for static firms** (detail_tier='static'인데 body가 짧을 때): 현재 제외. `detail_tier` 값이 곧 "이 firm이 Playwright를 필요로 한다"는 선언이라 자동 fallback 섞지 않음.
- **selector audit auto-remediation** (AI가 HTML 보고 셀렉터 제안): 4개 firm selector fix는 수동 probe + 판단. 자동화는 v1.2 후보.
- **kim-chang이 disable로 끝날 경우의 대체 firm**: kim-chang fetch가 완전 차단 확정이면 대체 KR firm 추가 검토 — v1.2 milestone scope.

### Reviewed Todos (not folded)

(해당 없음 — matched todos 0건.)

</deferred>

---

*Phase: 07-spa-aware-detail-tier*
*Context gathered: 2026-04-20*
