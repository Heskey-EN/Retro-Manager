// The calendar's one data shape.
//
// Three calendars used to read three things: two read the real jobs list, and
// the Finance one read the business store — a different dataset, which is why a
// job only showed up there once it had costing, and then as a derived copy.
// This module flattens both sources into one entry shape so nothing downstream
// ever asks "is this a job or a Finance entry?" to work out which date field to
// read.
//
// Pure. No React, no stores — so the merge rules can be reasoned about (and
// argued with) on their own.

import { addDays } from '../lib/dates.js'
import { normalizeStatus, statusColor, statusLabel } from '../lib/status.js'
import { jobAddress, jobPostcode, jobCustomer } from '../lib/display.js'
import { JOB_TYPES, jobTotal, jobUnits, jobPortions } from '../business/lib/store.js'

/* ---- entry ------------------------------------------------------------
   { id, kind: 'job'|'biz', start, end, days[], time, title, subtitle,
     colour, statusLabel, cancelled, amount, portions|null, units, source }
   `source` is the ORIGINAL job or Finance entry — the hosts open that, so the
   existing JobView / JobModal keep working untouched.
   ---------------------------------------------------------------------- */

// A run longer than a month is a data error, not a booking. csv.js sets
// `end_date: end || start` straight from a spreadsheet column, so one bad cell
// could otherwise smear a bar across every month the user scrolls to. Past the
// cap the entry collapses to its start day and the day sheet says where it runs
// to, which is honest and takes one line instead of 400 cells.
export const SPAN_CAP = 31

const ymd = (v) => {
  const s = typeof v === 'string' ? v.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

const BIZ_STATUS = { booked: 'Booked', done: 'Done — unpaid', paid: 'Paid' }

export function expandDays(startIso, endIso) {
  if (!startIso) return []
  if (!endIso || endIso <= startIso) return [startIso]
  const days = []
  let d = startIso
  while (d <= endIso && days.length < SPAN_CAP) {
    days.push(d)
    d = addDays(d, 1)
  }
  return d <= endIso ? [startIso] : days
}

// Readable text on a solid swatch. Done (#e8b23a) and Company Work (#E8B23A)
// are light enough that white on them is unreadable at 10px, and dark ink on
// Booked navy-blue is just as bad — so it is measured, not guessed.
export function inkOn(hex) {
  const h = String(hex || '').replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (n.length !== 6) return '#FFFFFF'
  const chan = (i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4)
  return L > 0.45 ? '#0D1B2A' : '#FFFFFF'
}

export function jobToEntry(job) {
  const start = ymd(job?.start_date)
  if (!start) return null
  const endRaw = ymd(job?.end_date)
  const end = endRaw && endRaw > start ? endRaw : start
  // Always through normalizeStatus, so jobs still carrying the old pipeline
  // names colour and read correctly rather than falling back to grey.
  const status = normalizeStatus(job.status)
  const cancelled = status === 'Cancelled'
  const subtitle = [jobPostcode(job), jobCustomer(job)].filter(Boolean).join(' · ')

  return {
    id: `job:${job.id}`,
    kind: 'job',
    start,
    end,
    days: expandDays(start, end),
    time: job?.data?.Time || '',
    title: jobAddress(job),
    subtitle,
    colour: statusColor(status),
    statusLabel: statusLabel(status),
    cancelled,
    // Identical rule to managerLink.js: a cancelled job earns nothing. If these
    // two ever drift, the calendar and the books tell different stories about
    // the same day.
    amount: cancelled ? 0 : Number(job.costing?.revenue) || 0,
    portions: null,
    units: 1,
    source: job,
  }
}

export function bizToEntry(b) {
  const start = ymd(b?.date)
  if (!start) return null
  const t = JOB_TYPES[b.type] || JOB_TYPES.other
  const endRaw = ymd(b?.endDate)
  const end = endRaw && endRaw > start ? endRaw : start
  const isBlock = b.type === 'company'

  const detail = [t.label]
  if (b.address) detail.push(b.address)
  else if (isBlock && b.addresses) detail.push(`${String(b.addresses).split('\n')[0]}…`)
  if (b.postcode) detail.push(b.postcode)

  return {
    id: `biz:${b.id}`,
    kind: 'biz',
    start,
    end,
    days: expandDays(start, end),
    time: b.time || '',
    title: b.customer || t.label,
    subtitle: detail.join(' · '),
    colour: t.color,
    statusLabel: BIZ_STATUS[b.status] || 'Booked',
    cancelled: false,
    // No new money maths — these are the Finance tab's own functions, so a
    // figure on the calendar is the same figure the books use.
    amount: jobTotal(b),
    portions: jobPortions(b),
    units: jobUnits(b),
    typeLabel: t.label,
    source: b,
  }
}

// What this entry is worth ON a particular day. A company week at a day rate
// shows its true daily share rather than the whole block's value on every cell.
export function amountOn(entry, iso) {
  if (!entry) return 0
  if (entry.kind === 'job') return iso === entry.start ? entry.amount : 0
  const p = entry.portions?.find((x) => x.date === iso)
  if (p) return p.income
  return iso === entry.start ? entry.amount : 0
}

// Rows managerLink.js derived from a costed job. They are copies of jobs that
// are already in the real jobs array.
export const isDerived = (b) => b?._linked === true || String(b?.id || '').startsWith('rmt-')

// The merge, and the whole no-double-counting rule:
//
//   Drop every derived row from the Finance side — the real job carries that
//   day. Nothing disappears, because a derived row only exists while its job
//   does.
//
//   Keep every hand-added Finance entry (EPC work, company blocks). They have
//   no _linked flag and are the reason the business store still exists.
//
// Deliberately NO fuzzy dedupe. A hand-typed entry that mirrors a real job is
// not detectable by id, and there is already a purpose-built tool for it
// (business/components/CleanupDuplicates.jsx, postcode + house number). Quietly
// hiding something the user typed would be worse than showing it twice.
export function mergeEntries({ jobs = [], bizJobs = [] }) {
  const entries = []
  for (const j of jobs) {
    const e = jobToEntry(j)
    if (e) entries.push(e)
  }
  for (const b of bizJobs) {
    if (isDerived(b)) continue
    const e = bizToEntry(b)
    if (e) entries.push(e)
  }

  const byDate = {}
  for (const e of entries) {
    for (const d of e.days) (byDate[d] ||= []).push(e)
  }
  const order = (a, b) =>
    (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title, 'en', { numeric: true })
  for (const k of Object.keys(byDate)) byDate[k].sort(order)

  return { entries, byDate }
}
