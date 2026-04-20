// `pnpm audit:firms [--include-disabled]` CLI — Phase 6 D-01.
//
// Thin argv wrapper over runAudit() (src/audit/firmAudit.ts). Does NOT
// send email, write state, call Gemini, or modify firms.yaml — strictly
// a diagnostic.
//
// Exit codes (D-03 — fail-loud 3-tier):
//   0: every enabled firm has status='OK' in the audit report.
//   1: at least one enabled firm has non-OK status (list-fail / selector-empty
//      / detail-identical / detail-empty / detail-quality-unknown).
//   2: runtime error (uncaught throw, config load failure) or usage error
//      (unknown CLI flag).
//
// Disabled rows DO NOT participate in exit code (Open Question 1
// recommendation in 06-RESEARCH.md): they are informational baselines
// only; their status reflects the firm's known-broken state, not an
// actionable production regression.
//
// Output: human-readable one-liners + Reporter sections from runAudit.

import { runAudit } from '../audit/firmAudit.js';
import type { Reporter } from '../pipeline/run.js';

interface ParsedArgs {
  includeDisabled: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const includeDisabled = args.includes('--include-disabled');
  // Reject unknown flags fail-loud (matches checkFirm.ts strictness).
  for (const a of args) {
    if (a !== '--include-disabled') {
      console.error(`Unknown argument: ${a}`);
      console.error('Usage: pnpm audit:firms [--include-disabled]');
      process.exit(2);
    }
  }
  return { includeDisabled };
}

class CliReporter implements Reporter {
  section(name: string, detail: string): void {
    console.log(`  ${name.padEnd(18)}: ${detail}`);
  }
}

async function main(): Promise<number> {
  const { includeDisabled } = parseArgs(process.argv);
  try {
    const report = await runAudit({
      includeDisabled,
      reporter: new CliReporter(),
    });
    // Open Question 1 — disabled rows do NOT participate in exit code.
    const enabledRows = report.rows.filter((r) => !r.disabled);
    const nonOk = enabledRows.filter((r) => r.status !== 'OK');
    console.log(
      `[audit:firms] ${report.rows.length} firm(s) probed; ${nonOk.length} non-OK (enabled)`,
    );
    console.log(`[audit:firms] wrote ${report.outputPath}`);
    return nonOk.length === 0 ? 0 : 1;
  } catch (err) {
    console.error(`[audit:firms] error: ${(err as Error).message}`);
    return 2;
  }
}

// Belt-and-suspenders top-level catch — guards against any rejection that
// escapes main()'s try/catch (matches checkFirm.ts:107-112).
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[audit:firms] fatal: ${(err as Error).message}`);
    process.exit(2);
  });
