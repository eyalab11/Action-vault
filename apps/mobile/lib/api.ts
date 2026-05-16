/**
 * ActionVault v2 API client.
 */
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ActionTask {
  id: string; item_id: string; title: string; description: string | null;
  sort_order: number; status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  completed_at: string | null; created_at: string;
}

export interface TravelLocation {
  name: string; lat: number; lng: number; description: string;
  type: 'restaurant' | 'landmark' | 'hotel' | 'activity' | 'neighborhood' | 'other';
}

export interface FoodTasteProfile {
  sweet: boolean; salty: boolean; spicy: boolean; savory: boolean;
  sour: boolean; umami: boolean; bitter: boolean;
}

export interface MoneyTicker {
  symbol: string; name: string;
  type: 'stock' | 'crypto' | 'etf' | 'commodity' | 'forex' | 'other';
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export type Section = 'general' | 'travel' | 'food' | 'ai' | 'money';

export interface Item {
  id: string; source_url: string; source_platform: string;
  creator_name: string | null; title: string | null; summary: string | null;
  primary_category: string | null; tags: string[];
  actionable: boolean | null; confidence_score: number | null;
  extraction_quality: string | null; status: string;
  manual_note: string | null; created_at: string; analyzed_at: string | null;
  action_tasks?: ActionTask[]; action_count?: number;
  section?: Section;
  section_data?: {
    locations?: TravelLocation[];
    trip_context?: string;
    best_season?: string | null;
    taste_profile?: FoodTasteProfile;
    cuisine?: string;
    cook_time_minutes?: number | null;
    difficulty?: 'easy' | 'medium' | 'hard';
    ingredient_count?: number | null;
    dietary?: string[];
    mood_tags?: string[];
    tool?: string;
    use_case?: string;
    prompt_tip?: string | null;
    skill_level?: string;
    task_type?: string[];
    tickers?: MoneyTicker[];
    asset_type?: string;
    tip_type?: string;
    time_horizon?: string | null;
    risk_level?: string | null;
    confidence_note?: string;
  };
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader, ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function analyzeUrl(url: string, manualNote?: string, section?: Section) {
  return apiFetch<{ item: Item & { action_tasks: ActionTask[] } }>('/analyze', {
    method: 'POST',
    body: JSON.stringify({
      url,
      manual_note: manualNote,
      ...(section && section !== 'general' ? { section } : {}),
    }),
  });
}

export async function analyzeUrls(urls: string[], manualNote?: string, onProgress?: (c: number, t: number) => void, section?: Section) {
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    results.push(await analyzeUrl(urls[i], manualNote, section));
    onProgress?.(i + 1, urls.length);
  }
  return results;
}

export async function listItems(params?: { status?: string; category?: string; section?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);
  if (params?.section) qs.set('section', params.section);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<{ items: Item[]; total: number }>(`/items${query}`);
}

export async function getItem(id: string) {
  return apiFetch<{ item: Item }>(`/items/${id}`);
}

export async function updateItem(id: string, updates: { status?: string; manual_note?: string | null; title?: string }) {
  return apiFetch<{ item: Item }>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export async function deleteItem(id: string): Promise<void> {
  return apiFetch<void>(`/items/${id}`, { method: 'DELETE' });
}

export async function updateTask(itemId: string, taskId: string, status: ActionTask['status']) {
  return apiFetch<{ task: ActionTask }>(`/items/${itemId}/tasks/${taskId}`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
}
