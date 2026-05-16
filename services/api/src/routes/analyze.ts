/**
 * POST /analyze
 *
 * v2: runs base analysis + section-specific extraction in parallel.
 * Returns item with section, section_data, and action_tasks.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth';
import { fetchMetadata } from '../lib/metadata';
import { analyzeItem, extractActions, extractSectionData, detectSection } from '../lib/ai-pipeline';
import { supabase } from '../lib/supabase';

export const analyzeRouter = Router();

const bodySchema = z.object({
  url: z.string().url('Must be a valid URL'),
  manual_note: z.string().max(1000).optional(),
});

analyzeRouter.post('/', requireAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { url, manual_note } = parsed.data;
  const userId = req.userId;
  console.log(`[analyze] user=${userId} url=${url}`);

  // 1. Fetch metadata
  const metadata = await fetchMetadata(url);
  console.log(`[analyze] platform=${metadata.platform} title=${metadata.ogTitle}`);

  // 2. Stage 1 — base analysis
  const analysis = await analyzeItem({
    platform: metadata.platform,
    url: metadata.canonicalUrl,
    ogTitle: metadata.ogTitle,
    ogDescription: metadata.ogDescription,
    creatorName: metadata.creatorName,
    manualNote: manual_note ?? null,
    transcript: metadata.transcript,
  });

  // 3. Detect section
  const section = detectSection(analysis.primary_category, analysis.tags, analysis.title, analysis.summary);
  console.log(`[analyze] section=${section} category=${analysis.primary_category}`);

  // 4. Stage 2 + Stage 3 — run in parallel
  const [actionsResult, sectionResult] = await Promise.all([
    analysis.actionable
      ? extractActions({ title: analysis.title, summary: analysis.summary, category: analysis.primary_category, tags: analysis.tags, manualNote: manual_note ?? null })
      : Promise.resolve({ action_steps: [], action_confidence: 0, action_notes: '' }),
    extractSectionData(section, analysis, metadata.transcript),
  ]);

  console.log(`[analyze] actions=${actionsResult.action_steps.length} section_data_keys=${Object.keys(sectionResult.section_data).length}`);

  // 5. Status
  const status = (analysis.extraction_quality === 'failed' || analysis.extraction_quality === 'low') ? 'needs_review' : 'inbox';

  // 6. Save item (section + section_data columns added by v2 migration)
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    source_url: url,
    canonical_url: metadata.canonicalUrl,
    source_platform: metadata.platform,
    manual_note: manual_note ?? null,
    og_title: metadata.ogTitle,
    og_description: metadata.ogDescription,
    creator_name: metadata.creatorName,
    title: analysis.title,
    summary: analysis.summary,
    primary_category: analysis.primary_category,
    tags: analysis.tags,
    actionable: analysis.actionable,
    confidence_score: analysis.confidence_score,
    extraction_quality: analysis.extraction_quality,
    status,
    analyzed_at: new Date().toISOString(),
  };

  // Include section data if migration has been applied (graceful fallback)
  try {
    insertPayload.section = section;
    insertPayload.section_data = sectionResult.section_data;
  } catch {
    // migration not yet applied — section data will be missing but app won't crash
  }

  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert(insertPayload)
    .select('*')
    .single();

  if (itemError || !item) {
    // If error is about missing column, retry without section fields
    if (itemError?.message?.includes('section')) {
      const { section: _s, section_data: _sd, ...payloadWithoutSection } = insertPayload as any;
      const { data: item2, error: err2 } = await supabase.from('items').insert(payloadWithoutSection).select('*').single();
      if (err2 || !item2) { console.error('[analyze] DB insert failed', err2); return res.status(500).json({ error: 'Failed to save item' }); }
      return finishAndRespond(res, item2, actionsResult.action_steps, userId, section, sectionResult.section_data);
    }
    console.error('[analyze] DB insert failed', itemError);
    return res.status(500).json({ error: 'Failed to save item' });
  }

  return finishAndRespond(res, item, actionsResult.action_steps, userId, section, sectionResult.section_data);
});

async function finishAndRespond(res: any, item: any, actionSteps: any[], userId: string, section: string, sectionData: object) {
  let savedTasks: object[] = [];
  if (actionSteps.length > 0) {
    const { data: tasks, error } = await supabase.from('action_tasks').insert(
      actionSteps.map(step => ({ user_id: userId, item_id: item.id, title: step.title, description: step.description, sort_order: step.order }))
    ).select('*');
    if (error) console.error('[analyze] tasks insert failed', error);
    else savedTasks = tasks ?? [];
  }

  return res.status(201).json({
    item: {
      ...item,
      section: item.section ?? section,
      section_data: item.section_data ?? sectionData,
      action_tasks: savedTasks,
      action_count: savedTasks.length,
    },
  });
}
