-- ============================================================
-- Blair Lawn Care — bill a completed job through Square
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- A job and its invoice stay separate records with a 1:1 link. The job is
-- what the crew see and tick off; the Square invoice is the money side.
-- Keeping them apart is what makes it possible to void a charge, redo a
-- job, or settle a dispute without corrupting the job history.
-- ============================================================

alter table public.scheduled_jobs
  add column if not exists price             numeric(10,2),
  add column if not exists square_invoice_id text,
  add column if not exists billed_at         timestamptz,
  add column if not exists payment_status    text
    check (payment_status is null or payment_status in ('pending','paid','failed'));

-- One invoice per job, so a repeated billing run cannot raise a second
-- invoice for work already charged.
create unique index if not exists scheduled_jobs_square_invoice_key
  on public.scheduled_jobs (square_invoice_id)
  where square_invoice_id is not null;

create index if not exists scheduled_jobs_billable_idx
  on public.scheduled_jobs (job_date)
  where status = 'done' and square_invoice_id is null;

-- The price to bill defaults to whatever the customer's plan is worth,
-- so a job scheduled from the board already knows what it is owed.
create or replace function public.default_job_price()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.price is null then
    select price into new.price from public.customers where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists job_default_price on public.scheduled_jobs;
create trigger job_default_price
  before insert on public.scheduled_jobs
  for each row execute function public.default_job_price();

-- Backfill existing jobs that have no price yet.
update public.scheduled_jobs j
   set price = c.price
  from public.customers c
 where c.id = j.customer_id
   and j.price is null
   and c.price is not null;

-- Crew may set a price? No — billing is the boss's business. The
-- status-only trigger from 09 already blocks it, but list the new
-- columns explicitly so a future change doesn't quietly open them up.
create or replace function public.crew_may_only_change_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_boss() then
    return new;
  end if;

  if new.customer_id       is distinct from old.customer_id
     or new.employee_id       is distinct from old.employee_id
     or new.job_date          is distinct from old.job_date
     or new.job_time          is distinct from old.job_time
     or new.service           is distinct from old.service
     or new.recurrence        is distinct from old.recurrence
     or new.price             is distinct from old.price
     or new.square_invoice_id is distinct from old.square_invoice_id
     or new.billed_at         is distinct from old.billed_at
     or new.payment_status    is distinct from old.payment_status then
    raise exception 'Only the boss can change a job''s details; you can mark it done';
  end if;

  return new;
end;
$$;

-- The crew's view of the board doesn't need pricing, so it isn't in it.
-- (job_board from 09 already selects only the columns they need.)
