-- M.A.R.C. entitlement hardening for service-operation child resources.
-- The parent service-order table is already protected by marc_has_paid_feature().
-- Child tables and their private storage must enforce the same entitlement so
-- a Free account cannot bypass the UI by calling Supabase directly.

drop policy if exists service_order_materials_owner_all on public.marc_service_order_materials;
create policy service_order_materials_paid_all
on public.marc_service_order_materials
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

drop policy if exists service_order_photos_owner_all on public.marc_service_order_photos;
create policy service_order_photos_paid_all
on public.marc_service_order_photos
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

drop policy if exists service_checklists_owner_all on public.marc_service_checklists;
create policy service_checklists_paid_all
on public.marc_service_checklists
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

drop policy if exists service_order_documents_owner_all on public.marc_service_order_documents;
create policy service_order_documents_paid_all
on public.marc_service_order_documents
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

drop policy if exists service_order_photos_storage_insert on storage.objects;
drop policy if exists service_order_photos_storage_select on storage.objects;
drop policy if exists service_order_photos_storage_update on storage.objects;
drop policy if exists service_order_photos_storage_delete on storage.objects;

create policy service_order_photos_storage_paid_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'service-order-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

create policy service_order_photos_storage_paid_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'service-order-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

create policy service_order_photos_storage_paid_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'service-order-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.marc_has_paid_feature('service_orders', auth.uid())
)
with check (
  bucket_id = 'service-order-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.marc_has_paid_feature('service_orders', auth.uid())
);

create policy service_order_photos_storage_paid_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'service-order-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.marc_has_paid_feature('service_orders', auth.uid())
);
