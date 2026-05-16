/**
 * ActionVault v2 AI prompt contracts.
 *
 * 4 specialized sections, each with section-specific extraction
 * after the base analysis:
 *   - travel  → locations with lat/lng for map pins
 *   - food    → taste profile, cuisine, ingredients
 *   - ai      → tool detection, use-case, prompt tip
 *   - money   → tickers, sentiment, asset type
 */

export const PROMPT_VERSION = 'v2.0';

export const CATEGORIES = [
  'AI', 'Work', 'Money', 'Productivity', 'Learning',
  'Travel', 'Food', 'Fitness', 'PersonalAdmin', 'Inspiration', 'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SECTIONS = ['general', 'travel', 'food', 'ai', 'money'] as const;
export type Section = (typeof SECTIONS)[number];

// ─── Section detection ────────────────────────────────────────────────────────

export function detectSection(category: Category, tags: string[], title: string, summary: string): Section {
  const text = `${title} ${summary} ${tags.join(' ')}`.toLowerCase();
  if (category === 'Travel' || /\b(travel|trip|visit|restaurant|hotel|city|country|destination|map|place|food spot|cafe|beach|mountain|hike|tour)\b/.test(text)) return 'travel';
  if (category === 'Food' || /\b(recipe|cook|bake|ingredient|meal|dish|cuisine|taste|flavor|sweet|salty|spicy|grill|fry|sauce)\b/.test(text)) return 'food';
  if (category === 'AI' || /\b(ai|chatgpt|claude|gemini|openai|llm|prompt|model|gpt|midjourney|stable diffusion|copilot|cursor)\b/.test(text)) return 'ai';
  if (category === 'Money' || /\b(stock|crypto|invest|trade|etf|dividend|portfolio|bitcoin|ethereum|ticker|market|bull|bear|finance)\b/.test(text)) return 'money';
  return 'general';
}

// ─── Base analysis (Stage 1) ──────────────────────────────────────────────────

export interface ItemAnalysisInput {
  platform: string;
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  creatorName: string | null;
  manualNote: string | null;
  transcript: string | null;
}

export interface ItemAnalysisOutput {
  title: string;
  summary: string;
  primary_category: Category;
  tags: string[];
  actionable: boolean;
  confidence_score: number;
  extraction_quality: 'high' | 'medium' | 'low' | 'failed';
  extraction_notes: string;
}

export const ANALYZE_SYSTEM_PROMPT = `You are an expert content classifier for ActionVault, a personal productivity and discovery app.
Users save social media links. You understand what they saved, summarize it clearly, categorize it, and assess whether it is actionable.

Return valid JSON only. No markdown. No prose outside the JSON.

CATEGORIES: AI, Work, Money, Productivity, Learning, Travel, Food, Fitness, PersonalAdmin, Inspiration, Other

SOURCE PRIORITY:
- TRANSCRIPT = what the person said (PRIMARY source)
- CAPTION = what the poster wrote (use if informative; ignore if just hashtags/emojis/CTA)

RULES:
- title: max 80 chars, factual, no clickbait, reflects actual content not what is being sold
- summary: exactly 2-3 sentences. Focus on knowledge/advice/places/techniques — NOT what the creator is selling
- primary_category: one from the list, most dominant theme
- tags: 2-6 lowercase hyphenated tags describing the topic/advice/location/technique
- actionable: true only if content contains specific steps, techniques, or places to visit
- confidence_score: 0.0–1.0 based on data richness
- extraction_quality: "high" | "medium" | "low" | "failed"
- extraction_notes: one internal sentence about data quality

REQUIRED OUTPUT:
{
  "title": "string",
  "summary": "string",
  "primary_category": "string",
  "tags": ["string"],
  "actionable": boolean,
  "confidence_score": number,
  "extraction_quality": "string",
  "extraction_notes": "string"
}`;

export function buildAnalyzeUserPrompt(input: ItemAnalysisInput): string {
  const isVideoSocial = input.platform === 'instagram' || input.platform === 'tiktok';
  const lines = [
    `Platform: ${input.platform}`,
    `URL: ${input.url}`,
    `Title: ${input.ogTitle ?? '[not available]'}`,
  ];
  if (isVideoSocial && input.ogDescription) {
    lines.push(`\nCreator caption:\n${input.ogDescription}`);
  } else {
    lines.push(`Description: ${input.ogDescription ?? '[not available]'}`);
  }
  if (input.creatorName) lines.push(`Creator: ${input.creatorName}`);
  if (input.transcript) {
    const truncated = input.transcript.length > 2000
      ? input.transcript.slice(0, 2000) + '… [truncated]'
      : input.transcript;
    lines.push(`\nTranscript (PRIMARY SOURCE):\n${truncated}`);
  }
  if (input.manualNote) lines.push(`User note: ${input.manualNote}`);
  return lines.join('\n') + '\n\nClassify and summarize.';
}

// ─── Action extraction (Stage 2) ──────────────────────────────────────────────

export interface ActionExtractionInput {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  manualNote: string | null;
}

export interface ActionStep {
  order: number;
  title: string;
  description: string | null;
}

export interface ActionExtractionOutput {
  action_steps: ActionStep[];
  action_confidence: number;
  action_notes: string;
}

export const EXTRACT_ACTIONS_SYSTEM_PROMPT = `You extract concrete, specific action steps for a productivity app. Think like a coach distilling content into a personal to-do list the user can execute THIS WEEK.

FOR RECIPES (category: Food):
- List EVERY ingredient as its own step (title = ingredient + quantity, no description needed)
- Then list cooking steps with specific details (temps, times, techniques)
- No limit on step count

FOR ALL OTHER CONTENT:
- 4-6 steps max
- Each step MUST have a description (2-3 sentences): HOW to do it, a specific insight from the content, and what result to expect
- Start with an imperative verb
- Never: "learn more", "do research", vague advice, buying/enrolling CTAs
- Good example: "Create a Gumroad account and upload your first product"
- Good description: "Spend 20 min on LinkedIn searching '[niche] + freelancer' — note their exact pricing language to write your own offer page. This positions you as premium from day one."

Return valid JSON only. No markdown.

{
  "action_steps": [{ "order": 1, "title": "string", "description": "string" }],
  "action_confidence": number,
  "action_notes": "string"
}`;

export function buildExtractActionsUserPrompt(input: ActionExtractionInput): string {
  const lines = [
    `Title: ${input.title}`,
    `Summary: ${input.summary}`,
    `Category: ${input.category}`,
    `Tags: ${input.tags.join(', ')}`,
  ];
  if (input.manualNote) lines.push(`User note: ${input.manualNote}`);
  if (input.category === 'Food') {
    lines.push('\nThis is a recipe. List every ingredient as its own step, then the cooking instructions.');
  } else {
    lines.push('\nExtract 4-6 concrete, specific action steps. Each needs a detailed description.');
  }
  return lines.join('\n');
}

// ─── Travel extraction (Stage 3 — travel section only) ────────────────────────

export interface TravelLocation {
  name: string;
  lat: number;
  lng: number;
  description: string;
  type: 'restaurant' | 'landmark' | 'hotel' | 'activity' | 'neighborhood' | 'other';
}

export interface TravelExtractionOutput {
  locations: TravelLocation[];
  trip_context: string;
  best_season: string | null;
}

export const EXTRACT_TRAVEL_SYSTEM_PROMPT = `You extract specific locations from travel content for an interactive map.

For each place mentioned:
- Provide accurate lat/lng coordinates (use your knowledge of real places)
- Give a brief description of why this place is interesting based on the content
- Classify the type

If the content is vague about location, only include places you're confident about.
If no specific places are mentioned, return an empty locations array.

Return valid JSON only:
{
  "locations": [
    {
      "name": "string (full place name, e.g. 'Shibuya Crossing, Tokyo')",
      "lat": number,
      "lng": number,
      "description": "string (1 sentence — what makes this place worth visiting based on the content)",
      "type": "restaurant|landmark|hotel|activity|neighborhood|other"
    }
  ],
  "trip_context": "string (1 sentence — what kind of trip this is, e.g. 'Budget backpacking trip through Southeast Asia')",
  "best_season": "string or null (e.g. 'Spring (March-May)')"
}`;

export function buildExtractTravelUserPrompt(title: string, summary: string, tags: string[], transcript: string | null): string {
  const lines = [
    `Content title: ${title}`,
    `Summary: ${summary}`,
    `Tags: ${tags.join(', ')}`,
  ];
  if (transcript) {
    const t = transcript.length > 1500 ? transcript.slice(0, 1500) + '…' : transcript;
    lines.push(`\nTranscript:\n${t}`);
  }
  lines.push('\nExtract all specific locations mentioned. Provide accurate GPS coordinates.');
  return lines.join('\n');
}

// ─── Food extraction (Stage 3 — food section only) ────────────────────────────

export interface FoodTasteProfile {
  sweet: boolean;
  salty: boolean;
  spicy: boolean;
  savory: boolean;
  sour: boolean;
  umami: boolean;
  bitter: boolean;
}

export interface FoodExtractionOutput {
  taste_profile: FoodTasteProfile;
  cuisine: string;
  cook_time_minutes: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
  ingredient_count: number | null;
  dietary: string[];
  mood_tags: string[];
}

export const EXTRACT_FOOD_SYSTEM_PROMPT = `You extract taste profile and recipe metadata from food content.

Taste profile: assess which tastes are prominent (true/false for each).
Cuisine: most specific cuisine name (e.g. "Japanese ramen" not just "Asian").
Mood tags: emotional/contextual tags like "comfort-food", "date-night", "meal-prep", "hangover-cure", "impressive-guests", "late-night", "summer-bbq".
Dietary: applicable tags from: vegetarian, vegan, gluten-free, dairy-free, keto, low-carb, high-protein.

Return valid JSON only:
{
  "taste_profile": {
    "sweet": boolean, "salty": boolean, "spicy": boolean,
    "savory": boolean, "sour": boolean, "umami": boolean, "bitter": boolean
  },
  "cuisine": "string",
  "cook_time_minutes": number or null,
  "difficulty": "easy|medium|hard",
  "ingredient_count": number or null,
  "dietary": ["string"],
  "mood_tags": ["string"]
}`;

export function buildExtractFoodUserPrompt(title: string, summary: string, tags: string[]): string {
  return `Title: ${title}\nSummary: ${summary}\nTags: ${tags.join(', ')}\n\nExtract taste profile and recipe metadata.`;
}

// ─── AI Tool extraction (Stage 3 — ai section only) ───────────────────────────

export type AITool =
  | 'ChatGPT' | 'Claude' | 'Gemini' | 'Midjourney' | 'Cursor'
  | 'Copilot' | 'Llama' | 'Stable Diffusion' | 'Perplexity' | 'Grok'
  | 'Multiple' | 'Other';

export interface AIExtractionOutput {
  tool: AITool;
  use_case: string;
  prompt_tip: string | null;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  task_type: string[];
}

export const EXTRACT_AI_SYSTEM_PROMPT = `You extract AI tool information from content about AI tools and prompts.

tool: the primary AI tool discussed. Use "Multiple" if several tools are compared.
use_case: a short phrase (max 8 words) describing what the AI is being used for.
prompt_tip: if the content includes a specific prompt or technique, extract it. Otherwise null.
skill_level: how advanced the content is.
task_type: what tasks this helps with (e.g. ["writing", "coding", "image-generation", "productivity", "research"]).

Return valid JSON only:
{
  "tool": "ChatGPT|Claude|Gemini|Midjourney|Cursor|Copilot|Llama|Stable Diffusion|Perplexity|Grok|Multiple|Other",
  "use_case": "string",
  "prompt_tip": "string or null",
  "skill_level": "beginner|intermediate|advanced",
  "task_type": ["string"]
}`;

export function buildExtractAIUserPrompt(title: string, summary: string, tags: string[], transcript: string | null): string {
  const lines = [`Title: ${title}`, `Summary: ${summary}`, `Tags: ${tags.join(', ')}`];
  if (transcript) lines.push(`\nTranscript excerpt:\n${transcript.slice(0, 1000)}`);
  lines.push('\nExtract AI tool metadata.');
  return lines.join('\n');
}

// ─── Money extraction (Stage 3 — money section only) ──────────────────────────

export interface MoneyTicker {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto' | 'etf' | 'commodity' | 'forex' | 'other';
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface MoneyExtractionOutput {
  tickers: MoneyTicker[];
  asset_type: string;
  tip_type: 'strategy' | 'analysis' | 'news' | 'education' | 'warning' | 'other';
  time_horizon: 'short-term' | 'medium-term' | 'long-term' | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  confidence_note: string;
}

export const EXTRACT_MONEY_SYSTEM_PROMPT = `You extract financial metadata from investment and money content.

tickers: specific stocks, crypto, ETFs, or commodities mentioned. Use standard symbols (AAPL, BTC, etc.).
If no specific tickers mentioned, return empty array.
sentiment: is the content bullish (positive), bearish (negative), or neutral about this asset?
tip_type: what kind of financial content is this?
time_horizon: how long is the investment horizon discussed?
risk_level: implied risk level of the strategy/asset.
confidence_note: 1 sentence about how reliable/vetted this tip appears to be.

Return valid JSON only:
{
  "tickers": [
    {
      "symbol": "string",
      "name": "string (full company/coin name)",
      "type": "stock|crypto|etf|commodity|forex|other",
      "sentiment": "bullish|bearish|neutral"
    }
  ],
  "asset_type": "string (e.g. 'Growth stocks', 'DeFi crypto', 'Real estate')",
  "tip_type": "strategy|analysis|news|education|warning|other",
  "time_horizon": "short-term|medium-term|long-term or null",
  "risk_level": "low|medium|high or null",
  "confidence_note": "string"
}`;

export function buildExtractMoneyUserPrompt(title: string, summary: string, tags: string[], transcript: string | null): string {
  const lines = [`Title: ${title}`, `Summary: ${summary}`, `Tags: ${tags.join(', ')}`];
  if (transcript) lines.push(`\nTranscript excerpt:\n${transcript.slice(0, 1000)}`);
  lines.push('\nExtract financial metadata and ticker symbols.');
  return lines.join('\n');
}
