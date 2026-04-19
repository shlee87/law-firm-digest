---
id: cooley-cf-bypass
created: 2026-04-19
severity: medium
status: open
trigger: v1.1 milestone OR cooley rss 복구 시점
origin: Phase 2 UAT (2026-04-19) production probe
---

# Cooley (cooleygo.com) — Cloudflare challenge workaround

## 문제

Cooley (Phase 1 seed firm)의 RSS 피드 `https://cooleygo.com/feed/`가 **Cloudflare bot challenge로 차단**되어 프로덕션에서 매일 HTTP 403 반환.

- 응답 헤더: `cf-mitigated: challenge` + `critical-ch` client-hints 요구
- User-Agent/Accept/Sec-Fetch-* 헤더 조합 시도해도 여전히 403
- Playwright `page.request.get('/feed/')`도 403 ("Just a moment..." CF interstitial)
- **XML endpoint만 block**, landing page와 article 페이지는 Playwright로 통과 가능
- Phase 1 probe 시점(2026-04-17)에는 통과했으나 이틀 사이 CF 정책이 바뀐 것으로 추정

현재 영향:
- 매일 digest footer에 cooley `http-403` 항목이 뜸
- Workflow 전체는 정상 (FETCH-02 failure isolation이 동작)
- 지금은 `enabled: false`로 토글해 footer 노이즈 제거 (2026-04-19 dev branch)

## 조사 결과

| Endpoint | Playwright status | 비고 |
|----------|-------------------|------|
| `https://cooleygo.com/feed/` | 403 | XML content-type이라 JS challenge 불가 |
| `https://cooleygo.com/` (landing) | 200 | WordPress landing, article list 없음 (Topics/Collections 구조) |
| `https://www.cooleygo.com/post-sitemap.xml` | 200 | **233 posts + lastmod 제공** |
| `https://www.cooleygo.com/sitemap_index.xml` | 200 | Yoast SEO sitemap index (post-sitemap 외 page/glossary/documents/etc.) |
| 개별 article (e.g. `/share-incentives-employees-private-uk-companies/`) | 200 | `.post-content` 6411 chars 본문 scrape 성공 |

## 권장 해결 경로 (v1.1)

Cooley를 **sitemap + Playwright article scrape** tier로 이전. 즉 새 scraper tier 추가:

### 접근 1: 새 `sitemap` tier 도입
- `src/scrapers/sitemap.ts` 신규 — sitemap XML URL을 받아 `<url><loc><lastmod>` 파싱 후 top N개 URL 반환
- `config/firms.yaml` schema 확장: `type: sitemap` + `url` (sitemap URL) + optional `latest_n` (default 10)
- `enrichBody`에서 각 URL을 Playwright로 goto → `.post-content` scrape
- 장점: 일반화된 CF-protected WordPress 사이트 지원 가능 (유사 사이트 재사용)
- 단점: 새 tier 설계 + tests + probe + 통합 (~1-2시간 + 리뷰)

### 접근 2: 기존 `js-render` tier에 sitemap URL 모드 추가
- `firm.type: js-render` + `url: .../sitemap.xml` 감지 시 XML 파싱 분기
- 장점: tier 개수 그대로 유지
- 단점: 단일 tier에 2가지 fetch 로직 — 복잡도 증가

**권장: 접근 1** — 공통 scraper로 재사용 가능.

## 단계별 작업 (v1.1 plan 제안)

1. `scrapers/sitemap.ts` — XML 파서 (cheerio `xmlMode: true` 또는 단순 regex)
2. `config/schema.ts` — `SitemapFirmSchema` 추가 + discriminatedUnion 확장
3. `pipeline/fetch.ts` — `case 'sitemap':` dispatch
4. `pipeline/enrichBody.ts` — sitemap tier일 때 Playwright article scrape 경로
5. `scrapers/sitemap.test.ts` + live probe fixture
6. `firms.yaml` — cooley를 `type: sitemap`으로 변경, enabled: true 복구
7. 동작 검증: `pnpm check:firm cooley` → 실제 items + body 확인

## Acceptance

- `pnpm check:firm cooley`가 `fetch: cooley: N items` 출력 (N > 0)
- 다음 GHA cron에서 cooley footer 실패 사라지고 digest 본문에 cooley 요약 등장
- 다른 firm 기존 동작 regression 없음 (180+ tests 유지)

## 관련 파일

- `src/scrapers/rss.ts` — 기존 RSS tier (sitemap tier와 유사, 참조)
- `src/scrapers/jsRender.ts` — Playwright tier (article scrape 로직 참조)
- `src/scrapers/util.ts` — decodeCharsetAwareFetch, extractBody (재사용 가능)
- `config/firms.yaml` — cooley 블록 (현재 enabled: false)
- `scripts/cooley-*.ts` — 이번 probe에서 만든 진단 스크립트 (삭제 예정)
