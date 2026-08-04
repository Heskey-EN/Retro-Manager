# CLAUDE.md — read this first

**Assessment Manager** — Eco Futures' internal tool for tracking assessments and
the money on them. LIVE at https://retromanager.ecofutures.uk and used for real
work, so a broken `main` is a broken business day.

Start with `README.md` (what it is) and `docs/ARCHITECTURE.md` (why it's shaped
that way, and what has already bitten). This file is the operating manual: the
things that will cost you if you don't know them.

---

## Work in flight (Aug 2026)

**Unifying the two design systems onto one kit, and collapsing three calendars
into one.** The owner's words: *"unify the design systems so it feels like one
app… there is 3 different calendars in each section that don't sync."*

- `src/ui/` — the shared kit (Button, Field/Input/Select/Textarea, Modal, Card,
  Chip, Toast, Banner, EmptyState, SegmentedControl, Typography). **Committed
  and working.** Everything new must be built on it.
- `src/components/StatusBar.jsx` is migrated onto the kit as the worked example
  — copy its pattern.
- **Still to do:** the rest of `src/components/**` (and the Jobs board markup in
  `src/App.jsx`) moving off `styles.css`, then one calendar replacing
  `src/dashboard/UpcomingJobs.jsx`, `src/components/CalendarTimeline.jsx` and
  the month grid inside `src/business/pages/Dashboard.jsx`.

A multi-agent workflow was driving this and has been interrupted twice (session
limit, then the process exiting). To resume it:

```
Workflow({ scriptPath: "<session>/workflows/scripts/unify-design-and-calendars-wf_3a8c8b27-c7b.js",
           resumeFromRunId: "wf_3a8c8b27-c7b" })
```

Finished agents replay from cache. If that script is gone, just do the work
directly — the remaining steps are listed above.

**Safety net:** `git tag pre-redesign` marks the last state before any of this.
`git reset --hard pre-redesign` undoes it all.

### Why the calendars disagree

The Dashboard and Jobs calendars both read the real jobs list. The Finance one
reads `useHubData()` — a *different* store — so a real job only appears there if
it has costing, via the derived rows in `src/business/lib/managerLink.js`. One
calendar, one source. Keep hand-added Finance entries (EPC / company work)
visible, and don't double-count rows already derived from jobs (`_linked`, ids
prefixed `rmt-`).

---

## Rules that are not negotiable

1. **`src/styles.css` is UNLAYERED**, so every selector in it beats every
   Tailwind utility everywhere, whatever the specificity. When you migrate a
   component, **delete its styles.css rules in the same change.** Leaving both
   caused the worst bug this project has had (`ARCHITECTURE.md` §4). Never give
   a jobs-UI class a name Tailwind also ships.
2. **Text inputs ≥16px**, or iOS zooms the page on focus. The owner demos on an
   iPhone (~375px). Tap targets ~44px. No horizontal scroll at 375px, ever.
3. **A job insert with one unknown top-level key fails the whole batch**
   (PostgREST 400 PGRST204). Real columns only; anything else goes in `data`.
4. **`await ensureBusinessReady(orgId)` before writing Finance data** from
   outside the Finance tab. Otherwise the write lands in stale local storage
   with no error and is silently discarded when the cloud data loads.
5. **RLS denials are not errors** — a forbidden delete just matches zero rows.
   Re-read what you actually changed and report a permission problem rather than
   a false success.
6. **Both modes must keep working**: suite (Supabase, env vars set) and local
   (IndexedDB/localStorage, no env vars). Local mode is not a fallback awaiting
   removal — it's how the app runs with no setup.

## Don't reintroduce

- **The multi-stage pipeline.** Statuses are exactly Booked → Done → Paid, plus
  Cancelled outside the flow. Old names normalise on read (`normalizeStatus`).
- **A second importer.** There is one, on the Jobs tab. Finance's old one wrote
  to its own store with no duplicate check and caused a mess.
- **A `dark` daisyUI theme** — it turned the page navy below the fold.

## Verifying (this environment lies to you)

- **Screenshots time out here.** Check layout with `getComputedStyle` and
  `getBoundingClientRect`, never by reading page text. The two worst bugs in
  this project both read perfectly as text and were catastrophic on screen.
- **`vercel.json` rewrites everything to `/`**, so *any* URL returns 200 with
  index.html. "It returned 200" proves nothing — grep the content.
- **`VITE_*` vars bake in at build time.** Changing them in Vercel does nothing
  until a redeploy.
- **Vercel has silently skipped a pushed commit.** If a deploy seems not to
  happen, compare the served asset hash; an empty commit re-triggers it.
- To test locally in local mode: `mv .env.local .env.off`, run
  `npm run dev` (port 5773 via `.claude/launch.json`), then put it back.
- `npm run build` must pass before you commit. There are no tests.

## Working style the owner expects

Fix root causes, not symptoms — most reports here ("it's broken", "it added
duplicates") have turned out to be a deeper cause than the surface suggests, and
finding it has mattered more than a quick patch. Verify claims in the browser
before saying something works. Say plainly what you did **not** do or could not
check. Comments explain *why*, not *what*. British English in UI copy.
