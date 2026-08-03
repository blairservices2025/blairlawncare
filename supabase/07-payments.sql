-- ============================================================
-- Blair Lawn Care — record real card payments taken through Square
-- Run in the Supabase SQL Editor after the earlier files.
-- Safe to re-run.
-- ============================================================

alter table public.invoices
  add column if not exists square_payment_id text,
  add column if not exists paid_amount numeric(10,2);

-- A record of every charge attempt, successful or not. Worth having from
-- day one once real money is involved: who charged what, when, and what
-- Square said back.
create table if not exists public.payment_attempts (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid references public.invoices(id) on delete set null,
  customer_id      uuid references public.customers(id) on delete set null,
  charged_by       uuid references public.profiles(id),
  amount           numeric(10,2) not null,
  card_last4       text,
  status           text not null,          -- 'completed' | 'failed'
  square_payment_id text,
  error            text,
  created_at       timestamptz not null default now()
);

create index if not exists payment_attempts_invoice_idx
  on public.payment_attempts (invoice_id);

alter table public.payment_attempts enable row level security;

-- Boss reads the history; writes happen server-side with the service key.
drop policy if exists "payments boss read" on public.payment_attempts;
create policy "payments boss read" on public.payment_attempts
  for select to authenticated using (public.is_boss());
