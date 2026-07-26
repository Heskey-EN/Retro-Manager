import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Search, Receipt, Paperclip, X, Download, FileText } from 'lucide-react'
import {
  useHubData, gbp, addExpense, updateExpense, deleteExpense, accountOf, ACCOUNTS, EXPENSE_CATEGORIES,
} from '../lib/store.js'
import { fileToReceipt, putReceipt, getReceipt, deleteReceipt } from '../lib/receipts.js'
import { todayISO, taxYearFor, isWithin, fmtDayMonth } from '../lib/dates.js'
import { Modal, Field, inputCls, StatCard } from '../components/ui.jsx'

// Brand-led categorical palette — anchored on the Eco Futures family
// (ember / navy / moss / amber) with harmonious supporting hues so the
// slices stay distinguishable without drifting off-brand.
const CATEGORY_COLORS = {
  'Fuel & Mileage': '#E4572E', // ember
  'Equipment & Tools': '#0D1B2A', // navy
  'Software & Subscriptions': '#2C6E9C', // thermal cool (blue)
  'Insurance': '#2E7D4F', // moss
  'Training & Accreditation': '#E8B23A', // amber
  'Phone & Internet': '#B83C18', // ember deep
  'Accountancy': '#1F5E39', // moss deep
  'Marketing': '#F0703F', // ember soft
  'Other': '#6B7885', // ink faint
  'Job costs': '#3E77A8', // booking blue — entries synced from the Jobs tab
}

const RECEIPT_ACCEPT = 'image/*,application/pdf'

// Full-screen receipt viewer — lazily loads the image/PDF out of IndexedDB
function ReceiptViewer({ receiptId, name, type, onClose }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    getReceipt(receiptId)
      .then((d) => live && (d ? setSrc(d) : setFailed(true)))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [receiptId])

  const isPdf = type === 'application/pdf' || (name || '').toLowerCase().endsWith('.pdf')

  return (
    <Modal title={name || 'Receipt'} onClose={onClose} wide>
      {failed ? (
        <p className="py-8 text-center text-sm text-slate-500">Couldn’t load this receipt.</p>
      ) : !src ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {isPdf ? (
            <iframe title={name || 'Receipt'} src={src} className="h-[70vh] w-full rounded-lg border border-slate-200" />
          ) : (
            <img src={src} alt={name || 'Receipt'} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
          )}
          <a href={src} download={name || 'receipt'} className="btn-outline w-full rounded-lg !py-2.5 !text-xs">
            <Download size={14} /> Download
          </a>
        </div>
      )}
    </Modal>
  )
}

// Small "attach / view / remove" control shared by the add + edit forms.
// `value` = { receiptId, receiptName, receiptType }; `onChange` reports changes.
function ReceiptControl({ value, onChange, onView, busy, setBusy, error, setError }) {
  const fileRef = useRef(null)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const dataUrl = await fileToReceipt(file)
      const id = crypto.randomUUID()
      await putReceipt(id, dataUrl)
      if (value?.receiptId) deleteReceipt(value.receiptId) // drop the one it replaces
      onChange({ receiptId: id, receiptName: file.name, receiptType: file.type })
    } catch (err) {
      setError(err.message || 'Could not save that receipt.')
    } finally {
      setBusy(false)
    }
  }

  function remove() {
    if (value?.receiptId) deleteReceipt(value.receiptId)
    onChange({ receiptId: null, receiptName: null, receiptType: null })
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept={RECEIPT_ACCEPT} className="hidden" onChange={pick} />
      {value?.receiptId ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Paperclip size={14} className="shrink-0 text-accent-green" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{value.receiptName || 'Receipt attached'}</span>
          {onView && (
            <button type="button" onClick={onView} className="text-xs font-bold uppercase tracking-wide text-brand-blue hover:underline">
              View
            </button>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:underline">
            Replace
          </button>
          <button type="button" onClick={remove} className="text-slate-400 hover:text-red-600" title="Remove receipt">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:border-brand-blue hover:text-brand-blue disabled:opacity-50"
        >
          <Paperclip size={14} /> {busy ? 'Saving…' : 'Attach receipt (photo or PDF)'}
        </button>
      )}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}

function AddExpenseCard() {
  const blank = { date: todayISO(), category: EXPENSE_CATEGORIES[0], description: '', amount: '', account: 'business' }
  const [form, setForm] = useState(blank)
  const [receipt, setReceipt] = useState({ receiptId: null, receiptName: null, receiptType: null })
  const [added, setAdded] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit(e) {
    e.preventDefault()
    if (!form.amount) return
    addExpense({ ...form, amount: Number(form.amount), ...receipt })
    setAdded(`${form.description || form.category} — ${gbp.format(Number(form.amount))} added ✔`)
    setForm({ ...blank, date: form.date, category: form.category, account: form.account })
    setReceipt({ receiptId: null, receiptName: null, receiptType: null }) // receipt now owned by the saved expense
    setTimeout(() => setAdded(''), 3000)
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-display text-lg font-bold">Add an expense</h2>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        <Field label="What was it?" className="col-span-2 lg:col-span-4">
          <input className={inputCls} value={form.description} onChange={set('description')} placeholder="e.g. Diesel, ladder, insurance" />
        </Field>
        <Field label="Amount (£)" className="lg:col-span-2">
          <input type="number" min="0" step="0.01" required className={inputCls} value={form.amount} onChange={set('amount')} placeholder="0.00" />
        </Field>
        <Field label="Date" className="lg:col-span-2">
          <input type="date" required className={inputCls} value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Category" className="lg:col-span-2">
          <select className={inputCls} value={form.category} onChange={set('category')}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Paid from" className="lg:col-span-2">
          <select className={inputCls} value={form.account} onChange={set('account')}>
            <option value="business">Eco Futures</option>
            <option value="personal">Personal</option>
          </select>
        </Field>
        <div className="col-span-2 lg:col-span-6">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Receipt</span>
          <ReceiptControl value={receipt} onChange={setReceipt} busy={busy} setBusy={setBusy} error={error} setError={setError} />
        </div>
        <div className="col-span-2 flex items-end lg:col-span-6">
          <button type="submit" disabled={busy} className="btn-primary w-full rounded-lg !py-3 disabled:opacity-50 lg:w-auto lg:!px-10">
            <Plus size={16} /> Add expense
          </button>
          {added && <span className="ml-3 self-center text-sm font-semibold text-accent-green">{added}</span>}
        </div>
      </form>
    </div>
  )
}

function EditExpenseModal({ expense, onView, onClose }) {
  const [form, setForm] = useState({ ...expense, amount: String(expense.amount) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Costs synced from the Jobs tab aren't edited here — the job's costing is
  // the source of truth and Finance follows it automatically.
  if (expense._linked) {
    return (
      <Modal title="Synced from the Jobs tab" onClose={onClose}>
        <p className="text-sm text-slate-500">
          This cost comes from the costing on <strong>{expense._linkedJob || 'a job'}</strong> in
          the Jobs tab. Edit the job's costing there and Finance updates automatically.
        </p>
        <a href="#/" className="btn-primary mt-4 w-full rounded-lg">
          Open the Jobs tab
        </a>
      </Modal>
    )
  }

  // Receipt changes persist immediately (so Remove/Replace just work); the
  // text fields save on "Save changes".
  function onReceiptChange(patch) {
    setForm((f) => ({ ...f, ...patch }))
    updateExpense(expense.id, patch)
  }

  function submit(e) {
    e.preventDefault()
    updateExpense(expense.id, { ...form, amount: Number(form.amount) || 0 })
    onClose()
  }

  function remove() {
    if (window.confirm('Delete this expense?')) {
      deleteExpense(expense.id) // also removes its receipt
      onClose()
    }
  }

  return (
    <Modal title="Edit expense" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="What was it?">
          <input className={inputCls} value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (£)">
            <input type="number" min="0" step="0.01" required className={inputCls} value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Date">
            <input type="date" required className={inputCls} value={form.date} onChange={set('date')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className={inputCls} value={form.category} onChange={set('category')}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Paid from">
            <select className={inputCls} value={form.account || 'business'} onChange={set('account')}>
              <option value="business">Eco Futures</option>
              <option value="personal">Personal</option>
            </select>
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Receipt</span>
          {expense._team ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Logged by <strong>{expense._teamBy}</strong> — receipts stay on the device that
              logged the expense, so there's nothing to attach here.
            </p>
          ) : (
            <ReceiptControl
              value={form}
              onChange={onReceiptChange}
              onView={form.receiptId ? () => onView(form) : null}
              busy={busy}
              setBusy={setBusy}
              error={error}
              setError={setError}
            />
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={remove} className="rounded-lg border-2 border-red-200 px-3 text-red-600 hover:bg-red-50" title="Delete">
            <Trash2 size={16} />
          </button>
          <button type="submit" className="btn-primary flex-1 rounded-lg">Save changes</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Expenses() {
  const { expenses } = useHubData()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [account, setAccount] = useState('all')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null) // { receiptId, receiptName, receiptType }

  const today = todayISO()
  const ty = taxYearFor(today)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses
      .filter((x) => (account === 'all' ? true : accountOf(x) === account))
      .filter((x) => (category === 'all' ? true : x.category === category))
      .filter((x) => !q || `${x.description} ${x.category}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [expenses, search, category, account])

  // Group the filtered list by calendar month, newest first
  const groups = useMemo(() => {
    const g = new Map()
    for (const x of filtered) {
      const k = x.date.slice(0, 7)
      if (!g.has(k)) g.set(k, [])
      g.get(k).push(x)
    }
    return [...g.entries()]
  }, [filtered])

  const tyExpenses = expenses.filter((x) => isWithin(x.date, ty.start, ty.end))
  const tyTotal = tyExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const thisMonth = expenses.filter((x) => x.date.slice(0, 7) === today.slice(0, 7))
  const monthTotal = thisMonth.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const withReceipts = expenses.filter((x) => x.receiptId).length

  const catTotals = useMemo(() => {
    const m = new Map()
    for (const x of tyExpenses) m.set(x.category, (m.get(x.category) || 0) + (Number(x.amount) || 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [tyExpenses]) // eslint-disable-line react-hooks/exhaustive-deps
  const maxCat = catTotals[0]?.[1] || 1

  const monthLabel = (k) =>
    new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">Expenses</h1>
        <p className="text-sm text-slate-500">Every pound you spend comes off your profit — and your tax bill. Attach receipts to keep HMRC happy.</p>
      </div>

      <AddExpenseCard />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Tax year ${ty.label}`} value={gbp.format(tyTotal)} sub={`${tyExpenses.length} expense${tyExpenses.length === 1 ? '' : 's'}`} accent="text-red-600" />
        <StatCard label="This month" value={gbp.format(monthTotal)} sub={`${thisMonth.length} added`} accent="text-red-600" />
        <StatCard label="With receipts" value={`${withReceipts}/${expenses.length}`} sub="have a photo attached" />
        <StatCard label="All time" value={gbp.format(expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0))} sub={`${expenses.length} recorded`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* List */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <div className="relative min-w-[160px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} !pl-8`}
                placeholder="Search expenses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className={`${inputCls} !w-auto`} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className={`${inputCls} !w-auto`} value={account} onChange={(e) => setAccount(e.target.value)} title="Cost centre">
              <option value="all">Both pots</option>
              <option value="business">{ACCOUNTS.business}</option>
              <option value="personal">{ACCOUNTS.personal}</option>
            </select>
          </div>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-slate-400">
              <Receipt size={32} />
              <p className="text-sm">
                {expenses.length === 0 ? 'No expenses yet — add your first one above.' : 'Nothing matches those filters.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {groups.map(([month, items]) => (
                <div key={month}>
                  <div className="sticky top-0 flex items-center justify-between bg-slate-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <span>{monthLabel(month)}</span>
                    <span>−{gbp.format(items.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {items.map((x) => (
                      <li key={x.id} className="flex items-center hover:bg-slate-50">
                        <button onClick={() => setEditing(x)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[x.category] || '#64748b' }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{x.description || x.category}</span>
                            <span className="block text-xs text-slate-500">
                              {fmtDayMonth(x.date)} · {x.category}
                              {accountOf(x) === 'personal' && <span className="ml-1 font-bold text-brand-blue">· Personal</span>}
                              {x._team && <span className="ml-1 font-bold text-moss">· logged by {x._teamBy}</span>}
                              {x._linked && <span className="ml-1 font-bold" style={{ color: '#3E77A8' }}>· from Jobs tab</span>}
                            </span>
                          </span>
                          <span className="text-sm font-bold">−{gbp.format(x.amount)}</span>
                        </button>
                        <button
                          onClick={() => (x.receiptId ? setViewing(x) : setEditing(x))}
                          className={`px-3 py-2.5 ${x.receiptId ? 'text-accent-green hover:text-navy' : 'text-slate-300 hover:text-brand-blue'}`}
                          title={x.receiptId ? 'View receipt' : 'No receipt — add one'}
                        >
                          <Paperclip size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-display text-lg font-bold">Where it goes · {ty.label}</h2>
          {catTotals.length === 0 ? (
            <p className="text-sm text-slate-500">Add expenses and you'll see the breakdown here.</p>
          ) : (
            <div className="space-y-3">
              {catTotals.map(([cat, total]) => (
                <div key={cat}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold">{cat}</span>
                    <span className="font-bold text-slate-500">{gbp.format(total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(4, (total / maxCat) * 100)}%`, backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditExpenseModal
          expense={editing}
          key={editing.id}
          onView={(x) => setViewing(x)}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing?.receiptId && (
        <ReceiptViewer
          receiptId={viewing.receiptId}
          name={viewing.receiptName}
          type={viewing.receiptType}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
