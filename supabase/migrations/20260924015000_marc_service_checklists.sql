create table if not exists public.marc_service_checklists (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade,
 item text not null,
 result text not null default 'PENDIENTE' check (result in ('PENDIENTE','OK','NO_OK','NO_APLICA')),
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists marc_so_checklists_order_idx on public.marc_service_checklists(user_id,service_order_id);
alter table public.marc_service_checklists enable row level security;
drop policy if exists "service_checklists_owner_all" on public.marc_service_checklists;
create policy "service_checklists_owner_all" on public.marc_service_checklists for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.marc_service_checklists to authenticated;