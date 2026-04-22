import 'dotenv/config';
import { chromium } from 'playwright';
import { loadFirms } from '../src/config/loader.js';
import { fetchAll } from '../src/pipeline/fetch.js';
import { enrichWithBody } from '../src/pipeline/enrichBody.js';
import { Recorder } from '../src/observability/recorder.js';

const allFirms = await loadFirms();
const firms = allFirms.filter((f) => ['logos', 'yoon-yang'].includes(f.id));

const hasJs = firms.some((f) => f.type === 'js-render' || f.detail_tier === 'js-render');
const browser = hasJs ? await chromium.launch({ headless: true }) : undefined;

const fetched = await fetchAll(firms, new Recorder(), browser);
const enriched = await enrichWithBody(fetched, browser);

for (const r of enriched) {
  if (r.error) { console.log(`${r.firm.id}: ERROR ${r.error.message}`); continue; }
  console.log(`\n=== ${r.firm.name} (${r.raw.length} items) ===`);
  for (const item of r.raw.slice(0, 3)) {
    const body = item.description ?? '';
    console.log(`  [${body.length}자] ${item.title}`);
    if (body.length > 0) console.log(`    → "${body.slice(0, 100)}"`);
  }
}

if (browser) await browser.close();
