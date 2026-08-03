-- ============================================================
-- Blair Lawn Care — every client gets a first yard automatically
-- Run in the Supabase SQL Editor after 13-yards.sql. Safe to re-run.
--
-- 13-yards.sql gave a yard to every client that existed at the time, but
-- clients arriving later — added here, pulled in by a Square sync, or
-- created by a Square webhook — would have had none. A client with no
-- yard cannot be scheduled and never appears on the Yards list, which
-- would look like the sync silently failing.
--
-- Doing it in the database rather than in each of those code paths means
-- there is one rule, and it holds however the client got here.
-- ============================================================

create or replace function public.create_first_yard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.yards (customer_id, name, address, plan, price, last_service_date, notes)
  values (
    new.id,
    coalesce(nullif(trim(new.address), ''), new.name || '''s yard'),
    new.address,
    coalesce(new.plan, 'weekly'),
    new.price,
    new.last_service_date,
    new.notes
  );
  return new;
end;
$$;

drop trigger if exists customer_first_yard on public.customers;
create trigger customer_first_yard
  after insert on public.customers
  for each row execute function public.create_first_yard();

-- Catch anyone added between running 13 and this file.
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
