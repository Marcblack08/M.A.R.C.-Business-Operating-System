create extension if not exists pgcrypto;

create table if not exists public.marc_service_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.marc_clients(id) on delete set null,
  number text not null,
  title text not null,
  service_type text,
  description text,
  diagnosis text,
  work_performed text,
  recommendations text,
  location text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  technician text,
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE','PROGRAMADA','EN_PROCESO','TERMINADA','ENTREGADA','CANCELADA')),
  labor_cost numeric(12,2) not null default 0,
  transport_cost numeric(12,2) not null default 0,
  materials_cost numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, number)
);

create index if not exists marc_service_orders_user_status_idx on public.marc_service_orders(user_id,status);
create index if not exists marc_service_orders_user_date_idx on public.marc_service_orders(user_id,scheduled_at desc);
create index if not exists marc_service_orders_client_idx on public.marc_service_orders(user_id,client_id);

alter table public.marc_service_orders enable row level security;
drop policy if exists "service_orders_owner_all" on public.marc_service_orders;
create policy "service_orders_owner_all" on public.marc_service_orders
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select,insert,update,delete on public.marc_service_orders to authenticated;
