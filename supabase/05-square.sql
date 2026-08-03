-- ============================================================
-- Blair Lawn Care — Square sync
-- Run in the Supabase SQL Editor after the earlier files.
-- Safe to re-run.
--
-- Adds the columns needed to keep app records lined up with the
-- matching Square records, so a customer or invoice created in Square
-- turns into the same one here rather than a duplicate.
-- ============================================================

alter table public.customers
  add column if not exists square_customer_id text,
  add column if not exists synced_from_square_at timestamptz;

alter table public.invoices
  add column if not exists square_invoice_id text,
  add column if not exists synced_from_square_at timestamptz;

-- One app record per Square record. These make the sync's "insert or
-- update" behaviour possible and stop repeat webhooks creating copies.
create unique index if not exists customers_square_id_key
  on public.customers (square_customer_id)
  where square_customer_id is not null;

create unique index if not exists invoices_square_id_key
  on public.invoices (square_invoice_id)
  where square_invoice_id is not null;

-- Invoices arriving from Square may not line up with a customer we know
-- about yet, so allow the link to be empty for those.
alter table public.invoices
  alter column customer_id drop not null;

-- Record of every sync run, so the Settings page can show what happened.
create table if not exists public.square_sync_log (
  id            bigint generated always as identity primary key,
  source        text not null,          -- 'webhook' or 'manual'
  event_type    text,
  customers_synced integer not null default 0,
  invoices_synced  integer not null default 0,
  error         text,
  created_at    timestamptz not null default now()
);

alter table public.square_sync_log enable row level security;

drop policy if exists "square log boss read" on public.square_sync_log;
create policy "square log boss read" on public.square_sync_log
  for select to authenticated using (public.is_boss());
