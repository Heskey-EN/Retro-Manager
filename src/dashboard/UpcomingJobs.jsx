import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { statusColor, statusLabel } from '../lib/status'
import { jobAddress, jobPostcode, jobCustomer } from '../lib/display'

// What's coming up, in the two ways you want it on a phone: a month grid you
// can thumb through, and a plain list of the next few visits.

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => iso(new Date())

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Monday-start
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { iso: iso(d), day: d.getDate(), inMonth: d.getMonth() === month }
  })
}

const jobTime = (job) => job?.data?.Time || ''

export default function UpcomingJobs({ jobs, onOpen }) {
  const today = todayIso()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)

  const byDate = useMemo(() => {
    const map = {}
    for (const j of jobs) {
      if (j.archived || !j.start_date) continue
      const key = String(j.start_date).slice(0, 10)
      ;(map[key] ||= []).push(j)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (jobTime(a) || '99').localeCompare(jobTime(b) || '99'))
    }
    return map
  }, [jobs])

  const upcoming = useMemo(
    () =>
      jobs
        .filter((j) => !j.archived && j.start_date && String(j.start_date).slice(0, 10) >= today && j.status !== 'Cancelled')
        .sort((a, b) =>
          String(a.start_date).localeCompare(String(b.start_date)) || (jobTime(a) || '99').localeCompare(jobTime(b) || '99'),
        )
        .slice(0, 6),
    [jobs, today],
  )

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const changeMonth = (delta) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const dayJobs = openDay ? byDate[openDay] || [] : []

  return (
    <div className="space-y-4">
      {/* Month grid */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => changeMonth(-1)} className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }) }}
              className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
            >Today</button>
            <button onClick={() => changeMonth(1)} className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {WEEKDAYS.map((d, i) => <div key={i} className="pb-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map(({ iso: key, day, inMonth }) => {
            const list = byDate[key] || []
            const isToday = key === today
            return (
              <button
                key={key}
                onClick={() => list.length && setOpenDay(key)}
                // Square cells with a comfortable tap area on a phone.
                className={`relative aspect-square rounded-lg text-xs font-semibold transition-colors ${
                  inMonth ? 'text-ink' : 'text-slate-300'
                } ${isToday ? 'bg-navy text-white' : list.length ? 'bg-ember/10' : ''} ${list.length ? 'hover:bg-ember/20' : ''}`}
              >
                {day}
                {list.length > 0 && (
                  <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                    {list.slice(0, 3).map((j) => (
                      <span key={j.id} className="h-1 w-1 rounded-full" style={{ backgroundColor: statusColor(j.status) }} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Next few */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-display text-base font-bold">Next up</h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing booked yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((j) => (
              <li key={j.id}>
                <button onClick={() => onOpen?.(j)} className="w-full px-4 py-3 text-left hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor(j.status) }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{jobAddress(j)}</span>
                    <span className="shrink-0 font-mono text-xs text-slate-500">
                      {new Date(`${String(j.start_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4.5 text-xs text-slate-500">
                    {jobTime(j) && <span className="flex items-center gap-1"><Clock size={11} />{jobTime(j)}</span>}
                    {jobPostcode(j) && <span className="flex items-center gap-1"><MapPin size={11} />{jobPostcode(j)}</span>}
                    {jobCustomer(j) && <span className="truncate">{jobCustomer(j)}</span>}
                    <span className="text-slate-400">{statusLabel(j.status)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* A day's jobs */}
      {openDay && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setOpenDay(null)}
        >
          <div className="w-full animate-fade-up rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-bold">
                {new Date(`${openDay}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <button onClick={() => setOpenDay(null)} className="rounded p-1 text-slate-400" aria-label="Close">✕</button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {dayJobs.map((j) => (
                <li key={j.id}>
                  <button onClick={() => { setOpenDay(null); onOpen?.(j) }} className="w-full px-5 py-3 text-left hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor(j.status) }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{jobAddress(j)}</span>
                      {jobTime(j) && <span className="shrink-0 font-mono text-xs text-slate-500">{jobTime(j)}</span>}
                    </div>
                    <span className="block pl-4.5 text-xs text-slate-500">{statusLabel(j.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
