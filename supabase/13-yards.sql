-- ============================================================
-- Blair Lawn Care — one client, many yards
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- A client can have several properties mowed. Each yard has its own
-- address, plan, price and service history; the client is who gets
-- billed and whose card is on file. Jobs are scheduled against a yard.
--
-- Existing data is carried over: every current customer gets one yard
-- made from their address, and their jobs are pointed at it. Nothing is
-- lost and nothing needs re-entering.
-- ============================================================

create table if not exists public.yards (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers(id) on delete cascade,
  name              text not null,
  address           text,
  plan              service_plan not null default 'weekly',
  price             numeric(10,2),
  last_service_date date,
  notes             text,
  gate_code         text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists yards_customer_idx on public.yards (customer_id);

alter table public.yards enable row level security;

-- Pricing and notes are the boss's business.
drop policy if exists "yards boss" on public.yards;
create policy "yards boss" on public.yards for all to authenticated
  using (public.is_boss()) with check (public.is_boss());

-- ---------- Carry the existing customers over ----------
-- One yard per customer that hasn't got one yet, named after their
-- address so the board still reads the way it did.
insert into public.yards (customer_id, name, address, plan, price, last_service_date, notes)
select
  c.id,
  coalesce(nullif(trim(c.address), ''), c.name || '''s yard'),
  c.address,
  c.plan,
  c.price,
  c.last_service_date,
  c.notes
from public.customers c
where not exists (select 1 from public.yards y where y.customer_id = c.id);

-- ---------- Jobs are scheduled against a yard ----------
-- customer_id stays: it is who gets billed, and keeping it means the
-- billing and invoice paths carry on working untouched.
alter table public.scheduled_jobs
  add column if not exists yard_id uuid references public.yards(id) on delete cascade;

update public.scheduled_jobs j
   set yard_id = y.id
  from public.yards y
 where y.customer_id = j.customer_id
   and j.yard_id is null;

create index if not exists scheduled_jobs_yard_idx on public.scheduled_jobs (yard_id);

-- Keep the two in step: setting a yard fills in its client, and a job's
-- price defaults to that yard's price.
create or replace function public.default_job_price()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  y record;
begin
  if new.yard_id is not null then
    select customer_id, price into y from public.yards where id = new.yard_id;
    if y.customer_id is not null then
      new.customer_id := y.customer_id;
    end if;
    if new.price is null then
      new.price := y.price;
    end if;
  end if;

  if new.price is null then
    select price into new.price from public.customers where id = new.customer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists job_default_price on public.scheduled_jobs;
create trigger job_default_price
  before insert or update of yard_id on public.scheduled_jobs
  for each row execute function public.default_job_price();

-- The crew still only get to change the status.
create or replace function public.crew_may_only_change_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_boss() then
    return new;
  end if;

  if new.customer_id       is distinct from old.customer_id
     or new.yard_id           is distinct from old.yard_id
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

-- ---------- What the crew see ----------
-- The yard's name and address is what matters in the field; the client's
-- name comes along so they know whose place it is. Still no pricing.
create or replace view public.job_board
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
left join public.profiles  p on p.id = j.employee_id;

revoke all on public.job_board from anon;
grant select on public.job_board to authenticated;
