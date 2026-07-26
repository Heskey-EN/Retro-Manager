-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — team expense logging (RetroManager merge)
--  Run SEVENTH, in the HUB Supabase project, after 0001 and 0003 (0005 for
--  the admin Finance side). Safe to re-run.
--
--  The Business Hub merged into the Job Manager as RetroManager's Finance
--  tab (level 3+ only, biz_data blob unchanged from 0005). This migration
--  adds the WORKER side: George's decision — level 1 accounts can log
--  expenses "if that is permitted on their account". That permission is a
--  per-membership flag an org admin flips in RetroManager; permitted workers
--  insert rows here (never into the biz_data blob — they have no path to
--  it), and admins see those rows merged into their Finance figures live.
--
--  Tier doctrine holds: below level 3 there is NO update or delete policy on
--  this table at all — workers submit and read their own rows, nothing more.
-- ═══════════════════════════════════════════════════════════════════════════

-- Per-membership permission, managed by org admins (the existing
-- "memberships: admins update" policy covers it — admins may update their
-- org's non-admin rows). Defaults off for everyone.
alter table public.memberships
  add column if not exists can_add_expenses boolean not null default false;

-- May the caller log expenses in this org? Level 3+ always; below that only
-- with the flag. SECURITY DEFINER so the policy check doesn't recurse into
-- memberships' own RLS.
create or replace function public.can_submit_expenses(target_org uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and org_id = target_org
      and is_active
      and (access_level >= 3 or can_add_expenses)
  )
$$;

revoke execute on function public.can_submit_expenses(uuid) from public, anon;
grant execute on function public.can_submit_expenses(uuid) to authenticated;

-- Shared updated_at helper (also created by 0004/0005; kept here so 0007 can
-- run even if those haven't been yet)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ── The table ──────────────────────────────────────────────────────────────

create table if not exists public.biz_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  category text not null default 'Other',
  description text not null default '',
  amount numeric not null check (amount >= 0),
  account text not null default 'business' check (account in ('business', 'personal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists biz_expenses_org_date_idx on public.biz_expenses (org_id, date desc);
create index if not exists biz_expenses_user_idx on public.biz_expenses (user_id);

-- Let PostgREST join biz_expenses → profiles ("logged by …" in the admin UI)
alter table public.biz_expenses
  drop constraint if exists biz_expenses_user_profile_fkey;
alter table public.biz_expenses
  add constraint biz_expenses_user_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

drop trigger if exists trg_biz_expenses_updated_at on public.biz_expenses;
create trigger trg_biz_expenses_updated_at
  before update on public.biz_expenses
  for each row execute function public.set_updated_at();

-- A row can never be moved to another org or member through the API — the
-- SQL editor / service paths (auth.uid() null) stay open, same pattern as
-- 0004/0005's guards.
create or replace function public.guard_biz_expense_update()
returns trigger
language plpgsql
as $$
begin
  if (new.org_id <> old.org_id or new.user_id <> old.user_id) and auth.uid() is not null then
    raise exception 'biz_expenses.org_id and user_id are immutable';
  end if;
  return new;
end
$$;

drop trigger if exists guard_biz_expense_update on public.biz_expenses;
create trigger guard_biz_expense_update
  before update on public.biz_expenses
  for each row execute function public.guard_biz_expense_update();

-- ── Row Level Security ─────────────────────────────────────────────────────

alter table public.biz_expenses enable row level security;

-- Read: admins (3+) see the whole org's rows; everyone sees their own.
drop policy if exists "biz_expenses: admins read org, members read own" on public.biz_expenses;
create policy "biz_expenses: admins read org, members read own"
  on public.biz_expenses for select
  using (
    is_master_admin()
    or current_access_level(org_id) >= 3
    or user_id = auth.uid()
  );

-- Insert: your own row only, and only if permitted (level 3+, or the
-- can_add_expenses flag on your membership).
drop policy if exists "biz_expenses: permitted members insert own" on public.biz_expenses;
create policy "biz_expenses: permitted members insert own"
  on public.biz_expenses for insert
  with check (user_id = auth.uid() and can_submit_expenses(org_id));

-- Update/delete: admins only. Deliberately NO policy for lower tiers —
-- tier 1 never deletes anything, anywhere.
drop policy if exists "biz_expenses: admins update" on public.biz_expenses;
create policy "biz_expenses: admins update"
  on public.biz_expenses for update
  using (is_master_admin() or current_access_level(org_id) >= 3)
  with check (is_master_admin() or current_access_level(org_id) >= 3);

drop policy if exists "biz_expenses: admins delete" on public.biz_expenses;
create policy "biz_expenses: admins delete"
  on public.biz_expenses for delete
  using (is_master_admin() or current_access_level(org_id) >= 3);

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Admin Finance tabs follow worker submissions live. Events are RLS-filtered
-- per subscriber, so a worker's channel only ever carries their own rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'biz_expenses'
  ) then
    alter publication supabase_realtime add table public.biz_expenses;
  end if;
end $$;
