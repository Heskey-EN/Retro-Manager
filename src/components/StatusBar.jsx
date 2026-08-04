import { useMemo } from 'react'
import { STATUSES, normalizeStatus } from '../lib/status'
import { FilterChip } from '../ui'

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
    <section
      aria-label="Filter by status"
      // The negative margin plus matching padding is not spacing: overflow-x
      // clips, and a focus outline sits 2px OUTSIDE its chip, so without the
      // gutter the ring on the first and last chip would be sliced off.
      // The scrollbar itself is hidden — it is a swipe on a phone, and on a
      // desktop it would sit under the chips as permanent grey furniture.
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <FilterChip active={!activeStatus} count={jobs.length} onClick={() => onSelect(null)}>
        All
      </FilterChip>
      {STATUSES.map((s) => (
        <FilterChip
          key={s.value}
          active={activeStatus === s.value}
          dot={s.color}
          count={counts[s.value]}
          onClick={() => onSelect(activeStatus === s.value ? null : s.value)}
        >
          {s.label}
        </FilterChip>
      ))}
    </section>
  )
}
