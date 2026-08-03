-- ============================================================
-- Blair Lawn Care — "time active on the app" tracker
-- Run in the Supabase SQL Editor after schema.sql and 02-pins.sql.
-- Safe to re-run.
-- ============================================================

create table if not exists public.session_time_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null default current_date,
  seconds     integer not null default 0 check (seconds >= 0),
  updated_at  timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.session_time_log enable row level security;

drop policy if exists "session time own" on public.session_time_log;
create policy "session time own" on public.session_time_log
  for select to authenticated using (user_id = auth.uid() or public.is_boss());

-- Add time to today's total for the signed-in user, and return the new total.
-- Called by the app every ~30 seconds while a tab is open and visible.
create or replace function public.add_active_seconds(delta integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  total integer;
begin
  if delta is null or delta <= 0 or delta > 3600 then
    raise exception 'delta must be between 1 and 3600 seconds';
  end if;

  insert into public.session_time_log (user_id, day, seconds, updated_at)
  values (auth.uid(), current_date, delta, now())
  on conflict (user_id, day) do update
    set seconds = public.session_time_log.seconds + excluded.seconds,
        updated_at = now()
  returning seconds into total;

  return total;
end;
$$;

-- Today's total for the signed-in user (0 if nothing logged yet).
create or replace function public.my_active_seconds_today()
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select seconds from public.session_time_log
      where user_id = auth.uid() and day = current_date),
    0
  );
$$;

grant execute on function public.add_active_seconds(integer)   to authenticated;
grant execute on function public.my_active_seconds_today()     to authenticated;
