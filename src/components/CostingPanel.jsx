import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'

// Per-job costing (used at the Coordination / Design stage). Line items with
// costs auto-total; a projected revenue figure gives the profit and margin.
// Edits are debounced and saved back onto the job.

const money = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })
const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const uid = () => Math.random().toString(36).slice(2, 9)

export default function CostingPanel({ costing, onSave }) {
  const [items, setItems] = useState(() =>
    costing?.items?.length ? costing.items : [{ id: uid(), description: '', cost: '' }],
  )
  const [revenue, setRevenue] = useState(() => costing?.revenue ?? '')

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const first = useRef(true)

  // Latest values + a dirty flag so an edit made <500ms before the panel
  // unmounts (job closed/switched) is flushed synchronously instead of lost.
  const latest = useRef({ items, revenue })
  latest.current = { items, revenue }
  const dirty = useRef(false)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    dirty.current = true
    const t = setTimeout(() => {
      onSaveRef.current({ items, revenue })
      dirty.current = false
    }, 500)
    return () => clearTimeout(t)
  }, [items, revenue])

  useEffect(() => {
    return () => {
      if (dirty.current) {
        onSaveRef.current(latest.current)
        dirty.current = false
      }
    }
  }, [])

  // Focus the description input of a row added via Enter/＋.
  const descRefs = useRef({})
  const pendingFocus = useRef(null)
  useEffect(() => {
    const id = pendingFocus.current
    if (id && descRefs.current[id]) {
      descRefs.current[id].focus()
      pendingFocus.current = null
    }
  }, [items])

  const total = useMemo(() => items.reduce((s, it) => s + num(it.cost), 0), [items])
  const rev = num(revenue)
  const profit = rev - total
  const margin = rev > 0 ? (profit / rev) * 100 : null

  const setItem = (id, patch) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const addItem = () => {
    const item = { id: uid(), description: '', cost: '' }
    pendingFocus.current = item.id
    setItems((list) => [...list, item])
  }
  const removeItem = (id) => setItems((list) => (list.length > 1 ? list.filter((it) => it.id !== id) : list))

  return (
    <div className="costing">
      <div className="costing__items">
        <div className="costing__row costing__row--head">
          <span>Item</span>
          <span>Cost</span>
          <span aria-hidden />
        </div>
        {items.map((it) => (
          <div className="costing__row" key={it.id}>
            <input
              className="costing__desc"
              ref={(el) => { descRefs.current[it.id] = el }}
              placeholder="e.g. Cavity wall insulation — labour & materials"
              value={it.description}
              onChange={(e) => setItem(it.id, { description: e.target.value })}
            />
            <div className="costing__cost">
              <span className="costing__gbp">£</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                value={it.cost}
                onChange={(e) => setItem(it.id, { cost: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && it.id === items[items.length - 1].id) {
                    e.preventDefault()
                    addItem()
                  }
                }}
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

      <dl className="costing__totals">
        <div className="costing__total-row">
          <dt>Total costs</dt>
          <dd className="mono">{money(total)}</dd>
        </div>
        <div className="costing__total-row">
          <dt>Projected revenue</dt>
          <dd>
            <div className="costing__cost costing__cost--rev">
              <span className="costing__gbp">£</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
              />
            </div>
          </dd>
        </div>
        <div className={`costing__total-row costing__profit ${profit >= 0 ? 'is-pos' : 'is-neg'}`}>
          <dt>
            Profit
            {margin != null && <span className="costing__margin">{margin.toFixed(1)}% margin</span>}
          </dt>
          <dd className="mono">{money(profit)}</dd>
        </div>
      </dl>
    </div>
  )
}
