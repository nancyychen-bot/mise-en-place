-- Per-restaurant time window overrides (NULL = use global setting)
ALTER TABLE public.restaurants
  ADD COLUMN earliest_time TEXT DEFAULT NULL,
  ADD COLUMN latest_time  TEXT DEFAULT NULL;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_earliest_time_format
    CHECK (earliest_time IS NULL OR earliest_time ~ '^\d{2}:\d{2}$');

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_latest_time_format
    CHECK (latest_time IS NULL OR latest_time ~ '^\d{2}:\d{2}$');
