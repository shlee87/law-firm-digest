// TEMPORARY — Phase 7 plan 04 debug; delete after use.
import { chromium } from 'playwright';

(async () => {
  const url = process.argv[2];
  if (!url) { console.error('usage: tsx scripts/debug-detail-dom2.ts <url>'); process.exit(2); }
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Dump leeko-board-detail contents
    const detailDump = await page.evaluate(function() {
      const el = document.querySelector('.leeko-board-detail');
      if (!el) return 'no .leeko-board-detail';
      const html = el.innerHTML.slice(0, 3000);
      const text = ((el as HTMLElement).innerText || '').replace(/\s+/g,' ');
      return 'TEXT_LEN=' + text.length + '\n--- TEXT ---\n' + text.slice(0, 800) + '\n--- HTML (truncated) ---\n' + html;
    });
    console.log(detailDump);

    // Also list all direct children
    const children = await page.evaluate(function() {
      const el = document.querySelector('.leeko-board-detail');
      if (!el) return 'none';
      const out: string[] = [];
      const walk = function(node: Element, depth: number, maxDepth: number) {
        const cls = typeof node.className === 'string' ? node.className.split(/\s+/).filter(Boolean).map(function(c){return '.'+c;}).join('') : '';
        const id = node.id ? '#'+node.id : '';
        const txt = ((node as HTMLElement).innerText || '').replace(/\s+/g,' ').slice(0,80);
        out.push('  '.repeat(depth) + node.tagName.toLowerCase() + id + cls + ' [text_len=' + ((node as HTMLElement).innerText||'').length + '] ' + txt);
        if (depth < maxDepth) for (const c of Array.from(node.children)) walk(c, depth+1, maxDepth);
      };
      walk(el, 0, 5);
      return out.join('\n');
    });
    console.log('--- tree ---');
    console.log(children);
  } finally {
    await browser.close();
  }
})();
