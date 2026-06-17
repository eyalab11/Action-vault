import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze';
import { itemsRouter } from './routes/items';
import { supabase } from './lib/supabase';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Auto-apply idempotent DB helpers when installed ──────────
async function applyMigration() {
  try {
    // Add section + section_data columns if they don't exist
    await supabase.rpc('apply_v2_migration' as any);
    console.log('[startup] v2 migration applied (or already exists)');
  } catch {
    // Function may not exist yet — try direct ALTER TABLE as fallback
    try {
      const { error } = await supabase.from('items').select('section').limit(1);
      if (error?.message?.includes('column') || error?.message?.includes('section')) {
        console.warn('[startup] section column missing — please run db/migrations/002_sections.sql in Supabase SQL Editor');
      } else {
        console.log('[startup] section column already exists');
      }
    } catch (e) {
      console.warn('[startup] could not verify migration status', e);
    }
  }

  try {
    await supabase.rpc('apply_v3_media_migration' as any);
    console.log('[startup] v3 media migration applied (or already exists)');
  } catch {
    try {
      const { error } = await supabase.from('items').select('media_urls, visual_context').limit(1);
      if (error?.message?.includes('column') || error?.message?.includes('media_urls') || error?.message?.includes('visual_context')) {
        console.warn('[startup] media columns missing — run db/migrations/003_item_media.sql in Supabase SQL Editor to persist post images');
      } else {
        console.log('[startup] media columns already exist');
      }
    } catch (e) {
      console.warn('[startup] could not verify media migration status', e);
    }
  }
}

// ─── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' })); // tighten in production
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── Supabase keepalive ───────────────────────────────────────
// Scheduled pings call this endpoint so the free Supabase project sees real DB
// activity even when the mobile app is idle for long stretches.
app.get('/keepalive', async (_req, res) => {
  const { data, error } = await supabase
    .from('items')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[keepalive] Supabase ping failed', error);
    return res.status(500).json({ ok: false, error: 'Supabase keepalive failed' });
  }

  return res.json({
    ok: true,
    db: true,
    rowsRead: data?.length ?? 0,
    ts: new Date().toISOString(),
  });
});

// ─── Public image proxy for mobile WebView map popups ──────────
// Instagram/CDN images can reject direct hotlinking inside the Leaflet WebView.
// Proxy only known social image hosts and stream them with browser-like headers.
app.get('/media/proxy', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).send('Invalid image URL');
  }

  const host = target.hostname.toLowerCase();
  const allowed =
    target.protocol === 'https:' &&
    (
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'cdninstagram.com' ||
      host.endsWith('.cdninstagram.com') ||
      host.endsWith('.fbcdn.net') ||
      host.endsWith('.fbsbx.com')
    );

  if (!allowed) return res.status(403).send('Image host not allowed');

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://www.instagram.com/',
        Origin: 'https://www.instagram.com',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (!upstream.ok) return res.status(upstream.status).send('Image fetch failed');
    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return res.status(415).send('Not an image');

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).send('Image too large');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    console.error('[media/proxy] failed', err);
    return res.status(502).send('Image proxy failed');
  }
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/analyze', analyzeRouter);
app.use('/items', itemsRouter);

// ─── Global error handler ─────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`ActionVault API running on http://localhost:${PORT}`);
  await applyMigration();
});
