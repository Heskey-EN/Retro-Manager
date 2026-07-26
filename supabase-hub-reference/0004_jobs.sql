-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — jobs (Retrofit Job Manager joins the shared backend)
--  Run FOURTH, in the HUB Supabase project, after 0001. Safe to re-run.
--
--  Column shape matches the Retrofit Management Tool exactly, plus org_id:
--  every row belongs to an organisation and RLS scopes it by the caller's
--  membership, following the tier rules:
--    read / add / edit  → any active member of the org (level ≥ 1)
--    delete             → level ≥ 2 (Senior Worker and up)
--    master admin       → everything, every org
--
--  Accepted risk: "edit" is row-scoped, not column-scoped, so a level-1 can
--  overwrite a job's content even though they can't DELETE the row. If that
--  ever bites, add a jobs_history audit trigger or a column whitelist for
--  level-1 updates.
-- ═══════════════════════════════════════════════════════════════════════════

-- Shared updated_at trigger (first app table in the hub project needs it)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  -- set null on user deletion: the job outlives the person who created it
  owner       uuid references auth.users (id) on delete set null default auth.uid(),
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

create index if not exists jobs_org_idx on public.jobs (org_id);

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- A job can never be moved to another organisation through the API. The SQL
-- editor / service paths (auth.uid() null) stay open for a future deliberate
-- re-homing migration — same pattern as 0001's guards.
create or replace function public.guard_job_update()
returns trigger
language plpgsql
as $$
begin
  if new.org_id <> old.org_id and auth.uid() is not null then
    raise exception 'jobs.org_id is immutable';
  end if;
  return new;
end
$$;

drop trigger if exists guard_job_update on public.jobs;
create trigger guard_job_update
  before update on public.jobs
  for each row execute function public.guard_job_update();

-- ── Row Level Security (the tier rules from CLAUDE.md §5) ──────────────────

alter table public.jobs enable row level security;

drop policy if exists "jobs: members read" on public.jobs;
create policy "jobs: members read"
  on public.jobs for select
  using (is_master_admin() or current_access_level(org_id) >= 1);

drop policy if exists "jobs: members insert" on public.jobs;
create policy "jobs: members insert"
  on public.jobs for insert
  with check (is_master_admin() or current_access_level(org_id) >= 1);

drop policy if exists "jobs: members update" on public.jobs;
create policy "jobs: members update"
  on public.jobs for update
  using (is_master_admin() or current_access_level(org_id) >= 1)
  with check (is_master_admin() or current_access_level(org_id) >= 1);

-- Delete a job: level >= 2. Tier 1 has NO delete path (CLAUDE.md §8).
drop policy if exists "jobs: seniors delete" on public.jobs;
create policy "jobs: seniors delete"
  on public.jobs for delete
  using (is_master_admin() or current_access_level(org_id) >= 2);

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Postgres-changes streaming for the live jobs list. INSERT/UPDATE events
-- are RLS-filtered per subscriber; DELETE events are NOT (Postgres can't
-- check RLS on a gone row) — every subscriber gets them, carrying only the
-- primary key. Harmless today (clients filter by id), but never widen the
-- replica identity or make job ids sensitive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;
