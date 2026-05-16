/**
 * AI analysis pipeline — MVP, synchronous.
 *
 * Stage 1: Classify + summarize the item.
 * Stage 2: If actionable, extract concrete action steps.
 *
 * Both stages use GPT-4o with JSON mode (response_format: json_object).
 * We parse + validate the output before returning. If the LLM returns
 * malformed JSON, we return a low-confidence result rather than throwing.
 */

import OpenAI from 'openai';
import {
  ANALYZE_SYSTEM_PROMPT,
  EXTRACT_ACTIONS_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildExtractActionsUserPrompt,
  type ItemAnalysisInput,
  type ItemAnalysisOutput,
  type ActionExtractionInput,
  type ActionExtractionOutput,
  type ActionStep,
  CATEGORIES,
} from '../prompts/analyze';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = 'gpt-4o';

// ─── Stage 1 ─────────────────────────────────────────────────

export async function analyzeItem(
  input: ItemAnalysisInput,
): Promise<ItemAnalysisOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2, // low temp for consistent, factual output
    messages: [
      { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
      { role: 'user', content: buildAnalyzeUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(raw) as Partial<ItemAnalysisOutput>;
    return validateItemAnalysis(parsed);
  } catch {
    console.error('[ai-pipeline] Stage 1 JSON parse failed', raw.slice(0, 200));
    return failedAnalysis(input.url);
  }
}

function validateItemAnalysis(raw: Partial<ItemAnalysisOutput>): ItemAnalysisOutput {
  // Ensure primary_category is a known value.
  const category = CATEGORIES.includes(raw.primary_category as any)
    ? (raw.primary_category as ItemAnalysisOutput['primary_category'])
    : 'Other';

  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : 'Untitled',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    primary_category: category,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
      : [],
    actionable: typeof raw.actionable === 'boolean' ? raw.actionable : false,
    confidence_score: clamp(Number(raw.confidence_score ?? 0), 0, 1),
    extraction_quality: isValidQuality(raw.extraction_quality)
      ? raw.extraction_quality
      : 'low',
    extraction_notes:
      typeof raw.extraction_notes === 'string' ? raw.extraction_notes : '',
  };
}

function failedAnalysis(url: string): ItemAnalysisOutput {
  return {
    title: 'Untitled item',
    summary: '',
    primary_category: 'Other',
    tags: [],
    actionable: false,
    confidence_score: 0,
    extraction_quality: 'failed',
    extraction_notes: `Analysis failed for URL: ${url}`,
  };
}

// ─── Stage 2 ─────────────────────────────────────────────────

export async function extractActions(
  input: ActionExtractionInput,
): Promise<ActionExtractionOutput> {
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
    const parsed = JSON.parse(raw) as Partial<ActionExtractionOutput>;
    return validateActionExtraction(parsed);
  } catch {
    console.error('[ai-pipeline] Stage 2 JSON parse failed', raw.slice(0, 200));
    return { action_steps: [], action_confidence: 0, action_notes: 'Parse failed' };
  }
}

function validateActionExtraction(
  raw: Partial<ActionExtractionOutput>,
): ActionExtractionOutput {
  const steps: ActionStep[] = Array.isArray(raw.action_steps)
    ? raw.action_steps
        .filter((s): s is ActionStep => typeof s?.title === 'string')
        .map((s, i) => ({
          order: typeof s.order === 'number' ? s.order : i + 1,
          title: s.title.slice(0, 80),
          description:
            typeof s.description === 'string' ? s.description : null,
        }))
        .slice(0, 10)
    : [];

  return {
    action_steps: steps,
    action_confidence: clamp(Number(raw.action_confidence ?? 0), 0, 1),
    action_notes:
      typeof raw.action_notes === 'string' ? raw.action_notes : '',
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function isValidQuality(
  v: unknown,
): v is ItemAnalysisOutput['extraction_quality'] {
  return v === 'high' || v === 'medium' || v === 'low' || v === 'failed';
}
