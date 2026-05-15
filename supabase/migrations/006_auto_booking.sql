-- Auto-booking: auth tokens on user_settings, booking controls on restaurants
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS resy_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS opentable_session TEXT,
  ADD COLUMN IF NOT EXISTS sevenrooms_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expired JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS auto_book BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_time TEXT;
