// Date helpers — all dates stored as 'YYYY-MM-DD' strings, weeks run Mon–Sun,
// tax year runs 6 April – 5 April (UK).

export function toISO(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = () => toISO(new Date())

export function addDays(iso, n) {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function fmtShort(iso) {
  return fromISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtLong(iso) {
  return fromISO(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function fmtDayMonth(iso) {
  return fromISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Monday of the week containing the given date
export function weekStart(iso) {
  const d = fromISO(iso)
  const day = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - day)
  return toISO(d)
}

// UK tax year containing the given date: 6 Apr – 5 Apr
export function taxYearFor(iso) {
  const d = fromISO(iso)
  const y = d.getFullYear()
  const startYear = d < new Date(y, 3, 6) ? y - 1 : y
  return {
    start: toISO(new Date(startYear, 3, 6)),
    end: toISO(new Date(startYear + 1, 3, 5)),
    label: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`,
  }
}

export function isWithin(iso, startISO, endISO) {
  return iso >= startISO && iso <= endISO
}

// Every date a job occupies (company blocks can span endDate)
export function jobDates(job) {
  if (!job.endDate || job.endDate <= job.date) return [job.date]
  const dates = []
  let d = job.date
  while (d <= job.endDate && dates.length < 366) {
    dates.push(d)
    d = addDays(d, 1)
  }
  return dates
}
