/**
 * /items routes
 *
 * GET    /items          — list all items for the authenticated user
 * GET    /items/:id      — single item + action tasks
 * PATCH  /items/:id      — update status, manual_note, or title
 * DELETE /items/:id      — hard delete item (cascades to action_tasks)
 *
 * PATCH  /items/:id/tasks/:taskId — update a single action task's status
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export const itemsRouter = Router();

// ── All routes require auth ────────────────────────────────────
itemsRouter.use(requireAuth);

// ─── GET /items ───────────────────────────────────────────────

const listQuerySchema = z.object({
  status: z.string().optional(),           // comma-separated statuses
  category: z.string().optional(),
  search: z.string().optional(),
  section: z.enum(['general', 'travel', 'food', 'ai', 'money']).optional(),
  view: z.enum(['full', 'card', 'slim']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

itemsRouter.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { status, category, section, view, limit, offset } = parsed.data;

  const selectColumns = view === 'slim'
    ? `id, source_url, source_platform, creator_name, title, summary,
       primary_category, tags, actionable, confidence_score,
       extraction_quality, status, created_at, analyzed_at,
       section`
    : view === 'card'
      ? `id, source_url, source_platform, creator_name, title, summary,
         primary_category, tags, actionable, confidence_score,
         extraction_quality, status, created_at, analyzed_at,
         section, section_data`
      : `id, source_url, source_platform, creator_name, title, summary,
         primary_category, tags, actionable, confidence_score,
         extraction_quality, status, created_at, analyzed_at,
         section, section_data,
         action_tasks(id)`;

  let query: any = supabase
    .from('items')
    .select(selectColumns as any, { count: 'exact' })
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    query = query.in('status', statuses);
  }

  if (category) {
    query = query.eq('primary_category', category);
  }

  if (section) {
    // Include both explicit section and matching category for backward compatibility.
    if (section === 'ai') query = query.or('section.eq.ai,primary_category.eq.AI');
    else if (section === 'money') query = query.or('section.eq.money,primary_category.eq.Money');
    else if (section === 'travel') query = query.or('section.eq.travel,primary_category.eq.Travel');
    else if (section === 'food') query = query.or('section.eq.food,primary_category.eq.Food');
    else query = query.eq('section', 'general');
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[items] list error', error);
    return res.status(500).json({ error: 'Failed to fetch items' });
  }

  // Attach action_count to each item instead of the full tasks array (full view only).
  const items = ((data ?? []) as any[]).map((item) => {
    if (view === 'slim' || view === 'card') return item;
    return ({
      ...item,
      action_count: Array.isArray(item.action_tasks) ? item.action_tasks.length : 0,
      action_tasks: undefined,
    });
  });

  return res.json({ items, total: count ?? items.length });
});

// ─── GET /items/summary ───────────────────────────────────────
// Counts + latest items for fast app startup.

itemsRouter.get('/summary', async (req, res) => {
  const userId = req.userId;

  const [all, ai, money, travel, food, latest] = await Promise.all([
    (supabase.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId) as any),
    (supabase.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId).or('section.eq.ai,primary_category.eq.AI') as any),
    (supabase.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId).or('section.eq.money,primary_category.eq.Money') as any),
    (supabase.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId).or('section.eq.travel,primary_category.eq.Travel') as any),
    (supabase.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId).or('section.eq.food,primary_category.eq.Food') as any),
    ((supabase
      .from('items')
      .select(
        `id, source_url, source_platform, creator_name, title, summary,
         primary_category, tags, actionable, confidence_score,
         extraction_quality, status, created_at, analyzed_at,
         section`,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)) as any),
  ]);

  if (latest.error) {
    console.error('[items] summary latest error', latest.error);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }

  return res.json({
    totals: {
      all: all.count ?? 0,
      ai: ai.count ?? 0,
      money: money.count ?? 0,
      travel: travel.count ?? 0,
      food: food.count ?? 0,
    },
    latest: latest.data ?? [],
  });
});

// ─── GET /items/:id ───────────────────────────────────────────

itemsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: item, error } = await supabase
    .from('items')
    .select(`*, action_tasks(*)`)
    .eq('id', id)
    .eq('user_id', req.userId)
    .single();

  if (error || !item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Sort action tasks by sort_order.
  if (Array.isArray(item.action_tasks)) {
    item.action_tasks.sort(
      (a: { sort_order: number }, b: { sort_order: number }) =>
        a.sort_order - b.sort_order,
    );
  }

  return res.json({ item });
});

// ─── PATCH /items/:id ─────────────────────────────────────────

const updateItemSchema = z.object({
  status: z
    .enum(['inbox', 'reviewed', 'archived', 'completed'])
    .optional(),
  manual_note: z.string().max(1000).nullable().optional(),
  title: z.string().max(120).optional(),
});

itemsRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // Filter out undefined keys so we don't unintentionally null them.
  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data: item, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.userId)
    .select('*')
    .single();

  if (error || !item) {
    return res.status(404).json({ error: 'Item not found or update failed' });
  }

  return res.json({ item });
});

// ─── DELETE /items/:id ────────────────────────────────────────

itemsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id)
    .eq('user_id', req.userId);

  if (error) {
    console.error('[items] delete error', error);
    return res.status(500).json({ error: 'Delete failed' });
  }

  return res.status(204).send();
});

// ─── PATCH /items/:id/tasks/:taskId ──────────────────────────

const updateTaskSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'dismissed']),
});

itemsRouter.patch('/:id/tasks/:taskId', async (req, res) => {
  const { id, taskId } = req.params;

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const completed_at =
    parsed.data.status === 'completed' ? new Date().toISOString() : null;

  const { data: task, error } = await supabase
    .from('action_tasks')
    .update({ status: parsed.data.status, completed_at })
    .eq('id', taskId)
    .eq('item_id', id)
    .eq('user_id', req.userId)
    .select('*')
    .single();

  if (error || !task) {
    return res.status(404).json({ error: 'Task not found or update failed' });
  }

  return res.json({ task });
});
