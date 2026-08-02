import { useRef, useState } from 'react'
import { Loader2, Paperclip, Plus, X } from 'lucide-react'
import { Modal, Field } from '../business/components/ui.jsx'
import { addExpense, ensureBusinessReady, EXPENSE_CATEGORIES, gbp } from '../business/lib/store.js'
import { fileToReceipt, putReceipt, deleteReceipt } from '../business/lib/receipts.js'
import { submitMyExpense } from '../business/lib/myExpenses.js'
import { useAuth } from '../hooks/useAuth'

// Log a spend in a few taps. Two destinations, decided by who you are:
//   admins / local mode -> the organisation's business data (receipt supported)
//   permitted workers   -> their own row in biz_expenses (no receipt column)
// Whichever it is, the money lands in the same Finance figures.

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function QuickAddExpense({ onClose, onAdded }) {
  const { configured, isAdmin, orgId, user } = useAuth()
  const workerPath = configured && !isAdmin

  const [form, setForm] = useState({
    description: '', amount: '', date: todayIso(), category: EXPENSE_CATEGORIES[0],
  })
  const [receipt, setReceipt] = useState(null) // { receiptId, receiptName, receiptType }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function pickReceipt(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const dataUrl = await fileToReceipt(file) // downscales before storing
      const id = crypto.randomUUID()
      await putReceipt(id, dataUrl)
      if (receipt?.receiptId) deleteReceipt(receipt.receiptId).catch(() => {})
      setReceipt({ receiptId: id, receiptName: file.name, receiptType: file.type })
    } catch (err) {
      setError(err?.message || 'Could not save that photo.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.amount) return
    setBusy(true)
    setError('')
    try {
      if (workerPath) {
        await submitMyExpense(user.id, form)
      } else {
        // MUST come first: until the business store is connected, a write
        // silently lands in this device's old local data and is discarded
        // when the cloud data loads.
        await ensureBusinessReady(orgId)
        addExpense({ ...form, amount: Number(form.amount), account: 'business', ...(receipt || {}) })
      }
      onAdded?.(`${form.description || form.category} — ${gbp.format(Number(form.amount))}`)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save that expense.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Add an expense" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="What was it?">
          <input className={input} value={form.description} onChange={set('description')} placeholder="Diesel, parking, materials" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (£)">
            <input
              type="number" min="0" step="0.01" inputMode="decimal" required placeholder="0.00"
              className={input} value={form.amount} onChange={set('amount')}
            />
          </Field>
          <Field label="Date">
            <input type="date" required className={input} value={form.date} onChange={set('date')} />
          </Field>
        </div>
        <Field label="Category">
          <select className={input} value={form.category} onChange={set('category')}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>

        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Receipt</span>
          {workerPath ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              Keep hold of the paper receipt — photos stay on the device that took them, so the
              office can't see one attached here yet.
            </p>
          ) : receipt ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Paperclip size={15} className="shrink-0 text-accent-green" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{receipt.receiptName}</span>
              <button
                type="button"
                onClick={() => { deleteReceipt(receipt.receiptId).catch(() => {}); setReceipt(null) }}
                className="text-slate-400 hover:text-red-600"
                aria-label="Remove receipt"
              ><X size={16} /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 disabled:opacity-50"
            >
              <Paperclip size={15} /> Photograph the receipt
            </button>
          )}
          {/* capture prompts the camera directly on a phone */}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={pickReceipt} />
        </div>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full rounded-lg !py-3.5 disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Add expense
        </button>
      </form>
    </Modal>
  )
}
