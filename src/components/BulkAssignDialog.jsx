import { useEffect, useState } from 'react'
import Icon from './Icon'
import AssignPanel from './AssignPanel'
import { JOB_ROLES } from '../lib/roles'

// Put the same people on every selected job — a batch of properties is
// normally worked by one crew, so assigning them one at a time is busywork.
// Only the roles actually filled in here are written; the rest are left
// exactly as they are on each job.
export default function BulkAssignDialog({ count, onCancel, onApply }) {
  const [assignments, setAssignments] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const filled = JOB_ROLES.filter((r) => assignments[r.key]?.name)

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Assign people to selected jobs">
        <header className="modal__header">
          <div>
            <p className="eyebrow">{count} selected</p>
            <h2 className="modal__title">Assign people</h2>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="modal__form">
          <p className="modal__hint">
            Anyone you pick here is put on all {count} jobs. Roles you leave blank are untouched.
          </p>
          <AssignPanel assignments={assignments} onChange={setAssignments} disabled={busy} />

          <div className="modal__actions">
            <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className="btn btn--primary"
              disabled={busy || filled.length === 0}
              onClick={async () => { setBusy(true); try { await onApply(assignments) } finally { setBusy(false) } }}
            >
              {busy ? 'Assigning…' : `Assign to ${count} job${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
