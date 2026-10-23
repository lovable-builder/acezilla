-- Product images (from the store) and a private bucket for the images and videos a person uploads for a campaign draft.
-- Files live under <workspace id>/..., and only members of that workspace can read, add or remove them.
alter table store_product add column image_url text;
alter table offer_stats_snapshots add column image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creatives', 'creatives', false, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;

create policy creatives_read on storage.objects for select to authenticated
  using (bucket_id = 'creatives' and private.is_member(((storage.foldername(name))[1])::uuid));
create policy creatives_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and private.is_member(((storage.foldername(name))[1])::uuid));
create policy creatives_delete on storage.objects for delete to authenticated
  using (bucket_id = 'creatives' and private.is_member(((storage.foldername(name))[1])::uuid));
