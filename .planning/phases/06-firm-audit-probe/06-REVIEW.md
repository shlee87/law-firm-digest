---
phase: 06-firm-audit-probe
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/audit/types.ts
  - src/audit/signals.ts
  - src/audit/writer.ts
  - src/audit/firmAudit.ts
  - src/cli/auditFirms.ts
  - src/config/loader.ts
  - package.json
  - .prettierignore
  - test/audit/types.test.ts
  - test/audit/signals.test.ts
  - test/audit/writer.test.ts
  - test/audit/__snapshots__/writer.test.ts.snap
  - test/audit/firmAudit.test.ts
  - test/config/loader.test.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 6 introduces the `pnpm audit:firms` diagnostic probe with a clean separation of concerns (types → pure signals → writer → orchestrator → CLI). The design decisions documented in CONTEXT.md (D-07 hardcoded 0.9 threshold, D-10 `never` exhaustiveness, Pitfall 1 vacuous-fire guard) are faithfully implemented and locked down by tests. The core SC-1 success criterion — detecting bkl's identical-body bug — is covered end-to-end (signals Test 32, orchestrator Test 2, writer snapshot).

No Critical (security / data-loss / crash) issues were found. The audit probe is read-only, writes only to a hardcoded planning path, and correctly scrubs secrets from error messages. Secrets are loaded via `process.env` only (consistent with project convention); no hardcoded credentials, no shell-injection surfaces, no `eval`.

Three Warnings are worth addressing before Phase 7 consumes the remediation vocabulary:

1. **Duplicated Remediation → Phase mapping** — `targetPhaseFor` in `firmAudit.ts` duplicates `remediationToTargetPhase` in `writer.ts`. Two exhaustiveness switches for the same thing invite drift when the enum changes.
2. **`defaultRemediation` can return `null` for non-OK statuses** — the type annotation `Remediation | null` plus the ternary on `detail-identical` is correct, but the downstream invariant "remediation === null IFF status === 'OK'" (stated in types.ts L6) is only actually enforced for `status === 'OK'`. Any future branch that returns null for a non-OK status would silently violate the documented invariant without a test failure.
3. **`AUDIT_OUTPUT_PATH` is relative** — `writeFile('.planning/phases/.../06-AUDIT.md', ...)` resolves against `process.cwd()`. If `pnpm audit:firms` is ever invoked from a subdirectory (e.g., a developer running `cd src && ../node_modules/.bin/tsx cli/auditFirms.ts`), the write silently lands in the wrong directory. Low risk in normal CI use but worth a guard.

Five Info items cover minor style and future-proofing suggestions.

## Warnings

### WR-01: Duplicated Remediation → target-phase mapping

**File:** `src/audit/firmAudit.ts:86-99` and `src/audit/writer.ts:28-40`
**Issue:** Two nearly identical switch statements map `Remediation` values to target-phase strings. The version in `firmAudit.ts::targetPhaseFor` is called during row construction; the version in `writer.ts::remediationToTargetPhase` is exported from the writer module. Both use `never`-default exhaustiveness so adding a new Remediation value will fail both switches independently — but if a developer updates only one (e.g., re-categorizes `monitor` to "Phase 12" in the writer while leaving the orchestrator at "Phase 10/11"), the row's stored `targetPhase` will disagree with what the writer prints. No test catches the drift today because `writer.ts`'s switch is actually unreferenced by the render path — `summaryRowLine` and `evidenceSection` both print `row.targetPhase` directly, making `remediationToTargetPhase` dead at runtime and surviving only as a test-only export (writer.test.ts:120-126).

**Fix:** Delete `remediationToTargetPhase` from `writer.ts` (including its export and the `describe` block in `writer.test.ts`) and have `firmAudit.ts::targetPhaseFor` be the single source of truth. Alternatively, export `targetPhaseFor` from a shared module (e.g., `src/audit/remediation.ts`) and import it from both files. Prefer option 1 — it is the smaller diff and eliminates the dead path.

```ts
// src/audit/writer.ts — delete the export entirely
// (leave statusLabel in place; still used by summaryRowLine and evidenceSection)
```

### WR-02: `remediation === null IFF status === 'OK'` invariant is not enforced

**File:** `src/audit/firmAudit.ts:60-84`, `src/audit/types.ts:6`
**Issue:** types.ts L6 documents "remediation === null IFF status === 'OK' (TS cannot enforce; documented)". Today the invariant holds because every non-OK branch in `defaultRemediation` returns a non-null value. But the structure of the code — switch on status, return a nullable — does not protect the invariant against future edits. A refactor that adds a condition like `case 'detail-identical': return tier === 'js-render' ? null : 'enable-js-render-detail';` (mirroring a legitimate "no clear remediation for this edge case" intuition) would compile, typecheck, produce valid JSON, and quietly violate the documented contract.

**Fix:** Add a runtime assertion in `makeRow` immediately after computing `remediation`:

```ts
function makeRow(firm: FirmConfig, status: Status, items: number, evidence: string): AuditRow {
  const remediation = defaultRemediation(status, firm.type);
  // Invariant guard (types.ts L6): remediation === null IFF status === 'OK'.
  if ((remediation === null) !== (status === 'OK')) {
    throw new Error(
      `Audit invariant violated: status=${status} remediation=${remediation}`,
    );
  }
  return { /* ... */ };
}
```

Alternatively, a targeted test that iterates every Status × Tier and asserts the invariant would be equally effective and less intrusive.

### WR-03: `AUDIT_OUTPUT_PATH` is a relative path

**File:** `src/audit/firmAudit.ts:45-46`, `src/audit/firmAudit.ts:283`
**Issue:** `AUDIT_OUTPUT_PATH = '.planning/phases/06-firm-audit-probe/06-AUDIT.md'` is resolved against `process.cwd()` by `writeFile`. In GHA and in normal `pnpm audit:firms` invocation (npm scripts set cwd to the package root), this is correct. But any invocation from a different working directory — a developer running `tsx` directly from a subdirectory, a future orchestrator script that `cd`s before calling — writes to an unexpected path. There is no cwd check and no fallback. The file is committed back by a later phase's cron workflow that "expects this exact path" (firmAudit.ts L19), so a misdirected write silently breaks the cron gate.

**Fix:** Anchor the path to the project root, for example by resolving relative to this source file or by asserting a known sentinel exists in cwd:

```ts
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/audit/firmAudit.ts → project root is two levels up
export const AUDIT_OUTPUT_PATH = resolve(
  __dirname,
  '../../.planning/phases/06-firm-audit-probe/06-AUDIT.md',
);
```

Or a lighter guard at top of `runAudit`:

```ts
// Defense: AUDIT_OUTPUT_PATH is relative; assert cwd looks like the repo root.
if (!existsSync('package.json') || !existsSync('.planning')) {
  throw new Error(
    `audit:firms must run from project root. cwd=${process.cwd()}`,
  );
}
```

## Info

### IN-01: `extractTitleTokens` regex allows U+D7AF but Hangul syllable block ends at U+D7A3

**File:** `src/audit/signals.ts:90`
**Issue:** The character range `[\uAC00-\uD7AF]{2,}` includes Unicode codepoints U+D7A4–U+D7AF which are reserved / unassigned in the Hangul Syllables block (the last valid syllable is U+D7A3, 힣). In practice this costs nothing — those codepoints never appear in real titles — but the docstring on L82 says "가-힣" which is U+AC00–U+D7A3. The regex and the docstring disagree.

**Fix:** Tighten the range to match the docstring:

```ts
const matches = title.match(/[\uAC00-\uD7A3\u4E00-\u9FFF]{2,}|[A-Za-z0-9_]{2,}/g) ?? [];
```

This is a pure cosmetic / documentation-accuracy fix; no behavior change on any real-world input.

### IN-02: `tokenize` documentation says "no lowercasing" but `jaccardTokenSimilarity` relies on exact-match token identity

**File:** `src/audit/signals.ts:46-51, 62-72`
**Issue:** `tokenize` is explicitly case-sensitive per its docstring ("No lowercasing — production scrapers do not lowercase, so identity matches what users would actually see"). `jaccardTokenSimilarity` passes its input verbatim to `tokenize` and builds Sets for intersection/union. Consequence: two bodies that differ only in capitalization ("Contract Law" vs "contract law") score < 1.0 Jaccard when by policy they are the same content. This is an intentional design choice per the comment, but worth a note because Test 20's identical-body Jaccard=1.0 test passes trivially and does not exercise the case-sensitivity edge.

**Fix:** No code change required. Consider adding a one-line test that makes the case-sensitivity design explicit:

```ts
it('case-sensitive: "Tax" and "tax" are distinct tokens', () => {
  expect(jaccardTokenSimilarity('Tax Update', 'tax update')).toBeLessThan(1.0);
});
```

### IN-03: `bodyHash` truncation to first-50 chars can collide on legitimately different prefixes

**File:** `src/audit/signals.ts:27-37`
**Issue:** `bodyHash` returns `${length}:${first50chars_stripped}`. Two distinct bodies with the same length AND the same first 50 non-whitespace chars AND different content after char 50 will produce the same hash → `exactHashMatch` reports true. Test 17 (signals.test.ts:137-150) documents this as intentional design ("By design, bodyHash only considers first 50 chars + total length"). However, within `classifyDetailIdentity`, a `true` from `exactHashMatch` alone is sufficient to emit `detail-identical` (signals.ts:188). The Jaccard fallback catches most real-world divergent-content-same-prefix cases (boilerplate headers always yield jaccard < 0.9 when tail content genuinely differs), so the combined behavior is safe — but a body with an identical 50-char header and a 200-char tail that happens to reuse tokens 90%+ from the first body would still classify as `detail-identical` "correctly" by Jaccard, not by the exact-hash signal alone.

The risk: a single-signal firm. If a future firm has templated article headers (e.g., 250 chars of standard intro/disclaimer) and tail content that is short enough to not move Jaccard much, exact-hash will misfire. Today's firms do not show this pattern.

**Fix:** None required for v1. If the hash becomes a false-positive source during production rollout, swap to a full-body SHA-256 or raise the prefix length. The port-from-scratch-script (signals.ts:18-19) docstring notes this is port-compatibility with `scripts/detail-page-audit.ts:25`.

### IN-04: `probeHtmlFirm` detail-fetch loop catches silently without distinguishing partial-failure cases

**File:** `src/audit/firmAudit.ts:146-157`
**Issue:** The loop `for (const item of items.slice(0, DETAIL_SAMPLE_N))` fetches up to 2 detail pages. Each `try/catch` swallows the error — `catch { // per-detail-page isolation; insufficient bodies → detail-quality-unknown }`. This is correct per spec (D-07 / Pitfall 1 family), but means a partial failure (1/2 succeeded, 1/2 threw) produces the same `detail-quality-unknown` classification as a total failure (0/2). The evidence string `only 1/2 detail fetches succeeded` at least preserves the count (signals.ts:154), but there is no record of *why* the failing fetch failed. Test 4 (firmAudit.test.ts:205-217) covers total failure, not partial. For operational debugging (Phase 7 will presumably act on these signals), knowing the failure mode of the half that failed is useful.

**Fix:** Capture the error message on the silent catch path and thread it into evidence:

```ts
const failures: string[] = [];
for (const item of items.slice(0, DETAIL_SAMPLE_N)) {
  try {
    const { html } = await decodeCharsetAwareFetch(item.url);
    const body = extractBody(html, firm.selectors?.body);
    bodies.push({ url: item.url, title: item.title, body });
  } catch (err) {
    failures.push(scrubSecrets((err as Error).message));
  }
}

const result = classifyDetailIdentity(bodies);
const enrichedEvidence = failures.length > 0
  ? `${result.evidence}; detail-fetch errors: ${failures.join(' | ')}`
  : result.evidence;
return makeRow(firm, result.status, items.length, enrichedEvidence);
```

Same suggestion applies to `probeJsRenderFirm` at L190-194.

### IN-05: `CliReporter` narrows section detail padding to 18 chars — magic number

**File:** `src/cli/auditFirms.ts:42-46`
**Issue:** `console.log(`  ${name.padEnd(18)}: ${detail}`);` uses the literal `18` to align section names. Looking at `firmAudit.ts`, the longest section name used is `'chromium'` (8) / `'audit'` (5) / `'write'` (5). The value `18` is defensive but never approached; if a future section name exceeds 18 chars (e.g., `'playwright-launch'` = 17, on the edge), alignment silently breaks. Not a bug; a maintenance hazard.

**Fix:** Either reduce to the actual maximum + small buffer, or promote to a named constant with a comment:

```ts
// Longest section name today is 'chromium' (8); 18 gives headroom.
const SECTION_NAME_PAD = 18;
console.log(`  ${name.padEnd(SECTION_NAME_PAD)}: ${detail}`);
```

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
