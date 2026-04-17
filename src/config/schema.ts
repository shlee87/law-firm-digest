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
        link: z.string(),
        date: z.string().optional(),
      })
      .optional(),
    user_agent: z.string().optional(),
    timeout_ms: z.number().int().positive().default(20000),
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
