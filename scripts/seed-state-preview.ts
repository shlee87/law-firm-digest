// scripts/seed-state-preview.ts
// One-off helper to seed state/seen.json with "most URLs already seen" so
// a following `pnpm dry-run` shows a rich digest (several firms × 1-2 "new"
// items) without actually sending email. Drops the top 1 URL per firm so
// each firm contributes one fresh item to the preview digest.
//
// Usage:
//   # backup first
//   cp state/seen.json state/seen.json.bak
//   pnpm tsx scripts/seed-state-preview.ts
//   pnpm dry-run
//   # restore
//   cp state/seen.json.bak state/seen.json

import 'dotenv/config';
import { writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { loadFirms } from '../src/config/loader.js';
import { fetchAll } from '../src/pipeline/fetch.js';

const DROP_PER_FIRM = 1;

async function main() {
  const firms = await loadFirms('config/firms.yaml');
  console.log(`Fetching ${firms.length} enabled firm(s)…`);

  const hasBrowserDep = firms.some(
    (f) => f.type === 'js-render' || f.type === 'sitemap',
  );
  const browser = hasBrowserDep ? await chromium.launch() : undefined;

  try {
    const results = await fetchAll(firms, undefined, browser);

    const state: {
      version: 1;
      lastUpdated: string;
      firms: Record<
        string,
        { urls: string[]; lastNewAt?: string }
      >;
    } = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      firms: {},
    };

    for (const r of results) {
      if (r.error) {
        console.log(`  ${r.firm.id}: ERROR — skipping`);
        continue;
      }
      const allUrls = r.raw.map((item) => item.url);
      const seenUrls = allUrls.slice(DROP_PER_FIRM); // drop top N
      const newPreviewCount = allUrls.length - seenUrls.length;
      state.firms[r.firm.id] = {
        urls: seenUrls,
        lastNewAt: new Date().toISOString(),
      };
      console.log(
        `  ${r.firm.id}: ${allUrls.length} fetched, ${seenUrls.length} marked-seen, ${newPreviewCount} will appear as new`,
      );
    }

    writeFileSync('state/seen.json', JSON.stringify(state, null, 2));
    console.log(
      `\nSeeded state/seen.json with ${Object.keys(state.firms).length} firms.`,
    );
    console.log(`Now run: pnpm dry-run`);
    console.log(`Restore with: cp state/seen.json.bak state/seen.json`);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
