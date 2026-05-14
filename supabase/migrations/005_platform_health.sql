-- Tracks last-known health per platform for green→red transition alerts.
-- Shape: { "resy": "ok" | "error", "opentable": ..., "sevenrooms": ..., "tock": ... }
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS platform_health JSONB NOT NULL DEFAULT '{}'::jsonb;
