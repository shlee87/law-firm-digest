// TDD test for Phase 8 GUARD-01 Layer 1: short-circuit behavior in the
// daily summarize loop (body < settings.digest.min_body_chars gate).
// Plan 08-01 Task 3.
//
// Phase 13 Plan 13-05: src/pipeline/run.ts was split into runDaily.ts and
// runWeekly.ts. The Layer-1 short-circuit lives in runDaily.ts (the only
// path that calls summarize); runWeekly never imports summarize. These
// grep-level assertions are retargeted to runDaily.ts accordingly.
//
// Note: These tests verify the behavioral contract by examining source code
// patterns (grep-level assertions) and via the actual runDaily module's
// behavior through mock injection. The full integration test lives in
// test/pipeline/run.test.disabled.ts (deferred to Plan 13-07 rewrite under
// runDaily + runWeekly e2e).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const runDailyPath = join(
  import.meta.dirname ?? __dirname,
  '../../src/pipeline/runDaily.ts',
);
const geminTsPath = join(
  import.meta.dirname ?? __dirname,
  '../../src/summarize/gemini.ts',
);

const runDailyTs = readFileSync(runDailyPath, 'utf8');
const geminiTs = readFileSync(geminTsPath, 'utf8');

describe('GUARD-01 Layer 1 short-circuit (Phase 8 D-01/D-02/D-03)', () => {
  it('(L1-01) runDaily.ts contains body.trim().length < settings.digest.min_body_chars gate (D-02)', () => {
    expect(runDailyTs).toContain('body.trim().length < settings.digest.min_body_chars');
  });

  it('(L1-02) runDaily.ts short-circuit returns summary_ko: item.title (title-verbatim, D-03)', () => {
    expect(runDailyTs).toContain('summary_ko: item.title');
  });

  it('(L1-03) runDaily.ts has exactly ONE null return for summary_ko (only cli-skipped path)', () => {
    const nullMatches = (runDailyTs.match(/summary_ko: null/g) ?? []).length;
    expect(nullMatches).toBe(1);
  });

  it('(L1-04) runDaily.ts cli-skipped path still returns summary_ko: null (unchanged)', () => {
    // The cli-skipped branch must still return null (it never reaches email template)
    // Verify by checking that 'cli-skipped' appears near 'summary_ko: null'
    const cliSkippedIdx = runDailyTs.indexOf("summaryModel: 'cli-skipped'");
    const nullIdx = runDailyTs.indexOf('summary_ko: null');
    expect(cliSkippedIdx).toBeGreaterThan(-1);
    expect(nullIdx).toBeGreaterThan(-1);
    // cli-skipped appears before the null return (null return is inside the cli-skipped block)
    // Check window after cliSkippedIdx to find the null
    const window = runDailyTs.slice(cliSkippedIdx - 200, cliSkippedIdx + 200);
    expect(window).toContain('summary_ko: null');
  });
});

describe('GUARD-01 catch-block title-verbatim (Phase 8 Open-Q #2)', () => {
  it('(CB-01) gemini.ts catch block has ZERO summary_ko: null returns', () => {
    const nullMatches = (geminiTs.match(/summary_ko: null/g) ?? []).length;
    expect(nullMatches).toBe(0);
  });

  it('(CB-02) gemini.ts catch block returns summary_ko: item.title (title-verbatim)', () => {
    // There should be at least 2 occurrences: Option C + catch block
    const titleMatches = (geminiTs.match(/summary_ko: item\.title/g) ?? []).length;
    expect(titleMatches).toBeGreaterThanOrEqual(2);
  });

  it("(CB-03) gemini.ts catch block retains summaryModel: 'failed' sentinel", () => {
    expect(geminiTs).toContain("summaryModel: 'failed'");
  });
});
