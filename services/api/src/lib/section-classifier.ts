export type ItemSection = 'general' | 'travel' | 'food' | 'ai' | 'money';

type VerticalSection = Exclude<ItemSection, 'general'>;

type ClassifiableItem = {
  title?: string | null;
  summary?: string | null;
  source_url?: string | null;
  section?: string | null;
  primary_category?: string | null;
};

const CATEGORY_TO_SECTION: Record<string, VerticalSection> = {
  AI: 'ai',
  Travel: 'travel',
  Food: 'food',
  Money: 'money',
};

const VERTICAL_PATTERNS: Record<VerticalSection, RegExp> = {
  ai: /\b(claude|chatgpt|gpt-?[0-9]?|gemini|midjourney|dall-?e|stable diffusion|llm|prompt(ing|s)?|cursor|copilot|anthropic|openai|ai tool|ai-?powered|ai agent|machine learning|neural net|hugging ?face|perplexity|notebooklm|sora|grok)\b/i,
  food: /\b(recipe|cook(ing)?|bak(e|ing)|pasta|cuisine|dinner|breakfast|brunch|lunch|dessert|vegan|vegetarian|gluten[- ]?free|chef|kitchen|ingredient|meal prep|sourdough|pizza|sushi)\b/i,
  travel: /\b(travel|trip|itinerary|hotel|flight|airbnb|vacation|holiday|destination|tokyo|paris|bali|rome|london|barcelona|backpack|tourist|sightsee|nomad|hostel)\b/i,
  money: /\b(stock|crypto|bitcoin|ethereum|invest(ing|ment)?|portfolio|trading|ticker|nasdaq|s ?& ?p|etf|dividend|finance|market|bullish|bearish|broker|robinhood|hedge fund|roth ira|401k)\b/i,
};

export function effectiveSection(item: ClassifiableItem): ItemSection {
  const rawSection = item.section as ItemSection | null | undefined;
  if (rawSection && rawSection !== 'general') return rawSection;

  const categorySection = item.primary_category ? CATEGORY_TO_SECTION[item.primary_category] : null;
  if (categorySection) return categorySection;

  const text = [item.title ?? '', item.summary ?? '', item.source_url ?? ''].join(' ');
  if (!text.trim()) return 'general';

  for (const section of ['ai', 'food', 'travel', 'money'] as VerticalSection[]) {
    if (VERTICAL_PATTERNS[section].test(text)) return section;
  }

  return 'general';
}
