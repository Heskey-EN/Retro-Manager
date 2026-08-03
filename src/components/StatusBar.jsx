import { useMemo } from 'react'
import { STATUSES, normalizeStatus } from '../lib/status'

// Where the assessments stand, as a row of counts you can tap to filter.
//
// This replaced a numbered five-stage pipeline. That graphic implied work
// crawls through a paperwork process; an assessment is really just booked,
// done, or paid — so this shows the counts and gets out of the way. It
// scrolls sideways on a phone rather than shrinking to unreadable chips.
export default function StatusBar({ jobs, activeStatus, onSelect }) {
  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s.value, 0]))
    for (const job of jobs) map[normalizeStatus(job.status)] += 1
    return map
  }, [jobs])

  return (
    <section className="statusbar" aria-label="Filter by status">
      <button
        className={`statusbar__chip${!activeStatus ? ' is-active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="statusbar__n">{jobs.length}</span>
        All
      </button>
      {STATUSES.map((s) => (
        <button
          key={s.value}
          className={`statusbar__chip${activeStatus === s.value ? ' is-active' : ''}`}
          style={{ '--status-color': s.color }}
          onClick={() => onSelect(activeStatus === s.value ? null : s.value)}
          aria-pressed={activeStatus === s.value}
        >
          <span className="statusbar__dot" aria-hidden />
          <span className="statusbar__n">{counts[s.value]}</span>
          {s.label}
        </button>
      ))}
    </section>
  )
}
