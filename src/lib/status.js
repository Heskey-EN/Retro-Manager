// The retrofit project workflow. `value` is what's stored on a job (stable);
// `label` is what's shown. Keeping them separate lets us rename a stage without
// migrating existing jobs or their document folders.
// Stage colours read as a progression through the workflow, drawn from the
// Eco Futures family palette: cool blue (booked) → indigo (survey) → amber
// (design) → ember (the compile push) → moss (submitted / done).
export const STATUSES = [
  { value: 'Booking', label: 'Booking', color: '#3e77a8' },
  { value: 'Assessment', label: 'Assessment', color: '#6e62c4' },
  { value: 'Coordination', label: 'Coordination / Design', color: '#e8b23a' },
  { value: 'Compiling documents', label: 'Compiling documents', color: '#e4572e' },
  { value: 'Submitted', label: 'Submitted', color: '#2e7d4f' },
]

export const STATUS_VALUES = STATUSES.map((s) => s.value)

// First stage is the default for new jobs (manual add and CSV import).
export const DEFAULT_STATUS = STATUSES[0].value

export function statusColor(value) {
  const found = STATUSES.find((s) => s.value === value)
  return found ? found.color : '#6b7885'
}

export function statusLabel(value) {
  const found = STATUSES.find((s) => s.value === value)
  return found ? found.label : value
}

export function statusIndex(value) {
  const i = STATUS_VALUES.indexOf(value)
  return i === -1 ? 0 : i
}
