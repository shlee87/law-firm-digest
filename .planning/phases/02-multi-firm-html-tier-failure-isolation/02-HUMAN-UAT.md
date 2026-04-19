---
status: partial
phase: 02-multi-firm-html-tier-failure-isolation
source: [02-VERIFICATION.md]
started: 2026-04-19T17:56:00Z
updated: 2026-04-19T17:56:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Selector 고의 파손 → 실패 firm footer + 나머지 firm 정상 digest
expected: Digest arrives; yulchon appears under '이번 실행에서 수집 실패' footer; other firms' new items summarized and rendered normally.
result: [pending]

### 2. GMAIL_APP_PASSWORD 오염 → 즉시 fail-red + GMAIL_AUTH_FAILURE marker
expected: Workflow exits with code 1 within seconds of the first SMTP attempt; no retry backoff; recovery URL (https://myaccount.google.com/apppasswords) present in stderr.
result: [pending]

### 3. 신규 firm 추가 → bootstrap seed + 다음 run에서 back-catalog flood 없음
expected: state/seen.json gains firms.test-newbie with urls.length === raw catalog size and enabledAt set; today's email contains zero test-newbie items.
result: [pending]

### 4. include/exclude_keywords 설정 → Gemini 쿼터 절약 (filter BEFORE summarize)
expected: Items lacking 'tax' in title+body[:500] OR containing 'press release' do NOT appear in the summarized output; Gemini call count matches only the passing items.
result: [pending]

### 5. 한국어 firm 라이브 응답 → mojibake 없이 렌더링
expected: All Korean firm titles + summaries render as readable Korean in the received email.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
