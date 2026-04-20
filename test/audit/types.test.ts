import { describe, it, expect } from 'vitest';
import type { Status, Remediation, AuditRow, AuditReport } from '../../src/audit/types.js';

describe('audit types', () => {
  it('Status union accepts all 6 documented values', () => {
    const all: Status[] = [
      'OK', 'list-fail', 'selector-empty',
      'detail-identical', 'detail-empty', 'detail-quality-unknown',
    ];
    expect(all).toHaveLength(6);
  });

  it('Remediation union accepts all 5 documented values', () => {
    const all: Remediation[] = [
      'enable-js-render-detail', 'fix-selector', 'disable-firm',
      'migrate-to-sitemap', 'monitor',
    ];
    expect(all).toHaveLength(5);
  });

  it('exhaustiveness: switch over Status compiles with never default', () => {
    function statusKind(s: Status): string {
      switch (s) {
        case 'OK': return 'ok';
        case 'list-fail': return 'list';
        case 'selector-empty': return 'selector';
        case 'detail-identical': return 'identical';
        case 'detail-empty': return 'empty';
        case 'detail-quality-unknown': return 'unknown';
        default: {
          const _exhaustive: never = s;
          throw new Error(_exhaustive as string);
        }
      }
    }
    expect(statusKind('OK')).toBe('ok');
  });

  it('exhaustiveness: switch over Remediation compiles with never default', () => {
    function rPhase(r: Remediation): string {
      switch (r) {
        case 'enable-js-render-detail': return 'Phase 7';
        case 'fix-selector': return 'Phase 7';
        case 'disable-firm': return 'immediate';
        case 'migrate-to-sitemap': return 'Phase 9';
        case 'monitor': return 'Phase 10/11';
        default: {
          const _exhaustive: never = r;
          throw new Error(_exhaustive as string);
        }
      }
    }
    expect(rPhase('disable-firm')).toBe('immediate');
  });

  it('AuditRow can be constructed with valid shape', () => {
    const row: AuditRow = {
      firmId: 'bkl', firmName: '태평양', tier: 'html',
      status: 'detail-identical', items: 9,
      remediation: 'enable-js-render-detail', targetPhase: 'Phase 7',
      evidence: 'exact-hash, jaccard=1.00, title-tokens 0/2 & 0/2',
      disabled: false,
    };
    expect(row.firmId).toBe('bkl');
  });

  it('AuditReport can be constructed with valid shape', () => {
    const report: AuditReport = {
      rows: [],
      runMetadata: {
        startedAt: '2026-04-19T12:00:00.000Z',
        finishedAt: '2026-04-19T12:01:30.000Z',
        includeDisabled: false,
        totalFirms: 0, okCount: 0, nonOkCount: 0,
      },
      outputPath: '.planning/phases/06-firm-audit-probe/06-AUDIT.md',
    };
    expect(report.outputPath).toMatch(/06-AUDIT\.md$/);
  });
});
