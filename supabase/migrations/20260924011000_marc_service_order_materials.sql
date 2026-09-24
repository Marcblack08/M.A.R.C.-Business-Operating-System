create table if not exists public.marc_service_order_materials (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade,
 inventory_id uuid references public.marc_inventory(id) on delete set null,
 name text not null,
 quantity numeric(12,3) not null default 1,
 unit_cost numeric(12,2) not null default 0,
 total numeric(12,2) generated always as (quantity * unit_cost) stored,
 created_at timestamptz not null default now()
);
create index if not exists marc_so_materials_order_idx on public.marc_service_order_materials(user_id,service_order_id);
alter table public.marc_service_order_materials enable row level security;
drop policy if exists "service_order_materials_owner_all" on public.marc_service_order_materials;
create policy "service_order_materials_owner_all" on public.marc_service_order_materials
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select,insert,update,delete on public.marc_service_order_materials to authenticated;