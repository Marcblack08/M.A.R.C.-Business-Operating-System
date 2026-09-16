alter table public.cotizaciones
  add column if not exists costo_total numeric(14,2) not null default 0,
  add column if not exists ganancia numeric(14,2) not null default 0,
  add column if not exists ganancia_pct numeric(8,2) not null default 0,
  add column if not exists enviado_at timestamptz null,
  add column if not exists finalizado_at timestamptz null;

create index if not exists idx_cotizaciones_user_estado on public.cotizaciones(user_id, estado);
create index if not exists idx_cotizaciones_user_created_at on public.cotizaciones(user_id, created_at desc);
