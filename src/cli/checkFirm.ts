// `pnpm check:firm <id> [--save-html <path>]` CLI — Phase 3 OPS-07.
//
// Thin argv wrapper over runPipeline(). Does NOT send email, does NOT
// write state, does NOT call Gemini (D-08). saveHtmlPath is optional
// (D-07). Firm id matching is against the enabled-firms list returned
// by loadFirms (D-05 R-01 — disabled firms are "not found").
//
// Exit codes:
//   0: pipeline completed (new items found or silent day).
//   1: runtime error (firm not found, fetch catastrophe, etc.).
//   2: usage error (no id provided).
//
// Output: human-readable stage-by-stage via Reporter (D-06). The
// output format is deliberately grep-friendly — one idea per line,
// stage name : detail. Feels like kubectl get / pg_dump.

import { runPipeline } from '../pipeline/run.js';
import type { Reporter } from '../pipeline/run.js';
import { loadFirms } from '../config/loader.js';

interface ParsedArgs {
  firmId: string;
  saveHtmlPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm check:firm <id> [--save-html <path>]');
    process.exit(2);
  }
  const firmId = args[0];
  let saveHtmlPath: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--save-html') {
      // WR-03 — validate that `--save-html` is followed by a real path, not
      // end-of-args (undefined) or another flag. Without this guard, two
      // footguns occur:
      //   - `check:firm cooley --save-html`         → saveHtmlPath = undefined,
      //     user's intent to save is silently ignored.
      //   - `check:firm cooley --save-html --debug` → saveHtmlPath = '--debug',
      //     writeFile creates a literal file named `--debug` in cwd.
      // Exit code 2 matches the existing "usage error" convention (see header).
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        console.error('--save-html requires a file path argument');
        process.exit(2);
      }
      saveHtmlPath = next;
      i++;
    }
  }
  return { firmId, saveHtmlPath };
}

class CliReporter implements Reporter {
  section(name: string, detail: string): void {
    console.log(`  ${name.padEnd(18)}: ${detail}`);
  }
}

async function main(): Promise<number> {
  const { firmId, saveHtmlPath } = parseArgs(process.argv);

  // D-05 R-01 — match against enabled firm list only. loadFirms already
  // filters enabled:true. Unknown id → clear error listing valid ids.
  const firms = await loadFirms();
  const match = firms.find((f) => f.id === firmId);
  if (!match) {
    const ids = firms.map((f) => f.id).sort().join(', ');
    console.error(`Firm not found: ${firmId}. Valid ids: ${ids}`);
    return 1;
  }

  console.log(`[check:firm] id=${firmId}`);

  try {
    const report = await runPipeline({
      firmFilter: firmId,
      skipEmail: true,
      skipStateWrite: true,
      skipGemini: true,
      saveHtmlPath,
      reporter: new CliReporter(),
    });
    if (report.saveHtmlWritten) {
      console.log(`[check:firm] saved HTML to ${report.saveHtmlWritten}`);
    }
    return 0;
  } catch (err) {
    console.error(`[check:firm] error: ${(err as Error).message}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
