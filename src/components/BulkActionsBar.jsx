import { useState } from 'react'
import { STATUSES } from '../lib/status'

// Floating action bar shown when one or more jobs are selected on the dashboard.
// Applies a stage or a tag to every selected job, or archives them together.
export default function BulkActionsBar({ count, onSetStatus, onAddTag, onArchive, onClear }) {
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
        <button className="btn btn--sm" onClick={onArchive}>Archive</button>
      </div>
      <button className="bulkbar__clear" onClick={onClear}>Clear</button>
    </div>
  )
}
