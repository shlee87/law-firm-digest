---
slug: gemini-403-access-token-scope
status: resolved
trigger: gemini-403-access-token-scope-insufficient
created: 2026-04-20T22:55:00Z
updated: 2026-04-20T23:20:00Z
resolved_at: 2026-04-20T23:20:00Z
fix_commit: 344b65d
verification: "User ran `pnpm dry-run` post-fix — all 6 Cooley items rendered with real Korean Gemini summaries, no 403 errors, no 'API key should be set' warnings, pipeline exit 0."
---

# Debug Session: gemini-403-access-token-scope

## Symptoms

**Expected behavior:**
`pnpm dry-run` (또는 `DRY_RUN=1 tsx src/main.ts`) 실행 시, 각 활성 firm에서 fetch된 신규 항목(item)마다 `@google/genai` SDK로 Gemini 2.5 Flash가 호출되어 Korean `summary_ko` 필드를 생성. 이메일 digest 본문에 AI가 만든 요약문이 들어감.

**Actual behavior:**
`pnpm dry-run` 실행 시, Cooley 6개 항목 전부(아마 다른 firm의 항목도 마찬가지)에 대해 Gemini API 호출이 HTTP 403 `PERMISSION_DENIED`로 실패. 요약문은 URL-slug fallback(예: `Share Incentives Employees Private Uk Companies`)으로 렌더됨. pipeline 자체는 exit 0으로 완료되어 에러 footer에 잡히지 않음 (`[summarize]` 로그에만 에러가 남음).

**Error messages (verbatim from Phase 9 UAT Test 2, 2026-04-20):**
```
[summarize] model=gemini-2.5-flash url=https://cooleygo.com/... FAILED: {
  "error": {
    "code": 403,
    "message": "Request had insufficient authentication scopes.",
    "status": "PERMISSION_DENIED",
    "details": [{
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      "reason": "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
      "metadata": {
        "service": "generativelanguage.googleapis.com",
        "method": "google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent"
      }
    }]
  }
}
```

또한 각 summarize 호출 직전에 warning 반복 출력:
```
API key should be set when using the Gemini API.
```

Cooley 6개 항목 × 1-3회씩 = 15+ 반복.

**Timeline:**
- 발견: 2026-04-20 (Phase 9 UAT Test 2 수행 중, `/gsd:verify-work 9`)
- 로컬에서 이전에 작동했던 적 있는지: **한 번도 설정된 적 없음** (사용자 확인: "gemini api key는 github action에 environment로 등록했었어" — 즉 GHA에서만 secret → env 주입 경로로 작동했고 로컬 개발에는 env key를 아직 내려본 적 없음)
- GHA 경로와 분리된 문제 — 이 세션은 **로컬 Mac** 재현/해결 한정. GHA cron은 정상 동작 중이어야 함(Phase 11 RESUME-01 gate 재확인 시 별도 smoke 권장)

**Reproduction (minimal):**
```
pnpm dry-run
```
또는:
```
DRY_RUN=1 tsx src/main.ts
```

## Initial Evidence

**User-confirmed (2026-04-20):**
- `echo $GEMINI_API_KEY` → **empty** (현재 셸에 env var 미설정)
- 로컬에서 Gemini가 동작한 기록 없음 (사용자 기억 기준)

**Environment state (scraped before session spawn):**
- `.env` 파일이 저장소 루트에 **없음** (`ls -la .env` → 파일 없음)
- `.env.example`은 존재 (`362 bytes`, 2026-04-17 생성) — 템플릿만 있고 실제 값은 누락
- `.gitignore`는 `.env`를 제외할 것으로 추정 (미확인)

**Hypotheses to investigate (not yet tested):**
- H1 (primary): 로컬에 `.env`가 없고 shell에 `GEMINI_API_KEY`도 없어, `@google/genai` SDK가 apiKey 인자를 못 받아 ADC (Application Default Credentials, gcloud auth)로 fallback. ADC credentials는 `generativelanguage.googleapis.com` scope을 갖지 않음 → 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`. "API key should be set when using the Gemini API" 경고가 이 가설과 일치.
- H2: 코드에서 `dotenv`가 로드되지 않고 있음 (main.ts에 `import 'dotenv/config'` 같은 로드 라인 부재). `.env`를 만들어도 효과가 없을 수 있음.
- H3 (less likely): SDK 초기화 시 `apiKey` 인자가 누락된 경우 (`new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })` 같은 명시 전달이 없음). CLAUDE.md는 auto-detect를 권장하나, 실패 시 명시 전달이 더 견고.

**Downstream impact:**
- Phase 9 UAT Test 2 "issue" 상태로 파킹됨 (`.planning/phases/09-cooley-sitemap-tier/09-UAT.md` Gaps section)
- 로컬 `pnpm dry-run`이 end-to-end로 작동하지 않으므로 Phase 10 Data-Quality Observability 설계/테스트에 지장 가능 (DRY_RUN 출력 형식 UAT 불가)
- GHA 상 cron은 별도 — 이 세션과는 병행 조사 필요 (Phase 11 RESUME-01 gate)

## Current Focus

hypothesis: H1 CONFIRMED — `@google/genai`가 undefined apiKey를 받아 ADC로 fallback, cloud-platform scope만 가진 gcloud user credentials가 generativelanguage endpoint를 호출해 403
test: SDK 소스 직접 검증 (`node_modules/@google/genai/dist/node/index.mjs`) + `gcloud auth list`/`gcloud auth application-default print-access-token`으로 ADC 존재 확인. 3-part 코드 경로 확증.
expecting: `.env` 생성 + `GEMINI_API_KEY` 설정 + dotenv 로딩 path 추가 후 summarize 성공
next_action: user creates `.env` from `.env.example` → runs `pnpm dry-run` → confirms summaries succeed

## Evidence

- timestamp: 2026-04-21T04:00:38Z
  finding: H2 CONFIRMED — `src/main.ts`, `src/cli/checkFirm.ts`, 그리고 어느 소스 파일도 `dotenv/config`을 import 하지 않음. `grep dotenv src/` → no matches. `package.json`의 `pnpm dry-run` 스크립트도 `tsx --env-file=.env` 플래그 없이 `DRY_RUN=1 tsx src/main.ts` 형태로만 호출. 결론: `.env`를 만들어도 현재 코드 경로에서는 로드되지 않는다.
  source: `rg dotenv src`, `package.json:8`, `src/main.ts:63-93`

- timestamp: 2026-04-21T04:00:38Z
  finding: `src/summarize/gemini.ts:60` — `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`. apiKey 인자가 명시적으로 전달되지만 env var가 비어 있으면 `{ apiKey: undefined }`가 된다. SDK 내부 `NodeAuth` 생성자 (`node_modules/@google/genai/dist/node/index.mjs:19305-19312`): `if (opts.apiKey !== undefined)` — undefined일 경우 이 early return을 skip 하고 `new GoogleAuth(vertexAuthOptions)`로 폴백. `buildGoogleAuthOptions` (line 19351-19358): default scope = `REQUIRED_VERTEX_AI_SCOPE` (= `https://www.googleapis.com/auth/cloud-platform`). 이후 request는 `https://generativelanguage.googleapis.com/` endpoint를 향하지만 (line 12885), Bearer 헤더는 cloud-platform scope를 가진 ADC user-account 토큰 → 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT.
  source: `node_modules/@google/genai/dist/node/index.mjs:19305-19350`, `:12878-12886`, `:19351-19365`

- timestamp: 2026-04-21T04:00:38Z
  finding: 로컬 mac에 gcloud ADC가 실제로 설치·활성화된 상태. `gcloud auth list` → `sarakim1705@gmail.com` (ACTIVE). `gcloud auth application-default print-access-token` → 유효한 `ya29.*` 토큰 반환. 이 토큰이 SDK fallback 경로에서 주입되어 403을 유발하고 있음이 물리적으로 증명됨.
  source: local gcloud shell probe

- timestamp: 2026-04-21T04:00:38Z
  finding: GHA 경로는 영향 없음 — `.github/workflows/daily.yml:84-90`이 `env: GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}`로 직접 주입. dotenv/config import를 main.ts에 추가해도 GHA에서는 `.env`가 존재하지 않으므로 아무 일도 일어나지 않음 (dotenv는 기본적으로 누락된 파일을 silent skip). 양쪽 경로 호환.
  source: `.github/workflows/daily.yml:84-90`

- timestamp: 2026-04-21T04:00:38Z
  finding: `.gitignore:12-14` — `.env`, `.env.local`, `.env.*.local` 모두 제외. 커밋 리스크 없음.
  source: `.gitignore`

- timestamp: 2026-04-21T04:10:00Z
  finding: Fix applied. `src/main.ts`에 `import 'dotenv/config'`를 첫 import로 추가 (runtime imports 앞). `src/summarize/gemini.ts`의 `summarize()` 내 `call` 함수 상단에 `process.env.GEMINI_API_KEY` 존재 검증 + `AbortError` throw 추가 (pRetry 즉시 중단, 외곽 catch가 기존 title-verbatim fallback 경로로 흡수 → "Never throws" 계약 유지). `src/cli/checkFirm.ts` / `src/cli/auditFirms.ts`는 건드리지 않음 — `checkFirm`은 `skipGemini: true`로 summarize 함수 자체를 호출하지 않고, `auditFirms`는 runPipeline을 경유하지 않아 transitive import도 없음 (minimize diff). `pnpm typecheck` 통과.
  source: `git diff src/main.ts src/summarize/gemini.ts`, `pnpm typecheck`

## Eliminated

- H3 (SDK 초기화 시 apiKey 인자 누락): 코드 검증 결과 `{ apiKey: process.env.GEMINI_API_KEY }`로 명시 전달 중. 인자 자체는 올바르게 전달되고 있고, env 값이 비어 있는 것이 문제. H3 제거.

## Resolution

### Root cause

로컬 개발 환경에 `GEMINI_API_KEY`가 설정되지 않았고 (shell export 없음, `.env` 파일 없음), `src/main.ts` 및 기타 엔트리 파일 어디에도 `dotenv/config` 임포트가 없으며 `pnpm dry-run` 스크립트 또한 `tsx --env-file=.env` 플래그를 사용하지 않는다. 그 결과 `src/summarize/gemini.ts:60`의 `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` 호출이 `{ apiKey: undefined }`로 구성되고, `@google/genai`의 `NodeAuth` 클래스가 자동으로 `GoogleAuth`(ADC, cloud-platform scope)로 폴백한다. ADC는 사용자의 로컬 `gcloud auth application-default` 세션(`sarakim1705@gmail.com`, cloud-platform scope)에서 토큰을 발급하지만, 이 토큰은 `generativelanguage.googleapis.com` API가 요구하는 scope에 부합하지 않아 매 호출마다 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`을 반환한다. SDK가 매번 출력하는 `"API key should be set when using the Gemini API."` 경고가 ADC fallback 경로 진입을 명확히 알리고 있었다.

### Fix

**코드 변경 (2파일, +37/-1 라인):**

1. `src/main.ts` — 최상단에 `import 'dotenv/config';` 추가. 런타임 모듈 (`runPipeline`, `scrubSecrets`) import보다 먼저 실행되어 `.env` 파일을 `process.env`로 로드한 뒤 나머지 모듈 평가가 시작되도록 순서 보장. GHA 경로에서는 `.env`가 존재하지 않으므로 dotenv가 silent no-op.

2. `src/summarize/gemini.ts` — `summarize()` 내 `call` 함수 상단에 fail-loud 가드 삽입:
   ```ts
   const apiKey = process.env.GEMINI_API_KEY;
   if (!apiKey) {
     throw new AbortError(
       'GEMINI_API_KEY is not set — refusing to fall back to ADC (generativelanguage.googleapis.com requires explicit API key)',
     );
   }
   const ai = new GoogleGenAI({ apiKey });
   ```
   기존 `const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });`을 대체. `AbortError` 사용 이유: pRetry가 재시도하지 않고 즉시 실패하도록 해 quota 낭비 방지 (셋업 버그는 재시도로 해결되지 않음). 외곽 try/catch가 기존처럼 `[summarize] ... FAILED: ...` 로그 + title-verbatim `SummarizedItem` 반환 경로로 흡수해 "Never throws" 계약을 유지.

**사용자 작업 (별도):** `.env` 파일 생성 — `cp .env.example .env` 후 `GEMINI_API_KEY` + `GMAIL_APP_PASSWORD` 값 채움. `.gitignore`가 `.env`를 제외하므로 커밋 리스크 없음.

**비-작업 (의도적 non-goals):**
- `.github/workflows/*.yml` 수정 없음 — GHA 경로는 이미 `env: GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}`로 직접 주입되며 문제 없음.
- `src/cli/checkFirm.ts`, `src/cli/auditFirms.ts`에 dotenv import 추가 없음 — 각각 `skipGemini: true` / runPipeline 미경유로 summarize 경로를 호출하지 않음. minimize diff.
- vitest 테스트 추가 없음 — 사용자 선택 minimal scope.

### Files changed

- `src/main.ts` — +9 lines (1 import + 8 header-comment lines explaining load ordering and GHA compatibility)
- `src/summarize/gemini.ts` — +28/-1 lines (1 SDK instantiation moved + AbortError guard + header comment block explaining ADC 403 rationale)

### Verification

Pending user `.env` creation. Required steps:

1. `cp .env.example .env`
2. Edit `.env`: populate `GEMINI_API_KEY` (from https://aistudio.google.com/app/apikey or same value as GHA `GEMINI_API_KEY` secret) and `GMAIL_APP_PASSWORD` (same value as GHA secret).
3. `pnpm dry-run` → expect:
   - No `"API key should be set when using the Gemini API."` warnings.
   - No 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` errors.
   - Cooley items render Korean `summary_ko` bodies (not URL-slug fallback).
4. (negative test, optional) `mv .env .env.bak && pnpm dry-run 2>&1 | head -20 | grep GEMINI_API_KEY` → expect each item to log `[summarize] ... FAILED: GEMINI_API_KEY is not set — refusing to fall back to ADC ...` exactly once (no pRetry loop), email still ships with title-verbatim fallback. Restore with `mv .env.bak .env`.
5. GHA path unchanged — Phase 11 RESUME-01 smoke can proceed independently; workflow `env:` injection is untouched.

Static validation already performed:
- `pnpm typecheck` passes.
- Diff inspection confirms minimal scope (2 files, +37/-1).
