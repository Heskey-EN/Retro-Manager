import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Receipt, Plus } from 'lucide-react'
import QuickAddJob from './QuickAddJob.jsx'
import QuickAddExpense from './QuickAddExpense.jsx'
import Calendar from '../calendar/Calendar.jsx'
import UpNext from '../calendar/UpNext.jsx'
import { Button, Card } from '../ui'
import { addDays, todayISO, weekStart } from '../lib/dates.js'
import { initManagerLink } from '../business/lib/managerLink.js'
import { useAuth } from '../hooks/useAuth'

// The landing tab, built for a phone first: two big things you can do in a few
// taps, then what's coming up. Everything here writes into the same places the
// full Jobs and Finance tabs use — this is a faster door, not a separate set
// of books.

export default function DashboardSection({ jobs, addJobs, onOpenJob, onToast }) {
  const { configured, isAdmin, canSubmitExpenses } = useAuth()
  // '' = adding for no particular day; an ISO string = adding from a calendar cell.
  const [addJobOpen, setAddJobOpen] = useState(null)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)

  // Anyone who can put money in: admins and local-mode users keep the books,
  // permitted workers log their own spends.
  const mayAddExpense = !configured || isAdmin || canSubmitExpenses

  // Start the job -> Finance sync here too. It used to begin only when the
  // Finance tab was first opened, so a price added from this screen wouldn't
  // reach the books until someone went looking.
  useEffect(() => {
    initManagerLink()
  }, [])

  const today = new Date()
  // todayISO(), not toISOString().slice(0,10) — the latter is YESTERDAY between
  // midnight and 01:00 BST, so these tiles and the calendar below them
  // disagreed about what "today" meant for an hour every summer night.
  const todayIso = todayISO()

  const activeJobs = useMemo(() => jobs.filter((j) => !j.archived), [jobs])

  const stats = useMemo(() => {
    const live = activeJobs.filter((j) => j.status !== 'Cancelled')
    const wkStart = weekStart(todayIso)
    const wkEnd = addDays(wkStart, 6)
    const on = (j, from, to) => {
      const d = j.start_date && String(j.start_date).slice(0, 10)
      return d && d >= from && d <= to
    }
    return {
      today: live.filter((j) => on(j, todayIso, todayIso)).length,
      week: live.filter((j) => on(j, wkStart, wkEnd)).length,
      open: live.length,
    }
  }, [activeJobs, todayIso])

  return (
    <div className="biz font-sans text-ink">
      <div className="container-site py-4 pb-24">
        <header className="mb-4">
          <h1 className="font-display text-2xl font-bold">Today</h1>
          <p className="text-sm text-ink-faint">
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </header>

        {/* The two things you came here to do. Full-width and thumb-sized.
            These are action TILES, not buttons — deliberately card-shaped
            (rounded-xl, the kit Card's radius) rather than Button-shaped,
            because they are the landing page's two big targets. What they no
            longer do is invent their own border and surface: they are a Card
            that happens to be tappable, so they sit in the same family as the
            stat tiles and the calendar below them. */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Card
            as="button"
            tone="ember"
            pad={false}
            onClick={() => setAddJobOpen('')}
            className="flex items-center gap-3 px-4 py-4 text-left active:translate-y-px"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <Briefcase size={22} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold">Add a job</span>
              <span className="block text-xs text-white/80">One, or a whole day's run</span>
            </span>
            <Plus size={20} className="ml-auto shrink-0 opacity-80" />
          </Card>

          {mayAddExpense && (
            <Card
              as="button"
              pad={false}
              onClick={() => setAddExpenseOpen(true)}
              className="flex items-center gap-3 px-4 py-4 text-left active:translate-y-px"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-moss/10 text-moss">
                <Receipt size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-base font-bold">Add an expense</span>
                <span className="block text-xs text-ink-faint">Snap the receipt as you go</span>
              </span>
              <Plus size={20} className="ml-auto shrink-0 text-ink-mute" />
            </Card>
          )}
        </div>

        {/* At a glance. pad={false} on each tile because Card's own p-4 and the
            p-3 wanted here are both utilities — which one wins is decided by
            stylesheet order, not by the order they appear in the className. */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            ['Today', stats.today],
            ['This week', stats.week],
            ['Open jobs', stats.open],
          ].map(([label, value]) => (
            <Card key={label} pad={false} className="p-3 text-center">
              <div className="font-display text-2xl font-bold">{value}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Calendar
            jobs={activeJobs}
            onOpenJob={onOpenJob}
            renderDayActions={(iso) => (
              <Button tone="primary" onClick={() => setAddJobOpen(iso)}>
                <Plus size={16} /> Add a job
              </Button>
            )}
          />
          <UpNext jobs={activeJobs} onOpenJob={onOpenJob} />
        </div>
      </div>

      {addJobOpen != null && (
        <QuickAddJob
          jobs={jobs}
          initialDate={addJobOpen}
          onCreate={addJobs}
          onClose={() => setAddJobOpen(null)}
          onAdded={(n) => onToast?.({ type: 'success', text: `Added ${n} job${n === 1 ? '' : 's'}.` })}
        />
      )}
      {addExpenseOpen && (
        <QuickAddExpense
          onClose={() => setAddExpenseOpen(false)}
          onAdded={(text) => onToast?.({ type: 'success', text: `${text} added.` })}
        />
      )}
    </div>
  )
}
