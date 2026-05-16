/**
 * ActionVault v2 AI pipeline.
 *
 * Stage 1: Classify + summarize (all items)
 * Stage 2: Extract action steps (if actionable)
 * Stage 3: Section-specific extraction (travel/food/ai/money)
 */

import OpenAI from 'openai';
import {
  ANALYZE_SYSTEM_PROMPT,
  EXTRACT_ACTIONS_SYSTEM_PROMPT,
  EXTRACT_TRAVEL_SYSTEM_PROMPT,
  EXTRACT_FOOD_SYSTEM_PROMPT,
  EXTRACT_AI_SYSTEM_PROMPT,
  EXTRACT_MONEY_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildExtractActionsUserPrompt,
  buildExtractTravelUserPrompt,
  buildExtractFoodUserPrompt,
  buildExtractAIUserPrompt,
  buildExtractMoneyUserPrompt,
  detectSection,
  type ItemAnalysisInput,
  type ItemAnalysisOutput,
  type ActionExtractionInput,
  type ActionExtractionOutput,
  type ActionStep,
  type TravelExtractionOutput,
  type FoodExtractionOutput,
  type AIExtractionOutput,
  type MoneyExtractionOutput,
  type Section,
  CATEGORIES,
} from '../prompts/analyze';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o';

// ─── Stage 1: Base analysis ───────────────────────────────────────────────────

export async function analyzeItem(input: ItemAnalysisInput): Promise<ItemAnalysisOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
      { role: 'user', content: buildAnalyzeUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    return validateItemAnalysis(JSON.parse(raw) as Partial<ItemAnalysisOutput>);
  } catch {
    console.error('[ai] Stage 1 parse failed', raw.slice(0, 200));
    return failedAnalysis(input.url);
  }
}

function validateItemAnalysis(raw: Partial<ItemAnalysisOutput>): ItemAnalysisOutput {
  const category = CATEGORIES.includes(raw.primary_category as any)
    ? (raw.primary_category as ItemAnalysisOutput['primary_category'])
    : 'Other';
  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : 'Untitled',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    primary_category: category,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string').slice(0, 8) : [],
    actionable: typeof raw.actionable === 'boolean' ? raw.actionable : false,
    confidence_score: clamp(Number(raw.confidence_score ?? 0), 0, 1),
    extraction_quality: isValidQuality(raw.extraction_quality) ? raw.extraction_quality : 'low',
    extraction_notes: typeof raw.extraction_notes === 'string' ? raw.extraction_notes : '',
  };
}

function failedAnalysis(url: string): ItemAnalysisOutput {
  return { title: 'Untitled item', summary: '', primary_category: 'Other', tags: [], actionable: false, confidence_score: 0, extraction_quality: 'failed', extraction_notes: `Failed for URL: ${url}` };
}

// ─── Stage 2: Action extraction ───────────────────────────────────────────────

export async function extractActions(input: ActionExtractionInput): Promise<ActionExtractionOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: EXTRACT_ACTIONS_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractActionsUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    return validateActionExtraction(JSON.parse(raw) as Partial<ActionExtractionOutput>);
  } catch {
    return { action_steps: [], action_confidence: 0, action_notes: 'Parse failed' };
  }
}

function validateActionExtraction(raw: Partial<ActionExtractionOutput>): ActionExtractionOutput {
  const steps: ActionStep[] = Array.isArray(raw.action_steps)
    ? raw.action_steps
        .filter((s): s is ActionStep => typeof s?.title === 'string')
        .map((s, i) => ({ order: typeof s.order === 'number' ? s.order : i + 1, title: s.title.slice(0, 80), description: typeof s.description === 'string' ? s.description : null }))
        .slice(0, 20)
    : [];
  return { action_steps: steps, action_confidence: clamp(Number(raw.action_confidence ?? 0), 0, 1), action_notes: typeof raw.action_notes === 'string' ? raw.action_notes : '' };
}

// ─── Stage 3: Section-specific extraction ─────────────────────────────────────

export async function extractSectionData(
  section: Section,
  analysis: ItemAnalysisOutput,
  transcript: string | null,
): Promise<{ section: Section; section_data: object }> {
  if (section === 'travel') {
    return { section, section_data: await extractTravel(analysis, transcript) };
  }
  if (section === 'food') {
    return { section, section_data: await extractFood(analysis) };
  }
  if (section === 'ai') {
    return { section, section_data: await extractAI(analysis, transcript) };
  }
  if (section === 'money') {
    return { section, section_data: await extractMoney(analysis, transcript) };
  }
  return { section: 'general', section_data: {} };
}

async function extractTravel(analysis: ItemAnalysisOutput, transcript: string | null): Promise<TravelExtractionOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      { role: 'system', content: EXTRACT_TRAVEL_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractTravelUserPrompt(analysis.title, analysis.summary, analysis.tags, transcript) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw) as Partial<TravelExtractionOutput>;
    return {
      locations: Array.isArray(parsed.locations)
        ? parsed.locations.filter(l => typeof l.name === 'string' && typeof l.lat === 'number' && typeof l.lng === 'number')
        : [],
      trip_context: typeof parsed.trip_context === 'string' ? parsed.trip_context : '',
      best_season: typeof parsed.best_season === 'string' ? parsed.best_season : null,
    };
  } catch {
    return { locations: [], trip_context: '', best_season: null };
  }
}

async function extractFood(analysis: ItemAnalysisOutput): Promise<FoodExtractionOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: EXTRACT_FOOD_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractFoodUserPrompt(analysis.title, analysis.summary, analysis.tags) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    const p = JSON.parse(raw) as Partial<FoodExtractionOutput>;
    return {
      taste_profile: p.taste_profile ?? { sweet: false, salty: false, spicy: false, savory: false, sour: false, umami: false, bitter: false },
      cuisine: typeof p.cuisine === 'string' ? p.cuisine : 'Unknown',
      cook_time_minutes: typeof p.cook_time_minutes === 'number' ? p.cook_time_minutes : null,
      difficulty: ['easy','medium','hard'].includes(p.difficulty as string) ? p.difficulty as any : 'medium',
      ingredient_count: typeof p.ingredient_count === 'number' ? p.ingredient_count : null,
      dietary: Array.isArray(p.dietary) ? p.dietary : [],
      mood_tags: Array.isArray(p.mood_tags) ? p.mood_tags : [],
    };
  } catch {
    return { taste_profile: { sweet: false, salty: false, spicy: false, savory: false, sour: false, umami: false, bitter: false }, cuisine: 'Unknown', cook_time_minutes: null, difficulty: 'medium', ingredient_count: null, dietary: [], mood_tags: [] };
  }
}

async function extractAI(analysis: ItemAnalysisOutput, transcript: string | null): Promise<AIExtractionOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: EXTRACT_AI_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractAIUserPrompt(analysis.title, analysis.summary, analysis.tags, transcript) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    const p = JSON.parse(raw) as Partial<AIExtractionOutput>;
    return {
      tool: p.tool ?? 'Other',
      use_case: typeof p.use_case === 'string' ? p.use_case : '',
      prompt_tip: typeof p.prompt_tip === 'string' ? p.prompt_tip : null,
      skill_level: ['beginner','intermediate','advanced'].includes(p.skill_level as string) ? p.skill_level as any : 'intermediate',
      task_type: Array.isArray(p.task_type) ? p.task_type : [],
    };
  } catch {
    return { tool: 'Other', use_case: '', prompt_tip: null, skill_level: 'intermediate', task_type: [] };
  }
}

async function extractMoney(analysis: ItemAnalysisOutput, transcript: string | null): Promise<MoneyExtractionOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: EXTRACT_MONEY_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractMoneyUserPrompt(analysis.title, analysis.summary, analysis.tags, transcript) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    const p = JSON.parse(raw) as Partial<MoneyExtractionOutput>;
    return {
      tickers: Array.isArray(p.tickers) ? p.tickers : [],
      asset_type: typeof p.asset_type === 'string' ? p.asset_type : 'General',
      tip_type: p.tip_type ?? 'other',
      time_horizon: p.time_horizon ?? null,
      risk_level: p.risk_level ?? null,
      confidence_note: typeof p.confidence_note === 'string' ? p.confidence_note : '',
    };
  } catch {
    return { tickers: [], asset_type: 'General', tip_type: 'other', time_horizon: null, risk_level: null, confidence_note: '' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max); }
function isValidQuality(v: unknown): v is ItemAnalysisOutput['extraction_quality'] {
  return v === 'high' || v === 'medium' || v === 'low' || v === 'failed';
}

export { detectSection };
export type { Section };
