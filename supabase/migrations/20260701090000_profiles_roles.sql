-- Auth profiles, roles and access control for the Retrofit tool.
-- Run automatically by the Supabase GitHub integration, or paste into the
-- Supabase SQL editor.

-- Roles a user can hold, and their access status.
do $$ begin
  create type public.user_role as enum ('admin', 'member', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('pending', 'active', 'disabled');
exception when duplicate_object then null; end $$;

-- One profile row per auth user.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       public.user_role   not null default 'member',
  status     public.user_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the current request from an admin? SECURITY DEFINER avoids RLS recursion.
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Stop non-admins escalating their own role/status via the "update own" policy.
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only block real signed-in non-admins. When auth.uid() is null (SQL editor /
  -- service role) allow the change so the first admin can be bootstrapped.
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

alter table public.profiles enable row level security;

-- Read: your own profile, or everything if you're an admin.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- Update: your own row (name only, guarded above), or anyone if admin.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles update admin" on public.profiles;
create policy "profiles update admin" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- After the first person signs up, promote them in the SQL editor:
--   update public.profiles set role = 'admin', status = 'active' where email = 'you@example.com';
