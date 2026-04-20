# LegalNewsletter

## What This Is

주요 국내·해외 로펌의 공개 뉴스레터/Legal Update 페이지를 매일 자동으로 수집하고, 신규 발행분이 있는 날에만 한 통의 통합 다이제스트 이메일로 받아보는 개인용 자동화 시스템. 여러 로펌 사이트를 수동으로 순회하던 작업을 대체한다.

## Current Milestone: v1.1 Data-Quality Hardening

**Goal:** v1.0에서 shipped된 pipeline의 production output을 신뢰 가능한 수준으로 끌어올린다 — hallucinated summary 0건, 모든 enabled firm이 실제 article body를 추출, cron 재개 가능.

**Target features:**
- Firm-by-firm audit + probe (list/detail fetch 전수 진단: bkl, kim-chang, shin-kim, logos, skadden, js-render 4종)
- SPA-aware detail tier (`firm.detail_tier: 'js-render' | 'static'` schema 확장)
- Gemini hallucination guard (generic/empty body → title-verbatim + confidence:low)
- Cooley sitemap tier (CF-blocked RSS 회피 — 신규 `type: sitemap` scraper)
- Data-quality observability (step summary body-quality 지표 + 이상 firm 플래그)

**Acceptance:** 각 enabled firm detail body = 실제 article content, Gemini summary = 실제 내용 반영, cron 재개 후 1주일 관찰 hallucination 0건, cooley 복구 (또는 공식 disable 사유).

## Core Value

사용자가 직접 로펌 웹사이트를 돌지 않아도, 추적 대상 로펌들의 신규 뉴스레터를 원문 링크와 함께 한국어 요약으로 받아볼 수 있어야 한다.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] 추적 대상 로펌의 뉴스레터/Legal Update 페이지를 주기적으로 확인한다 (한국 7개, 미국 3개, 영국 2개를 기본값으로 포함)
- [ ] 신규 발행분(이전 실행 대비 새로 올라온 항목)을 식별한다
- [ ] 각 신규 항목에 대해 한국어 AI 요약(3~5줄)을 생성한다
- [ ] 신규 항목이 하나라도 있는 날에만, 로펌별로 섹션이 나뉜 통합 다이제스트 이메일을 발송한다
- [ ] 각 아이템은 원어 제목 + 한국어 요약 + 원문 링크를 포함한다 (영어 뉴스레터는 영어 제목 유지)
- [ ] 수신 이메일 주소는 config에서 쉽게 변경할 수 있다 (코드 수정 불필요)
- [ ] 추적 대상 로펌을 비개발자가 config 편집만으로 추가/제거할 수 있다 (YAML 혹은 동등한 선언적 포맷 + 필드 설명 주석)
- [ ] 시스템은 클라우드에서 자동으로 실행된다 (사용자 로컬 머신 실행 불필요)
- [ ] 운영 비용은 기존 Claude Pro / ChatGPT Plus 구독 외에 $0 을 유지한다

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
| 신규가 있을 때만 발송 | 매일 "오늘은 없음" 메일이 오면 노이즈. 신호 대 잡음비를 중시한 사용자 결정 | — Pending |
| 통합 다이제스트 1통/일 | 로펌별 개별 메일은 하루 5~10통 가능 — 받은함 오염 방지 | — Pending |
| 원어 제목 + 한국어 요약 | 법률 용어 원문을 보존하면서 빠른 스캔 가능. 번역 왜곡 리스크 회피 | — Pending |
| Gemini API 무료 티어로 요약 | Claude/ChatGPT 구독으로는 자동화 파이프라인 불가능. 완전 무료 요건과 자동 실행 요건을 동시 만족하는 유일한 경로 | — Pending |
| GitHub Actions로 크론 실행 | 저장소 자체에 cron 스케줄을 두면 사용자 머신 상태 무관 + 무료. 로그·재실행·secret 관리까지 내장 | — Pending |
| 로펌 config를 YAML(또는 동등) 선언형 | 비개발자가 편집 가능해야 한다는 요건을 만족하는 가장 보편적 포맷 | — Pending |

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
*Last updated: 2026-04-20 — Phase 6 (Firm Audit + Probe) complete. `pnpm audit:firms` diagnostic CLI ships with 4-signal detail-identity classifier, atomic AUDIT.md writer, and `runAudit` orchestrator. Live run re-detected v1.0 UAT bkl hallucination (`detail-identical` → Phase 7 remediation); inventory of 12 enabled firms now available at .planning/phases/06-firm-audit-probe/06-AUDIT.md. 8 non-OK firms routed to Phase 7 (fix-selector, enable-js-render-detail) / Phase 10-11 (monitor). 323 tests passing. Previously: v1.1 milestone started 2026-04-19 after v1.0 shipped all planned scope but revealed hallucinated summaries on html-tier firms; cron paused.*
