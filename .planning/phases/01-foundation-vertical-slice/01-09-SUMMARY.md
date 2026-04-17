---
phase: 01-foundation-vertical-slice
plan: 09
subsystem: mailer
tags: [mailer, gmail, smtp, nodemailer, fail-loud, dry-run, app-password]

# Dependency graph
requires:
  - phase: 01-foundation-vertical-slice
    provides: pnpm skeleton + pinned nodemailer 8.0.5 (plan 01-01)
  - phase: 01-foundation-vertical-slice
    provides: EmailPayload type + isDryRun() + scrubSecrets helper (plan 01-03)
provides:
  - "src/mailer/gmail.ts: sendMail(payload) — DRY_RUN-aware (OPS-06 check site #1), fail-loud (EMAIL-06), 535-detecting (Pitfall 7/14) Gmail SMTP boundary"
affects: [01-10, 01-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-boundary email transport — the only file that imports nodemailer and touches SMTP network I/O. Plan 11 main.ts imports sendMail and nothing else from this directory"
    - "DRY_RUN-first short-circuit — the isDryRun() check is the FIRST executable statement in sendMail; no transporter construction, no credential read, no network call when DRY_RUN=1. Composes with plan 10's writer to form the two authorized DRY_RUN check sites (Pattern 2)"
    - "Fail-loud invariant enforced by grep — exactly one `catch (` token in the file; every path through that catch ends in throw. Any future silent-swallow catch block would fail the W2 grep gate at plan-check time, not at 3am when an SMTP 5xx slips through silently"
    - "Defensive dual-field 535 detection — `responseCode === 535 || response.includes('535')`; survives a nodemailer minor-version field rename without losing the operator recovery marker (A4)"
    - "Secret scrubbing on every error surface — the only string passed to the thrown Error runs through scrubSecrets, so a rare nodemailer error that echoes the App Password into `err.message` cannot leak via GHA workflow logs"

key-files:
  created:
    - src/mailer/gmail.ts
  modified: []

key-decisions:
  - "Dual-path 535 detection (responseCode === 535 OR response.includes('535')) rather than a single-field check — nodemailer 8.x exposes the field as `responseCode`, but a future minor release renaming to `code` or shifting content into `response` would silently lose the GMAIL_AUTH_FAILURE marker. Plan `A4 note` mandated the defensive version; kept exactly as specified."
  - "Header comment had to be reworded to remove literal `catch (` substrings that would trip the W2 grep gate. Replaced `EXACTLY ONE catch (…)` with `EXACTLY ONE error-catching block` and `counting catch ( tokens` with `counting catch-open tokens`. The gate is a static plan-check instrument — semantically describing the invariant must not trigger it."
  - "`as` narrowing via `{ responseCode?: number; response?: string; message?: string }` type assertion on the caught value rather than `catch (err: any)` — unblocks typecheck under strict config without abandoning the type discipline for a single defensive block. Functionally equivalent, typecheck-clean."
  - "`isDryRun()` is called exactly once in this file (line 27), and the file is the sole importer of isDryRun from env.js in this plan's drop. The plan 03 SUMMARY predicts `grep -rn isDryRun src/` rises from 1 → 2 distinct files when this plan lands and → 3 once plan 10 ships; confirmed below in the verification table."
  - "`text:` field deliberately absent from sendMail arguments per D-08. EmailPayload has no `text` field and nodemailer's sendMail accepts html-only. A future phase 2 D-08 revisit (plaintext multipart) would require adding the field in types.ts first, then here — forcing the contract conversation before implementation."

patterns-established:
  - "Mailer transport boundary pattern — any future email channel (Resend, SES fallback) lives in a sibling file under src/mailer/, exports the same sendMail(payload): Promise<void> shape, and is chosen by plan 11 main.ts at call time. Adding a channel never requires changing callers"
  - "W2 grep-enforced invariants — when an acceptance criterion counts a regex over source, header comments must be written to avoid accidental matches on the token being counted. This pattern (rewording documentation to avoid triggering its own static gate) generalizes to any future file that documents an invariant the plan grep-tests"

requirements-completed:
  - EMAIL-03
  - EMAIL-06
  - OPS-06

# Metrics
duration: ~2 min
completed: 2026-04-17
---

# Phase 01 Plan 09: Gmail SMTP Mailer Boundary Summary

**Single-file nodemailer Gmail SMTP boundary with DRY_RUN short-circuit, fail-loud error propagation, and explicit 535-auth-failure recovery marker — the sole outbound-email surface in the Phase 1 pipeline, gated by a W2 grep invariant that counts exactly one `catch (` token.**

## Performance

- **Duration:** ~2 min (133 seconds wall-clock from plan start to task commit)
- **Started:** 2026-04-17T15:32:55Z
- **Completed:** 2026-04-17T15:35:08Z
- **Tasks:** 1
- **Files created:** 1 (`src/mailer/gmail.ts`, 65 LoC)
- **Commits:** 1 task commit

## Accomplishments

- `src/mailer/gmail.ts` lands as the single-file Gmail SMTP boundary; `pnpm typecheck` exits 0, `pnpm test` exits 0 (29 prior tests unchanged — no new tests in this plan per the plan's explicit "별도 유닛 테스트 파일 없음" directive).
- The DRY_RUN gate (`if (isDryRun()) { console.log(...); return; }`) is the first executable statement in the function body — confirmed by grep line-order: `isDryRun()` at line 27, `createTransport` at line 33. OPS-06 DRY_RUN check site #1 of 2 now established (site #2 is plan 10's state writer).
- Dual-field 535 detection (`err.responseCode === 535 || err.response?.includes('535')`) surfaces the `GMAIL_AUTH_FAILURE` literal marker plus the exact regenerate URL `https://myaccount.google.com/apppasswords` before every rethrow — operators can grep workflow logs for the marker and immediately know to rotate the App Password secret (Pitfall 7 + Pitfall 14 operator recovery).
- The catch block unconditionally rethrows as `new Error('SMTP send failed: ...')` with `scrubSecrets` applied to the underlying message — any future SMTP failure becomes a GHA red-X by design (EMAIL-06 fail-loud; Pitfall 6 silent-swallow explicitly blocked by the W2 grep gate).
- W2 invariant enforced: `grep -cE 'catch \(' src/mailer/gmail.ts` = **1**. Any future silent-recovery catch block would fail this gate statically at plan check time.

## Files Created

### src/mailer/gmail.ts (65 lines)

One export: `sendMail(payload: EmailPayload): Promise<void>`.

Three imports:
- `nodemailer` (default import) — only file in the codebase that imports nodemailer.
- `{ isDryRun }` from `../env.js` — the sanctioned single-site DRY_RUN check per Pattern 2.
- `{ scrubSecrets }` from `../util/logging.js` — applied to error message before throwing so embedded App Password bytes are redacted in GHA logs.
- `type { EmailPayload }` from `../types.js` — canonical contract (plan 03), not redeclared locally.

Execution path:

1. **DRY_RUN short-circuit (lines 27–31):** logs `[DRY_RUN] Subject:` + `[DRY_RUN] HTML body:` and returns. No transporter construction, no credential read, no network call. Verified below.
2. **Transporter construction (lines 33–39):** `nodemailer.createTransport({ service: 'Gmail', auth: { user: payload.from, pass: process.env.GMAIL_APP_PASSWORD } })`. Context7 `/nodemailer/nodemailer` confirms the `service: 'Gmail'` shortcut is still supported in 8.x (see "Context7 verification" below).
3. **Send (lines 41–47):** `transporter.sendMail({ from, to, subject, html })` — no `text:` field, no `attachments:`, per D-08 HTML-only decision carried from plan 08 composer output.
4. **Fail-loud catch (lines 48–64):** single block — dual 535 check, recovery logging when auth failure detected, unconditional `throw new Error('SMTP send failed: ${scrubSecrets(msg)}')`.

## Task Commits

| Task | Hash      | Message |
|------|-----------|---------|
| 1: create src/mailer/gmail.ts with DRY_RUN + fail-loud + 535 detection | `e1cdc06` | feat(01-09): add Gmail SMTP mailer with DRY_RUN gate + fail-loud 535 handling |

## Context7 Verification (nodemailer 8.x API)

Per the plan's output requirement: confirm nodemailer 8.x still supports `service: 'Gmail'` shortcut.

Context7 `/nodemailer/nodemailer` `createTransport Gmail service App Password` query returned:

```javascript
const gmailTransporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'user@gmail.com',
        pass: 'app-specific-password'
    }
});
```

**Verdict:** the `service: 'Gmail'` well-known-service shortcut is still first-class in nodemailer 8.x; no migration to explicit `host: 'smtp.gmail.com', port: 465, secure: true` needed. Code shape matches PATTERNS.md L693-733 verbatim. Zero SDK drift.

## Decisions Made

Documented inline in frontmatter `key-decisions`. Highlights:

1. **Dual-path 535 detection** — `responseCode === 535 || response.includes('535')` — per plan A4 note. Single-field check would silently lose the GMAIL_AUTH_FAILURE marker if nodemailer rearranges field names in a minor release.
2. **Header comment reworded to avoid self-triggering W2 gate** — the original phrasing `EXACTLY ONE catch (…) block` contained the literal `catch (` bytes that the W2 grep counts. Rewrote to `EXACTLY ONE error-catching block` and `counting catch-open tokens` — preserves the operator-facing documentation while keeping the grep gate at count = 1.
3. **`as` type assertion instead of `catch (err: any)`** — TypeScript strict config flags `any` in catch params; a narrow assertion to `{ responseCode?, response?, message? }` is typecheck-clean and semantically equivalent.
4. **`text:` field deliberately omitted** per D-08 (HTML-only). Adding plaintext would first require adding a `text?: string` field to EmailPayload in types.ts, forcing the D-08 conversation before any mailer change.

## Deviations from Plan

**None of the Rule 1–3 deviation categories fired.** The code landed verbatim from the `<interfaces>` block in 01-09-PLAN.md (PATTERNS.md L693-733). The one micro-adjustment — rewording the header comment to dodge the W2 grep — was an in-plan affordance (the plan's `<acceptance_criteria>` explicitly said "file contains EXACTLY ONE `catch (…)` block" measured by `grep -cE 'catch \(' src/mailer/gmail.ts`; the comment rewording is a grep-gate hygiene issue, not a deviation).

The only stylistic refinement from the plan's literal `catch (err: any)` in PATTERNS.md to `catch (err)` + `const anyErr = err as { ... }` preserves the plan's behavior (same defensive field access) while satisfying TypeScript strict. This matches the plan's `<interfaces>` block in 01-09-PLAN.md (which already uses the `err as { responseCode?; response?; message? }` shape, not the bare `any`), so it is within-plan.

Zero auto-fixes applied.

## Verification Against Plan `<verification>` Block

| Check | Result |
|-------|--------|
| `pnpm typecheck` clean | PASS — exits 0 |
| `isDryRun()` is the very first condition in function body (before any transporter creation) | PASS — isDryRun() at line 27, createTransport at line 33 |
| Every `catch` block contains `throw` | PASS — sole catch block (line 48) ends in `throw new Error(...)` at line 63 |
| Exactly ONE `catch (…)` block exists (W2) | PASS — `grep -cE 'catch \(' src/mailer/gmail.ts` = 1 |
| Cross-plan invariant: `grep -rn "isDryRun" src/` count prediction | Currently 4 lines across 2 files (env.ts definition + gmail.ts: 1 comment reference, 1 import, 1 call). Call-sites: 1 (gmail.ts:27). Plan 10 will add a 2nd call site in src/state/writer.ts, matching the plan's "3 sites total after 09+10" prediction when measured as `grep -rn "isDryRun()" src/` call-sites (not line count). |

## Acceptance Criteria (Task 1)

| Criterion | Result |
|-----------|--------|
| File exists; exports `sendMail` | PASS |
| DRY_RUN gate is first executable statement (isDryRun() before createTransport) | PASS (line 27 < line 33) |
| Uses `service: 'Gmail'` nodemailer shortcut | PASS — grep match |
| Pass value is `process.env.GMAIL_APP_PASSWORD` | PASS — grep match |
| Catch block contains explicit `responseCode === 535` check | PASS — grep match at line 55 |
| Catch block contains `response.includes('535')` fallback | PASS — line 56 |
| Emits literal `GMAIL_AUTH_FAILURE` marker | PASS — line 58 |
| Emits exact URL `https://myaccount.google.com/apppasswords` | PASS — line 60 |
| Every catch path ends in `throw new Error('SMTP send failed: ...')` | PASS — line 63 |
| Error message passed through `scrubSecrets` | PASS — `scrubSecrets(anyErr.message ?? String(err))` at line 63 |
| Does NOT contain `text:` field in sendMail call (D-08) | PASS — `! grep -q "text:" src/mailer/gmail.ts` |
| Does NOT contain `return null`, `return undefined`, or silent recovery in catch | PASS — only `return;` in the DRY_RUN short-circuit (expected) |
| **W2 single-catch invariant** | PASS — `grep -cE 'catch \(' src/mailer/gmail.ts` = 1 |
| `pnpm typecheck` exits 0 | PASS |

## Threat Model Mitigations Applied

Per plan's `<threat_model>`:

| Threat ID | Mitigation | Verified By |
|-----------|------------|-------------|
| T-09-01 (App Password leak in error log) | `scrubSecrets(anyErr.message ?? String(err))` applied before throw | Line 63; every Error message flows through the scrubber |
| T-09-02 (App Password revoked, workflow green) | Every catch path rethrows — top-level main.ts catch sets exit 1. 535 explicitly surfaced with `GMAIL_AUTH_FAILURE` marker | W2 grep gate enforces single-catch-rethrow structure (count=1) |
| T-09-03 (malicious payload.html) | Trust composer (plan 08 escapes all user content via escapeHtml/escapeAttr). Mailer is transport layer only | By construction — this file does not mutate payload.html |
| T-09-04 (DRY_RUN bypass bug sends real email) | Pattern 2 single-site isDryRun() check; env.ts is the only definition | `grep -rn "process.env.DRY_RUN" src/` = 1 (env.ts); isDryRun() call sites = 1 (gmail.ts). Plan 10 will add the second call site |

T-09-05 (recipient in logs) and T-09-06 (slow SMTP DoS) are `accept` dispositions — no mitigation code required.

## Known Stubs

**None.** No empty-data UI flows, no placeholder components. The DRY_RUN short-circuit logs the payload subject + HTML to stdout (not a stub — this is the canonical rendering for DRY_RUN=1 operator verification).

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced beyond what the plan's threat model already covers.

## Next Phase Readiness

Ready for Wave 3 downstream consumers:

- **plan 01-11 (main.ts orchestrator):** can `import { sendMail } from './mailer/gmail.js'`. Signature is stable: `sendMail(payload): Promise<void>`. Behavior: in DRY_RUN logs subject + HTML and returns; in production sends via Gmail SMTP with App Password auth; on any SMTP error throws with `scrubSecrets`-sanitized message; on 535 auth error emits recovery marker + URL before throwing. Top-level main() catch sets process.exit(1).
- **plan 01-10 (state writer):** is the sibling DRY_RUN check site #2. When it lands, `grep -rn "isDryRun()" src/` will return 2 call sites (gmail.ts + state/writer.ts); env.ts stays as the sole definition.
- **GHA workflow secret wiring:** the GitHub Actions workflow in plan 01-12 must pass `GMAIL_APP_PASSWORD` and a from/to address (likely `GMAIL_FROM_ADDRESS` or the same as recipient) as environment variables. This is not this plan's surface — flagged for plan 12.

## Self-Check: PASSED

- `src/mailer/gmail.ts` exists on disk (65 lines).
- Task 1 commit `e1cdc06` present in `git log --oneline -5`.
- `pnpm typecheck` exits 0.
- `pnpm test` exits 0 (29 tests pass, unchanged from plan 08).
- All 14 acceptance criteria (Task 1) pass as verified above.
- All 5 plan-level `<verification>` checks pass.
- All 5 plan-level `<success_criteria>` satisfied (EMAIL-03, EMAIL-06, OPS-06, Pitfall 7/14, W2 single-catch).
- Cross-plan isDryRun call-site count = 1 (gmail.ts), pending plan 10 to bring it to 2.
- `grep -cE 'catch \(' src/mailer/gmail.ts` = **1** — W2 invariant holds.

---
*Phase: 01-foundation-vertical-slice*
*Plan: 09*
*Completed: 2026-04-17*
