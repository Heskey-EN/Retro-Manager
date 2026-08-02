import { useMemo, useState } from 'react'
import { Link } from '../router.jsx'
import { ChevronLeft, ChevronRight, Plus, CalendarOff, Clock, MapPin, FileText, Upload } from 'lucide-react'
import { useHubData, gbp, JOB_TYPES, jobTotal, jobUnits, jobPortions } from '../lib/store.js'
import { toISO, fromISO, todayISO, weekStart, addDays, fmtShort, fmtLong, jobDates } from '../lib/dates.js'
import { Modal, StatCard, StatusChip } from '../components/ui.jsx'
import JobModal from '../components/JobModal.jsx'
import ImportCsvModal from '../components/ImportCsvModal.jsx'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Mon-start
  const start = new Date(year, month, 1 - offset)
  const weeks = []
  for (let w = 0; w < 6; w++) {
    const row = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      row.push({ iso: toISO(date), inMonth: date.getMonth() === month })
    }
    weeks.push(row)
  }
  return weeks
}

function JobPill({ job, compact }) {
  const t = JOB_TYPES[job.type] || JOB_TYPES.other
  const units = jobUnits(job)
  // A company week shows its daily rate, not the whole-span assessment count
  const count =
    job.type === 'company'
      ? Number(job.perDay) > 0
        ? ` · ${Number(job.perDay)}/day`
        : ''
      : units > 1
        ? ` ×${units}`
        : ''
  return (
    <div
      className="truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight text-white"
      style={{ backgroundColor: t.color, color: job.type === 'company' ? '#0d1b2a' : undefined }}
      title={`${t.label}${count}${job.customer ? ` — ${job.customer}` : ''} ${jobTotal(job) ? `· ${gbp.format(jobTotal(job))}` : ''}`}
    >
      {compact ? t.label + count : `${job.time ? job.time + ' ' : ''}${job.customer || t.label}${count}`}
    </div>
  )
}

function DayModal({ iso, jobs, onClose, onAdd, onBlock, onEdit }) {
  return (
    <Modal title={fmtLong(iso)} onClose={onClose}>
      {jobs.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">Nothing on this day yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {jobs.map((j) => {
            const t = JOB_TYPES[j.type] || JOB_TYPES.other
            return (
              <li key={j.id}>
                <button onClick={() => onEdit(j)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {j.customer || t.label}
                      {j.type === 'epc' && jobUnits(j) > 1 && (
                        <span className="ml-1.5 text-xs font-bold text-brand-blue">×{jobUnits(j)} EPCs</span>
                      )}
                      {j.type === 'company' && Number(j.perDay) > 0 && (
                        <span className="ml-1.5 text-xs font-bold text-amber-600">{Number(j.perDay)}/day @ {gbp.format(Number(j.perPrice))}</span>
                      )}
                      {j.time && <span className="ml-2 font-normal text-slate-500">{j.time}</span>}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {t.label}
                      {j.address ? ` · ${j.address}` : ''}
                      {j.type === 'company' && j.addresses ? ` · ${j.addresses.split('\n')[0]}…` : ''}
                      {jobTotal(j) ? ` · ${gbp.format(jobTotal(j))}` : ''}
                    </span>
                  </span>
                  <StatusChip status={j.status} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-4 flex gap-2">
        <button onClick={onAdd} className="btn-primary flex-1 rounded-lg !px-4 !py-3">
          <Plus size={16} /> Add job
        </button>
        <button onClick={onBlock} className="btn-outline flex-1 rounded-lg !px-4 !py-3">
          <CalendarOff size={16} /> Block out
        </button>
      </div>
    </Modal>
  )
}

export default function Dashboard() {
  const { jobs } = useHubData()
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [dayOpen, setDayOpen] = useState(null) // ISO date
  const [jobModal, setJobModal] = useState(null) // {job} | {initialDate, type?}
  const [showImport, setShowImport] = useState(false)

  // Map ISO date -> jobs on that date (company blocks expand across their span)
  const byDate = useMemo(() => {
    const map = {}
    for (const j of jobs) {
      for (const d of jobDates(j)) {
        ;(map[d] ||= []).push(j)
      }
    }
    for (const d of Object.keys(map)) map[d].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
    return map
  }, [jobs])

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Stats — portions spread company weeks across their days, so weeks and
  // months that a block straddles each get their true share
  const portions = useMemo(() => jobs.flatMap(jobPortions), [jobs])
  const wkStart = weekStart(today)
  const wkEnd = addDays(wkStart, 6)
  const weekPortions = portions.filter((p) => p.date >= wkStart && p.date <= wkEnd)
  const thisWeekUnits = weekPortions.reduce((s, p) => s + p.units, 0)
  const thisWeekIncome = weekPortions.reduce((s, p) => s + p.income, 0)
  const monthStart = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-01`
  const monthEnd = toISO(new Date(cursor.year, cursor.month + 1, 0))
  const monthIncome = portions
    .filter((p) => p.date >= monthStart && p.date <= monthEnd)
    .reduce((s, p) => s + p.income, 0)
  const unpaid = jobs.filter((j) => j.status === 'done')
  const unpaidUnits = unpaid.reduce((s, j) => s + jobUnits(j), 0)
  const upcoming = jobs
    .filter((j) => j.date >= today && j.type !== 'company')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'))
    .slice(0, 8)
  const nextJob = upcoming[0]

  function changeMonth(delta) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">{fmtLong(today)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setJobModal({ initialDate: today })} className="btn-primary rounded-lg !px-5 !py-3">
            <Plus size={16} /> Add job
          </button>
          <button
            onClick={() => setJobModal({ initialDate: today, type: 'company' })}
            className="btn-outline rounded-lg !px-5 !py-3"
          >
            <CalendarOff size={16} /> Block out
          </button>
          {/* Spreadsheet import lives on the Jobs tab, and only there. This
              button used to run a SECOND importer that wrote into Finance's
              own calendar store — so imported work never reached the Jobs
              tab, and it had no duplicate checking at all. One importer,
              feeding the whole system. */}
          <a href="#/jobs" className="btn-outline rounded-lg !px-5 !py-3" title="Import a spreadsheet on the Jobs tab">
            <Upload size={16} /> Import a spreadsheet
          </a>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="This week"
          value={`${thisWeekUnits} job${thisWeekUnits === 1 ? '' : 's'}`}
          sub={gbp.format(thisWeekIncome)}
        />
        <StatCard label={`Income · ${monthLabel.split(' ')[0]}`} value={gbp.format(monthIncome)} sub="all entries this month" />
        <StatCard
          label="Awaiting payment"
          value={gbp.format(unpaid.reduce((s, j) => s + jobTotal(j), 0))}
          sub={`${unpaidUnits} job${unpaidUnits === 1 ? '' : 's'} done, not paid`}
          accent={unpaid.length ? 'text-accent-orange' : 'text-navy'}
        />
        <StatCard
          label="Next job"
          value={nextJob ? fmtShort(nextJob.date) : '—'}
          sub={nextJob ? `${nextJob.time ? nextJob.time + ' · ' : ''}${nextJob.customer || JOB_TYPES[nextJob.type]?.label}` : 'Nothing booked'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Calendar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{monthLabel}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => changeMonth(-1)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Previous month">
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => {
                  const d = new Date()
                  setCursor({ year: d.getFullYear(), month: d.getMonth() })
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide hover:bg-slate-100"
              >
                Today
              </button>
              <button onClick={() => changeMonth(1)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Next month">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200">
            {grid.flat().map(({ iso, inMonth }) => {
              const dayJobs = byDate[iso] || []
              const isToday = iso === today
              return (
                <button
                  key={iso}
                  onClick={() => setDayOpen(iso)}
                  className={`min-h-[72px] p-1 text-left align-top transition-colors sm:min-h-[84px] ${
                    inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isToday ? 'bg-navy text-white' : ''
                    }`}
                  >
                    {Number(iso.slice(8, 10))}
                  </span>
                  <div className="space-y-0.5">
                    {dayJobs.slice(0, 3).map((j) => (
                      <JobPill key={j.id + iso} job={j} compact={dayJobs.length > 2} />
                    ))}
                    {dayJobs.length > 3 && (
                      <div className="text-[10px] font-bold text-slate-500">+{dayJobs.length - 3} more</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {Object.values(JOB_TYPES).map((t) => (
              <span key={t.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-display text-lg font-bold">Upcoming jobs</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">
              No upcoming jobs. Use <strong>Add job</strong> to book your first one in.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((j) => {
                const t = JOB_TYPES[j.type] || JOB_TYPES.other
                return (
                  <li key={j.id}>
                    <button onClick={() => setJobModal({ job: j })} className="w-full py-2.5 text-left hover:bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="flex-1 truncate text-sm font-semibold">
                          {j.customer || t.label}
                          {jobUnits(j) > 1 && <span className="ml-1.5 text-xs font-bold text-brand-blue">×{jobUnits(j)}</span>}
                        </span>
                        <span className="text-xs font-bold text-slate-500">{jobTotal(j) ? gbp.format(jobTotal(j)) : ''}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 pl-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={12} />{fmtShort(j.date)}{j.time ? `, ${j.time}` : ''}</span>
                        {j.postcode && <span className="flex items-center gap-1"><MapPin size={12} />{j.postcode}</span>}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <Link
            to="/finance"
            className="mt-4 flex items-center justify-center gap-2 rounded-lg border-2 border-slate-200 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-navy hover:text-navy"
          >
            <FileText size={14} /> Finance & invoices
          </Link>
        </div>
      </div>

      {dayOpen && (
        <DayModal
          iso={dayOpen}
          jobs={byDate[dayOpen] || []}
          onClose={() => setDayOpen(null)}
          onAdd={() => { setJobModal({ initialDate: dayOpen }); setDayOpen(null) }}
          onBlock={() => { setJobModal({ initialDate: dayOpen, type: 'company' }); setDayOpen(null) }}
          onEdit={(j) => { setJobModal({ job: j }); setDayOpen(null) }}
        />
      )}

      {jobModal && (
        <JobModal
          job={jobModal.job}
          initialDate={jobModal.initialDate}
          initialType={jobModal.type}
          key={jobModal.job?.id || jobModal.initialDate + (jobModal.type || '')}
          onClose={() => setJobModal(null)}
        />
      )}

      {showImport && <ImportCsvModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
