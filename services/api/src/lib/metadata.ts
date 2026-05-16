/**
 * Metadata fetcher.
 *
 * Priority order:
 *   1. oEmbed  — YouTube and TikTok have official oEmbed endpoints. Use them.
 *   2. Open Graph — scrape og:title, og:description, og:site_name from the page HTML.
 *   3. Fallback — return empty strings; AI will work with what it has.
 *
 * For Instagram, we use the public /embed/ page to extract captions and
 * account names — no API token required. Falls back to OG scraping.
 */

export type SourcePlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'twitter'
  | 'web'
  | 'unknown';

export interface FetchedMetadata {
  platform: SourcePlatform;
  canonicalUrl: string;
  ogTitle: string | null;
  ogDescription: string | null;
  creatorName: string | null;
  /** Transcript of the video audio (via Whisper), if available. */
  transcript: string | null;
}

// ─── Platform detection ───────────────────────────────────────

export function detectPlatform(url: string): SourcePlatform {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace('www.', '');

    if (host === 'instagram.com') return 'instagram';
    if (host === 'tiktok.com' || host === 'vm.tiktok.com') return 'tiktok';
    if (
      host === 'youtube.com' ||
      host === 'youtu.be' ||
      host === 'm.youtube.com'
    )
      return 'youtube';
    if (host === 'twitter.com' || host === 'x.com') return 'twitter';

    return 'web';
  } catch {
    return 'unknown';
  }
}

// ─── URL canonicalization ─────────────────────────────────────

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'igshid', 'igsh', 'ref', 'si',
];

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.protocol = 'https:';

    // Strip tracking params.
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));

    // Normalize YouTube URLs to watch?v= form.
    if (url.hostname === 'youtu.be') {
      const videoId = url.pathname.slice(1);
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    if (
      url.hostname.includes('youtube.com') &&
      url.pathname === '/shorts/' + url.pathname.split('/').pop()
    ) {
      const videoId = url.pathname.split('/').pop();
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // Remove trailing slash.
    url.pathname = url.pathname.replace(/\/$/, '') || '/';

    return url.toString();
  } catch {
    return rawUrl;
  }
}

// ─── oEmbed fetchers ──────────────────────────────────────────

async function fetchYouTubeOEmbed(
  url: string,
): Promise<{ title: string | null; authorName: string | null }> {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { title: null, authorName: null };
    const data = (await res.json()) as { title?: string; author_name?: string };
    return {
      title: data.title ?? null,
      authorName: data.author_name ?? null,
    };
  } catch {
    return { title: null, authorName: null };
  }
}

async function fetchTikTokOEmbed(
  url: string,
): Promise<{ title: string | null; authorName: string | null }> {
  try {
    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { title: null, authorName: null };
    const data = (await res.json()) as { title?: string; author_name?: string };
    return {
      title: data.title ?? null,
      authorName: data.author_name ?? null,
    };
  } catch {
    return { title: null, authorName: null };
  }
}

// ─── Instagram embed scraper ─────────────────────────────────
// Instagram's /embed/ page is public and contains post metadata
// in script tags — no auth token required.

async function fetchInstagramEmbed(
  url: string,
): Promise<{
  title: string | null;
  description: string | null;
  creatorName: string | null;
  videoUrl: string | null;
}> {
  const empty = { title: null, description: null, creatorName: null, videoUrl: null };
  try {
    // Extract shortcode from URL: /p/ABC123/ or /reel/ABC123/
    const shortcode = url.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/)?.[2];
    if (!shortcode) return empty;

    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return empty;

    const html = await res.text();

    // The embed page stores post data inside a contextJSON field within a
    // PolarisEmbedSimple init call. The JSON is triple-escaped:
    //   \\\" for quotes, \\\\/ for slashes, \\\\n for newlines.
    // We extract fields with regex to avoid brittle full-JSON parsing.

    // Helper: unescape strings from contextJSON.
    // The embed HTML nests JSON inside a JS string, producing mixed escape
    // levels: some chars are \\\\u (quad-escaped), others \\u (double-escaped).
    const unescapeCtx = (s: string) =>
      s
        .replace(/\\\\n/g, '\n')
        .replace(/\\\\\//g, '/')
        .replace(/\\\\u([\da-fA-F]{4})/g, (_m, hex) =>
          String.fromCodePoint(parseInt(hex, 16)),
        )
        .replace(/\\\\"/g, '"')
        .replace(/\\\\/g, '')
        // Second pass for double-escaped unicode that wasn't caught above
        .replace(/\\u([\da-fA-F]{4})/g, (_m, hex) =>
          String.fromCodePoint(parseInt(hex, 16)),
        )
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\/g, '');

    // Username from owner object (handles varying levels of escaping)
    const creatorName =
      html.match(/owner[\\]*":[\\]*\{[^}]*?username[\\]*":[\\]*"([^"\\]+)/)?.[1] ?? null;

    // Caption text — stop at the closing of the text field.
    // The end pattern is: \"}  (escaped-quote, escaped-closing-brace)
    const captionRaw =
      html.match(
        /edge_media_to_caption[^]*?text[\\]*":[\\]*"((?:[^"]|(?<=\\)")*?)\\"\}/,
      )?.[1] ?? null;

    const cleanCaption = captionRaw ? unescapeCtx(captionRaw).trim() : null;
    const description = cleanCaption ? cleanCaption.slice(0, 2200) : null;
    const firstLine = cleanCaption?.split(/[\n.]/)?.[0]?.trim() ?? null;
    const title = firstLine && firstLine.length > 5 ? firstLine.slice(0, 120) : null;

    // Video URL — try multiple patterns since Instagram changes embed format.
    const videoUrlRaw =
      // Pattern 1: video_url in contextJSON (original format)
      html.match(/video_url[\\]*":[\\]*"((?:[^"\\]|\\[^"])*)\\"/)?.[1]
      // Pattern 2: video_url with different escaping (newer format)
      ?? html.match(/video_url\\?":\\?"(https?:[^"]+?)\\?"/)?.[1]
      // Pattern 3: contentUrl in JSON-LD structured data
      ?? html.match(/"contentUrl"\s*:\s*"(https?:[^"]+)"/)?.[1]
      // Pattern 4: og:video meta tag in the embed HTML itself
      ?? html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i)?.[1]
      // Pattern 5: video src attribute in embed HTML
      ?? html.match(/<video[^>]+src=["'](https?:[^"']+)["']/i)?.[1]
      ?? null;
    const videoUrl = videoUrlRaw
      ? unescapeCtx(videoUrlRaw)
      : null;

    console.log(
      `[metadata] Instagram embed: creator="${creatorName}" caption="${description?.slice(0, 80) ?? '[none]'}" video=${videoUrl ? 'YES' : 'NO'}`,
    );

    return { title, description, creatorName, videoUrl };
  } catch (err) {
    console.error('[metadata] Instagram embed fetch failed', err);
    return empty;
  }
}

// ─── Instagram GraphQL fallback ──────────────────────────────
// When the embed page doesn't expose a video_url, try Instagram's
// public GraphQL endpoint which often returns the video URL.

async function fetchInstagramGraphQLVideoUrl(
  shortcode: string,
): Promise<string | null> {
  try {
    const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode, child_comment_count: 0, fetch_comment_count: 0, parent_comment_count: 0, has_threaded_comments: false }))}`;
    const res = await fetch(graphqlUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.log(`[metadata] Instagram GraphQL fallback: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const media = data?.data?.shortcode_media;
    const videoUrl = media?.video_url ?? null;

    console.log(
      `[metadata] Instagram GraphQL fallback: video=${videoUrl ? 'YES' : 'NO'}`,
    );
    return videoUrl;
  } catch (err) {
    console.log('[metadata] Instagram GraphQL fallback failed:', err);
    return null;
  }
}

// ─── User agents ─────────────────────────────────────────────

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const BOT_UA =
  'Mozilla/5.0 (compatible; ActionVaultBot/1.0; +https://actionvault.app)';

// ─── HTML entity decoder ─────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—', '&lsquo;': '\u2018',
  '&rsquo;': '\u2019', '&ldquo;': '\u201c', '&rdquo;': '\u201d',
  '&bull;': '•', '&hellip;': '…',
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([\da-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

// ─── Open Graph scraper ───────────────────────────────────────

async function fetchOpenGraph(url: string, useBrowserUA = false): Promise<{
  title: string | null;
  description: string | null;
  videoUrl: string | null;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': useBrowserUA ? BROWSER_UA : BOT_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { title: null, description: null, videoUrl: null };

    const html = await res.text();

    // Minimal regex-based OG extraction — avoids a full HTML parser dependency.
    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
      null;

    const ogDescription =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      null;

    // Extract og:video for video content (Instagram reels, etc.)
    const videoUrl =
      html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:video:url["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video:url["']/i)?.[1] ??
      null;

    return {
      title: ogTitle ? decodeHtmlEntities(ogTitle.trim()) : null,
      description: ogDescription ? decodeHtmlEntities(ogDescription.trim()) : null,
      videoUrl: videoUrl?.trim() ?? null,
    };
  } catch {
    return { title: null, description: null, videoUrl: null };
  }
}

// ─── Main entry point ─────────────────────────────────────────

export async function fetchMetadata(rawUrl: string): Promise<FetchedMetadata> {
  const platform = detectPlatform(rawUrl);
  const canonicalUrl = canonicalizeUrl(rawUrl);

  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let creatorName: string | null = null;
  let transcript: string | null = null;

  if (platform === 'youtube') {
    const oembed = await fetchYouTubeOEmbed(canonicalUrl);
    ogTitle = oembed.title;
    creatorName = oembed.authorName;
    // YouTube OG description is usually just the channel name — skip scrape.
  } else if (platform === 'tiktok') {
    const oembed = await fetchTikTokOEmbed(canonicalUrl);
    ogTitle = oembed.title;
    creatorName = oembed.authorName;
  } else if (platform === 'instagram') {
    // Strategy: try embed page (has structured data) AND OG scrape (has caption
    // in og:title). Merge the best data from both. They run in parallel.
    const [embed, og] = await Promise.all([
      fetchInstagramEmbed(canonicalUrl),
      fetchOpenGraph(canonicalUrl, true),
    ]);

    // Prefer embed caption (clean), fall back to parsing OG title.
    // OG title format: "Creator Name on Instagram: "caption text""
    const ogCaptionMatch = og.title?.match(/on Instagram: [""\u201c](.+)[""\u201d]$/s);
    const ogCreatorMatch = og.title?.match(/^(.+?) on Instagram:/);

    ogDescription = embed.description
      ?? ogCaptionMatch?.[1]?.slice(0, 2200)
      ?? og.description;

    ogTitle = embed.title
      ?? (ogCaptionMatch?.[1]?.split(/[\n.]/)?.[0]?.trim()?.slice(0, 120))
      ?? og.title;

    creatorName = embed.creatorName
      ?? ogCreatorMatch?.[1]?.trim()
      ?? null;

    let videoUrl = embed.videoUrl ?? og.videoUrl;

    // Fallback: try Instagram's GraphQL endpoint if we still don't have a video URL.
    const shortcode = canonicalUrl.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/)?.[2];
    if (!videoUrl && shortcode) {
      videoUrl = await fetchInstagramGraphQLVideoUrl(shortcode);
    }

    // Transcribe the video audio if we got a video URL from either source.
    if (videoUrl) {
      const { transcribeVideoUrl } = await import('./transcribe');
      transcript = await transcribeVideoUrl(videoUrl);
    }

    console.log(
      `[metadata] instagram: creator="${creatorName}" caption="${ogDescription?.slice(0, 80) ?? '[none]'}" video=${videoUrl ? 'YES' : 'NO'} transcript=${transcript ? `${transcript.length} chars` : 'NO'}`,
    );
  } else if (platform === 'twitter') {
    const og = await fetchOpenGraph(canonicalUrl, true);
    ogTitle = og.title;
    ogDescription = og.description;
    console.log(`[metadata] ${platform} OG scrape: title="${ogTitle}" desc="${ogDescription?.slice(0, 80)}"`);
  } else {
    const og = await fetchOpenGraph(canonicalUrl);
    ogTitle = og.title;
    ogDescription = og.description;
  }

  return { platform, canonicalUrl, ogTitle, ogDescription, creatorName, transcript };
}
