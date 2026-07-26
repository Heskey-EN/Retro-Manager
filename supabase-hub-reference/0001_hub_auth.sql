-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — core auth & tenancy schema
--  Run FIRST, in the HUB Supabase project (SQL Editor), before 0002.
--
--  This is the backbone of the whole suite: every tenant is an organisation,
--  every user gets a membership with an access level 1–4, and RLS on these
--  two tables (plus the helper functions) is what every app in the suite
--  will lean on. The UI hides buttons for convenience; THIS is the security.
--
--  Access levels:
--    1  Office Worker      comment + upload, never delete
--    2  Senior Worker      + delete jobs
--    3  Organisation Admin sees/manages everything in their own org
--    4  Master Admin       platform owner (Eco Futures) — cross-org
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tables ─────────────────────────────────────────────────────────────────

-- Organisations = tenants
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  is_platform_owner boolean not null default false,  -- true only for Eco Futures
  created_at timestamptz not null default now()
);

-- Links auth.users to organisations, with a 1–4 access level
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_level int not null default 1 check (access_level between 1 and 4),
  is_active boolean not null default true,
  last_seen timestamptz,                 -- powers the "active users" view for Tier 4
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_org_idx on public.memberships (org_id);

-- At most ONE platform-owner org can ever exist — enforced by the database,
-- not by convention. (Partial unique index: only rows with the flag count.)
create unique index if not exists organisations_platform_owner_singleton
  on public.organisations (is_platform_owner) where is_platform_owner;

-- ── Helper functions (keep the RLS below readable) ─────────────────────────
-- SECURITY DEFINER so they can read memberships without re-triggering RLS
-- (a memberships policy that queried memberships directly would recurse).
-- search_path pins pg_temp LAST so temp tables can never shadow our tables.

-- The caller's access level within a given org (0 = not a member)
create or replace function public.current_access_level(target_org uuid)
returns int
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(max(access_level), 0)
  from memberships
  where user_id = auth.uid() and org_id = target_org and is_active
$$;

-- Is the caller a Tier 4 master admin of the platform-owner org?
create or replace function public.is_master_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from memberships m
    join organisations o on o.id = m.org_id
    where m.user_id = auth.uid()
      and m.access_level = 4
      and m.is_active
      and o.is_platform_owner
  )
$$;

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Sign-up flow: create an organisation and make the creator its admin (3).
-- An RPC because doing it client-side is a chicken-and-egg problem — you
-- can't insert a level-3 membership until you're an admin of the org, and
-- you can't be an admin of an org that doesn't exist yet.
create or replace function public.create_organisation(org_name text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  new_org uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an organisation.';
  end if;
  if org_name is null or length(trim(org_name)) < 2 then
    raise exception 'Organisation name must be at least 2 characters.';
  end if;
  if exists (select 1 from memberships where user_id = auth.uid() and is_active) then
    raise exception 'You already belong to an organisation.';
  end if;

  insert into organisations (name) values (trim(org_name)) returning id into new_org;
  insert into memberships (org_id, user_id, access_level) values (new_org, auth.uid(), 3);
  return new_org;
end
$$;

-- Heartbeat: stamp the caller's own last_seen (powers the Tier-4 active-users
-- view). An RPC so users never need a general UPDATE policy on memberships.
create or replace function public.touch_last_seen(target_org uuid)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  update memberships
  set last_seen = now()
  where user_id = auth.uid() and org_id = target_org and is_active
$$;

-- Lock the functions down: signed-in users only.
revoke execute on function public.current_access_level(uuid) from public, anon;
revoke execute on function public.is_master_admin() from public, anon;
revoke execute on function public.create_organisation(text) from public, anon;
revoke execute on function public.touch_last_seen(uuid) from public, anon;
grant execute on function public.current_access_level(uuid) to authenticated;
grant execute on function public.is_master_admin() to authenticated;
grant execute on function public.create_organisation(text) to authenticated;
grant execute on function public.touch_last_seen(uuid) to authenticated;

-- ── Integrity guards ───────────────────────────────────────────────────────
-- Triggers, not policies, because RLS is ROW-scoped: a permissive UPDATE
-- policy exposes every column of the row, and WITH CHECK cannot see OLD.
-- These fire for every caller — service_role and future webhooks included.

-- A membership row can change level/active, but never be moved to another
-- org or user. And level 4 can never be minted through the API: any request
-- carrying a user JWT (auth.uid() is not null) is blocked from writing
-- access_level = 4 unless the caller is already the master admin. The seed
-- script and the SQL editor run with auth.uid() null, so they still work.
create or replace function public.guard_membership_write()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and (new.org_id <> old.org_id or new.user_id <> old.user_id) then
    raise exception 'memberships.org_id and user_id are immutable — insert a new row instead';
  end if;
  if new.access_level = 4
     and (tg_op = 'INSERT' or old.access_level <> 4)
     and auth.uid() is not null
     and not is_master_admin() then
    raise exception 'access level 4 can only be granted by the master admin';
  end if;
  -- And a master admin can never be silently downgraded — by ANY caller,
  -- service_role included. If it's ever truly needed, drop this trigger,
  -- make the change in the SQL editor, and recreate it.
  if tg_op = 'UPDATE' and old.access_level = 4 and new.access_level <> 4 then
    raise exception 'a master admin membership cannot be downgraded';
  end if;
  return new;
end
$$;

drop trigger if exists guard_membership_update on public.memberships;
drop trigger if exists guard_membership_write on public.memberships;
create trigger guard_membership_write
  before insert or update on public.memberships
  for each row execute function public.guard_membership_write();

-- organisations: `name` is the only column an API caller may change.
-- is_platform_owner is written by the seed script / SQL editor only
-- (auth.uid() null there) — no JWT-carrying request can ever flip it.
create or replace function public.guard_organisation_update()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and (new.is_platform_owner <> old.is_platform_owner
          or new.id <> old.id
          or new.created_at <> old.created_at) then
    raise exception 'only organisations.name can be changed through the API';
  end if;
  return new;
end
$$;

drop trigger if exists guard_organisation_update on public.organisations;
create trigger guard_organisation_update
  before update on public.organisations
  for each row execute function public.guard_organisation_update();

-- ── Row Level Security ─────────────────────────────────────────────────────
-- Absence of a policy means the action is denied. Notably: there is NO
-- insert policy on organisations (create_organisation() is the only path)
-- and no self-service update path on memberships (touch_last_seen() only).

alter table public.organisations enable row level security;
alter table public.memberships enable row level security;

-- organisations ─ read: your own org(s); master admin reads all
drop policy if exists "orgs: members read" on public.organisations;
create policy "orgs: members read"
  on public.organisations for select
  using (
    is_master_admin()
    or id in (select org_id from public.memberships
              where user_id = auth.uid() and is_active)
  );

-- organisations ─ rename: org admin (3+) inside the org. RLS is row-scoped,
-- so the guard_organisation_update trigger above is what pins every column
-- except `name` for API callers.
drop policy if exists "orgs: admins update" on public.organisations;
create policy "orgs: admins update"
  on public.organisations for update
  using (is_master_admin() or current_access_level(id) >= 3)
  with check (is_master_admin() or current_access_level(id) >= 3);

-- organisations ─ delete: master admin only
drop policy if exists "orgs: master delete" on public.organisations;
create policy "orgs: master delete"
  on public.organisations for delete
  using (is_master_admin());

-- memberships ─ read your own rows…
drop policy if exists "memberships: read own" on public.memberships;
create policy "memberships: read own"
  on public.memberships for select
  using (user_id = auth.uid());

-- …org admins read the whole org, master admin reads all
drop policy if exists "memberships: admins read org" on public.memberships;
create policy "memberships: admins read org"
  on public.memberships for select
  using (is_master_admin() or current_access_level(org_id) >= 3);

-- memberships ─ org admins add users at levels 1–3 in their own org.
-- Only the master admin can ever mint a level 4.
drop policy if exists "memberships: admins insert" on public.memberships;
create policy "memberships: admins insert"
  on public.memberships for insert
  with check (
    is_master_admin()
    or (current_access_level(org_id) >= 3 and access_level between 1 and 3)
  );

-- memberships ─ org admins manage their org's rows, but never their own row
-- (no self-promotion) and never a level-4 row.
drop policy if exists "memberships: admins update" on public.memberships;
create policy "memberships: admins update"
  on public.memberships for update
  using (
    is_master_admin()
    or (current_access_level(org_id) >= 3
        and user_id <> auth.uid()
        and access_level <= 3)
  )
  with check (
    is_master_admin()
    or (current_access_level(org_id) >= 3 and access_level between 1 and 3)
  );

drop policy if exists "memberships: admins delete" on public.memberships;
create policy "memberships: admins delete"
  on public.memberships for delete
  using (
    is_master_admin()
    or (current_access_level(org_id) >= 3
        and user_id <> auth.uid()
        and access_level <= 3)
  );
