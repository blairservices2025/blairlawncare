-- ============================================================
-- Blair Lawn Care — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- It is safe to re-run: everything is IF NOT EXISTS / OR REPLACE where possible.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('boss', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_plan as enum ('weekly', 'biweekly', 'monthly', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('unpaid', 'paid', 'overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurrence_type as enum ('one_time', 'weekly', 'biweekly', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type time_off_status as enum ('pending', 'approved', 'denied');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('scheduled', 'in_progress', 'done', 'skipped');
exception when duplicate_object then null; end $$;

-- ============================================================
-- profiles — one row per real login (replaces blair_employee_codes)
-- Linked 1:1 to auth.users. Role checked server-side via RLS.
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'employee',
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when a new auth user signs up.
-- First user ever created becomes the boss; everyone after is an employee.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'boss'::user_role
         else 'employee'::user_role end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user the boss?
create or replace function public.is_boss()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'boss' and is_active
  );
$$;

-- ============================================================
-- customers  (was blair_customers)
-- Card fields are REFERENCE data only (brand/last4/expiry) — never
-- store a real card number. Real charging comes later via a
-- payment processor token (build.md §4).
-- ============================================================
create table if not exists public.customers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  phone              text,
  email              text,
  address            text,
  plan               service_plan not null default 'weekly',
  price              numeric(10,2),
  last_service_date  date,
  notes              text,
  card_brand         text,
  card_last4         text check (card_last4 is null or card_last4 ~ '^\d{4}$'),
  card_exp           text,
  contract_file_url  text,           -- path in the 'contracts' storage bucket
  created_at         timestamptz not null default now()
);

-- ============================================================
-- invoices  (was blair_invoices) — real DATE columns, no display strings
-- ============================================================
create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  description  text not null,
  amount       numeric(10,2) not null check (amount >= 0),
  status       invoice_status not null default 'unpaid',
  issue_date   date not null default current_date,
  due_date     date not null,
  paid_date    date,
  recurrence   recurrence_type not null default 'one_time',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists invoices_customer_idx on public.invoices(customer_id);
create index if not exists invoices_status_idx   on public.invoices(status);

-- ============================================================
-- crew_shifts  (was blair_scheduled_shifts) — real employee FK
-- ============================================================
create table if not exists public.crew_shifts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  shift_date   date not null,
  start_time   time not null,
  end_time     time not null,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists crew_shifts_emp_date_idx on public.crew_shifts(employee_id, shift_date);

-- ============================================================
-- scheduled_jobs  (was blair_scheduled_lawns) — recurrence-aware
-- ============================================================
create table if not exists public.scheduled_jobs (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  employee_id  uuid references public.profiles(id) on delete set null,
  job_date     date not null,
  recurrence   recurrence_type not null default 'one_time',
  status       job_status not null default 'scheduled',
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists scheduled_jobs_date_idx on public.scheduled_jobs(job_date);

-- ============================================================
-- time_clock_entries  (was blair_shifts) — real timestamps
-- ============================================================
create table if not exists public.time_clock_entries (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  clock_in     timestamptz not null default now(),
  clock_out    timestamptz,
  created_at   timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create index if not exists tce_emp_idx on public.time_clock_entries(employee_id, clock_in desc);

-- ============================================================
-- job_timer_entries  (was blair_timelogs)
-- ============================================================
create table if not exists public.job_timer_entries (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  job_name     text not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);
create index if not exists jte_emp_idx on public.job_timer_entries(employee_id, started_at desc);

-- ============================================================
-- time_off_requests  (was blair_timeoff)
-- ============================================================
create table if not exists public.time_off_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  reason       text,
  status       time_off_status not null default 'pending',
  reviewed_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ============================================================
-- todos  (was blair_todos)
-- ============================================================
create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid references public.profiles(id) on delete cascade, -- null = general/boss todo
  text         text not null,
  done         boolean not null default false,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- receipts  (was blair_receipts) — file lives in Storage, not base64
-- ============================================================
create table if not exists public.receipts (
  id           uuid primary key default gen_random_uuid(),
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  file_path    text not null,        -- path in the 'receipts' storage bucket
  note         text,
  amount       numeric(10,2),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- audit_log — who changed what, when (build.md §5)
-- ============================================================
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id),
  action      text not null,
  table_name  text not null,
  row_id      text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

-- Generic audit trigger for money-adjacent tables
create or replace function public.write_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, table_name, row_id, detail)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id::text else new.id::text end), null),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function public.write_audit();

drop trigger if exists audit_customers on public.customers;
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function public.write_audit();

-- ============================================================
-- Row Level Security
-- Boss: full access to everything.
-- Employees: their own rows for personal tables; read-only where noted.
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.customers          enable row level security;
alter table public.invoices           enable row level security;
alter table public.crew_shifts        enable row level security;
alter table public.scheduled_jobs     enable row level security;
alter table public.time_clock_entries enable row level security;
alter table public.job_timer_entries  enable row level security;
alter table public.time_off_requests  enable row level security;
alter table public.todos              enable row level security;
alter table public.receipts           enable row level security;
alter table public.audit_log          enable row level security;

-- profiles: everyone signed in can read (needed for names on schedules);
-- users update their own basic info; boss manages all.
drop policy if exists "profiles read"   on public.profiles;
create policy "profiles read"   on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
drop policy if exists "profiles boss all" on public.profiles;
create policy "profiles boss all" on public.profiles for all to authenticated
  using (public.is_boss()) with check (public.is_boss());

-- customers / invoices: boss only
drop policy if exists "customers boss" on public.customers;
create policy "customers boss" on public.customers for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "invoices boss" on public.invoices;
create policy "invoices boss" on public.invoices for all to authenticated
  using (public.is_boss()) with check (public.is_boss());

-- crew_shifts: boss full; employee reads own
drop policy if exists "shifts boss" on public.crew_shifts;
create policy "shifts boss" on public.crew_shifts for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "shifts own read" on public.crew_shifts;
create policy "shifts own read" on public.crew_shifts for select to authenticated
  using (employee_id = auth.uid());

-- scheduled_jobs: boss full; employee reads jobs assigned to them
drop policy if exists "jobs boss" on public.scheduled_jobs;
create policy "jobs boss" on public.scheduled_jobs for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "jobs own read" on public.scheduled_jobs;
create policy "jobs own read" on public.scheduled_jobs for select to authenticated
  using (employee_id = auth.uid());

-- time_clock_entries: boss full; employee inserts/reads/updates own
drop policy if exists "clock boss" on public.time_clock_entries;
create policy "clock boss" on public.time_clock_entries for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "clock own" on public.time_clock_entries;
create policy "clock own" on public.time_clock_entries for select to authenticated
  using (employee_id = auth.uid());
drop policy if exists "clock own insert" on public.time_clock_entries;
create policy "clock own insert" on public.time_clock_entries for insert to authenticated
  with check (employee_id = auth.uid());
drop policy if exists "clock own update" on public.time_clock_entries;
create policy "clock own update" on public.time_clock_entries for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- job_timer_entries: same pattern
drop policy if exists "timer boss" on public.job_timer_entries;
create policy "timer boss" on public.job_timer_entries for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "timer own" on public.job_timer_entries;
create policy "timer own" on public.job_timer_entries for select to authenticated
  using (employee_id = auth.uid());
drop policy if exists "timer own insert" on public.job_timer_entries;
create policy "timer own insert" on public.job_timer_entries for insert to authenticated
  with check (employee_id = auth.uid());
drop policy if exists "timer own update" on public.job_timer_entries;
create policy "timer own update" on public.job_timer_entries for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- time_off_requests: boss full; employee creates + reads own
drop policy if exists "timeoff boss" on public.time_off_requests;
create policy "timeoff boss" on public.time_off_requests for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "timeoff own read" on public.time_off_requests;
create policy "timeoff own read" on public.time_off_requests for select to authenticated
  using (employee_id = auth.uid());
drop policy if exists "timeoff own insert" on public.time_off_requests;
create policy "timeoff own insert" on public.time_off_requests for insert to authenticated
  with check (employee_id = auth.uid() and status = 'pending');

-- todos: boss full; employee reads own + general, can mark own done
drop policy if exists "todos boss" on public.todos;
create policy "todos boss" on public.todos for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "todos own read" on public.todos;
create policy "todos own read" on public.todos for select to authenticated
  using (employee_id = auth.uid() or employee_id is null);
drop policy if exists "todos own update" on public.todos;
create policy "todos own update" on public.todos for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- receipts: boss full; employee creates + reads own
drop policy if exists "receipts boss" on public.receipts;
create policy "receipts boss" on public.receipts for all to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists "receipts own read" on public.receipts;
create policy "receipts own read" on public.receipts for select to authenticated
  using (uploaded_by = auth.uid());
drop policy if exists "receipts own insert" on public.receipts;
create policy "receipts own insert" on public.receipts for insert to authenticated
  with check (uploaded_by = auth.uid());

-- audit_log: boss read-only (writes happen via security-definer trigger)
drop policy if exists "audit boss read" on public.audit_log;
create policy "audit boss read" on public.audit_log for select to authenticated
  using (public.is_boss());

-- ============================================================
-- Storage buckets: receipts + contracts (private; served via signed URLs)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- receipts bucket: any signed-in user can upload to their own folder; boss reads all
-- Crew write into their own folder; the boss can reach any of them,
-- which is what lets the boss file a receipt while viewing a crew
-- member's page.
drop policy if exists "receipts upload own folder" on storage.objects;
create policy "receipts upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_boss()));
drop policy if exists "receipts read own or boss" on storage.objects;
create policy "receipts read own or boss" on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_boss()));
drop policy if exists "receipts delete own or boss" on storage.objects;
create policy "receipts delete own or boss" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_boss()));
drop policy if exists "receipts update own or boss" on storage.objects;
create policy "receipts update own or boss" on storage.objects for update to authenticated
  using (bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_boss()))
  with check (bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_boss()));

-- contracts bucket: boss only
drop policy if exists "contracts boss all" on storage.objects;
create policy "contracts boss all" on storage.objects for all to authenticated
  using (bucket_id = 'contracts' and public.is_boss())
  with check (bucket_id = 'contracts' and public.is_boss());

-- ============================================================
-- Done. Next steps (see README):
-- 1. Create the boss account first (Authentication → Users → Add user,
--    or sign up through the app) — the FIRST user automatically gets
--    the 'boss' role.
-- 2. Every user created after that defaults to 'employee'.
-- ============================================================
