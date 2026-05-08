-- Per-restaurant date range override (NULL = use global setting)
ALTER TABLE public.restaurants
  ADD COLUMN day_range INTEGER DEFAULT NULL;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_day_range_valid
    CHECK (day_range IS NULL OR (day_range >= 1 AND day_range <= 60));
