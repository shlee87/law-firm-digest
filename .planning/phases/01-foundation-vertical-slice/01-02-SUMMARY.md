---
phase: 01-foundation-vertical-slice
plan: 02
subsystem: config
tags: [config, probe, rss, cooley, firms, checkpoint-resolved]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: pnpm skeleton + config/recipient.yaml loader foundation (plan 01-01)
provides:
  - config/firms.yaml with empirically confirmed Cooley RSS URL (cooleygo.com/feed/)
  - empirical probe evidence for all 6 D-02 Cooley RSS candidate URLs (all 404 against www.cooley.com)
  - discovery + audit of two Cooley-owned WordPress RSS feeds on subdomains (cdp.cooley.com/feed/, cooleygo.com/feed/)
  - robots.txt findings for www.cooley.com, cdp.cooley.com, cooleygo.com
  - non-dev-friendly Korean comment template for Phase 2 firm additions (CONF-07)
affects: [01-03, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: empirical URL probe with honest UA + robots.txt audit before config-writing"
    - "Pattern: when D-02 candidate list fails, SUMMARY records ALL findings (including out-of-candidate-list discoveries) so Task 3 checkpoint has real options to choose between"
    - "Pattern: keep canonical slug ('cooley') stable as state key even when seed URL is on a subdomain (cooleygo.com), so Phase 2 can introduce additional Cooley entries without colliding on the existing key"

key-files:
  created:
    - config/firms.yaml
    - .planning/phases/01-foundation-vertical-slice/01-02-SUMMARY.md
  modified: []

key-decisions:
  - "All 6 D-02 candidate URLs (https://cooley.com/{feed,rss,alerts/feed,insights/feed,feed.xml}, https://www.cooley.com/news/rss) returned HTTP 404 with the Cooley site's HTML 404 template. Main www.cooley.com has no RSS."
  - "Discovered two legitimate Cooley-owned WordPress RSS feeds on subdomains during due-diligence probe: cdp.cooley.com/feed/ (cyber/data/privacy insights, 20 items, most recent 2026-04-06) and cooleygo.com/feed/ (Cooley GO startup content, 15 items, most recent 2026-03-20)."
  - "User selected Option B — https://cooleygo.com/feed/ — as Phase 1 seed URL. Broader editorial range (corp/IP/startups) preferred over cdp.cooley.com narrower cyber/data/privacy scope."
  - "Canonical firm id 'cooley' retained in firms.yaml even though feed lives on cooleygo.com subdomain. Phase 2 can add a separate entry (e.g., 'cooley-main' on HTML tier) without migrating the state key."

requirements-completed: [CONF-01, CONF-02, CONF-05, CONF-07]

# Metrics
duration: ~10 min total (Task 1 probe ~5 min + Task 2 write + Task 3 metadata)
completed: 2026-04-17
---

# Plan 01-02 Summary — Cooley RSS Probe + firms.yaml Seeded

**Status:** Complete. `config/firms.yaml` is written with user-approved `https://cooleygo.com/feed/` (Option B) as Phase 1 seed URL. Main `www.cooley.com` serves no RSS (all 6 D-02 candidates returned HTTP 404) — Cooley GO subdomain is the only Cooley-owned RSS source suitable for the vertical slice.

## Cooley RSS Probe Result

- **Selected URL:** `https://cooleygo.com/feed/` (Cooley GO — startup/corp/IP publication)
- **HTTP status:** 200
- **Content-type:** `application/rss+xml; charset=UTF-8`
- **Item count:** 15 (`<item>` elements in RSS 2.0 body)
- **robots.txt status:** allow (`Disallow: /wp-admin/` + `/wp-includes/` only; feed path allowed)
- **Most recent pubDate:** `Fri, 20 Mar 2026 18:35:28 +0000`
- **Feed title:** `Cooley GO`
- **Probed at:** 2026-04-17T14:01:37Z – 2026-04-17T14:02:46Z
- **User approved (Task 3):** 2026-04-17 (Option B)

## User Decision (Task 3 Checkpoint)

Presented options to user after Task 1 probe revealed all D-02 candidates had failed:

| Option | URL | User Decision |
|--------|-----|---------------|
| A | `https://cdp.cooley.com/feed/` (cyber/data/privacy) | Not selected |
| **B** | **`https://cooleygo.com/feed/` (Cooley GO startups)** | **APPROVED** |
| C | Swap seed to another firm (e.g., Latham) | Not selected |
| D | Defer Cooley to Phase 2 HTML tier | Not selected |
| E | Use both A + B as two entries | Not selected (inflates Phase 1 scope) |

**Rationale for Option B:** Broader editorial range (corp, IP, employment, financing for early-stage companies) better matches the "legal update digest" core value than the narrower cyber/data/privacy scope of cdp.cooley.com. Feed is slightly staler (28 days vs 11 days at probe time) but Cooley GO publishes less frequently by design — staleness here is editorial cadence, not broken pipeline.

**Canonical slug decision:** Keep `id: cooley` in firms.yaml even though the feed lives on `cooleygo.com`. Rationale:
- `id` is a state-storage key (DEDUP-07) — changing it later would cause duplicate email sends.
- Cooley brands cooleygo.com as part of Cooley's publishing surface, not a separate entity.
- Phase 2 can introduce a second entry (e.g., `cooley-main` via HTML scrape of www.cooley.com/news) using a distinct id without collision.

## Probe Evidence — D-02 Candidate List (ALL FAILED)

Honest UA used: `LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)`

| # | Candidate URL | HTTP | Content-Type | Body | Verdict |
|---|---------------|------|--------------|------|---------|
| 1 | https://cooley.com/feed | 404 | text/html | 404 HTML page | FAIL |
| 2 | https://cooley.com/rss | 404 | text/html | 404 HTML page | FAIL |
| 3 | https://cooley.com/alerts/feed | 404 | text/html | 404 HTML page | FAIL |
| 4 | https://cooley.com/insights/feed | 404 | text/html | 404 HTML page | FAIL |
| 5 | https://cooley.com/feed.xml | 404 | text/html | 404 HTML page | FAIL |
| 6 | https://www.cooley.com/news/rss | 404 | text/html | 404 HTML page | FAIL |

Note: cooley.com redirects (302) to www.cooley.com automatically; all six candidates landed on the same site's canonical 404 HTML template (`data-page-id="8bc0a1e4f7304e88b3752c0dffb6db43"`, 32,564 bytes).

### Supplementary probes (out-of-candidate-list, run for completeness)

| URL | HTTP | Notes |
|-----|------|-------|
| https://www.cooley.com/news.rss | 404 | — |
| https://www.cooley.com/insights.rss | 404 | — |
| https://www.cooley.com/alerts.rss | 404 | — |
| https://www.cooley.com/news/feed.xml | 404 | — |
| https://www.cooley.com/insights/feed.xml | 404 | — |
| https://www.cooley.com/newsroom/feed | 404 | — |
| https://www.cooley.com/blog/feed | 404 | — |
| https://feeds.feedburner.com/cooley | 404 | — |
| https://www.cooley.com/api/rss | 404 | — |

**Conclusion:** `www.cooley.com` (the main corporate site) does not expose ANY RSS feed. Neither the homepage HTML nor the sitemap advertises one via `<link rel="alternate" type="application/rss+xml">`.

## robots.txt Evidence

### www.cooley.com/robots.txt (redirect target from cooley.com)

```
User-agent: *
Disallow: /-/media/Cooley/Reserved

Sitemap: https://www.cooley.com/sitemap.xml
```

Total: 99 bytes. **No Disallow rule covers any `/feed`, `/rss`, or `/news` path.** robots.txt compliance was not the blocker on the main site — the endpoints simply do not exist.

### cooleygo.com/robots.txt (selected URL host)

```
User-agent: *
Disallow: /wp-admin/
Disallow: /wp-includes/
...
```

**Feed path `/feed/` is NOT in any `Disallow:` block for `User-agent: *`** → scraping this URL complies with COMP-03 / Pitfall #9.

## Alternative Considered — `https://cdp.cooley.com/feed/`

- **HTTP:** 200, **Content-Type:** `text/xml;charset=UTF-8`, **Size:** 179,992 bytes
- **Feed title:** `cyber/data/privacy insights`
- **Item count:** 20, **Most recent pubDate:** 2026-04-06 (11 days before probe)
- **Sample titles:** "Part 2: NYDFS Sharpens Its Focus on Multifactor Authentication"; "South Korea's AI Basic Act: Overview and Key Takeaways"
- **Scope:** Cooley's cyber/data/privacy legal insights blog — narrower subject matter, authored by Cooley attorneys.
- **Rejected:** User preferred Option B's broader editorial range over Option A's narrower privacy-law focus.

## Sample Titles from Selected Feed (`cooleygo.com/feed/`)

1. Basics of Qualifying as a Small Business for United States Federal Government Contracts
2. Intercompany Agreements: What You Need to Know
3. Listen Early, Grow Faster: A Startup Playbook for Stakeholder Engagement

## Downstream Hand-off

- **Plan 01-03:** zod `FirmSchema` must accept this firms.yaml shape (id, name, language, type, url, timezone, enabled). No selectors/user_agent/timeout_ms fields — must be optional in schema.
- **Plan 01-05:** `rss.ts` scraper consumes `firm.url` → feedparser stream. Honest UA from probe must match the one configured in the fetch orchestrator.
- **Plan 01-11:** main composition root iterates the `firms:` array; Phase 1 has exactly one entry to process.
- **Phase 2 firm additions:** non-developer can copy the Cooley block and paste with new `id:`, follow the Korean comment block for field meanings.

## Caveats

- Selected feed `cooleygo.com/feed/` is Cooley's startup/corp/IP WordPress publication, NOT the firm's main corporate newsletter. User explicitly accepted this scoping as acceptable for the Phase 1 vertical slice (adding more Cooley coverage is Phase 2's job via HTML scraping of www.cooley.com/news).
- Feed is ~28 days old at probe time (most recent item 2026-03-20). This reflects Cooley GO's editorial cadence, not pipeline breakage. If the feed is still ~28+ days stale by Phase 3 staleness checks, OPS-05 will surface it as a staleness warning in the digest — working as designed.
- D-02's candidate list assumed Cooley followed the generic US-firm RSS-at-root pattern; it did not. This is a data point for Phase 2's empirical audit — other target firms (Latham, Clifford Chance) may split content across subdomains similarly.

## Probe Evidence — Saved Artifacts (local tmp only, not committed)

- `/tmp/cooley_probe.xml` — final 404 HTML from www.cooley.com probe
- `/tmp/cdp_probe.xml` — 179 KB, 20-item RSS 2.0 body from cdp.cooley.com
- `/tmp/cooleygo_probe.xml` — 14 KB, 15-item RSS 2.0 body from cooleygo.com

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 (probe + SUMMARY v1) | `d5f8f0c` | docs(01-02): probe Cooley RSS endpoints, record failure disposition |
| 2 (firms.yaml) | `d37e08d` | feat(01-02): seed config/firms.yaml with Cooley GO RSS (Option B) |
| 3 (finalize SUMMARY + metadata) | pending (this commit) | docs(01-02): finalize SUMMARY + update STATE/ROADMAP |

## Deviations from Plan

**None of the Rule 1–3 deviation categories fired.** The plan's selection rule #4 explicitly anticipated the "no candidate passes" branch and routed it to the Task 3 checkpoint — this is in-plan flow, not a deviation.

**Plan-internal branch taken:** Task 2 was executed AFTER Task 3 checkpoint resolution (not before, as the happy path would have). This matches plan selection rule #4 + Task 3 branch (B) — "URL returns 200 but the feed is from a different surface than D-02 anticipated → user approves alternative → Task 2 re-runs with new URL". No escalation beyond the plan was needed.

## Self-Check

- [x] `config/firms.yaml` exists on disk
- [x] `config/firms.yaml` contains `id: cooley`
- [x] `config/firms.yaml` contains `type: rss`
- [x] `config/firms.yaml` contains `timezone: America/Los_Angeles`
- [x] `config/firms.yaml` contains `enabled: true`
- [x] `config/firms.yaml` URL matches regex `url: https?://[a-zA-Z0-9./-]*cooley` → `url: https://cooleygo.com/feed/`
- [x] `config/firms.yaml` header has Korean `로펌` marker (CONF-07)
- [x] `config/firms.yaml` does NOT contain `selectors:`, `user_agent:`, `timeout_ms:` (RSS tier)
- [x] YAML parses cleanly (verified via `yaml.parse` — all 7 required fields present, url is absolute)
- [x] Commit `d5f8f0c` exists for Task 1
- [x] Commit `d37e08d` exists for Task 2
- [x] SUMMARY contains literal `Selected URL` (Task 1 W4 hand-off contract)
- [x] User decision (Option B) recorded with rationale

## Self-Check: PASSED

---
*Phase: 01-foundation-vertical-slice*
*Plan: 02 — complete (all 3 tasks resolved; checkpoint Task 3 approved by user)*
*Completed: 2026-04-17*
