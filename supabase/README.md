# Supabase — this app runs on the HUB project now

The Job Manager is part of the Eco Futures Retrofit Suite. It no longer has
its own Supabase project: auth, organisations, access levels 1–4 and the
`jobs` table all live in the **hub** project, set up from the EcoFutures repo
(`supabase/hub/` — run `0004_jobs.sql` there for this app's table).

Sign-in happens at ecofutures.uk/retrofit-suite; the session reaches this app
through a cookie scoped to `.ecofutures.uk`.

Env vars for this app (Vercel → Settings → Environment Variables):

```
VITE_HUB_SUPABASE_URL=https://<hub-project>.supabase.co
VITE_HUB_SUPABASE_ANON_KEY=<hub publishable/anon key>
```

Local dev: put the same two lines in `.env`, plus
`VITE_SUITE_HUB_URL=http://localhost:5180` so "sign in" links point at a
locally running Hub (sign in there once — localhost cookies are shared
across ports, so the session carries to this app's dev server).

## migrations/ — DEPRECATED

The files in `migrations/` targeted the app's OLD standalone project
(profiles/roles, per-app jobs, documents storage). They are kept for
reference only — do NOT run them against the hub project. The
`admin-create-user` edge function in `functions/` is likewise superseded by
the Hub's team page (`/retrofit-suite/team`).
