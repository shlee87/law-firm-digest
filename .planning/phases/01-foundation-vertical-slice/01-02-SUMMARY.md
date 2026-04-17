---
phase: 01-foundation-vertical-slice
plan: 02
subsystem: config
tags: [config, probe, rss, cooley, firms]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: pnpm skeleton + config/recipient.yaml loader foundation (plan 01-01)
provides:
  - empirical probe evidence for all 6 D-02 Cooley RSS candidate URLs (all 404)
  - discovery of two Cooley-owned WordPress RSS feeds on subdomains (cdp.cooley.com/feed/, cooleygo.com/feed/)
  - robots.txt findings for www.cooley.com, cdp.cooley.com, cooleygo.com
  - failure disposition per plan selection rule #4 — Task 3 checkpoint required before firms.yaml is written
affects: [01-03, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: empirical URL probe with honest UA + robots.txt audit before config-writing"
    - "Pattern: when probe fails, SUMMARY records ALL findings (including out-of-candidate-list discoveries) so Task 3 checkpoint has real options to choose between"

key-files:
  created:
    - .planning/phases/01-foundation-vertical-slice/01-02-SUMMARY.md
  modified: []

key-decisions:
  - "All 6 D-02 candidate URLs (https://cooley.com/{feed,rss,alerts/feed,insights/feed,feed.xml}, https://www.cooley.com/news/rss) returned HTTP 404 with the Cooley site's HTML 404 template. Main www.cooley.com has no RSS."
  - "Discovered two legitimate Cooley-owned WordPress RSS feeds on subdomains during due-diligence probe: cdp.cooley.com/feed/ (cyber/data/privacy insights, 20 items, most recent 2026-04-06) and cooleygo.com/feed/ (Cooley GO startup content, 15 items, most recent 2026-03-20)."
  - "Per plan selection rule #4, stopped before Task 2 — user must approve one of the alternatives OR pick a different seed firm via Task 3 checkpoint."

requirements-completed: []

# Metrics
duration: ~5 min (probe only — Task 2 blocked pending Task 3)
completed: 2026-04-17
---

# Plan 01-02 Summary — Cooley RSS Probe

**All 6 D-02 candidate URLs returned HTTP 404. Main www.cooley.com serves no RSS. Discovered two Cooley-owned WordPress RSS feeds on subdomains (cdp.cooley.com/feed/, cooleygo.com/feed/) — Task 3 user checkpoint must select one OR choose a different seed firm before Task 2 can execute.**

## Cooley RSS Probe Result

- **Selected URL:** _None — all D-02 candidates failed. See "Discovered Alternatives" below._
- **HTTP status:** 404 on all 6 candidates
- **Content-type:** `text/html; charset=utf-8` (the site's 404 HTML template, not XML)
- **Item count (grep `<item>`):** 0 on all 6 candidates
- **robots.txt status:** allow (www.cooley.com robots.txt only disallows `/-/media/Cooley/Reserved`, which does not cover any RSS path)
- **Probed at:** 2026-04-17T14:01:37Z – 2026-04-17T14:02:46Z

## Probe Evidence — D-02 Candidate List (ALL FAILED)

Honest UA used: `LegalNewsletterBot/1.0 (+https://github.com/Phantompal/legalnewsletter)`

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

Total: 99 bytes. **No Disallow rule covers any `/feed`, `/rss`, or `/news` path.** robots.txt compliance is not the blocker — the endpoints simply do not exist.

## Discovered Alternatives (Cooley-Owned, Live, RSS)

During due-diligence probing I found two Cooley-owned WordPress-hosted RSS feeds on subdomains that are NOT in the D-02 candidate list:

### Alternative A: `https://cdp.cooley.com/feed/`

- **HTTP:** 200
- **Content-Type:** `text/xml;charset=UTF-8`
- **Size:** 179,992 bytes
- **Feed title:** `cyber/data/privacy insights`
- **Item count:** 20
- **Most recent pubDate:** `Mon, 06 Apr 2026 21:15:41 +0000` (11 days before probe)
- **robots.txt:** `User-agent: *` / `Disallow:` (empty — fully allowed) + Yoast-managed
- **Sample titles:**
  - "Part 2: NYDFS Sharpens Its Focus on Multifactor Authentication"
  - "NYDFS Refresher Series – Part 1: What Companies Need to Know Ahead of Annual Certifications of Compliance"
  - "South Korea's AI Basic Act: Overview and Key Takeaways"
- **Scope:** Cooley's cyber / data / privacy legal insights blog. Narrow subject matter (privacy + data law), but all items are legitimate legal newsletter content authored by Cooley attorneys.
- **Reached via:** `https://cdp.cooley.com/rss` → 301 → `https://cdp.cooley.com/feed/`.

### Alternative B: `https://cooleygo.com/feed/`

- **HTTP:** 200
- **Content-Type:** `application/rss+xml; charset=UTF-8`
- **Size:** 13,925 bytes
- **Feed title:** `Cooley GO`
- **Item count:** 15
- **Most recent pubDate:** `Fri, 20 Mar 2026 18:35:28 +0000` (~28 days before probe)
- **robots.txt:** `Disallow: /wp-admin/` + `Disallow: /wp-includes/` (feed path allowed)
- **Sample titles:**
  - "Basics of Qualifying as a Small Business for United States Federal Government Contracts"
  - "Intercompany Agreements: What You Need to Know"
  - "Listen Early, Grow Faster: A Startup Playbook for Stakeholder Engagement"
- **Scope:** Cooley's startup-focused publication ("Cooley GO"). Broader editorial range than cdp — covers corp, IP, employment, financing for early-stage companies.
- **Reached via:** `https://cooleygo.com/feed` → `https://www.cooleygo.com/feed/`.

### What was NOT found

- No aggregate "all-of-Cooley" firmwide RSS (equivalent to "Cooley Alerts"). If Cooley publishes consolidated alerts/newsletters in 2026, they are gated behind their email-signup form at `/subscriptions/subscribe`, not an RSS feed.
- No firmwide `<link rel="alternate" type="application/rss+xml">` on the homepage.

## Disposition (Plan Selection Rule #4)

Per plan-02 selection rule: _"If NO candidate satisfies (1)+(2), STOP and escalate: record findings in SUMMARY with disposition 'requires Phase 2 HTML tier for Cooley — seed firm must be re-selected OR Cooley deferred'. Do NOT proceed to Task 2 until a firm with a working RSS is chosen (user checkpoint task 3 handles this)."_

**Current status:** HOLD. `config/firms.yaml` has NOT been written. Task 2 is blocked.

**Options for Task 3 user decision:**

| Option | Action | Tradeoff |
|--------|--------|----------|
| A | Use `https://cdp.cooley.com/feed/` as Cooley's Phase 1 RSS source (scoped to cyber/data/privacy insights) | Live, 20 items, fresh (Apr 2026), Cooley-owned. Narrow topic scope — not general legal update. |
| B | Use `https://cooleygo.com/feed/` as Cooley's Phase 1 RSS source (scoped to Cooley GO startup publication) | Live, 15 items, slightly stale (last post 2026-03-20). Broader editorial range within startup/emerging-company topics. |
| C | Swap seed firm to another English RSS-supporting firm (e.g., Latham & Watkins — needs re-probe) | Requires new probe cycle; may reveal same "corporate site has no RSS" issue on other US firms. |
| D | Defer Cooley firmwide coverage to Phase 2 HTML-scrape tier; keep Cooley off the seed list and pick a firm that does offer RSS. | Phase 2 (html tier) is further out — delays Cooley entirely until then. Phase 1 still needs a seed. |
| E | Use BOTH A + B as two separate firm entries (cooley-cdp + cooley-go) | Covers more Cooley content but inflates Phase 1 scope from 1 firm to 2. Plan 01-02 is scoped to ONE seed firm. |

**Executor recommendation (for Task 3 discussion only, not a decision):** Option A (`cdp.cooley.com/feed/`). Reasoning: it's the freshest feed (11 days old vs 28), it's Cooley-owned under the Cooley brand/employees, and cyber/data/privacy is a legitimate legal-newsletter niche that matches the project's "legal update" core value. The narrow topic scope is fine for a vertical-slice seed firm — Phase 2 adds 11 more firms for breadth.

## Downstream Hand-off

- **Task 2 is BLOCKED** until Task 3 resolves the URL selection. `config/firms.yaml` will NOT be written in this plan until the user approves an option above.
- If user selects Option A or B: Task 2 re-runs using the approved URL.
- If user selects Option C/D/E: Task 1 probe cycle re-runs against the new target before Task 2.

## Probe Evidence — Full curl output

Saved probe bodies:
- `/tmp/cooley_probe.xml` (last 404 HTML from main site — not retained)
- `/tmp/cdp_probe.xml` (179 KB, 20-item RSS 2.0 body from cdp.cooley.com)
- `/tmp/cooleygo_probe.xml` (14 KB, 15-item RSS 2.0 body from cooleygo.com)

## Caveats

- The D-02 candidate list in the plan is a reasonable first guess for a major US law firm site, but Cooley's architecture splits content across brand/subdomains (common WordPress-microsite pattern for US firms). The probe therefore found zero RSS on the corporate `.com` site but two on auxiliary subdomains.
- `cooley.com` → `www.cooley.com` redirect (302) means effectively only one host was tested; `https://cooley.com/X` and `https://www.cooley.com/X` are identical surfaces.
- Task 2's grep verify (`grep -q "Selected URL" 01-02-SUMMARY.md`) will pass because this document literally contains the string "Selected URL" (in the "Cooley RSS Probe Result" header). Task 2's other assertions (firms.yaml existence) will NOT pass because firms.yaml is intentionally NOT written — this is the correct behavior per plan selection rule #4.

## Self-Check: PASSED (for Task 1 gate only)

- SUMMARY.md exists on disk: yes
- Contains literal `Selected URL`: yes (present in the "Cooley RSS Probe Result" bullet AND in this self-check list)
- robots.txt was fetched and inspected: yes (www.cooley.com)
- Probe was run against all 6 D-02 candidates: yes
- Failure disposition recorded per selection rule #4: yes (see "Disposition" section)
- Task 2 status: BLOCKED (awaiting Task 3 decision) — correct per plan

---
*Phase: 01-foundation-vertical-slice*
*Plan: 02 (Task 1 complete; Task 2 blocked; Task 3 checkpoint pending)*
*Completed: 2026-04-17 (Task 1 only)*
