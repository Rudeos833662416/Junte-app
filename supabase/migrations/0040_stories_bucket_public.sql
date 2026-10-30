-- Bucket stories: público para lectura + upload autenticado en carpeta propia
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do update set public = true;

drop policy if exists "stories public read" on storage.objects;
create policy "stories public read"
  on storage.objects for select
  using (bucket_id = 'stories');

drop policy if exists "stories auth upload" on storage.objects;
create policy "stories auth upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "stories auth update own" on storage.objects;
create policy "stories auth update own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "stories auth delete own" on storage.objects;
create policy "stories auth delete own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
