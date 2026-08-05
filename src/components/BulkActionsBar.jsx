import { useLayoutEffect, useRef, useState } from 'react'
import { STATUSES } from '../lib/status'
import { Button, Input, Mono, Select, Z, cx } from '../ui'

// Floating action bar shown when one or more jobs are selected on the board.
// Applies a status or a tag to every selected job, archives them together, or
// deletes them. Delete is only offered when the caller says the user may —
// level 1 never deletes, and RLS enforces the same server-side.
//
// It stacks rather than scrolling sideways: on a phone this bar carries eight
// controls, and a row that runs off the edge hides whichever one you need.
export default function BulkActionsBar({ count, onSetStatus, onAddTag, onArchive, onDelete, onCosts, onAssign, onClear, archived }) {
  const [tag, setTag] = useState('')
  const barRef = useRef(null)

  // This bar is 268px tall at 375px — a third of an iPhone screen — and it is
  // fixed, so it covered the last two job cards outright, at every scroll
  // position. Publishing its measured height lets the page reserve exactly
  // that much at the bottom (App.jsx's <main>) and lets a toast sit above it
  // (src/ui/Toast.jsx) rather than on top of Delete. Measured, not a constant:
  // how many rows it wraps into depends on the width and on which actions the
  // user is allowed.
  const publish = () => {
    const el = barRef.current
    if (!el) return
    const value = `${Math.ceil(el.getBoundingClientRect().height)}px`
    const root = document.documentElement
    if (root.style.getPropertyValue('--bulk-bar-h') !== value) root.style.setProperty('--bulk-bar-h', value)
  }

  // Every render, so a change in the count (or in what is on offer) is picked
  // up; plus resize and ResizeObserver for the changes that are not renders.
  useLayoutEffect(publish)

  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return undefined
    window.addEventListener('resize', publish)
    window.addEventListener('orientationchange', publish)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null
    ro?.observe(el)
    return () => {
      window.removeEventListener('resize', publish)
      window.removeEventListener('orientationchange', publish)
      ro?.disconnect()
      // Back to zero the moment the selection is cleared, or the board would
      // keep a bar's worth of empty space at the bottom for ever.
      document.documentElement.style.removeProperty('--bulk-bar-h')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitTag = (e) => {
    e.preventDefault()
    const t = tag.trim()
    if (!t) return
    onAddTag(t)
    setTag('')
  }

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Bulk actions"
      className={cx(
        // bottom clears the iPhone home indicator (env() is 0 elsewhere).
        'fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] mx-auto max-w-2xl',
        'animate-fade-up rounded-2xl bg-navy p-3 text-white shadow-overlay',
        Z.bulkBar,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          <Mono className="font-semibold">{count}</Mono> selected
        </span>
        <Button tone="ghost" size="sm" onDark onClick={onClear}>Clear</Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          className="min-w-[9.5rem] flex-1"
          value=""
          onChange={(e) => { if (e.target.value) onSetStatus(e.target.value) }}
          aria-label="Set status for selected jobs"
        >
          <option value="">Set status…</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <form className="flex min-w-[11rem] flex-1 gap-2" onSubmit={submitTag}>
          <Input
            className="min-w-0 flex-1"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Add tag…"
            aria-label="Tag for selected jobs"
          />
          <Button type="submit" onDark disabled={!tag.trim()}>Tag</Button>
        </form>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {onAssign && <Button size="sm" onDark onClick={onAssign}>Assign</Button>}
        {onCosts && <Button size="sm" onDark onClick={onCosts}>Costs &amp; profit</Button>}
        <Button size="sm" onDark onClick={onArchive}>{archived ? 'Restore' : 'Archive'}</Button>
        {onDelete && <Button size="sm" tone="danger" onDark onClick={onDelete}>Delete</Button>}
      </div>
    </div>
  )
}
