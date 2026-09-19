
alter table public.marc_quotes
  add column if not exists deleted_at timestamptz null;

create index if not exists idx_marc_quotes_user_deleted
  on public.marc_quotes(user_id, deleted_at);
