insert into storage.buckets (id,name,public) values ('service-order-photos','service-order-photos',false) on conflict (id) do nothing;
drop policy if exists "service_order_photos_storage_select" on storage.objects;
drop policy if exists "service_order_photos_storage_insert" on storage.objects;
drop policy if exists "service_order_photos_storage_delete" on storage.objects;
create policy "service_order_photos_storage_select" on storage.objects for select to authenticated using(bucket_id='service-order-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "service_order_photos_storage_insert" on storage.objects for insert to authenticated with check(bucket_id='service-order-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "service_order_photos_storage_delete" on storage.objects for delete to authenticated using(bucket_id='service-order-photos' and (storage.foldername(name))[1]=auth.uid()::text);