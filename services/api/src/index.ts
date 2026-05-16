import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze';
import { itemsRouter } from './routes/items';
import { supabase } from './lib/supabase';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Auto-apply v2 migration (idempotent) ─────────────────────
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
}

// ─── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' })); // tighten in production
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
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
