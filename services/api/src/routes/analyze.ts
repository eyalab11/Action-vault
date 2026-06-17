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
import type { ItemAnalysisOutput, Section } from '../prompts/analyze';
import { supabase } from '../lib/supabase';
import { normalizeUrl } from '../lib/normalize-url';

export const analyzeRouter = Router();

const VALID_SECTIONS = ['general', 'travel', 'food', 'ai', 'money'] as const;

const bodySchema = z.object({
  url: z.string().url('Must be a valid URL'),
  manual_note: z.string().max(1000).optional(),
  // Optional explicit section from the user's UI selection — overrides AI detection
  section: z.enum(VALID_SECTIONS).optional(),
});

type AnalyzeResponse = { item: any };

/**
 * In-flight guard: collapse concurrent /analyze requests for the same user+URL
 * into a single expensive analysis.
 */
const inflightByUserAndUrl = new Map<string, Promise<AnalyzeResponse>>();

analyzeRouter.post('/', requireAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { url, manual_note, section: userSection } = parsed.data;
  const userId = req.userId;
  console.log(`[analyze] user=${userId} url=${url} userSection=${userSection ?? 'auto'}`);

  // Normalize early so we can dedupe without calling the AI pipeline.
  const normalized = normalizeUrl(url);

  // 0. Fast path — if we already saved this URL for this user, return the existing item.
  const existing = await findExistingItemByNormalizedUrl(userId, normalized);
  if (existing) {
    console.log(`[analyze] dedup hit -> item=${existing.id}`);
    return res.status(200).json({ item: existing });
  }

  const inflightKey = `${userId}|${normalized}`;
  const existingInflight = inflightByUserAndUrl.get(inflightKey);
  if (existingInflight) {
    console.log('[analyze] inflight hit -> awaiting existing analysis');
    try {
      const out = await existingInflight;
      return res.status(200).json(out);
    } catch (e: any) {
      // If the in-flight analysis failed, fall through and retry once.
      console.warn('[analyze] inflight failed, retrying once', e?.message ?? e);
      inflightByUserAndUrl.delete(inflightKey);
    }
  }

  const analysisPromise = performAnalyzeAndSave({ url, manual_note: manual_note ?? null, userSection, userId })
    .finally(() => inflightByUserAndUrl.delete(inflightKey));
  inflightByUserAndUrl.set(inflightKey, analysisPromise);

  try {
    const out = await analysisPromise;
    return res.status(201).json(out);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Failed to analyze' });
  }
});

async function findExistingItemByNormalizedUrl(userId: string, normalized: string): Promise<any | null> {
  if (!normalized) return null;

  // We only need to search recent items: duplicates are usually back-to-back shares.
  const { data, error } = await supabase
    .from('items')
    .select('id, source_url, canonical_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return null;

  const match = data.find((it: any) => {
    const key = normalizeUrl(it.canonical_url ?? it.source_url);
    return key === normalized;
  });

  if (!match?.id) return null;

  const { data: full, error: fullErr } = await supabase
    .from('items')
    .select('*, action_tasks(*)')
    .eq('id', match.id)
    .eq('user_id', userId)
    .single();

  if (fullErr || !full) return null;

  // Sort tasks by sort_order to match the normal /items/:id behavior.
  if (Array.isArray(full.action_tasks)) {
    full.action_tasks.sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
    );
  }

  return {
    ...full,
    action_count: Array.isArray(full.action_tasks) ? full.action_tasks.length : 0,
  };
}

async function performAnalyzeAndSave(args: {
  url: string;
  manual_note: string | null;
  userSection?: (typeof VALID_SECTIONS)[number];
  userId: string;
}): Promise<AnalyzeResponse> {
  const { url, manual_note, userSection, userId } = args;

  // 1. Fetch metadata
  const metadata = await fetchMetadata(url);
  console.log(`[analyze] platform=${metadata.platform} title=${metadata.ogTitle}`);

  const unreliableSocialMetadata = isUnreliableSocialMetadata(metadata);

  // 2. Stage 1 — base analysis. If Instagram/TikTok hides the actual media and
  // audio, do not let the model infer from weak page/caption metadata.
  const analysis = unreliableSocialMetadata
    ? insufficientSocialAnalysis(metadata.canonicalUrl)
    : await analyzeItem({
        platform: metadata.platform,
        url: metadata.canonicalUrl,
        ogTitle: metadata.ogTitle,
        ogDescription: metadata.ogDescription,
        creatorName: metadata.creatorName,
        manualNote: manual_note ?? null,
        transcript: metadata.transcript,
        visualContext: metadata.visualContext,
      });

  // 3. Detect section — user's explicit choice wins, otherwise AI detection
  const detectedSection = detectSection(analysis.primary_category, analysis.tags, analysis.title, analysis.summary);
  const section = unreliableSocialMetadata
    ? 'general'
    : ((userSection && userSection !== 'general') ? userSection : detectedSection);
  console.log(`[analyze] section=${section} (user=${userSection ?? 'none'} detected=${detectedSection}) category=${analysis.primary_category}`);

  // 4. Stage 2 + Stage 3 — run in parallel
  const [actionsResult, rawSectionResult] = await Promise.all([
    analysis.actionable && !unreliableSocialMetadata
      ? extractActions({
          title: analysis.title,
          summary: analysis.summary,
          category: analysis.primary_category,
          tags: analysis.tags,
          manualNote: manual_note ?? null,
          transcript: metadata.transcript,
          visualContext: metadata.visualContext,
        })
      : Promise.resolve({ action_steps: [], action_confidence: 0, action_notes: '' }),
    unreliableSocialMetadata
      ? Promise.resolve({ section: section as Section, section_data: {} })
      : extractSectionData(section, analysis, metadata.transcript, metadata.visualContext),
  ]);

  const sectionResult = {
    ...rawSectionResult,
    section_data: enrichTravelLocationMedia(rawSectionResult.section_data, metadata.mediaUrls, metadata.visualContext),
  };
  const actionSteps = buildTravelLocationActionSteps(sectionResult.section_data) ?? actionsResult.action_steps;

  console.log(`[analyze] actions=${actionSteps.length} section_data_keys=${Object.keys(sectionResult.section_data).length}`);

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
    media_urls: metadata.mediaUrls,
    visual_context: metadata.visualContext,
    title: analysis.title,
    summary: analysis.summary,
    primary_category: analysis.primary_category,
    tags: analysis.tags,
    actionable: actionSteps.length > 0 ? true : analysis.actionable,
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
    // If deployment DB is behind the API, retry without newer optional columns.
    if (
      itemError?.message?.includes('section') ||
      itemError?.message?.includes('media_urls') ||
      itemError?.message?.includes('visual_context')
    ) {
      const {
        section: _s,
        section_data: _sd,
        media_urls: _mu,
        visual_context: _vc,
        ...payloadWithoutNewColumns
      } = insertPayload as any;
      const { data: item2, error: err2 } = await supabase.from('items').insert(payloadWithoutNewColumns).select('*').single();
      if (err2 || !item2) {
        console.error('[analyze] DB insert failed', err2);
        throw new Error('Failed to save item');
      }
      return buildAnalyzeResponse(item2, actionSteps, userId, section, sectionResult.section_data);
    }
    console.error('[analyze] DB insert failed', itemError);
    throw new Error('Failed to save item');
  }

  return buildAnalyzeResponse(item, actionSteps, userId, section, sectionResult.section_data);
}

async function buildAnalyzeResponse(item: any, actionSteps: any[], userId: string, section: string, sectionData: object): Promise<AnalyzeResponse> {
  let savedTasks: object[] = [];
  if (actionSteps.length > 0) {
    const { data: tasks, error } = await supabase.from('action_tasks').insert(
      actionSteps.map(step => ({ user_id: userId, item_id: item.id, title: step.title, description: step.description, sort_order: step.order }))
    ).select('*');
    if (error) console.error('[analyze] tasks insert failed', error);
    else savedTasks = tasks ?? [];
  }

  return {
    item: {
      ...item,
      section: item.section ?? section,
      section_data: item.section_data ?? sectionData,
      action_tasks: savedTasks,
      action_count: savedTasks.length,
    },
  };
}

function isUnreliableSocialMetadata(metadata: {
  platform: string;
  transcript: string | null;
  visualContext: string | null;
}) {
  const social = metadata.platform === 'instagram' || metadata.platform === 'tiktok';
  return social && !metadata.transcript && !metadata.visualContext;
}

function insufficientSocialAnalysis(url: string): ItemAnalysisOutput {
  return {
    title: 'Needs review',
    summary: 'We could not access enough reliable media or audio from this social post to summarize it. Open the original link or add a note so ActionVault can understand what you saved.',
    primary_category: 'Other',
    tags: ['needs-review', 'limited-access'],
    actionable: false,
    confidence_score: 0.1,
    extraction_quality: 'failed',
    extraction_notes: `Insufficient Instagram/TikTok media context for URL: ${url}`,
  };
}

function enrichTravelLocationMedia(sectionData: object, mediaUrls: string[], visualContext: string | null) {
  if (!sectionData || !Array.isArray((sectionData as any).locations) || mediaUrls.length === 0) return sectionData;
  const imageHints = parseImageHints(visualContext);

  return {
    ...(sectionData as any),
    locations: (sectionData as any).locations.map((loc: any, index: number) => {
      const matchedIndex = findImageIndexForLocation(loc?.name, imageHints);
      const fallbackIndex = index < mediaUrls.length ? index : 0;
      const mediaUrl = mediaUrls[matchedIndex ?? fallbackIndex] ?? mediaUrls[0];
      return mediaUrl ? { ...loc, media_url: mediaUrl } : loc;
    }),
  };
}

function parseImageHints(visualContext: string | null) {
  if (!visualContext) return [];
  return [...visualContext.matchAll(/^Image\s+(\d+):\s*(.+)$/gim)].map((match) => ({
    index: Math.max(0, Number(match[1]) - 1),
    text: normalizeText(match[2] ?? ''),
  }));
}

function findImageIndexForLocation(name: unknown, hints: { index: number; text: string }[]) {
  if (typeof name !== 'string' || hints.length === 0) return null;
  const normalizedName = normalizeText(name);
  const primaryName = normalizeText(name.split(',')[0] ?? name);
  const hit = hints.find((hint) =>
    (normalizedName.length > 4 && hint.text.includes(normalizedName)) ||
    (primaryName.length > 4 && hint.text.includes(primaryName))
  );
  return hit?.index ?? null;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildTravelLocationActionSteps(sectionData: object) {
  const locations = (sectionData as any)?.locations;
  if (!Array.isArray(locations) || locations.length === 0) return null;
  return locations.map((loc: any, index: number) => ({
    order: index + 1,
    title: `Visit ${String(loc?.name ?? 'this place').slice(0, 72)}`,
    description: typeof loc?.description === 'string' && loc.description.trim()
      ? loc.description.trim()
      : 'Review this saved place and decide whether to add it to your trip plan.',
  }));
}
