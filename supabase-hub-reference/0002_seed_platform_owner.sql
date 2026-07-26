-- ═══════════════════════════════════════════════════════════════════════════
--  Eco Futures Hub — seed the platform owner (Tier 4)
--  Run SECOND, in the HUB Supabase project, AFTER:
--    1. 0001_hub_auth.sql has been run, and
--    2. George has signed up in the app (Retrofit Suite page → Create account)
--       so an auth.users row exists for his email.
--
--  What it does:
--    • If George already created an organisation in the app, that org is
--      promoted to platform owner and his membership raised to level 4.
--    • If he has no org yet, it creates "Eco Futures" (is_platform_owner)
--      and adds him at level 4.
--  Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_email text := 'georgehesketh@yahoo.com';  -- ← the master-admin sign-up email
  v_user  uuid;
  v_org   uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No auth user with email %. Sign up in the app first, then re-run.', v_email;
  end if;

  -- Converge on the existing platform org first (makes re-runs stable),
  -- else the org he ADMINS (never one he was merely invited into),
  -- else create the platform org fresh.
  select id into v_org from public.organisations where is_platform_owner limit 1;

  if v_org is null then
    select org_id into v_org
    from public.memberships
    where user_id = v_user and is_active and access_level >= 3
    order by created_at
    limit 1;
  end if;

  if v_org is null then
    insert into public.organisations (name, is_platform_owner)
    values ('Eco Futures', true)
    returning id into v_org;

    insert into public.memberships (org_id, user_id, access_level)
    values (v_org, v_user, 4);
  else
    update public.organisations set is_platform_owner = true where id = v_org;

    insert into public.memberships (org_id, user_id, access_level)
    values (v_org, v_user, 4)
    on conflict (org_id, user_id)
      do update set access_level = 4, is_active = true;
  end if;

  raise notice 'Platform owner org: % — % is now Master Admin (level 4).', v_org, v_email;
end $$;
