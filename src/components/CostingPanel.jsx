import { useEffect, useMemo, useRef, useState } from 'react'
import { Mono } from '../ui'
import { CostRows, MoneyInput, money, num, uid } from './CostItems'

// Per-job costing. Line items with costs auto-total; a projected revenue figure
// gives the profit and margin. Edits are debounced and saved back onto the job,
// from where the Finance tab derives its income and job costs.

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

  const total = useMemo(() => items.reduce((s, it) => s + num(it.cost), 0), [items])
  const rev = num(revenue)
  const profit = rev - total
  const margin = rev > 0 ? (profit / rev) * 100 : null

  return (
    <div className="grid gap-5">
      <CostRows
        items={items}
        onChange={setItems}
        showHead
        placeholder="e.g. Cavity wall insulation — labour & materials"
      />

      {/* The totals sit right on a wide screen (where the eye already runs down
          the cost column) and full width on a phone. */}
      <dl className="grid w-full gap-2.5 border-t border-line pt-3.5 sm:ml-auto sm:max-w-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-ink-faint">Total costs</dt>
          <dd className="text-[15px] font-semibold">
            <Mono>{money(total)}</Mono>
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-ink-faint">Projected revenue</dt>
          <dd className="w-36">
            <MoneyInput
              aria-label="Projected revenue"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
            />
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
          <dt className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-ink">
            Profit
            {margin != null && (
              <span className="font-mono text-[11px] font-medium text-ink-faint">{margin.toFixed(1)}% margin</span>
            )}
          </dt>
          <dd className={profit >= 0 ? 'text-lg font-semibold text-moss' : 'text-lg font-semibold text-danger'}>
            <Mono>{money(profit)}</Mono>
          </dd>
        </div>
      </dl>
    </div>
  )
}
