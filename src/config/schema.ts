// zod 4 validation schemas for YAML config files.
//
// All three schemas use .strict() so unknown YAML keys fail validation —
// this enforces CONF-02 fail-fast policy: a typo like `nmae:` is surfaced
// at startup, not six hours later during a scrape.
//
// Phase 1 deliberately accepts only 'rss' | 'html' in FirmSchema; the
// 'js-render' tier is a Phase 4 extension and is NOT valid input today.

import { z } from 'zod';

export const FirmSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'id must be lowercase slug'),
    name: z.string().min(1),
    language: z.enum(['ko', 'en']),
    type: z.enum(['rss', 'html']),
    url: z.string().url(),
    timezone: z
      .string()
      .regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, 'IANA timezone like Asia/Seoul'),
    enabled: z.boolean().default(true),
    selectors: z
      .object({
        list_item: z.string(),
        title: z.string(),
        link: z.string().optional(),
        link_onclick_regex: z.string().optional(),
        link_template: z
          .string()
          .regex(
            /^(https?:\/\/|\/)/,
            'link_template must be absolute (https://...) or path-absolute (/...) per Pitfall 5',
          )
          .optional(),
        date: z.string().optional(),
        body: z.string().optional(),
      })
      .refine(
        (s) => !!s.link || (!!s.link_onclick_regex && !!s.link_template),
        {
          message:
            'Each firm needs either selectors.link OR (selectors.link_onclick_regex + selectors.link_template)',
        },
      )
      .optional(),
    user_agent: z.string().optional(),
    timeout_ms: z.number().int().positive().default(20000),
    include_keywords: z.array(z.string()).optional().default([]),
    exclude_keywords: z.array(z.string()).optional().default([]),
  })
  .strict();

export const FirmsConfigSchema = z
  .object({
    firms: z.array(FirmSchema).min(1),
  })
  .strict();

// recipient accepts either a single email or a non-empty list of emails —
// enables single-user self-send AND multi-user fan-out without a schema fork.
// The loader normalizes the RECIPIENT_EMAIL env var (comma-separated) into
// the same union before parsing.
const emailOrList = z.union([
  z.string().email(),
  z.array(z.string().email()).min(1),
]);

export const RecipientSchema = z
  .object({
    recipient: emailOrList,
  })
  .strict();
