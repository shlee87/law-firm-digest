# LegalNewsletter

## What This Is

주요 국내·해외 로펌의 공개 뉴스레터/Legal Update 페이지를 매일 자동으로 수집하고, 신규 발행분이 있는 날에만 한 통의 통합 다이제스트 이메일로 받아보는 개인용 자동화 시스템. 여러 로펌 사이트를 수동으로 순회하던 작업을 대체한다.

## Shipped Milestones

- **v1.0 MVP** — Phases 1–5 (informally shipped before formal archive workflow existed)
- **v1.1 Data-Quality Hardening** — Phases 6–13 (shipped 2026-05-23, archived to `milestones/v1.1-*`). End-to-end verified via manual `workflow_dispatch` (daily + weekly) on 2026-05-23 with real digest delivered to recipient inbox.

## Current Milestone: v1.2 Coverage & Closure

**Goal:** v1.1 close 과정에서 드러난 운영 footgun + 문서 메타데이터 누락 + 큐레이션 사각지대(월–화 48시간 fetch gap)를 한 번에 정리해 production 안정성과 artifact 정합성을 v1.1 shipping 수준에 맞춘다.

**Target features:**
- 월–화 48시간 fetch 갭 해소 (월요일에도 daily 1회 추가, weekly와 시간 분리)
- `scripts/sync-schedule.ts` 재작성 — Phase 13 daily/weekly split 인지 (현재 footgun)
- Phase 10 + 11 VERIFICATION.md 백필 (code shipped, goal-backward audit 미실행)
- Phase 11-03-SUMMARY.md 백필 (cron uncomment 공식 closure 없음)
- `pnpm audit:firms` 정기 재생성 정책 + 06-AUDIT.md 갱신 (freshfields 잔존 row 제거)
- REQUIREMENTS metadata 정렬 — 아카이브된 v1.1 traceability의 DQOBS-* + RESUME-* + CONF-06 status를 SUMMARY와 sync

**Acceptance:** (1) Production 1주 관찰 후 월요일에도 신규 글이 잡힘 확인, (2) `pnpm sync-schedule` 실행해도 cron split 유지, (3) 모든 v1.1 phase에 VERIFICATION.md + SUMMARY.md 존재, (4) v1.1 archived REQUIREMENTS.md traceability와 실제 SUMMARY 100% sync.

## Core Value

사용자가 직접 로펌 웹사이트를 돌지 않아도, 추적 대상 로펌들의 신규 뉴스레터를 원문 링크와 함께 한국어 요약으로 받아볼 수 있어야 한다.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ 추적 대상 로펌의 뉴스레터/Legal Update 페이지를 주기적으로 확인한다 (현재 enabled: 11 firms — cooley, latham, clifford-chance, yulchon, logos, skadden, kim-chang, bkl, lee-ko, yoon-yang, barun; freshfields 제거됨 2026-05-18; shin-kim TLS-fix로 복구됨 Phase 11) — v1.0 + v1.1
- ✓ 신규 발행분 식별 (canonical URL 기반 dedup + 500-cap seen state) — v1.0
- ✓ 각 신규 항목에 대해 한국어 AI 요약 (Gemini 2.5 Flash + Flash-Lite 폴백 + 3-layer hallucination guard) — v1.0 + v1.1
- ✓ 신규 항목이 있는 주에만 통합 다이제스트 발송 (Phase 13 분리 이후: daily는 누적, weekly는 pending 비어있으면 heartbeat) — v1.0 + v1.1
- ✓ 각 아이템: 원어 제목 + 한국어 요약 + 원문 링크 — v1.0
- ✓ 수신 이메일 주소는 `RECIPIENT_EMAIL` GH Actions secret으로 변경 가능 (코드 수정 불필요) — v1.0
- ✓ 비개발자가 config/firms.yaml 편집만으로 firm 추가/제거 (zod 스키마 + 한국어 주석 헤더) — v1.0
- ✓ 클라우드 자동 실행 — GitHub Actions cron (daily.yml Tue–Sun 21:00 KST + weekly.yml Mon 21:00 KST) — v1.0 + v1.1
- ✓ $0 운영 비용 유지 (Gemini 무료 티어 + GHA 무료 분 + Gmail SMTP App Password) — v1.0 (유지 중)

### Active

<!-- Current scope. Building toward these. -->

TBD — define via `/gsd:new-milestone`. Likely v1.2 candidates (from v1.1 carry-over):
- [ ] `scripts/sync-schedule.ts` 재작성 — Phase 13 daily/weekly split 인지하도록
- [ ] Phase 10/11/11-03 backfill (VERIFICATION.md + SUMMARY.md + REQUIREMENTS checkboxes)
- [ ] `pnpm audit:firms` 정기 재생성 정책 (`06-AUDIT.md` 신선도 유지)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- 여러 수신인 동시 발송 — 개인용 자동화이며, 단일 수신자로 충분. 필요 시 v2에서 재고
- 웹 대시보드 / UI — "비개발자가 추가하기 쉬움"은 config 파일의 접근성으로 해결. 웹 UI 운영은 $0 제약과 상충
- 제목까지 한국어 번역 — 사용자 결정: 영문 제목은 원문 유지가 법률 용어 왜곡 방지에 유리
- 뉴스레터 전문 재배포/저장 — 요약과 원문 링크만 전달. 저작권 이슈 최소화
- 실시간 푸시 알림 — 하루 1회 디지털 다이제스트로 충분. 노이즈 억제가 설계 목표
- Claude Pro / ChatGPT Plus 구독을 자동화 파이프라인의 AI 소스로 사용 — 해당 구독은 API 접근을 포함하지 않음. 요약은 Gemini API 무료 티어로 처리
- 유료 호스팅/인프라 — GitHub Actions 무료 티어 혹은 동등 무료 리소스로만 운영

## Context

- 사용자가 법률 업계 동향을 개인적으로 추적하려는 목적. B2B 제품이 아님
- 대상 로펌은 대부분 공개 뉴스레터 페이지를 보유. 일부는 RSS를 제공할 수 있고, 일부는 HTML 스크래핑이 필요할 수 있음 (research 단계에서 확인)
- 수신처 메일은 Gmail 계열로 추정 (현재 사용자 계정: `your.email@example.com`) — 다만 **변경 가능성**을 설계 가정에 반영
- Gemini API 무료 티어는 2025-12 Google 축소 이후 `gemini-2.5-flash` 기준 **약 250 RPD** (리셋: 미국 태평양시 자정). 12개 로펌 × 평균 5건/일 = 약 60건/일로 충분하지만, 폭주일 대비 `gemini-2.5-flash-lite`(약 1,000 RPD) 폴백 경로 필요
- 저장소는 현재 GSD 툴링과 `gsd-patches` 서브모듈 외에는 실제 코드가 없는 상태 (greenfield)

## Constraints

- **Budget**: $0/월 — 기존 $20 Claude Pro + $20 ChatGPT Plus 외 추가 지출 불가. 유료 API·호스팅·DB 금지
- **AI source**: Gemini API 무료 티어 — `gemini-2.5-flash` 약 250 RPD + `gemini-2.5-flash-lite` 약 1,000 RPD 폴백. 유일한 자동화 가능 LLM 채널
- **Execution**: 클라우드 크론 기반 (GitHub Actions 유력) — 사용자 머신 켜짐 상태에 의존 금지
- **Email delivery**: 무료 경로만 사용 — Gmail SMTP(App Password) 또는 동등한 무료 티어
- **Scraping politeness**: 각 로펌 사이트 robots.txt 준수, 하루 1회 1요청/사이트 원칙. 부하/차단 리스크 최소화
- **Config UX**: 로펌 추가는 비개발자 수준에서 가능해야 함 — 코드 수정 없이 단일 파일 편집만으로
- **Secrets**: 이메일 비밀번호·API key 등은 저장소에 평문 포함 금지 (GitHub Actions secrets 또는 동등)

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 신규가 있을 때만 발송 | 매일 "오늘은 없음" 메일이 오면 노이즈. 신호 대 잡음비를 중시한 사용자 결정 | ✓ Good (Phase 13에서 weekly heartbeat 예외만 추가 — pending 비어있을 때 "still alive" 신호) |
| 통합 다이제스트 1통/일 | 로펌별 개별 메일은 하루 5~10통 가능 — 받은함 오염 방지 | ✓ Good (Phase 13 이후 1통/주로 변경 — 같은 원칙, 다른 cadence) |
| 원어 제목 + 한국어 요약 | 법률 용어 원문을 보존하면서 빠른 스캔 가능. 번역 왜곡 리스크 회피 | ✓ Good (SUMM-06으로 enforce — 제목은 Gemini에 안 보냄) |
| Gemini API 무료 티어로 요약 | Claude/ChatGPT 구독으로는 자동화 파이프라인 불가능 | ✓ Good (gemini-2.5-flash + flash-lite 폴백; Phase 13 daily/weekly split으로 RPD 분산) |
| GitHub Actions로 크론 실행 | 사용자 머신 상태 무관 + 무료 | ✓ Good (daily + weekly 두 워크플로우 + `concurrency: digest-pipeline` 락) |
| 로펌 config를 YAML(또는 동등) 선언형 | 비개발자가 편집 가능해야 한다는 요건 | ✓ Good (eemeli/yaml + zod schema + 한국어 주석 헤더) |
| Cooley CF bypass via sitemap tier | Cloudflare가 RSS feed 차단 — Playwright `context.request.get`으로 XML 가져오기 | ✓ Good (v1.1 Phase 9) |
| `detail_tier` per-firm 도입 | SPA detail pages는 list-type과 무관하게 JS rendering 필요 | ✓ Good (v1.1 Phase 7) |
| 3-layer hallucination guard | 단일 layer는 false negative 발생 — body shape + prompt rule + cluster detector | ✓ Good (v1.1 Phase 8) |
| Pipeline daily/weekly split | 12-step canonical sequence가 1회 cron으로 묶여 있어 RPD bursty — 분리하면 daily ≤15 호출, weekly === 0 호출 | ✓ Good (v1.1 Phase 13; 2026-05-23 end-to-end verified) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-23 — Phase 13 (Gemini RPD daily/weekly split) PASSED. All 7 SPEC requirements validated (SPEC-1..SPEC-7, 7/7). Pipeline split into `runDaily()` (Tue-Sun cron, fetch+enrich+filter+dedup+summarize → `state/pending.json` 누적) and `runWeekly()` (Mon cron, pending 읽기 → compose+send+archive → truncate). `src/pipeline/run.ts` deleted (-438 lines), replaced by `src/pipeline/runDaily.ts` (292 lines) + `src/pipeline/runWeekly.ts` (262 lines) + `src/pipeline/runTypes.ts` (44 lines, shared RunOptions/RunReport). Cross-mode invariant enforced by compiler: daily NEVER imports compose/email/archive/detectors, weekly NEVER imports fetch/enrich/filter/dedup/summarize/playwright. New `src/state/pending.ts` (PendingItem schema with COMP-05 projection — strips `description`/`isClusterMember`/`isNew`; readPending/appendPending/truncatePending + DRY_RUN gate). Module-level `geminiCallCount` in `src/summarize/gemini.ts` (sanctioned non-atomic counter; increments before `ai.models.generateContent` so 429/timeout still count). `writeStepSummary` prepends byte-for-byte `[METRIC] geminiCallCount=N` as first markdown line. Empty-week heartbeat composer (`src/compose/heartbeat.ts`) overrides DEDUP-03 to send a "still alive, no new items" mail when pending is empty. main.ts `parseMode(argv)` adds `--mode=daily|weekly` dispatch with fail-fast exit 2 on missing/invalid. checkFirm CLI swapped to runDaily (D-03). GitHub Actions split into two workflows sharing `concurrency: digest-pipeline` lock — `.github/workflows/daily.yml` (cron `0 12 * * 0,2-6` — Tue-Sun KST 21:00; atomic commit `state/pending.json state/seen.json`) and new `.github/workflows/weekly.yml` (Mon cron; atomic commit pending+seen+archive; deliberately omits GEMINI_API_KEY per least-privilege D-22). Real GHA verification: daily run 26309754807 → `[METRIC] geminiCallCount=21` byte-for-byte, 13 items across 7 firms summarized end-to-end with COMP-05-compliant pending.json; weekly run 26309956124 → `[METRIC] geminiCallCount=0`, digest composed + sent (nodemailer 8.0.5 SMTP), archive HTML committed, pending.json items: [] post-truncate. 476/476 tests across 35 files passing; typecheck clean. Code review: 0 critical, 3 warnings (WR-01 skipEmail-still-truncates, WR-02 detail-tier jsRenderFailures miss, WR-03 archive-failure-after-send), 6 info — all documented operational footguns, none blocking. Rule 1 deviation: planned cron literal `0 12 * * 2-7,0` rejected by GH Actions parser (day 7 + day 0 both encode Sunday) → hotfix `0,2-6` covers same Tue-Sun set; lesson recorded for future workflow plans. Outstanding non-blocking: AC-7 long-window observation (daily avg ≤ 15 over 7 days), Gmail-inbox arrival at nks4860@gmail.com operator one-time confirmation. Previously: Phase 9 (Cooley Sitemap Tier) PASSED. All 5 SITEMAP requirements validated (SITEMAP-01/02/03/04/05, 9/9 SC verified). New `type: sitemap` FirmConfig variant + optional `latest_n` cap landed in `src/types.ts` + `src/config/schema.ts` with 3-branch `superRefine` rejecting illegal combinations (sitemap+wait_for, sitemap+selectors, sitemap+detail_tier='js-render', non-sitemap+latest_n). New `src/scrapers/sitemap.ts` uses Playwright `context.request.get` for Cloudflare-bypassed XML fetch + cheerio xml-mode parsing; extracts `<url><loc><lastmod>` entries, sorts by lastmod desc, caps at `latest_n` (default 10). Pipeline wiring: `fetch.ts` dispatches `type==='sitemap'` through `scrapeSitemap`; `enrichBody.ts` OR-gate (`needsPlaywrightDetail`) routes sitemap firms through Playwright detail branch (reusing Phase 7 scraper); `run.ts` `hasJsRender` predicate extended to launch chromium for sitemap firms; `firmAudit.ts` `probeSitemapFirm` replaces Phase 9-01 interim stub with real XML probe + detail fetch smoke. Cooley migrated in `config/firms.yaml` to `type: sitemap` with `enabled: true` and `/post-sitemap.xml` URL (replaces CF-blocked `/feed/`). Live smoke `pnpm check:firm cooley` → 10/10 items with non-empty bodies, zero CF challenges (evidence at `.planning/phases/09-cooley-sitemap-tier/SITEMAP-05-smoke.txt`). Resolved backlog entry `cooley-cf-bypass.md` moved to `.planning/backlog/resolved/`. 394/394 tests passing across 29 files; tsc clean. Code review: 0 critical, 4 warnings (non-blocking — WR-01 error-prefix consistency, WR-02 canonicalizeUrl www strip reuse, WR-03 zod default masks detail_tier user intent, WR-04 per-item BrowserContext drift), 5 info deferred. Previously: Phase 8 (Hallucination Guard) PASSED. GUARD-01/02/03/04 all verified against codebase (4/4 SC). Layer 1 (body.trim().length < 100 short-circuit in `src/pipeline/run.ts`) + Layer 2 (Gemini prompt rule with 'title verbatim' + `confidence: 'low'` literals in `src/summarize/prompt.ts`) + Option C post-parse substitution in `src/summarize/gemini.ts` eliminate `summary_ko: null` on all real-run paths — only the `cli-skipped` debug path retains null. `src/pipeline/detectClusters.ts` (pure function, 114 lines) flags 3+ same-firm items sharing the first 50 chars of `summary_ko`, emits `HALLUCINATION_CLUSTER_DETECTED firm=<id> count=<n> signature="<esc>"` to stderr (signature escaped post code-review WR-03), demotes cluster members to `confidence: 'low'` + `isClusterMember: true`. `ClusterMarker[]` threaded from `run.ts` → `composeDigest` → `renderHtml` → `writeStepSummary` (no lossy reconstruction; WR-01 fixed). Email template (`src/compose/templates.ts`) added D-13 warning badge for B3 title-verbatim singletons, D-11/D-12 cluster fold UI, D-14 `renderDataQualityFooter`. GHA step-summary (`src/observability/summary.ts`) renders `## ⚠ Data Quality Warnings` section when markers present (single atomic `appendFile`). 373 tests passing across 28 files; tsc clean. Code review: 0 critical, 3 warnings (all fixed via /gsd:code-review-fix), 5 info deferred. Previously: Phase 7 (SPA-Aware Detail Tier) CLOSED WITH EXCEPTIONS. `detail_tier: 'js-render' | 'static'` field landed on FirmSchema + FirmConfig with zod default 'static' (DETAIL-01/03/05 validated); `enrichBody.ts` flipped from `type`-gated fallback to `detail_tier`-gated Playwright-only branch; `hasJsRender` predicate in `run.ts` now triggers browser launch for either gate. 6 firms declared `detail_tier: 'js-render'` in firms.yaml. Selector remediation: logos + skadden + lee-ko restored to OK; barun deferred to Phase 10/11 (image-only HTML email template, OCR candidate). bkl + kim-chang DISABLED with documented shared root cause — `canonicalizeUrl` strips leading `www.`, producing bare-apex URLs that fail against TLS cert CN / HTTP 302 path-strip; documented `restoreFetchHost(itemUrl, firmUrl)` helper design with 4-line logic + HTTP 200 curl evidence, parked for a follow-up URL-handling plan. SC-1/4 PASSED; SC-2/3 DEFERRED. DETAIL-02 / DETAIL-04 deferred. 326 tests passing; tsc clean. Previously: v1.1 milestone started 2026-04-19 after v1.0 shipped all planned scope but revealed hallucinated summaries on html-tier firms; cron paused.*
