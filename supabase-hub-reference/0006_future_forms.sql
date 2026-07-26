-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — Future Forms (retrofit assessment form builder)
--  Run SIXTH, in the HUB Supabase project, after 0001. Safe to re-run.
--
--  Two tables + one storage bucket:
--    forms            — form templates. AUTHORED BY THE MASTER ADMIN ONLY
--                       (George's decision): the builder is level-4 territory.
--                       Published forms are readable by every active member
--                       of any organisation, so surveyors can fill them.
--    form_submissions — one row per survey filled in the field. Org-scoped:
--                       carries org_id, RLS by the caller's membership.
--                       read/create level ≥ 1 · delete level ≥ 3 (a
--                       submission is a record, not a job — CLAUDE.md §4).
--    assessment-photos (storage) — survey photos, pathed org_id/… and
--                       gated by membership of that org.
-- ═══════════════════════════════════════════════════════════════════════════

-- Shared updated_at helper (also created by 0004/0005; kept so 0006 can run
-- in any order relative to them)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Any active membership at all? (published forms are platform-wide)
create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and is_active
  )
$$;

revoke execute on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;

-- ── forms ──────────────────────────────────────────────────────────────────

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  schema jsonb not null default '{"sections": []}'::jsonb,
  version int not null default 1,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_forms_updated_at on public.forms;
create trigger trg_forms_updated_at
  before update on public.forms
  for each row execute function public.set_updated_at();

alter table public.forms enable row level security;

-- Read: master admin sees everything; members see PUBLISHED forms only.
drop policy if exists "forms: members read published" on public.forms;
create policy "forms: members read published"
  on public.forms for select
  using (
    is_master_admin()
    or (status = 'published' and is_active_member())
  );

-- Author (insert/update/delete): master admin only. No other tier has any
-- write path to form templates.
drop policy if exists "forms: master insert" on public.forms;
create policy "forms: master insert"
  on public.forms for insert
  with check (is_master_admin());

drop policy if exists "forms: master update" on public.forms;
create policy "forms: master update"
  on public.forms for update
  using (is_master_admin())
  with check (is_master_admin());

drop policy if exists "forms: master delete" on public.forms;
create policy "forms: master delete"
  on public.forms for delete
  using (is_master_admin());

-- ── form_submissions ───────────────────────────────────────────────────────

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete restrict,
  org_id uuid not null references public.organisations (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null default auth.uid(),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  -- Denormalised so the submission survives later edits to the form
  form_title text not null default '',
  form_schema jsonb not null default '{"sections": []}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  site_address text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Submissions are PERMANENT RECORDS: deleting a template must never cascade
-- into completed surveys (that's what the denormalised schema copy is for).
-- RESTRICT forces "archive, don't delete" once a form has submissions.
-- (Constraint swap is explicit because `create table if not exists` never
-- retrofits an existing table on re-run.)
alter table public.form_submissions
  drop constraint if exists form_submissions_form_id_fkey;
alter table public.form_submissions
  add constraint form_submissions_form_id_fkey
  foreign key (form_id) references public.forms (id) on delete restrict;

create index if not exists form_submissions_org_idx on public.form_submissions (org_id);
create index if not exists form_submissions_form_idx on public.form_submissions (form_id);

drop trigger if exists trg_form_submissions_updated_at on public.form_submissions;
create trigger trg_form_submissions_updated_at
  before update on public.form_submissions
  for each row execute function public.set_updated_at();

-- org_id, submitted_by and form_id can never be rewritten through the API —
-- a submission stays pinned to who made it, for which org, from which form.
create or replace function public.guard_submission_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and (new.org_id <> old.org_id
          or new.submitted_by is distinct from old.submitted_by
          or new.form_id <> old.form_id) then
    raise exception 'form_submissions.org_id, submitted_by and form_id are immutable';
  end if;
  return new;
end
$$;

drop trigger if exists guard_submission_update on public.form_submissions;
create trigger guard_submission_update
  before update on public.form_submissions
  for each row execute function public.guard_submission_update();

alter table public.form_submissions enable row level security;

-- Read: any active member of the org (level >= 1); master admin everything.
drop policy if exists "submissions: members read" on public.form_submissions;
create policy "submissions: members read"
  on public.form_submissions for select
  using (is_master_admin() or current_access_level(org_id) >= 1);

-- Create: any active member, into their own org, as themselves.
drop policy if exists "submissions: members insert" on public.form_submissions;
create policy "submissions: members insert"
  on public.form_submissions for insert
  with check (
    (is_master_admin() or current_access_level(org_id) >= 1)
    and submitted_by = auth.uid()
  );

-- Update: the surveyor keeps editing their OWN submission while it's a
-- draft (and the act of completing it); org admins (3+) can edit any of the
-- org's submissions; master admin everything.
drop policy if exists "submissions: edit own drafts or admin" on public.form_submissions;
create policy "submissions: edit own drafts or admin"
  on public.form_submissions for update
  using (
    is_master_admin()
    or current_access_level(org_id) >= 3
    or (submitted_by = auth.uid() and status = 'draft' and current_access_level(org_id) >= 1)
  )
  with check (
    is_master_admin()
    or current_access_level(org_id) >= 3
    or (submitted_by = auth.uid() and current_access_level(org_id) >= 1)
  );

-- Delete: level >= 3 (submissions are records, not jobs). Tier 1/2 have NO
-- delete path.
drop policy if exists "submissions: admins delete" on public.form_submissions;
create policy "submissions: admins delete"
  on public.form_submissions for delete
  using (is_master_admin() or current_access_level(org_id) >= 3);

-- ── Storage: survey photos ─────────────────────────────────────────────────
-- Private bucket; objects are pathed  <org_id>/<submission_id>/<file>  and
-- access follows membership of the org in the first path segment.

insert into storage.buckets (id, name, public)
values ('assessment-photos', 'assessment-photos', false)
on conflict (id) do nothing;

drop policy if exists "assessment photos: members read" on storage.objects;
create policy "assessment photos: members read"
  on storage.objects for select
  using (
    bucket_id = 'assessment-photos'
    and (is_master_admin()
         or current_access_level(((storage.foldername(name))[1])::uuid) >= 1)
  );

drop policy if exists "assessment photos: members upload" on storage.objects;
create policy "assessment photos: members upload"
  on storage.objects for insert
  with check (
    bucket_id = 'assessment-photos'
    and (is_master_admin()
         or current_access_level(((storage.foldername(name))[1])::uuid) >= 1)
  );

-- Delete: level >= 3 only (photos are part of the record).
drop policy if exists "assessment photos: admins delete" on storage.objects;
create policy "assessment photos: admins delete"
  on storage.objects for delete
  using (
    bucket_id = 'assessment-photos'
    and (is_master_admin()
         or current_access_level(((storage.foldername(name))[1])::uuid) >= 3)
  );
