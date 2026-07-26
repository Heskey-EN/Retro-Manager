-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — business tracker data (Eco-Futures-Tracker joins)
--  Run FIFTH, in the HUB Supabase project, after 0001. Safe to re-run.
--
--  One row per organisation holding the tracker's whole data blob (jobs
--  calendar, expenses, invoices, settings) — the same shape the app kept in
--  localStorage, now shared and realtime-synced. Last-write-wins per blob:
--  fine for the small admin group that can touch it.
--
--  ACCESS: business finances are Organisation Admin territory — level ≥ 3
--  only (George's decision, 2026-07-21). No lower tier has ANY path to this
--  table. Receipt images stay on-device for now (follow-up: Storage bucket).
-- ═══════════════════════════════════════════════════════════════════════════

-- Shared updated_at helper (also created by 0004; kept here so 0005 can run
-- even if 0004 hasn't been yet)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table if not exists public.biz_data (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_biz_data_updated_at on public.biz_data;
create trigger trg_biz_data_updated_at
  before update on public.biz_data
  for each row execute function public.set_updated_at();

-- The row's org_id (its PK) can never be changed through the API — pins the
-- one-row-per-org invariant. SQL editor / service paths (auth.uid() null)
-- stay open, same pattern as 0004's guard_job_update.
create or replace function public.guard_biz_data_update()
returns trigger
language plpgsql
as $$
begin
  if new.org_id <> old.org_id and auth.uid() is not null then
    raise exception 'biz_data.org_id is immutable';
  end if;
  return new;
end
$$;

drop trigger if exists guard_biz_data_update on public.biz_data;
create trigger guard_biz_data_update
  before update on public.biz_data
  for each row execute function public.guard_biz_data_update();

-- ── Row Level Security — level 3+ only, for every action ───────────────────

alter table public.biz_data enable row level security;

drop policy if exists "biz: admins read" on public.biz_data;
create policy "biz: admins read"
  on public.biz_data for select
  using (is_master_admin() or current_access_level(org_id) >= 3);

drop policy if exists "biz: admins insert" on public.biz_data;
create policy "biz: admins insert"
  on public.biz_data for insert
  with check (is_master_admin() or current_access_level(org_id) >= 3);

drop policy if exists "biz: admins update" on public.biz_data;
create policy "biz: admins update"
  on public.biz_data for update
  using (is_master_admin() or current_access_level(org_id) >= 3)
  with check (is_master_admin() or current_access_level(org_id) >= 3);

drop policy if exists "biz: admins delete" on public.biz_data;
create policy "biz: admins delete"
  on public.biz_data for delete
  using (is_master_admin() or current_access_level(org_id) >= 3);

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Other devices' saves stream in live. INSERT/UPDATE events are RLS-filtered
-- per subscriber (financial data never reaches a below-level-3 subscriber);
-- DELETE events broadcast the primary key only.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'biz_data'
  ) then
    alter publication supabase_realtime add table public.biz_data;
  end if;
end $$;
