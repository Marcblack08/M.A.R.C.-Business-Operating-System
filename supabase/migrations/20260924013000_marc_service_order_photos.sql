create table if not exists public.marc_service_order_photos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade,
 storage_path text not null,
 photo_type text not null default 'DURANTE' check (photo_type in ('ANTES','DURANTE','DESPUES')),
 caption text,
 created_at timestamptz not null default now()
);
create index if not exists marc_so_photos_order_idx on public.marc_service_order_photos(user_id,service_order_id,created_at desc);
alter table public.marc_service_order_photos enable row level security;
drop policy if exists "service_order_photos_owner_all" on public.marc_service_order_photos;
create policy "service_order_photos_owner_all" on public.marc_service_order_photos for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.marc_service_order_photos to authenticated;