insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-images','inventory-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "inventory images insert own folder" on storage.objects;
create policy "inventory images insert own folder" on storage.objects for insert to authenticated
with check (bucket_id='inventory-images' and (storage.foldername(name))[1]=(select auth.uid()::text));

drop policy if exists "inventory images update own folder" on storage.objects;
create policy "inventory images update own folder" on storage.objects for update to authenticated
using (bucket_id='inventory-images' and (storage.foldername(name))[1]=(select auth.uid()::text))
with check (bucket_id='inventory-images' and (storage.foldername(name))[1]=(select auth.uid()::text));

drop policy if exists "inventory images delete own folder" on storage.objects;
create policy "inventory images delete own folder" on storage.objects for delete to authenticated
using (bucket_id='inventory-images' and (storage.foldername(name))[1]=(select auth.uid()::text));