import { useState } from 'react'
import { STATUSES } from '../lib/status'

// Floating action bar shown when one or more jobs are selected on the dashboard.
// Applies a stage or a tag to every selected job, archives them together, or
// deletes them. Delete is only offered when the caller says the user may —
// level 1 never deletes, and RLS enforces the same server-side.
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
    <div className="bulkbar" role="region" aria-label="Bulk actions">
      <span className="bulkbar__count"><strong>{count}</strong> selected</span>
      <div className="bulkbar__actions">
        <select
          className="bulkbar__select"
          value=""
          onChange={(e) => { if (e.target.value) onSetStatus(e.target.value) }}
          aria-label="Set stage for selected jobs"
        >
          <option value="">Set stage…</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <form className="bulkbar__tag" onSubmit={submitTag}>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag…" aria-label="Tag for selected jobs" />
          <button className="btn btn--sm" type="submit" disabled={!tag.trim()}>Tag</button>
        </form>
        {onAssign && <button className="btn btn--sm" onClick={onAssign}>Assign</button>}
        {onCosts && <button className="btn btn--sm" onClick={onCosts}>Costs &amp; profit</button>}
        <button className="btn btn--sm" onClick={onArchive}>{archived ? 'Restore' : 'Archive'}</button>
        {onDelete && (
          <button className="btn btn--sm bulkbar__delete" onClick={onDelete}>Delete</button>
        )}
      </div>
      <button className="bulkbar__clear" onClick={onClear}>Clear</button>
    </div>
  )
}
