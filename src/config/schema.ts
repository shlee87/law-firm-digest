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
    firms: z.array(FirmSchema).min(1),
  })
  .strict();

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
