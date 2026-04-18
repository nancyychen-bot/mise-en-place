-- Add email notification toggle to user settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_notify_enabled BOOLEAN NOT NULL DEFAULT false;
