-- Allow authenticated users to create audit rows only for themselves.
drop policy if exists "marc_audit_log_insert_own" on public.marc_audit_log;

create policy "marc_audit_log_insert_own"
  on public.marc_audit_log
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant insert on table public.marc_audit_log to authenticated;
