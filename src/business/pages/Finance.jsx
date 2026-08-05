import { useMemo, useState } from 'react'
import { Link, useNavigate } from '../router.jsx'
import { Trash2, Receipt, FileText, Eye, Briefcase, Info, Download } from 'lucide-react'
import {
  useHubData, gbp, deleteInvoice, updateInvoice,
  createInvoice, invoiceTotal, jobTotal, jobUnits, jobPortions, accountOf, ACCOUNTS,
  JOB_TYPES,
} from '../lib/store.js'
import { buildExportCsv } from '../lib/csv.js'
import { todayISO, weekStart, addDays, fmtDayMonth, taxYearFor, isWithin } from '../lib/dates.js'
import { calcTax, setAsideRate, TAX_RATES } from '../lib/tax.js'
import { Modal, Field, inputCls, StatCard } from '../components/ui.jsx'
import JobModal from '../components/JobModal.jsx'
import { Button, Card, CardHead, FilterChip, IconButton } from '../../ui'

function InvoiceModal({ jobs, onClose }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    date: todayISO(),
    customerName: '',
    customerAddress: '',
    jobId: '',
    notes: 'Payment due within 14 days. Thank you for your business.',
  })
  const [items, setItems] = useState([{ description: 'Energy Performance Certificate (EPC)', qty: 1, unitPrice: '' }])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function pickJob(e) {
    const jobId = e.target.value
    const j = jobs.find((x) => x.id === jobId)
    setForm((f) => ({
      ...f,
      jobId,
      customerName: j?.customer || f.customerName,
      customerAddress: j ? [j.address, j.postcode].filter(Boolean).join(', ') : f.customerAddress,
    }))
    if (!j) return
    if (j.type === 'company' && Number(j.perDay) > 0 && Number(j.perPrice) > 0) {
      // Company week at a day rate: one line, qty = total assessments
      const span = j.endDate && j.endDate > j.date ? `${fmtDayMonth(j.date)} – ${fmtDayMonth(j.endDate)}` : fmtDayMonth(j.date)
      setItems([{ description: `Assessments ${span} (${Number(j.perDay)} per day)`, qty: jobUnits(j), unitPrice: j.perPrice }])
    } else if (j.type === 'company') {
      setItems([{ description: `Company work — ${fmtDayMonth(j.date)}${j.endDate ? ` – ${fmtDayMonth(j.endDate)}` : ''}`, qty: 1, unitPrice: j.price || '' }])
    } else {
      setItems([
        {
          description: `${JOB_TYPES[j.type]?.label || 'Job'}${j.address ? ` — ${j.address}` : ''}`,
          qty: 1,
          unitPrice: j.price || '',
        },
        // EPC batches: one line per extra property
        ...(j.moreEpcs || []).map((x) => ({
          description: `EPC${x.address ? ` — ${x.address}` : ''}`,
          qty: 1,
          unitPrice: x.price || '',
        })),
      ])
    }
  }

  const setItem = (i, k) => (e) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: e.target.value } : it)))
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)

  function submit(e) {
    e.preventDefault()
    const id = createInvoice({
      ...form,
      items: items
        .filter((it) => it.description || it.unitPrice)
        .map((it) => ({ ...it, qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 })),
    })
    onClose()
    navigate(`/invoice/${id}`)
  }

  return (
    <Modal title="New invoice" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fill from a job (optional)">
            <select className={inputCls} value={form.jobId} onChange={pickJob}>
              <option value="">— Start blank —</option>
              {[...jobs]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 40)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {fmtDayMonth(j.date)} · {j.customer || JOB_TYPES[j.type]?.label}
                    {jobUnits(j) > 1 ? ` ×${jobUnits(j)}` : ''} {jobTotal(j) ? `· ${gbp.format(jobTotal(j))}` : ''}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Invoice date">
            <input type="date" required className={inputCls} value={form.date} onChange={set('date')} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bill to — name">
            <input required className={inputCls} value={form.customerName} onChange={set('customerName')} />
          </Field>
          <Field label="Bill to — address">
            <input className={inputCls} value={form.customerAddress} onChange={set('customerAddress')} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Line items</span>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_110px_auto] gap-2">
                <input className={inputCls} placeholder="Description" value={it.description} onChange={setItem(i, 'description')} />
                <input type="number" min="1" className={inputCls} value={it.qty} onChange={setItem(i, 'qty')} title="Qty" />
                <input type="number" min="0" step="0.01" className={inputCls} placeholder="£ each" value={it.unitPrice} onChange={setItem(i, 'unitPrice')} />
                <IconButton
                  label="Remove this line"
                  tone="danger"
                  onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                  disabled={items.length === 1}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            tone="ghost"
            className="mt-2"
            onClick={() => setItems((arr) => [...arr, { description: '', qty: 1, unitPrice: '' }])}
          >
            + Add line
          </Button>
        </div>

        <Field label="Notes / payment terms">
          <textarea className={inputCls} rows={2} value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <div className="text-sm text-ink-faint">
            Total: <span className="font-display text-lg font-bold text-navy">{gbp.format(total)}</span>
          </div>
          <Button type="submit" tone="primary">Create invoice</Button>
        </div>
      </form>
    </Modal>
  )
}

function downloadExport(jobs, expenses) {
  const blob = new Blob([buildExportCsv(jobs, expenses)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `eco-futures-earnings-expenses-${todayISO()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Finance() {
  const { jobs, expenses, invoices } = useHubData()
  const [showJobModal, setShowJobModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showAllWeeks, setShowAllWeeks] = useState(false)
  const [account, setAccount] = useState('all') // 'all' | 'business' | 'personal'

  const today = todayISO()
  const currentTy = taxYearFor(today)

  // Every tax year that has data, newest first, so imported history is viewable
  const tyOptions = useMemo(() => {
    const map = new Map([[currentTy.start, currentTy]])
    for (const d of [...jobs.map((j) => j.date), ...expenses.map((x) => x.date)]) {
      const t = taxYearFor(d)
      map.set(t.start, t)
    }
    return [...map.values()].sort((a, b) => b.start.localeCompare(a.start))
  }, [jobs, expenses, currentTy.start]) // eslint-disable-line react-hooks/exhaustive-deps

  const [tyStart, setTyStart] = useState(currentTy.start)
  const ty = tyOptions.find((t) => t.start === tyStart) || currentTy
  const isCurrentTy = ty.start === currentTy.start
  // Past tax years count the whole year; the current one counts up to today
  const upTo = isCurrentTy ? today : ty.end

  // Cost-centre filter — everything below (stats, weeks, expenses) follows it
  const fJobs = account === 'all' ? jobs : jobs.filter((j) => accountOf(j) === account)
  const fExpenses = account === 'all' ? expenses : expenses.filter((x) => accountOf(x) === account)

  // Tax-year figures — portions spread company weeks across their days, so
  // only days worked up to the cut-off count towards income
  const tyPortions = fJobs.flatMap(jobPortions).filter((p) => isWithin(p.date, ty.start, upTo))
  const income = tyPortions.reduce((s, p) => s + p.income, 0)
  const tyJobUnits = tyPortions.reduce((s, p) => s + p.units, 0)
  const tyExpenses = fExpenses.filter((x) => isWithin(x.date, ty.start, upTo))
  const spent = tyExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const profit = income - spent

  const daysElapsed = Math.max(1, Math.round((new Date(upTo) - new Date(ty.start)) / 86400000) + 1)
  const projectedProfit = isCurrentTy ? (profit / daysElapsed) * 365 : profit
  const tax = calcTax(profit)
  const rate = setAsideRate(projectedProfit)

  // Week-by-week table (Mon-start weeks across the tax year, newest first)
  const weekRows = useMemo(() => {
    const rows = new Map()
    const ensure = (wk) => {
      if (!rows.has(wk)) rows.set(wk, { wk, jobs: 0, income: 0, expenses: 0 })
      return rows.get(wk)
    }
    for (const j of fJobs) {
      for (const p of jobPortions(j)) {
        if (!isWithin(p.date, ty.start, ty.end)) continue
        const r = ensure(weekStart(p.date))
        r.jobs += p.units
        r.income += p.income
      }
    }
    for (const x of fExpenses) {
      if (!isWithin(x.date, ty.start, ty.end)) continue
      ensure(weekStart(x.date)).expenses += Number(x.amount) || 0
    }
    if (isCurrentTy) ensure(weekStart(today)) // always show the current week
    return [...rows.values()].sort((a, b) => b.wk.localeCompare(a.wk))
  }, [jobs, expenses, account, ty.start, ty.end, isCurrentTy, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleWeeks = showAllWeeks ? weekRows : weekRows.slice(0, 8)
  const sortedExpenses = [...fExpenses].sort((a, b) => b.date.localeCompare(a.date))
  const sortedInvoices = [...invoices].sort((a, b) => b.date.localeCompare(a.date))
  const unpaidInvoices = invoices.filter((i) => i.status !== 'paid')

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Finance &amp; costs</h1>
          <p className="flex items-center gap-2 text-sm text-ink-faint">
            Tax year
            {/* text-base until sm: iOS Safari zooms the whole page when a
                control under 16px takes focus, and it does not zoom back. */}
            <select
              value={ty.start}
              onChange={(e) => setTyStart(e.target.value)}
              className="min-h-11 rounded-lg border border-line-strong px-2 py-1 text-base font-bold text-navy focus:border-brand-blue focus:outline-none sm:min-h-0 sm:text-sm"
            >
              {tyOptions.map((t) => (
                <option key={t.start} value={t.start}>{t.label}</option>
              ))}
            </select>
            · 6 Apr – 5 Apr
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => downloadExport(jobs, expenses)}
            title="Download every earning and expense as a spreadsheet"
          >
            <Download size={16} /> Spreadsheet
          </Button>
          <Button onClick={() => setShowJobModal(true)}>
            <Briefcase size={16} /> Add assessment
          </Button>
          <Button tone="primary" onClick={() => setShowInvoiceModal(true)}>
            <FileText size={16} /> New invoice
          </Button>
        </div>
      </div>

      {/* Cost-centre filter */}
      {/* The same FilterChip the Jobs tab filters status with — one "tap to
          narrow the list" control in the app rather than one per section. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          ['all', 'Everything'],
          ['business', ACCOUNTS.business],
          ['personal', ACCOUNTS.personal],
        ].map(([key, label]) => (
          <FilterChip key={key} active={account === key} onClick={() => setAccount(key)}>
            {label}
          </FilterChip>
        ))}
        {account !== 'all' && (
          <span className="text-xs text-ink-mute">showing {ACCOUNTS[account]} money only</span>
        )}
      </div>

      {/* Tax year summary */}
      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={`Income · ${ty.label}`} value={gbp.format(income)} sub={`${tyJobUnits} job${tyJobUnits === 1 ? '' : 's'} so far`} />
        <StatCard label="Expenses" value={gbp.format(spent)} sub={`${tyExpenses.length} recorded`} />
        <StatCard label="Profit" value={gbp.format(profit)} accent={profit >= 0 ? 'text-accent-green' : 'text-danger'} />
        <StatCard label="Est. tax + NI" value={gbp.format(tax.total)} sub={`tax ${gbp.format(tax.incomeTax)} · NI ${gbp.format(tax.ni)}`} accent="text-accent-orange" />
        <StatCard label="In your pocket" value={gbp.format(tax.takeHome)} sub={rate > 0 ? `set aside ~${Math.round(rate * 100)}% of profit` : 'under the tax-free allowance'} accent="text-accent-green" />
      </div>
      <p className="mb-6 flex items-start gap-1.5 text-xs text-ink-mute">
        <Info size={13} className="mt-0.5 shrink-0" />
        Estimates based on {TAX_RATES.yearLabel} sole-trader rates (personal allowance £12,570, income tax + Class 4 NI on profits).
        Your actual bill via Self Assessment may differ — not tax advice.
      </p>

      {/* Week by week */}
      <Card pad={false} className="mb-6 overflow-hidden">
        <CardHead title="Week by week" />
        {/* The table keeps its own horizontal scroll — seven money columns
            cannot fit 375px, and the page itself must never scroll sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2">Week commencing</th>
                <th className="px-4 py-2 text-right">Jobs</th>
                <th className="px-4 py-2 text-right">Income</th>
                <th className="px-4 py-2 text-right">Expenses</th>
                <th className="px-4 py-2 text-right">Profit</th>
                <th className="px-4 py-2 text-right">Set aside (~{Math.round(rate * 100)}%)</th>
                <th className="px-4 py-2 text-right">In your pocket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleWeeks.map((r) => {
                const wkProfit = r.income - r.expenses
                const setAside = Math.max(0, wkProfit * rate)
                const isCurrent = r.wk === weekStart(today)
                return (
                  <tr key={r.wk} className={isCurrent ? 'bg-ember-wash/60' : ''}>
                    <td className="px-4 py-2.5 font-semibold">
                      {fmtDayMonth(r.wk)} – {fmtDayMonth(addDays(r.wk, 6))}
                      {isCurrent && <span className="ml-2 rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase text-white">This week</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">{r.jobs}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{gbp.format(r.income)}</td>
                    <td className="px-4 py-2.5 text-right text-danger">{r.expenses ? `−${gbp.format(r.expenses)}` : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${wkProfit < 0 ? 'text-danger' : ''}`}>{gbp.format(wkProfit)}</td>
                    <td className="px-4 py-2.5 text-right text-accent-orange">{setAside ? gbp.format(setAside) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-accent-green">{gbp.format(wkProfit - setAside)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {weekRows.length > 8 && (
          <Button
            tone="ghost"
            onClick={() => setShowAllWeeks((v) => !v)}
            className="w-full rounded-none border-x-0 border-b-0 border-t-line"
          >
            {showAllWeeks ? 'Show recent weeks only' : `Show all ${weekRows.length} weeks`}
          </Button>
        )}
      </Card>

      {/* grid-cols-1 base: see the note in business/pages/Dashboard.jsx. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expenses (recent — managed on the Expenses tab) */}
        <Card pad={false}>
          <CardHead title="Recent expenses">
            <Button as={Link} to="/expenses" size="sm" tone="ghost" className="no-underline">
              Add &amp; manage →
            </Button>
          </CardHead>
          <div className="p-3">
            {sortedExpenses.length === 0 ? (
              <p className="px-1 py-4 text-sm text-ink-faint">
                No expenses yet — head to the <Link to="/expenses" className="font-bold text-ember-deep">Expenses tab</Link> to add fuel, kit, insurance…
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {sortedExpenses.slice(0, 6).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-1 py-2">
                    <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-ink-faint">{fmtDayMonth(x.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{x.description || x.category}</span>
                      <span className="block text-xs text-ink-faint">
                        {x.category}
                        {accountOf(x) === 'personal' && <span className="ml-1.5 font-bold text-ember-deep">· Personal</span>}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">−{gbp.format(x.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Invoices */}
        <Card pad={false}>
          <CardHead title="Invoices">
            {unpaidInvoices.length > 0 && (
              <span className="font-mono text-xs font-bold tabular-nums text-accent-orange">
                {gbp.format(unpaidInvoices.reduce((s, i) => s + invoiceTotal(i), 0))} outstanding
              </span>
            )}
          </CardHead>
          <div className="p-3">
            {sortedInvoices.length === 0 ? (
              <p className="px-1 py-4 text-sm text-ink-faint">
                No invoices yet — hit <strong>New invoice</strong> and it'll fill itself in from a job.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {sortedInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 px-1 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {inv.number} · {inv.customerName}
                      </span>
                      <span className="block text-xs text-ink-faint">{fmtDayMonth(inv.date)} · {gbp.format(invoiceTotal(inv))}</span>
                    </span>
                    {/* Not the kit's Select wrapper: this is a bare control in a
                        dense row, where the 44px field height would set the row
                        height for the whole list. It is still 16px and 44px on
                        a phone — below 16px iOS zooms the page on focus and
                        never zooms back — and only goes dense from sm up. */}
                    <select
                      value={inv.status}
                      onChange={(e) => updateInvoice(inv.id, { status: e.target.value })}
                      className="min-h-11 shrink-0 rounded-lg border border-line-strong bg-paper-card px-2 py-1 text-base font-semibold text-ink sm:min-h-0 sm:text-xs"
                      title="Invoice status"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                    </select>
                    <IconButton as={Link} to={`/invoice/${inv.id}`} label="View / print" size="sm">
                      <Eye size={16} />
                    </IconButton>
                    <IconButton
                      label="Delete invoice"
                      tone="danger"
                      size="sm"
                      onClick={() => window.confirm('Delete this invoice?') && deleteInvoice(inv.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {showJobModal && <JobModal onClose={() => setShowJobModal(false)} />}
      {showInvoiceModal && <InvoiceModal jobs={jobs} onClose={() => setShowInvoiceModal(false)} />}
    </div>
  )
}
