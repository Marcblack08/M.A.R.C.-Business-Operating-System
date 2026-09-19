create table if not exists public.marc_channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('TELEGRAM')),
  external_user_id text not null,
  chat_id text not null,
  username text,
  status text not null default 'LINKED' check (status in ('PENDING','LINKED','REVOKED')),
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel),
  unique (channel, external_user_id),
  unique (channel, chat_id)
);

create index if not exists marc_channel_identities_user_channel_idx
  on public.marc_channel_identities(user_id, channel);

create table if not exists public.marc_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('TELEGRAM')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marc_link_tokens_lookup_idx
  on public.marc_link_tokens(channel, token_hash, expires_at);

alter table public.marc_channel_identities enable row level security;
alter table public.marc_link_tokens enable row level security;

revoke all on table public.marc_channel_identities from public, anon;
revoke all on table public.marc_link_tokens from public, anon;

drop policy if exists "marc_channel_identities_select_own" on public.marc_channel_identities;
create policy "marc_channel_identities_select_own"
  on public.marc_channel_identities
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "marc_channel_identities_update_own" on public.marc_channel_identities;
create policy "marc_channel_identities_update_own"
  on public.marc_channel_identities
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "marc_link_tokens_insert_own" on public.marc_link_tokens;
create policy "marc_link_tokens_insert_own"
  on public.marc_link_tokens
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "marc_link_tokens_select_own" on public.marc_link_tokens;
create policy "marc_link_tokens_select_own"
  on public.marc_link_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "marc_link_tokens_delete_own" on public.marc_link_tokens;
create policy "marc_link_tokens_delete_own"
  on public.marc_link_tokens
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, update on public.marc_channel_identities to authenticated;
grant insert, select, delete on public.marc_link_tokens to authenticated;
