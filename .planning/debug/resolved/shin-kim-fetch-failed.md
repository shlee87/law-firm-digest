---
slug: shin-kim-fetch-failed
status: resolved
trigger: shin-kim-fetch-failed
created: 2026-04-20T23:25:00Z
updated: 2026-04-21T04:55:00Z
resolved: 2026-04-21T04:55:00Z
---

# Debug Session: shin-kim-fetch-failed

## Symptoms

**Expected behavior:**
`pnpm dry-run` 또는 cron daily run 시, shin-kim (세종 / https://www.shinkim.com/kor/media/newsletter) 가 정상적으로 list fetch → item 추출 → dedup → summarize 를 거쳐 digest에 포함되어야 함. Phase 2 firm list에 `type: html`, `enabled: true`로 등록되어 있고 selectors도 설정됨 (config/firms.yaml:118-130).

**Actual behavior:**
- `pnpm dry-run` (2026-04-20) 출력에서 digest footer에 `<li>세종 (shin-kim) — unknown: fetch failed</li>` 로 표기. 디지스트 본문에 shin-kim 섹션 없음.
- `pnpm audit:firms` (06-AUDIT.md 2026-04-21T03:44:29Z) 결과: `| shin-kim | html | list-fail | 0 | monitor | Phase 10/11 |`. Evidence: "fetch failed".

**Error messages:**
- Error class: `unknown` (compose/templates.ts의 classifyError 분류 기준 모든 regex miss — robots-blocked, fetch-timeout, browser-launch-fail, playwright-timeout, selector-miss, http-{status}, dns-fail, parse-error 그 어느 것도 매칭 안 됨). `unknown`으로 떨어지는 것 자체가 새로운 실패 형태 — Phase 2 taxonomy로 안 잡힘.
- verbose 에러 메시지는 `pnpm check:firm shin-kim` 로 재현: `fetch: shin-kim: error fetch failed`. err.message = 'fetch failed' (undici TypeError), err.cause.code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'.

**Timeline:**
- 발견: `.planning/STATE.md` Known production regressions 블록에 "shin-kim list fetches fail" 등록 (v1.0 UAT 2026-04-19 발견).
- 해결: 2026-04-20 디버그 세션.

**Reproduction (minimal):**
```
pnpm check:firm shin-kim
```
→ `fetch: shin-kim: error fetch failed`

직접 undici fetch probe:
```
node -e 'try { await fetch("https://www.shinkim.com/kor/media/newsletter"); } catch(e){ console.log(e.cause?.code); }'
```
→ `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

## Initial Evidence

**Config state (`config/firms.yaml:118-130`):**
schema validation은 통과 (pipeline 진입은 성공), fetch 단계에서 실패.

**Audit report (.planning/phases/06-firm-audit-probe/06-AUDIT.md):**
- Tier: html
- Status: list-fail
- Items: 0
- Evidence: "fetch failed"

**Error classifier behavior (src/compose/templates.ts):**
- classifyError 분류 taxonomy의 regex 모두 miss → `unknown`으로 떨어짐

## Evidence

- timestamp: 2026-04-21T04:40Z — `pnpm check:firm shin-kim` 재현: `fetch: shin-kim: error fetch failed`. verbose 메시지는 footer와 동일 (undici TypeError의 `.message` 만 bubble).
- timestamp: 2026-04-21T04:41Z — `curl -sI https://www.shinkim.com/kor/media/newsletter` → `HTTP/1.1 200`. curl으로는 정상. 즉 URL 유효 + 사이트 live + shinkim.com robots / WAF 이슈 아님.
- timestamp: 2026-04-21T04:42Z — Node 22 undici fetch 원시 probe:
  - `err.name = 'TypeError'`, `err.message = 'fetch failed'`
  - `err.cause.code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'`
  - `err.cause.message = 'unable to verify the first certificate'`
  - stack: `TLSSocket.onConnectSecure → _tls_wrap.js:1679`
- timestamp: 2026-04-21T04:42Z — `openssl s_client -connect www.shinkim.com:443 -showcerts`:
  - depth=0 `CN=*.shinkim.com`, issuer=`Thawte TLS RSA CA G1` (DigiCert G2 chain)
  - `verify error:num=20:unable to get local issuer certificate`
  - `verify error:num=21:unable to verify the first certificate`
  - **서버 응답에 intermediate cert 없음** — leaf 하나만 내려줌. 서버측 chain 구성 오류.
- timestamp: 2026-04-21T04:42Z — `www.shinkim.com` vs apex `shinkim.com` 모두 동일 에러 (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). 즉 canonicalizeUrl + www-strip 으로 인한 CN mismatch (kim-chang/bkl 패턴) 아님. 서로 다른 근본 원인.
- timestamp: 2026-04-21T04:43Z — `NODE_TLS_REJECT_UNAUTHORIZED=0` 로 bypass 시 HTTP 200 + 65KB 본문 정상 수신. `.post-prime` / `class="text"` 셀렉터 여전히 매칭 (selector bitrot 아님).
- timestamp: 2026-04-21T04:45Z — 회귀 검증: `pnpm vitest run test/scrapers/html.test.ts test/compose/digest.test.ts` 기존 42 pass + 추가 10 tests (html TLS hoist 4 + classifier tls-cert-fail 6) 모두 pass.
- timestamp: 2026-04-21T04:52Z — `pnpm dry-run`: shin-kim footer 엔트리 제거됨. failed-firms footer 자체가 이번 실행에서 사라짐 (Cooley 6 items 정상 요약, 다른 firm 실패 없음).
- timestamp: 2026-04-21T04:54Z — `pnpm audit:firms`: shin-kim 이 enabled=false 라 audit scope 에서 제외됨.

## Eliminated

- H1 (anti-bot / WAF / Cloudflare challenge) — curl 로는 HTTP 200 정상, 별도 challenge 페이지 없음. `NODE_TLS_REJECT_UNAUTHORIZED=0` fetch 도 즉시 200 회수 (WAF 차단 시 bot UA 이든 아니든 challenge HTML 이 내려와야 함).
- H2 (ECONNRESET / 네트워크 타임아웃) — stack trace 는 `_tls_wrap.js` TLS handshake 단계; connection 은 성공 후 certificate verify 에서 실패. connection-level 리셋 아님.
- H3 (canonicalizeUrl www-strip, kim-chang/bkl 패턴) — `shinkim.com` apex, `www.shinkim.com` 모두 동일한 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 에러. canonicalize 가 www 를 떼어도 실패 원인이 동일. 즉 host-CN mismatch 아니라 chain-incomplete.
- H4 (HTTP 4xx/5xx/404) — curl HEAD 에서 200. 서버는 request 를 정상 처리; TLS 계층에서 Node 가 먼저 실패함.
- H5 (scrapeHtml 내부 timeout 미catch) — 실제 에러는 TLS handshake 이므로 scrapeHtml 의 timeout/abort 경로와 무관.

## Resolution

**root_cause:**
shinkim.com's TLS 서버가 **incomplete certificate chain** 을 전송함. leaf `CN=*.shinkim.com` 만 ServerHello 에 포함되고, 이를 발급한 intermediate `Thawte TLS RSA CA G1` (DigiCert Global Root G2 로 chain) 이 누락됨. curl 은 자체 번들 CA 로 intermediate 를 찾아내지만 (관대한 검증), Node 22 undici/OpenSSL 은 chain 을 완성하지 못해 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 로 거부. 결과: Node 에서만 `TypeError('fetch failed')`. kim-chang (07-05) / bkl (07-06) 의 canonicalizeUrl + www-strip → TLS CN mismatch 와는 다른 별개의 TLS 실패 (서버측 설정 오류).

**fix (3-file coupled commit):**

1. `config/firms.yaml:118-143` — shin-kim `enabled: false` 전환 + 전체 증거 코멘트 (재현 명령, openssl 출력, kim-chang/bkl 와의 구분, 향후 복원 경로). selectors 는 그대로 보존 → 향후 intermediate 트러스트 주입 fix 가 들어오면 `enabled: true` 한 줄 flip 로 복원.

2. `src/scrapers/html.ts:84-105` — `decodeCharsetAwareFetch` catch 블록에 TLS cause-code hoist 추가. `err.cause.code` 가 `UNABLE_TO_|CERT_|ERR_TLS_|SELF_SIGNED|DEPTH_ZERO` prefix 중 하나이면 `scrapeHtml {firm.id}: TLS {CODE}` 로 re-throw. 기존 HTTP-code re-wrap, timeout/DNS verbatim propagation 경로 불변.

3. `src/compose/templates.ts:129-176` — `classifyError` 에 한 줄 regex branch 추가: `/\bTLS [A-Z_]+/` → `tls-cert-fail`. playwright/browser-launch branch 다음, generic fetch-timeout/http-{status} branch 앞에 배치 (순서: specific → generic). header docstring taxonomy 블록에 `tls-cert-fail` 항목 추가.

4. `test/scrapers/html.test.ts` — html TLS hoist 4개 테스트 추가 (UNABLE_TO_VERIFY_LEAF_SIGNATURE / CERT_HAS_EXPIRED / ERR_TLS_CERT_ALTNAME_INVALID re-wrap + ECONNRESET 은 re-wrap 안 됨 negative test).

5. `test/compose/digest.test.ts` — tls-cert-fail 분류 6개 테스트 추가 (4가지 cause code 매핑 + plain "fetch failed" 는 unknown 유지 regression guard + "HTTP 503" 이 tls 로 오분류 안 됨 ordering guard).

**verification:**
- `pnpm vitest run test/scrapers/html.test.ts test/compose/digest.test.ts` → 52/52 pass (기존 42 + 신규 10)
- `pnpm vitest run` → 403/406 pass. 3 fail 은 `test/summarize/gemini.test.ts` 의 pre-existing 실패로 이 세션 변경과 무관 (HEAD git stash 상태에서도 동일 실패 확인).
- `pnpm dry-run` → shin-kim footer 엔트리 사라짐. 이번 실행에서 failed-firms footer 블록 자체가 비어서 렌더되지 않음 (clean-run visually unchanged pattern). Cooley 6 items 정상 요약, 다른 firm 실패 없음.
- `pnpm audit:firms` → 06-AUDIT.md 에서 shin-kim 항목 제외됨 (enabled=false 라 audit scope 밖). 10 firm 중 8 OK, 2 enabled && non-OK (yulchon detail-quality-unknown / barun detail-empty — 이 세션과 무관한 기존 상태).

**files_changed:**
- config/firms.yaml (disable shin-kim + evidence comment)
- src/scrapers/html.ts (TLS cause-code hoist in catch)
- src/compose/templates.ts (classifyError tls-cert-fail branch + taxonomy doc)
- test/scrapers/html.test.ts (+4 TLS hoist tests)
- test/compose/digest.test.ts (+6 tls-cert-fail classifier tests)
- .planning/phases/06-firm-audit-probe/06-AUDIT.md (re-generated by audit:firms)

**follow-up backlog:**
- 별도 follow-up 필요: `NODE_EXTRA_CA_CERTS` 로 Thawte TLS RSA CA G1 intermediate 주입 (`.github/workflows/*.yml` env) 또는 per-firm `undici.Agent` with bundled intermediate. Option (a) 가 범위 최소. 이 fix 가 들어오면 shin-kim `enabled: false` → `true` 한 줄 flip + selectors 는 이미 준비됨. kim-chang/bkl 과 별개 문제 (저 두 firm 은 `restoreFetchHost(itemUrl, firmUrl)` 헬퍼 필요).
- 장기: Phase 10/11 DQOBS-02 "≥50% low-confidence firm flag" 설계 시 tls-cert-fail 은 이제 명시적 분류가 있으므로 운영 신호로 활용 가능.

## Current Focus

_(resolved — 위 Resolution 섹션 참조)_
