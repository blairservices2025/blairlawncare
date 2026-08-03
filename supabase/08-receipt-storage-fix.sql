-- ============================================================
-- Blair Lawn Care — fix uploading and deleting receipt photos
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Two gaps in the original rules:
--
-- 1. Uploading required the folder to match the signed-in user, with no
--    exception for the boss — unlike the read rule, which has one. So the
--    boss taking a photo while viewing a crew member's page was writing
--    into that person's folder and getting "new row violates row-level
--    security policy".
--
-- 2. There was no delete rule at all, so removing a receipt deleted the
--    database row but orphaned the file in storage.
-- ============================================================

-- ---------- receipts: upload ----------
drop policy if exists "receipts upload own folder" on storage.objects;
create policy "receipts upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_boss()
    )
  );

-- ---------- receipts: read ----------
drop policy if exists "receipts read own or boss" on storage.objects;
create policy "receipts read own or boss" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_boss()
    )
  );

-- ---------- receipts: delete ----------
-- Crew can remove one they uploaded by mistake; the boss can remove any.
drop policy if exists "receipts delete own or boss" on storage.objects;
create policy "receipts delete own or boss" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_boss()
    )
  );

-- ---------- receipts: update ----------
-- Needed for an upsert/overwrite of an existing path.
drop policy if exists "receipts update own or boss" on storage.objects;
create policy "receipts update own or boss" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_boss()
    )
  )
  with check (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_boss()
    )
  );
