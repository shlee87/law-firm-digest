// YAML config loaders with fail-fast zod validation.
//
// loadRecipient: reads config/recipient.yaml, validates via RecipientSchema,
// returns RECIPIENT_EMAIL env var if set (D-05 env-wins), else the YAML value.
// Both sources support single string OR list-of-strings; env input uses
// comma-separated form (e.g. "a@x.com,b@y.com") which is split+trimmed and
// re-validated through the same schema so a typo fails fast at startup.
// ZodError propagates on invalid input — main.ts top-level catch scrubs+logs.
//
// loadFirms: reads config/firms.yaml, validates via FirmsConfigSchema using
// safeParse so the formatted error tree can be printed to stderr, then
// filters to enabled === true firms. FirmsConfigSchema.min(1) guarantees
// a non-empty array; an empty firms: [] fails validation (CONF-01).
//
// Paths are hardcoded — plan 01-11 orchestrator calls these with no args.

import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import { FirmsConfigSchema, RecipientSchema } from './schema.js';
import type { FirmConfig } from '../types.js';

export async function loadRecipient(): Promise<string | string[]> {
  const text = await readFile('config/recipient.yaml', 'utf8');
  const yaml = parse(text);
  const parsed = RecipientSchema.parse(yaml);

  const envVal = process.env.RECIPIENT_EMAIL;
  if (envVal) {
    const candidate: string | string[] = envVal.includes(',')
      ? envVal
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : envVal;
    // Re-validate env input through the same schema — catches "a@x.com,"
    // trailing-comma artifacts, malformed emails, or single-element lists.
    const envParsed = RecipientSchema.parse({ recipient: candidate });
    return envParsed.recipient;
  }
  return parsed.recipient;
}

export async function loadFirms(): Promise<FirmConfig[]> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  return result.data.firms.filter((f) => f.enabled) as FirmConfig[];
}
