-- Harden private marc-documents Storage access.
-- Files are stored under <user_id>/... by the Worker.
-- The bucket remains private; authenticated users can only access their own folder.

create policy "marc_documents_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'marc-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "marc_documents_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'marc-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'marc-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "marc_documents_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'marc-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
