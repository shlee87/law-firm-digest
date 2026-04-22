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
// filters to enabled === true firms by default. Pass {includeDisabled: true}
// to include ALL firms (including disabled ones such as cooley) — used by the
// Phase 6 audit probe and future sitemap pre/post baseline runs (D-05).
// FirmsConfigSchema.min(1) guarantees a non-empty array; an empty firms: []
// fails validation (CONF-01).
//
// Paths are hardcoded — plan 01-11 orchestrator calls these with no args.

import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import { FirmsConfigSchema, RecipientSchema, SettingsSchema } from './schema.js';
import type { FirmConfig, TopicConfig } from '../types.js';
import type { Settings } from './schema.js';

export async function loadRecipient(): Promise<string | string[]> {
  const envVal = process.env.RECIPIENT_EMAIL;
  if (envVal) {
    const candidate: string | string[] = envVal.includes(',')
      ? envVal
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : envVal;
    const envParsed = RecipientSchema.parse({ recipient: candidate });
    return envParsed.recipient;
  }
  const settings = await loadSettings();
  return settings.recipient.email;
}

export interface LoadFirmsOptions {
  includeDisabled?: boolean;
}

export async function loadFirms(
  options: LoadFirmsOptions = {},
): Promise<FirmConfig[]> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  const globalExc = result.data.global_exclude_keywords ?? [];
  const all = result.data.firms.map((f) => ({
    ...f,
    exclude_keywords: [...(f.exclude_keywords ?? []), ...globalExc],
  })) as FirmConfig[];
  return options.includeDisabled ? all : all.filter((f) => f.enabled);
}

// loadSettings: reads config/settings.yaml with full defaults so a missing
// or partial file never hard-fails. Unknown keys still throw (strict mode).
export async function loadSettings(): Promise<Settings> {
  let text: string;
  try {
    text = await readFile('config/settings.yaml', 'utf8');
  } catch {
    // File absent → all defaults apply (first-run / no settings.yaml).
    return SettingsSchema.parse({});
  }
  const yaml = parse(text);
  const result = SettingsSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/settings.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid settings.yaml');
  }
  return result.data;
}

// toCron: converts human-readable schedule fields to a GitHub Actions cron string.
// Called by scripts/sync-schedule.ts to update .github/workflows/daily.yml.
export function toCron(schedule: { time_utc: string; days: string }): string {
  const [hoursStr, minutesStr] = schedule.time_utc.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (schedule.days === 'biweekly') {
    // 매달 1일·15일 실행 (격주 근사 — cron에 정확한 격주 지원 없음)
    return `${minutes} ${hours} 1,15 * *`;
  }
  const daysPart =
    schedule.days === 'weekdays' ? '1-5' :
    schedule.days === 'weekends' ? '0,6' :
    schedule.days === 'weekly' ? '1' : // 매주 월요일
    '*';
  return `${minutes} ${hours} * * ${daysPart}`;
}

// Phase 12 D-06: load the topics: block from config/firms.yaml.
// Reuses the same FirmsConfigSchema parse path as loadFirms so validation
// errors surface with the same formatted output. Returns TopicConfig (which
// defaults to {} when the topics: key is absent from the YAML).
export async function loadTopics(): Promise<TopicConfig> {
  const text = await readFile('config/firms.yaml', 'utf8');
  const yaml = parse(text);
  const result = FirmsConfigSchema.safeParse(yaml);
  if (!result.success) {
    console.error('config/firms.yaml validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid firms.yaml');
  }
  return result.data.topics as TopicConfig;
}
