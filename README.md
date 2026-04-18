# LegalNewsletter

주요 국내·해외 로펌의 공개 뉴스레터/Legal Update 페이지를 매일 자동으로 수집하고, 신규 발행분이 있는 날에만 한 통의 통합 다이제스트 이메일로 받아보는 개인용 자동화 시스템. 사용자가 직접 로펌 웹사이트를 돌지 않아도, 추적 대상 로펌들의 신규 뉴스레터를 원문 링크와 함께 한국어 요약으로 받아볼 수 있다.

- **Runtime:** Node.js 22 LTS (TypeScript via `tsx`, ESM)
- **AI source:** Gemini API free tier (`gemini-2.5-flash` primary, `gemini-2.5-flash-lite` fallback)
- **Email:** Gmail SMTP via App Password (self → self)
- **Execution:** GitHub Actions scheduled cron (`0 9 * * *` UTC = 18:00 KST)
- **Budget:** $0/month

## Setup

Prerequisites: Node 22 LTS (or any compatible 22.x), pnpm 9.

```
git clone <this repo>
cd legalnewsletter
pnpm install
cp .env.example .env
# Edit .env and fill GEMINI_API_KEY + GMAIL_APP_PASSWORD
pnpm dry-run
```

The `dry-run` script runs the full pipeline (fetch → dedup → summarize → compose) but **skips the email send and state write**, so repeated local runs are safe.

For CI, set the same values as GitHub Actions Secrets — see the [Secrets](#secrets) section.

## DRY_RUN

`DRY_RUN=1` is a single env flag that gates the only two side-effecting stages in the pipeline:

1. `src/mailer/gmail.ts` — prints the subject + HTML to stdout instead of sending SMTP.
2. `src/state/writer.ts` — prints what would be written instead of updating `state/seen.json`.

Usage:

```
pnpm dry-run            # DRY_RUN=1 tsx src/main.ts
# or equivalently:
DRY_RUN=1 pnpm dev
```

Every other stage — firm fetch, Gemini summarization, digest composition — runs normally. This preserves realistic output while keeping the run idempotent for debugging.

## 시크릿 교체

Gmail App Password 또는 Gemini API 키를 교체해야 할 때의 순서:

**Gmail App Password:**

1. https://myaccount.google.com/apppasswords 접속 → 기존 `LegalNewsletter` 엔트리 삭제 (있는 경우).
2. 새 App Password 생성 → 16자리 값 복사 (공백 제거).
3. GitHub repo → **Settings → Secrets and variables → Actions** → `GMAIL_APP_PASSWORD` 를 `Update secret`.
4. 로컬 `.env` 에도 동일 값으로 갱신 (로컬 실행 용도).
5. GitHub **Actions 탭 → Daily Digest → Run workflow** 로 수동 dispatch 해 복구 확인.

**Gemini API Key:**

1. https://aistudio.google.com/app/apikey 에서 새 키 발급 → 값 복사.
2. GitHub Actions `GEMINI_API_KEY` secret 교체.
3. 로컬 `.env` 동기화.
4. 수동 dispatch 로 확인 (`401` / `API_KEY_INVALID` 로그가 사라져야 정상).

**주의:**
- `.env` 파일은 git-ignore 되어 있다. 절대 커밋 금지.
- 로그에 키 값이 직접 찍히지 않는다 — `src/util/logging.ts :: scrubSecrets` 가 에러 메시지에서 민감 정보를 제거한다.

## 로펌 추가하기

추적할 로펌은 `config/firms.yaml` 에 YAML 블록으로 선언한다. 비개발자 수준에서 편집 가능하도록 zod 스키마 (`.strict()`) 가 기동 시 검증한다.

**절차 (Phase 3 기준):**

1. `config/firms.yaml` 을 열어 기존 엔트리를 복사한다. 예시 블록:

```yaml
- id: new-firm               # 영문 슬러그 (lowercase, hyphen 만)
  name: 로펌명                # 이메일 다이제스트에 보이는 한국어/영문 이름
  language: ko               # ko | en
  type: html                 # rss | html (js-render 은 Phase 4 영역)
  url: https://firm.com/newsletter
  timezone: Asia/Seoul       # IANA TZ (firm.com 서버의 표기 기준)
  enabled: true
  selectors:
    list_item: ".post"
    title: ".post-title"
    link: "a"
    date: ".post-date"
```

2. 셀렉터를 뽑는 기본 절차 (DevTools):
   - 브라우저에서 로펌 뉴스레터 목록 페이지 열기 → F12 로 DevTools 열기.
   - `Elements` 탭에서 목록 반복 단위 (한 뉴스레터 카드/행) 를 우클릭 → `Inspect`.
   - 반복 컨테이너의 클래스/태그를 확인하고 가장 안정된 셀렉터를 `list_item` 에 넣는다 (예: `.post-prime`, `ul.notice_list > li`).
   - 그 안에서 제목/링크/날짜에 해당하는 셀렉터를 동일한 방식으로 뽑아 `title` / `link` / `date` 에 넣는다.
   - 링크가 `<a href="...">` 가 아닌 `onclick="goDetail(...)"` 패턴이면 `link_onclick_regex` + `link_template` 을 사용한다 (예시는 `kim-chang`, `bkl` 엔트리 참고).

3. 추가 후 검증:

```bash
pnpm check:firm new-firm --save-html /tmp/preview.html
open /tmp/preview.html   # (또는 `start` / `xdg-open`)
```

로컬에서 이메일·state 를 건드리지 않고 해당 로펌 단독으로 파이프라인을 돌려 렌더링 결과를 확인할 수 있다.

4. 이상이 없으면 `enabled: true` 상태로 커밋 → 다음 cron (18:00 KST) 부터 자동 수집.

## 수동 실행

스케줄된 09:00 UTC cron 을 기다리지 않고 파이프라인을 즉시 실행해야 할 때:

1. GitHub repo → **Actions 탭** 진입.
2. 왼쪽 사이드바에서 `Daily Digest` 선택.
3. 오른쪽 상단 `Run workflow` 드롭다운 클릭 → `Branch: main` 선택 → `Run workflow` 버튼.
4. 5–10초 후 새 실행이 목록에 나타난다 — 클릭해 로그와 step summary 를 확인.

수동 실행도 스케줄 실행과 동일한 run-transaction 을 수행한다 (fetch → summarize → email → archive → state). 동일 KST 날짜에 두 번 실행되면 `archive/YYYY/MM-DD.html` 은 두 번째 실행의 내용으로 덮어써진다 (D-15).

**로컬 dry-run:**

```bash
pnpm dry-run   # 모든 로펌 fetch + Gemini 요약은 돌리되, 이메일·state·archive 는 쓰지 않음
```

## 디버깅

### 메일이 안 왔어요

1. **이메일은 사일런트 데이인가?** — `DEDUP-03` 규칙상 신규 아이템이 0개이면 이메일을 보내지 않는다. `$GITHUB_STEP_SUMMARY` 테이블에서 `New` 컬럼이 모두 0 인지 확인.

2. **GitHub Actions 로그 확인** — Actions 탭 → 해당 실행 클릭 → `Run daily digest pipeline` 스텝 로그 읽기. 자주 보이는 패턴:
   - `ZodError ... firms` → `config/firms.yaml` YAML 형식 오류 — 복구는 파일 수정 + push.
   - `535` 또는 `GMAIL_AUTH_FAILURE` → App Password 만료/폐기 — `## 시크릿 교체` 섹션 참조.
   - `429` from Gemini → free-tier quota 소진 — 내일 자동 복구.
   - `ENOTFOUND` → 특정 로펌 사이트 일시 장애 — 해당 로펌만 footer 에 실패 표시, 다음 실행에서 재시도.

3. **특정 로펌을 단독으로 재현** — cron 을 기다리지 말고 로컬에서:

```bash
pnpm check:firm cooley                # 해당 로펌만 end-to-end (이메일·state·Gemini 는 건드리지 않음)
pnpm check:firm cooley --save-html /tmp/preview.html   # 렌더링 결과를 브라우저로 확인
```

스테이지별 출력이 사람이 읽기 좋은 한 줄씩 찍힌다:

```
[check:firm] id=cooley
  target           : firm=cooley
  fetch            : cooley: 12 items (1247ms)
  enrich           : cooley: 10/12 bodies
  filter           : cooley: 12 after filter
  dedup            : cooley: 3 new
  would-summarize  : 3 item(s)
  would-render     : 3 item(s) in digest
```

4. **archive 로 지난 다이제스트 확인** — `archive/YYYY/MM-DD.html` 을 브라우저에서 직접 열 수 있다 (또는 `git log -- archive/` 로 이력 조회).

5. **이래도 해결 안 되면** — Actions 탭의 실패 실행은 자동으로 GitHub issue 가 열린다 (`.github/workflows/daily.yml` 의 failure step). 그 issue 의 원인별 해결 표를 참고.

## GMAIL_AUTH_FAILURE recovery

If the daily run fails with a log line beginning `GMAIL_AUTH_FAILURE`, your Gmail App Password has been revoked or mistyped. Recovery:

1. Open https://myaccount.google.com/apppasswords
2. Delete the old `LegalNewsletter` entry (if present) and generate a new 16-character App Password.
3. Copy the new value (no spaces).
4. Update the `GMAIL_APP_PASSWORD` secret in **GitHub → Settings → Secrets and variables → Actions** (and in your local `.env` if you run locally).
5. Trigger the workflow manually from the Actions tab (`workflow_dispatch`) to confirm recovery.

Gmail revokes App Passwords automatically on password change, 2FA reset, and long periods of inactivity, so treat this as expected maintenance rather than an incident.

## Copyright and compliance

This tool stores only URLs, titles, and AI-generated summaries. Full newsletter bodies are never persisted. Each firm's `robots.txt` is respected on every run, and outbound requests identify themselves with an honest User-Agent string `LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)`. Scraping is rate-limited to one request per firm per day (`p-limit(3)` concurrency across firms).

Digests are for the recipient's personal awareness only — they do not redistribute firm content beyond what a human browsing the public newsletter page would already see.

## Secrets

All secrets are injected via environment variables. Local `.env` is git-ignored; CI uses GitHub Actions Secrets.

Required:

- `GEMINI_API_KEY` — Google AI Studio API key (free tier)
- `GMAIL_APP_PASSWORD` — 16-character Gmail App Password (2FA required on account)

Optional overrides:

- `RECIPIENT_EMAIL` — overrides `config/recipient.yaml` (D-05)
- `GMAIL_FROM_ADDRESS` — defaults to `RECIPIENT_EMAIL` when unset (self-send)
- `DRY_RUN` — set to `1` for local development runs

Never commit `.env`; never echo secret values into logs. The codebase provides `src/util/logging.ts :: scrubSecrets` to sanitize error messages before they reach `console.error`.
