-- ============================================================
-- Blair Lawn Care — the yard list is only for people working that day
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Someone who isn't on the schedule has no reason to be looking at where
-- the crew are that day, so the board is closed to them. Enforced in the
-- database rather than by hiding it in the app: hiding a section only
-- stops people who don't open dev tools.
--
-- Working that day means either a shift on the crew board, or a job on
-- the route assigned to them. The boss always sees everything.
-- ============================================================

create or replace function public.is_working_on(day date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_boss()
    or exists (
      select 1 from public.crew_shifts s
       where s.employee_id = auth.uid() and s.shift_date = day
    )
    or exists (
      select 1 from public.scheduled_jobs j
       where j.employee_id = auth.uid() and j.job_date = day
    );
$$;

grant execute on function public.is_working_on(date) to authenticated;

-- The view already limited what could be seen; it now also limits when.
drop view if exists public.job_board;

create view public.job_board
with (security_invoker = off) as
select
  j.id,
  j.customer_id,
  j.yard_id,
  j.employee_id,
  j.job_date,
  j.job_time,
  j.service,
  j.status,
  j.note,
  j.recurrence,
  coalesce(y.name, c.name)       as customer_name,
  coalesce(y.address, c.address) as customer_address,
  y.name                         as yard_name,
  y.gate_code                    as gate_code,
  c.name                         as client_name,
  p.full_name                    as assigned_to
from public.scheduled_jobs j
left join public.yards     y on y.id = j.yard_id
left join public.customers c on c.id = j.customer_id
left join public.profiles  p on p.id = j.employee_id
where public.is_working_on(j.job_date);

revoke all on public.job_board from anon;
grant select on public.job_board to authenticated;

-- Ticking a yard off is likewise only for people working that day.
drop policy if exists "jobs crew update" on public.scheduled_jobs;
create policy "jobs crew update" on public.scheduled_jobs
  for update to authenticated
  using (public.is_working_on(job_date))
  with check (public.is_working_on(job_date));
