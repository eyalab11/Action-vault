/**
 * API client for the ActionVault backend.
 * All requests are authenticated with the Supabase session JWT.
 */

import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────

export interface ActionTask {
  id: string;
  item_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  completed_at: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  source_url: string;
  source_platform: string;
  creator_name: string | null;
  title: string | null;
  summary: string | null;
  primary_category: string | null;
  tags: string[];
  actionable: boolean | null;
  confidence_score: number | null;
  extraction_quality: string | null;
  status: string;
  manual_note: string | null;
  created_at: string;
  analyzed_at: string | null;
  // Detail only
  action_tasks?: ActionTask[];
  action_count?: number;
}

export interface AnalyzeResponse {
  item: Item & { action_tasks: ActionTask[] };
}

export interface ListResponse {
  items: Item[];
  total: number;
}

// ─── Auth header ──────────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

// ─── Base fetch helper ────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Endpoints ────────────────────────────────────────────────

export async function analyzeUrl(
  url: string,
  manualNote?: string,
): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>('/analyze', {
    method: 'POST',
    body: JSON.stringify({ url, manual_note: manualNote }),
  });
}

export async function analyzeUrls(
  urls: string[],
  manualNote?: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<AnalyzeResponse[]> {
  const results: AnalyzeResponse[] = [];
  for (let i = 0; i < urls.length; i++) {
    const result = await analyzeUrl(urls[i], manualNote);
    results.push(result);
    onProgress?.(i + 1, urls.length);
  }
  return results;
}

export async function listItems(params?: {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));

  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ListResponse>(`/items${query}`);
}

export async function getItem(id: string): Promise<{ item: Item }> {
  return apiFetch<{ item: Item }>(`/items/${id}`);
}

export async function updateItem(
  id: string,
  updates: { status?: string; manual_note?: string | null; title?: string },
): Promise<{ item: Item }> {
  return apiFetch<{ item: Item }>(`/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteItem(id: string): Promise<void> {
  return apiFetch<void>(`/items/${id}`, { method: 'DELETE' });
}

export async function updateTask(
  itemId: string,
  taskId: string,
  status: ActionTask['status'],
): Promise<{ task: ActionTask }> {
  return apiFetch<{ task: ActionTask }>(
    `/items/${itemId}/tasks/${taskId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}
