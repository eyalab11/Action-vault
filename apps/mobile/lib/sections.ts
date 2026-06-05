/**
 * Section classification helpers.
 *
 * The backend's `/analyze` endpoint should assign a `section` to every item,
 * but for shared content (Instagram reels, TikToks, etc.) it often returns
 * `general`. These helpers act as a safety net so AI/Food/Travel/Money items
 * still surface in the right tile + screen based on their title.
 */

import type { Item, Section } from './api';

type Vertical = Exclude<Section, 'general'>;

/** Title/summary keywords that strongly indicate a vertical. */
const VERTICAL_PATTERNS: Record<Vertical, RegExp> = {
  ai:     /\b(claude|chatgpt|gpt-?[0-9]?|gemini|midjourney|dall-?e|stable diffusion|llm|prompt(ing|s)?|cursor|copilot|anthropic|openai|ai tool|ai-?powered|ai agent|machine learning|neural net|hugging ?face|perplexity|notebooklm|sora|grok)\b/i,
  food:   /\b(recipe|cook(ing)?|bak(e|ing)|pasta|cuisine|dinner|breakfast|brunch|lunch|dessert|vegan|vegetarian|gluten[- ]?free|chef|kitchen|ingredient|meal prep|sourdough|pizza|sushi)\b/i,
  travel: /\b(travel|trip|itinerary|hotel|flight|airbnb|vacation|holiday|destination|tokyo|paris|bali|rome|london|barcelona|backpack|tourist|sightsee|nomad|hostel)\b/i,
  money:  /\b(stock|crypto|bitcoin|ethereum|invest(ing|ment)?|portfolio|trading|ticker|nasdaq|s ?& ?p|etf|dividend|finance|market|bullish|bearish|broker|robinhood|hedge fund|roth ira|401k)\b/i,
};

/**
 * Returns the vertical (travel/food/ai/money) implied by the item's content,
 * or null if nothing matches.
 */
export function classifyByContent(item: Pick<Item, 'title' | 'summary' | 'source_url'>): Vertical | null {
  const text = [item.title ?? '', item.summary ?? '', item.source_url ?? ''].join(' ');
  if (!text.trim()) return null;
  for (const v of ['ai', 'food', 'travel', 'money'] as Vertical[]) {
    if (VERTICAL_PATTERNS[v].test(text)) return v;
  }
  return null;
}

/**
 * The "effective section" for display purposes — backend section if it's
 * already a vertical, otherwise inferred from content, otherwise general.
 */
export function effectiveSection(item: Pick<Item, 'title' | 'summary' | 'source_url' | 'section'>): Section {
  const raw = item.section ?? 'general';
  if (raw !== 'general') return raw;
  return classifyByContent(item) ?? 'general';
}
