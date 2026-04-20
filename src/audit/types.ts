// Canonical typed contracts for the firm-audit probe (Phase 6).
//
// Critical invariants enforced at type level:
//   - Status is one of 6 literal strings (SC-3 vocab)
//   - Remediation is one of 5 literal strings (D-10 vocab)
//   - remediation === null IFF status === 'OK' (TS cannot enforce; documented)
//   - targetPhase === null IFF remediation === null
//   - tier mirrors FirmType from src/types.ts (rss / html / js-render)
//
// The Status and Remediation unions are CLOSED — adding a new value here
// requires updating src/audit/writer.ts switch(remediation) which uses
// TypeScript `never` exhaustiveness. Build fails if a writer switch lacks
// a case for a new value (D-10 fail-loud enforcement).

export type Status =
  | 'OK'
  | 'list-fail'
  | 'selector-empty'
  | 'detail-identical'
  | 'detail-empty'
  | 'detail-quality-unknown';

export type Remediation =
  | 'enable-js-render-detail'
  | 'fix-selector'
  | 'disable-firm'
  | 'migrate-to-sitemap'
  | 'monitor';

export interface AuditRow {
  firmId: string;
  firmName: string;
  tier: 'rss' | 'html' | 'js-render';
  status: Status;
  items: number;
  remediation: Remediation | null; // null only when status='OK'
  targetPhase: string | null;       // null only when status='OK'
  evidence: string;                  // free-form, human-readable
  disabled: boolean;                  // (disabled, baseline) tag (D-05)
}

export interface AuditReport {
  rows: AuditRow[];
  runMetadata: {
    startedAt: string;       // ISO 8601
    finishedAt: string;      // ISO 8601
    includeDisabled: boolean;
    totalFirms: number;
    okCount: number;
    nonOkCount: number;
    probeVersion?: string;   // git rev-parse HEAD; 'unknown' fallback
  };
  outputPath: string;
}

export interface RunOptions {
  includeDisabled?: boolean;
  reporter?: { section(name: string, detail: string): void };
}
