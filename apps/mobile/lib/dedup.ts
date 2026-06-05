/**
 * URL normalization + item deduplication.
 *
 * Why: the backend creates a new item every time /analyze is called, even for
 * a URL it already has. Users who share the same Instagram reel twice end up
 * with two cards. Worse, Instagram appends a per-share `igsh=` tracking param,
 * so the raw `source_url` differs each time even though the content is the same.
 *
 * The fix is client-side: normalize aggressively, group items by the normalized
 * URL, and keep the best/most-recent representative.
 */

import type { Item } from './api';

/** Query params that are share-tracking noise — strip before comparing. */
const TRACKING_PARAMS = new Set([
  'igsh',         // Instagram share tracking
  'igshid',       // older Instagram share id
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid',       // Facebook click id
  'gclid',        // Google click id
  '_branch_match_id',
  'si',           // YouTube share id
  'feature',      // YouTube
  'ref', 'ref_src', 'ref_url',
  't',            // YouTube/Twitter timestamp — keep? user might want it. Drop for dedup.
  'mc_cid', 'mc_eid',
]);

/**
 * Produce a canonical URL key for dedup comparison.
 * Lowercase host, strip trailing slash on path, drop tracking params, drop fragment.
 * Does NOT mutate the original URL — only used for comparison.
 */
export function normalizeUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  let trimmed = raw.trim();
  // Strip any leading text before the URL (Instagram sometimes prepends a message)
  const m = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (m) trimmed = m[0];

  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, ''); // strip trailing slashes
    if (path === '') path = '/';

    // Keep only non-tracking query params, sorted for stable comparison.
    const kept: [string, string][] = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
    });
    kept.sort(([a], [b]) => a.localeCompare(b));
    const qs = kept.map(([k, v]) => `${k}=${v}`).join('&');

    return `${u.protocol}//${host}${path}${qs ? '?' + qs : ''}`;
  } catch {
    // Not a valid URL — fall back to raw, lowercased, no whitespace.
    return trimmed.toLowerCase();
  }
}

export interface DedupedItem extends Item {
  /** How many raw items collapsed into this card. 1 = unique, >1 = duplicate group. */
  dupCount: number;
  /** All raw items in this group, newest first. */
  duplicates: Item[];
}

/** Pick the "best" representative from a group of identical-URL items. */
function pickRepresentative(group: Item[]): Item {
  // Prefer: highest extraction_quality (high > medium > low > failed), then highest action_count, then newest.
  const QUALITY_RANK: Record<string, number> = { high: 4, medium: 3, low: 2, failed: 1 };
  return [...group].sort((a, b) => {
    const qa = QUALITY_RANK[a.extraction_quality ?? ''] ?? 0;
    const qb = QUALITY_RANK[b.extraction_quality ?? ''] ?? 0;
    if (qa !== qb) return qb - qa;
    const ac = a.action_count ?? 0;
    const bc = b.action_count ?? 0;
    if (ac !== bc) return bc - ac;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

/**
 * Group items by normalized URL and return one representative per group,
 * annotated with the duplicate count + the underlying duplicates.
 * Output is sorted newest-first by the representative's created_at.
 */
export function dedupItems(items: readonly Item[]): DedupedItem[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = normalizeUrl(item.source_url);
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }

  const out: DedupedItem[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const rep = pickRepresentative(group);
    out.push({ ...rep, dupCount: group.length, duplicates: sorted });
  }

  out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return out;
}

/**
 * Pre-analyze check: find an existing item whose URL normalizes to the same key.
 * Used to skip re-analyzing a link the user already saved.
 */
export function findExistingItem(items: readonly Item[], rawUrl: string): Item | null {
  const target = normalizeUrl(rawUrl);
  if (!target) return null;
  for (const it of items) {
    if (normalizeUrl(it.source_url) === target) return it;
  }
  return null;
}
