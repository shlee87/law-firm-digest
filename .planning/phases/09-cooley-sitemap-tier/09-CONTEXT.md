# Phase 9: Cooley Sitemap Tier - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Cooley를 active monitored firm으로 복구합니다. 방식은 새로운 `type: sitemap` scraper tier를 도입해서 WordPress sitemap XML (`https://www.cooleygo.com/post-sitemap.xml`)로부터 최근 article URL을 추출하고, 기존 Playwright (js-render) detail path를 재사용해서 `.post-content`에서 body text를 긁어옵니다. Cloudflare로 차단된 `/feed/` RSS endpoint는 완전히 제거됩니다.

**In scope:**
- `src/scrapers/sitemap.ts` 신규 (XML 파서, top-N by lastmod)
- `config/schema.ts` FirmSchema `type` enum 확장 + sitemap-specific 필드 검증
- `src/pipeline/fetch.ts`에 `case 'sitemap':` dispatch 추가
- `src/pipeline/enrichBody.ts`가 sitemap tier 항목도 js-render detail path로 라우팅
- `config/firms.yaml` Cooley 블록 마이그레이션 (`type: sitemap`, `enabled: true` 복구, 기존 RSS URL 제거)
- 단위 테스트 (파서, schema, dispatch) + regression 검증 (기존 rss/html/js-render firm 변함 없음)

**Out of scope:**
- Cooley 이외 firm의 sitemap tier 마이그레이션 (새 firm 추가는 별도 phase)
- sitemap_index.xml 중첩 지원 (현재 Cooley는 `post-sitemap.xml` 직접 타깃)
- body selector의 firm별 config화 (Cooley 전용 `.post-content` 하드코딩 — 미래 firm 추가 시 별도 phase에서 확장)
- Data-quality observability (Phase 10) / cron resumption (Phase 11)

</domain>

<decisions>
## Implementation Decisions

### Scraper Tier Approach
- **D-01:** 접근법 1 채택 — `src/scrapers/sitemap.ts` 신규 모듈로 분리된 tier. `type: sitemap`은 discriminated union의 독립 variant. (접근법 2 "기존 js-render에 sitemap 모드 추가"는 단일 tier 내 2가지 fetch 로직으로 복잡도 증가 — 거부됨. backlog `cooley-cf-bypass.md` 권장과 일치.)
- **D-02:** sitemap tier는 **list 획득 전용**. Article body는 `enrichBody.ts`의 js-render path를 그대로 재사용 — sitemap tier만의 전용 detail scraping 로직 금지.

### Config Schema
- **D-03:** `config/schema.ts`의 `type` enum을 `['rss', 'html', 'js-render', 'sitemap']`으로 확장. discriminatedUnion 사용 시 `SitemapFirmSchema` variant 추가.
- **D-04:** sitemap firm 필수 필드: `url` (sitemap XML URL — 예: `https://www.cooleygo.com/post-sitemap.xml`). 선택 필드: `latest_n` (default 10 — firm당 top-N 최근 article).
- **D-05:** sitemap firm은 `detail_tier` 필드를 가지지 않음 — **sitemap tier는 항상 js-render detail path를 강제함** (schema 레벨에서 implicit, 별도 필드로 노출 안 함).

### Cooley Migration
- **D-06:** `config/firms.yaml` Cooley 블록 치환:
  - `type: rss` → `type: sitemap`
  - `url: https://cooleygo.com/feed/` → `url: https://www.cooleygo.com/post-sitemap.xml`
  - `enabled: false` → `enabled: true`
  - `latest_n: 10` 신규 추가 (명시적 — 기본값과 동일하지만 self-documenting)
  - Timezone `America/Los_Angeles` 유지
  - state key slug `cooley` 유지 (Phase 2 주석 요구사항)
- **D-07:** CF bypass 주석과 `cooley-cf-bypass.md` backlog 파일은 Phase 9 완료 시 **삭제**하지 않고 `.planning/backlog/resolved/` 로 이동 (history 보존).

### XML Parsing & Selection
- **D-08:** XML 파싱은 **cheerio with `xmlMode: true`** 사용 — 이미 프로젝트 의존성이고 `html.ts`에 사용 패턴 존재. 새로운 라이브러리 (fast-xml-parser 등) 추가 금지.
- **D-09:** 최근 N개 선별: `<url>` 노드의 `<lastmod>`를 파싱 → ISO date 기준 desc sort → `slice(0, latest_n)`. 추가 시간 윈도우 필터 (예: "최근 30일 only") **없음** — latest_n만으로 충분.
- **D-10:** lastmod 누락된 `<url>` entry는 **drop** (sort ordering을 망가뜨리지 않도록). 경고 로그 남김.

### Body Extraction
- **D-11:** Body selector는 **`.post-content` 하드코딩** (sitemap tier 내부 상수). Cooley 외 firm이 sitemap tier로 들어오면 별도 phase에서 firm config의 `body_selector` 필드 도입 — Phase 9 범위 아님.
- **D-12:** 기존 `src/scrapers/util.ts#extractBody`의 selector-chain fallback 재사용 가능 여부 검토 필요 — 만약 `.post-content`가 이미 체인에 있다면 하드코딩 대신 해당 체인 활용. (Research 단계 확인 항목)

### Politeness & Resilience
- **D-13:** 기존 politeness pattern 재사용 — 변경 없음:
  - `fetch.ts`의 outer pLimit(3) cross-firm concurrency cap
  - `enrichBody.ts`의 per-firm pLimit(1) + 500ms 간격 (detail fetch serialization)
- **D-14:** sitemap tier도 robots.txt gate 통과 — `fetchRobots` + `isAllowed`를 tier dispatch 전에 호출 (기존 `fetch.ts` 패턴 그대로).
- **D-15:** sitemap XML fetch 자체가 실패 (404/403/timeout)하면 → 기존 per-firm try/catch가 `FirmResult.error`로 캡처. Cooley는 email footer에 `error` 항목으로 뜨고, 다른 firm은 영향 없음 (FETCH-02 failure isolation 유지). **별도 재시도 전략 없음** — 기존 p-retry 패턴이 이미 transient failure를 커버.

### User-Agent & Headers
- **D-16:** sitemap XML fetch는 기존 `decodeCharsetAwareFetch` 재사용 — User-Agent, If-Modified-Since 등 프로젝트 표준 헤더 자동 적용. 새로운 header 커스터마이징 없음.

### Testing & Validation
- **D-17:** `src/scrapers/sitemap.test.ts` 신규 — fixture 기반 단위 테스트 (실제 Cooley XML 응답을 `test/fixtures/`에 저장해서 offline 실행). 커버: lastmod sort, latest_n slicing, lastmod 누락 처리, 빈 sitemap, malformed XML.
- **D-18:** schema.ts / fetch.ts 변경에 대한 regression 테스트 — 기존 rss/html/js-render firm fixture 로드 시 schema validation 통과, fetch dispatch 정상 동작 확인.
- **D-19:** `pnpm check:firm cooley` manual smoke test — SITEMAP-05 acceptance criteria. 실제 네트워크 fetch로 N>0 items + non-empty body 확인.

### Claude's Discretion
- 실제 sitemap.ts 함수 시그니처 (export 구조)
- Fixture 데이터 size (몇 개 `<url>` entry를 포함할지)
- `latest_n` 기본값 상수 정의 위치 (schema.ts vs sitemap.ts)
- SitemapFirmSchema의 zod superRefine 상세 (예: URL 형식 검증 깊이)
- Backlog file 이동 vs 삭제 경로 세부 (resolved/ 디렉토리 레이아웃)

### Folded Todos
None — 매칭된 todo 없음.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Cooley CF Bypass Analysis
- `.planning/backlog/cooley-cf-bypass.md` — CF 403 원인 분석, endpoint별 probe 결과 (sitemap.xml HTTP 200 + 233 posts + lastmod 확인), 단계별 작업 초안. **Phase 9 구현의 1차 reference.**

### Requirements
- `.planning/REQUIREMENTS.md` — SITEMAP-01 ~ SITEMAP-05 (SITEMAP section). Phase 9가 닫아야 할 acceptance criteria.

### Phase 7 Detail Tier (prior phase)
- `.planning/phases/07-spa-aware-detail-tier/07-CONTEXT.md` — `detail_tier: 'js-render' | 'static'` 도입 배경. Phase 9는 sitemap tier를 **js-render detail 전용**으로 강제함 (D-05).
- `.planning/phases/07-spa-aware-detail-tier/07-SUMMARY.md` (여러 plan SUMMARYs) — enrichBody의 js-render-gated 분기 패턴.

### Phase 1/2 Scraper Tier Foundations
- `src/scrapers/rss.ts` — RSS tier 모듈 레이아웃 (sitemap.ts template).
- `src/scrapers/jsRender.ts` — Playwright article scrape 로직 (enrichBody가 sitemap tier item에 재사용).
- `src/scrapers/util.ts` — `decodeCharsetAwareFetch`, `extractBody` selector chain.
- `src/scrapers/robots.ts` — `fetchRobots`, `isAllowed` (sitemap tier도 동일 gate 통과).
- `src/pipeline/fetch.ts` — tier dispatch switch (case 'sitemap' 추가 지점).
- `src/pipeline/enrichBody.ts` — detail fetch orchestrator, js-render-gated 분기.
- `src/config/schema.ts` — FirmSchema, type enum, discriminatedUnion 패턴.

### Project-Level
- `.planning/PROJECT.md` — $0 예산 / politeness 제약 / Gmail SMTP delivery 등 불변 제약.
- `CLAUDE.md` — TypeScript 5.7, cheerio 1.2.0 (XML mode 지원 확인), Playwright 1.58 stack constraints.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/scrapers/rss.ts`**: sitemap.ts의 모듈 구조 template (export default scraper function, error handling pattern).
- **`src/scrapers/jsRender.ts`**: Playwright browser context 관리, `.post-content` 등 selector 기반 body extraction. enrichBody가 sitemap item에 이 path를 그대로 적용.
- **`src/scrapers/util.ts`**:
  - `decodeCharsetAwareFetch(url)` — sitemap XML 다운로드용 (User-Agent, charset 처리 자동).
  - `extractBody($, selectors)` — cheerio-based body extraction (Phase 9에서 sitemap tier는 enrichBody를 통해 간접적으로만 사용).
  - `canonicalizeUrl` — 주의: `www.` prefix strip 이슈가 있음 (bkl/kim-chang에서 발견된 문제). `www.cooleygo.com` sitemap URL은 이 함수를 거치면 `cooleygo.com`으로 변형될 수 있음 — sitemap URL 자체는 canonicalize 하지 **않도록** 주의 (item URL만 canonicalize).
- **`src/scrapers/robots.ts`**: `fetchRobots(origin)` + `isAllowed(url, robotsData)` — sitemap tier도 동일 gate 통과.
- **`src/pipeline/fetch.ts`**: `switch(firm.type)` block (line ~70-ish). `case 'sitemap':` 추가. Per-firm try/catch, pLimit(3), Promise.allSettled, FirmResult shape invariant 모두 기존 패턴 그대로 재사용.
- **`src/pipeline/enrichBody.ts`**: `detail_tier === 'js-render'` branch가 Playwright-only detail fetch 수행. sitemap tier firm은 이 branch로 강제 라우팅 (D-05 implicit: sitemap tier → js-render detail).
- **`src/config/schema.ts`**: FirmSchema line 52-60 — `type: z.enum(['rss', 'html', 'js-render'])` 확장. `wait_for` 등 tier-specific 필드는 superRefine으로 검증되는 패턴이 이미 있음 (Phase 4).

### Established Patterns
- **Tier-specific schema fields**: Phase 4에서 js-render 전용 `wait_for` 필드가 `superRefine`으로 검증된 전례 — sitemap `url` + `latest_n`도 동일 패턴 적용.
- **Per-firm failure isolation**: FETCH-02 (Promise.allSettled + try/catch). sitemap tier도 이 보호막 안에서 실행.
- **Politeness**: pLimit(3) cross-firm + pLimit(1)/500ms per-firm detail (Phase 2 D-P2-10).
- **State key stability**: firm.id slug가 state dedup key. Cooley는 `cooley` 유지 (type이 바뀌어도 key는 동일 — Phase 2 firms.yaml 주석 요구사항).
- **Fixture-based scraper tests**: `src/scrapers/*.test.ts` 기존 패턴 — 실제 응답을 fixture로 저장하고 offline 검증.

### Integration Points
- **`src/pipeline/fetch.ts` line ~70** — `switch(firm.type)` 내부에 `case 'sitemap': return await scrapeSitemap(firm, recorder);` 추가.
- **`src/config/schema.ts` line 60** — `type` enum 확장 + discriminatedUnion variant 추가.
- **`src/pipeline/enrichBody.ts` detail_tier-gated branch** — sitemap tier firm이 js-render path로 라우팅되도록 조건식 확인 (명시적으로 `firm.type === 'sitemap' || firm.detail_tier === 'js-render'`).
- **`config/firms.yaml` Cooley block (line 54-60)** — type/url/enabled 치환 + `latest_n: 10` 추가.

</code_context>

<specifics>
## Specific Ideas

- backlog doc (`cooley-cf-bypass.md`)의 probe 데이터를 고정 fixture로 저장 — 실제 2026-04-19 probe 결과 (`post-sitemap.xml` 200 OK, 233 posts + lastmod)를 그대로 `test/fixtures/cooley-post-sitemap.xml`로 보존. 이후 CF 정책 변동에도 테스트는 안정.
- `pnpm check:firm cooley --debug` output을 manual SITEMAP-05 검증의 기준 산출물로 사용.
- v1.1 milestone의 다른 phase (10: observability, 11: resume gate)에서 "Cooley가 digest에 실제 등장" 시나리오가 필요 — Phase 9 완료가 downstream phase의 end-to-end 검증 가능성을 여는 key.

</specifics>

<deferred>
## Deferred Ideas

- **Body selector 설정화**: Cooley 외 firm이 sitemap tier로 들어올 때 firm config의 `body_selector` 필드 도입. 지금은 `.post-content` 하드코딩. (별도 phase — 두번째 sitemap firm이 생기면 동시에 진행)
- **sitemap_index.xml 중첩 지원**: Yoast SEO 등이 제공하는 sitemap index (여러 sub-sitemap을 linking)에서 post-sitemap을 자동 선택하는 로직. Cooley는 `post-sitemap.xml` 직접 URL로 우회 — 다른 firm이 sitemap index만 공개할 때 필요. (backlog 항목)
- **시간 윈도우 필터**: "최근 N일" 기준 추가 필터링. 지금은 `latest_n` top-N으로 충분 (Cooley는 주당 ~2-3 posts). trigger: firm이 매우 active해서 top-10이 하루 이내 posts만으로 채워지는 경우.
- **CF bypass generalization**: Playwright로 `/feed/` endpoint도 통과할 수 있는지 재조사 (backlog `cooley-cf-bypass.md` appendix). 지금은 sitemap 우회로 충분 — CF 정책이 다시 바뀌면 재방문.

### Reviewed Todos (not folded)
None — 매칭된 todo 없음 (TODO_MATCHES 0 건).

</deferred>

---

*Phase: 09-cooley-sitemap-tier*
*Context gathered: 2026-04-20*
