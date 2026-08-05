import { useMemo, useState } from 'react'
import { Link } from '../router.jsx'
import { Plus, CalendarOff, FileText, Upload } from 'lucide-react'
import { useHubData, gbp, JOB_TYPES, jobTotal, jobUnits, jobPortions } from '../lib/store.js'
import { toISO, todayISO, weekStart, addDays, fmtShort, fmtLong } from '../lib/dates.js'
import { StatCard } from '../components/ui.jsx'
import JobModal from '../components/JobModal.jsx'
import Calendar from '../../calendar/Calendar.jsx'
import UpNext from '../../calendar/UpNext.jsx'
import { Button } from '../../ui'

// Finance's landing page. The calendar and the upcoming list are now the SAME
// components the Dashboard and Jobs tabs render, fed by the real jobs list —
// this page used to draw its own month grid over useHubData(), which is why a
// booking made on the Jobs tab only appeared here once it had a price on it.
//
// The money stats below deliberately still read useHubData(): that snapshot,
// derived rows and all, IS the books. The calendar shows the real job once; the
// stats count its derived money row once. Neither double counts, and changing
// the stats would change the tax figures.
export default function Dashboard({ jobs = [], onOpenJob }) {
  const { jobs: bizJobs } = useHubData()
  const today = todayISO()
  const [cursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [jobModal, setJobModal] = useState(null) // {job} | {initialDate, type?}

  const activeJobs = useMemo(() => jobs.filter((j) => !j.archived), [jobs])
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Stats — portions spread company weeks across their days, so weeks and
  // months that a block straddles each get their true share. These read the
  // business snapshot INCLUDING its derived rows, unchanged: that is the books.
  const portions = useMemo(() => bizJobs.flatMap(jobPortions), [bizJobs])
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
  const unpaid = bizJobs.filter((j) => j.status === 'done')
  const unpaidUnits = unpaid.reduce((s, j) => s + jobUnits(j), 0)
  const nextJob = bizJobs
    .filter((j) => j.date >= today && j.type !== 'company')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'))[0]

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-ink-faint">{fmtLong(today)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" onClick={() => setJobModal({ initialDate: today })}>
            <Plus size={16} /> Add job
          </Button>
          <Button onClick={() => setJobModal({ initialDate: today, type: 'company' })}>
            <CalendarOff size={16} /> Block out
          </Button>
          {/* Spreadsheet import lives on the Jobs tab, and only there. This
              button used to run a SECOND importer that wrote into Finance's
              own calendar store — so imported work never reached the Jobs
              tab, and it had no duplicate checking at all. One importer,
              feeding the whole system. */}
          <Button as="a" href="#/jobs" className="no-underline" title="Import a spreadsheet on the Jobs tab">
            <Upload size={16} /> Import a spreadsheet
          </Button>
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

      {/* grid-cols-1 is load-bearing, not tidiness. With no base track this
          grid fell back to an implicit `auto` column, whose floor is the
          content's MIN-CONTENT width — and a long job address inside a
          `flex-1 truncate` still contributes its unbroken width up the chain.
          The column measured 449px inside a 335px box and pushed the whole
          Finance tab into a horizontal scroll on a phone. minmax(0,1fr) rather
          than 1fr for the same reason on desktop. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* The same calendar as the Dashboard and Jobs tabs, with the three
            actions the old Finance day modal offered kept intact. Finance is
            the one place a Finance entry is editable, so it is the only host
            that passes onOpenEntry. */}
        <Calendar
          jobs={activeJobs}
          onOpenJob={onOpenJob}
          onOpenEntry={(e) => setJobModal({ job: e.source })}
          renderDayActions={(iso) => (
            <>
              <Button tone="primary" onClick={() => setJobModal({ initialDate: iso })}>
                <Plus size={16} /> Add job
              </Button>
              <Button onClick={() => setJobModal({ initialDate: iso, type: 'company' })}>
                <CalendarOff size={16} /> Block out
              </Button>
            </>
          )}
        />

        <UpNext
          jobs={activeJobs}
          title="Upcoming"
          onOpenJob={onOpenJob}
          onOpenEntry={(e) => setJobModal({ job: e.source })}
        >
          <Button as={Link} to="/finance" className="w-full no-underline">
            <FileText size={14} /> Finance &amp; invoices
          </Button>
        </UpNext>
      </div>

      {jobModal && (
        <JobModal
          job={jobModal.job}
          initialDate={jobModal.initialDate}
          initialType={jobModal.type}
          key={jobModal.job?.id || jobModal.initialDate + (jobModal.type || '')}
          onClose={() => setJobModal(null)}
        />
      )}
    </div>
  )
}
