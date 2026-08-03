-- ============================================================
-- Blair Lawn Care — crew sign in with their email and 4-digit code
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- A 4-digit code is only 10,000 possibilities, so the thing that makes
-- this safe is limiting how many guesses anyone gets. That is enforced
-- here in the database rather than in the app, so it holds however the
-- endpoint is called.
-- ============================================================

-- ---------- Email on the profile, so we can look someone up by it ----------
alter table public.profiles
  add column if not exists email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

create unique index if not exists profiles_email_key
  on public.profiles (lower(email))
  where email is not null;

-- Keep it filled in for accounts created from here on.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'boss'::user_role
         else 'employee'::user_role end,
    new.email
  );
  return new;
end;
$$;

-- ---------- Guess limiting ----------
create table if not exists public.pin_login_attempts (
  id         bigint generated always as identity primary key,
  email      text not null,
  succeeded  boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists pin_login_attempts_lookup
  on public.pin_login_attempts (lower(email), created_at desc);

alter table public.pin_login_attempts enable row level security;

drop policy if exists "pin attempts boss read" on public.pin_login_attempts;
create policy "pin attempts boss read" on public.pin_login_attempts
  for select to authenticated using (public.is_boss());

/**
 * How many wrong codes for this email in the last 15 minutes.
 * Five is the cut-off — enough for a genuine slip, nowhere near enough
 * to work through 10,000 combinations.
 */
create or replace function public.pin_login_recent_failures(check_email text)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer
    from public.pin_login_attempts
   where lower(email) = lower(check_email)
     and not succeeded
     and created_at > now() - interval '15 minutes';
$$;

create or replace function public.record_pin_login_attempt(
  check_email text,
  was_ok boolean
)
returns void
language sql security definer set search_path = public
as $$
  insert into public.pin_login_attempts (email, succeeded)
  values (check_email, was_ok);
$$;

-- Clearing the failures after a good sign-in, so a slip earlier in the
-- day doesn't count against someone later.
create or replace function public.clear_pin_login_failures(check_email text)
returns void
language sql security definer set search_path = public
as $$
  delete from public.pin_login_attempts
   where lower(email) = lower(check_email) and not succeeded;
$$;

-- ---------- Look up who is signing in ----------
/**
 * Returns the id and role for an email, and whether the code matches.
 * Deliberately one call: it never tells the caller whether the email
 * exists separately from whether the code was right, so the endpoint
 * cannot be used to work out who has an account.
 */
create or replace function public.check_pin_login(
  check_email text,
  check_pin text
)
returns table (user_id uuid, role user_role, matched boolean)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  p record;
begin
  select id, profiles.role, pin_hash, is_active
    into p
    from public.profiles
   where lower(profiles.email) = lower(check_email)
   limit 1;

  if p.id is null or not p.is_active or p.pin_hash is null then
    return query select null::uuid, null::user_role, false;
    return;
  end if;

  return query
    select p.id, p.role, (p.pin_hash = crypt(check_pin, p.pin_hash));
end;
$$;

-- Only the service role calls these — the sign-in endpoint runs before
-- anyone has a session, so there is no authenticated user yet.
revoke execute on function public.check_pin_login(text, text) from anon, authenticated;
revoke execute on function public.pin_login_recent_failures(text) from anon, authenticated;
revoke execute on function public.record_pin_login_attempt(text, boolean) from anon, authenticated;
revoke execute on function public.clear_pin_login_failures(text) from anon, authenticated;
