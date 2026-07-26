# Hub Supabase setup

The Hub gets its **own, fresh Supabase project** — the shared backbone the whole
suite will eventually sit on. (The per-app projects for EPC Checker and Cavwall
keep running untouched for now; they merge in later.)

## One-time setup

1. **Create the project** at [database.new](https://database.new) — call it
   `ecofutures-hub`, region London (`eu-west-2`). Save the database password in
   a password manager.

2. **Run the SQL** — in the project's *SQL Editor*, paste and run, in order
   (paste the file *contents*, not the filename):
   1. `0001_hub_auth.sql` — organisations, memberships, access levels 1–4,
      helper functions, RLS.
   2. `0002_seed_platform_owner.sql` — **only after you have signed up in the
      app** (Retrofit Suite page → Create account). It promotes your account
      to Master Admin (level 4). Edit the email at the top first if you sign
      up with a different address.
   3. `0003_profiles.sql` — profiles table (emails/names the team page can
      read) + sync triggers. Needed for *Manage your team*.

3. **Auth settings** — *Authentication → URL Configuration*:
   - Site URL: `https://ecofutures.uk`
   - Additional redirect URLs:
     - `https://ecofutures.uk/retrofit-suite`
     - `http://localhost:5173/retrofit-suite` (local dev)

   Note: confirmation/reset emails only round-trip on the URLs listed here.
   On a `*.vercel.app` preview deploy the link falls back to the Site URL —
   add `https://<project>-*.vercel.app/retrofit-suite` too if you want
   sign-up emails to work from preview builds.

4. **Frontend env vars** — *Project Settings → API* gives you the URL and
   `anon` key. Set them in Vercel (*Project → Settings → Environment
   Variables*) and in `.env.local` for dev:

   ```
   VITE_HUB_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_HUB_SUPABASE_ANON_KEY=<anon key>
   ```

   The **anon key is safe in the browser** (RLS is the enforcement). The
   `service_role` key must NEVER be a `VITE_` var or appear in the repo.

   For team invites (`/api/team-invite`), also set — server-side, no `VITE_`:

   ```
   HUB_SUPABASE_SERVICE_ROLE_KEY=<service_role key from the same API page>
   ```

   Invite emails are sent by Supabase's built-in mailer (fine to start;
   configure custom SMTP under *Authentication → Emails* when volume grows).

## What lives where

| Thing | Where |
|---|---|
| Tenants | `organisations` (one row per company) |
| Who's in an org + their tier | `memberships.access_level` 1–4 |
| "Is George" check for RLS | `is_master_admin()` |
| Caller's tier inside an org | `current_access_level(org_id)` |
| Sign-up creating a company | `create_organisation(name)` RPC |
| Active-users heartbeat | `touch_last_seen(org_id)` RPC |

Every future app table gets an `org_id` column and RLS built from
`current_access_level(org_id)` / `is_master_admin()` — see the patterns in the
root `CLAUDE.md`.
