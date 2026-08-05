import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardHead, EmptyState, cx, focusRing } from '../ui'
import { addDays, todayISO } from '../lib/dates.js'
import { useCalendarEntries } from './useCalendarEntries.js'
import { EntryRow } from './EntryRow.jsx'

// "What's coming up", from the same merged source as the calendar. It replaces
// both of the old upcoming panels (the Dashboard's "Next up" and Finance's
// "Upcoming jobs"), which listed different things.
//
// One deliberate change from Finance's version: company blocks are NOT filtered
// out any more. A week you have blocked out is the most important thing on the
// list, and hiding it was part of the same "each section shows its own subset"
// problem this rebuild exists to end.

const DEFAULT_LIMIT = 6

// `withinDays` bounds the list to a window (7 = the week ahead) and `limit`
// null shows every entry in it. The Dashboard uses both: the week's work in
// full is the thing you actually plan from, so it must not stop at six.
// "Tue 5 Aug". Built from local midnight, never toISOString — see `until`.
const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

export default function UpNext({
  jobs = [], title = 'Next up', withinDays, limit = DEFAULT_LIMIT, bookedOnly = false,
  groupByDay = false, onOpenJob, onOpenEntry, children,
}) {
  const { entries, showMoney, canEdit } = useCalendarEntries(jobs)
  const today = todayISO()

  // addDays, never toISOString(): the latter converts local midnight to UTC, so
  // through BST it hands back YESTERDAY and the window closes a day early —
  // a job on the last day of the week silently vanished from the list.
  const until = useMemo(
    () => (withinDays ? addDays(today, withinDays - 1) : null),
    [today, withinDays],
  )

  const upcoming = useMemo(() => {
    const list = entries
      // A run already under way still counts as coming up — it is happening.
      .filter((e) => !e.cancelled && e.end >= today)
      // A multi-day block that STARTS after the window still overlaps it if it
      // is already running, so the window is tested against the start.
      .filter((e) => !until || e.start <= until)
      // Work still to do. A booking already marked Done or Paid is finished,
      // and listing it under what's coming up is noise on the one screen meant
      // to tell you where to go next. Entries Finance holds now carry the same
      // three states as a job (see entries.js), so this no longer treats a
      // settled EPC as outstanding just because it is stored elsewhere.
      .filter((e) => !bookedOnly || !e.status || e.status === 'Booked')
      .sort((a, b) => a.start.localeCompare(b.start) || (a.time || '99').localeCompare(b.time || '99'))
    return limit ? list.slice(0, limit) : list
  }, [entries, today, until, limit, bookedOnly])

  // One bucket per day that actually has work. A run spanning several days
  // appears under each of them — it IS on your Wednesday, even though it
  // started on the Monday — which a flat list ordered by start date hides.
  const byDay = useMemo(() => {
    if (!groupByDay) return []
    const map = new Map()
    for (const e of upcoming) {
      for (const d of e.days || [e.start]) {
        if (d < today || (until && d > until)) continue
        if (!map.has(d)) map.set(d, [])
        map.get(d).push(e)
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')),
        // Properties, not bookings. One entry can carry four addresses, and the
        // rows below now list all four — a "5 jobs" heading over eight lines
        // would be contradicted by the thing directly underneath it. Counted
        // off the same list the rows render and the export sends, so the three
        // can never disagree.
        count: items.reduce((n, e) => n + (e.properties?.length || 1), 0),
      }))
  }, [upcoming, groupByDay, today, until])

  return (
    <Card pad={false}>
      <CardHead title={title} />
      {upcoming.length === 0 ? (
        <EmptyState size="compact">
          {withinDays ? 'Nothing booked in the next week.' : 'Nothing booked yet.'}
        </EmptyState>
      ) : groupByDay ? (
        // One collapsible group per day. <details> rather than useState: it is
        // the browser's own disclosure — keyboard and screen readers already
        // understand it, and it keeps a whole week glanceable on a phone
        // instead of a scroll of forty rows.
        <div className="divide-y divide-line">
          {byDay.map(({ date, items, count }) => (
            <details key={date} open={date === today} className="group">
              <summary
                className={cx(
                  'flex cursor-pointer list-none items-center gap-2 px-4 py-3',
                  'hover:bg-sunken [&::-webkit-details-marker]:hidden',
                  focusRing,
                )}
              >
                <ChevronRight
                  size={15}
                  className="shrink-0 text-ink-mute transition-transform group-open:rotate-90"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {date === today ? 'Today' : dayLabel(date)}
                </span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {count} job{count === 1 ? '' : 's'}
                </span>
              </summary>
              <ul className="divide-y divide-line px-2 pb-1">
                {items.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    showMoney={showMoney}
                    canEdit={canEdit}
                    onOpenJob={onOpenJob}
                    onOpenEntry={onOpenEntry}
                  />
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line px-2 py-1">
          {upcoming.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              showMoney={showMoney}
              canEdit={canEdit}
              showDate
              onOpenJob={onOpenJob}
              onOpenEntry={onOpenEntry}
            />
          ))}
        </ul>
      )}
      {children && <div className="border-t border-line px-4 py-3">{children}</div>}
    </Card>
  )
}
