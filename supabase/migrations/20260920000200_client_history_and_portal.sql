-- Client history and secure customer portal.
alter table public.marc_clients
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists portal_token_hash text,
  add column if not exists portal_created_at timestamptz,
  add column if not exists portal_last_seen_at timestamptz;

create unique index if not exists marc_clients_portal_token_hash_uidx
  on public.marc_clients(portal_token_hash)
  where portal_token_hash is not null;

create table if not exists public.marc_client_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.marc_clients(id) on delete cascade,
  event_type text not null default 'NOTE',
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists marc_client_history_client_created_idx
  on public.marc_client_history(client_id, created_at desc);

alter table public.marc_client_history enable row level security;

drop policy if exists marc_client_history_owner_select on public.marc_client_history;
create policy marc_client_history_owner_select on public.marc_client_history
for select to authenticated using (user_id=auth.uid());

drop policy if exists marc_client_history_owner_insert on public.marc_client_history;
create policy marc_client_history_owner_insert on public.marc_client_history
for insert to authenticated with check (user_id=auth.uid());

drop policy if exists marc_client_history_owner_update on public.marc_client_history;
create policy marc_client_history_owner_update on public.marc_client_history
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists marc_client_history_owner_delete on public.marc_client_history;
create policy marc_client_history_owner_delete on public.marc_client_history
for delete to authenticated using (user_id=auth.uid());