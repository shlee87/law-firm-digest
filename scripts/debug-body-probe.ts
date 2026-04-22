// TEMPORARY debug probe for Phase 7 plan 04 — lee-ko/barun body lengths.
// DELETE after use; not to be committed.
import { loadFirms } from '../src/config/loader.js';
import { fetchAll } from '../src/pipeline/fetch.js';
import { enrichWithBody } from '../src/pipeline/enrichBody.js';
import { Recorder } from '../src/observability/recorder.js';
import { chromium } from 'playwright';

const firmId = process.argv[2];
if (!firmId) {
  console.error('Usage: tsx scripts/debug-body-probe.ts <firm-id>');
  process.exit(2);
}

(async () => {
  const firms = (await loadFirms()).filter((f) => f.id === firmId);
  if (firms.length === 0) {
    console.error('Firm not found: ' + firmId);
    process.exit(1);
  }
  const recorder = new Recorder();
  const browser = await chromium.launch({ headless: true });
  try {
    const fetched = await fetchAll(firms, recorder, browser);
    const enriched = await enrichWithBody(fetched, browser);
    for (const r of enriched) {
      console.log('firm=' + r.firm.id + ' items=' + r.raw.length + ' err=' + (r.error ? r.error.message : '-'));
      for (let i = 0; i < r.raw.length; i++) {
        const item = r.raw[i];
        const body = item.description || '';
        console.log('  [' + i + '] url=' + item.url);
        console.log('      title=' + item.title.slice(0, 100));
        console.log('      body_len=' + body.length);
        console.log('      body_head=' + body.slice(0, 200).replace(/\s+/g, ' '));
      }
    }
  } finally {
    await browser.close();
  }
})();
