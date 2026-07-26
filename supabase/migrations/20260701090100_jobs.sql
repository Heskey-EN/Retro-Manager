-- Jobs on the server. Shared workspace: any signed-in, active user can
-- read/write all jobs (the 40-50-user team all see the same jobs).

create extension if not exists "pgcrypto";

-- Is the current user signed in AND active (approved by an admin)?
create or replace function public.is_active()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users(id) default auth.uid(),
  title       text,
  status      text not null default 'Booking',
  start_date  date,
  end_date    date,
  reference   text,
  postcode    text,
  customer    text,
  measure     text,
  tags        jsonb   not null default '[]'::jsonb,
  archived    boolean not null default false,
  costing     jsonb,
  data        jsonb   not null default '{}'::jsonb,
  batch_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

drop policy if exists "jobs all for active" on public.jobs;
create policy "jobs all for active" on public.jobs
  for all using (public.is_active()) with check (public.is_active());

-- Real-time change streaming for the jobs list.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;
