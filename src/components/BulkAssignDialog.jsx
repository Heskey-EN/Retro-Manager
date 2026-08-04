import { useState } from 'react'
import { Button, Modal } from '../ui'
import AssignPanel from './AssignPanel'
import { JOB_ROLES } from '../lib/roles'

// Put the same people on every selected job — a batch of properties is
// normally worked by one crew, so assigning them one at a time is busywork.
// Only the roles actually filled in here are written; the rest are left
// exactly as they are on each job.
export default function BulkAssignDialog({ count, onCancel, onApply }) {
  const [assignments, setAssignments] = useState({})
  const [busy, setBusy] = useState(false)

  const filled = JOB_ROLES.filter((r) => assignments[r.key]?.name)

  return (
    <Modal
      title="Assign people"
      subtitle={`${count} selected`}
      // Not closable mid-write: the jobs are updated one at a time, so
      // disappearing halfway would leave the batch partly assigned.
      onClose={() => !busy && onCancel()}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            tone="primary"
            disabled={busy || filled.length === 0}
            onClick={async () => { setBusy(true); try { await onApply(assignments) } finally { setBusy(false) } }}
          >
            {busy ? 'Assigning…' : `Assign to ${count} job${count === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-[13px] text-ink-faint">
          Anyone you pick here is put on all {count} jobs. Roles you leave blank are untouched.
        </p>
        <AssignPanel assignments={assignments} onChange={setAssignments} disabled={busy} />
      </div>
    </Modal>
  )
}
