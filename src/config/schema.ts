// zod 4 validation schemas for YAML config files.
//
// All three schemas use .strict() so unknown YAML keys fail validation —
// this enforces CONF-02 fail-fast policy: a typo like `nmae:` is surfaced
// at startup, not six hours later during a scrape.
//
// Phase 1 accepts rss | html; Phase 4 adds 'js-render' (requires wait_for).
// The superRefine below enforces wait_for presence/absence by tier.

import { z } from 'zod';

/**
 * Generalized link extraction for selectors.link (object form).
 *
 * Use this when the firm's anchor doesn't expose the article URL directly
 * via the href attribute — e.g. href contains a JavaScript expression like
 * "javascript:doView(12345)", or the URL ID lives in data-* / onclick / any
 * other attribute. The extractor reads `attribute` from the element matched
 * by `selector`, optionally applies `regex` to extract IDs, and optionally
 * substitutes capture groups into `template` to build the final URL.
 *
 * Examples:
 *   yoon-yang:    { selector: 'a', regex: 'doView\\((\\d+)\\)', template: '/.../view?id={1}' }
 *   future data-id firm: { selector: 'a', attribute: 'data-id', regex: '(\\d+)', template: '/article/{1}' }
 *   plain href via object: { selector: 'a' }   // equivalent to string form 'a'
 *
 * The `regex` and `template` fields are co-required: presence of one without
 * the other is a validation error (see refine below).
 */
const LinkExtractorSchema = z
  .object({
    selector: z.string().min(1),
    attribute: z.string().min(1).default('href'),
    regex: z.string().optional(),
    template: z
      .string()
      .regex(
        /^(https?:\/\/|\/)/,
        'link.template must be absolute (https://...) or path-absolute (/...) per Pitfall 5',
      )
      .optional(),
  })
  .strict()
  .refine(
    (l) => (!l.regex && !l.template) || (!!l.regex && !!l.template),
    {
      message:
        'link.regex and link.template must be present together (or both absent for plain attribute extraction)',
    },
  );

export const FirmSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'id must be lowercase slug'),
    name: z.string().min(1),
    language: z.enum(['ko', 'en']),
    type: z.enum(['rss', 'html', 'js-render', 'sitemap']),
    url: z.string().url(),
    timezone: z
      .string()
      .regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, 'IANA timezone like Asia/Seoul'),
    enabled: z.boolean().default(true),
    wait_for: z.string().min(1).optional(),
    selectors: z
      .object({
        list_item: z.string(),
        title: z.string(),
        // Phase 4.1: link accepts EITHER a plain CSS-selector string (legacy,
        // 5 existing firms unchanged) OR a LinkExtractorSchema object
        // describing attribute-based extraction (covers yoon-yang's
        // href="javascript:doView(N)" shape and any future data-* pattern).
        link: z.union([z.string(), LinkExtractorSchema]).optional(),
        // DEPRECATED — superseded by selectors.link object form (Phase 4.1). Kept
        // for backward compat: kim-chang and bkl still use these fields. New firms
        // should use the object form: link: { selector, attribute, regex, template }.
        link_onclick_regex: z.string().optional(),
        link_template: z
          .string()
          .regex(
            /^(https?:\/\/|\/)/,
            'link_template must be absolute (https://...) or path-absolute (/...) per Pitfall 5',
          )
          .optional(),
        date: z.string().optional(),
        body: z.string().optional(),
      })
      .refine(
        (s) => !!s.link || (!!s.link_onclick_regex && !!s.link_template),
        {
          message:
            'Each firm needs either selectors.link OR (selectors.link_onclick_regex + selectors.link_template)',
        },
      )
      .optional(),
    user_agent: z.string().optional(),
    timeout_ms: z.number().int().positive().default(20000),
    include_keywords: z.array(z.string()).optional().default([]),
    exclude_keywords: z.array(z.string()).optional().default([]),
    // Phase 7 DETAIL-01/05. Governs the DETAIL fetch path independently of
    // `type` (which governs list-page fetch). 'js-render' makes enrichBody
    // always route detail fetches through Playwright (D-07 — no static
    // attempt). Defaults to 'static' so unmodified firms keep exact
    // Phase 1-6 semantics (DETAIL-03 backwards compat literal).
    detail_tier: z.enum(['js-render', 'static']).default('static').optional(),
    // Phase 9 SITEMAP-03: top-N most-recent articles for sitemap tier.
    // Only valid when type === 'sitemap' (enforced by superRefine below).
    // Default (10) lives at scrapers/sitemap.ts#DEFAULT_LATEST_N, NOT here —
    // keeps the `latest_n: 10` YAML line explicit per CONTEXT D-06.
    latest_n: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((firm, ctx) => {
    // Phase 4 rule — wait_for required iff type === 'js-render'.
    if (firm.type === 'js-render') {
      if (!firm.wait_for || firm.wait_for.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'firms[].wait_for is required when type === "js-render"',
          path: ['wait_for'],
        });
      }
    } else if (firm.wait_for !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firms[].wait_for is only valid when type === "js-render"',
        path: ['wait_for'],
      });
    }

    // Phase 9 rules — sitemap tier forbids selectors / detail_tier;
    // latest_n is exclusive to sitemap tier.
    if (firm.type === 'sitemap') {
      if (firm.selectors !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'firms[].selectors is not valid for type === "sitemap" (body selector is hardcoded via the generic extractBody chain — see Phase 9 D-11)',
          path: ['selectors'],
        });
      }
      // NOTE: zod applies `.default('static')` to detail_tier on every
      // parse regardless of whether the YAML author wrote the field, so a
      // raw `firm.detail_tier !== undefined` check would reject every
      // legal sitemap firm that omits the field (Rule 1 bug surfaced by
      // schema-test 'accepts type: sitemap with url and optional latest_n').
      // Narrow the check to the only value a user can meaningfully assert
      // on a sitemap firm — 'js-render' — since 'static' is indistinguishable
      // from the zod-injected default. The implicit-js-render contract for
      // sitemap tier still holds: enrichBody routes sitemap through
      // Playwright unconditionally (plan 09-03 D-05).
      //
      // KNOWN SOFT-VIOLATION (WR-03): a user who explicitly writes
      // `detail_tier: 'static'` on a sitemap firm passes schema but is
      // silently ignored by enrichBody's OR-gate. Documented in
      // config/firms.yaml `detail_tier` field comment so non-developer
      // operators do not waste time setting it. Proper fix requires
      // distinguishing supplied vs injected default (zod v4 `.catch()`
      // or loader post-parse normalization); deferred as a follow-up
      // because it touches FirmSchema backwards compat across all tiers.
      if (firm.detail_tier === 'js-render') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'firms[].detail_tier is implicit for type === "sitemap" — remove the field (sitemap tier always routes through Playwright detail fetch per Phase 9 D-05)',
          path: ['detail_tier'],
        });
      }
    } else if (firm.latest_n !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firms[].latest_n is only valid when type === "sitemap"',
        path: ['latest_n'],
      });
    }
  });

export const FirmsConfigSchema = z
  .object({
    // Phase 12 D-06: global topic keyword config. Optional so existing firms.yaml
    // files without the block still parse. Default {} passes an empty-topics
    // fast-path in applyTopicFilter (all items pass when no topics configured).
    topics: z.record(z.string(), z.array(z.string())).optional().default({}),
    // Global exclude keywords — applied to ALL firms before Gemini summarization.
    // Merged into each firm's exclude_keywords by loadFirms() so applyKeywordFilter
    // sees them transparently.
    global_exclude_keywords: z.array(z.string()).optional().default([]),
    firms: z.array(FirmSchema).min(1),
  })
  .strict();

// Default prompt instruction strings — single source of truth.
// Imported by src/summarize/prompt.ts as fallback when promptConfig is absent.
export const DEFAULT_INSTRUCTION_KO =
  '독자는 바쁜 변호사 및 법률 전문가입니다. 아래 순서로 2~4줄 요약을 작성하세요.\n1. 핵심 법적 사안 (규제·판례·거래·입법 중 무엇인지, 구체적으로)\n2. 영향받는 대상 (기업·업종·투자자 등)\n3. 실무 시사점 (대응 방향 또는 주의할 점)\n법률 용어는 그대로 보존하고, 일반적 설명 없이 핵심만 기술하세요.';
export const DEFAULT_INSTRUCTION_EN =
  'Readers are Korean lawyers and legal professionals who need to quickly grasp\nindustry trends. Summarize in Korean (한국어), 2~4 sentences:\n1. The core legal development (regulation, ruling, deal, or legislation — be specific)\n2. Who is affected (companies, sectors, investors)\n3. Practical implication (what to watch or do)\nPreserve legal terms. Be precise, not general.';

// settings.yaml — runtime toggles readable by non-developers.
// All fields have safe defaults so a partial or missing settings.yaml
// never hard-fails; only unknown keys (strict) and bad types fail-fast.
export const SettingsSchema = z
  .object({
    recipient: z
      .object({
        email: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
      })
      .strict()
      .default({ email: 'your.email@example.com' }),
    schedule: z
      .object({
        time_utc: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'HH:MM 형식으로 입력하세요 (예: 00:00)')
          .default('00:00'),
        days: z.enum(['daily', 'weekdays', 'weekends', 'weekly', 'biweekly']).default('daily'),
      })
      .strict()
      .default({ time_utc: '00:00', days: 'daily' }),
    gemini: z
      .object({
        primary_model: z.string().default('gemini-2.5-flash'),
        fallback_model: z.string().default('gemini-2.5-flash-lite'),
        concurrency: z.number().int().min(1).max(10).default(3),
      })
      .strict()
      .default({ primary_model: 'gemini-2.5-flash', fallback_model: 'gemini-2.5-flash-lite', concurrency: 3 }),
    digest: z
      .object({
        min_body_chars: z.number().int().min(0).default(100),
      })
      .strict()
      .default({ min_body_chars: 100 }),
    prompt: z
      .object({
        instruction_ko: z.string().min(1).default(DEFAULT_INSTRUCTION_KO),
        instruction_en: z.string().min(1).default(DEFAULT_INSTRUCTION_EN),
      })
      .strict()
      .default({ instruction_ko: DEFAULT_INSTRUCTION_KO, instruction_en: DEFAULT_INSTRUCTION_EN }),
  })
  .strict()
  .default({
    recipient: { email: 'your.email@example.com' },
    schedule: { time_utc: '00:00', days: 'daily' },
    gemini: { primary_model: 'gemini-2.5-flash', fallback_model: 'gemini-2.5-flash-lite', concurrency: 3 },
    digest: { min_body_chars: 100 },
    prompt: { instruction_ko: DEFAULT_INSTRUCTION_KO, instruction_en: DEFAULT_INSTRUCTION_EN },
  });

export type Settings = z.infer<typeof SettingsSchema>;

// recipient accepts either a single email or a non-empty list of emails —
// enables single-user self-send AND multi-user fan-out without a schema fork.
// The loader normalizes the RECIPIENT_EMAIL env var (comma-separated) into
// the same union before parsing.
const emailOrList = z.union([
  z.string().email(),
  z.array(z.string().email()).min(1),
]);

export const RecipientSchema = z
  .object({
    recipient: emailOrList,
  })
  .strict();
