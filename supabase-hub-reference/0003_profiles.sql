-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — profiles (who is behind each membership)
--  Run THIRD, in the HUB Supabase project, after 0001 (0002 order doesn't
--  matter). Safe to re-run.
--
--  auth.users isn't readable through the API, so the team page couldn't show
--  an email next to a membership row. profiles mirrors id/email/name into
--  public, kept in sync by triggers on auth.users, and RLS-scoped so only
--  yourself, your org's admins, and the master admin can read a profile.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  created_at timestamptz not null default now()
);

-- ── Sync triggers on auth.users ────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_updated()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- Upsert, not update: self-heals if a profile row ever went missing.
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name;
  return new;
end
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- Backfill anyone who signed up before this file ran (George!)
insert into public.profiles (id, email, full_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

-- Let PostgREST join memberships → profiles in one query
alter table public.memberships
  drop constraint if exists memberships_user_profile_fkey;
alter table public.memberships
  add constraint memberships_user_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ── Row Level Security ─────────────────────────────────────────────────────
-- Read-only through the API: the sync triggers and service_role are the only
-- writers, so there are NO insert/update/delete policies at all.

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

-- Org admins see the profiles of people with a membership in an org they
-- admin (active or deactivated — deactivated members still show on the team
-- page so they can be reactivated). Master admin sees all.
drop policy if exists "profiles: org admins read members" on public.profiles;
create policy "profiles: org admins read members"
  on public.profiles for select
  using (
    is_master_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and current_access_level(m.org_id) >= 3
    )
  );
