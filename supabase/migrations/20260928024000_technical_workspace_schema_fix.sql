-- Fix technical workspace data access and restore contracts module
create table if not exists public.marc_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid null references public.marc_clients(id) on delete set null,
  title text not null,
  description text null,
  status text not null default 'ACTIVO' check (status in ('ACTIVO','PENDIENTE','VENCIDO','CANCELADO')),
  amount numeric not null default 0,
  starts_at date null,
  ends_at date null,
  periodicity text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marc_contracts enable row level security;
drop policy if exists marc_contracts_owner_all on public.marc_contracts;
create policy marc_contracts_owner_all on public.marc_contracts
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
drop policy if exists marc_assets_owner_or_master_select on public.marc_assets;
create policy marc_assets_owner_or_master_select on public.marc_assets
for select to authenticated
using ((user_id = auth.uid()) or public.marc_is_master(auth.uid()));
grant select, insert, update, delete on public.marc_contracts to authenticated;
