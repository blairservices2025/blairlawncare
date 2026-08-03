-- ============================================================
-- Blair Lawn Care — time-off requests get a start and end time
-- Run in the Supabase SQL Editor after the earlier files.
-- Safe to re-run. Existing requests are left alone (their times stay
-- empty, which the app shows as "all day").
-- ============================================================

alter table public.time_off_requests
  add column if not exists start_time time,
  add column if not exists end_time   time;

-- A request is either all day (both times empty) or a window on one day.
do $$ begin
  alter table public.time_off_requests
    add constraint time_off_time_window
    check (
      (start_time is null and end_time is null)
      or (start_time is not null and end_time is not null and end_time > start_time)
    );
exception when duplicate_object then null; end $$;
