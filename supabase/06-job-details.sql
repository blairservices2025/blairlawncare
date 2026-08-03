-- ============================================================
-- Blair Lawn Care — scheduled jobs get a time and a service label
-- Run in the Supabase SQL Editor after the earlier files.
-- Safe to re-run.
-- ============================================================

alter table public.scheduled_jobs
  add column if not exists job_time time,
  add column if not exists service  text;
