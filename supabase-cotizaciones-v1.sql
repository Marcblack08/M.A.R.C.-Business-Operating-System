-- M.A.R.C. — Cotizaciones V1
-- Esta migración ya fue aplicada al proyecto Supabase conectado.
create table if not exists public.cotizaciones (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 numero text not null, cliente_id uuid null references public.clientes(id) on delete set null,
 cliente_snapshot jsonb not null default '{}'::jsonb, empresa_nombre text, empresa_logo text,
 moneda text not null default 'PEN', incluir_igv boolean not null default false, porcentaje_igv numeric(5,2) not null default 18,
 subtotal numeric(14,2) not null default 0, igv numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
 utilidad numeric(14,2) not null default 0, estado text not null default 'BORRADOR', observaciones text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint cotizaciones_estado_chk check (estado in ('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','ANULADA')),
 constraint cotizaciones_igv_chk check (porcentaje_igv >= 0 and porcentaje_igv <= 100)
);
create unique index if not exists cotizaciones_user_numero_uq on public.cotizaciones(user_id,numero);
create table if not exists public.cotizacion_items (
 id uuid primary key default gen_random_uuid(), cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, tipo text not null default 'PRODUCTO',
 producto_id uuid null references public.productos(id) on delete set null, servicio_id uuid null references public.servicios(id) on delete set null,
 codigo text, nombre text not null, descripcion text, unidad text default 'UND', cantidad numeric(14,3) not null default 1,
 precio_venta numeric(14,2) not null default 0, precio_compra numeric(14,2) not null default 0,
 costo_total numeric(14,2) not null default 0, importe numeric(14,2) not null default 0, utilidad numeric(14,2) not null default 0,
 utilidad_pct numeric(8,2) not null default 0, orden integer not null default 0, created_at timestamptz not null default now(),
 constraint cotizacion_items_tipo_chk check (tipo in ('PRODUCTO','SERVICIO')), constraint cotizacion_items_cantidad_chk check (cantidad > 0)
);
create index if not exists cotizacion_items_quote_idx on public.cotizacion_items(cotizacion_id,orden);
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
drop policy if exists cotizaciones_select_own on public.cotizaciones;
drop policy if exists cotizaciones_insert_own on public.cotizaciones;
drop policy if exists cotizaciones_update_own on public.cotizaciones;
drop policy if exists cotizaciones_delete_own on public.cotizaciones;
create policy cotizaciones_select_own on public.cotizaciones for select using (auth.uid()=user_id);
create policy cotizaciones_insert_own on public.cotizaciones for insert with check (auth.uid()=user_id);
create policy cotizaciones_update_own on public.cotizaciones for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy cotizaciones_delete_own on public.cotizaciones for delete using (auth.uid()=user_id);
drop policy if exists cotizacion_items_select_own on public.cotizacion_items;
drop policy if exists cotizacion_items_insert_own on public.cotizacion_items;
drop policy if exists cotizacion_items_update_own on public.cotizacion_items;
drop policy if exists cotizacion_items_delete_own on public.cotizacion_items;
create policy cotizacion_items_select_own on public.cotizacion_items for select using (auth.uid()=user_id);
create policy cotizacion_items_insert_own on public.cotizacion_items for insert with check (auth.uid()=user_id);
create policy cotizacion_items_update_own on public.cotizacion_items for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy cotizacion_items_delete_own on public.cotizacion_items for delete using (auth.uid()=user_id);
