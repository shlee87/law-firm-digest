// Logging utility — secret scrubbing + shared User-Agent string.
//
// scrubSecrets is the ONLY sanctioned error-message transformer; every
// error-handling site in the pipeline must route user-facing error text
// through this helper before logging (COMP-01 / Pitfall #8).
//
// USER_AGENT is the single source of truth for FETCH-04 politeness; fetch
// orchestrators and feedparser clients import it from here.

const SECRET_ENV_VARS = ['GEMINI_API_KEY', 'GMAIL_APP_PASSWORD'] as const;

export const USER_AGENT =
  'LegalNewsletterBot/1.0 (+https://github.com/shlee87/law-firm-digest)';

export function scrubSecrets(input: string): string {
  let out = input;
  for (const key of SECRET_ENV_VARS) {
    const val = process.env[key];
    // Length gate (>8) guards against false-positive replacement on
    // accidentally-short values like "" or a literal test placeholder.
    if (val && val.length > 8) {
      out = out.split(val).join('***REDACTED***');
    }
  }
  return out;
}
