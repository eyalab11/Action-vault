export type SourcePlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'twitter'
  | 'web'
  | 'unknown';

export type ItemStatus =
  | 'inbox'
  | 'processing'
  | 'needs_review'
  | 'reviewed'
  | 'archived'
  | 'completed';

export type ExtractionQuality = 'high' | 'medium' | 'low' | 'failed';

export type PrimaryCategory =
  | 'AI'
  | 'Work'
  | 'Money'
  | 'Productivity'
  | 'Learning'
  | 'Travel'
  | 'Food'
  | 'Fitness'
  | 'PersonalAdmin'
  | 'Inspiration'
  | 'Other';

export const PRIMARY_CATEGORIES: PrimaryCategory[] = [
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
];

export const CATEGORY_LABELS: Record<PrimaryCategory, string> = {
  AI: 'AI',
  Work: 'Work',
  Money: 'Money',
  Productivity: 'Productivity',
  Learning: 'Learning',
  Travel: 'Travel',
  Food: 'Food',
  Fitness: 'Fitness',
  PersonalAdmin: 'Personal Admin',
  Inspiration: 'Inspiration',
  Other: 'Other',
};

export interface ActionTask {
  id: string;
  source_item_id: string | null;
  cluster_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  origin: 'ai' | 'user';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClusterRef {
  id: string;
  title: string | null;
  item_count: number;
  primary_category: PrimaryCategory | null;
}

export interface RelatedItem {
  id: string;
  title: string | null;
  primary_category: PrimaryCategory | null;
  similarity: number;
}

export interface SourceItemSummary {
  id: string;
  source_url: string | null;
  source_platform: SourcePlatform;
  creator_name: string | null;
  title: string | null;
  summary: string | null;
  primary_category: PrimaryCategory | null;
  tags: string[];
  actionable: boolean | null;
  action_count: number;
  confidence_score: number | null;
  extraction_quality: ExtractionQuality | null;
  status: ItemStatus;
  cluster_id: string | null;
  created_at: string;
  analyzed_at: string | null;
}

export interface SourceItemDetail extends SourceItemSummary {
  canonical_url: string | null;
  raw_text: string | null;
  action_tasks: ActionTask[];
  cluster: ClusterRef | null;
  manual_note: string | null;
  related_items: RelatedItem[];
}

export interface ManualNote {
  id: string;
  source_item_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}
