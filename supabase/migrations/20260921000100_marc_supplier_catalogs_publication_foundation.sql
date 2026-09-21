-- M.A.R.C. supplier catalog + publication foundation
-- Prepares the data model for:
-- 1) supplier catalogs/documents and catalog products
-- 2) transforming catalog entries into inventory products
-- 3) publication drafts, scheduled posts and social-channel connections
-- No social API is called by this migration.

create table if not exists public.marc_suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  website text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marc_suppliers_user_active_idx
  on public.marc_suppliers(user_id, active, name);

alter table public.marc_suppliers enable row level security;

drop policy if exists marc_suppliers_owner_all on public.marc_suppliers;
create policy marc_suppliers_owner_all on public.marc_suppliers
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.marc_supplier_catalogs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid references public.marc_suppliers(id) on delete set null,
  name text not null,
  source_type text not null default 'PDF',
  storage_path text,
  source_url text,
  file_name text,
  file_size_bytes bigint,
  page_count integer,
  status text not null default 'UPLOADED',
  ai_provider text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('PDF','EXCEL','IMAGE','URL','OTHER')),
  check (status in ('UPLOADED','ANALYZING','READY','PARTIAL','ERROR','ARCHIVED'))
);

create index if not exists marc_supplier_catalogs_user_created_idx
  on public.marc_supplier_catalogs(user_id, created_at desc);

create index if not exists marc_supplier_catalogs_supplier_idx
  on public.marc_supplier_catalogs(supplier_id);

alter table public.marc_supplier_catalogs enable row level security;

drop policy if exists marc_supplier_catalogs_owner_all on public.marc_supplier_catalogs;
create policy marc_supplier_catalogs_owner_all on public.marc_supplier_catalogs
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.marc_supplier_catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_id uuid not null references public.marc_supplier_catalogs(id) on delete cascade,
  supplier_id uuid references public.marc_suppliers(id) on delete set null,
  page_number integer,
  sku text,
  name text not null,
  description text,
  brand text,
  model text,
  category text,
  unit text default 'UND',
  supplier_cost numeric,
  supplier_price numeric,
  currency text default 'PEN',
  stock_text text,
  image_url text,
  source_metadata jsonb not null default '{}'::jsonb,
  ai_confidence numeric,
  status text not null default 'DETECTED',
  inventory_id uuid references public.marc_inventory(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('DETECTED','REVIEW','APPROVED','IMPORTED','REJECTED'))
);

create index if not exists marc_supplier_catalog_items_catalog_idx
  on public.marc_supplier_catalog_items(catalog_id, page_number);

create index if not exists marc_supplier_catalog_items_sku_idx
  on public.marc_supplier_catalog_items(user_id, sku);

create index if not exists marc_supplier_catalog_items_name_idx
  on public.marc_supplier_catalog_items(user_id, name);

alter table public.marc_supplier_catalog_items enable row level security;

drop policy if exists marc_supplier_catalog_items_owner_all on public.marc_supplier_catalog_items;
create policy marc_supplier_catalog_items_owner_all on public.marc_supplier_catalog_items
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.marc_social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  account_name text,
  external_account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes jsonb not null default '[]'::jsonb,
  status text not null default 'DISCONNECTED',
  last_error text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, platform),
  check (platform in ('FACEBOOK','INSTAGRAM','TIKTOK','WHATSAPP','LINKEDIN','OTHER')),
  check (status in ('DISCONNECTED','CONNECTED','EXPIRED','ERROR'))
);

alter table public.marc_social_connections enable row level security;

drop policy if exists marc_social_connections_owner_all on public.marc_social_connections;
create policy marc_social_connections_owner_all on public.marc_social_connections
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.marc_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_id uuid references public.marc_inventory(id) on delete set null,
  campaign_id uuid references public.marc_ad_campaigns(id) on delete set null,
  platform text not null,
  status text not null default 'DRAFT',
  title text,
  headline text,
  body text,
  short_text text,
  hashtags jsonb not null default '[]'::jsonb,
  media_url text,
  media_type text default 'IMAGE',
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,
  external_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform in ('FACEBOOK','INSTAGRAM','TIKTOK','WHATSAPP','LINKEDIN','OTHER')),
  check (status in ('DRAFT','READY','SCHEDULED','PUBLISHING','PUBLISHED','FAILED','CANCELLED'))
);

create index if not exists marc_publications_user_created_idx
  on public.marc_publications(user_id, created_at desc);

create index if not exists marc_publications_schedule_idx
  on public.marc_publications(status, scheduled_for);

alter table public.marc_publications enable row level security;

drop policy if exists marc_publications_owner_all on public.marc_publications;
create policy marc_publications_owner_all on public.marc_publications
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.marc_publication_jobs (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.marc_publications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt integer not null default 0,
  status text not null default 'PENDING',
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  response_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  check (status in ('PENDING','RUNNING','DONE','FAILED','CANCELLED'))
);

create index if not exists marc_publication_jobs_due_idx
  on public.marc_publication_jobs(status, run_after);

alter table public.marc_publication_jobs enable row level security;

drop policy if exists marc_publication_jobs_owner_all on public.marc_publication_jobs;
create policy marc_publication_jobs_owner_all on public.marc_publication_jobs
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Common helper for future plan/feature gates.
create or replace function public.marc_has_active_subscription()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select exists(
    select 1
    from public.marc_subscriptions
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

revoke all on function public.marc_has_active_subscription() from public, anon;
grant execute on function public.marc_has_active_subscription() to authenticated;
