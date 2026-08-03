# Assessment Manager

The internal tool Eco Futures runs on: retrofit jobs on one side, the money on
the other, one login, one place.

**Live:** https://retromanager.ecofutures.uk · **Repo:** `Heskey-EN/Retro-Manager`

It is the merge of two apps that used to be separate — the Retrofit Job Manager
(`jobs.ecofutures.uk`) and the Business Tracker (`business.ecofutures.uk`).
Both are retired; this replaces them.

---

## The tabs

| Tab | Who sees it | What it's for |
|---|---|---|
| **Dashboard** | everyone | The landing page. Add a job or an expense in a few taps, see what's coming up. Built phone-first. |
| **Jobs** | everyone | The full board: status filters, search, multi-select, documents, costing, spreadsheet import. |
| **Finance** | Organisation Admins (level 3–4) | Calendar, week-by-week takings, UK tax estimate, expenses, invoices. |
| *Expenses* | levels 1–2 *if permitted* | A worker's own expense log. Takes the place of the Finance tab for them. |

Everyone lands on `#/`. Jobs is `#/jobs`, Finance is `#/finance`.

## The two ideas worth knowing

**1. Money entered on a job flows into Finance by itself.**
A job's `costing` (`{ revenue, items }`) is read live by the Finance tab —
revenue becomes income on the job's start date, cost items become "Job costs"
expenses. Nothing is copied: edit the job and Finance updates. Those rows are
read-only in Finance and can never be written into the Finance data.
See `src/business/lib/managerLink.js`.

**2. Access level decides what you see; RLS decides what you get.**
The four tiers come from the Eco Futures Hub (1 Office Worker · 2 Senior
Worker · 3 Organisation Admin · 4 Master Admin). Hidden buttons are a
convenience. The real enforcement is Row Level Security in the shared Supabase
project — never rely on the UI to keep someone out.

## Two modes, always

| | Suite mode | Local mode |
|---|---|---|
| **When** | `VITE_HUB_SUPABASE_*` env vars set | no env vars |
| **Sign-in** | shared `.ecofutures.uk` cookie from the Hub | none |
| **Jobs** | shared Supabase table, realtime | this browser's IndexedDB |
| **Finance** | org-wide cloud data | this browser's localStorage + a passcode |

Local mode is not a fallback waiting to be deleted — it is how the app runs
with no setup at all. Every feature must work in both.

## Assessment status

```
Booked → Done → Paid          (+ Cancelled, outside the flow)
```

Four states, matching how Finance already thinks (booked / done / paid).
This replaced a five-stage retrofit pipeline (Booking → Assessment →
Coordination → Compiling documents → Submitted): those stages tracked
paperwork moving through a process, and this app tracks assessments and the
money on them. Jobs still holding the old names are normalised on read by
`normalizeStatus()`, so nothing had to be migrated.

## Running it

```bash
npm install
npm run dev      # local mode
npm run build
```

For suite mode locally, create `.env.local` (gitignored):

```
VITE_HUB_SUPABASE_URL=https://<hub-project>.supabase.co
VITE_HUB_SUPABASE_ANON_KEY=<publishable key>
```

Those are public client values. The `service_role` key must never appear in
this repo or in any `VITE_` variable.

## Deploying

Vercel, from `main`. Set the two env vars on the project — **they are baked in
at build time, so changing them does nothing until you redeploy.**

Migrations live in the **EcoFutures** repo under `supabase/hub/` (copies in
`supabase-hub-reference/` here). Run them in the hub project's SQL editor:

| | |
|---|---|
| `0004_jobs.sql` | the jobs table |
| `0005_business.sql` | Finance data |
| `0007_team_expenses.sql` | worker expense logging |
| `0008_job_assignments.sql` | people on jobs |

## Where things are

```
src/
  App.jsx              routing between sections + the Jobs board
  dashboard/           the landing tab (mobile-first, Tailwind)
  business/            the whole Finance tab, ported from the Business Tracker
  components/          the Jobs UI
  lib/
    jobsStore.js       jobs: Supabase or IndexedDB behind one interface
    csv.js             spreadsheet parsing + column detection
    importMatch.js     duplicate detection and gap filling
    route.js           multi-job route planning (a planner, NOT a router)
    status.js          the pipeline stages
```

## House rules

- **Never let the two design systems share a class name.** `src/styles.css`
  (the Jobs UI) is hand-rolled and *unlayered*, so every selector in it beats
  every Tailwind utility everywhere in the app. Its `.grid` and `.card` once
  hijacked the Tailwind-styled Finance tab and rendered the whole section as
  one giant column. They are `.job-grid` / `.job-card` now — prefix new
  jobs-UI classes.
- **Inputs must be ≥16px**, or iOS zooms the page when you tap one.
- **A job insert with an unknown key fails the entire batch** (PostgREST).
  Only real columns at the top level; everything else goes in `data`.
- **`await ensureBusinessReady(orgId)` before writing Finance data** from
  outside the Finance tab, or the write silently lands in stale local data and
  is thrown away.
- **Verify layout with computed styles, not page text.** The two worst bugs in
  this project's history both read perfectly as text and were catastrophic on
  screen.

Why each rule exists, and what else has bitten: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
