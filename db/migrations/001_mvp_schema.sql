-- ============================================================
-- ActionVault MVP Schema
-- Run this in Supabase SQL editor or via psql.
-- ============================================================

-- ─── USERS ───────────────────────────────────────────────────
-- Extends Supabase Auth. Created automatically on first sign-in
-- via the trigger below.
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create user profile row on Supabase Auth sign-up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── ITEMS ────────────────────────────────────────────────────
-- Central table. One row per saved link.
-- All AI analysis is stored directly here — no separate analysis table for MVP.
CREATE TABLE IF NOT EXISTS public.items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Input
  source_url          TEXT NOT NULL,
  canonical_url       TEXT,
  source_platform     TEXT NOT NULL DEFAULT 'unknown',
    -- 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'web' | 'unknown'
  manual_note         TEXT,          -- user-supplied context, sent with the AI prompt

  -- Metadata fetched from oEmbed / OG
  og_title            TEXT,          -- raw title from page, before AI rewrite
  og_description      TEXT,
  creator_name        TEXT,

  -- AI analysis results (denormalized for fast reads)
  title               TEXT,          -- AI-generated clean title
  summary             TEXT,          -- 2-3 sentence summary
  primary_category    TEXT,          -- see PRIMARY_CATEGORIES constant
  tags                TEXT[] NOT NULL DEFAULT '{}',
  actionable          BOOLEAN,
  confidence_score    NUMERIC(4,3),
  extraction_quality  TEXT,          -- 'high' | 'medium' | 'low' | 'failed'

  -- Workflow
  status              TEXT NOT NULL DEFAULT 'inbox',
    -- 'inbox' | 'reviewed' | 'archived' | 'completed'

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at         TIMESTAMPTZ
);

CREATE INDEX idx_items_user_id      ON public.items(user_id);
CREATE INDEX idx_items_user_status  ON public.items(user_id, status);
CREATE INDEX idx_items_user_created ON public.items(user_id, created_at DESC);
CREATE INDEX idx_items_user_cat     ON public.items(user_id, primary_category);

-- ─── ACTION TASKS ─────────────────────────────────────────────
-- Extracted action steps for a given item.
CREATE TABLE IF NOT EXISTS public.action_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,     -- imperative, max 60 chars
  description     TEXT,              -- optional elaboration
  sort_order      INT NOT NULL DEFAULT 0,

  status          TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'in_progress' | 'completed' | 'dismissed'

  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_tasks_item_id    ON public.action_tasks(item_id);
CREATE INDEX idx_action_tasks_user_id    ON public.action_tasks(user_id);
CREATE INDEX idx_action_tasks_user_status ON public.action_tasks(user_id, status);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own profile.
CREATE POLICY "users_own" ON public.users
  FOR ALL USING (auth.uid() = id);

-- Users can only see/edit their own items.
CREATE POLICY "items_own" ON public.items
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see/edit their own tasks.
CREATE POLICY "action_tasks_own" ON public.action_tasks
  FOR ALL USING (auth.uid() = user_id);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_action_tasks_updated_at
  BEFORE UPDATE ON public.action_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
