// The Finance section's primitives — now the SHARED kit, not a second set.
//
// This file used to define its own Modal, Field, input and chip. They were
// near-copies of the ones in src/ui with different numbers: a modal that was a
// centred box on a phone instead of a bottom sheet, inputs with no 44px floor,
// a slate-300 border where the rest of the app draws --color-line. Two systems
// describing the same objects is exactly what made the app feel like three
// apps, so these are now thin adapters over src/ui.
//
// It survives as a file (rather than every call site importing '../../ui')
// because the old prop names differ — `wide` instead of `size`, `inputCls`
// instead of `inputClass`. Translating once here was a great deal safer than
// editing ~40 call sites across the Finance tab of a live app, and it leaves a
// single obvious place to finish the job later.

import { Card, Chip, Modal as KitModal, SpecLabel, inputClass } from '../../ui'

// Identical signature ({ label, className, children }), so it passes straight
// through — the kit's version simply lays the label out with a grid gap
// instead of a margin.
export { Field } from '../../ui'

// `wide` was max-w-2xl and the default max-w-md. The kit's sizes are the
// nearest equivalents, and bring the phone bottom-sheet behaviour with them.
export function Modal({ title, onClose, children, wide = false }) {
  return (
    <KitModal title={title} onClose={onClose} size={wide ? 'lg' : 'sm'}>
      {children}
    </KitModal>
  )
}

// Was its own string with a slate-300 border and a ring-1 focus style. The kit's
// is the same idea with the app's line colour, a 44px minimum height and the
// one focus ring — still just a class string, so `${inputCls} !w-auto` at the
// call sites keeps working.
export const inputCls = inputClass

// Kept as a component (rather than re-exported) because Finance's four tiles
// per row are its own layout. What changed is the box: it is the kit's Card, so
// a stat tile, a job card and the calendar are one object at one radius.
export function StatCard({ label, value, sub, accent = 'text-navy' }) {
  return (
    <Card>
      <SpecLabel as="div" tone="faint">{label}</SpecLabel>
      <div className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>}
    </Card>
  )
}

// Finance's own statuses — booked / done / paid for money, draft / sent / paid
// for invoices. Deliberately NOT src/ui's StatusChip, which reads an
// ASSESSMENT's status (Booked / Done / Paid / Cancelled) out of lib/status.js.
// Same pill, different vocabulary; mapping the words onto the kit's tones is
// what keeps them looking like one control.
const CHIP_TONES = { booked: 'ember', done: 'amber', paid: 'moss', draft: 'ink', sent: 'amber' }
const CHIP_LABELS = { booked: 'Booked', done: 'Done — unpaid', paid: 'Paid', draft: 'Draft', sent: 'Sent' }

export function StatusChip({ status }) {
  return <Chip tone={CHIP_TONES[status] || 'ink'}>{CHIP_LABELS[status] || status}</Chip>
}
