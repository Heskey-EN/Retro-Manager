import { useMemo } from 'react'
import { Card, CardHead, EmptyState } from '../ui'
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
export default function UpNext({
  jobs = [], title = 'Next up', withinDays, limit = DEFAULT_LIMIT, bookedOnly = false,
  onOpenJob, onOpenEntry, children,
}) {
  const { entries, showMoney } = useCalendarEntries(jobs)
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
      // Work still to do. A job already marked Done or Paid is finished, and
      // listing it under what's coming up is noise on the one screen meant to
      // tell you where to go next. Business entries have no status and always
      // count as work.
      .filter((e) => !bookedOnly || !e.status || e.status === 'Booked')
      .sort((a, b) => a.start.localeCompare(b.start) || (a.time || '99').localeCompare(b.time || '99'))
    return limit ? list.slice(0, limit) : list
  }, [entries, today, until, limit])

  return (
    <Card pad={false}>
      <CardHead title={title} />
      {upcoming.length === 0 ? (
        <EmptyState size="compact">
          {withinDays ? 'Nothing booked in the next week.' : 'Nothing booked yet.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line px-2 py-1">
          {upcoming.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              showMoney={showMoney}
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
