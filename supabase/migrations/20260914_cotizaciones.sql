-- M.A.R.C. — Cotizaciones V1
-- Ejecutar en Supabase SQL Editor.
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  fecha date not null default current_date,
  cliente_id uuid null,
  cliente_nombre text,
  subtotal numeric(14,2) not null default 0,
  igv numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  estado text not null default 'BORRADOR',
  observaciones text,
  datos_extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cotizaciones_user_created_idx on public.cotizaciones(user_id,created_at desc);
create index if not exists cotizaciones_user_numero_idx on public.cotizaciones(user_id,numero);
alter table public.cotizaciones enable row level security;
drop policy if exists cotizaciones_select_own on public.cotizaciones;
drop policy if exists cotizaciones_insert_own on public.cotizaciones;
drop policy if exists cotizaciones_update_own on public.cotizaciones;
drop policy if exists cotizaciones_delete_own on public.cotizaciones;
create policy cotizaciones_select_own on public.cotizaciones for select using (auth.uid()=user_id);
create policy cotizaciones_insert_own on public.cotizaciones for insert with check (auth.uid()=user_id);
create policy cotizaciones_update_own on public.cotizaciones for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy cotizaciones_delete_own on public.cotizaciones for delete using (auth.uid()=user_id);
comment on table public.cotizaciones is 'Cotizaciones M.A.R.C.; items, IGV, margen y logo se conservan en datos_extra para mantener el historial del documento.';
