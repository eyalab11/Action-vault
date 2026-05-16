import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze';
import { itemsRouter } from './routes/items';

const app = express();
const PORT = process.env.PORT ?? 3001;

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

app.listen(PORT, () => {
  console.log(`ActionVault API running on http://localhost:${PORT}`);
});
