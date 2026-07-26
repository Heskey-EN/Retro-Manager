-- Documents (files, links, notes) on the server, with uploaded files held in a
-- private Storage bucket. Metadata lives in public.documents; the file bytes
-- live in the 'job-files' bucket keyed by the document's storage path.

create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid references public.jobs(id) on delete cascade,
  owner      uuid references auth.users(id) default auth.uid(),
  kind       text not null,           -- 'file' | 'link' | 'note'
  name       text,
  url        text,                     -- link target
  path       text,                     -- storage object path for files
  mime       text,
  size       bigint,
  note_text  text,                     -- note body
  done       boolean not null default false,
  folder     text,                     -- workflow stage the item is filed under
  created_at timestamptz not null default now()
);

create index if not exists documents_job_id_idx on public.documents(job_id);

alter table public.documents enable row level security;

drop policy if exists "documents all for active" on public.documents;
create policy "documents all for active" on public.documents
  for all using (public.is_active()) with check (public.is_active());

-- Private bucket for uploaded job files.
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

-- Active users can manage objects in the job-files bucket.
drop policy if exists "job-files read"   on storage.objects;
drop policy if exists "job-files insert" on storage.objects;
drop policy if exists "job-files update" on storage.objects;
drop policy if exists "job-files delete" on storage.objects;

create policy "job-files read"   on storage.objects for select
  using (bucket_id = 'job-files' and public.is_active());
create policy "job-files insert" on storage.objects for insert
  with check (bucket_id = 'job-files' and public.is_active());
create policy "job-files update" on storage.objects for update
  using (bucket_id = 'job-files' and public.is_active());
create policy "job-files delete" on storage.objects for delete
  using (bucket_id = 'job-files' and public.is_active());
