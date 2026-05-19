insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

create policy "materials_select_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "materials_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "materials_update_own"
on storage.objects
for update
to authenticated
using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "materials_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

