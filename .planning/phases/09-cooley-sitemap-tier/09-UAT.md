---
status: resolved
phase: 09-cooley-sitemap-tier
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md]
started: 2026-04-20T22:32:00Z
updated: 2026-04-20T23:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cooley 단일 firm 라이브 스모크
expected: `pnpm check:firm cooley` → 10 items, 10/10 bodies, dedup 및 would-summarize 출력, HTTP 403 / CF challenge 없이 종료 코드 0
result: pass

### 2. 전체 파이프라인 실행에 Cooley 포함
expected: `pnpm dry-run` → Cooley가 활성 firm으로 fetch 루프에 포함, N items 리포트 후 요약 단계까지 통과, 종료 출력의 "이번 실행에서 수집 실패" 섹션에 Cooley 미포함
result: issue
reported: "pnpm dry-run completed exit 0. Cooley fetch/enrich/digest rendering all succeeded (6 items in digest body, NOT in failure footer). However: Gemini API summarization failed for ALL 6 Cooley items with HTTP 403 PERMISSION_DENIED / ACCESS_TOKEN_SCOPE_INSUFFICIENT (reason=ACCESS_TOKEN_SCOPE_INSUFFICIENT, service=generativelanguage.googleapis.com). Result: summaries fall back to URL-slug titles instead of AI-generated Korean summaries. Also: 'API key should be set when using the Gemini API' warning repeated 15+ times before each call, suggesting GEMINI_API_KEY not picked up — possibly overridden by ambient Google Cloud ADC credentials with wrong OAuth scopes. Likely env/auth misconfig, not Phase 9 sitemap regression, but end-to-end digest ships without real summaries."
severity: major

### 3. firms.yaml Cooley sitemap 스키마 검증
expected: config/firms.yaml Cooley 블록에 일시적으로 `wait_for: ".foo"` 추가 → `pnpm check:firm cooley` 실행 → zod 검증 에러(`wait_for is only valid when type === "js-render"` 또는 유사한 메시지)로 즉시 실패하며 파이프라인 진행 안 됨. 변경 되돌리면 정상 동작 복원
result: pass
verification: "Driven by Claude (user chose option A). Added `wait_for: '.foo'` to Cooley block → `pnpm check:firm cooley` exit code 1 with zod error 'firms[].wait_for is only valid when type === \"js-render\"'. Yaml reverted; `git diff config/firms.yaml` is empty."

### 4. Audit 리포트에서 sitemap tier 확인
expected: `pnpm audit:firms` → Cooley가 tier `sitemap`로 표기되며, Plan 09-01 임시 스텁 문자열("wiring lands in Phase 9")이 아닌 실제 probe 결과(item count > 0, list 상태)가 출력됨
result: pass
verification: "Driven by Claude (user requested). 06-AUDIT.md shows `| cooley | sitemap | OK | 10 | n/a | n/a |` and per-firm evidence 'bodies distinct (jaccard=0.13, lengths 6342/10000)'. grep for 'wiring lands in Phase 9' → 0 matches. Exit code 1 is pre-existing (3 other firms non-OK: shin-kim list-fail, yulchon detail-quality-unknown, barun detail-empty — all unrelated to Phase 9)."

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "pnpm dry-run 전체 파이프라인 실행 시 Cooley 항목들이 fetch·enrich·digest 렌더링 단계 모두 통과하고 AI 요약 단계까지 정상 완료되어, 최종 digest 이메일 본문에 Korean 요약문이 포함되어야 함"
  status: resolved
  reason: "User reported: Gemini API summarization failed for ALL 6 Cooley items with HTTP 403 PERMISSION_DENIED / ACCESS_TOKEN_SCOPE_INSUFFICIENT (reason=ACCESS_TOKEN_SCOPE_INSUFFICIENT, service=generativelanguage.googleapis.com). Also 'API key should be set when using the Gemini API' warning appeared repeatedly, suggesting GEMINI_API_KEY not being picked up — possibly overridden by ambient Google Cloud ADC with wrong OAuth scopes. Phase 9 sitemap scope (fetch/enrich/render) worked correctly; the failure is in the Gemini auth/env layer but affects end-to-end digest quality."
  severity: major
  test: 2
  scope_note: "Outside Phase 9 scope (auth/env config, not sitemap tier). Resolved via separate /gsd:debug session, not Phase 9 gap_closure."
  root_cause: "Local repo had no `.env` file and no dotenv loader imported anywhere in source. `src/summarize/gemini.ts:60` called `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` with apiKey=undefined, which made @google/genai's NodeAuth silently fall back to GoogleAuth (ADC, cloud-platform scope) via the user's ambient `gcloud auth application-default` session. ADC token does not grant generativelanguage.googleapis.com scope → every Gemini call returned 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT."
  artifacts:
    - path: "src/main.ts"
      issue: "No dotenv loader — local .env would not be read even if present"
    - path: "src/summarize/gemini.ts"
      issue: "Silent ADC fallback when GEMINI_API_KEY is missing"
  missing:
    - "import 'dotenv/config' at the top of src/main.ts (runs before any SDK instantiation)"
    - "Explicit fail-loud guard in gemini.ts that throws AbortError when GEMINI_API_KEY is absent (prevents future silent regressions)"
    - "Local .env file (user-created, gitignored) with GEMINI_API_KEY, GMAIL_APP_PASSWORD, RECIPIENT_EMAIL populated"
  debug_session: ".planning/debug/gemini-403-access-token-scope.md"
  fix_commit: "344b65d (fix(env): load dotenv locally + fail loud when GEMINI_API_KEY missing)"
  verified_at: "2026-04-20T23:20:00Z"
  verification: "User ran `pnpm dry-run` post-fix. Result: all 6 Cooley items rendered with real Korean Gemini summaries (not URL-slug fallback). No 403 errors, no 'API key should be set' warnings. Pipeline exit 0. Unrelated `shin-kim: fetch failed` footer entry pre-exists Phase 9 and is tracked separately."
