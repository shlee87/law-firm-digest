#!/usr/bin/env -S pnpm tsx
// Throwaway Playwright probe for Phase 4 plan 07 — verifies wait_for + list_item
// + title + link selectors for a candidate js-render firm against its live page.
// NOT shipped in production; lives in scripts/ alongside debug-rss.ts.
//
// Usage:
//   pnpm tsx scripts/probe-js-render.ts \
//     --firm lee-ko \
//     --url "https://www.leeko.com/leenko/news/newsLetterList.do?lang=KR" \
//     --wait-for "ul#contentsList > li" \
//     --list-item "ul#contentsList > li" \
//     --title ".title" \
//     --link "a" \
//     [--language ko] [--timezone Asia/Seoul]
//
// Alternative link shape (firms using onclick JS-handlers instead of href):
//   ... --link-onclick-regex "goDetail\\('([0-9]+)'\\)" \
//       --link-template "/leenko/news/newsLetterView.do?lang=KR&newsletterNo={1}"
// (One of --link OR --link-onclick-regex + --link-template is required —
//  maps to the same two-branch link resolution in parseListItemsFromHtml.)
//
// Output:
//   [probe] firm=lee-ko url=https://... wait_for=ul#contentsList > li
//   [probe] launching chromium ...
//   [probe] waitForSelector resolved in 1842ms
//   [probe] extracted 12 items. First 3:
//     1. "News Letter Vol. 2026-04 (세법 개정안 분석)" → https://www.leeko.com/...
//     2. "..." → https://...
//     3. "..." → https://...
//   [probe] done (total 3124ms)
//
// Exit codes:
//   0: probe completed, at least 1 item extracted
//   1: selector-miss (wait_for matched but extraction returned 0 items)
//   2: playwright-timeout (wait_for exceeded 15s)
//   3: browser-launch-fail or navigation error
//   4: usage error (bad argv)

import { chromium } from 'playwright';
import { scrapeJsRender } from '../src/scrapers/jsRender.js';
import type { FirmConfig } from '../src/types.js';

interface ParsedArgs {
  firm: string;
  url: string;
  waitFor: string;
  listItem: string;
  title: string;
  link?: string;
  linkOnclickRegex?: string;
  linkTemplate?: string;
  language: 'ko' | 'en';
  timezone: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const v = args[i + 1];
    if (!v || v.startsWith('--')) return undefined;
    return v;
  };
  const firm = get('firm');
  const url = get('url');
  const waitFor = get('wait-for');
  const listItem = get('list-item');
  const title = get('title');
  const link = get('link');
  const linkOnclickRegex = get('link-onclick-regex');
  const linkTemplate = get('link-template');
  // Either --link, OR --link-onclick-regex + --link-template — matches the
  // two-branch resolution in parseListItemsFromHtml (src/scrapers/util.ts).
  const hasLinkDirect = !!link;
  const hasLinkOnclick = !!linkOnclickRegex && !!linkTemplate;
  if (!firm || !url || !waitFor || !listItem || !title || (!hasLinkDirect && !hasLinkOnclick)) {
    console.error(
      'Usage: pnpm tsx scripts/probe-js-render.ts --firm <id> --url <url> --wait-for <sel> --list-item <sel> --title <sel> (--link <sel> | --link-onclick-regex <re> --link-template <tpl>) [--language ko|en] [--timezone <IANA>]',
    );
    process.exit(4);
  }
  return {
    firm,
    url,
    waitFor,
    listItem,
    title,
    link,
    linkOnclickRegex,
    linkTemplate,
    language: (get('language') as 'ko' | 'en') ?? 'ko',
    timezone: get('timezone') ?? 'Asia/Seoul',
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);
  console.log(
    `[probe] firm=${args.firm} url=${args.url} wait_for=${args.waitFor}`,
  );
  console.log('[probe] launching chromium ...');
  const started = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const firm: FirmConfig = {
      id: args.firm,
      name: args.firm,
      language: args.language,
      type: 'js-render',
      url: args.url,
      timezone: args.timezone,
      enabled: true,
      wait_for: args.waitFor,
      selectors: {
        list_item: args.listItem,
        title: args.title,
        // parseListItemsFromHtml treats link='' + link_onclick_regex+link_template
        // as the onclick branch; give it undefined (not '') so the branch selects
        // cleanly even if --link was omitted entirely.
        link: args.link,
        link_onclick_regex: args.linkOnclickRegex,
        link_template: args.linkTemplate,
      },
    };
    const probeStart = Date.now();
    const items = await scrapeJsRender(firm, browser);
    console.log(
      `[probe] extracted ${items.length} items (waitForSelector + extract: ${Date.now() - probeStart}ms).`,
    );
    if (items.length === 0) {
      console.log('[probe] SELECTOR-MISS — 0 items');
      return 1;
    }
    console.log('[probe] First 3:');
    for (let i = 0; i < Math.min(3, items.length); i++) {
      console.log(`  ${i + 1}. "${items[i].title}" → ${items[i].url}`);
    }
    return 0;
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[probe] ERROR: ${msg}`);
    if (/playwright-timeout/i.test(msg)) return 2;
    if (/browser-launch-fail|chromium/i.test(msg)) return 3;
    return 3;
  } finally {
    await browser.close();
    console.log(`[probe] done (total ${Date.now() - started}ms)`);
  }
}

main().then((code) => process.exit(code));
