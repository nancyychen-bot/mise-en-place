ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS release_days_ahead INTEGER,
  ADD COLUMN IF NOT EXISTS release_time TEXT;
