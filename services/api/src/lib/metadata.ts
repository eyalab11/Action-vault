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

import OpenAI from 'openai';

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
  /** Public media/thumbnail URLs extracted from the source post, if available. */
  mediaUrls: string[];
  /** Transcript of the video audio (via Whisper), if available. */
  transcript: string | null;
  /** OCR + visual notes from image/carousel posts, if available. */
  visualContext: string | null;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  imageUrls: string[];
}> {
  const empty = { title: null, description: null, creatorName: null, videoUrl: null, imageUrls: [] };
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

    const imageUrls =
      extractInstagramCarouselImageUrls(html, unescapeCtx) ??
      extractInstagramImageUrls(html, unescapeCtx);

    console.log(
      `[metadata] Instagram embed: creator="${creatorName}" caption="${description?.slice(0, 80) ?? '[none]'}" video=${videoUrl ? 'YES' : 'NO'} images=${imageUrls.length}`,
    );

    return { title, description, creatorName, videoUrl, imageUrls };
  } catch (err) {
    console.error('[metadata] Instagram embed fetch failed', err);
    return empty;
  }
}

/**
 * Prefer extracting ordered carousel images from edge_sidecar_to_children, when present.
 * Returns null when the post doesn't look like a carousel.
 */
function extractInstagramCarouselImageUrls(
  html: string,
  unescapeCtx: (s: string) => string,
): string[] | null {
  const idx = html.indexOf('edge_sidecar_to_children');
  if (idx < 0) return null;

  // Keep the slice relatively small but large enough to contain all child nodes.
  const tail = html.slice(idx, idx + 160_000);
  const end = tail.search(/edge_media_to_caption|edge_media_to_comment|edge_media_preview_like|edge_media_to_tagged_user/);
  const segment = end > 0 ? tail.slice(0, end) : tail;

  const urls: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (raw: string) => {
    if (!raw) return;
    const url = decodeHtmlEntities(unescapeCtx(raw)).trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (/\.mp4(\?|$)/i.test(url)) return;
    // Dedupe by base URL without query string.
    const key = url.split('?')[0];
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(url);
  };

  // Most embed HTML is escaped; keep a fallback for unescaped variants.
  for (const match of segment.matchAll(/display_url[\\]*":[\\]*"((?:[^"\\]|\\[^"])*)\\"/g)) {
    pushUrl(match[1]);
  }
  for (const match of segment.matchAll(/display_url":"([^"]+)"/g)) {
    pushUrl(match[1]);
  }

  return urls.length ? urls.slice(0, 10) : null;
}

function extractInstagramImageUrls(
  html: string,
  unescapeCtx: (s: string) => string,
): string[] {
  const urls = new Set<string>();
  const patterns = [
    /display_url[\\]*":[\\]*"((?:[^"\\]|\\[^"])*)\\"/g,
    /thumbnail_src[\\]*":[\\]*"((?:[^"\\]|\\[^"])*)\\"/g,
    /"image"\s*:\s*"([^"]+)"/g,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const url = decodeHtmlEntities(unescapeCtx(raw)).trim();
      if (/^https?:\/\//.test(url) && /\.(jpe?g|png|webp)(\?|$)/i.test(url)) {
        urls.add(url);
      }
    }
  }

  return [...urls].slice(0, 10);
}

async function fetchImageAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://www.instagram.com/',
        Origin: 'https://www.instagram.com',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) return null;

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function analyzeInstagramImages(
  imageUrls: string[],
  caption: string | null,
): Promise<string | null> {
  if (imageUrls.length === 0 || !process.env.OPENAI_API_KEY) return null;

  const images: { index: number; dataUrl: string }[] = [];
  let idx = 1;
  for (const imageUrl of imageUrls.slice(0, 10)) {
    const dataUrl = await fetchImageAsDataUrl(imageUrl);
    if (dataUrl) images.push({ index: idx, dataUrl });
    idx += 1;
  }
  if (images.length === 0) return null;

  try {
    const chunks = chunk(images, 4);
    const perImageLines: string[] = [];
    const visibleTextSet = new Set<string>();
    const entitySet = new Set<string>();
    const locationSet = new Set<string>();
    const summaries: string[] = [];
    const confidences: string[] = [];

    for (const batch of chunks) {
      const result = await analyzeInstagramImageBatch(batch, caption);
      if (result.summary) summaries.push(result.summary);
      if (result.confidence) confidences.push(result.confidence);
      for (const line of result.perImageLines) perImageLines.push(line);
      for (const t of result.visibleText) visibleTextSet.add(t);
      for (const e of result.entities) entitySet.add(e);
      for (const l of result.locations) locationSet.add(l);
    }

    // Prefer a single concise summary (first batch) but keep per-image fidelity.
    const summary = summaries.find(Boolean) ?? '';
    const visibleText = [...visibleTextSet];
    const entities = [...entitySet];
    const locations = [...locationSet];
    const confidence = confidences.includes('high') ? 'high' : (confidences.includes('medium') ? 'medium' : 'low');

    const parts = [
      summary ? `Visual summary: ${summary}` : null,
      perImageLines.length ? `Per-image details:\n${perImageLines.join('\n')}` : null,
      visibleText.length ? `Visible text/OCR: ${visibleText.join(' | ')}` : null,
      entities.length ? `Named entities / repos / tools / URLs: ${entities.join(', ')}` : null,
      locations.length ? `Locations mentioned visually: ${locations.join(', ')}` : null,
      `Visual confidence: ${confidence}`,
    ].filter(Boolean);

    return parts.length ? parts.join('\n') : null;
  } catch (err) {
    console.error('[metadata] Instagram image analysis failed', err);
    return null;
  }
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function analyzeInstagramImageBatch(
  batch: { index: number; dataUrl: string }[],
  caption: string | null,
): Promise<{
  summary: string;
  perImageLines: string[];
  visibleText: string[];
  entities: string[];
  locations: string[];
  confidence: 'high' | 'medium' | 'low';
}> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text:
        'You are extracting facts from Instagram carousel images for ActionVault.\n' +
        'For EACH image, extract visible text/OCR and any exact names of: places, restaurants, landmarks, cities, countries, repos, tools, websites, and URLs.\n' +
        'Be literal and preserve the exact names you can see.\n' +
        'Do not infer the rest of a carousel from the caption or from one image. If only one image is provided, describe only that image and set confidence low/medium unless it clearly contains the full content.\n' +
        'Return JSON only with keys:\n' +
        '- visual_summary (string)\n' +
        '- per_image (array of {index:number, description:string, visible_text:string[], entities:string[], locations:string[]})\n' +
        '- visible_text (string[])\n' +
        '- entities (string[])\n' +
        '- locations (string[])\n' +
        '- confidence (high|medium|low)\n' +
        `Caption (may be noisy):\n${caption ?? '[none]'}\n` +
        `Images in this batch (in order): ${batch.map((b) => b.index).join(', ')}`,
    },
    ...batch.flatMap((b) => ([
      { type: 'text' as const, text: `Image index: ${b.index}` },
      { type: 'image_url' as const, image_url: { url: b.dataUrl, detail: 'high' as const } },
    ])),
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [{ role: 'user', content }],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as {
    visual_summary?: unknown;
    per_image?: unknown;
    visible_text?: unknown;
    entities?: unknown;
    locations?: unknown;
    confidence?: unknown;
  };

  const summary = typeof parsed.visual_summary === 'string' ? parsed.visual_summary.trim() : '';
  const visibleText = Array.isArray(parsed.visible_text)
    ? parsed.visible_text.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  const entities = Array.isArray(parsed.entities)
    ? parsed.entities.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  const locations = Array.isArray(parsed.locations)
    ? parsed.locations.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  const confidence = (parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low')
    ? parsed.confidence
    : 'medium';

  const perImageLines = Array.isArray(parsed.per_image)
    ? parsed.per_image
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const row = entry as {
            index?: unknown;
            description?: unknown;
            visible_text?: unknown;
            entities?: unknown;
            locations?: unknown;
          };
          const index = typeof row.index === 'number' ? row.index : null;
          const description = typeof row.description === 'string' ? row.description.trim() : '';
          const text = Array.isArray(row.visible_text)
            ? row.visible_text.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            : [];
          const rowEntities = Array.isArray(row.entities)
            ? row.entities.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            : [];
          const rowLocations = Array.isArray(row.locations)
            ? row.locations.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            : [];
          const details = [
            description,
            text.length ? `text=${text.join(' | ')}` : null,
            rowEntities.length ? `entities=${rowEntities.join(', ')}` : null,
            rowLocations.length ? `locations=${rowLocations.join(', ')}` : null,
          ].filter(Boolean);
          if (!details.length) return null;
          return `Image ${index ?? '?'}: ${details.join('; ')}`;
        })
        .filter((v): v is string => typeof v === 'string')
    : [];

  return { summary, perImageLines, visibleText, entities, locations, confidence };
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
  let mediaUrls: string[] = [];
  let transcript: string | null = null;
  let visualContext: string | null = null;

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
    mediaUrls = embed.imageUrls;
    visualContext = await analyzeInstagramImages(embed.imageUrls, ogDescription);

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
      `[metadata] instagram: creator="${creatorName}" caption="${ogDescription?.slice(0, 80) ?? '[none]'}" video=${videoUrl ? 'YES' : 'NO'} transcript=${transcript ? `${transcript.length} chars` : 'NO'} visual=${visualContext ? 'YES' : 'NO'}`,
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

  return { platform, canonicalUrl, ogTitle, ogDescription, creatorName, mediaUrls, transcript, visualContext };
}
