import { scrapeRss } from '../src/scrapers/rss.js';
import { loadFirms } from '../src/config/loader.js';

async function main() {
  const firms = await loadFirms();
  const items = await scrapeRss(firms[0]);
  console.log('Total items:', items.length);
  for (const it of items.slice(0, 3)) {
    console.log('---');
    console.log('title:', it.title);
    console.log('desc?  ', typeof it.description, it.description?.length ?? 'undef');
    console.log('preview:', it.description?.slice(0, 120));
  }
  const d = items.find((i) => i.url.includes('delaware'));
  console.log('---DELAWARE---');
  console.log('desc type:', typeof d?.description);
  console.log('desc length:', d?.description?.length);
  console.log('desc preview:', d?.description?.slice(0, 200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
