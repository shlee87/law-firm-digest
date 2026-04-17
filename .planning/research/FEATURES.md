# Feature Research

**Domain:** Personal law-firm newsletter aggregator (single user, $0/mo, GHA cron, Gemini summary → Gmail digest)
**Researched:** 2026-04-16
**Confidence:** HIGH

## Framing

"User" here = the builder (sole recipient). "Users leave" = the builder gives up on the system. That flips the usual feature calculus:

- **Table stakes** = things that, if missing, make the pipeline untrustworthy enough that the builder stops reading the email and goes back to manual browsing. These are also the things whose absence causes silent, invisible failures (missed updates, duplicate items, whole-run crashes) — the worst failure mode for an unattended cron.
- **Differentiators** = quality-of-life that raises the signal-to-noise ratio or shortens the debug loop when a scraper breaks (inevitable for 12 firms).
- **Anti-features** = things PROJECT.md already rules out plus common "just one more thing" traps that conflict with the $0 / single-user / one-email-a-day invariants.

Complexity ratings assume the STACK.md stack (Node 22 + TS + cheerio/feedparser/playwright + Gemini + nodemailer + YAML + JSON-in-repo state + GHA cron).

---

## Feature Landscape

### Table Stakes (Non-Negotiable — Cron Fails Silently Without These)

| # | Feature | Why Essential | Complexity | Depends On |
|---|---------|---------------|------------|------------|
| T1 | **Per-firm declarative config (YAML)** — id, name, language, type (rss/html/js), url, selectors, enabled flag | Hard-coded firms = violates explicit PROJECT.md requirement that a non-developer can add/remove firms by editing config | LOW | — |
| T2 | **Config schema validation at startup (zod)** with precise error messages | Non-developer edits → typos inevitable. Silent parse errors = phantom missing firms. Must fail loudly before the run starts | LOW | T1 |
| T3 | **Per-firm fetch tiering: RSS → static HTML → JS-render** | Some firms publish RSS (cheap, reliable); most don't. Without tiering, you either miss feeds or burn Playwright on every firm (GHA minutes waste) | MEDIUM | T1 |
| T4 | **Stable item identity + cross-run dedup** (URL or URL-hash keyed, stored in `state/seen.json`) | Without this, every run re-sends every existing item. This is THE feature that separates this system from a broken RSS reader | LOW | T14 (state storage) |
| T5 | **New-only detection + empty-day skip** (if `new_items.length === 0` → no email, still update state timestamp) | PROJECT.md decision: "오늘은 없음" emails are noise. Empty-day spam would kill the habit within a week | LOW | T4 |
| T6 | **Korean AI summary (3–5 lines) per new item via Gemini** (`gemini-2.5-flash` primary, `flash-lite` fallback on 429) | The one feature that justifies the whole system over just reading RSS headlines. Defined in PROJECT.md | MEDIUM | T1, T4 |
| T7 | **Single combined daily digest email** — one message, firm-sectioned, original-language title + KO summary + source link per item | PROJECT.md explicit decision. Prevents 5–10 emails/day from flooding inbox | LOW | T6 |
| T8 | **Per-firm sectioning in the email** with visible source attribution (firm name + link to firm's own newsletter index) | Without firm headers, items blur together and the reader loses the "which firm said this" context that's valuable in legal tracking | LOW | T7 |
| T9 | **Per-firm graceful failure isolation** (one firm's scraper crashing must not abort the run or skip other firms) | 12 firms × daily = firms WILL break individually (site redesigns, 500s, timeouts). Without isolation, one bad site = zero emails that day. This is the #1 reliability feature | MEDIUM | T3 |
| T10 | **Failure summary in the email footer** ("2 firms failed today: 광장 (timeout), Cooley (selector miss)") so the reader knows coverage was partial | Silent partial runs = reader assumes the silent firms had no news. False negative is worse than false positive in tracking | LOW | T9, T7 |
| T11 | **Secret management via GHA Secrets** (`GEMINI_API_KEY`, `GMAIL_APP_PASSWORD`, recipient address if kept out of config) — never committed, never logged | Violates $0 principle and security hygiene if leaked. Also GitHub revokes tokens that appear in commits | LOW | — |
| T12 | **Configurable recipient email** (YAML field, not hard-coded) | PROJECT.md explicit requirement. User indicated email may change | LOW | T1 |
| T13 | **Scraping politeness** — 1 req/site/day, User-Agent identifying the bot, respect robots.txt on the specific paths scraped, spaced/throttled concurrent requests | Legal firm sites are exactly the kind of sites that escalate to legal if mis-scraped. Also self-preservation: getting IP-banned by a tracked firm = permanent coverage loss | LOW | — |
| T14 | **Persistent state survives across GHA runs** — JSON files committed back via `git-auto-commit-action` with `[skip ci]`, permission `contents: write` | GHA cache TTL = 7 days → breaks dedup in quiet weeks. Without persistence, T4 is meaningless | LOW | — |
| T15 | **Timezone-correct scheduling** — cron in UTC, converted to a sensible local delivery time (e.g., KST morning) | A cron that fires at 3 AM local = email arrives overnight, often read a day late, and publish-date comparisons drift by a day near midnight | LOW | — |
| T16 | **Run-must-be-idempotent on retry** — re-running a failed workflow doesn't duplicate emails or double-summarize. Achieved by: dedup check BEFORE summary call, state commit AFTER email send | GHA `workflow_dispatch` and retry-on-failure are too useful to give up. Non-idempotent runs turn retries into duplicate-email events | MEDIUM | T4, T7, T14 |
| T17 | **Minimal structured logs to GHA run output** — per-firm: fetched N, new M, summarized K, errors E | Only visibility the builder gets when something is wrong. Without this, debugging is "run locally and hope it reproduces" | LOW | — |

**Not padding check:** every one of T1–T17 is listed because omitting it breaks an explicit PROJECT.md requirement, causes a silent cron failure mode, or causes the builder to stop trusting the daily email. None of them are "nice to have."

### Differentiators (Quality-of-Life for a Personal Use Case)

These aren't required for v1 to work, but each meaningfully reduces maintenance pain or raises signal density. Worth considering one or two for v1, rest for v1.x.

| # | Feature | Value Proposition | Complexity | Depends On | v1? |
|---|---------|-------------------|------------|------------|-----|
| D1 | **Per-firm include/exclude keyword filters** (YAML: `include: [...]`, `exclude: [...]` matched against title) | Some firms post HR-law or tax bulletins you don't care about. Filtering at fetch time cuts Gemini calls AND email length | LOW | T1, T4 | **Yes** — cheap, directly addresses signal density |
| D2 | **Per-firm category/practice-area tags** extracted from firm pages (e.g., scraped breadcrumb or badge) and shown in email | Lets the reader skim by domain (M&A, IP, dispute) before diving into summaries | MEDIUM | T3, T7 | No — defer to v1.x; only valuable if firm pages actually expose clean tags (some do, most don't) |
| D3 | **Failure alert when a firm has failed N consecutive days** (e.g., N=3) — adds a prominent "⚠️ 광장 scraper broken since Apr 12" banner at top of whatever digest next sends, or sends a dedicated alert email if no digest has sent | Without this, a silently broken firm just disappears from the coverage set and the reader doesn't notice for weeks | MEDIUM | T9, T14 (needs per-firm failure counter in state) | **Yes** — this is the feature that catches silent decay, which is the single biggest long-term risk |
| D4 | **Manual "ingest this URL" CLI / GHA `workflow_dispatch` input** — pass a URL, run the full summarize+append pipeline, attach to next digest | Lets the builder feed in a newsletter that isn't from a configured firm, or that a firm posted only via LinkedIn. Also a diagnostic tool: "is the summarizer the problem, or the scraper?" | LOW | T6, T7 | No — defer; only needed once or twice a month, and doable manually meanwhile |
| D5 | **Per-firm `check:firm <id>` CLI** — runs one firm end-to-end, prints parsed items without sending email or mutating state | Critical when adding a new firm or debugging selectors. Without it, "does my selector work?" means pushing to main and waiting for cron | LOW | T3 | **Yes** — this is the dev loop; absence of it makes adding/fixing firms painful enough to discourage | 
| D6 | **Global `DRY_RUN=1` mode** — run entire pipeline but skip email-send and state-write; print rendered email to stdout | For testing config changes safely before the next real run. Paired with D5 covers 90% of debug cases | LOW | T6, T7, T14 | **Yes** — near-zero cost, huge safety value |
| D7 | **Archive of past digests** — append each rendered email HTML to `archive/YYYY-MM-DD.html` in repo | Searchable history: "what did 김·장 say about 공정거래법 in March?" answerable without digging through Gmail. Git history = free full-text search via GitHub UI | LOW | T7, T14 | **Yes** — one extra file write, one extra git-committed path, huge long-term value |
| D8 | **Run summary written to GHA step summary** (markdown with per-firm counts, links to archived HTML) | Makes the Actions UI into a useful dashboard without building a UI. Review last 30 runs at a glance | LOW | T17 | **Yes** — `$GITHUB_STEP_SUMMARY` is a free file write, zero infra added |
| D9 | **Retry with exponential backoff on transient HTTP errors and Gemini 429s** (`p-retry`) + automatic fallback to flash-lite | Raises reliability without raising cost. Most scrape failures are transient; most 429s go away in seconds | LOW | T3, T6 | **Yes** — already implied in STACK.md; trivial with p-retry |
| D10 | **Gemini output structured JSON schema** (`{summary_ko, confidence}`) via `responseSchema`, not free-form text | Parsing free-form LLM output is the #2 cause of silent personal-automation bugs (after dedup). Structured output eliminates it | LOW | T6 | **Yes** — it's the same Gemini call with one extra param |
| D11 | **Cap per-firm item history** (e.g., keep last 500 URLs per firm) to prevent `seen.json` unbounded growth | At ~5 items/firm/day × 365 days × 12 firms = ~22K URLs/year. Not huge, but bounded is better for git diffs and repo clone speed | LOW | T4, T14 | **Yes** — a 5-line guardrail during state write |
| D12 | **Title-in-original-language enforcement** — if a non-KO title somehow gets translated by the Gemini call, detect and revert (e.g., guard against prompt drift) | PROJECT.md explicit: titles stay in original language. One wrong Gemini prompt revision could quietly start translating titles | LOW | T6 | **Yes** — done by keeping title out of the Gemini call entirely; summarizer only gets body text and returns summary |
| D13 | **Per-firm `enabled: true/false` flag** in config | Lets you pause a firm that's been broken for weeks without deleting its selectors (preserves the config for later fix) | LOW | T1 | **Yes** — single YAML field, trivial |
| D14 | **Link-health check inside email** — before sending, HEAD-check each item URL; flag 404s in the digest | Firms sometimes move URLs. Sending a broken link in the digest is embarrassing and loses the article | LOW | T7 | No — defer; rare case, flag after observing |
| D15 | **Markdown-and-plaintext multipart email** instead of HTML-only | Some mail clients render HTML poorly; plaintext fallback is more portable. Gmail handles both fine so it's marginal | LOW | T7 | No — Gmail-to-Gmail renders HTML reliably; defer until actual issue observed |
| D16 | **Per-run quota monitor** — log Gemini RPD consumed against budget; fail fast if projected usage exceeds daily limit | Guards against a firm suddenly publishing 300 items and blowing the 250 RPD cap | LOW | T6 | No — defer; 60-items/day worst-case is 6× headroom, monitor only if it becomes tight |
| D17 | **Basic email throttling / retry on 5xx from SMTP** | Gmail SMTP is reliable but not infinitely so. One retry with backoff prevents a single transient SMTP blip from losing a whole digest | LOW | T7 | **Yes** — one p-retry wrapper, zero ongoing maintenance |
| D18 | **Per-firm `since:` cutoff** — on first-ever run for a newly added firm, treat the current top-N items as "already seen" instead of flooding the first digest with 50 historical newsletters | Without this, adding a firm = the next digest is 40 items from that firm's back catalog drowning everything else | LOW | T4 | **Yes** — "bootstrap dedup" is a first-day-UX feature that pays back the first time you add a firm |

### Anti-Features (Deliberately NOT Building)

Each is explicitly out, with justification tied to PROJECT.md's constraints so the rationale survives future scope-creep pressure.

| # | Feature | Why Tempting | Why Out | PROJECT.md Alignment |
|---|---------|--------------|---------|----------------------|
| A1 | **Web UI / dashboard** (Next.js, admin panel, firm manager UI) | "Config file is primitive, a UI would be nicer" | Hosting a UI $0/mo means Cloudflare Pages / Vercel free tier — adds deploy pipeline, auth, another surface to maintain for ONE user. Config-file-with-comments already satisfies the "non-developer can add a firm" requirement | Explicitly in Out-of-Scope: "웹 대시보드 / UI" |
| A2 | **Multiple recipients / mailing list semantics** | "Might want to share with a colleague" | Single-user by design. Multi-recipient introduces consent, bounce handling, SPF/DKIM for a real sender domain, and deliverability concerns that evaporate when sending Gmail→same-Gmail | Explicitly in Out-of-Scope: "여러 수신인 동시 발송" |
| A3 | **Unsubscribe link / list-unsubscribe header** | "Emails should have one" | List-unsubscribe is a mailing-list protocol requirement. This is self-to-self email, not a list. Adding an unsubscribe link to a personal automation misrepresents it as a list and either points nowhere or requires a handler URL (needs hosting, see A1) | Implied by A2 being out-of-scope |
| A4 | **Real-time / push alerts** (webhook on firm publish, SSE, FCM) | "What if something urgent drops at 10 AM?" | Most legal updates have a same-day-fine latency tolerance. Real-time needs continuous listening → not compatible with daily GHA cron → would require an always-on worker, which breaks $0. Also noise-amplifying | Explicitly in Out-of-Scope: "실시간 푸시 알림" |
| A5 | **Full-text newsletter redistribution in the email** | "Summary is short, why not include the article?" | Copyright risk on law-firm publications (many are technically copyrighted even when publicly posted). Summary + link is the safe posture. Also inflates email size | Explicitly in Out-of-Scope: "뉴스레터 전문 재배포/저장" |
| A6 | **Korean translation of titles** | "Consistency — everything in Korean" | Legal terminology mistranslation risk is high; untranslated EN title preserves the precise term the firm used | Explicitly in Out-of-Scope: "제목까지 한국어 번역" |
| A7 | **Paid API / paid hosting** (OpenAI, Anthropic API, Resend paid, Supabase paid, managed DB) | "One of these might be more reliable" | $0/mo is a hard constraint. Gemini free tier + GHA + Gmail SMTP + in-repo JSON covers everything here | Explicitly in Out-of-Scope: "유료 호스팅/인프라" |
| A8 | **Using Claude Pro / ChatGPT Plus subscriptions as the pipeline AI source** | "User already has those subscriptions" | Neither subscription includes API access; they're chat-UI-only | Explicitly in Out-of-Scope in PROJECT.md |
| A9 | **Comments, reactions, per-item save/bookmark, likes** | "Cool web app features" | Zero value for a single-user personal digest. Would require state, storage, UI (A1) | Violates single-user simplicity principle |
| A10 | **User authentication / multi-tenant config** | "What if someone else wants to run their own?" | Fork the repo. Anything in-app = A1 | Violates single-user scope |
| A11 | **Machine translation of the whole article body** | "Korean reader wants full Korean text" | Expensive (MT + summarization pipeline = 2 calls instead of 1), doubles Gemini usage, invites the title-translation problem (A6) back in, and the summary already serves the "quick Korean skim" job | Same rationale as A6 |
| A12 | **Semantic / vector search over past items** | "Searchable archive would be great" | Archive via D7 (plain HTML files in repo) is already searchable via GitHub UI full-text search — free, no vector DB needed. Vector search = new infra, new dependency, new state, new $$$ | Violates $0 + KISS |
| A13 | **Browser extension that injects newsletters from the firm's site directly** | "Skip scraping entirely" | Requires the user to visit each firm's site — defeats the whole core value. The scraping IS the feature | Conflicts with Core Value |
| A14 | **Slack / Discord / Telegram notifications** | "Email is old-school" | Email IS the chosen delivery channel (PROJECT.md explicit: "이메일로 받아보는"). Adding more channels = more secrets, more maintenance, more places for a run to silently half-succeed | Conflicts with explicit PROJECT.md delivery choice |
| A15 | **AI-generated "topic clusters" or cross-firm synthesis** ("today multiple firms wrote about X") | "Cooler summaries" | Unreliable with 12 firms × ~5 items on any given day (too little data for real clustering), adds another LLM call layer, and muddles the clean per-firm attribution that IS the value. Keep per-firm sectioning clean | Violates per-firm source-tracking (which is table stakes T8) |
| A16 | **Importance / priority scoring** (AI ranks items by "how important to you") | "Long digests could be ranked" | Requires personalization data, risks hiding important items based on a flaky model signal. Per-firm filtering (D1) is the lightweight version | Single user can apply their own judgment reading 5–10 items/day |
| A17 | **Scheduling multiple digest times per day** (morning + evening) | "What about late-day publishes" | Violates "하루 1회 디지털 다이제스트로 충분" decision. Two emails/day = the noise problem the original decision was made to avoid | Conflicts with PROJECT.md "one-per-day" decision |
| A18 | **Custom HTML theme / branding** (logos, colors, firm favicons) | "Prettier email" | Firm favicons require fetching external images (extra HTTP, privacy-tracker-ish for the reader's mail client), mjml-level theming = more moving parts. Plain semantic HTML with readable typography is enough for one reader | Low ROI for single-user scope |

---

## Feature Dependencies

```
T1 (YAML config)
 ├── T2 (schema validation)
 ├── T3 (fetch tiering) ─── T9 (per-firm failure isolation)
 │                          └── T10 (failure summary in email)
 │                          └── D3 (consecutive-failure alert)
 ├── T12 (configurable recipient)
 └── D1 (include/exclude filters)
 └── D13 (enabled flag)

T3 (fetch tiering) ──► T4 (dedup) ──► T5 (new-only / empty-day skip)
                                  └── D11 (cap per-firm history)
                                  └── D18 (first-run bootstrap dedup)

T4 (dedup) ──► T6 (Gemini summary) ──► T7 (digest email)
                                       ├── T8 (firm sectioning)
                                       ├── T10 (failure footer)
                                       ├── D7 (archive past digests)
                                       ├── D17 (SMTP retry)
                                       └── T16 (idempotent retries)

T14 (persistent state / git-auto-commit) ── enables ──► T4, D3, D11

D5 (check:firm CLI) + D6 (DRY_RUN mode) ── form ──► dev loop

D8 (GHA step summary) ── enables ──► run-log dashboard (replaces A1 web UI)

T11 (secrets) ── blocks commit of ──► GEMINI_API_KEY, GMAIL_APP_PASSWORD

──── ANTI-DEPENDENCY / CONFLICT ─────
A1 (web UI) ──conflicts with── $0 constraint, single-user scope
A2 (multi-recipient) ──conflicts with── A3-absence (no unsubscribe needed)
A4 (realtime) ──conflicts with── GHA cron execution model
A15 (AI clustering) ──conflicts with── T8 (per-firm sectioning)
A17 (multiple digests/day) ──conflicts with── PROJECT.md single-daily decision
```

### Dependency Notes

- **Everything depends on T1 + T14.** The YAML config is the skeleton; the state file is the memory. Without either, dedup (T4) is impossible and thus every table-stakes feature downstream collapses into "broken RSS blaster."
- **T9 (failure isolation) is the keystone reliability feature.** 12 firms × 365 days = ~4,300 firm-fetch events/year. At even a 1% per-firm failure rate, you're looking at a daily breakage somewhere. Without T9, one breakage = zero email. With T9, one breakage = a footer line.
- **D3 (consecutive-failure alert) depends on T9 AND T14.** You need failure isolation to keep counting past the first failure, and persistent state to remember yesterday's counter.
- **D7 (archive) is deliberately cheap** because it piggybacks on T14's existing git-commit path. One extra file per send, zero extra infra.
- **D5 + D6 together ARE the dev loop.** Without them, the only way to test a config change is `git push && wait for cron`. Missing these is why many cron-job personal projects rot — the author can't debug them.
- **A1 (web UI) conflict graph:** opting in to A1 would also pull in auth, deployment, state sync between UI and YAML, and a per-change redeploy step. Rejecting A1 keeps the "edit YAML, git push, done" update model.
- **A15 (AI clustering) specifically conflicts with T8.** Clustering moves items out of firm sections into topic sections, which destroys the "which firm said this" attribution that is itself table stakes.

---

## MVP Definition

### Launch With (v1) — the "does it replace manual browsing?" bar

All 17 table stakes, plus the subset of differentiators that cost near-zero and compound immediately:

**Table stakes (non-negotiable):**
- [x] T1–T17 (all listed above)

**v1 differentiators (cheap + compounding):**
- [x] D1 — per-firm include/exclude keyword filters
- [x] D3 — failure alert on N-consecutive-day firm breakage
- [x] D5 — `check:firm <id>` CLI
- [x] D6 — `DRY_RUN=1` full-pipeline rehearsal
- [x] D7 — archive rendered digests under `archive/YYYY-MM-DD.html`
- [x] D8 — GHA step summary with per-firm counts
- [x] D9 — retry + Gemini model auto-fallback
- [x] D10 — Gemini structured JSON output
- [x] D11 — cap per-firm seen-URL history at 500
- [x] D12 — title-in-original-language guard (by design: title never enters Gemini)
- [x] D13 — per-firm `enabled` flag
- [x] D17 — SMTP retry on transient 5xx
- [x] D18 — first-run bootstrap dedup for newly added firms

**v1 launch test:** After 14 consecutive days of autonomous running, (a) no duplicate items across any email, (b) no empty-day emails sent, (c) at least one firm breakage was surfaced (either in the email footer or via D3), (d) builder has opened every day's digest. If all four → v1 validated.

### Add After Validation (v1.x) — add when specific pain shows up

- [ ] D2 — firm-page category tags in email *(add when: skimming digest becomes slow because items lack topical markers)*
- [ ] D4 — manual URL-ingestion via `workflow_dispatch` input *(add when: you catch a LinkedIn-only post you wish was in the digest)*
- [ ] D14 — link-health HEAD check *(add when: you click a broken link in the digest)*
- [ ] D16 — per-run Gemini quota monitor *(add when: daily new-items count starts approaching 100)*

### Future Consideration (v2+) — likely never, but not forever-banned

- [ ] Full-body Korean summary + original-language excerpt side-by-side *(only if D1 filters and 3–5-line summaries prove insufficient for a specific practice area)*
- [ ] SQLite-committed state instead of JSON *(only if seen.json exceeds ~1MB — unlikely with D11 cap)*
- [ ] Multi-recipient support *(PROJECT.md says "necessary in v2"; reconsider only if a concrete second reader emerges)*

---

## Feature Prioritization Matrix

| Feature | Value | Cost | Priority |
|---------|-------|------|----------|
| T1 YAML config | HIGH | LOW | **P1** |
| T2 schema validation | HIGH | LOW | **P1** |
| T3 fetch tiering | HIGH | MEDIUM | **P1** |
| T4 cross-run dedup | HIGH | LOW | **P1** |
| T5 new-only / empty-day skip | HIGH | LOW | **P1** |
| T6 Gemini summary | HIGH | MEDIUM | **P1** |
| T7 single daily digest | HIGH | LOW | **P1** |
| T8 per-firm sectioning | HIGH | LOW | **P1** |
| T9 graceful failure isolation | HIGH | MEDIUM | **P1** |
| T10 failure summary in footer | HIGH | LOW | **P1** |
| T11 secret management | HIGH | LOW | **P1** |
| T12 configurable recipient | HIGH | LOW | **P1** |
| T13 scraping politeness | HIGH | LOW | **P1** |
| T14 persistent state in repo | HIGH | LOW | **P1** |
| T15 timezone-correct schedule | HIGH | LOW | **P1** |
| T16 idempotent re-runs | HIGH | MEDIUM | **P1** |
| T17 structured run logs | HIGH | LOW | **P1** |
| D1 per-firm keyword filters | HIGH | LOW | **P1** |
| D3 consecutive-failure alert | HIGH | MEDIUM | **P1** |
| D5 `check:firm` CLI | HIGH | LOW | **P1** |
| D6 DRY_RUN mode | HIGH | LOW | **P1** |
| D7 digest archive | HIGH | LOW | **P1** |
| D8 GHA step summary | MEDIUM | LOW | **P1** |
| D9 retry + model fallback | HIGH | LOW | **P1** |
| D10 Gemini structured output | HIGH | LOW | **P1** |
| D11 seen-history cap | MEDIUM | LOW | **P1** |
| D12 title original-language guard | HIGH | LOW | **P1** |
| D13 per-firm enabled flag | MEDIUM | LOW | **P1** |
| D17 SMTP retry | MEDIUM | LOW | **P1** |
| D18 first-run bootstrap dedup | HIGH | LOW | **P1** |
| D2 category tags from firm pages | MEDIUM | MEDIUM | P2 |
| D4 manual URL ingestion | MEDIUM | LOW | P2 |
| D14 link-health HEAD check | LOW | LOW | P2 |
| D16 Gemini quota monitor | LOW | LOW | P2 |
| D15 multipart plaintext email | LOW | LOW | P3 |

**Priority key:**
- **P1** — ship in v1 (table stakes or near-zero-cost differentiators)
- **P2** — add after v1 validates, when specific pain emerges
- **P3** — only if a concrete problem shows up

---

## "Competitor" Feature Analysis

There is no direct competitor — this is a personal automation replacing a manual workflow. For sanity-checking, three adjacent tools and how they solve the same domain problems:

| Concern | Feedly Pro+ ($$) | Inoreader ($) | Hand-rolled IFTTT/Zapier ($–$$) | **This project (free)** |
|---------|------------------|---------------|-------------------------------|-------------------------|
| Aggregating 10+ firm feeds | Yes, RSS only | Yes, RSS + some HTML via custom agents | Partial, brittle on HTML | Yes, RSS + HTML + JS-render tiered (T3) |
| Dedup across fetches | Yes | Yes | No (manual) | Yes (T4) |
| Korean AI summary of each item | No (EN only, paid) | No | Chained with OpenAI ($) | Yes (T6, Gemini free) |
| One-email-a-day digest | Paid tier | Paid tier | Yes | Yes (T7) |
| Skip empty days | No, always sends | No | Sometimes | Yes (T5) |
| Per-firm failure isolation | Opaque | Opaque | No | Yes (T9) |
| Firm-sectioned output | No (topic-cluster instead) | No | No | Yes (T8) — deliberate differentiator |
| $ / month | $12+ | $7+ | $10+ | **$0** |
| Works without an account on 3rd-party infra | No | No | No | Yes (your repo, your Gmail) |

The project's real competition is **"do nothing / keep browsing manually."** Against that baseline, the sole thing that has to be good is: does the daily email make the builder stop opening law-firm websites manually? Every P1 feature serves that one outcome.

---

## Sources

- `.planning/PROJECT.md` — requirements, out-of-scope list, key decisions (authoritative for all scope calls)
- `.planning/research/STACK.md` — technology complexity ratings calibrated to the chosen Node 22 + cheerio + Gemini + nodemailer stack
- General personal-automation / cron-job patterns synthesized from common practice (GHA + git-auto-commit-action for state persistence; p-retry for flaky-fetch; structured-output LLM calls for reliability)

No external web research was required beyond what STACK.md already verified — feature categorization follows directly from PROJECT.md's explicit requirements and out-of-scope list, combined with stack-informed complexity estimates.

---
*Feature research for: Personal law-firm newsletter aggregator (single user, $0/mo, GHA cron → Gemini → Gmail digest)*
*Researched: 2026-04-16*
