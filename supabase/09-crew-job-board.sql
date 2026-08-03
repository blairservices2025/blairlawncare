-- ============================================================
-- Blair Lawn Care — the crew can see the mowing schedule and tick jobs off
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Three things were in the way:
--
-- 1. Customers are boss-only, so a crew member's schedule showed blank
--    names — they could not see whose yard it was.
-- 2. Crew only saw jobs assigned to them, so anything unassigned was
--    invisible.
-- 3. There was no update permission, so marking a job done would fail.
--
-- The board is now shared: every signed-in person sees the same jobs and
-- can mark one complete, and that shows for everyone.
-- ============================================================

-- ---------- 1. Crew can see the whole board ----------
drop policy if exists "jobs own read" on public.scheduled_jobs;
drop policy if exists "jobs crew read" on public.scheduled_jobs;
create policy "jobs crew read" on public.scheduled_jobs
  for select to authenticated using (true);

-- ---------- 2. Crew can mark a job done ----------
-- Anyone on the crew can tick off any job: they work the route together,
-- and whoever finishes a yard is the one holding the phone.
drop policy if exists "jobs crew update" on public.scheduled_jobs;
create policy "jobs crew update" on public.scheduled_jobs
  for update to authenticated using (true) with check (true);

-- ...but a crew member may only change the status. Row-level rules cannot
-- restrict which columns are written, so a trigger enforces it — without
-- this, "can mark a job done" would also mean "can reassign or reschedule
-- anyone's work".
create or replace function public.crew_may_only_change_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_boss() then
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id
     or new.employee_id is distinct from old.employee_id
     or new.job_date    is distinct from old.job_date
     or new.job_time    is distinct from old.job_time
     or new.service     is distinct from old.service
     or new.recurrence  is distinct from old.recurrence then
    raise exception 'Only the boss can change a job''s details; you can mark it done';
  end if;

  return new;
end;
$$;

drop trigger if exists crew_status_only on public.scheduled_jobs;
create trigger crew_status_only
  before update on public.scheduled_jobs
  for each row execute function public.crew_may_only_change_status();

-- ---------- 3. Whose yard is it? ----------
-- Customer records stay boss-only. This view exposes just the name and
-- address of a customer that has a job on the board, so the crew know
-- where they are going without seeing pricing, notes or card details.
--
-- It runs with the definer's rights on purpose — that is what lets it
-- read the customers table for someone who cannot read it directly.
-- Only the columns listed here are ever visible.
create or replace view public.job_board
with (security_invoker = off) as
select
  j.id,
  j.customer_id,
  j.employee_id,
  j.job_date,
  j.job_time,
  j.service,
  j.status,
  j.note,
  j.recurrence,
  c.name    as customer_name,
  c.address as customer_address,
  p.full_name as assigned_to
from public.scheduled_jobs j
left join public.customers c on c.id = j.customer_id
left join public.profiles  p on p.id = j.employee_id;

revoke all on public.job_board from anon;
grant select on public.job_board to authenticated;

-- ---------- 4. Live updates ----------
-- So a yard ticked off on one phone appears on everyone else's without
-- anyone refreshing.
do $$ begin
  alter publication supabase_realtime add table public.scheduled_jobs;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
