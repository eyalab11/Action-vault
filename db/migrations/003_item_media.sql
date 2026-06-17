-- ============================================================
-- ActionVault v3 — Source media for saved posts
-- Run this ONCE in Supabase SQL Editor.
-- ============================================================

-- Public media/thumbnail URLs extracted from the source post.
-- For Instagram, this is usually the post/reel thumbnail or carousel images.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS media_urls JSONB NOT NULL DEFAULT '[]';

-- Concise OCR/visual notes generated from post images, used to remind the user
-- what the post showed when opening details later.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS visual_context TEXT;

-- Helper function so the backend can auto-apply this after the SQL has been
-- installed once.
CREATE OR REPLACE FUNCTION public.apply_v3_media_migration()
RETURNS void AS $$
BEGIN
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS media_urls JSONB NOT NULL DEFAULT '[]';
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS visual_context TEXT;
EXCEPTION WHEN others THEN
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
