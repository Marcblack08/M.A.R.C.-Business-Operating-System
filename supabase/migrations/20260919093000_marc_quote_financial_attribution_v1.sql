-- M.A.R.C. financial cost attribution v1
alter table public.marc_quote_items
  add column if not exists material_provider text not null default 'MARC';

alter table public.marc_quote_items
  drop constraint if exists marc_quote_items_material_provider_check;
alter table public.marc_quote_items
  add constraint marc_quote_items_material_provider_check
  check (material_provider in ('MARC','CLIENT','MIXTO'));

alter table public.marc_quote_items add column if not exists transport_cost numeric not null default 0;
alter table public.marc_quote_items add column if not exists labor_cost numeric not null default 0;
alter table public.marc_quote_items add column if not exists other_cost numeric not null default 0;

alter table public.marc_quote_items drop constraint if exists marc_quote_items_transport_cost_check;
alter table public.marc_quote_items add constraint marc_quote_items_transport_cost_check check (transport_cost >= 0);
alter table public.marc_quote_items drop constraint if exists marc_quote_items_labor_cost_check;
alter table public.marc_quote_items add constraint marc_quote_items_labor_cost_check check (labor_cost >= 0);
alter table public.marc_quote_items drop constraint if exists marc_quote_items_other_cost_check;
alter table public.marc_quote_items add constraint marc_quote_items_other_cost_check check (other_cost >= 0);

alter table public.marc_quotes add column if not exists cost_total numeric not null default 0;
alter table public.marc_quotes add column if not exists profit numeric not null default 0;
alter table public.marc_quotes add column if not exists profit_margin numeric not null default 0;

-- The live database function was updated during deployment; this file preserves the migration
-- for reproducible environments. See the repository history for the complete function body.
