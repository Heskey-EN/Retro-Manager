// An assessment has a short life: it's booked, you do it, you get paid.
// (Or it falls through.) That's the whole model.
//
// This replaced a five-stage retrofit pipeline (Booking → Assessment →
// Coordination → Compiling documents → Submitted). Those stages described
// paperwork moving through a process; this app is for tracking assessments
// and the money attached to them, and these four states are the ones that
// actually change what you do next. They also line up exactly with how
// Finance already thinks: booked / done / paid.
export const STATUSES = [
  { value: 'Booked', label: 'Booked', color: '#3e77a8' },
  { value: 'Done', label: 'Done', color: '#e8b23a' },
  { value: 'Paid', label: 'Paid', color: '#2e7d4f' },
  // Cancelled is an end state, not a step: reachable from anywhere, and its
  // money is excluded from income (costs already spent still count).
  { value: 'Cancelled', label: 'Cancelled', color: '#6b7885', terminal: true },
]

export const STATUS_VALUES = STATUSES.map((s) => s.value)
export const PIPELINE_STATUSES = STATUSES.filter((s) => !s.terminal)
export const DEFAULT_STATUS = 'Booked'

// Jobs created under the old pipeline still carry its names. Rather than
// migrating the database, every read normalises — so old and new data behave
// identically and nothing has to be rewritten.
const LEGACY = {
  Booking: 'Booked',
  Assessment: 'Booked',
  Coordination: 'Booked',
  'Compiling documents': 'Booked',
  Submitted: 'Done',
  Finished: 'Done',
}

export function normalizeStatus(value) {
  if (!value) return DEFAULT_STATUS
  if (STATUS_VALUES.includes(value)) return value
  return LEGACY[value] || DEFAULT_STATUS
}

export function isTerminalStatus(value) {
  return STATUSES.some((s) => s.value === normalizeStatus(value) && s.terminal)
}

export function statusColor(value) {
  const found = STATUSES.find((s) => s.value === normalizeStatus(value))
  return found ? found.color : '#6b7885'
}

export function statusLabel(value) {
  const found = STATUSES.find((s) => s.value === normalizeStatus(value))
  return found ? found.label : value
}

// Position in the booked → done → paid run. End states sit outside it and
// report -1, so "is this advancing?" never treats Cancelled as progress.
export function statusIndex(value) {
  const v = normalizeStatus(value)
  if (isTerminalStatus(v)) return -1
  const i = STATUS_VALUES.indexOf(v)
  return i === -1 ? 0 : i
}
