import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Receipt, Plus } from 'lucide-react'
import QuickAddJob from './QuickAddJob.jsx'
import QuickAddExpense from './QuickAddExpense.jsx'
import UpcomingJobs from './UpcomingJobs.jsx'
import { initManagerLink } from '../business/lib/managerLink.js'
import { useAuth } from '../hooks/useAuth'

// The landing tab, built for a phone first: two big things you can do in a few
// taps, then what's coming up. Everything here writes into the same places the
// full Jobs and Finance tabs use — this is a faster door, not a separate set
// of books.

export default function DashboardSection({ jobs, addJobs, onOpenJob, onToast }) {
  const { configured, isAdmin, canSubmitExpenses } = useAuth()
  const [addJobOpen, setAddJobOpen] = useState(false)
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
  const todayIso = today.toISOString().slice(0, 10)

  const stats = useMemo(() => {
    const live = jobs.filter((j) => !j.archived && j.status !== 'Cancelled')
    const startOfWeek = new Date(today)
    const dow = (startOfWeek.getDay() + 6) % 7
    startOfWeek.setDate(startOfWeek.getDate() - dow)
    const weekStart = startOfWeek.toISOString().slice(0, 10)
    const weekEnd = new Date(startOfWeek)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndIso = weekEnd.toISOString().slice(0, 10)
    const on = (j, from, to) => {
      const d = j.start_date && String(j.start_date).slice(0, 10)
      return d && d >= from && d <= to
    }
    return {
      today: live.filter((j) => on(j, todayIso, todayIso)).length,
      week: live.filter((j) => on(j, weekStart, weekEndIso)).length,
      open: live.length,
    }
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="biz font-sans text-ink">
      <div className="container-site py-4 pb-24">
        <header className="mb-4">
          <h1 className="font-display text-2xl font-bold">Today</h1>
          <p className="text-sm text-slate-500">
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </header>

        {/* The two things you came here to do. Full-width and thumb-sized. */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setAddJobOpen(true)}
            className="flex items-center gap-3 rounded-xl bg-ember px-4 py-4 text-left text-white shadow-[0_6px_20px_-8px_rgba(228,87,46,0.7)] active:translate-y-px"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <Briefcase size={22} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold">Add a job</span>
              <span className="block text-xs text-white/80">One, or a whole day's run</span>
            </span>
            <Plus size={20} className="ml-auto shrink-0 opacity-80" />
          </button>

          {mayAddExpense && (
            <button
              onClick={() => setAddExpenseOpen(true)}
              className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-4 text-left shadow-card active:translate-y-px"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-moss/10 text-moss">
                <Receipt size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-base font-bold">Add an expense</span>
                <span className="block text-xs text-slate-500">Snap the receipt as you go</span>
              </span>
              <Plus size={20} className="ml-auto shrink-0 text-slate-300" />
            </button>
          )}
        </div>

        {/* At a glance */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            ['Today', stats.today],
            ['This week', stats.week],
            ['Open jobs', stats.open],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-ink/10 bg-paper-card p-3 text-center shadow-card">
              <div className="font-display text-2xl font-bold">{value}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
            </div>
          ))}
        </div>

        <UpcomingJobs jobs={jobs} onOpen={onOpenJob} />
      </div>

      {addJobOpen && (
        <QuickAddJob
          onCreate={addJobs}
          onClose={() => setAddJobOpen(false)}
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
