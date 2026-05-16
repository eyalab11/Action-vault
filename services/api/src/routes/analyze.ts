/**
 * POST /analyze
 *
 * The core MVP endpoint. Receives a URL, runs the full pipeline synchronously,
 * saves the result to the database, and returns the enriched item.
 *
 * Typical response time: 5–12 seconds (dominated by two GPT-4o calls).
 * The mobile app shows a loading state during this time.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { fetchMetadata } from '../lib/metadata';
import { analyzeItem, extractActions } from '../lib/ai-pipeline';
import { supabase } from '../lib/supabase';

export const analyzeRouter = Router();

const analyzeBodySchema = z.object({
  url: z.string().url('Must be a valid URL'),
  manual_note: z.string().max(1000).optional(),
});

analyzeRouter.post('/', requireAuth, async (req, res) => {
  // ── 1. Validate input ─────────────────────────────────────
  const parsed = analyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { url, manual_note } = parsed.data;
  const userId = req.userId;

  console.log(`[analyze] user=${userId} url=${url}`);

  // ── 2. Fetch metadata ─────────────────────────────────────
  const metadata = await fetchMetadata(url);
  console.log(`[analyze] platform=${metadata.platform} ogTitle=${metadata.ogTitle}`);

  // ── 3. AI Stage 1 — classify + summarize ──────────────────
  const analysis = await analyzeItem({
    platform: metadata.platform,
    url: metadata.canonicalUrl,
    ogTitle: metadata.ogTitle,
    ogDescription: metadata.ogDescription,
    creatorName: metadata.creatorName,
    manualNote: manual_note ?? null,
    transcript: metadata.transcript,
  });

  console.log(
    `[analyze] title="${analysis.title}" category=${analysis.primary_category} ` +
    `actionable=${analysis.actionable} confidence=${analysis.confidence_score}`,
  );

  // ── 4. AI Stage 2 — extract actions (if actionable) ───────
  let actionSteps: { order: number; title: string; description: string | null }[] = [];

  if (analysis.actionable) {
    const extraction = await extractActions({
      title: analysis.title,
      summary: analysis.summary,
      category: analysis.primary_category,
      tags: analysis.tags,
      manualNote: manual_note ?? null,
    });
    actionSteps = extraction.action_steps;
    console.log(`[analyze] extracted ${actionSteps.length} action steps`);
  }

  // ── 5. Determine item status ───────────────────────────────
  // If extraction quality is low or failed, mark for review so the
  // user knows to add a note. Otherwise go straight to inbox.
  const status =
    analysis.extraction_quality === 'failed' ||
    analysis.extraction_quality === 'low'
      ? 'needs_review'
      : 'inbox';

  // ── 6. Save item to database ───────────────────────────────
  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      user_id: userId,
      source_url: url,
      canonical_url: metadata.canonicalUrl,
      source_platform: metadata.platform,
      manual_note: manual_note ?? null,
      og_title: metadata.ogTitle,
      og_description: metadata.ogDescription,
      creator_name: metadata.creatorName,
      // AI results
      title: analysis.title,
      summary: analysis.summary,
      primary_category: analysis.primary_category,
      tags: analysis.tags,
      actionable: analysis.actionable,
      confidence_score: analysis.confidence_score,
      extraction_quality: analysis.extraction_quality,
      status,
      analyzed_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (itemError || !item) {
    console.error('[analyze] DB insert failed', itemError);
    return res.status(500).json({ error: 'Failed to save item' });
  }

  // ── 7. Save action tasks ───────────────────────────────────
  let savedTasks: object[] = [];

  if (actionSteps.length > 0) {
    const tasksToInsert = actionSteps.map((step) => ({
      user_id: userId,
      item_id: item.id,
      title: step.title,
      description: step.description,
      sort_order: step.order,
    }));

    const { data: tasks, error: tasksError } = await supabase
      .from('action_tasks')
      .insert(tasksToInsert)
      .select('*');

    if (tasksError) {
      // Non-fatal — item is saved, tasks failed. Log and continue.
      console.error('[analyze] action_tasks insert failed', tasksError);
    } else {
      savedTasks = tasks ?? [];
    }
  }

  // ── 8. Return full item + tasks ────────────────────────────
  return res.status(201).json({
    item: { ...item, action_tasks: savedTasks },
  });
});
