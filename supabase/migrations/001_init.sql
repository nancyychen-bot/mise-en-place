-- ─────────────────────────────────────────────────────
-- Mise en Place — initial schema
-- Run this in Supabase's SQL editor or via supabase db push
-- ─────────────────────────────────────────────────────

-- Users profile table (extends Supabase Auth's auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- User settings & monitoring preferences
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  resy_api_key        TEXT,
  ntfy_topic          TEXT,
  ntfy_priority       TEXT NOT NULL DEFAULT 'default'
                        CHECK (ntfy_priority IN ('min','low','default','high','max')),
  monitoring_enabled  BOOLEAN NOT NULL DEFAULT true,
  earliest_time       TEXT NOT NULL DEFAULT '18:00',
  latest_time         TEXT NOT NULL DEFAULT '20:00',
  day_range           INT  NOT NULL DEFAULT 14,
  days_of_week        TEXT NOT NULL DEFAULT 'all'
                        CHECK (days_of_week IN ('all','weekdays','weekends','sat','fri-sun')),
  check_interval_min  INT  NOT NULL DEFAULT 5,
  active_hours_start  TEXT NOT NULL DEFAULT '08:00',
  active_hours_end    TEXT NOT NULL DEFAULT '22:00',
  quiet_hours_start   TEXT NOT NULL DEFAULT '22:00',
  quiet_hours_end     TEXT NOT NULL DEFAULT '07:00',
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Watched restaurants
CREATE TABLE IF NOT EXISTS public.restaurants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('resy','opentable')),
  venue_id      TEXT NOT NULL,
  party_size    INT  NOT NULL DEFAULT 2,
  active        BOOLEAN NOT NULL DEFAULT true,
  last_checked  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurants_user_active
  ON public.restaurants(user_id, active);

-- Activity / notification log
CREATE TABLE IF NOT EXISTS public.activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id   UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('check','found','notify','system')),
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_user_created
  ON public.activity_log(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- users: each user can read/update their own row
CREATE POLICY "users_self" ON public.users
  FOR ALL USING (auth.uid() = id);

-- user_settings: same
CREATE POLICY "settings_self" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id);

-- restaurants: per-user
CREATE POLICY "restaurants_self" ON public.restaurants
  FOR ALL USING (auth.uid() = user_id);

-- activity_log: per-user
CREATE POLICY "activity_self" ON public.activity_log
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────
-- Trigger: auto-create user profile + settings on signup
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
