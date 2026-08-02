import { useMemo, useState } from 'react'
import { Loader2, MapPin, Plus, Trash2, Copy, Check, Share2, Route } from 'lucide-react'
import { Modal, Field } from '../business/components/ui.jsx'
import { DEFAULT_STATUS } from '../lib/status'
import { planRoute, customerMessage, looksLikePostcode, normalisePostcode } from '../lib/route'

// Adding work from a phone, in the two shapes it actually arrives:
//   ONE  — a single booking, typed in ten seconds.
//   MANY — a batch of addresses for one day, put in a sensible driving order
//          with a time slot each and a message ready to send to every customer.

// 16px inputs: anything smaller makes iOS zoom the page on focus.
const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue'

const todayIso = () => new Date().toISOString().slice(0, 10)

// "Auto" picks the next free slot on the chosen day: an hour after the last
// job already booked that day, or 09:00 if the day is empty. Shown in the UI
// before saving, so it's a suggestion you can see rather than a surprise.
const DAY_STARTS_AT = '09:00'
const SLOT_MINUTES = 60
function autoTimeFor(dateIso, jobs) {
  const taken = (jobs || [])
    .filter((j) => !j.archived && String(j.start_date || '').slice(0, 10) === dateIso)
    .map((j) => j?.data?.Time)
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t || ''))
    .map((t) => {
      const [h, m] = t.split(':')
      return Number(h) * 60 + Number(m)
    })
  if (!taken.length) return DAY_STARTS_AT
  const next = Math.max(...taken) + SLOT_MINUTES
  if (next >= 18 * 60) return DAY_STARTS_AT // spilled past the working day
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

// A job row for the store. Only real columns at the top level — anything else
// goes in `data`, because one unknown key fails the whole insert.
function toJob({ address, postcode, customer, date, time, price, fees, notes, batchId }) {
  const pc = normalisePostcode(postcode)
  const title = address?.trim() || pc || 'New job'
  const data = {}
  if (address?.trim()) data.Address = address.trim()
  if (pc) data.Postcode = pc
  if (time) data.Time = time
  if (notes?.trim()) data.Notes = notes.trim()

  const items = (fees || [])
    .filter((f) => f.description?.trim() || Number(f.amount) > 0)
    .map((f, i) => ({ id: `fee-${i}`, description: f.description?.trim() || 'Fee', cost: Number(f.amount) || 0 }))
  const revenue = Number(price) || 0

  return {
    title,
    postcode: pc,
    customer: customer?.trim() || '',
    status: DEFAULT_STATUS,
    start_date: date || null,
    end_date: date || null,
    tags: [],
    data,
    // Price and fees live in `costing`, which is exactly what the Finance tab
    // reads — so money entered here reaches the books with no extra step.
    ...(revenue > 0 || items.length ? { costing: { revenue, items } } : {}),
    ...(batchId ? { batch_id: batchId } : {}),
  }
}

function FeeRows({ fees, setFees }) {
  return (
    <div className="space-y-2">
      {fees.map((f, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={input}
            placeholder="Fee (e.g. parking, congestion)"
            value={f.description}
            onChange={(e) => setFees(fees.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))}
          />
          <input
            type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
            className={`${input} !w-28`}
            value={f.amount}
            onChange={(e) => setFees(fees.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))}
          />
          <button
            type="button"
            onClick={() => setFees(fees.filter((_, k) => k !== i))}
            className="shrink-0 rounded-lg border border-slate-200 px-3 text-slate-400 hover:text-red-600"
            aria-label="Remove fee"
          ><Trash2 size={16} /></button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setFees([...fees, { description: '', amount: '' }])}
        className="text-xs font-bold uppercase tracking-wide text-brand-blue"
      >+ Add a fee</button>
    </div>
  )
}

/* ── One job ─────────────────────────────────────────────────────────── */

function SingleJob({ onCreate, onDone, jobs }) {
  const [form, setForm] = useState({
    address: '', postcode: '', customer: '', date: todayIso(), time: '', price: '', notes: '',
  })
  const [autoTime, setAutoTime] = useState(true)
  const [fees, setFees] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // Recomputed as the day changes, so the suggestion always fits that day.
  const suggested = useMemo(() => autoTimeFor(form.date, jobs), [form.date, jobs])

  async function submit(e) {
    e.preventDefault()
    if (!form.address.trim() && !form.postcode.trim()) {
      setError('Add a postcode or an address.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onCreate([toJob({ ...form, time: autoTime ? suggested : form.time, fees })])
      onDone(1)
    } catch (err) {
      setError(err?.message || 'Could not add the job.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Postcode">
        <input
          className={`${input} uppercase`}
          value={form.postcode}
          onChange={set('postcode')}
          placeholder="M1 1AE"
          autoCapitalize="characters"
          autoComplete="postal-code"
        />
      </Field>
      <Field label="Address (optional)">
        <input className={input} value={form.address} onChange={set('address')} placeholder="12 Oak Avenue" />
      </Field>
      <Field label="Customer (optional)">
        <input className={input} value={form.customer} onChange={set('customer')} placeholder="Mrs Smith" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day">
          <input type="date" required className={input} value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Time">
          <div className="space-y-1.5">
            <input
              type="time"
              className={input}
              value={autoTime ? suggested : form.time}
              readOnly={autoTime}
              onChange={set('time')}
            />
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input type="checkbox" className="h-4 w-4 accent-ember" checked={autoTime} onChange={(e) => setAutoTime(e.target.checked)} />
              Auto {autoTime && <span className="text-slate-400">· next free slot</span>}
            </label>
          </div>
        </Field>
      </div>
      <Field label="Price (£)">
        <input
          type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
          className={input} value={form.price} onChange={set('price')}
        />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Fees</span>
        <FeeRows fees={fees} setFees={setFees} />
      </div>
      <Field label="Notes">
        <textarea className={input} rows={2} value={form.notes} onChange={set('notes')} placeholder="Anything the team needs to know" />
      </Field>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full rounded-lg !py-3.5 disabled:opacity-50">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Add job
      </button>
      <p className="text-center text-xs text-slate-400">
        The price and fees go straight into Finance.
      </p>
    </form>
  )
}

/* ── Multi job ───────────────────────────────────────────────────────── */

function MessageBlock({ stop, dateIso }) {
  const [copied, setCopied] = useState(false)
  const text = customerMessage(stop, dateIso)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  const share = async () => {
    try {
      await navigator.share({ text })
    } catch {
      /* dismissed or unsupported — the copy button is the fallback */
    }
  }

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600">{text}</pre>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={copy} className="btn-outline flex-1 rounded-lg !px-3 !py-2 !text-xs">
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
        {typeof navigator !== 'undefined' && navigator.share && (
          <button type="button" onClick={share} className="btn-outline flex-1 rounded-lg !px-3 !py-2 !text-xs">
            <Share2 size={14} /> Send
          </button>
        )}
      </div>
    </div>
  )
}

function MultiJob({ onCreate, onDone }) {
  const [rows, setRows] = useState([
    { postcode: '', address: '', customer: '' },
    { postcode: '', address: '', customer: '' },
  ])
  const [date, setDate] = useState(todayIso())
  const [startTime, setStartTime] = useState('09:00')
  const [jobMinutes, setJobMinutes] = useState(45)
  const [price, setPrice] = useState('')
  const [plan, setPlan] = useState(null)
  const [planning, setPlanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const filled = rows.filter((r) => r.postcode.trim() || r.address.trim())
  const setRow = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  async function doPlan() {
    setPlanning(true)
    setError('')
    try {
      const result = await planRoute(filled, { startTime, jobMinutes: Number(jobMinutes) || 45 })
      setPlan(result)
    } catch (err) {
      setError(err?.message || 'Could not plan the route.')
    } finally {
      setPlanning(false)
    }
  }

  async function addAll() {
    setBusy(true)
    setError('')
    const batchId = `batch-${Date.now()}`
    try {
      const stops = plan?.schedule || filled
      await onCreate(
        stops.map((s) =>
          toJob({
            address: s.address,
            postcode: s.postcode,
            customer: s.customer,
            date,
            time: s.arrive || '',
            price,
            fees: [],
            notes: s.slotStart ? `Arrival slot ${s.slotStart}–${s.slotEnd}` : '',
            batchId,
          }),
        ),
      )
      onDone(stops.length)
    } catch (err) {
      setError(err?.message || 'Could not add the jobs.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day">
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start at">
          <input type="time" className={input} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Minutes per job">
          <input type="number" min="5" step="5" inputMode="numeric" className={input} value={jobMinutes} onChange={(e) => setJobMinutes(e.target.value)} />
        </Field>
        <Field label="Price each (£)">
          <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" className={input} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>

      <div>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Addresses</span>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-2">
              <div className="flex gap-2">
                <input
                  className={`${input} uppercase !w-32`}
                  placeholder="Postcode"
                  value={r.postcode}
                  autoCapitalize="characters"
                  onChange={(e) => setRow(i, { postcode: e.target.value })}
                />
                <input
                  className={input}
                  placeholder="Address (optional)"
                  value={r.address}
                  onChange={(e) => setRow(i, { address: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((_, k) => k !== i))}
                  disabled={rows.length <= 1}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 text-slate-400 hover:text-red-600 disabled:opacity-30"
                  aria-label="Remove address"
                ><Trash2 size={16} /></button>
              </div>
              <input
                className={`${input} mt-2`}
                placeholder="Customer (optional — used in the message)"
                value={r.customer}
                onChange={(e) => setRow(i, { customer: e.target.value })}
              />
              {r.postcode.trim() && !looksLikePostcode(r.postcode) && (
                <p className="mt-1 text-xs text-amber-deep">That doesn't look like a UK postcode.</p>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRows([...rows, { postcode: '', address: '', customer: '' }])}
          className="mt-2 text-xs font-bold uppercase tracking-wide text-brand-blue"
        >+ Add another address</button>
      </div>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      {!plan ? (
        <button
          type="button"
          onClick={doPlan}
          disabled={planning || filled.length < 2}
          className="btn-primary w-full rounded-lg !py-3.5 disabled:opacity-50"
        >
          {planning ? <Loader2 size={18} className="animate-spin" /> : <Route size={18} />}
          {planning ? 'Planning the route…' : `Plan the route (${filled.length})`}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">The run</h3>
              <button type="button" onClick={() => setPlan(null)} className="text-xs font-bold uppercase tracking-wide text-slate-500">Edit</button>
            </div>
            {!plan.optimised && (
              <p className="mb-2 rounded-lg bg-amber/10 p-2 text-xs font-semibold text-amber-deep">
                {plan.geocodeFailed
                  ? "Couldn't reach the postcode lookup, so these are in the order you typed."
                  : 'Not enough recognised postcodes to work out a driving order — kept as typed.'}
              </p>
            )}
            {plan.unplaced.length > 0 && plan.optimised && (
              <p className="mb-2 rounded-lg bg-amber/10 p-2 text-xs font-semibold text-amber-deep">
                Couldn't place {plan.unplaced.join(', ')} — left at the end.
              </p>
            )}
            <ol className="divide-y divide-slate-100">
              {plan.schedule.map((s) => (
                <li key={`${s.postcode}-${s.order}`} className="py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy font-mono text-[11px] font-bold text-white">
                      {s.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{s.address || s.postcode}</span>
                        <span className="shrink-0 font-mono text-xs font-bold text-ember">{s.slotStart}–{s.slotEnd}</span>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={11} />{normalisePostcode(s.postcode)}{s.customer ? ` · ${s.customer}` : ''}
                      </span>
                      <MessageBlock stop={s} dateIso={date} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <button type="button" onClick={addAll} disabled={busy} className="btn-primary w-full rounded-lg !py-3.5 disabled:opacity-50">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Add all {plan.schedule.length} jobs
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Shell ───────────────────────────────────────────────────────────── */

export default function QuickAddJob({ onCreate, onClose, onAdded, jobs }) {
  const [mode, setMode] = useState('one')

  const done = (n) => {
    onAdded?.(n)
    onClose()
  }

  return (
    <Modal title="Add a job" onClose={onClose} wide>
      <div className="mb-4 flex gap-1.5">
        {[['one', 'One job'], ['many', 'Multi job']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === key ? 'bg-navy text-white' : 'border border-slate-200 bg-white text-slate-500'
            }`}
          >{label}</button>
        ))}
      </div>
      {mode === 'one'
        ? <SingleJob onCreate={onCreate} onDone={done} jobs={jobs} />
        : <MultiJob onCreate={onCreate} onDone={done} />}
    </Modal>
  )
}
