---
phase: 02-multi-firm-html-tier-+-failure-isolation
goal: "All 12 target firms (7 KR, 3 US, 2 UK) run daily via the appropriate tier (RSS or HTML+cheerio), with per-firm failure isolation so one firm's scraper breaking never blocks the others."
depends_on: [01]
requirements: [FETCH-01, FETCH-02, DEDUP-05, EMAIL-05, EMAIL-07, CONF-04, CONF-06]
status: ready-for-research
author: discuss-phase (2026-04-17)
---

## Prior Context (Carried Over from Phase 1)

Phase 1 shipped the vertical slice with 1 firm (Cooley Go RSS). These decisions are LOCKED and not to be re-debated in Phase 2:

- **Stack**: Node 22 LTS, TypeScript via tsx, pnpm 9.15.0, @google/genai 1.50.x, cheerio 1.2, feedparser 2.3, nodemailer 8.x, zod 4, yaml (eemeli) 2.x.
- **AI model**: `gemini-2.5-flash` primary, `gemini-2.5-flash-lite` fallback on 429. Free tier (~250 RPD flash).
- **Delivery**: Gmail SMTP + App Password. `GMAIL_APP_PASSWORD`, `GEMINI_API_KEY`, `RECIPIENT_EMAIL` as GHA secrets.
- **Dedup primary key**: canonical URL via `canonicalizeUrl()` — utm stripping, fragment/trailing slash normalization.
- **State**: `state/seen.json` version 1, capped at 500 URLs per firm, committed back via `git-auto-commit-action@v7` with `[skip ci]`.
- **DRY_RUN**: single-site helper `isDryRun()`. Exactly two call sites (`mailer/gmail.ts`, `state/writer.ts`) — guarded by grep gate.
- **User-Agent**: `LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)`. Robots.txt consulted before every fetch.
- **Config**: `config/firms.yaml` with zod-strict schema, per-firm `id / name / language / type / url / timezone / enabled / selectors? / timeout_ms`.
- **Cron**: 09:00 UTC (18:00 KST) daily, `concurrency: {group: digest-pipeline, cancel-in-progress: false}`.
- **Failure notification**: GHA workflow step auto-opens GitHub Issue with triage table on `if: failure()`.
- **Known Phase 1 weakness (addressed in Phase 2)**: RSS `<description>` is often a teaser (~180 chars). Phase 1's prompt now produces a "low confidence" summary from the teaser. Phase 2 will fetch the full article body.

## Phase 2 Scope (from ROADMAP.md)

**Goal:** 12 target firms (7 KR, 3 US, 2 UK) run daily via appropriate tier with per-firm failure isolation.

**Requirements to ship (all currently Pending):**

- FETCH-01 — tier dispatch (RSS / static HTML / JS-rendered) by per-firm config (JS tier is Phase 4 if needed)
- FETCH-02 — one firm's failure must not block others (Promise.allSettled)
- DEDUP-05 — new firm first run bootstraps seed state silently (reuse Phase 1 D-09 pattern)
- EMAIL-05 — email footer lists failed firms + error summary
- EMAIL-07 — SMTP 5xx retry with backoff; 535 auth failure immediate fail with `GMAIL_AUTH_FAILURE` marker
- CONF-04 — `enabled: true/false` per firm (already in schema; widen behavior)
- CONF-06 — optional per-firm `include_keywords` / `exclude_keywords` filters

## Decisions (Locked by User)

### D-P2-01 — Firm selection: research-first with candidate baseline

**Candidate baseline for research phase:**

| Country | Firm | RSS? | Notes |
|---------|------|------|-------|
| KR | 김앤장 (Kim & Chang) | ? | Largest KR firm; audit newsletter page structure |
| KR | 광장 (Lee & Ko) | ? | Bilingual EN/KR publications likely |
| KR | 세종 (Shin & Kim) | ? | Public "Legal Update" section |
| KR | 율촌 (Yulchon) | ? | Insight/Publication pages |
| KR | 태평양 (Bae, Kim & Lee) | ? | Newsletter archive |
| KR | 화우 (Yoon & Yang) | ? | Publication list |
| KR | 바른 (Barun Law) | ? | Newsroom |
| US | Latham & Watkins | Likely yes | Alerts feed commonly RSS |
| US | Kirkland & Ellis | ? | Alerts/insights |
| US | Skadden | ? | Insights section |
| UK | Clifford Chance | Likely yes | Known to expose RSS |
| UK | Freshfields | ? | Insights/alerts |

**Research phase (next step) responsibilities per firm:**
1. Probe public newsletter/insights/alerts page (HEAD + small GET).
2. Check for `<link rel="alternate" type="application/rss+xml">` or `/feed`, `/rss`, `/alerts/feed` endpoints.
3. Read `robots.txt` — note any disallow patterns hitting newsletter paths.
4. Identify the listing page selectors (for HTML tier) or confirm RSS URL.
5. Categorize: `rss` | `html` | `blocked-or-require-login`.

**Any firm that lands in the "blocked-or-require-login" bucket is substituted from a backup pool** (e.g., 법무법인 로고스, Clayton Utz) so we still ship 12 firms. Final list returns for user approval before `/gsd-plan-phase 2`.

### D-P2-02 — Full article body fetch included in Phase 2

**Scope:** Every firm (RSS and HTML tier) performs a second GET to the article's detail page and extracts the body before feeding it to Gemini. This lifts summary quality from "low-confidence teaser paraphrase" (Phase 1 failure mode) to "medium/high-confidence real summary".

**Politeness guard:** Stays within "1 req/firm/day spirit" because new items per firm per day is typically 0–3. Detail fetches are sequential within one firm (per-firm `pLimit(1)`). Total network budget per run stays small (12 firms × avg 2 new items × 1 detail page = ~24 detail GETs/day, well inside polite range).

**Extraction strategy (generic):**
1. `cheerio.load(html, { decodeEntities: true })`
2. Try selectors in order: `article`, `main`, `.entry-content`, `.post-content`, `.article-body`, `#content`
3. If none match: pick the element with the largest contiguous `<p>` cluster
4. Strip `<script>`, `<style>`, `<nav>`, `<aside>`, `<footer>`, common ad/share widgets
5. Normalize whitespace, cap at 10k chars before feeding Gemini (stay under 250K TPM shared)

**Per-firm override:** optional YAML field `selectors.body: "<css>"` for firms where the generic chain fails. Research phase records the selector per firm if needed.

**Failure path:** If detail fetch fails (timeout, 404, blocked), fall back to the list-page description/excerpt. Summary still attempts, confidence marked `low`.

## Decisions (Claude's Discretion — Documented for Downstream Agents)

### D-P2-03 — Failure isolation via `Promise.allSettled`

`pipeline/fetch.ts` already per-firm-tries; widen to `Promise.allSettled` so one firm's throw cannot short-circuit the whole run. Failed firm's `FirmResult.error` carries `{stage, message, stack?}`. Composer downstream reads `error` to render footer. **No retry** at firm level (transient failures wait for next day's cron; user can workflow_dispatch manually).

### D-P2-04 — Email footer format for failed firms (EMAIL-05)

```
<footer style="margin-top:32px;color:#999;font-size:12px;">
  ⚠ 이번 실행에서 수집 실패 — 다음 실행에서 재시도됩니다:
  <ul style="margin:4px 0;">
    <li>{firm.name} ({firm.id}) — {errorClass}: {first line of error, truncated 140 chars}</li>
  </ul>
  AI 요약 — 원문 확인 필수
</footer>
```

- `errorClass` = `fetch-timeout | http-{status} | parse-error | selector-miss | dns-fail | unknown`
- Error text passed through `scrubSecrets()` before rendering (defense in depth even though secrets should never be in scraper errors).
- NO stack traces in email. Full stack stays in GHA logs for triage.

### D-P2-05 — SMTP retry + auth failure (EMAIL-07)

- **5xx transient** (502, 503, 504): `p-retry(3, exponential 2s/4s/8s)`. After 3 failures, fail the workflow (red).
- **535 auth failure**: immediate, NO retry. Emit `GMAIL_AUTH_FAILURE` + https://myaccount.google.com/apppasswords recovery URL (already in Phase 1; just keep).
- **Other SMTP codes** (4xx, 5xx non-transient): fail immediately (consistent with Phase 1 EMAIL-06).
- Implementation: wrap `transporter.sendMail` in pRetry with onFailedAttempt that aborts on 535 or non-5xx.

### D-P2-06 — Character encoding

- Node fetch + cheerio.load handles UTF-8 natively.
- Detect charset via `Content-Type` header, then `<meta charset>`, then `<meta http-equiv="Content-Type">`.
- If EUC-KR / CP949 detected: decode bytes via `iconv-lite` before passing to cheerio. Korean firm sites still occasionally serve legacy encodings.
- Add `iconv-lite` to deps (lightweight, well-maintained).

### D-P2-07 — Keyword filter (CONF-06)

- YAML fields: `include_keywords: []`, `exclude_keywords: []`. Both optional; empty array = no filter.
- **Match policy**: case-insensitive substring on `title` PLUS first 500 chars of the fetched body (D-P2-02). NO regex (non-dev hostile).
- **Application order**: apply BEFORE Gemini call — saves free-tier quota. `include` is an AND-gate (any match passes); `exclude` is an OR-gate (any match kills).
- **Korean particles**: naive substring matching is fine for v1. If false-negatives become an issue, revisit with `mecab-ko` tokenization (deferred).
- **Logging**: number of items filtered per firm shown in optional Phase 3 step summary (OPS-07 territory) — not an email concern.

### D-P2-08 — New-firm bootstrap (DEDUP-05)

Reuse Phase 1 D-09 logic in `src/pipeline/dedup.ts`. Already works per-firm: if `state.firms[firmId]` is undefined, return `{new: []}` and the writer seeds `urls` from `r.raw`. Extending to fix WR-05 from Phase 1 code review: also treat `{urls: [], lastNewAt: null}` as bootstrap state to prevent accidental back-catalog flood after a manual state edit.

### D-P2-09 — Tier dispatch from config

Existing schema already has `type: rss | html` and `selectors` for html. Phase 2 just implements the `html` branch in `pipeline/fetch.ts`:

```
switch(firm.type) {
  case 'rss':  return scrapeRss(firm);
  case 'html': return scrapeHtml(firm);   // NEW
  case 'js-render': throw new Error('Phase 4 territory');
}
```

`scrapeHtml` returns the same `RawItem[]` contract — list page → items → canonicalizeUrl → done. Detail-page body fetch happens AFTER list extraction, in a new `enrichWithBody()` step shared by both tiers.

### D-P2-10 — Per-firm detail page politeness

- Firm-level `pLimit(3)` (FETCH-03) stays — parallel across firms.
- Within ONE firm, detail fetches are SEQUENTIAL via per-firm `pLimit(1)` (spawned fresh per firm). Keeps "one request at a time per site" spirit.
- 500ms min delay between detail fetches for the same firm (`setTimeout` inside the pLimit).
- Total: a firm with 3 new items = 4 requests today (1 list + 3 detail), spread over ~2s.

### D-P2-11 — Body extraction generic chain

See D-P2-02 for ordering. Per-firm override `selectors.body` wins when present.

### D-P2-12 — No detail page caching

Daily run; items rarely re-summarized. Adding a body cache would require a new state file or DB. Not worth it for personal-use automation. Skip.

### D-P2-13 — Korean vs English prompt routing

- Existing `firm.language: 'ko' | 'en'` already flows into `RawItem.language`.
- Prompt variant for Korean firms: "한국어 원문을 그대로 2~5줄 요약" (shorter; no translation overhead).
- Prompt variant for English firms: "한국어 2~5줄 요약으로 번역-요약" (current Phase 1 prompt).
- Gemini will see the lang hint in the prompt; caller controls which prompt builder runs.

## Deferred Ideas (Captured but Not In Phase 2)

- Archive of past digests to `archive/YYYY/MM-DD.html` → Phase 3 (OPS-09)
- Per-firm staleness warning ("X days since last new item") → Phase 3 (OPS-04)
- Single-firm CLI probe `pnpm check:firm <id>` → Phase 3 (OPS-07)
- Multiple recipients with per-firm routing (recipient A gets KR firms, B gets US firms) → v2
- Non-Gmail SMTP backend → v2
- Title translation → v2 (SUMM-06 prohibits title in prompt anyway)
- Attachment delivery → v2
- mecab-ko tokenization for keyword filters → revisit if substring false-negatives surface in practice
- JS-rendered tier via Playwright → Phase 4 (conditional — only if Phase 2 research shows ≥1 firm requires it)

## Open Questions for Research Phase

1. Does 김앤장 expose RSS, HTML only, or require JS rendering?
2. Same for 광장, 세종, 율촌, 태평양, 화우, 바른.
3. Do all 12 candidate firms have permissive robots.txt for the newsletter/insights path?
4. Do US/UK firms with RSS expose full body in RSS or only teaser (like Cooley Go)? If full body → body fetch becomes optional for that firm.
5. What's the typical publishing cadence per firm? (Informs expectation management — silent weeks are normal for some.)
6. Is there any firm that truly needs JS rendering today? (If zero, Phase 4 becomes skip.)

## Post-Research Decisions (Locked by User 2026-04-17)

Research completed 2026-04-17. Empirical audit of 12 candidates + 2 backups revealed 5 firms are JS-rendered SPAs (광장, 화우, 바른, Latham, Kirkland) — not shippable in Phase 2 without Playwright (Phase 4). User locked the following:

### D-P2-14 — Final firm list: Option A+B (9 live + 3 disabled placeholders)

**Live firms (9) shipped in Phase 2:**
- KR (5): `kim-chang` (김앤장), `shin-kim` (세종), `yulchon` (율촌), `bkl` (태평양), plus `logos` (로고스) as backup swap
- US (2): `cooley` (existing Phase 1), `skadden`
- UK (2): `clifford-chance`, `freshfields`

**Disabled placeholders (3, `enabled: false` in `config/firms.yaml` with "defer to Phase 4" comment):**
- `leeko` (광장), `yoonyang` (화우), `barun` (바른) — all JS-rendered

**Rationale:** 12-firm ROADMAP target cannot be met in Phase 2 without Playwright. Disabled entries keep config-shaped promise of 12 visible; Phase 4 (or further backup swaps) can re-enable. Latham and Kirkland are also JS-rendered but not included as placeholders because the backup pool already filled the US slot via Skadden.

### D-P2-15 — Zod schema extension for onclick-link firms (approved)

Extend `selectors` in `src/config/schema.ts` with two optional fields:
- `link_onclick_regex: string` — regex applied to `onclick` attribute
- `link_template: string` — URL template with `$1`, `$2` capture placeholders

Add refinement: each firm must have EITHER `selectors.link` OR (`selectors.link_onclick_regex` + `selectors.link_template`). This is what allows 김앤장 and 태평양 (both use `onclick="goDetail('id','sub')"` patterns) to ship live without JS rendering.

### D-P2-16 — URL canonicalization: extend TRACKING_PARAMS

Add `page`, `s_type`, `s_keyword` to `TRACKING_PARAMS` in `src/pipeline/canonicalize.ts`. Reason: 로고스 (ASP-based) uses these as pagination/search params, never as item identity. Keeping them in the URL would bloat state and risk false-new-item events if pagination values shift. Safe universally — these names are always ambient, never identifiers.

### D-P2-17 — Keyword filter defaults: empty across all firms

All 9 live firms ship with `include_keywords: []` and `exclude_keywords: []` (i.e., no filters). Reason: Gemini free tier has 250 RPD; 9 firms × ~2 new items/day = 18 calls/day = ~12× headroom. No need to pre-filter. Add filters reactively if a specific firm's feed proves noisy during first weeks of operation (e.g., Freshfields press-release noise — deferred to post-Phase-2 observation).

## Success Criteria (from ROADMAP.md — Phase 2)

1. Intentionally breaking one firm's selector still produces a digest for the remaining firms, with the failed firm listed in the email footer.
2. Tier dispatch works per firm from `config/firms.yaml`; Korean sites serving EUC-KR / CP949 decode correctly; relative URLs resolve to absolute before canonicalization.
3. Adding a brand-new firm to `config/firms.yaml` and running once bootstraps its seen-URL set (no back-catalog flood).
4. `include_keywords` / `exclude_keywords` filters match against item titles + summaries before Gemini summarization.
5. SMTP 5xx retries with backoff; 535 immediate fail with `GMAIL_AUTH_FAILURE` marker.

## Downstream Agent Directions

**For `gsd-phase-researcher`:**
- Empirical audit of all 12 candidate firms (per D-P2-01 list). Output: per-firm tier classification, RSS URL or HTML selector map, robots.txt verdict, backup-firm substitutions if any candidate fails the audit.
- Investigate cheerio 1.2 idioms for body-content extraction; confirm `iconv-lite` integration patterns for Node 22 fetch streams.
- Research `p-retry` v8 patterns for selective retry (only 5xx, not 535) — confirm API shape unchanged from Phase 1.

**For `gsd-planner`:**
- Plan the HTML tier as a new `src/scrapers/html.ts` sibling to `rss.ts`, sharing the `RawItem[]` contract.
- Plan `enrichWithBody()` as a new pipeline step between fetch and dedup, shared by both tiers.
- Plan per-firm plans AFTER the firm list is locked by research — don't pre-commit to "12 firm-specific plans" in case some firms drop from the list.
- Preserve Phase 1's TDD discipline for pure functions (body extractor, keyword filter, failure-footer composer).
