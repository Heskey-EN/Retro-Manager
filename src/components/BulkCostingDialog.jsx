import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'

// Set costing (projected revenue + cost items) across every selected job at
// once — the usual case being a batch priced the same way, e.g. 12 EPCs at
// £85 each. Two modes because both mental models are real:
//   "each"  — these figures apply to every job (12 × £85)
//   "split" — this is the whole batch's value, divided between them (£1,020 ÷ 12)
// Whatever lands here flows straight into the Finance tab, which derives its
// income and job costs from exactly these fields.

const money = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })
const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const uid = () => Math.random().toString(36).slice(2, 9)

// Divide an amount across n jobs without losing or inventing pennies: split in
// whole pence and hand the remainder to the first jobs.
export function splitEvenly(amount, n) {
  const pence = Math.round(num(amount) * 100)
  const base = Math.floor(pence / n)
  const extra = pence - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100)
}

export default function BulkCostingDialog({ jobs, onCancel, onApply }) {
  const [mode, setMode] = useState('each') // 'each' | 'split'
  const [revenue, setRevenue] = useState('')
  const [items, setItems] = useState([{ id: uid(), description: '', cost: '' }])
  const [busy, setBusy] = useState(false)

  const count = jobs.length
  const alreadyCosted = useMemo(
    () => jobs.filter((j) => j.costing && (num(j.costing.revenue) > 0 || (j.costing.items || []).length > 0)).length,
    [jobs],
  )

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const totalCosts = items.reduce((s, it) => s + num(it.cost), 0)
  const perJobRevenue = mode === 'each' ? num(revenue) : num(revenue) / (count || 1)
  const perJobCosts = mode === 'each' ? totalCosts : totalCosts / (count || 1)
  const perJobProfit = perJobRevenue - perJobCosts
  const grandRevenue = mode === 'each' ? num(revenue) * count : num(revenue)
  const grandCosts = mode === 'each' ? totalCosts * count : totalCosts
  const nothingEntered = num(revenue) === 0 && totalCosts === 0

  const setItem = (id, patch) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const addItem = () => setItems((list) => [...list, { id: uid(), description: '', cost: '' }])
  const removeItem = (id) => setItems((list) => (list.length > 1 ? list.filter((it) => it.id !== id) : list))

  function apply() {
    const usable = items.filter((it) => it.description.trim() || num(it.cost) > 0)
    // Precompute the per-job shares once so rounding is consistent and the
    // pennies always add back up to what was typed.
    const revShares = splitEvenly(revenue, count)
    const itemShares = usable.map((it) => splitEvenly(it.cost, count))

    const perJob = jobs.map((job, i) => ({
      id: job.id,
      costing: {
        revenue: mode === 'each' ? num(revenue) : revShares[i],
        items: usable.map((it, k) => ({
          id: uid(),
          description: it.description.trim() || 'Job cost',
          cost: mode === 'each' ? num(it.cost) : itemShares[k][i],
        })),
      },
    }))
    return onApply(perJob)
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Set costs for selected jobs">
        <header className="modal__header">
          <div>
            <p className="eyebrow">{count} selected</p>
            <h2 className="modal__title">Costs &amp; profit</h2>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="modal__form">
          <div className="segmented" role="tablist" aria-label="How the figures apply">
            <button
              role="tab" aria-selected={mode === 'each'}
              className={`segmented__btn${mode === 'each' ? ' is-active' : ''}`}
              onClick={() => setMode('each')}
            >Per job</button>
            <button
              role="tab" aria-selected={mode === 'split'}
              className={`segmented__btn${mode === 'split' ? ' is-active' : ''}`}
              onClick={() => setMode('split')}
            >Split across all</button>
          </div>
          <p className="modal__hint">
            {mode === 'each'
              ? `Each of the ${count} jobs gets these figures.`
              : `These are the totals for the whole batch — divided evenly between the ${count} jobs.`}
          </p>

          <label className="field">
            <span>{mode === 'each' ? 'Projected revenue per job' : 'Total projected revenue'}</span>
            <div className="costing__cost costing__cost--rev">
              <span className="costing__gbp">£</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                value={revenue} onChange={(e) => setRevenue(e.target.value)} autoFocus
              />
            </div>
          </label>

          <div className="field">
            <span>{mode === 'each' ? 'Costs per job' : 'Total costs'}</span>
            <div className="costing__items">
              {items.map((it) => (
                <div className="costing__row" key={it.id}>
                  <input
                    className="costing__desc"
                    placeholder="e.g. Materials, subcontractor, travel"
                    value={it.description}
                    onChange={(e) => setItem(it.id, { description: e.target.value })}
                  />
                  <div className="costing__cost">
                    <span className="costing__gbp">£</span>
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                      value={it.cost} onChange={(e) => setItem(it.id, { cost: e.target.value })}
                    />
                  </div>
                  <button
                    className="costing__remove" onClick={() => removeItem(it.id)}
                    aria-label="Remove item" disabled={items.length <= 1}
                  ><Icon name="close" /></button>
                </div>
              ))}
              <button className="btn btn--sm costing__add" onClick={addItem}><Icon name="plus" /> Add item</button>
            </div>
          </div>

          <dl className="costing__totals">
            <div className="costing__total-row">
              <dt>Each job</dt>
              <dd className="mono">{money(perJobRevenue)} − {money(perJobCosts)}</dd>
            </div>
            <div className={`costing__total-row costing__profit ${perJobProfit >= 0 ? 'is-pos' : 'is-neg'}`}>
              <dt>Profit per job</dt>
              <dd className="mono">{money(perJobProfit)}</dd>
            </div>
            <div className="costing__total-row">
              <dt>All {count} jobs</dt>
              <dd className="mono">{money(grandRevenue - grandCosts)} <span className="costing__margin">from {money(grandRevenue)}</span></dd>
            </div>
          </dl>

          {alreadyCosted > 0 && (
            <p className="modal__warn">
              <Icon name="alert" size={14} /> {alreadyCosted} of the selected job{alreadyCosted === 1 ? ' has' : 's have'} costing
              already — applying this replaces it.
            </p>
          )}

          <div className="modal__actions">
            <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className="btn btn--primary"
              disabled={busy || nothingEntered}
              onClick={async () => { setBusy(true); try { await apply() } finally { setBusy(false) } }}
            >
              {busy ? 'Applying…' : `Apply to ${count} job${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
