# RetroManager — fresh-start copy (26 July 2026)

This folder is the complete, merged **RetroManager** app: the Retrofit Job
Manager (was jobs.ecofutures.uk) **plus** the Business Hub
(was business.ecofutures.uk) folded in as the admin-only **Finance** tab.
It was copied out of the old `RetrofitManagementTool` repo at the merge
commit so you can delete the old repos/deployments and start one new repo
from here. No git history is attached — this is a clean seed.

## ⚠️ Before you delete anything

1. **Your live business data is NOT in any repo.** It lives in the browser's
   localStorage on **business.ecofutures.uk**. Before deleting that Vercel
   deployment/domain, open the site, go to **Settings → Download backup**
   (the file includes receipt photos). You'll restore that file in
   RetroManager later (Finance → Settings → Restore backup). If you delete
   the deployment first, the data is stranded on that device's browser
   profile and much harder to get at.
2. Job Manager data: if you ever used jobs.ecofutures.uk for real, its jobs
   live in that browser's IndexedDB per device (local mode). Export/keep
   anything you need before deleting that deployment too.
3. The **EcoFutures repo** (the Hub / marketing site) is separate — don't
   delete that one; the suite login and the SQL migrations live there.

## Start the new repo

```bash
cd C:\Users\Asus\Documents\RetroManager
git init -b main
git add -A
git commit -m "RetroManager — merged jobs + finance app"
# create the new GitHub repo (e.g. Heskey-EN/RetroManager), then:
git remote add origin https://github.com/Heskey-EN/RetroManager.git
git push -u origin main
```

## Run it

```bash
npm install
npm run dev      # local dev (Vite, default port 5173)
npm run build    # production build → dist/
```

With no env vars it runs in **local mode**: jobs in this browser's IndexedDB,
Finance tab behind a per-device passcode. That's fine for trying it out.

## Deploy (Vercel)

1. Import the new GitHub repo into Vercel (it's a standard Vite app;
   `vercel.json` already has the SPA rewrite).
2. Add the domain **retromanager.ecofutures.uk** + DNS.
3. Set env vars to turn on the suite login (shared one-login system):
   - `VITE_HUB_SUPABASE_URL`
   - `VITE_HUB_SUPABASE_ANON_KEY`
4. In the hub Supabase project's SQL editor, run (in order, if not already
   run): `0004_jobs.sql`, `0005_business.sql`, `0007_team_expenses.sql`.
   Copies are in `supabase-hub-reference/` here — but the source of truth
   for hub SQL is the EcoFutures repo (`supabase/hub/`), keep them in sync.
5. Restore your business data backup (Finance → Settings → Restore backup),
   then update the Hub launcher registry (`src/lib/hub/registry.js` in the
   EcoFutures repo) so the jobs/business tiles point at RetroManager.

## Who sees what

- **Jobs tab** — everyone in your organisation.
- **Finance tab** — Organisation Admins (levels 3–4) only in suite mode;
  passcode-protected in local mode. Enforced by RLS, not just the UI.
- **Expenses tab (workers)** — levels 1–2 only after you tick them in
  Finance → **Team expenses**. They log expenses (straight into your
  Finance figures, labelled with their name) and see only their own.

## Layout

- `src/` — the Job Manager app (unchanged from before the merge).
- `src/business/` — everything Finance: pages, components, store, tax
  engine, hash-router shim. Business-side changes go here.
- `supabase-hub-reference/` — reference copies of the hub SQL migrations.
