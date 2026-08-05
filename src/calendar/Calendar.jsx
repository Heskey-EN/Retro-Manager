import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, Chip, IconButton, SegmentedControl, cx, focusRing } from '../ui'
import { STATUSES } from '../lib/status.js'
import { toISO, todayISO } from '../lib/dates.js'
import { inkOn } from './entries.js'
import { useCalendarEntries } from './useCalendarEntries.js'
import DaySheet from './DaySheet.jsx'
import Timeline from './Timeline.jsx'

// THE calendar. One component, one data source, used by the Dashboard, the
// Jobs tab and Finance — replacing dashboard/UpcomingJobs, components/
// CalendarTimeline and the month grid that lived inside business/pages/
// Dashboard. Those three read three different things, which is why a job you
// had just booked was missing from one of them.
//
// Props:
//   jobs             real jobs. The host filters BEFORE passing.
//   views            ['month'] (default) | ['month','timeline']
//   onOpenJob        (job) => void — the ORIGINAL job object
//   onOpenEntry      (entry) => void — an entry Finance holds was tapped. Only
//                    the Finance tab has an editor for one; omit it and the
//                    row expands to its read-only detail instead.
//   renderDayActions (iso) => ReactNode — buttons in the day sheet's footer
//   filterNote       string — says the view is filtered rather than empty
//
// Adding is NOT gated: booking work is the job of every tier. Changing an
// existing booking is (see useCalendarEntries → canEdit).

const WEEKDAYS = [
  ['M', 'Mon'], ['T', 'Tue'], ['W', 'Wed'], ['T', 'Thu'], ['F', 'Fri'], ['S', 'Sat'], ['S', 'Sun'],
]

const MODE_KEY = 'retrofit.calendarMode'
const MODES = [
  { value: 'month', label: 'Month' },
  { value: 'timeline', label: 'Timeline' },
]

// Monday-start, fixed 6×7 so the grid never changes height between months.
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === month }
  })
}

export default function Calendar({
  jobs = [],
  views = ['month'],
  onOpenJob,
  onOpenEntry,
  renderDayActions,
  filterNote,
}) {
  const { entries, byDate, showMoney, canEdit } = useCalendarEntries(jobs)
  const today = todayISO()

  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)
  // Mirrors how the Jobs tab remembers its sort. Each mount still opens on the
  // current month, which is what you want on a phone.
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(MODE_KEY)
    return views.includes(saved) ? saved : views[0]
  })
  useEffect(() => {
    if (views.length > 1) localStorage.setItem(MODE_KEY, mode)
  }, [mode, views.length])

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
  const changeMonth = (delta) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  // Jobs with no start date are on no calendar at all. Saying so is the whole
  // point — a silently missing job is what this rebuild is fixing.
  const undated = jobs.filter((j) => !j.start_date).length

  // One place decides what tapping a bar does, so the timeline and the day
  // sheet can never disagree. When there is no editor to send it to — this
  // account may not change bookings, or this screen has no editor for that
  // record — it opens the entry's own day, where the row expands read-only.
  const openFromTimeline = (e) => {
    const editor = e.kind === 'job' ? onOpenJob : onOpenEntry
    if (canEdit && editor) (e.kind === 'job' ? onOpenJob(e.source) : onOpenEntry(e))
    else setOpenDay(e.start)
  }

  return (
    <>
      <Card pad={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
          {mode === 'month' && (
            <>
              <h2 className="font-display text-base font-bold text-ink sm:text-lg">{monthLabel}</h2>
              {/* Full 44px targets: these three are the most-tapped controls
                  in the app on a phone, so they are not the place to save
                  vertical space. */}
              <div className="flex items-center gap-0.5">
                <IconButton label="Previous month" onClick={() => changeMonth(-1)}>
                  <ChevronLeft size={18} />
                </IconButton>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date()
                    setCursor({ year: d.getFullYear(), month: d.getMonth() })
                  }}
                  className={cx(
                    'min-h-11 rounded-lg px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em]',
                    'cursor-pointer text-ink-faint transition-colors hover:bg-sunken hover:text-ink',
                    focusRing,
                  )}
                >
                  Today
                </button>
                <IconButton label="Next month" onClick={() => changeMonth(1)}>
                  <ChevronRight size={18} />
                </IconButton>
              </div>
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {filterNote && <Chip tone="ember" size="sm">{filterNote}</Chip>}
            {undated > 0 && (
              <Chip tone="amber" size="sm" title="These jobs have no start date, so they are on no calendar">
                {undated} not dated
              </Chip>
            )}
            {views.length > 1 && (
              <SegmentedControl label="Calendar view" options={MODES} value={mode} onChange={setMode} />
            )}
          </div>
        </div>

        {mode === 'timeline' ? (
          <Timeline entries={entries} onOpen={openFromTimeline} />
        ) : (
          // The mobile gutter and gap are this tight for one measured reason: at
          // 375px the card's inner width is 333px, so px-2/gap-1 gave 41.9px
          // cells — under the 44px tap target. px-1/gap-0.5 gives 44.7px.
          <div className="px-1 pb-3 sm:px-4 sm:pb-4">
            <div className="grid grid-cols-7 gap-0.5 pb-1 sm:gap-1">
              {WEEKDAYS.map(([short, long], i) => (
                <div
                  key={i}
                  className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-mute"
                >
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{long}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {grid.map(({ iso, day, inMonth }) => (
                <DayCell
                  key={iso}
                  iso={iso}
                  day={day}
                  inMonth={inMonth}
                  isToday={iso === today}
                  entries={byDate[iso] || []}
                  onOpen={() => setOpenDay(iso)}
                />
              ))}
            </div>
          </div>
        )}

        {/* The whole legend: four statuses, and nothing about where a booking
            is stored. It used to carry a fifth swatch labelled "Finance
            entries", which answered a question no one on site is asking. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5 sm:px-4">
          {STATUSES.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      </Card>

      {openDay && (
        <DaySheet
          iso={openDay}
          entries={byDate[openDay] || []}
          showMoney={showMoney}
          canEdit={canEdit}
          // Undefined when the host has no editor, never a wrapper around
          // nothing: the row reads "is there somewhere to send this?" off the
          // prop, and a defined no-op would make it a dead button instead of
          // an expanding read-only one.
          onOpenJob={
            onOpenJob
              ? (job) => {
                  setOpenDay(null)
                  onOpenJob(job)
                }
              : undefined
          }
          onOpenEntry={
            onOpenEntry
              ? (e) => {
                  setOpenDay(null)
                  onOpenEntry(e)
                }
              : undefined
          }
          onClose={() => setOpenDay(null)}
          actions={renderDayActions?.(openDay)}
        />
      )}
    </>
  )
}

// One cell. Dots on a phone (a 47px square has room for four and nothing else),
// text chips from 640px up — which is exactly the merge of the two grids that
// existed: the Dashboard's dots were the mobile design, Finance's pills the
// desktop one.
function DayCell({ iso, day, inMonth, isToday, entries, onOpen }) {
  const dots = entries.length > 4 ? entries.slice(0, 3) : entries
  const extra = entries.length - dots.length

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${day} — ${entries.length === 0 ? 'nothing booked' : `${entries.length} booked`}`}
      className={cx(
        'relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg p-1',
        'transition-colors sm:aspect-auto sm:min-h-[84px] sm:items-stretch sm:justify-start',
        entries.length ? 'bg-sunken hover:bg-line' : 'hover:bg-sunken',
        focusRing,
      )}
    >
      <span
        className={cx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          isToday ? 'bg-navy text-white' : inMonth ? 'text-ink' : 'text-ink-mute',
        )}
      >
        {day}
      </span>

      {/* Phone: colour dots. One shape for every booking — the square outline
          that used to mean "this one lives in Finance" is gone. */}
      {entries.length > 0 && (
        <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5 sm:hidden">
          {dots.map((e) => (
            <span
              key={e.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: e.colour, opacity: e.cancelled ? 0.4 : 1 }}
              aria-hidden
            />
          ))}
          {extra > 0 && <span className="font-mono text-[9px] leading-none text-ink-faint">+{extra}</span>}
        </span>
      )}

      {/* 640px up: the same information as words. */}
      {entries.length > 0 && (
        <span className="mt-0.5 hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
          {entries.slice(0, 3).map((e) => (
            <span
              key={e.id}
              className={cx('truncate rounded px-1 py-px text-[10px] font-semibold leading-tight', e.cancelled && 'line-through')}
              style={{ backgroundColor: e.colour, color: inkOn(e.colour), opacity: e.cancelled ? 0.55 : 1 }}
            >
              {e.time ? `${e.time} ` : ''}
              {e.title}
            </span>
          ))}
          {entries.length > 3 && (
            <span className="px-1 text-[10px] font-semibold text-ink-faint">+{entries.length - 3} more</span>
          )}
        </span>
      )}
    </button>
  )
}
