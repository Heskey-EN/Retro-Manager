# CLAUDE.md — read this first

**Assessment Manager** — Eco Futures' internal tool for tracking assessments and
the money on them. LIVE at https://retromanager.ecofutures.uk and used for real
work, so a broken `main` is a broken business day.

Start with `README.md` (what it is) and `docs/ARCHITECTURE.md` (why it's shaped
that way, and what has already bitten). This file is the operating manual: the
things that will cost you if you don't know them.

---

## State of play (Aug 2026)

**The design-system unification and the one-calendar rebuild are DONE.** The
shared kit lives in `src/ui/` (Button, Field/Input/Select/Textarea, Modal, Card,
Chip, Toast, Banner, EmptyState, SegmentedControl, Typography) — everything new
must be built on it. `src/calendar/` is the one calendar (Calendar, UpNext,
EntryRow, DaySheet, Timeline, entries.js, EpcExport); all three sections render
it from the same merged entry list.

**Safety net:** `git tag pre-redesign` marks the last state before the rebuild.

### How the one calendar stays honest

Jobs come from the real jobs list; Finance's hand-added entries (EPC batches /
company blocks) come from `useHubData()`. `src/calendar/entries.js` merges the
two into one entry shape and is the ONLY place that decides which properties a
booking covers — the day counts, the rows and the EPC export all read that one
function, so the screen and the exported file cannot disagree. Rows managerLink
derived from costed jobs (`_linked`, ids prefixed `rmt-`) are dropped in the
merge because the real job already carries that day.

### Sheet/modal rule

The kit Modal's `footer` prop is the pinned action row — on a phone it is the
only place a primary button is guaranteed on screen. Any dialog whose body can
outgrow the viewport (quick add, review screens) must put its submit there, not
at the end of the scrolling body. A `<form>` in the body pairs with a footer
submit via the `form=` attribute.

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
- **`computer` clicks time out too when the pane is hidden** — drive the UI
  from `javascript_tool`: `el.click()`, and for React inputs set the value via
  the prototype setter then dispatch `input`/`change`. Wrap every probe in an
  IIFE (the tool shares one scope across calls, even across reloads).
- **A hidden pane freezes CSS animations at t=0 and starves ResizeObserver**,
  so a sheet mid-`fade-up` measures 16px low forever and an RO-published CSS
  var can sit stale. Finish animations (`el.getAnimations().forEach(a =>
  a.finish())`) before trusting geometry, and treat those artefacts as the
  environment's, not the app's.
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
