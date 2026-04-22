// scripts/sync-schedule.ts
// config/settings.yaml의 schedule 설정을 읽어 .github/workflows/daily.yml의
// cron 줄을 자동으로 업데이트합니다.
//
// 사용법: pnpm sync-schedule

import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { SettingsSchema } from '../src/config/schema.js';
import { toCron } from '../src/config/loader.js';

const text = await readFile('config/settings.yaml', 'utf8');
const yaml = parse(text);
const result = SettingsSchema.safeParse(yaml);
if (!result.success) {
  console.error('config/settings.yaml 오류:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

const cron = toCron(result.data.schedule);
const { time_utc, days } = result.data.schedule;

const workflowPath = '.github/workflows/daily.yml';
const workflow = await readFile(workflowPath, 'utf8');

const cronRe = /( +- cron: ')[^']*(')/;
if (!cronRe.test(workflow)) {
  console.error('daily.yml에서 cron 줄을 찾지 못했습니다. 파일 형식을 확인하세요.');
  process.exit(1);
}

const updated = workflow.replace(cronRe, `$1${cron}$2`);
await writeFile(workflowPath, updated, 'utf8');
console.log(`✓ daily.yml 업데이트 완료`);
console.log(`  time_utc: ${time_utc}, days: ${days} → cron: '${cron}'`);
