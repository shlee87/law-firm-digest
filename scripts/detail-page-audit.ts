// Audit detail-page extraction across all HTML tier firms.
// For each firm: scrape list → fetch 2 different detail URLs → compare bodies.
// If bodies are identical across different URLs → SPA/generic-body bug.
import { decodeCharsetAwareFetch, extractBody } from '../src/scrapers/util.js';
import { scrapeHtml } from '../src/scrapers/html.js';
import { loadFirms } from '../src/config/loader.js';

const firms = await loadFirms();
const htmlFirms = firms.filter((f) => f.type === 'html');
console.log(`Testing ${htmlFirms.length} html-tier firms\n`);

for (const firm of htmlFirms) {
  console.log(`══ ${firm.id} ══`);
  try {
    const items = await scrapeHtml(firm as Parameters<typeof scrapeHtml>[0]);
    if (items.length < 2) {
      console.log(`  SKIP: ${items.length} items (need 2+ for comparison)\n`);
      continue;
    }
    const bodies: { url: string; title: string; body: string; bodyHash: string }[] = [];
    for (const item of items.slice(0, 2)) {
      try {
        const { html } = await decodeCharsetAwareFetch(item.url);
        const body = extractBody(html, firm.selectors?.body);
        const hash = `${body.length}:${body.slice(0, 50).replace(/\s+/g, '')}`;
        bodies.push({ url: item.url, title: item.title, body, bodyHash: hash });
      } catch (e) {
        console.log(`  FETCH FAIL for "${item.title.slice(0, 40)}...": ${(e as Error).message}`);
      }
    }
    if (bodies.length < 2) {
      console.log(`  only ${bodies.length} successful fetches, inconclusive\n`);
      continue;
    }
    const [a, b] = bodies;
    const identical = a.bodyHash === b.bodyHash;
    console.log(`  item 1: "${a.title.slice(0, 50)}" → body ${a.body.length} chars`);
    console.log(`  item 2: "${b.title.slice(0, 50)}" → body ${b.body.length} chars`);
    if (identical) {
      console.log(`  ⚠ BUG: both items returned IDENTICAL body (${a.body.length} chars) — SPA / generic landing page`);
    } else {
      console.log(`  ✓ bodies differ — detail extraction working`);
    }
  } catch (e) {
    console.log(`  LIST SCRAPE ERROR: ${(e as Error).message}`);
  }
  console.log();
}
