---
phase: quick-260802-jex
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/scrapers/util.ts
  - test/scrapers/util.test.ts
  - config/firms.yaml
  - .planning/phases/06-firm-audit-probe/06-AUDIT.md
autonomous: true
requirements:
  - barun-site-redesign-html-tier-migration

must_haves:
  truths:
    - "pnpm check:firm barun exits 0 and parses >=1 item with url https://barunlaw.com/letter/N (no Playwright involved)"
    - "Parsed barun items have non-empty Korean titles and publishedAt derived from YYYY-MM-DD date text"
    - "extractLinkUrl resolves href when the list_item element IS the anchor (self-match fallback), while descendant-anchor firms behave exactly as before"
    - "config/firms.yaml passes zod validation (no wait_for on the html-tier barun entry)"
    - "GitHub issues #11 #12 #13 #14 #15 #16 are closed with a Korean explanation comment"
  artifacts:
    - path: "src/scrapers/util.ts"
      provides: "extractLinkUrl Mode 2 self-match fallback ($(itemEl).is(selector) -> attr('href'))"
    - path: "test/scrapers/util.test.ts"
      provides: "unit test: self-match fallback resolves href from list_item-is-anchor DOM"
    - path: "config/firms.yaml"
      provides: "barun entry: type html, no wait_for, selectors for #barunnew-sec .board-item DOM"
    - path: ".planning/phases/06-firm-audit-probe/06-AUDIT.md"
      provides: "regenerated audit rows (CLAUDE.md audit-freshness convention after firms.yaml edit)"
  key_links:
    - from: "config/firms.yaml barun selectors.link"
      to: "src/scrapers/util.ts extractLinkUrl Mode 2"
      via: "string-selector self-match fallback reads href off the board-item anchor itself"
      pattern: "is\\(selectors\\.link\\)"
    - from: "pnpm check:firm barun"
      to: "scrapeHtml -> parseListItemsFromHtml"
      via: "runDaily firmFilter dispatches type=html to the static fetch path"
---

<objective>
barunlaw.com 리뉴얼 대응: barun을 js-render tier에서 html tier로 전환하고 selector를 새 DOM에 맞게 수정한다. 2026-07-28~08-02 6일 연속 daily 실패(`playwright-timeout waiting for .articlebox`)의 근본 원인 제거. 검증 통과 후 자동 생성된 GitHub 이슈 #11~#16을 close한다.

Purpose: 목록 페이지가 서버 렌더링으로 전환되었으므로 Playwright 없이 static fetch로 안정 수집 (daily digest 복구).
Output: extractLinkUrl self-match fallback + 단위 테스트, firms.yaml barun 항목 재작성, 06-AUDIT.md 갱신, 이슈 6건 close. 커밋은 로컬에만 — push 금지.
</objective>

<execution_context>
@/Users/seonghoonyi/Documents/projects/legalnewsletter/.claude/get-shit-done/workflows/execute-plan.md
@/Users/seonghoonyi/Documents/projects/legalnewsletter/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@config/firms.yaml            # barun entry ~lines 411-434 (js-render 블록 + 구 body 주석)
@src/scrapers/util.ts         # extractLinkUrl (lines ~377-423), parseListItemsFromHtml, normalizeDateString
@test/scrapers/util.test.ts   # describe('parseListItemsFromHtml link extraction (Phase 4.1 unified extractor)') at line ~422

## Ground truth (orchestrator 검증 완료 — 재조사 불필요)

1. https://barunlaw.com/barunnews/N 은 이제 서버 렌더링 (curl로 전체 콘텐츠 ~32KB 수신). `.articlebox` / `.article_tit` 는 DOM 어디에도 없음.
2. 새 DOM (2026-08-02 curl 검증):
   ```html
   <section id="barunnew-sec" class="newletter-sec section">
     <div class="container-lg">
       <a href="/letter/56909" class="board-item">
         <div class="item-info">
           <h4 class="item-tit content-desc-xl line-md">
             <input type="hidden" value="...">
             법무법인(유한) 바른 뉴스레터 - 제158호 (2026.07)
           </h4>
           <div class="item-meta">
             <span class="date content-desc-lg">2026-07-15</span>
             <div class="tag-container"><span class="category content-desc-lg">제158호</span></div>
           </div>
         </div>
       </a>
   ```
3. 실패 이슈: #11~#16 (전부 open, `[js-render-fail] firm=barun` 자동 생성).

## 코드 분석 결과 (planner 검증 완료)

- **link 추출 갭 (핵심):** `extractLinkUrl` Mode 1(object)·Mode 2(string) 모두 `$(itemEl).find(selector)` 사용 — cheerio `.find()`는 **자손만** 탐색. 새 barun DOM은 list_item 자체가 `<a href>` 앵커라서 어떤 config 조합으로도 href를 못 읽는다 → Mode 2에 self-match fallback 코드 추가 필요 (Task 1).
- **title의 hidden input:** `.item-tit` h4 안에 `<input type="hidden">`이 있으나 `parseListItemsFromHtml`은 `.text().trim()` 사용 — input은 텍스트 노드가 없으므로 무해. 코드 변경 불필요.
- **날짜 `2026-07-15` (YYYY-MM-DD):** `normalizeDateString`의 dot-regex에는 안 걸리지만 `new Date(raw)` fallback이 파싱 → `parseDate(iso, 'Asia/Seoul')` 정상 동작. 코드 변경 불필요.
- **schema 제약:** `FirmSchema.superRefine`은 `type !== 'js-render'`일 때 `wait_for` 존재를 **거부** — barun 항목에서 `wait_for: ".articlebox"` 줄을 반드시 삭제해야 함.
- **detail_tier / body:** 구 항목의 `detail_tier: 'js-render'` + `body: "#Table_01"`(이미지 전용 구 상세 페이지 주석 포함)는 리뉴얼로 stale. Task 2에서 상세 페이지를 curl로 probe해 결정.
- **Playwright 존치:** js-render firm이 3곳 더 남아 있음 (yoon-yang, latham 등) — 워크플로우/의존성 변경 없음.

<interfaces>
From src/scrapers/util.ts (extractLinkUrl Mode 2 — 수정 대상 지점, 현재 코드):
```typescript
  // Mode 2: link is a non-empty string — plain CSS selector, take href
  if (typeof selectors.link === 'string' && selectors.link !== '') {
    const href = $(itemEl).find(selectors.link).attr('href') ?? '';
    return href || null;
  }
```
계약: raw URL string 또는 null 반환, NEVER throws. 호출자 `parseListItemsFromHtml`이 `canonicalizeUrl(rawUrl, firm.url)`로 canonical화.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: extractLinkUrl Mode 2에 self-match fallback 추가 + 단위 테스트</name>
  <files>src/scrapers/util.ts, test/scrapers/util.test.ts</files>
  <behavior>
    - Test 1 (신규): list_item 요소 자체가 앵커인 DOM(`<a href="/letter/1" class="board-item">...<h4 class="item-tit">제목</h4>...`)에서 `link: "a.board-item"` string selector로 href가 추출되어 canonical url(`https://.../letter/1`)이 나온다.
    - Test 2 (회귀 보증): 기존 descendant-anchor 케이스(자손 `<a>`가 있는 list_item)는 종전과 동일하게 동작 — 기존 util.test.ts 전체 통과가 곧 증명 (find 우선순위 유지).
  </behavior>
  <action>
    src/scrapers/util.ts `extractLinkUrl` Mode 2 분기를 다음으로 교체:
    1. `$(itemEl).find(selectors.link).first()`가 매치되면 종전대로 그 요소의 href 반환 (기존 firm 5곳 동작 불변 — find 우선).
    2. find가 0건이고 `$(itemEl).is(selectors.link)`가 true면 `$(itemEl).attr('href')` 반환 (self-match fallback).
    3. 둘 다 아니면 null.
    주석에 도입 사유 1줄 추가: 2026-08-02 barun 리뉴얼 — list_item이 `<a class="board-item">` 앵커 자기 자신인 DOM 대응, `.find()`는 자손만 탐색하므로 self-match fallback 필요. Mode 1(object)은 현재 필요 firm이 없으므로 건드리지 않는다 (surgical change).
    NEVER-throws 계약 유지 (분기 추가일 뿐 throw 경로 없음).

    test/scrapers/util.test.ts의 `describe('parseListItemsFromHtml link extraction (Phase 4.1 unified extractor)')` 블록(line ~422)에 Test 1을 추가. 기존 테스트들의 firm fixture 패턴을 그대로 따라 작성 (list_item: "#sec .board-item", title: ".item-tit", link: "a.board-item", type: 'html'). h4 안에 `<input type="hidden" value="x">`를 포함시켜 hidden-input이 title `.text()`에 영향 없음도 같은 테스트에서 함께 assert.

    RED → GREEN 순서: 테스트 먼저 추가해 실패 확인 후 util.ts 수정.
    완료 후 로컬 커밋: `feat(quick-260802-jex-01): extractLinkUrl self-match fallback for anchor list items` (push 금지).
  </action>
  <verify>
    <automated>pnpm vitest run test/scrapers/util.test.ts</automated>
  </verify>
  <done>신규 self-match 테스트 포함 util.test.ts 전체 green. 기존 link-extraction 테스트 무수정 통과 (descendant 우선순위 불변).</done>
</task>

<task type="auto">
  <name>Task 2: firms.yaml barun 항목을 html tier로 재작성 + check:firm 검증 + audit 갱신</name>
  <files>config/firms.yaml, .planning/phases/06-firm-audit-probe/06-AUDIT.md</files>
  <action>
    1. **상세 페이지 probe (detail_tier/body 결정용):** `curl -s https://barunlaw.com/letter/56909 | head -c 4000` 실행.
       - 서버 렌더링 텍스트 본문이 보이면 → `detail_tier` 줄 삭제 (default 'static'으로 복귀), `body` selector는 probe에서 본문 wrapper가 명확하면 그것으로 교체, 아니면 `body` 줄 자체를 삭제해 generic extractBody chain(article→main→...)에 위임.
       - 뼈대 HTML만 오면(JS 렌더 상세) → `detail_tier: 'js-render'` 유지, stale한 `body: "#Table_01"` + 구 주석 블록만 삭제.
       어느 쪽이든 구 "#Table_01 이미지 전용" 주석 블록(Phase 7-04)은 제거하고 2026-08-02 리뉴얼 근거 주석 1~3줄로 교체.
    2. **barun 항목 교체** (config/firms.yaml ~line 411, `# ----- KR js-render firm (NEW IN PHASE 4...)` 섹션 주석 포함):
       ```yaml
       # ----- KR HTML plain-href firm — barun (2026-08-02 사이트 리뉴얼로 js-render에서 전환) -----
       # 목록 페이지가 서버 렌더링으로 바뀌어 Playwright 불필요. 구 DOM(.articlebox)은 소멸.
       # list_item이 <a class="board-item" href="/letter/N"> 앵커 자기 자신 —
       # link는 extractLinkUrl Mode 2 self-match fallback으로 href를 읽는다 (quick-260802-jex).
       - id: barun
         name: 법무법인(유한) 바른
         language: ko
         type: html
         url: https://barunlaw.com/barunnews/N
         timezone: Asia/Seoul
         enabled: true
         selectors:
           list_item: "#barunnew-sec .board-item"
           title: ".item-tit"
           link: "a.board-item"
           date: ".item-meta .date"
       ```
       (여기에 1의 probe 결과에 따라 detail_tier/body 줄 추가.)
       **필수:** `wait_for: ".articlebox"` 줄 삭제 — schema superRefine이 html tier에서 wait_for를 거부하므로 남기면 config 로드 자체가 fail. `list_item`은 반드시 `#barunnew-sec`로 스코프 (다른 섹션에 유사 클래스 존재 가능).
    3. **검증:** `pnpm check:firm barun` 실행 — exit 0, 파싱된 item ≥1건, url이 `https://barunlaw.com/letter/<숫자>` 형태, 한국어 title 비어있지 않음, publishedAt이 date `2026-07-15` 형식에서 파싱됨을 stage 출력으로 확인. 0건이면 저장된 curl 응답과 selector를 대조해 수정 (추측 금지 — 실제 DOM 기준).
    4. **audit 갱신 (CLAUDE.md 컨벤션 — firms.yaml 편집 직후 필수):** `pnpm audit:firms` 실행 → `.planning/phases/06-firm-audit-probe/06-AUDIT.md` 재생성. 타 firm의 무관한 drift 행이 갱신되어도 그대로 커밋 (drift 가시화가 목적, 타 firm 수정은 스코프 밖).
    5. **로컬 커밋 (같은 커밋에 두 파일 함께 — 컨벤션):** `fix(quick-260802-jex-02): barun js-render → html tier, 리뉴얼 DOM selector + audit refresh`. push 금지.
  </action>
  <verify>
    <automated>pnpm check:firm barun</automated>
  </verify>
  <done>check:firm barun exit 0 + item ≥1건(/letter/N url, 한국어 title, publishedAt 파싱). firms.yaml zod 로드 통과 (wait_for 제거 확인). firms.yaml + 06-AUDIT.md가 단일 로컬 커밋으로 존재.</done>
</task>

<task type="auto">
  <name>Task 3: GitHub 이슈 #11~#16 close (한국어 코멘트)</name>
  <files>(파일 변경 없음 — gh CLI만)</files>
  <action>
    전제: Task 2의 `pnpm check:firm barun` 통과 이후에만 실행.
    Task 2 커밋 해시를 `git rev-parse --short HEAD`로 얻은 뒤:
    ```bash
    for n in 11 12 13 14 15 16; do
      gh issue close "$n" --comment "barunlaw.com 리뉴얼로 목록 페이지가 서버 렌더링으로 전환되어 js-render tier가 불필요해졌습니다. barun을 html tier로 전환하고 selector를 새 DOM(#barunnew-sec .board-item)에 맞게 수정했습니다. pnpm check:firm barun 검증 통과 — 커밋 <hash> (로컬) 참조."
    done
    ```
    `<hash>`는 실제 해시로 치환. git push는 하지 않는다 — 커밋은 로컬에 두고 사용자가 직접 push.
  </action>
  <verify>
    <automated>gh issue list --state open --json number --jq '.[].number' | grep -cE '^(11|12|13|14|15|16)$' | grep -q '^0$' && echo ALL_CLOSED</automated>
  </verify>
  <done>이슈 #11~#16 전부 closed 상태, 각각 한국어 close 코멘트 보유. 원격 push 없음 (`git status`상 ahead 커밋만 존재).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| scraper → barunlaw.com | 외부 사이트 HTML이 untrusted input으로 cheerio 파서에 진입 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-q260802-01 | Tampering | parseListItemsFromHtml (barun HTML) | mitigate | 기존 per-item try/catch + canonicalizeUrl 경유 유지; self-match fallback은 attr('href') 문자열 읽기만 수행, eval/실행 경로 없음 |
| T-q260802-02 | DoS | scrapeHtml fetch (barun) | accept | timeout_ms 기본 20s + 일 1회 1요청 정책으로 노출 미미; 기존 tier와 동일 프로파일 |
</threat_model>

<verification>
1. `pnpm vitest run test/scrapers/util.test.ts` — self-match 신규 테스트 포함 green, 기존 테스트 무수정 통과.
2. `pnpm test` — 전체 스위트 회귀 없음 (특히 jsRender.test.ts, html.test.ts).
3. `pnpm check:firm barun` — exit 0, /letter/N item ≥1건.
4. `gh issue list --state open` — 11~16 부재.
5. `git log origin/main..HEAD` — 로컬 커밋 2건(코드+테스트 / config+audit), push 안 됨.
</verification>

<success_criteria>
- barun이 Playwright 없이 static fetch로 수집됨 (js-render 잔재: wait_for·.articlebox selector 완전 제거).
- extractLinkUrl self-match fallback이 테스트로 고정되고 기존 5개 string-link firm 동작 불변.
- CLAUDE.md audit-freshness 컨벤션 이행 (06-AUDIT.md 동일 커밋 갱신).
- 이슈 #11~#16 close 완료, 모든 커밋은 로컬 유지.
</success_criteria>

<output>
완료 후 `.planning/quick/260802-jex-barun-js-render-html-tier-selector/260802-jex-SUMMARY.md` 작성 (templates/summary.md 준수) + STATE.md Quick Tasks Completed 테이블에 260802-jex 행 추가.
</output>
