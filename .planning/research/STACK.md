# Stack Research

**Domain:** Personal cron-driven web-scraping + LLM-summarization + email-digest pipeline
**Researched:** 2026-04-16
**Confidence:** HIGH for runtime, scraping, SDK, email, YAML, state. MEDIUM on exact Gemini free-tier RPD (see note).

## Executive Rationale

The project is a nightly (GitHub Actions cron) pipeline that fetches 12+ law-firm newsletter pages, dedups against prior-run state, summarizes new items via Gemini, and sends one Gmail SMTP digest. Constraints drive nearly every choice:

1. **$0/month** → no managed DB, no paid SaaS email, no paid hosting. State must live on free GitHub surfaces.
2. **Non-developer config editing** → YAML with comments, declarative firm entries. No code gymnastics.
3. **GHA cron runner** → fast cold-start matters; any heavy browser binary burns runner minutes; we already get 2,000 free min/month on public repos (unlimited on private if <2,000 min/month used). Minimize scope of Playwright to firms that truly need JS rendering.
4. **Politeness / rate-limit safety** → 1 req/site/day, respect robots.txt. Gemini free tier is tighter than PROJECT.md assumed — see note below.

---

## Critical Correction: Gemini Free-Tier Reality (April 2026)

**PROJECT.md states "1,500 req/day"** — this is outdated. As of Dec 2025 Google cut free-tier quotas by 50–80% citing fraud. Current April 2026 free-tier limits per model (per Google AI for Developers, verified via multiple 2026 sources):

| Model | RPM | RPD | TPM | Notes |
|-------|----:|----:|----:|-------|
| `gemini-2.5-pro` | 5 | 100 | shared 250K | Reasoning, deprecated from free tier for some accounts as of April 1, 2026 |
| `gemini-2.5-flash` | 10 | 250 | shared 250K | **Recommended for this project** |
| `gemini-2.5-flash-lite` | 15 | 1,000 | shared 250K | Fallback if Flash quota spikes |

Reset is at **midnight Pacific time**.

**Implication:** At ~12 firms × up to ~5 new items/day = ~60 summary calls/day worst-case. Comfortably within the 250 RPD Flash quota with headroom for retries. The original 1,500/day assumption was generous; current 250/day is still sufficient but leaves less cushion. **Recommend Flash as primary, Flash-Lite as automatic fallback on 429.** Confidence: HIGH that Flash is the right model; MEDIUM that exact RPD is 250 (Google is not publishing a single number on the docs page anymore — they route users to the AI Studio rate-limit dashboard for the current authoritative value).

---

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

---

## Installation

```bash
# Init
pnpm init
pnpm add @google/genai cheerio yaml zod nodemailer feedparser p-limit p-retry date-fns-tz
pnpm add -D typescript tsx vitest @types/node @types/nodemailer prettier eslint @eslint/js typescript-eslint

# Only if some firms need JS rendering (verify first during research phase):
pnpm add -D playwright
npx playwright install chromium --only-shell

# If you want prettier email HTML (optional):
# pnpm add mjml
```

**package.json scripts (suggested):**

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/main.ts",
    "test": "vitest run",
    "dry-run": "DRY_RUN=1 tsx src/main.ts",
    "check:firm": "tsx src/cli/check-firm.ts"
  }
}
```

---

## Answers to the 7 Questions

### 1. Language + runtime: Node.js 22 LTS (TypeScript via tsx)

**Why Node over Python:**
- `@google/genai`, `cheerio`, `nodemailer`, `playwright` are all first-class. Python has equivalents but the Node variants are slightly better maintained for this exact combo.
- GHA `actions/setup-node` with `lts/*` resolves instantly; no pip resolver slowdowns.
- Built-in `fetch`, `node:test`, native ESM → less dependency footprint.

**Why not Python:** Equally valid. Pick Python if personally more fluent — BeautifulSoup + `google-genai` Python SDK + smtplib all work. But the whole stack in one language is simpler, and TypeScript's type system catches more bugs in cron jobs that run unattended.

**Why not Deno/Bun:** Bun's Playwright native-module support has been flaky through early 2026; Deno's npm compatibility adds a layer of "will this work on GHA?" uncertainty for zero performance benefit at 1 run/day. **Stick with Node.** Confidence: HIGH.

### 2. HTTP + scraping libraries

Tiered approach — pick the lightest tool per firm:

| Firm type | Tool | Rationale |
|-----------|------|-----------|
| Firm exposes RSS/Atom | **feedparser** | Authoritative structured data, zero HTML fragility. Always prefer. |
| Firm serves full HTML server-side (most Korean firms, many US firms) | **Node 22 `fetch` + cheerio** | Fast, no browser binary, CSS selectors configured per-firm in YAML. |
| Firm requires JS execution to render list (some SPAs — verify per firm) | **playwright chromium --only-shell** | Used only as last resort, scoped to specific firms in config. |

**Do not default everything to Playwright.** Every Playwright-based firm adds ~1–3s to the run and ~150MB cached binary. For 12 firms, even if 3 need JS rendering, the other 9 should stay on fetch+cheerio. Confidence: HIGH on layering; MEDIUM on exact per-firm split (determined during implementation).

### 3. Gemini SDK

- **Package:** `@google/genai` (the new official SDK, GA). **Do not use** the deprecated `@google/generative-ai`.
- **Auth:** Set `GEMINI_API_KEY` as GitHub Actions secret → expose to step via `env: GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}`. SDK auto-detects.
- **Model:** `gemini-2.5-flash` primary, `gemini-2.5-flash-lite` fallback (more RPD headroom).
- **Rate-limit handling:** Wrap calls in `p-retry` with exponential backoff on HTTP 429 and 5xx. On repeated 429, degrade to Flash-Lite. Global concurrency `p-limit(3)` to stay well under 10 RPM.
- **Safety settings:** Use defaults; legal newsletter content is unlikely to trigger. Log but don't fail on `SAFETY`-blocked responses — send the item with original title only if summary is blocked.
- **Prompt pattern:** Request structured JSON output (`responseSchema` in `generationConfig`) for `{summary_ko: string, confidence: "high"|"medium"|"low"}` rather than free-form text — more reliable parsing.

Confidence: HIGH on SDK choice and auth; MEDIUM on exact RPD (250 is the commonly-reported figure but Google no longer publishes one canonical number; plan as if the real number could be lower).

### 4. Email delivery: Gmail SMTP via nodemailer — recommended

**Comparison for this project (1 recipient, low volume, $0 budget):**

| Option | Setup friction | Deliverability | $0 fit | Verdict |
|--------|----------------|----------------|--------|---------|
| **Gmail SMTP + App Password + nodemailer** | Medium: must enable 2FA, generate App Password (~5 min) | Fine for self→self delivery (won't land in spam when sending to same Gmail account) | Free forever at 500 emails/day | **RECOMMENDED** |
| Resend free tier (3,000/mo, 100/day) | Low: sign up, API key | Excellent, but requires a verified domain for pro "from:" addresses; on default subdomain "from:" shows onboarding@resend.dev | Free tier generous | Viable backup. Only worth it if you already own a domain and want branded sender. |
| Cloudflare Email Routing (forward only) | High: requires custom domain | N/A — it's forwarding inbound, not sending outbound | Free | **Wrong tool** — no outbound send. |
| Gmail OAuth2 (refresh token) | High: Google Cloud project, OAuth consent screen | Same as App Password | Free | Overkill for single-user personal automation. |

**Gmail App Password friction (one-time setup):**
1. Enable 2-Step Verification on the Gmail account.
2. Google Account → Security → App Passwords → generate 16-char password.
3. Store in GitHub Actions secret `GMAIL_APP_PASSWORD`.
4. nodemailer config:

```typescript
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: { user: 'your.email@example.com', pass: process.env.GMAIL_APP_PASSWORD }
});
```

Gmail SMTP to your own Gmail inbox is the lowest-friction path with zero domain setup, which matters since the project spec lists "receive-only single-user personal automation." If delivery issues ever appear (rare for self-send), graduate to Resend. Confidence: HIGH.

### 5. Config format: YAML (via eemeli/yaml + zod validation)

**YAML wins** for this use case:
- Supports comments — essential for a "this field means X" file a non-developer edits.
- Less syntactic noise than JSON (no quotes, no trailing-comma rules).
- More readable than TOML for nested selectors (TOML's nested tables get ugly fast for `selectors.list.item.title`).
- `eemeli/yaml` preserves comments on round-trip (useful if you ever want a `/add-firm` helper script that edits YAML).

**Schema guardrail:** Parse YAML → validate with zod → fail fast on malformed entries. Example config entry:

```yaml
firms:
  - id: kimchang
    name: 김·장 법률사무소
    language: ko
    type: html   # html | rss | js-render
    url: https://www.kimchang.com/ko/insights/newsletters
    selectors:
      list_item: "article.newsletter-item"
      title: "h3.title"
      link: "a@href"
      date: "time@datetime"
```

Confidence: HIGH. YAML is the universally accepted answer for "config file editable by non-developers" and the only competitor (TOML) has worse nesting ergonomics.

### 6. State storage (dedup across runs): JSON file committed back to the repo

**Option comparison:**

| Option | $0? | Persistence | Implementation | Verdict |
|--------|-----|-------------|----------------|---------|
| **JSON file in repo + `git-auto-commit-action`** | Yes | Permanent (git history) | `stefanzweifel/git-auto-commit-action@v6` after main step | **RECOMMENDED** |
| GitHub Actions Cache | Yes | 7 days only, evicted if unused | `actions/cache` | **Disqualified** — 7-day TTL breaks dedup if a firm publishes nothing for >7 days. |
| GitHub Actions Artifacts | Yes | Up to 90 days | `actions/upload-artifact` + `actions/download-artifact` | Possible but clunky, requires step to fetch prior artifact; also 90-day cap. |
| GitHub Gist | Yes | Permanent | Gist API via fetch | Works, but more moving parts than a repo commit. |
| Any SaaS DB (Supabase free, Neon free) | Yes technically | Permanent | HTTP client + schema | Violates "no paid infra spirit" and adds dependency. |

**Recommended structure:**

```
state/
  seen.json         # { "kimchang": ["url1", "url2", ...], "cooley": [...] }
  last-run.json     # { ranAt: "...", newItemsCount: N, errors: [...] }
```

Keep only URLs (or URL hashes if privacy matters) per firm, cap at e.g. last 500 per firm to prevent unbounded file growth. After main run: update JSON → `git-auto-commit-action` with message `chore(state): update seen items [skip ci]`. The `[skip ci]` prevents the state-update commit from re-triggering the workflow.

**Permission note:** Workflow needs `permissions: contents: write` in the YAML for the push-back to succeed.

Confidence: HIGH. This is the canonical pattern for GHA cron + small state (see karlhorky/github-actions-database-persistence).

### 7. Local dev/test loop

**Three-layer loop for fast iteration without hitting GHA:**

**Layer 1 — Unit tests (vitest):**
- Mock fetch with recorded HTML fixtures per firm (save real responses once, assert parser extracts expected items).
- `pnpm test` runs in <1s.

**Layer 2 — Dry run CLI:**
- `pnpm dry-run` runs full pipeline but:
  - Reads `state/seen.json` as normal.
  - Calls real Gemini API (uses your dev API key from `.env`).
  - **Skips** actually sending email — prints the rendered email to stdout instead.
  - **Skips** writing `seen.json` back.
- `DRY_RUN=1` env flag gates the two side-effecting steps.

**Layer 3 — Single-firm probe:**
- `pnpm check:firm kimchang` — runs only one firm through the pipeline, shows raw HTML/RSS, parsed items, what would be summarized. Essential for debugging selectors when a firm changes its site.

**GHA `workflow_dispatch` trigger:**
- Add `on: workflow_dispatch: {}` alongside `on: schedule:` so you can manually trigger a run from the Actions UI after pushing config changes, without waiting for the cron.

Confidence: HIGH.

---

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

---

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

---

## Stack Patterns by Variant

**If firm exposes RSS:**
- Use `feedparser` only, skip cheerio entirely for that firm.
- RSS items already have `title`, `link`, `pubDate` structured — no selectors needed in YAML.
- `type: rss` in YAML config, only `url` required.

**If firm serves static HTML (majority case):**
- Use `fetch` + `cheerio` with per-firm selectors in YAML.
- `type: html` in YAML, with `selectors: {list_item, title, link, date}`.

**If firm requires JS rendering (last resort):**
- Use `playwright` chromium headless.
- `type: js-render` in YAML, with `wait_for: "selector"` field.
- Flag in config that this firm is heavier — could be deferred or batched.

**If Gemini Flash quota exhausted mid-run:**
- Auto-downgrade to `gemini-2.5-flash-lite`.
- If that also 429s, queue remaining items with "summary pending" placeholder and still send the email (partial digest > no digest).

**If a run produces zero new items:**
- Skip email entirely.
- Still write state (no-op is fine — timestamp update only).
- Log to run summary for debugging.

**If GitHub Actions minutes approach limit (public repo free tier):**
- Repo should be public (2,000 min/month on free private, unlimited on public) — or accept the private-repo limit since 1 run × ~2 min × 30 days = 60 min/month, well within limits.

---

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

---

## Sources

**Context7 (HIGH confidence — official docs):**
- `/googleapis/js-genai` — @google/genai SDK initialization, env var auth, rate limit handling
- `/cheeriojs/cheerio` — load/fromURL/extract APIs, TS support, v1.2
- `/nodemailer/nodemailer` — Gmail service shortcut, App Password auth, OAuth2 fallback
- `/microsoft/playwright` — GHA workflow YAML, `install --with-deps`, ubuntu-latest
- `/eemeli/yaml` — YAML 1.2 parsing with comment preservation
- `/nodejs/undici` — native fetch implementation

**Official documentation (HIGH confidence):**
- [Google AI for Developers — Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — confirms RPD reset at midnight PT, directs users to AI Studio dashboard for current numbers
- [Playwright docs — Browsers](https://playwright.dev/docs/browsers) — `--only-shell` flag behavior
- [Nodemailer — Using Gmail](https://nodemailer.com/usage/using-gmail) — App Password setup, 2FA requirement
- [stefanzweifel/git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action) — state push-back pattern

**WebSearch-verified (MEDIUM confidence — multiple corroborating 2026 sources):**
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) — latest 1.49.x as of April 2026
- [cheerio npm](https://www.npmjs.com/package/cheerio) — latest 1.2.0
- [Gemini 2.5 Flash free-tier limits — YingTu 2026 guide](https://yingtu.ai/en/blog/gemini-api-free-tier) — 10 RPM / 250 RPD (with caveat that Google no longer publishes single authoritative number)
- [Node 22 vs 24 on GitHub Actions](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — Node 22 LTS through April 2027, Node 24 default coming June 2026
- [GitHub Actions persistence patterns — karlhorky/github-actions-database-persistence](https://github.com/karlhorky/github-actions-database-persistence) — commit-back is standard pattern
- [Gmail SMTP App Password — Mailtrap 2026 guide](https://mailtrap.io/blog/nodemailer-gmail/) — 2FA + App Password required after Less Secure Apps removal
- [Resend free tier — Resend.com](https://resend.com/pricing) — 3,000/mo, 100/day, requires verified domain for custom sender
- [feedparser npm](https://www.npmjs.com/package/feedparser) — v2.3.x, last publish 14 days prior to research

**Ambiguity flagged:**
- **Exact Gemini 2.5 Flash free-tier RPD** — multiple 2026 sources cite 250 RPD; Google's own docs page redirects to AI Studio dashboard. 500 RPD also appears in some 2026 sources (likely older in the year). Plan for 250 as conservative floor; real quota may be higher. Doesn't change stack choice (still Flash primary, Flash-Lite fallback).

---

*Stack research for: Personal legal-newsletter aggregator (GHA cron + Gemini + Gmail SMTP + YAML config)*
*Researched: 2026-04-16*
