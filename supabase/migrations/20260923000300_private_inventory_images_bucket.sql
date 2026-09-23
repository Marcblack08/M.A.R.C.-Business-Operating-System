-- Security hardening: inventory images must not be publicly readable.
update storage.buckets
set public = false
where id = 'inventory-images'
  and public = true;
