import { useMemo } from 'react'
import { Card, CardHead, EmptyState } from '../ui'
import { todayISO } from '../lib/dates.js'
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

const LIMIT = 6

export default function UpNext({ jobs = [], title = 'Next up', onOpenJob, onOpenEntry, children }) {
  const { entries, showMoney } = useCalendarEntries(jobs)
  const today = todayISO()

  const upcoming = useMemo(
    () =>
      entries
        // A run already under way still counts as coming up — it is happening.
        .filter((e) => !e.cancelled && e.end >= today)
        .sort((a, b) => a.start.localeCompare(b.start) || (a.time || '99').localeCompare(b.time || '99'))
        .slice(0, LIMIT),
    [entries, today],
  )

  return (
    <Card pad={false}>
      <CardHead title={title} />
      {upcoming.length === 0 ? (
        <EmptyState size="compact">Nothing booked yet.</EmptyState>
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
