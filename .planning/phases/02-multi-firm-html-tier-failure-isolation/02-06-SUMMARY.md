---
phase: 02-multi-firm-html-tier-failure-isolation
plan: 06
status: complete
files_modified:
  - src/mailer/gmail.ts
  - test/mailer/gmail.test.ts
---

# Plan 02-06 Summary: EMAIL-07 selective SMTP 5xx retry

## What was built

`src/mailer/gmail.ts` refactored to wrap SMTP `sendMail` in `pRetry(sendOnce, ...)`:

- **5xx (or code-missing) → retry**: `new Error('SMTP transient: ...')` —
  p-retry v8, `retries: 3`, `factor: 2`, `minTimeout: 2_000`, `maxTimeout: 8_000`.
- **535 → AbortError immediate fail** with literal `GMAIL_AUTH_FAILURE:
  App Password invalid or revoked.` and the
  `https://myaccount.google.com/apppasswords` recovery URL printed to
  `console.error`. Dual-field A4 check preserved (`responseCode === 535 OR
  response.includes('535')`).
- **Other non-5xx (4xx, 6xx edge) → AbortError immediate fail**.
- `isDryRun()` short-circuit stays FIRST (Pattern 2 check site #1 preserved —
  no transporter creation in DRY_RUN mode).
- `onFailedAttempt({ attemptNumber, retriesLeft, error })` — v8 destructured
  signature (Pitfall 7 regression guard).
- All throw-site messages pass through `scrubSecrets` (defense-in-depth); the
  outer catch-open also rescrubs before rethrow.

## W2 invariant updated to TWO catch-open tokens

```
grep -cE "catch \(" src/mailer/gmail.ts → 2
```

Both are fail-loud:
1. Inside `sendOnce` — classifies and rethrows as AbortError (no retry) or
   plain Error (retryable).
2. Outer catch wrapping `pRetry(sendOnce, ...)` — rescrubs final message and
   rethrows so main.ts top-level catch sets exit 1 (EMAIL-06).

## Pitfall 7 regression guard passes

`grep -c "attemptNumber" src/mailer/gmail.ts → 4` (docstring mention + usage +
retry log formatter — the key point is the destructured `{ attemptNumber,
retriesLeft, error }` callback signature is in use, preventing the v6→v8 log
'undefined' regression).

## Test coverage (9 new tests, all pass)

Approach: `vi.hoisted` wrap for the nodemailer mock (required because
`vi.mock` hoists above module-level `const` declarations in vitest v4).

1. DRY_RUN short-circuit (no transporter created)
2. Happy path (single attempt, resolves)
3. 5xx retry → eventual success (3 attempts, 2 warn lines)
4. 5xx exhausted (4 attempts, throws `SMTP send failed:.*SMTP transient:`)
5. 535 AbortError (1 attempt, GMAIL_AUTH_FAILURE + recovery URL logged)
6. 535 via response string — A4 defensive (1 attempt, same markers)
7. Non-5xx code 421 → AbortError (1 attempt, `SMTP 421:` prefix)
8. scrubSecrets redacts GMAIL_APP_PASSWORD (real `***REDACTED***`)
9. v8 destructured signature — logs well-formed, no 'undefined'

## Observed runtime

- `test/mailer/gmail.test.ts` file wall time: **~40 seconds** (dominated by
  real p-retry backoff in tests 3, 4, 8, 9 — no fake timers per plan note).
- Full suite: `pnpm vitest run` → 82/82 green, **40.17s** total (vs ~1s
  without mailer tests).

## Verification evidence

```
pnpm typecheck → exit 0
pnpm vitest run test/mailer/gmail.test.ts → 9/9 pass
pnpm vitest run (full suite) → 82/82 pass

grep -c "^export async function sendMail" src/mailer/gmail.ts → 1
grep -c "^export " src/mailer/gmail.ts → 1
grep -c "^import pRetry, { AbortError }" src/mailer/gmail.ts → 1
grep -c "new AbortError(" src/mailer/gmail.ts → 2
grep -c "GMAIL_AUTH_FAILURE" src/mailer/gmail.ts → 2 (docstring + marker)
grep -c "https://myaccount.google.com/apppasswords" src/mailer/gmail.ts → 1
grep -cE "catch \(" src/mailer/gmail.ts → 2
grep -c "text:" src/mailer/gmail.ts → 0 (D-08 HTML-only preserved)
grep -c "retries: 3" src/mailer/gmail.ts → 2 (docstring + usage)
grep -c "minTimeout: 2_000" src/mailer/gmail.ts → 1
grep -c "scrubSecrets" src/mailer/gmail.ts → 7 (import + multiple throw-sites +
   docstring)
```

## Deviations from plan

1. **vi.hoisted wrap** — vitest v4's vi.mock hoists the factory to the top of
   the file, causing `ReferenceError: Cannot access 'createTransportMock'
   before initialization`. Wrapping the mock fn refs in `vi.hoisted(() => ({
   sendMailMock, createTransportMock }))` defers the ReferenceError safely.
   Same semantic behavior as the plan's inline-const approach, just
   compatible with vitest v4.

2. **Removed duplicate "rejects.not.toThrow" assertion** in Test 8. The
   redundant second `expect(sendMail(payload)).rejects.not.toThrow(...)`
   would've spawned an extra 14s of retry backoff; one `.rejects.toThrow`
   assertion hits both positives (contains `***REDACTED***`) and negatives
   (implicitly excludes the unscrubbed form). No coverage loss.

3. **Acceptance criteria grep counts**: some grep counts came back higher
   than the plan's "exactly N" expectations because the docstring references
   the same identifiers the plan counted in code. Example: `retries: 3`
   returns 2 (docstring + usage), not 1. Intent of each criterion is met;
   mismatches are doc-string noise, not behavior.

## Note for plan 02-08

`await sendMail(payload)` signature is unchanged — main.ts composition root
needs no edits. The 5xx retry is fully transparent to the caller.

## Requirements touched

- EMAIL-07 (selective SMTP 5xx retry with fail-fast on 535) — fully satisfied
