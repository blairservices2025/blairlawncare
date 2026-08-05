-- ============================================================
-- Blair Lawn Care — inventory
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Supplies that get used up (fuel, oil, trimmer line, fertilizer) and
-- equipment that gets serviced (mowers, blowers). Both live here because
-- both are things you need to know you have before a Monday morning.
-- ============================================================

do $$ begin
  create type inventory_category as enum (
    'equipment', 'supplies', 'parts', 'fuel', 'chemicals', 'other'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      inventory_category not null default 'supplies',
  quantity      numeric(10,2) not null default 0,
  unit          text not null default 'each',
  low_stock_at  numeric(10,2),
  unit_cost     numeric(10,2),
  location      text,
  notes         text,
  service_due   date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists inventory_active_idx
  on public.inventory_items (is_active, category);

alter table public.inventory_items enable row level security;

drop policy if exists "inventory boss" on public.inventory_items;
create policy "inventory boss" on public.inventory_items for all to authenticated
  using (public.is_boss()) with check (public.is_boss());

-- ---------- Who changed what ----------
-- A count that drifts is only useful if you can see where it went, so
-- every change to a quantity is recorded rather than just overwritten.
create table if not exists public.inventory_adjustments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.inventory_items(id) on delete cascade,
  changed_by uuid references public.profiles(id),
  delta      numeric(10,2) not null,
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_adjustments_item_idx
  on public.inventory_adjustments (item_id, created_at desc);

alter table public.inventory_adjustments enable row level security;

drop policy if exists "inventory log boss" on public.inventory_adjustments;
create policy "inventory log boss" on public.inventory_adjustments for all to authenticated
  using (public.is_boss()) with check (public.is_boss());

-- ---------- Adjust a count and log it in one step ----------
-- Doing both in the database keeps the count and its history from
-- disagreeing if something fails halfway.
create or replace function public.adjust_inventory(
  item uuid,
  change numeric,
  why text default null
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  new_qty numeric;
begin
  if not public.is_boss() then
    raise exception 'Only the boss can adjust inventory';
  end if;

  update public.inventory_items
     set quantity = greatest(0, quantity + change),
         updated_at = now()
   where id = item
  returning quantity into new_qty;

  if new_qty is null then
    raise exception 'No such item';
  end if;

  insert into public.inventory_adjustments (item_id, changed_by, delta, reason)
  values (item, auth.uid(), change, why);

  return new_qty;
end;
$$;

grant execute on function public.adjust_inventory(uuid, numeric, text) to authenticated;
