<!-- GSD:project-start source:PROJECT.md -->
## Project

**LegalNewsletter**

주요 국내·해외 로펌의 공개 뉴스레터/Legal Update 페이지를 매일 자동으로 수집하고, 신규 발행분이 있는 날에만 한 통의 통합 다이제스트 이메일로 받아보는 개인용 자동화 시스템. 여러 로펌 사이트를 수동으로 순회하던 작업을 대체한다.

**Core Value:** 사용자가 직접 로펌 웹사이트를 돌지 않아도, 추적 대상 로펌들의 신규 뉴스레터를 원문 링크와 함께 한국어 요약으로 받아볼 수 있어야 한다.

### Constraints

- **Budget**: $0/월 — 기존 $20 Claude Pro + $20 ChatGPT Plus 외 추가 지출 불가. 유료 API·호스팅·DB 금지
- **AI source**: Gemini API 무료 티어 — `gemini-2.5-flash` 약 250 RPD + `gemini-2.5-flash-lite` 약 1,000 RPD 폴백. 유일한 자동화 가능 LLM 채널
- **Execution**: 클라우드 크론 기반 (GitHub Actions 유력) — 사용자 머신 켜짐 상태에 의존 금지
- **Email delivery**: 무료 경로만 사용 — Gmail SMTP(App Password) 또는 동등한 무료 티어
- **Scraping politeness**: 각 로펌 사이트 robots.txt 준수, 하루 1회 1요청/사이트 원칙. 부하/차단 리스크 최소화
- **Config UX**: 로펌 추가는 비개발자 수준에서 가능해야 함 — 코드 수정 없이 단일 파일 편집만으로
- **Secrets**: 이메일 비밀번호·API key 등은 저장소에 평문 포함 금지 (GitHub Actions secrets 또는 동등)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Rationale
## Critical Correction: Gemini Free-Tier Reality (April 2026)
| Model | RPM | RPD | TPM | Notes |
|-------|----:|----:|----:|-------|
| `gemini-2.5-pro` | 5 | 100 | shared 250K | Reasoning, deprecated from free tier for some accounts as of April 1, 2026 |
| `gemini-2.5-flash` | 10 | 250 | shared 250K | **Recommended for this project** |
| `gemini-2.5-flash-lite` | 15 | 1,000 | shared 250K | Fallback if Flash quota spikes |
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | **22 LTS** (22.x, active LTS through April 2027) | Runtime | GitHub Actions `actions/setup-node@v4/v5` supports it natively with `node-version: lts/*`. Node 22 has built-in global `fetch` (undici), native ESM, and `node:test` runner — zero-dependency HTTP + testing. Python is viable but Node's ecosystem for this specific stack (Cheerio + Playwright + nodemailer + @google/genai) is tighter and all first-party. Deno/Bun rejected: Bun on GHA still flakier than Node for native modules (Playwright), Deno's npm compat adds friction for zero real benefit here. |
| **TypeScript** | 5.7.x | Type safety | Single-developer personal project — types prevent 80% of the "undefined is not a function" bugs that kill cron jobs silently at 3am. Compile via `tsx` (no build step in CI). |
| **pnpm** | 9.x | Package manager | Faster installs on GHA than npm, smaller cache. Lockfile is deterministic. If unfamiliar, npm is fine — not a hard requirement. |
| **@google/genai** | **1.49.x** (latest Apr 2026) | Gemini SDK | This is Google's **official, GA** SDK. The older `@google/generative-ai` is deprecated — do not use it. Auth: set `GEMINI_API_KEY` env var (auto-detected), or pass `apiKey` explicitly. Supports thinking budget, safety settings, and streaming. |
| **cheerio** | **1.2.0** | Static HTML parsing | Ported to TypeScript, dual CJS/ESM, jQuery-like selector API. De-facto standard for Node HTML scraping. Has `cheerio.fromURL()` and `$.extract({...})` for declarative selector-to-object extraction — maps perfectly to YAML-configured selectors per firm. |
| **playwright** | **1.58.x** (v1.58 line, April 2026) | JS-rendered pages (only where needed) | Only used for firms whose insights page is rendered by client-side JS (most Korean firm sites are server-rendered; worth verifying per firm). Install `chromium --only-shell` to save ~150MB download vs full browser set. Cache `~/.cache/ms-playwright` across GHA runs with `actions/cache`. |
| **nodemailer** | **6.10.x** (CJS) / 7.x (ESM-first) | Gmail SMTP delivery | The Node standard. Zero runtime deps. Supports Gmail via `service: 'Gmail'` shortcut + App Password. |
| **yaml** (eemeli/yaml) | **2.7.x** | Config parsing | Preserves comments round-trip, supports YAML 1.2, better error messages than `js-yaml`. Matters because non-developer users need meaningful errors when they mis-indent. |
| **zod** | 3.24.x | Config validation | Validate the loaded YAML against a schema — reject malformed firm entries at startup, not 6 hours later when a scrape fails. Gives non-developers a precise error like "`firms[3].selectors.title` is required". |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **feedparser** | 2.3.x (actively maintained, last release Apr 2026) | RSS/Atom parsing | Use for firms that expose RSS (Cooley Alerts, Latham Publications, Clifford Chance have feeds — confirm per-firm). Prefer over `rss-parser` (3 years unmaintained). |
| **undici** fetch | Bundled in Node 22 | HTTP client | Use built-in `fetch` for plain HTML. No extra dep. Pass `User-Agent: LegalNewsletterBot/1.0 (+github.com/<you>/<repo>)` and `If-Modified-Since` / `ETag` headers for bandwidth politeness. |
| **p-limit** | 6.x | Concurrency cap | Throttle parallel firm fetches to 2–3 at a time — politeness + memory bound. |
| **p-retry** | 6.x | Transient failure retry | Retry scrapes on network blips, retry Gemini calls on 429/503 with exponential backoff. |
| **date-fns-tz** | 3.x | Timezone math | Parse firm dates consistently (Korean firms: KST; US/UK: local zone). Avoid footguns with bare `Date`. |
| **mjml** or **pug** (optional) | mjml 5.x / pug 3.x | Email HTML rendering | mjml if you want pretty responsive HTML email. For personal use, plain HTML template literal is fine — skip unless visual polish matters. Start without. |
| **dotenv** | 16.x (dev only) | Local `.env` loading | Only for local iteration. GHA passes secrets via `env:` directly. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **tsx** | Run TypeScript directly (no build) | `pnpm tsx src/main.ts` — same command local and in CI. Avoid tsup/esbuild build step complexity for a small project. |
| **vitest** | Test runner | Fast, ESM-native, built-in mocking. Use for unit tests on parsers + dedup logic. Node's `node:test` works too, but vitest has better DX for snapshotting firm-parse outputs. |
| **@types/node** | Node typings | Pin to 22.x line. |
| **prettier** | Formatting | Default config. |
| **eslint** (v9, flat config) | Linting | Minimal setup; `@eslint/js` recommended rules + TS plugin. |
| **GitHub Actions** | `actions/checkout@v5`, `actions/setup-node@v5`, `actions/cache@v4`, `stefanzweifel/git-auto-commit-action@v6` | Runner toolchain. `git-auto-commit-action` is the cleanest way to push state back to repo after each run. |
## Installation
# Init
# Only if some firms need JS rendering (verify first during research phase):
# If you want prettier email HTML (optional):
# pnpm add mjml
## Answers to the 7 Questions
### 1. Language + runtime: Node.js 22 LTS (TypeScript via tsx)
- `@google/genai`, `cheerio`, `nodemailer`, `playwright` are all first-class. Python has equivalents but the Node variants are slightly better maintained for this exact combo.
- GHA `actions/setup-node` with `lts/*` resolves instantly; no pip resolver slowdowns.
- Built-in `fetch`, `node:test`, native ESM → less dependency footprint.
### 2. HTTP + scraping libraries
| Firm type | Tool | Rationale |
|-----------|------|-----------|
| Firm exposes RSS/Atom | **feedparser** | Authoritative structured data, zero HTML fragility. Always prefer. |
| Firm serves full HTML server-side (most Korean firms, many US firms) | **Node 22 `fetch` + cheerio** | Fast, no browser binary, CSS selectors configured per-firm in YAML. |
| Firm requires JS execution to render list (some SPAs — verify per firm) | **playwright chromium --only-shell** | Used only as last resort, scoped to specific firms in config. |
### 3. Gemini SDK
- **Package:** `@google/genai` (the new official SDK, GA). **Do not use** the deprecated `@google/generative-ai`.
- **Auth:** Set `GEMINI_API_KEY` as GitHub Actions secret → expose to step via `env: GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}`. SDK auto-detects.
- **Model:** `gemini-2.5-flash` primary, `gemini-2.5-flash-lite` fallback (more RPD headroom).
- **Rate-limit handling:** Wrap calls in `p-retry` with exponential backoff on HTTP 429 and 5xx. On repeated 429, degrade to Flash-Lite. Global concurrency `p-limit(3)` to stay well under 10 RPM.
- **Safety settings:** Use defaults; legal newsletter content is unlikely to trigger. Log but don't fail on `SAFETY`-blocked responses — send the item with original title only if summary is blocked.
- **Prompt pattern:** Request structured JSON output (`responseSchema` in `generationConfig`) for `{summary_ko: string, confidence: "high"|"medium"|"low"}` rather than free-form text — more reliable parsing.
### 4. Email delivery: Gmail SMTP via nodemailer — recommended
| Option | Setup friction | Deliverability | $0 fit | Verdict |
|--------|----------------|----------------|--------|---------|
| **Gmail SMTP + App Password + nodemailer** | Medium: must enable 2FA, generate App Password (~5 min) | Fine for self→self delivery (won't land in spam when sending to same Gmail account) | Free forever at 500 emails/day | **RECOMMENDED** |
| Resend free tier (3,000/mo, 100/day) | Low: sign up, API key | Excellent, but requires a verified domain for pro "from:" addresses; on default subdomain "from:" shows onboarding@resend.dev | Free tier generous | Viable backup. Only worth it if you already own a domain and want branded sender. |
| Cloudflare Email Routing (forward only) | High: requires custom domain | N/A — it's forwarding inbound, not sending outbound | Free | **Wrong tool** — no outbound send. |
| Gmail OAuth2 (refresh token) | High: Google Cloud project, OAuth consent screen | Same as App Password | Free | Overkill for single-user personal automation. |
### 5. Config format: YAML (via eemeli/yaml + zod validation)
- Supports comments — essential for a "this field means X" file a non-developer edits.
- Less syntactic noise than JSON (no quotes, no trailing-comma rules).
- More readable than TOML for nested selectors (TOML's nested tables get ugly fast for `selectors.list.item.title`).
- `eemeli/yaml` preserves comments on round-trip (useful if you ever want a `/add-firm` helper script that edits YAML).
### 6. State storage (dedup across runs): JSON file committed back to the repo
| Option | $0? | Persistence | Implementation | Verdict |
|--------|-----|-------------|----------------|---------|
| **JSON file in repo + `git-auto-commit-action`** | Yes | Permanent (git history) | `stefanzweifel/git-auto-commit-action@v6` after main step | **RECOMMENDED** |
| GitHub Actions Cache | Yes | 7 days only, evicted if unused | `actions/cache` | **Disqualified** — 7-day TTL breaks dedup if a firm publishes nothing for >7 days. |
| GitHub Actions Artifacts | Yes | Up to 90 days | `actions/upload-artifact` + `actions/download-artifact` | Possible but clunky, requires step to fetch prior artifact; also 90-day cap. |
| GitHub Gist | Yes | Permanent | Gist API via fetch | Works, but more moving parts than a repo commit. |
| Any SaaS DB (Supabase free, Neon free) | Yes technically | Permanent | HTTP client + schema | Violates "no paid infra spirit" and adds dependency. |
### 7. Local dev/test loop
- Mock fetch with recorded HTML fixtures per firm (save real responses once, assert parser extracts expected items).
- `pnpm test` runs in <1s.
- `pnpm dry-run` runs full pipeline but:
- `DRY_RUN=1` env flag gates the two side-effecting steps.
- `pnpm check:firm kimchang` — runs only one firm through the pipeline, shows raw HTML/RSS, parsed items, what would be summarized. Essential for debugging selectors when a firm changes its site.
- Add `on: workflow_dispatch: {}` alongside `on: schedule:` so you can manually trigger a run from the Actions UI after pushing config changes, without waiting for the cron.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node.js 22 | Python 3.13 | If user prefers Python. BeautifulSoup + google-genai Python SDK + smtplib is equivalent. |
| cheerio | linkedom, parse5 | If you need full DOM spec compliance (you don't for scraping). |
| playwright | puppeteer | Playwright has better multi-browser, better `--only-shell` story, first-party maintenance by MS. Puppeteer is fine but offers nothing Playwright doesn't. |
| @google/genai | @google/generative-ai | **Do not use** the old one — deprecated. |
| @google/genai | Vercel AI SDK (`ai-sdk`) | If you already standardize on AI SDK. For a 1-model, 1-call-per-item pipeline, direct SDK is simpler. |
| Gmail SMTP | Resend | If you own a domain and want branded sender. |
| feedparser | @rowanmanning/feed-parser | Equally maintained; pick feedparser for larger ecosystem. |
| YAML (eemeli/yaml) | js-yaml | `js-yaml` is fine but doesn't preserve comments on round-trip. |
| JSON file committed back | SQLite committed back | Overkill for <10KB of state. JSON diffs are human-readable in git; SQLite blobs are not. |
| nodemailer 6.x | nodemailer 7.x | 7.x is ESM-first. Pick 7.x if starting fresh with ESM (recommended for this project). |
| vitest | node:test | `node:test` is built-in, zero-dep. Use it if you dislike Vitest's dep weight. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@google/generative-ai` | Deprecated as of 2025; replaced by `@google/genai` | `@google/genai` |
| `gemini-2.0-flash` / `gemini-2.0-flash-lite` | Deprecated Feb 2026, retiring June 1, 2026 | `gemini-2.5-flash` |
| `puppeteer` as default scraper | Heavier than needed, Playwright is strictly better for this workload | `playwright chromium --only-shell`, and only where JS rendering is required |
| Installing ALL Playwright browsers | Wastes ~500MB GHA bandwidth/runtime per run | `playwright install chromium --only-shell` |
| `actions/cache` for state | 7-day TTL — breaks dedup during quiet weeks | JSON file committed to repo |
| `request` / `node-fetch` npm packages | Obsolete — Node 22 has native `fetch` | Built-in `fetch` (globalThis) |
| `rss-parser` (rbren/rss-parser) | Unmaintained 3+ years as of April 2026 | `feedparser` (actively maintained) |
| `js-yaml` | Doesn't preserve comments on round-trip (hostile to non-dev config editors using tools) | `yaml` (eemeli/yaml) |
| OAuth2 for Gmail on a single-user personal project | Massive setup overhead (Google Cloud project, consent screen) for no benefit | Gmail App Password |
| Sending email via a SaaS free tier without a verified domain | Sender reputation will show ugly default domain | Gmail SMTP (sender = recipient, always clean) |
| Storing state in GitHub Gist | Extra API surface, auth token management, no benefit over in-repo JSON | JSON file in repo |
| Committing `.env` or API keys | Obvious, but worth stating: **never** | GitHub Actions secrets (`GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`) |
| `[skip ci]` omitted from state commit | Will cause infinite workflow loop | Append `[skip ci]` to auto-commit message |
## Stack Patterns by Variant
- Use `feedparser` only, skip cheerio entirely for that firm.
- RSS items already have `title`, `link`, `pubDate` structured — no selectors needed in YAML.
- `type: rss` in YAML config, only `url` required.
- Use `fetch` + `cheerio` with per-firm selectors in YAML.
- `type: html` in YAML, with `selectors: {list_item, title, link, date}`.
- Use `playwright` chromium headless.
- `type: js-render` in YAML, with `wait_for: "selector"` field.
- Flag in config that this firm is heavier — could be deferred or batched.
- Auto-downgrade to `gemini-2.5-flash-lite`.
- If that also 429s, queue remaining items with "summary pending" placeholder and still send the email (partial digest > no digest).
- Skip email entirely.
- Still write state (no-op is fine — timestamp update only).
- Log to run summary for debugging.
- Repo should be public (2,000 min/month on free private, unlimited on public) — or accept the private-repo limit since 1 run × ~2 min × 30 days = 60 min/month, well within limits.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node 22 LTS | `@google/genai` 1.x | Requires Node 18+; Node 22 is the sweet spot |
| Node 22 LTS | `playwright` 1.58.x | Full support, chromium-only install works on ubuntu-latest |
| `cheerio` 1.2.0 | TypeScript 5.x | Native TS types, dual CJS/ESM |
| `@google/genai` 1.49.x | TypeScript 5.x | Types included |
| `nodemailer` 7.x | Node 22 | ESM-first; use 6.x if stuck on CJS |
| `stefanzweifel/git-auto-commit-action@v6` | `actions/checkout@v5` | Needs `permissions: contents: write` on workflow |
| Playwright 1.58 | `playwright install chromium --only-shell` | Headless shell only, ~100MB vs 300MB full browser |
## Sources
- `/googleapis/js-genai` — @google/genai SDK initialization, env var auth, rate limit handling
- `/cheeriojs/cheerio` — load/fromURL/extract APIs, TS support, v1.2
- `/nodemailer/nodemailer` — Gmail service shortcut, App Password auth, OAuth2 fallback
- `/microsoft/playwright` — GHA workflow YAML, `install --with-deps`, ubuntu-latest
- `/eemeli/yaml` — YAML 1.2 parsing with comment preservation
- `/nodejs/undici` — native fetch implementation
- [Google AI for Developers — Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — confirms RPD reset at midnight PT, directs users to AI Studio dashboard for current numbers
- [Playwright docs — Browsers](https://playwright.dev/docs/browsers) — `--only-shell` flag behavior
- [Nodemailer — Using Gmail](https://nodemailer.com/usage/using-gmail) — App Password setup, 2FA requirement
- [stefanzweifel/git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action) — state push-back pattern
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) — latest 1.49.x as of April 2026
- [cheerio npm](https://www.npmjs.com/package/cheerio) — latest 1.2.0
- [Gemini 2.5 Flash free-tier limits — YingTu 2026 guide](https://yingtu.ai/en/blog/gemini-api-free-tier) — 10 RPM / 250 RPD (with caveat that Google no longer publishes single authoritative number)
- [Node 22 vs 24 on GitHub Actions](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — Node 22 LTS through April 2027, Node 24 default coming June 2026
- [GitHub Actions persistence patterns — karlhorky/github-actions-database-persistence](https://github.com/karlhorky/github-actions-database-persistence) — commit-back is standard pattern
- [Gmail SMTP App Password — Mailtrap 2026 guide](https://mailtrap.io/blog/nodemailer-gmail/) — 2FA + App Password required after Less Secure Apps removal
- [Resend free tier — Resend.com](https://resend.com/pricing) — 3,000/mo, 100/day, requires verified domain for custom sender
- [feedparser npm](https://www.npmjs.com/package/feedparser) — v2.3.x, last publish 14 days prior to research
- **Exact Gemini 2.5 Flash free-tier RPD** — multiple 2026 sources cite 250 RPD; Google's own docs page redirects to AI Studio dashboard. 500 RPD also appears in some 2026 sources (likely older in the year). Plan for 250 as conservative floor; real quota may be higher. Doesn't change stack choice (still Flash primary, Flash-Lite fallback).
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
