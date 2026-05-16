/**
 * AI prompt contracts for ActionVault MVP.
 *
 * Rules:
 * - All prompts return strict JSON. No markdown. No prose outside JSON.
 * - Prompt version is tracked so we can reprocess old items when prompts change.
 * - System prompt is separated from user prompt for clean token accounting.
 */

export const PROMPT_VERSION = 'v1.2';

export const CATEGORIES = [
  'AI',
  'Work',
  'Money',
  'Productivity',
  'Learning',
  'Travel',
  'Food',
  'Fitness',
  'PersonalAdmin',
  'Inspiration',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// ─── Stage 1: Item Analysis ───────────────────────────────────

export interface ItemAnalysisInput {
  platform: string;
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  creatorName: string | null;
  manualNote: string | null;
  /** Transcript of the video audio, if available. */
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

export const ANALYZE_SYSTEM_PROMPT = `You are an expert content classifier for a personal productivity app called ActionVault.
Users save social media links and web content. You understand what they saved, summarize it clearly, categorize it, and assess whether it contains actionable advice.

Return valid JSON only. No markdown. No prose outside the JSON object. Do not add extra fields.

CATEGORIES: AI, Work, Money, Productivity, Learning, Travel, Food, Fitness, PersonalAdmin, Inspiration, Other

CAPTION vs. TRANSCRIPT — how to weigh your sources:
You may receive a creator's caption AND/OR an audio transcript. Use them differently:
- TRANSCRIPT = what the person actually said in the video. This is your PRIMARY source for understanding the content.
- CAPTION = what the poster wrote underneath. Captions vary wildly in quality:
    - HIGH-VALUE caption: explains the topic, lists key points, adds context not in the video (e.g. "5 ways to negotiate salary: 1. Research market rate 2. …")
    - LOW-VALUE caption: just emojis, "link in bio", hashtag spam, promo/CTA ("DM me for coaching"), or vague hype ("this changed my life 🔥🔥🔥")
  → If a caption contains real information or context, USE IT alongside the transcript.
  → If a caption is just filler/promo/emojis, IGNORE IT — do not let it influence your title, summary, or category.
  → When both caption and transcript are available and they cover different aspects, combine insights from both.
  → When only a caption is available (no transcript), and the caption is low-value, set confidence_score below 0.5 and extraction_quality to "low".

RULES:
- title: max 80 characters, factual, no clickbait, no ALL CAPS. Write it like a clean bookmark title. Title should reflect the actual knowledge or advice, NOT the product/course/service being promoted.
- summary: exactly 2-3 sentences. Plain prose. Focus on the actual knowledge, advice, strategies, or techniques shared in the content — NOT what the creator is selling or promoting. If someone is teaching a strategy while promoting their course, summarize the STRATEGY, not the course. Ignore CTAs, product names, and sales pitches entirely. For RECIPES: include the dish name, key ingredients, and cooking method in the summary.
- primary_category: exactly one from the list above, the most dominant theme.
- tags: 2-6 lowercase hyphenated tags. Be specific. Bad: "video", "content", "course", "academy". Good: "resume-writing", "ai-freelance", "meal-prep", "passive-income". Tags should describe the topic/advice, never the product being sold.
- actionable: true only if the content contains specific steps or advice someone could actually follow. A "10 tips" video is actionable. A vlog is not.
- confidence_score: 0.0–1.0. Reflect how much useful signal you had to work with:
    >0.75 = clear title + description + context (high quality extraction)
    0.50–0.75 = partial data, some inference required (e.g. social media caption without full article, or title + description without body text)
    <0.50 = almost nothing to work with (URL only, no title or description at all)
- extraction_quality: "high" | "medium" | "low" | "failed"
    high   = rich data, confident summary
    medium = enough to make a reasonable inference
    low    = very little data, summary is mostly guesswork
    failed = cannot determine anything meaningful
- extraction_notes: one sentence for internal use — what data was available and what was inferred.

CRITICAL: If you have very little information (no title, no description, no transcript — just a URL or vague OG data), still return valid JSON but:
- Set confidence_score below 0.5
- Set extraction_quality to "low"
- Set actionable to false (do NOT generate action steps from guesswork)
- Do NOT invent specific app names, product names, or detailed advice that isn't explicitly stated in the data you received
- Keep the summary honest about what you know vs. what you're guessing
Never refuse to return JSON.

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
    `Source platform: ${input.platform}`,
    `URL: ${input.url}`,
    `Title from page: ${input.ogTitle ?? '[not available]'}`,
  ];
  if (isVideoSocial && input.ogDescription) {
    // For Instagram/TikTok, the "description" is actually the creator's caption.
    // This is written by the poster and often contains the main context, key points,
    // hashtags, and explanation of what the video is about.
    lines.push(`\nCreator's caption (this is what the poster wrote on the video — treat this as HIGH-VALUE context, often more reliable than the video title):\n${input.ogDescription}`);
  } else {
    lines.push(`Description from page: ${input.ogDescription ?? '[not available]'}`);
  }
  if (input.creatorName) lines.push(`Creator/account: ${input.creatorName}`);
  if (input.transcript) {
    // Truncate to ~2000 chars to keep token usage reasonable
    const truncated = input.transcript.length > 2000
      ? input.transcript.slice(0, 2000) + '… [truncated]'
      : input.transcript;
    lines.push(`\nAudio transcript of the video (this is what the person in the video is saying — use this as your PRIMARY source of information):\n${truncated}`);
  } else if (input.platform === 'instagram' || input.platform === 'tiktok') {
    lines.push(`\n⚠️ NO TRANSCRIPT AVAILABLE — the video audio could not be transcribed. You only have the metadata above. Do NOT invent or guess what the video is about beyond what the title/description explicitly state. Do NOT fabricate app names, product names, or specific advice that isn't clearly stated in the metadata. If the metadata is vague, keep your summary vague and set confidence_score below 0.5 and extraction_quality to "low".`);
  }
  if (input.manualNote) lines.push(`User note (use this — it is context the user added): ${input.manualNote}`);

  return lines.join('\n') + '\n\nClassify and summarize this content.';
}

// ─── Stage 2: Action Extraction ───────────────────────────────
// Only called when Stage 1 returns actionable: true.

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

export const EXTRACT_ACTIONS_SYSTEM_PROMPT = `You extract concrete, specific action steps from content summaries for a productivity app called ActionVault.

Your job is to turn saved content into a personal to-do list the user can actually execute. Think like a coach distilling a video/article into the exact steps someone should take THIS WEEK.

IMPORTANT: Adapt your output based on the content type:

FOR RECIPES (category: Food):
- List EVERY ingredient as its own separate step, with the title being the ingredient and quantity (e.g. "14 oz dried wheat noodles", "1/4 cup hoisin sauce", "6 garlic cloves, minced"). No description needed for ingredient steps.
- After all ingredients, list the cooking instructions as separate steps with specific details (temperatures, times, techniques) in the description.
- Include ALL details — the user should be able to shop and cook from these steps alone.
- Generate as many steps as needed (no limit for recipes — can be 10-20+).

FOR ALL OTHER CONTENT:
- Steps must be things a real person could put on a to-do list and complete within hours or days.
- Do NOT write vague advice like "learn more", "do research", "think about it", "consider X".
- Do NOT start steps with "You should" or "Try to".
- Do NOT include steps about buying a course, enrolling in a program, or signing up for whatever the creator is selling.
- Each step MUST have a description (2-3 sentences) that explains: (1) exactly HOW to do this step, (2) a specific tip or insight from the content that makes this step more effective, and (3) why it matters or what result to expect.
- The description should feel like advice from someone who has done this before — specific, practical, not generic.
- Write step titles like:
    "Create a Gumroad account and upload your first product"
    "Write 3 before/after resume examples to use as samples"
    "Post your offer in 5 relevant Facebook or Reddit communities"
- Bad description: "Research the topic and learn more about it."
- Good description: "Spend 20 minutes on LinkedIn searching '[your niche] + freelancer' to see how top earners position themselves. Note their exact language for pricing and packages — you'll use this to write your own offer page."

Start each step title with an imperative verb (except for recipe ingredients). Max 60 characters per title.
Generate 4–6 steps for non-recipe content. Each step must have a non-null description. For recipes, generate as many as needed.

Return valid JSON only. No markdown.

REQUIRED OUTPUT:
{
  "action_steps": [
    { "order": 1, "title": "string", "description": "string" }
  ],
  "action_confidence": number,
  "action_notes": "string"
}`;

export function buildExtractActionsUserPrompt(
  input: ActionExtractionInput,
): string {
  const lines = [
    `Content title: ${input.title}`,
    `Summary: ${input.summary}`,
    `Category: ${input.category}`,
    `Tags: ${input.tags.join(', ')}`,
  ];
  if (input.manualNote) lines.push(`User note: ${input.manualNote}`);
  if (input.category === 'Food') {
    lines.push('\nThis is a recipe. List every ingredient as its own step, then the cooking instructions. Include all measurements and details.');
  } else {
    lines.push('\nExtract 3–7 concrete action steps from this content.');
  }
  return lines.join('\n');
}
