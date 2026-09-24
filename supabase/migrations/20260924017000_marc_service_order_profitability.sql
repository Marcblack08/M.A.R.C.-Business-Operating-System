alter table public.marc_service_orders add column if not exists revenue numeric(12,2) not null default 0;
alter table public.marc_service_orders add column if not exists other_cost numeric(12,2) not null default 0;
alter table public.marc_service_orders add column if not exists profit numeric(12,2) not null default 0;
alter table public.marc_service_orders add column if not exists margin_pct numeric(7,2) not null default 0;