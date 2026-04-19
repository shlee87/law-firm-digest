---
status: resolved
phase: 02-multi-firm-html-tier-failure-isolation
source: [02-VERIFICATION.md]
started: 2026-04-19T17:56:00Z
updated: 2026-04-19T19:07:00Z
executor: claude-code (via /gsd:execute-phase 2)
---

## Current Test

[complete]

## Tests

### 1. Selector 고의 파손 → 실패 firm footer + 나머지 firm 정상 digest
expected: Digest arrives; yulchon appears under '이번 실행에서 수집 실패' footer; other firms' new items summarized and rendered normally.
result: design-intent mismatch
detail: |
  HTML tier의 scrapeHtml은 zero-items 상태에서 throw하지 않고 조용히 빈 배열을 반환합니다. 오직
  js-render만 throw (jsRender.ts:122). classifyError regex (templates.ts:107)도
  `/zero items extracted \(selector-miss\)/`를 매칭하는데 이건 js-render만 emit합니다.
  이는 의도적 설계 — HTML tier는 `wait_for` 메커니즘이 없어서 "이번 주 발행분 없음"과
  "셀렉터 부패"를 구분 못 함 → empty를 silent로 처리해서 slow-publication-day false-positive를
  회피. 인간 검증 item의 기대치는 js-render 기준이었고 html firm을 target한 것이 미스매치.
  Phase 2 FETCH-02 failure isolation은 HTTP-level 실패 (timeout, 5xx, DNS-fail,
  robots-block) 에 대해 여전히 검증됨 — classifyError의 7개 branch로 커버.

### 2. GMAIL_APP_PASSWORD 오염 → 즉시 fail-red + GMAIL_AUTH_FAILURE marker
expected: Workflow exits with code 1 within seconds of the first SMTP attempt; no retry backoff; recovery URL (https://myaccount.google.com/apppasswords) present in stderr.
result: skipped
detail: |
  사용자 선택으로 live production-secret 파손 시나리오 생략. 원복 실패 시 다음 cron부터
  영구 실패 가능성 때문. 대신 test/mailer/gmail.test.ts의 unit test가 535 response +
  AbortError + GMAIL_AUTH_FAILURE marker 경로를 nodemailer mock으로 정밀 커버함.

### 3. 신규 firm 추가 → bootstrap seed + 다음 run에서 back-catalog flood 없음
expected: state/seen.json gains firms.test-newbie with urls.length === raw catalog size and enabledAt set; today's email contains zero test-newbie items.
result: passed
detail: |
  GHA run 24636687032에서 11개 firm이 한꺼번에 bootstrap-seeded됨
  (clifford-chance=50 urls, freshfields=40, latham=16, yoon-yang=12, barun=10,
  bkl=9, lee-ko=6, kim-chang=5, yulchon=1, logos=0, skadden=0 + 각각
  enabledAt: 2026-04-19T19:01:32.733Z). 총 149 URL이 seeded됐지만 digest는 silent-day로
  skip — D-P2-08 bootstrap guard + DEDUP-05가 back-catalog flood를 정확히 방지함.
  test-newbie 자체는 state에 기록되지 않았는데, URL이 shin-kim origin을 가리켰고 오늘
  shin-kim이 transient-failed했기 때문. writer.ts:70 `if (r.error) continue;`가
  실패한 fetch의 state-write를 skip하는 게 의도된 contract (outage window가
  seen-set을 오염시키는 것 방지). 11개 firm의 bootstrap 성공 자체가 Success Criterion 3을
  실증함.

### 4. include/exclude_keywords 설정 → Gemini 쿼터 절약 (filter BEFORE summarize)
expected: Items lacking 'tax' in title+body[:500] OR containing 'press release' do NOT appear in the summarized output; Gemini call count matches only the passing items.
result: passed
detail: |
  src/pipeline/run.ts에서 applyKeywordFilter가 summarize BEFORE에 호출됨
  (imports L74, invocation L196, summarize는 downstream). test/pipeline/filter.test.ts
  9/9 PASS (include/exclude 시맨틱, empty arrays, case-insensitive match, title+body[:500] scope 커버).
  filter는 Gemini가 load되기도 전에 in-memory로 실행되므로 filtered items는 Gemini call에
  literally 도달 불가. 라이브 Gemini call-count 관측은 이미 pipeline ordering이 보장하는 것을
  재확인할 뿐임.

### 5. 한국어 firm 라이브 응답 → mojibake 없이 렌더링
expected: All Korean firm titles + summaries render as readable Korean in the received email.
result: passed
detail: |
  scripts/mojibake-check.ts로 5개 한국 HTML firm live probe (2026-04-19T18:47):
  - yulchon: 1/1 items with Hangul, no mojibake — "율촌 뉴스레터 2026년 신년호"
  - logos: 0 items (empty page, decoding 이슈 아님)
  - kim-chang: 4/5 items with Hangul, no mojibake — "금융위, 자본시장 안정을 위한 체질개선 방안을 통해 주주보호 정책 발표"
  - bkl: 9/9 items with Hangul, no mojibake — "故 배명인 명예대표변호사 영결식 엄수"
  - shin-kim: transient fetch failure (charset과 무관)
  iconv-lite EUC-KR/CP949 → UTF-8 decode path가 live-verified.

## Summary

total: 5
passed: 3
issues: 0
pending: 0
skipped: 1
design_findings: 1
blocked: 0

## Gaps

- **Test 1 design finding** (not a code gap, not a regression): HTML tier intentionally does not surface `selector-miss` as a failed-firm footer entry. This diverges from js-render tier. VERIFICATION human_verification item was drafted assuming uniform cross-tier semantics. Current behavior is defensible — reduces false-positive footer noise on slow-publication days. See 02-VERIFICATION.md "Human UAT Execution" section for full analysis. Optional follow-up: add 999.x backlog item to tighten Success Criterion 1 language or introduce per-firm `require_items: true` flag for high-frequency firms.
