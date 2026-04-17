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

## Adding a firm

Tracked firms live in `config/firms.yaml`. Each firm is a block under `firms:` with `id`, `name`, `language`, `type`, `url`, `timezone`, and `enabled`. The file header carries the field-by-field comment template — copy an existing block, change the fields, commit.

Phase 1 ships with a single `type: rss` firm (Cooley). Phase 2 expands the list to the full 12 (7 KR + 3 US + 2 UK) and introduces `type: html` via configured CSS selectors. Until Phase 2, adding non-RSS firms will fail schema validation at startup — which is by design, not a bug.

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
