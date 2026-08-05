import { EmptyState, Modal } from '../ui'
import { fmtLong, fmtShort } from '../lib/dates.js'
import { SPAN_CAP } from './entries.js'
import { EntryRow } from './EntryRow.jsx'

// What is on a day. The kit's Modal is already a bottom sheet on a phone and a
// centred card from 640px up, with the body scroll lock and Escape handling —
// so this is a list, not a second dialog implementation.
//
// It opens on EMPTY days too, which the old Finance grid did and the Dashboard
// one did not. Without that, "Add a job on this day" is unreachable on exactly
// the days you most want it.
export default function DaySheet({
  iso, entries = [], showMoney, canEdit = true, onOpenJob, onOpenEntry, onClose, actions,
}) {
  // A run past the display cap collapses onto its start day (see entries.js) —
  // say where it actually finishes rather than silently losing the span.
  const longRuns = entries.filter((e) => e.start === iso && e.end > e.start && e.days.length === 1)

  return (
    <Modal
      size="sm"
      title={fmtLong(iso)}
      onClose={onClose}
      footer={actions ? <div className="flex w-full gap-2 [&>*]:flex-1">{actions}</div> : null}
    >
      {entries.length === 0 ? (
        <EmptyState size="compact">Nothing on this day yet.</EmptyState>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              iso={iso}
              showMoney={showMoney}
              canEdit={canEdit}
              onOpenJob={onOpenJob}
              onOpenEntry={onOpenEntry}
            />
          ))}
        </ul>
      )}

      {longRuns.map((e) => (
        <p key={`run-${e.id}`} className="mt-3 text-xs text-ink-mute">
          <strong className="font-semibold text-ink-faint">{e.title}</strong> runs to {fmtShort(e.end)} — over{' '}
          {SPAN_CAP} days, so it is only marked on its start date.
        </p>
      ))}
    </Modal>
  )
}
