---
phase: 01-foundation-vertical-slice
plan: 01
subsystem: infra
tags: [pnpm, typescript, vitest, eslint, prettier, nodemailer, gemini, yaml, zod, esm, scaffold]

# Dependency graph
requires: []
provides:
  - working pnpm project skeleton with type=module (ESM) and packageManager pin
  - Node 22 LTS + TS 5.9 + vitest 4 + eslint 9 flat config + prettier 3
  - Phase 1 runtime deps installed and locked (@google/genai 1.50.1, nodemailer 8.0.5, feedparser 2.3.1, yaml 2.8.3, zod 4.3.6, p-limit 7.3.0, p-retry 8.0.0, date-fns-tz 3.2.0)
  - `.env.example` template and `.gitignore` hardening (secrets + state backups)
  - `config/recipient.yaml` locked to sarakim1705@gmail.com with RECIPIENT_EMAIL env override hook
  - `README.md` with Setup, DRY_RUN semantics, GMAIL_AUTH_FAILURE recovery, copyright + compliance, Secrets
  - `packageManager: pnpm@9.15.0` pin for deterministic GHA setup-node@v6 cache
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12]

# Tech tracking
tech-stack:
  added:
    - pnpm@9.15.0 (package manager, pinned)
    - typescript@5.9.3 (via ^5.7 range; actual install resolved 5.9)
    - tsx@4.21.0 (runs TS source directly; no build step)
    - vitest@4.1.4 (test runner, ESM-native)
    - eslint@9.39.4 + typescript-eslint@8.58.2 (flat config)
    - prettier@3.8.3
    - "@google/genai@1.50.1 (GA Gemini SDK; NOT the deprecated @google/generative-ai)"
    - nodemailer@8.0.5 (Gmail SMTP + App Password)
    - feedparser@2.3.1 (RSS; chosen over unmaintained rss-parser)
    - yaml@2.8.3 (eemeli/yaml; preserves comments round-trip)
    - zod@4.3.6 (config validation)
    - p-limit@7.3.0 + p-retry@8.0.0 (concurrency cap + transient-failure retry)
    - date-fns-tz@3.2.0 (KST / PT / GMT timezone math)
    - dotenv@16.6.1 (dev-only local .env loader)
  patterns:
    - "ESM-first module resolution (NodeNext) with tsx run-from-source"
    - "Runtime deps pinned by major via ^; lockfile pins exact resolution"
    - "packageManager field + pnpm-lock.yaml drive reproducible installs in CI"
    - "Single .env.example template; real .env stays local-only (git-ignored)"
    - "Config file + env override pattern (recipient.yaml + RECIPIENT_EMAIL)"

key-files:
  created:
    - package.json
    - pnpm-lock.yaml
    - tsconfig.json
    - vitest.config.ts
    - eslint.config.js
    - .prettierrc
    - .env.example
    - .gitignore
    - config/recipient.yaml
    - README.md
    - src/placeholder.ts
  modified: []

key-decisions:
  - "Pinned packageManager to pnpm@9.15.0 (W3 revision): setup-node@v6 cache:'pnpm' reads this field to resolve binary + compute cache key; without it the pnpm/action-setup + setup-node resolution order can drift and flake"
  - "Installed pnpm directly via `npm install -g pnpm@9.15.0` instead of using corepack: corepack 0.30.0 (bundled with Node 23.6.1 on this host) fails signature verification when fetching latest pnpm, blocking any pnpm invocation through the shim. Direct global install bypasses the shim entirely"
  - "Added transient `src/placeholder.ts` to satisfy tsc: tsconfig.json include globs `src/**/*` and `test/**/*` match zero files on a greenfield tree, causing tsc 5.9 to emit TS18003. The plan asserted typecheck would pass trivially with noEmit; in practice it does not. Placeholder is a no-op ESM export and will be removed when plan 01-02 lands real src modules"
  - "Added `passWithNoTests: true` to vitest.config.ts: vitest 4 exits 0 by default on no-match (observed), but the flag makes this guarantee explicit and survives a future vitest upgrade"
  - "Kept ESLint flat config minimal (only @eslint/js recommended + typescript-eslint recommended + ignores list) per plan direction `// keep it minimal — no custom rules`"

patterns-established:
  - "Pattern: pnpm-only workflow. All scripts (dev, dry-run, test, typecheck) go through pnpm. No npm run calls leak into docs or CI."
  - "Pattern: greenfield placeholder. When a tsconfig include glob has zero matches on a fresh tree, add one named-by-purpose placeholder file and document its removal in the next plan that introduces real source."
  - "Pattern: env overrides YAML. For any config value a deployer might want to patch without a code commit (recipient, from-address, dry-run), provide both a YAML default and a UPPERCASE_ENV override; the loader resolves env-first."
  - "Pattern: grep-testable README markers. Required operational strings (`GMAIL_AUTH_FAILURE`, `LegalNewsletterBot/1.0`, `myaccount.google.com/apppasswords`, `DRY_RUN`) are embedded verbatim so plan acceptance and future audits can verify with grep."

requirements-completed:
  - CONF-03
  - OPS-10
  - COMP-01
  - COMP-02
  - COMP-04
  - COMP-05

# Metrics
duration: ~15 min
completed: 2026-04-17
---

# Phase 01 Plan 01: foundation-vertical-slice scaffold Summary

**Node 22 ESM TypeScript project skeleton with pnpm 9.15.0 pin, pinned runtime deps for RSS + Gemini + Gmail, recipient config locked to sarakim1705@gmail.com, and README documenting DRY_RUN and GMAIL_AUTH_FAILURE recovery.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T13:40:00Z (approximate — within this session)
- **Completed:** 2026-04-17T13:57:46Z
- **Tasks:** 3
- **Files created:** 11
- **Commits:** 3 task commits

## Accomplishments

- `pnpm install --frozen-lockfile` succeeds from a clean checkout; `pnpm typecheck` and `pnpm test` both exit 0 on the empty skeleton.
- All eight Phase 1 runtime dependencies pinned to the exact versions RESEARCH.md verified on 2026-04-17 — no unexpected drift, no disallowed packages (`cheerio`, `playwright`, `@google/generative-ai`, `rss-parser`, `js-yaml` confirmed absent).
- `packageManager: pnpm@9.15.0` committed (W3 revision) so downstream plan 01-12 (GHA daily workflow) can use `actions/setup-node@v6` with `cache: 'pnpm'` without flakiness.
- `config/recipient.yaml` locks the digest recipient and documents the `RECIPIENT_EMAIL` env override (D-05) in the file header in Korean.
- `README.md` captures every piece of Phase 1 operational knowledge that a future-me would want at 3am when Gmail revokes the App Password — the exact `GMAIL_AUTH_FAILURE` marker string, the apppasswords URL, the DRY_RUN contract, and the COMP-05 copyright/compliance note.

## Task Commits

1. **Task 1: Create pnpm package.json with ESM + pinned deps + scripts + packageManager pin** — `fc836e6` (chore)
2. **Task 2: Configure TypeScript + Vitest + ESLint + Prettier** — `85309b3` (chore)
3. **Task 3: Author .env.example, append to .gitignore, write config/recipient.yaml, write README** — `16952e4` (docs)

## Files Created/Modified

- `package.json` — pnpm manifest, type=module, packageManager pin, scripts (dev / dry-run / test / typecheck), all Phase 1 deps.
- `pnpm-lock.yaml` — 2,509 lines; deterministic resolution of 223 packages.
- `tsconfig.json` — TS 5.7 strict + NodeNext ESM + noEmit.
- `vitest.config.ts` — test/**/*.test.ts glob + passWithNoTests.
- `eslint.config.js` — flat config: @eslint/js recommended + typescript-eslint recommended + project ignores.
- `.prettierrc` — singleQuote, semi, trailingComma=all, printWidth=100.
- `.env.example` — GEMINI_API_KEY, GMAIL_APP_PASSWORD required; RECIPIENT_EMAIL / GMAIL_FROM_ADDRESS / DRY_RUN optional.
- `.gitignore` — newly tracked; keeps `.env`, `node_modules/`, IDE noise, `.claude/`, `.opencode/`, `.agents/` ignored; adds `state/seen.json.{tmp,backup}`.
- `config/recipient.yaml` — `recipient: sarakim1705@gmail.com` with Korean comment explaining D-05 env override.
- `README.md` — setup, DRY_RUN, adding a firm, GMAIL_AUTH_FAILURE recovery, copyright + compliance, secrets.
- `src/placeholder.ts` — transient stub so tsc include glob matches at least one file; removed in plan 01-02.

## Decisions Made

Documented inline in the frontmatter `key-decisions` block above. Summary:

1. **packageManager pinned to pnpm@9.15.0** (plan-directed W3 revision).
2. **pnpm installed via `npm install -g`**, bypassing corepack 0.30.0 signature-verification bug on Node 23.6.1. This is a host-environment workaround; CI via `setup-node@v6` + `pnpm/action-setup@v4` is unaffected because it installs pnpm directly.
3. **Added `src/placeholder.ts`** to prevent TS18003 on greenfield tree. Explicitly documented for removal in plan 01-02.
4. **Added `passWithNoTests: true`** to vitest config as explicit future-proofing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corepack shim cannot download pnpm due to signature-verification error**

- **Found during:** Task 1 pre-flight (`pnpm --version` failed)
- **Issue:** `/opt/homebrew/bin/pnpm` symlinks into `corepack/dist/pnpm.js`. Corepack 0.30.0 (bundled with the host's Node 23.6.1) throws `Cannot find matching keyid: …` when fetching latest pnpm — a known signature-verification regression in this corepack version. Every `pnpm` invocation fails before even reading `package.json`.
- **Fix:** Installed pnpm 9.15.0 directly via `npm install -g pnpm@9.15.0`, which writes a real `/opt/homebrew/bin/pnpm` shim that points at the npm-installed copy (npm global dir takes precedence over the corepack shim on PATH lookup order here).
- **Files modified:** None (host-level npm global install only; no repo files touched)
- **Verification:** `pnpm --version` now prints `9.15.0` cleanly.
- **Committed in:** N/A (host-level fix, not a repo change)

**2. [Rule 3 - Blocking] Added `src/placeholder.ts` to prevent TS18003 on empty src tree**

- **Found during:** Task 2 (`pnpm typecheck` failed with `error TS18003: No inputs were found in config file`)
- **Issue:** `tsconfig.json` has `"include": ["src/**/*", "test/**/*"]`, but on a greenfield tree neither directory exists. tsc 5.9 treats zero matches as an error, not a warning. The plan's acceptance criterion asserts `pnpm typecheck exits 0 (no src files yet — should pass trivially with noEmit: true)` — this assumption is incorrect for tsc 5.x.
- **Fix:** Created `src/placeholder.ts` containing `export {};` with an inline comment explaining its transient purpose and removal trigger (plan 01-02 landing real modules). File is a no-op at runtime.
- **Files modified:** `src/placeholder.ts` (new)
- **Verification:** `pnpm typecheck` exits 0; `pnpm test` still reports "No test files found, exiting with code 0" (vitest has `passWithNoTests: true`).
- **Committed in:** `85309b3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking)
**Impact on plan:** Neither affects the plan's acceptance surface or downstream plans. Deviation 1 is a local-host workaround; deviation 2 is a small, named, transient file that plan 01-02 will remove.

## Issues Encountered

- Initial `pnpm --version` failed with a corepack signature-verification error. Documented above as Deviation 1.
- Initial `pnpm typecheck` failed with TS18003. Documented above as Deviation 2.
- No other issues.

## User Setup Required

None at plan close. Future local runs will require:

- Copy `.env.example` to `.env`
- Fill `GEMINI_API_KEY` (from Google AI Studio) and `GMAIL_APP_PASSWORD` (from https://myaccount.google.com/apppasswords)
- CI setup (GitHub Actions Secrets) lands in plan 01-12; no CI action needed now.

## Known Stubs

- `src/placeholder.ts` — transient, explicitly tracked in the deviation section. Plan 01-02 will remove this once `src/types.ts`, `src/env.ts`, and `src/util/logging.ts` land.

No other stubs, placeholders, or hardcoded empty UI-facing values exist — this plan created no UI and no data-flowing surfaces.

## Next Phase Readiness

All downstream plans in Phase 01 (01-02 through 01-12) can now assume:

- `pnpm install --frozen-lockfile` works
- `pnpm dev`, `pnpm dry-run`, `pnpm test`, `pnpm typecheck` are all registered and functional
- `@google/genai`, `nodemailer`, `feedparser`, `yaml`, `zod`, `p-limit`, `p-retry`, `date-fns-tz` are resolvable
- `config/recipient.yaml` exists and is parseable
- `.env.example` documents the required + optional env vars
- `README.md` provides the human-facing operational contract
- `packageManager: pnpm@9.15.0` will let plan 01-12 use `actions/setup-node@v6` with `cache: 'pnpm'` without extra workaround

No blockers carried forward. The corepack issue is localized to this development host and does not affect CI.

## Self-Check: PASSED

All 11 files claimed as created exist on disk. All 3 task commits (`fc836e6`, `85309b3`, `16952e4`) are present in `git log`. Automated verification (`pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`) all exit 0. `git ls-files` does not contain `.env`. No stubs beyond the explicitly-documented transient `src/placeholder.ts`.

---
*Phase: 01-foundation-vertical-slice*
*Plan: 01*
*Completed: 2026-04-17*
