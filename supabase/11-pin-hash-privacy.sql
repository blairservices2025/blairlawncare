-- ============================================================
-- Blair Lawn Care — stop the code hashes being readable
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Everyone signed in can read the profiles table — names are needed all
-- over the app. That included pin_hash. A bcrypt hash of a 4-digit code
-- is only 10,000 possibilities, so anyone who could read the column
-- could work out every crew member's code offline in seconds.
--
-- Row-level rules cannot hide a single column, but column privileges can.
-- Nothing needs to read the hash directly: the sign-in and code-setting
-- functions are security definer and read it themselves.
-- ============================================================

revoke select (pin_hash) on public.profiles from anon, authenticated;

-- Everything else on the profile stays readable as before.
grant select (
  id, full_name, role, phone, is_active, email, created_at
) on public.profiles to authenticated;

-- Used by the app to show whether someone has a code yet, without
-- handing over the hash.
create or replace function public.employee_has_pin(employee uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select pin_hash is not null from public.profiles where id = employee;
$$;

grant execute on function public.employee_has_pin(uuid) to authenticated;

-- Who has set a code and who hasn't, for the Crew page.
create or replace function public.crew_pin_status()
returns table (id uuid, has_pin boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, p.pin_hash is not null
    from public.profiles p
   where public.is_boss();
$$;

grant execute on function public.crew_pin_status() to authenticated;
