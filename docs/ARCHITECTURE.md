# How Assessment Manager is put together

Written for whoever picks this up next — including me. The README says what the
app does; this says why it is shaped the way it is, and which parts will bite.

---

## 1. Where it came from

Two apps were merged in July 2026:

- **Retrofit Job Manager** — the retrofit pipeline, documents, CSV import.
  This repo is its descendant, so its code sits at the top level (`src/App.jsx`,
  `src/components/`, `src/lib/`).
- **Business Tracker** — calendar, expenses, UK tax, invoices. Ported almost
  verbatim into `src/business/`, keeping its own structure so knowledge of the
  old app still transfers.

They kept their own styling systems. That is the single biggest source of
surprise in this codebase — see §4.

The old repos and deployments are gone. Backups of both, with full git history,
are in `Documents/old-repos-archive-2026-07-26.zip`.

## 2. Data, and who owns it

Three separate stores. Knowing which one you're writing to matters.

| Store | Where | Who can touch it |
|---|---|---|
| **Jobs** | `jobs` table (suite) / IndexedDB (local) | any member; delete needs level 2+ |
| **Finance data** | one `biz_data` JSON blob per org / localStorage | level 3+ only |
| **Worker expenses** | `biz_expenses` rows | insert + read your own if permitted; only level 3+ may edit or delete |

Plus IndexedDB for **documents** and **receipt photos** — device-only in both
modes, never synced. That is a known limitation, not an oversight: moving them
to Supabase Storage is the obvious next infrastructure job.

### The link between Jobs and Finance

`src/business/lib/managerLink.js` derives Finance entries from jobs that have
costing. It is one-directional and never persists:

```
job.costing.revenue  → income, dated by the job's start_date
job.costing.items[]  → "Job costs" expenses
```

Derived rows are tagged `_linked`, are read-only in the Finance UI, and are
merged in `snapshotWithDerived()` for display only. **Every write path — cloud
push, localStorage, backup — uses the raw `data` object**, which is what stops
derived rows being saved back and multiplying. Keep that invariant.

Cancelled jobs contribute costs but not revenue. `Paid` maps to Finance's
`paid`, `Submitted`/`Finished` to `done` (owed).

## 3. Modes, and the initialisation trap

`isSupabaseConfigured` (from the env vars) decides everything. Two traps have
already caused silent data loss:

1. **The Finance store only connects inside the Finance tab.** Until
   `initCloud` has run, `cloudOrgId` is null and writes go to this device's old
   localStorage blob — no error, invisible to everyone else, and discarded the
   moment the cloud data loads. Anything writing Finance data from elsewhere
   must `await ensureBusinessReady(orgId)` first. The Dashboard's expense form
   does.
2. **`initManagerLink()` used to run only from the Finance tab**, so a price
   entered elsewhere didn't reach the books until someone opened Finance. The
   Dashboard now starts it too.

## 4. The two design systems (read this before touching CSS)

- `src/styles.css` — the Jobs UI. Hand-rolled, **unlayered**, desktop-first.
- Tailwind v4 + tokens in `src/tailwind.css` — the Finance tab and Dashboard,
  mobile-first, inside a `.biz` wrapper.

Because styles.css is unlayered, **every selector in it beats every Tailwind
utility, everywhere, regardless of specificity.** That is not a bug in the
setup — the Jobs UI relies on it — but it means a shared class name is a live
grenade.

It has gone off once: styles.css defined `.grid { grid-template-columns:
repeat(auto-fill, minmax(300px,1fr)); min-height: 55vh }` for the job board,
which silently applied to all ~20 `grid` containers in the Tailwind-styled
Finance tab. Every `grid-cols-*` was overridden; the month calendar's seven
weekday headings stacked into seven rows and the page ran 4,976px tall. The fix
was renaming to `.job-grid` / `.job-card`, not a cascade trick — `:not()` and
`revert-layer` need a recent Safari and this is demoed on an iPhone.

**Rule: prefix jobs-UI class names. Never take a name Tailwind ships.**

Two more that bit:

- daisyUI was configured `dark --prefersdark`, so a device in dark mode got a
  dark `<html>`. `<body>` is exactly viewport-tall, so everything below the
  fold showed navy. daisyUI is pinned to light and `<html>` carries the page
  colour explicitly.
- `.topbar__inner` was a fixed-height no-wrap row: fine at 1280px, fine on
  phones, and off the right-hand edge in between. It wraps at all widths now.

## 5. Spreadsheet import

`src/lib/csv.js` (parse) + `src/lib/importMatch.js` (reconcile) +
`src/components/ImportReview.jsx` (the review screen). **There is exactly one
importer.** Finance used to have a second one that wrote to its own calendar
store with no duplicate checking — that is where a batch of duplicates came
from, and it has been removed.

Built against a real, messy spreadsheet. What it handles and why:

- **Columns are found by name, then by content.** Header matching is tiered:
  whole-header, then prefix, then substring for hints of 4+ characters only.
  That last limit exists because `"id"` is inside `"Paid"`, so a column of
  prices was being claimed as the job reference. Anything the names don't
  answer is worked out from the data, so columns can be renamed, reordered or
  unlabelled.
- **The stage column is picked by whether its values read like stages**, not by
  shape — a "Pay Method" column looks identical otherwise.
- **Dates are read per column, not per value.** A real export mixed American
  `1/19/26` with British `21/03/2026`; reading them one way turns 7 February
  into 2 July silently. Values above 12 prove their own order and ambiguous
  ones inherit it, tracked separately for 2- and 4-digit years.
- **Matching is postcode + house number.** `jobKey()` also pulls a leading
  postcode out of the title, because jobs created before the importer learned
  to split `"POSTCODE - street"` keyed differently and slipped through.
- **Imports fill blanks only.** A conflict is reported and yours is kept,
  unless the user ticks "Use the file where it disagrees" — which then lists
  every replacement and its old value first.

## 6. Multi-job route planning

`src/lib/route.js` — a route *planner*, not a router. Do not add a hash-routing
module beside it with a similar name.

Geocoding is postcodes.io: free, no API key, **postcode only** — never a name,
address line or note. Ordering is nearest-neighbour, which removes the obvious
back-and-forth but is not an optimal tour; for the 3–15 stops a real day has,
that is the right trade. Travel time is straight-line × 1.3 at 40 km/h. If the
API is unreachable the run still builds in the typed order and says so.

## 7. Things that will bite

- **A job insert with an unknown top-level key fails the whole batch** (400
  PGRST204). Real columns only; everything else in `data`.
- **RLS denials are not errors.** A delete the user isn't allowed simply
  matches zero rows. `deleteMany` re-reads what it actually deleted and reports
  a permission problem instead of a false success. Do the same anywhere new.
- **`VITE_*` vars bake in at build time.** Changing them in Vercel does nothing
  without a redeploy.
- **Vercel has silently skipped a pushed commit.** If a deploy seems not to
  happen, check the served asset hash; an empty commit re-triggers it.
- **`vercel.json` rewrites everything to `/`**, so *any* URL returns 200 with
  index.html. "The file exists because it returned 200" proves nothing —
  always check content.
- **Screenshots time out in the Claude Code preview here.** Use
  `getComputedStyle` / `getBoundingClientRect` to verify layout.

## 8. Where to go next

Roughly in order of value:

1. **Documents and receipts into Supabase Storage**, org-scoped. They are the
   last device-only data and the biggest gap in the "one place" promise.
2. **Retire the Finance tab's own calendar entries.** Now that jobs flow into
   Finance automatically, its separate job list mostly duplicates them. Folding
   it into the real jobs list would remove a whole class of confusion.
3. **Per-row Finance data.** It is one JSON blob per org with last-write-wins;
   fine for a couple of admins, wrong if the team grows.
4. **Deep links** — `#/jobs/<id>` would make jobs shareable. Job opening is
   React state today.
5. **An audit trail** on jobs. Level 1 can edit any field of a job they cannot
   delete; the accepted risk is recorded in `0004_jobs.sql`.
