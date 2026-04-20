import { describe, it, expect } from 'vitest';
import {
  renderAuditMarkdown,
  remediationToTargetPhase,
} from '../../src/audit/writer.js';
import type { AuditReport, AuditRow } from '../../src/audit/types.js';

function makeRow(overrides: Partial<AuditRow>): AuditRow {
  return {
    firmId: 'sample',
    firmName: 'Sample Firm',
    tier: 'rss',
    status: 'OK',
    items: 0,
    remediation: null,
    targetPhase: null,
    evidence: '',
    disabled: false,
    ...overrides,
  };
}

describe('renderAuditMarkdown', () => {
  it('matches snapshot for representative rows across status × tier', () => {
    const report: AuditReport = {
      rows: [
        makeRow({ firmId: 'clifford-chance', firmName: 'Clifford Chance', tier: 'rss', status: 'OK', items: 5, evidence: 'feed parsed; 5 items' }),
        makeRow({ firmId: 'shin-kim', firmName: '세종', tier: 'html', status: 'list-fail', items: 0, remediation: 'monitor', targetPhase: 'Phase 10/11', evidence: 'HTTP 503 timeout' }),
        makeRow({ firmId: 'logos', firmName: '법무법인 로고스', tier: 'html', status: 'selector-empty', items: 0, remediation: 'fix-selector', targetPhase: 'Phase 7', evidence: 'list page OK; 0 items extracted' }),
        makeRow({ firmId: 'bkl', firmName: '태평양', tier: 'html', status: 'detail-identical', items: 9, remediation: 'enable-js-render-detail', targetPhase: 'Phase 7', evidence: 'exact-hash, jaccard=1.00, title-tokens 0/2 & 0/2' }),
        makeRow({ firmId: 'kim-chang', firmName: '김앤장 법률사무소', tier: 'html', status: 'detail-empty', items: 12, remediation: 'fix-selector', targetPhase: 'Phase 7', evidence: 'body lengths: item1=23, item2=18 (threshold 100)' }),
        makeRow({ firmId: 'lee-ko', firmName: '광장', tier: 'js-render', status: 'OK', items: 8, evidence: 'bodies distinct (jaccard=0.31, lengths 1240/2103)' }),
        makeRow({ firmId: 'latham', firmName: 'Latham & Watkins', tier: 'js-render', status: 'detail-quality-unknown', items: 6, remediation: 'monitor', targetPhase: 'Phase 10/11', evidence: 'only 0/2 detail fetches succeeded' }),
        makeRow({ firmId: 'cooley', firmName: 'Cooley', tier: 'rss', status: 'list-fail', items: 0, remediation: 'migrate-to-sitemap', targetPhase: 'Phase 9', evidence: 'HTTP 403 (Cloudflare challenge)', disabled: true }),
      ],
      runMetadata: {
        startedAt: '2026-04-19T12:00:00.000Z',
        finishedAt: '2026-04-19T12:01:30.000Z',
        includeDisabled: true,
        totalFirms: 8,
        okCount: 2,
        nonOkCount: 6,
        probeVersion: 'abc1234',
      },
      outputPath: '.planning/phases/06-firm-audit-probe/06-AUDIT.md',
    };
    expect(renderAuditMarkdown(report)).toMatchSnapshot();
  });

  it('summary table has header + separator + N data rows', () => {
    const report: AuditReport = {
      rows: [
        makeRow({ firmId: 'a' }),
        makeRow({ firmId: 'b' }),
        makeRow({ firmId: 'c' }),
      ],
      runMetadata: {
        startedAt: 'x', finishedAt: 'y', includeDisabled: false,
        totalFirms: 3, okCount: 3, nonOkCount: 0,
      },
      outputPath: 'p',
    };
    const md = renderAuditMarkdown(report);
    // Count summary-table lines: only those starting with '| ' inside the Summary section
    const summarySection = md.split('## Per-firm evidence')[0];
    const tableLines = summarySection.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines).toHaveLength(2 + 3); // header row + separator row + 3 data rows
  });

  it('null remediation renders as n/a', () => {
    const report: AuditReport = {
      rows: [makeRow({ firmId: 'ok-firm', status: 'OK' })],
      runMetadata: {
        startedAt: 'x', finishedAt: 'y', includeDisabled: false,
        totalFirms: 1, okCount: 1, nonOkCount: 0,
      },
      outputPath: 'p',
    };
    const md = renderAuditMarkdown(report);
    expect(md).toMatch(/\| ok-firm \| rss \| OK \| 0 \| n\/a \| n\/a \|/);
  });

  it('disabled row renders (disabled, baseline) tag in summary AND evidence heading', () => {
    const report: AuditReport = {
      rows: [makeRow({ firmId: 'cooley', tier: 'rss', status: 'list-fail', remediation: 'migrate-to-sitemap', targetPhase: 'Phase 9', evidence: 'CF block', disabled: true })],
      runMetadata: {
        startedAt: 'x', finishedAt: 'y', includeDisabled: true,
        totalFirms: 1, okCount: 0, nonOkCount: 1,
      },
      outputPath: 'p',
    };
    const md = renderAuditMarkdown(report);
    expect(md).toContain('cooley (disabled, baseline)');
    expect(md).toMatch(/## cooley \(rss, list-fail\) \(disabled, baseline\)/);
  });

  it('preserves input row order (no sorting)', () => {
    const report: AuditReport = {
      rows: [
        makeRow({ firmId: 'zulu' }),
        makeRow({ firmId: 'alpha' }),
        makeRow({ firmId: 'mike' }),
      ],
      runMetadata: {
        startedAt: 'x', finishedAt: 'y', includeDisabled: false,
        totalFirms: 3, okCount: 3, nonOkCount: 0,
      },
      outputPath: 'p',
    };
    const md = renderAuditMarkdown(report);
    const zuluIdx = md.indexOf('| zulu ');
    const alphaIdx = md.indexOf('| alpha ');
    const mikeIdx = md.indexOf('| mike ');
    expect(zuluIdx).toBeLessThan(alphaIdx);
    expect(alphaIdx).toBeLessThan(mikeIdx);
  });
});

describe('remediationToTargetPhase', () => {
  it('maps all 5 remediation values to canonical target phases', () => {
    expect(remediationToTargetPhase('enable-js-render-detail')).toBe('Phase 7');
    expect(remediationToTargetPhase('fix-selector')).toBe('Phase 7');
    expect(remediationToTargetPhase('disable-firm')).toBe('immediate');
    expect(remediationToTargetPhase('migrate-to-sitemap')).toBe('Phase 9');
    expect(remediationToTargetPhase('monitor')).toBe('Phase 10/11');
  });
});
