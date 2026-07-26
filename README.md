# Retrofit Job Management Tool

A job management system for **Eco Futures**. Add jobs by hand or upload a CSV,
see them as cards in a list, view their timelines on a calendar, track each job
through the retrofit workflow, and attach documents — all stored locally in the
browser with no backend required.

## What it does

- **Add jobs** — a manual form (name, address, postcode, status, dates) or a CSV
  upload (drag-and-drop, parsed in-browser with Papa Parse).
- **Job list** — one card per job, searchable and filterable by status.
- **Calendar timeline** — a lightweight Gantt-style view of dated jobs.
- **Retrofit workflow statuses** — Booking · Assessment · Coordination ·
  Compiling documents · Submitted.
- **Documents per job** — upload files (PDFs etc.) and attach links. Each
  document is filed into a folder per status, with a **Master** folder that shows
  everything for the job.
- **Local-first storage** — jobs and documents (including uploaded files) live in
  the browser via **IndexedDB**, synced across tabs on the same machine. No
  accounts, no server, no monthly cost.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. Click **+ Add job** to create one by hand, or drag in
`sample-data/jobs-sample.csv`. Everything persists locally between sessions.

## Storage & the backend layer

This app is part of the **Eco Futures Retrofit Suite** and runs on the suite's
shared HUB Supabase project: sign in once at
[ecofutures.uk/retrofit-suite](https://ecofutures.uk/retrofit-suite) and the
session carries here through a cookie scoped to `.ecofutures.uk`. Jobs are
org-scoped (`org_id` + RLS) with real-time sync; what you can do follows your
suite access level (1 office · 2 senior, can delete jobs · 3 org admin ·
4 master). The backend stays pluggable
([`src/lib/jobsStore.js`](src/lib/jobsStore.js)) — with no env vars set the
app falls back to LOCAL mode (IndexedDB, per-browser) for offline dev.

## Connecting to the suite (Supabase)

1. The hub project's schema comes from the EcoFutures repo — run
   `supabase/hub/0004_jobs.sql` there (see that repo's `supabase/hub/README.md`).
2. Copy `.env.example` to `.env` and fill in the HUB project's URL and
   publishable key:

   ```
   VITE_HUB_SUPABASE_URL=https://HUB-PROJECT.supabase.co
   VITE_HUB_SUPABASE_ANON_KEY=your-publishable-key
   ```

3. Restart `npm run dev`. The header badge switches from **Local mode** to
   **Live sync**. Sign in through the Hub (locally: run the EcoFutures dev
   server and set `VITE_SUITE_HUB_URL=http://localhost:5180` — localhost
   cookies are shared across ports).

   Note: this syncs **jobs**. Uploaded documents currently stay in local
   IndexedDB; moving file storage to a hosted bucket (e.g. Supabase Storage) is a
   follow-up.

## Deploying to Vercel

1. Push this repo to GitHub (already configured for
   `Heskey-EN/RetrofitManagementTool`).
2. Import the repo at [vercel.com/new](https://vercel.com/new). Vercel
   auto-detects Vite.
3. Add the two `VITE_HUB_SUPABASE_*` environment variables in the Vercel
   project settings.
4. Add the custom domain **jobs.ecofutures.uk** (Project → Settings →
   Domains) — the shared login cookie only reaches the app on an
   `ecofutures.uk` subdomain.
5. Deploy. The included `vercel.json` handles the SPA build and routing.

## How CSV columns are mapped

The UI is intentionally generic, so only a few things are auto-detected:

- **Title** — first column whose name looks like a job/name/reference/address.
- **Start date** — first date-like column (start/install/scheduled/date…).
- **End date** — a separate end/finish/completion/due column if present.

Every original column is preserved and shown in full on the job detail panel.
UK-style `DD/MM/YYYY` dates are understood, along with ISO and common formats.

## Project structure

```
src/
  lib/
    idb.js              IndexedDB wrapper (jobs + documents stores)
    jobsStore.js        Pluggable backend: local (IndexedDB) or Supabase
    documentsStore.js   Per-job files + links, filed into status folders
    csv.js              Papa Parse wrapper + column/date detection
    status.js           Retrofit workflow statuses and colours
    supabaseClient.js   Supabase client (only used if env vars are set)
  hooks/
    useJobs.js          Loads, subscribes, and mutates jobs
    useDocuments.js     Loads and mutates one job's documents
  components/           Upload, add-job modal, list, cards, timeline,
                        detail drawer, documents panel
  App.jsx               Layout, tabs, stats
supabase/schema.sql     Optional: run in a Supabase project for multi-user sync
sample-data/            Example CSV
```

## Roadmap (next)

- **Multi-user sync** — connect a hosted backend (Firebase / PocketBase /
  Supabase) so 40–50 users share data live, plus hosted file storage.
- Retrofit-specific fields: measures, install dates, compliance details.
- Auth with per-user / per-organisation access.
- Branding and refined UI.

## Tech

- Vite + React, deployable to Vercel (~£20/mo). Currently no backend cost —
  storage is local (IndexedDB). A hosted backend would be added when live
  multi-user sync is needed.
