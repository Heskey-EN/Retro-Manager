import { useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, IconButton, Input, SpecLabel, cx } from '../ui'

// The money bits shared by the per-job costing panel and the bulk dialog.
//
// They were copy-pasted between the two, which is exactly how they drifted:
// only one of them focused a newly added row, and only one accepted Enter to
// add the next line. One component, so a fix lands in both — and so the figures
// that flow into Finance are entered the same way wherever you are.

export const uid = () => Math.random().toString(36).slice(2, 9)

export const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export const money = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

// A £ amount. The symbol sits inside the field rather than in the label so a
// column of figures still lines up, and the value is right-aligned tabular mono
// so the pennies stack.
export function MoneyInput({ className, ...rest }) {
  return (
    <div className="relative flex min-w-0 items-center">
      <span className="pointer-events-none absolute left-3 text-sm text-ink-faint" aria-hidden>
        £
      </span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        placeholder="0.00"
        mono
        {...rest}
        className={cx('pl-7 text-right', className)}
      />
    </div>
  )
}

// The editable list of cost lines.
//
// The old grid was `1fr 150px 34px` at every width, so on a 375px screen the
// description shrank to about 150px. Here the description takes its own row on
// a phone and the amount sits beside the remove button underneath it.
export function CostRows({ items, onChange, placeholder, showHead = false }) {
  const descRefs = useRef({})
  const pendingFocus = useRef(null)

  // Focus the description of a row added with the button or with Enter, so
  // typing a list of costs never needs the mouse.
  useEffect(() => {
    const id = pendingFocus.current
    if (id && descRefs.current[id]) {
      descRefs.current[id].focus()
      pendingFocus.current = null
    }
  }, [items])

  const setItem = (id, patch) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const addItem = () => {
    const item = { id: uid(), description: '', cost: '' }
    pendingFocus.current = item.id
    onChange([...items, item])
  }
  // Never remove the last row — an empty list has nothing to type into.
  const removeItem = (id) => items.length > 1 && onChange(items.filter((it) => it.id !== id))

  // The header row carries the same tracks and no padding of its own, so
  // "Cost" sits exactly over the column it names.
  const cols = 'grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[minmax(0,1fr)_9rem_2.75rem]'

  return (
    <div className="flex flex-col gap-2">
      {showHead && (
        <div className={cx('hidden gap-2 sm:grid', cols)}>
          <SpecLabel as="span" tone="faint">Item</SpecLabel>
          <SpecLabel as="span" tone="faint">Cost</SpecLabel>
          <span />
        </div>
      )}

      {items.map((it, i) => (
        <div key={it.id} className={cx('grid items-center gap-2', cols)}>
          <Input
            ref={(el) => { descRefs.current[it.id] = el }}
            className="col-span-2 sm:col-span-1"
            aria-label="Item"
            placeholder={placeholder}
            value={it.description}
            onChange={(e) => setItem(it.id, { description: e.target.value })}
          />
          <MoneyInput
            aria-label="Cost"
            value={it.cost}
            onChange={(e) => setItem(it.id, { cost: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && i === items.length - 1) {
                e.preventDefault()
                addItem()
              }
            }}
          />
          <IconButton
            label="Remove item"
            tone="danger"
            onClick={() => removeItem(it.id)}
            disabled={items.length <= 1}
          >
            <X size={18} />
          </IconButton>
        </div>
      ))}

      <Button size="sm" onClick={addItem} className="justify-self-start self-start">
        <Plus size={16} /> Add item
      </Button>
    </div>
  )
}
