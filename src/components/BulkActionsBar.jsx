import { useState } from 'react'
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

  const submitTag = (e) => {
    e.preventDefault()
    const t = tag.trim()
    if (!t) return
    onAddTag(t)
    setTag('')
  }

  return (
    <div
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
