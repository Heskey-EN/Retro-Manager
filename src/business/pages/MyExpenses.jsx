// Worker view (levels 1–2 with the "can add expenses" permission): log an
// expense, see your own submissions. No finances, no invoices, nobody
// else's expenses — those live behind the admin-only Finance tab, and RLS
// keeps it that way even if this UI is bypassed.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Receipt, Loader2 } from 'lucide-react'
import { gbp, EXPENSE_CATEGORIES } from '../lib/store.js'
import { todayISO, fmtDayMonth } from '../lib/dates.js'
import { fetchMyExpenses, submitMyExpense } from '../lib/myExpenses.js'
import { Field, inputCls, StatCard } from '../components/ui.jsx'
import { Button } from '../../ui'
import { useAuth } from '../../hooks/useAuth.js'

export default function MyExpenses() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const blank = { date: todayISO(), category: EXPENSE_CATEGORIES[0], description: '', amount: '' }
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState('')
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!user?.id) return undefined
    let active = true
    fetchMyExpenses(user.id)
      .then((r) => active && setRows(r))
      .catch((err) => active && setLoadError(err.message))
    return () => {
      active = false
    }
  }, [user?.id])

  async function submit(e) {
    e.preventDefault()
    if (!form.amount) return
    setBusy(true)
    setError('')
    try {
      const row = await submitMyExpense(user.id, form)
      setRows((r) => [row, ...(r || [])])
      setAdded(`${form.description || form.category} — ${gbp.format(Number(form.amount))} logged ✔`)
      setForm({ ...blank, date: form.date, category: form.category })
      setTimeout(() => setAdded(''), 3000)
    } catch (err) {
      setError(err.message || "Couldn't save that expense.")
    } finally {
      setBusy(false)
    }
  }

  const thisMonth = (rows || []).filter((x) => x.date?.slice(0, 7) === todayISO().slice(0, 7))
  const monthTotal = thisMonth.reduce((s, x) => s + (Number(x.amount) || 0), 0)

  // Group by calendar month, newest first
  const groups = useMemo(() => {
    const g = new Map()
    for (const x of rows || []) {
      const k = (x.date || '').slice(0, 7)
      if (!g.has(k)) g.set(k, [])
      g.get(k).push(x)
    }
    return [...g.entries()]
  }, [rows])

  const monthLabel = (k) =>
    new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="biz font-sans text-ink">
      <div className="container-site animate-fade-in py-6 pb-16">
        <div className="mb-5">
          <h1 className="font-display text-2xl font-bold">My expenses</h1>
          <p className="text-sm text-ink-faint">
            Log what you've spent and it goes straight to the office — no receipts needed here,
            but hang on to them.
          </p>
        </div>

        <div className="mb-5 rounded-xl border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-display text-lg font-bold">Log an expense</h2>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3 lg:grid-cols-12">
            <Field label="What was it?" className="col-span-2 lg:col-span-4">
              <input className={inputCls} value={form.description} onChange={set('description')} placeholder="e.g. Diesel, parking, materials" />
            </Field>
            <Field label="Amount (£)" className="lg:col-span-2">
              <input type="number" min="0" step="0.01" required className={inputCls} value={form.amount} onChange={set('amount')} placeholder="0.00" />
            </Field>
            <Field label="Date" className="lg:col-span-3">
              <input type="date" required className={inputCls} value={form.date} onChange={set('date')} />
            </Field>
            <Field label="Category" className="lg:col-span-3">
              <select className={inputCls} value={form.category} onChange={set('category')}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <div className="col-span-2 flex items-center gap-3 lg:col-span-12">
              <Button type="submit" tone="primary" disabled={busy} className="lg:px-10">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Log expense
              </Button>
              {added && <span className="text-sm font-semibold text-accent-green">{added}</span>}
              {error && <span className="text-sm font-semibold text-danger">{error}</span>}
            </div>
          </form>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:max-w-md">
          <StatCard label="This month" value={gbp.format(monthTotal)} sub={`${thisMonth.length} logged`} />
          <StatCard label="All time" value={gbp.format((rows || []).reduce((s, x) => s + (Number(x.amount) || 0), 0))} sub={`${rows?.length || 0} logged`} />
        </div>

        <div className="rounded-xl border border-line bg-white shadow-sm lg:max-w-2xl">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-lg font-bold">What you've logged</h2>
          </div>
          {loadError ? (
            <p className="p-4 text-sm font-semibold text-danger">Couldn't load your expenses: {loadError}</p>
          ) : !rows ? (
            <p className="flex items-center gap-2 p-4 text-sm text-ink-faint">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-ink-mute">
              <Receipt size={32} />
              <p className="text-sm">Nothing logged yet — add your first expense above.</p>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {groups.map(([month, items]) => (
                <div key={month}>
                  <div className="sticky top-0 flex items-center justify-between bg-sunken px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
                    <span>{monthLabel(month)}</span>
                    <span>−{gbp.format(items.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {items.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-16 shrink-0 text-xs text-ink-faint">{fmtDayMonth(x.date)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{x.description || x.category}</span>
                          <span className="block text-xs text-ink-faint">{x.category}</span>
                        </span>
                        <span className="text-sm font-bold">−{gbp.format(x.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {rows?.length > 0 && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-mute">
              Spotted a mistake? Ask an admin to fix it — logged expenses can't be edited here.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
