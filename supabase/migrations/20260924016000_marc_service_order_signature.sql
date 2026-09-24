alter table public.marc_service_orders add column if not exists customer_signature_path text;
alter table public.marc_service_orders add column if not exists customer_signature_name text;
alter table public.marc_service_orders add column if not exists customer_signature_at timestamptz;