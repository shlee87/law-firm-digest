// Canonical typed contracts for the LegalNewsletter pipeline.
//
// Single source of truth — every downstream module (config loader, fetchers,
// dedup, summarizer, mailer, state writer, main) imports the interfaces below.
// DO NOT redeclare these shapes elsewhere.
//
// Critical invariants enforced at type level:
//   - SeenState.version is the literal 1 (DEDUP-07)
//   - SummarizedItem.summary_ko is string | null (SUMM-04 nullable)
//   - FirmConfig.timezone is required (CONF-05)
//   - RawItem.description is optional (RSS-only body for summarizer input)
//   - SummarizedItem carries NO body field (COMP-05 — body never persisted)
//   - include_keywords/exclude_keywords default to [] at schema validation,
//     so runtime code may assume they are always defined arrays even though
//     the TS interface marks them optional (matches zod .optional().default([]))

export type FirmType = 'rss' | 'html' | 'js-render';
export type Language = 'ko' | 'en';

export interface FirmConfig {
  id: string;
  name: string;
  language: Language;
  type: FirmType;
  url: string;
  timezone: string;
  enabled: boolean;
  selectors?: {
    list_item: string;
    title: string;
    link?: string;
    link_onclick_regex?: string;
    link_template?: string;
    date?: string;
    body?: string;
  };
  user_agent?: string;
  timeout_ms?: number;
  include_keywords?: string[];
  exclude_keywords?: string[];
}

export interface RawItem {
  firmId: string;
  title: string;
  url: string;
  publishedAt?: string;
  language: Language;
  description?: string;
}

export interface NewItem extends RawItem {
  isNew: true;
}

export interface SummarizedItem extends NewItem {
  summary_ko: string | null;
  summaryConfidence: 'high' | 'medium' | 'low';
  summaryModel: string;
  summaryError?: string;
}

export interface FirmResult {
  firm: FirmConfig;
  raw: RawItem[];
  new: NewItem[];
  summarized: SummarizedItem[];
  error?: {
    stage: 'fetch' | 'parse' | 'dedup' | 'summarize';
    message: string;
    stack?: string;
  };
  durationMs: number;
}

export interface RunReport {
  startedAt: string;
  finishedAt: string;
  firms: FirmResult[];
  digestSent: boolean;
  newItemTotal: number;
  errors: Array<{ firmId: string; message: string }>;
}

export interface SeenState {
  version: 1;
  lastUpdated: string | null;
  firms: Record<string, { urls: string[]; lastNewAt: string | null }>;
}

export interface RecipientConfig {
  recipient: string | string[];
}

export interface EmailPayload {
  subject: string;
  html: string;
  // nodemailer accepts string OR string[]; the mailer passes it through
  // unchanged. from stays a single address (the authenticated Gmail account).
  to: string | string[];
  from: string;
}
