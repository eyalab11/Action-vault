/**
 * URL normalization for server-side idempotency.
 *
 * Goal: avoid running expensive AI analysis twice for the same shared URL.
 * Keep this logic aligned with the mobile client's `apps/mobile/lib/dedup.ts`.
 */
const TRACKING_PARAMS = new Set([
  'igsh',
  'igshid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  '_branch_match_id',
  'si',
  'feature',
  'ref',
  'ref_src',
  'ref_url',
  't',
  'mc_cid',
  'mc_eid',
]);

/**
 * Produce a canonical URL key for dedup comparison.
 * Lowercase host, strip trailing slash on path, drop tracking params, drop fragment.
 */
export function normalizeUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  let trimmed = raw.trim();

  // Strip any leading text before the URL (some share sheets include extra text)
  const m = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (m) trimmed = m[0];

  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';

    const kept: [string, string][] = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
    });
    kept.sort(([a], [b]) => a.localeCompare(b));
    const qs = kept.map(([k, v]) => `${k}=${v}`).join('&');

    return `${u.protocol}//${host}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

