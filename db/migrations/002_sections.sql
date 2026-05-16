-- ============================================================
-- ActionVault v2 — Section Data Migration
-- Run this ONCE in Supabase SQL Editor:
--   supabase.com → your project → SQL Editor → paste & run
-- Takes about 2 seconds.
-- ============================================================

-- Add section column — which of the 4 vaults this item belongs to
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'general'
    CHECK (section IN ('general', 'travel', 'food', 'ai', 'money'));

-- Add flexible JSON column for section-specific extracted data:
--   travel:  { locations: [{name, lat, lng, description}] }
--   food:    { taste_profile: {sweet,salty,spicy,savory,sour,umami}, cuisine, cook_time, ingredient_count }
--   ai:      { tool: "Claude|ChatGPT|Gemini|Midjourney|Cursor|Other", use_case, prompt_tip }
--   money:   { tickers: [{symbol,type,sentiment}], asset_type, tip_type, confidence }
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS section_data JSONB NOT NULL DEFAULT '{}';

-- Index for fast section filtering
CREATE INDEX IF NOT EXISTS idx_items_user_section
  ON public.items(user_id, section);

-- Helper function so the backend can auto-migrate on startup
CREATE OR REPLACE FUNCTION public.apply_v2_migration()
RETURNS void AS $$
BEGIN
  -- idempotent — safe to call multiple times
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'general';
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS section_data JSONB NOT NULL DEFAULT '{}';
EXCEPTION WHEN others THEN
  -- columns already exist, ignore
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
