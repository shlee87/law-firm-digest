// TEMPORARY — Phase 7 plan 04 debug; delete after use.
import { chromium } from 'playwright';

(async () => {
  const url = process.argv[2];
  if (!url) { console.error('usage: tsx scripts/debug-detail-dom.ts <url>'); process.exit(2); }
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const html = await page.content();
    console.log('bytes=' + html.length);
    const sels = [
      'article','main','#content','.view-content','.newsletter-view','.view-body',
      '.post-content','.leeko-newsletter','.leeko-new-newsletter','.content-area',
      '.newsletter-content','.newsletter-detail','.content-wrap',
      '.articlebox','.article-content','.article-body','.article_content','.article_body',
      '.news-detail','.news-view','.detail-content','.detail-view',
      '.leeko-new-newsletter-view','.leeko-newsletter-view',
      '#contents','.contents','.boardView','.board-view','.bbs-view','.bbs_view',
      '.entry-content','.entry-body','.board_view','.board_view_contents',
      '.newsletter_view','.newsletter_content','.newsletter_detail',
    ];
    const probes = await page.evaluate(function(sels: string[]) {
      const out: string[] = [];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el) {
          const txt = ((el as HTMLElement).innerText || '').replace(/\s+/g,' ');
          out.push(sel + ' LEN=' + txt.length + ' :: ' + txt.slice(0, 180));
        }
      }
      return out.join('\n');
    }, sels);
    console.log('--- hit probes ---');
    console.log(probes);
    const struct = await page.evaluate(function() {
      const out: string[] = [];
      const stack: Array<{ el: Element; depth: number }> = [{ el: document.body, depth: 0 }];
      while (stack.length > 0) {
        const { el, depth } = stack.shift()!;
        if (depth > 4) continue;
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0,3).map(function(c){return '.'+c;}).join('') : '';
        const id = el.id ? '#'+el.id : '';
        const ownTextNodes: string[] = [];
        for (const n of Array.from(el.childNodes)) {
          if (n.nodeType === 3) ownTextNodes.push(n.textContent || '');
        }
        const ownText = ownTextNodes.join(' ').replace(/\s+/g,' ').trim().slice(0,40);
        out.push('  '.repeat(depth) + el.tagName.toLowerCase() + id + cls + (ownText ? ' [t:'+ownText+']' : ''));
        if (depth < 4) {
          const children = Array.from(el.children);
          for (let i = children.length - 1; i >= 0; i--) {
            stack.unshift({ el: children[i], depth: depth + 1 });
          }
        }
      }
      return out.join('\n');
    });
    console.log('--- DOM structure (depth 4) ---');
    console.log(struct);
  } finally {
    await browser.close();
  }
})();
