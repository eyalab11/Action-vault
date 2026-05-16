import type { PrimaryCategory } from './items';
import type { ActionTask } from './items';

export type ClusterStatus = 'candidate' | 'active' | 'dismissed' | 'user_created';

export interface Cluster {
  id: string;
  user_id: string;
  title: string | null;
  summary: string | null;
  primary_category: PrimaryCategory | null;
  repeated_advice: string[];
  merged_action_plan: MergedActionStep[];
  item_count: number;
  confidence_score: number | null;
  status: ClusterStatus;
  created_at: string;
  updated_at: string;
  last_summarized_at: string | null;
}

export interface MergedActionStep {
  order: number;
  title: string;
  description: string | null;
}

export interface ClusterDetail extends Cluster {
  items: ClusterMember[];
  action_tasks: ActionTask[];
}

export interface ClusterMember {
  id: string;
  title: string | null;
  summary: string | null;
  source_platform: string;
  similarity: number | null;
  added_at: string;
}
