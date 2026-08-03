-- ============================================================
-- Blair Lawn Care — PIN codes for switching between views
--
-- Run this in the Supabase SQL Editor AFTER schema.sql.
-- Safe to re-run.
--
-- What this adds:
--   • Each employee can set their own 4-digit PIN (used to switch INTO
--     their employee view on a shared device).
--   • A boss code (2802) required to switch INTO the boss view.
--   • A reset code (0000) that lets someone who forgot their PIN set a
--     new one.
--
-- PINs are stored HASHED (bcrypt via pgcrypto), never as plain text —
-- so even someone reading the database table cannot see them.
--
-- Note on what a PIN is for: it's a fast convenience lock for a shared
-- tablet, exactly as described in build.md §6. The real protection is
-- still each person's login plus the row-level security rules — an
-- employee's account cannot read customer or invoice data no matter
-- what code is typed.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Per-employee PIN ----------
alter table public.profiles
  add column if not exists pin_hash text;

-- ---------- App-wide settings (holds the boss code) ----------
create table if not exists public.app_settings (
  key         text primary key,
  value_hash  text not null,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Nobody reads this table directly; the functions below do the checking.
drop policy if exists "app_settings boss read" on public.app_settings;
create policy "app_settings boss read" on public.app_settings
  for select to authenticated using (public.is_boss());

-- Seed the boss code as 2802 (only if it isn't already set)
insert into public.app_settings (key, value_hash)
values ('boss_code', crypt('2802', gen_salt('bf')))
on conflict (key) do nothing;

-- ============================================================
-- Functions
-- All are SECURITY DEFINER so they can read the hashes, but they only
-- ever return true/false — never the hash itself.
-- ============================================================

-- Set (or change) the PIN of the signed-in user.
create or replace function public.set_my_pin(new_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if new_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;
  if new_pin = '0000' then
    raise exception '0000 is reserved as the reset code';
  end if;
  update public.profiles
     set pin_hash = crypt(new_pin, gen_salt('bf'))
   where id = auth.uid();
end;
$$;

-- Set the PIN of any employee. Boss only (for helping crew out).
create or replace function public.set_employee_pin(employee uuid, new_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_boss() then
    raise exception 'Only the boss can set another employee''s PIN';
  end if;
  if new_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;
  update public.profiles
     set pin_hash = crypt(new_pin, gen_salt('bf'))
   where id = employee;
end;
$$;

-- Does this employee have a PIN yet?
create or replace function public.employee_has_pin(employee uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select pin_hash is not null from public.profiles where id = employee;
$$;

-- Check an employee's PIN. Returns true/false only.
create or replace function public.verify_employee_pin(employee uuid, pin text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  stored text;
begin
  select pin_hash into stored from public.profiles where id = employee;
  if stored is null then
    return false;
  end if;
  return stored = crypt(pin, stored);
end;
$$;

-- Check the boss code (2802 by default).
create or replace function public.verify_boss_code(code text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  stored text;
begin
  select value_hash into stored from public.app_settings where key = 'boss_code';
  if stored is null then
    return false;
  end if;
  return stored = crypt(code, stored);
end;
$$;

-- Change the boss code. Boss only.
create or replace function public.set_boss_code(new_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_boss() then
    raise exception 'Only the boss can change the boss code';
  end if;
  if new_code !~ '^\d{4}$' then
    raise exception 'Code must be exactly 4 digits';
  end if;
  insert into public.app_settings (key, value_hash, updated_at)
  values ('boss_code', crypt(new_code, gen_salt('bf')), now())
  on conflict (key) do update
    set value_hash = excluded.value_hash, updated_at = now();
end;
$$;

-- ---------- Permissions ----------
grant execute on function public.set_my_pin(text)                     to authenticated;
grant execute on function public.set_employee_pin(uuid, text)         to authenticated;
grant execute on function public.employee_has_pin(uuid)               to authenticated;
grant execute on function public.verify_employee_pin(uuid, text)      to authenticated;
grant execute on function public.verify_boss_code(text)               to authenticated;
grant execute on function public.set_boss_code(text)                  to authenticated;

-- ============================================================
-- Done.
--   Boss code:   2802   (change it any time from Settings)
--   Reset code:  0000   (handled in the app — lets someone who forgot
--                        their PIN choose a new one)
-- ============================================================
