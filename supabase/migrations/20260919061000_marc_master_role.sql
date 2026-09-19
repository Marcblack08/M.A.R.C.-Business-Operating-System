-- M.A.R.C. master role for controlled testing/admin access.
-- The specific MASTER assignment is intentionally managed in the database,
-- not by frontend code.

create table if not exists public.marc_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('MASTER','ADMIN','USER')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marc_user_roles enable row level security;

drop policy if exists "marc_user_roles_select_own" on public.marc_user_roles;
create policy "marc_user_roles_select_own"
  on public.marc_user_roles
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.marc_user_roles from public, anon;
grant select on table public.marc_user_roles to authenticated;

drop function if exists public.marc_is_master(uuid);
create or replace function public.marc_is_master(p_user_id uuid default auth.uid())
returns boolean
language sql
security invoker
stable
set search_path = public, pg_catalog
as $$
  select exists(
    select 1
    from public.marc_user_roles r
    where r.user_id = coalesce(p_user_id, auth.uid())
      and r.role = 'MASTER'
      and r.active = true
  );
$$;
revoke all on function public.marc_is_master(uuid) from public, anon;
grant execute on function public.marc_is_master(uuid) to authenticated;
