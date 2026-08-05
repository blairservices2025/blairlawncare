-- ============================================================
-- Blair Lawn Care — live updates for the rest of the app
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- 09-crew-job-board.sql switched live updates on for scheduled_jobs
-- only. Everything else — a to-do sent to a crew member, a time-off
-- request coming back the other way — sat until someone happened to
-- reload the page, which is exactly the "delayed, and sometimes never
-- arrives" behaviour.
--
-- A table has to be in this publication before the app can subscribe to
-- it; without that the subscription succeeds and simply never fires.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'todos',
    'time_off_requests',
    'time_clock_entries',
    'job_timer_entries',
    'crew_shifts'
  ]
  loop
    begin
      execute format(
        'alter publication supabase_realtime add table public.%I', t
      );
    exception
      when duplicate_object then null;   -- already published
      when undefined_object then null;   -- publication missing on this project
    end;
  end loop;
end $$;
