/**
 * 테스트용: 각 로펌에서 아이템 1개씩 실제 메일 발송.
 *
 * run.ts 파이프라인을 그대로 따르되 두 가지만 오버라이드:
 *   - seen state → 빈 상태 (dedup 우회 — 모든 아이템이 "new")
 *   - writeState 스킵 (seen.json 변경 없음)
 *
 * 아이템 선택 전략 (per firm):
 *   1. topic-matching 아이템이 있으면 → 그 중 가장 최신 1개
 *   2. 없으면 → 전체 raw에서 topic-matching 아이템 검색 → 가장 최신 1개
 *   3. 그래도 없으면 → 가장 최신 raw 아이템 1개 (fetch 동작 확인 목적)
 *
 * keyword filter, Gemini 요약, hallucination detection 등
 * 나머지 파이프라인 스텝은 실제 프로덕션과 동일하게 동작.
 *
 * 실행: pnpm tsx scripts/send-test-all-firms.ts
 */

import 'dotenv/config';
import pLimit from 'p-limit';
import { chromium, type Browser } from 'playwright';
import { loadFirms, loadRecipient, loadTopics } from '../src/config/loader.js';
import { fetchAll } from '../src/pipeline/fetch.js';
import { enrichWithBody } from '../src/pipeline/enrichBody.js';
import { applyKeywordFilter, isTopicRelevant } from '../src/pipeline/filter.js';
import { detectHallucinationClusters } from '../src/pipeline/detectClusters.js';
import { detectLowConfidence } from '../src/pipeline/detectLowConfidence.js';
import { summarize } from '../src/summarize/gemini.js';
import { composeDigest } from '../src/compose/digest.js';
import { sendMail } from '../src/mailer/gmail.js';
import { detectStaleness } from '../src/observability/staleness.js';
import { Recorder } from '../src/observability/recorder.js';
import type { FirmResult, RawItem, SummarizedItem, SeenState, TopicConfig } from '../src/types.js';

const now = new Date();

// 빈 seen state — 모든 아이템이 "new"로 취급됨 (dedup 우회)
const EMPTY_SEEN: SeenState = { version: 1, lastUpdated: null, firms: {} };

/**
 * 로펌의 raw 아이템 목록에서 실제 키워드 매칭 아이템 중 가장 최신 1개 반환.
 * D-11(빈 body 자동 통과) 배제 — 엄격 매칭만 사용.
 * 매칭 아이템이 없으면 null (해당 로펌은 메일에서 제외).
 */
function pickBestItem(raw: RawItem[], topics: TopicConfig): RawItem | null {
  const allKeywords = Object.values(topics).flat();
  if (allKeywords.length === 0) return raw[0]; // topics 비설정 시 첫 번째

  return raw.find((item) => {
    const body = item.description ?? '';
    if (!body.trim()) return false; // 엄격 매칭: 빈 body는 false
    const haystack = (item.title + ' ' + body.slice(0, 500)).toLowerCase();
    return allKeywords.some((k) => haystack.includes(k.toLowerCase()));
  }) ?? null;
}

async function main() {
  const allFirms = await loadFirms();
  const recipient = await loadRecipient();
  const topics = await loadTopics();
  const fromAddr =
    process.env.GMAIL_FROM_ADDRESS ??
    (Array.isArray(recipient) ? recipient[0] : recipient);

  const enabledFirms = allFirms.filter((f) => f.enabled);
  console.log(`[test] ${enabledFirms.length}개 로펌 페치 시작`);

  const hasJsRender = enabledFirms.some(
    (f) => f.type === 'js-render' || f.detail_tier === 'js-render' || f.type === 'sitemap',
  );
  let browser: Browser | undefined;
  if (hasJsRender) {
    browser = await chromium.launch({ headless: true });
  }

  try {
    const recorder = new Recorder();
    const warnings = detectStaleness(EMPTY_SEEN, allFirms, now);

    // Step 5: fetch
    const fetched = await fetchAll(enabledFirms, recorder, browser);

    // Step 6: enrich body
    const enriched = await enrichWithBody(fetched, browser);

    // Step 7: keyword filter (프로덕션과 동일)
    const keywordFiltered = applyKeywordFilter(enriched);

    // Step 7.5 (test override): 실제 키워드 매칭 아이템만 선택.
    // 매칭 없는 로펌은 제외. dedupAll 미사용 — bootstrap guard 우회, 직접 NewItem 승격.
    const onePerFirm: FirmResult[] = keywordFiltered
      .filter((r) => !r.error && r.raw.length > 0)
      .flatMap((r) => {
        const best = pickBestItem(r.raw, topics);
        if (!best) {
          console.log(`  ✗ no match  ${r.firm.name}`);
          return [];
        }
        console.log(`  ✓ topic     ${r.firm.name}: ${best.title}`);
        return [{ ...r, raw: [best], new: [{ ...best, isNew: true as const }] }];
      });

    // Step 9: Gemini 요약 (프로덕션과 동일)
    const summarizeLimit = pLimit(3);
    console.log(`\n[test] Gemini 요약 중...`);
    const summarized: FirmResult[] = await Promise.all(
      onePerFirm.map(async (r) => {
        if (r.error || r.new.length === 0) return r;
        const out: SummarizedItem[] = await Promise.all(
          r.new.map((item) =>
            summarizeLimit(async (): Promise<SummarizedItem> => {
              const body = item.description ?? '';
              if (body.trim().length < 100) {
                return {
                  ...item,
                  summary_ko: item.title,
                  summaryConfidence: 'low' as const,
                  summaryModel: 'skipped',
                };
              }
              return summarize(item, body);
            }),
          ),
        );
        return { ...r, summarized: out };
      }),
    );

    // hallucination cluster detection (프로덕션과 동일)
    const clusterResult = detectHallucinationClusters(summarized);
    const clusterAdjusted = clusterResult.firms;
    const markers = [
      ...clusterResult.markers,
      ...detectLowConfidence(clusterAdjusted),
    ];

    // 에러 로펌 추가
    const errorFirms = enriched.filter((r) => !!r.error);
    const allResults = [...clusterAdjusted, ...errorFirms];

    const newTotal = clusterAdjusted.reduce((n, r) => n + r.summarized.length, 0);
    console.log(`\n[test] ${newTotal}개 아이템 — 메일 발송 시작`);

    if (newTotal === 0) {
      console.log('[test] 수집된 아이템 없음 — 메일 발송 취소');
      return;
    }

    const payload = composeDigest(allResults, recipient, fromAddr, warnings, now, markers);
    console.log(`[test] 발송: ${payload.subject}`);
    await sendMail(payload);
    console.log('[test] 메일 발송 완료 (seen.json 변경 없음)');
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error('[test] 실패:', err);
  process.exit(1);
});
