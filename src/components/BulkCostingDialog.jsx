import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Banner, Button, Field, Modal, Mono, SegmentedControl } from '../ui'
import { CostRows, MoneyInput, money, num, uid } from './CostItems'

// Set costing (projected revenue + cost items) across every selected job at
// once — the usual case being a batch priced the same way, e.g. 12 EPCs at
// £85 each. Two modes because both mental models are real:
//   "each"  — these figures apply to every job (12 × £85)
//   "split" — this is the whole batch's value, divided between them (£1,020 ÷ 12)
// Whatever lands here flows straight into the Finance tab, which derives its
// income and job costs from exactly these fields.

// Divide an amount across n jobs without losing or inventing pennies: split in
// whole pence and hand the remainder to the first jobs.
export function splitEvenly(amount, n) {
  const pence = Math.round(num(amount) * 100)
  const base = Math.floor(pence / n)
  const extra = pence - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100)
}

const MODES = [
  { value: 'each', label: 'Per job' },
  { value: 'split', label: 'Split across all' },
]

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

  const totalCosts = items.reduce((s, it) => s + num(it.cost), 0)
  const perJobRevenue = mode === 'each' ? num(revenue) : num(revenue) / (count || 1)
  const perJobCosts = mode === 'each' ? totalCosts : totalCosts / (count || 1)
  const perJobProfit = perJobRevenue - perJobCosts
  const grandRevenue = mode === 'each' ? num(revenue) * count : num(revenue)
  const grandCosts = mode === 'each' ? totalCosts * count : totalCosts
  const nothingEntered = num(revenue) === 0 && totalCosts === 0

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
    <Modal
      title="Costs & profit"
      subtitle={`${count} selected`}
      // Closing halfway through writing to every selected job would leave the
      // batch half applied with nothing on screen to say so.
      onClose={() => !busy && onCancel()}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            tone="primary"
            disabled={busy || nothingEntered}
            onClick={async () => { setBusy(true); try { await apply() } finally { setBusy(false) } }}
          >
            {busy ? 'Applying…' : `Apply to ${count} job${count === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SegmentedControl
          mode="radio"
          label="How the figures apply"
          options={MODES}
          value={mode}
          onChange={setMode}
          full
        />
        <p className="-mt-1 text-[13px] text-ink-faint">
          {mode === 'each'
            ? `Each of the ${count} jobs gets these figures.`
            : `These are the totals for the whole batch — divided evenly between the ${count} jobs.`}
        </p>

        <Field label={mode === 'each' ? 'Projected revenue per job' : 'Total projected revenue'}>
          <MoneyInput value={revenue} onChange={(e) => setRevenue(e.target.value)} autoFocus />
        </Field>

        {/* as="div": a <label> wrapping a whole list of inputs has undefined
            behaviour when clicked. */}
        <Field as="div" label={mode === 'each' ? 'Costs per job' : 'Total costs'}>
          <CostRows items={items} onChange={setItems} placeholder="e.g. Materials, subcontractor, travel" />
        </Field>

        <dl className="grid gap-2.5 border-t border-line pt-3.5">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-ink-faint">Each job</dt>
            <dd className="text-[15px] font-semibold">
              <Mono>{money(perJobRevenue)} − {money(perJobCosts)}</Mono>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm font-semibold text-ink">Profit per job</dt>
            <dd className={perJobProfit >= 0 ? 'text-lg font-semibold text-moss' : 'text-lg font-semibold text-danger'}>
              <Mono>{money(perJobProfit)}</Mono>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-ink-faint">All {count} jobs</dt>
            <dd className="text-right text-[15px] font-semibold">
              <Mono>{money(grandRevenue - grandCosts)}</Mono>{' '}
              <span className="font-mono text-[11px] font-medium text-ink-faint">from {money(grandRevenue)}</span>
            </dd>
          </div>
        </dl>

        {alreadyCosted > 0 && (
          <Banner tone="warn" icon={<AlertTriangle size={14} />}>
            {alreadyCosted} of the selected job{alreadyCosted === 1 ? ' has' : 's have'} costing already — applying
            this replaces it.
          </Banner>
        )}
      </div>
    </Modal>
  )
}
