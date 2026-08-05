// The calendar's one data shape.
//
// Three calendars used to read three things: two read the real jobs list, and
// the Finance one read the business store — a different dataset, which is why a
// job only showed up there once it had costing, and then as a derived copy.
// This module flattens both sources into one entry shape so nothing downstream
// ever asks "is this a job or a Finance entry?" to work out which date field to
// read.
//
// The two stores are still separate and derived rows are still never written
// back (ARCHITECTURE.md §2) — but that is a storage fact, not something the
// calendar tells anyone. On screen a booking is a booking. `kind` survives only
// so a tap can be routed to the right editor.
//
// Pure. No React, no stores — so the merge rules can be reasoned about (and
// argued with) on their own.

import { addDays } from '../lib/dates.js'
import { normalizeStatus, statusColor, statusLabel } from '../lib/status.js'
import {
  jobAddress, jobPostcode, jobCustomer, jobReference, jobMeasure,
} from '../lib/display.js'
import { JOB_TYPES, jobTotal, jobUnits, jobPortions } from '../business/lib/store.js'

/* ---- entry ------------------------------------------------------------
   { id, kind: 'job'|'biz', start, end, days[], time, title, subtitle,
     colour, statusLabel, cancelled, amount, portions|null, units,
     properties[], source }
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

// Finance keeps its own spelling of the same three states. Mapping it onto the
// jobs board's vocabulary is what lets a hand-added booking be coloured and
// labelled exactly like a job — the calendar no longer has to say where an
// entry came from for its colour to mean anything.
const BIZ_STATUS = { booked: 'Booked', done: 'Done', paid: 'Paid' }

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

// Readable text on a solid swatch. Done (#e8b23a) is light enough that white on
// it is unreadable at 10px, and dark ink on Booked navy-blue is just as bad —
// so it is measured, not guessed.
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
  // Identical rule to managerLink.js: a cancelled job earns nothing. If these
  // two ever drift, the calendar and the books tell different stories about
  // the same day.
  const amount = cancelled ? 0 : Number(job.costing?.revenue) || 0

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
    // The raw state, so callers can filter on it — statusLabel is for display
    // and would break the moment a label is reworded.
    status,
    statusLabel: statusLabel(status),
    cancelled,
    amount,
    portions: null,
    units: 1,
    // One job is one property, and the row's own title is its address — so the
    // list below the row stays hidden (it only appears past one property) and
    // nothing repeats. A batch booked from the Dashboard is several jobs
    // sharing a batch_id, so its addresses are already several rows.
    properties: [{
      label: jobAddress(job),
      address: jobAddress(job),
      postcode: jobPostcode(job),
      customer: jobCustomer(job),
      amount,
    }],
    source: job,
  }
}

const addressLines = (v) =>
  String(v || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

// Every property one booking covers — ALWAYS at least one, and the only place
// in the app that decides what "the properties on this booking" means.
//
// It was written twice: once here for the week-ahead list and once in
// lib/epcExport.js for the export. Two readings of the same three fields is how
// a batch comes to list four addresses on screen and send three, which is
// exactly the bug the user would never think to check for. The export reads
// this now.
//
// Two Finance shapes bundle several properties, and both used to reduce to a
// single line plus a "×4" that named none of them: an EPC batch keeps its
// extras in `moreEpcs`, and a blocked-out company week lists them in
// `addresses`, one per line — what that field's label in JobModal asks for.
//
// `label` is for the screen and `address` for the export, deliberately not the
// same field: a row with nothing typed in it still needs something readable
// ("Address to confirm"), and putting that invented text in the export would
// send it off to be looked up as if it were a real address.
function bizProperties(b, t, lines) {
  const customer = b.customer || ''
  const fallback = b.address || b.postcode || t.label
  // Number('0') is falsy, so a free extra with an address still counts. Same
  // test JobModal saves by, or the row it wrote would not be the row we show.
  const extras = (b.moreEpcs || []).filter((x) => x?.address || Number(x?.price))
  if (extras.length) {
    return [
      {
        label: fallback,
        address: b.address || '',
        postcode: b.postcode || '',
        customer,
        amount: Number(b.price) || 0,
      },
      // `moreEpcs` rows have no postcode field at all — the box asks for the
      // address and postcode on one line — so theirs is dug back out of the
      // text by the export.
      ...extras.map((x) => ({
        label: x.address || 'Address to confirm',
        address: x.address || '',
        postcode: '',
        customer,
        amount: Number(x.price) || 0,
      })),
    ]
  }
  // A block priced by the day has no per-property figure, so amount stays null
  // rather than being invented as £0 beside every address.
  if (lines.length) {
    return lines.map((address) => ({
      label: address,
      address,
      postcode: b.postcode || '',
      customer,
      amount: null,
    }))
  }
  return [{
    label: fallback,
    address: b.address || '',
    postcode: b.postcode || '',
    customer,
    amount: jobTotal(b),
  }]
}

export function bizToEntry(b) {
  const start = ymd(b?.date)
  if (!start) return null
  const t = JOB_TYPES[b.type] || JOB_TYPES.other
  const endRaw = ymd(b?.endDate)
  const end = endRaw && endRaw > start ? endRaw : start
  const isBlock = b.type === 'company'
  const status = BIZ_STATUS[b.status] || 'Booked'
  const lines = addressLines(b.addresses)

  const detail = [t.label]
  if (b.address) detail.push(b.address)
  // The ellipsis promises more addresses below, so only add it when there are
  // any — a one-address block was claiming to be hiding something.
  else if (isBlock && lines.length) detail.push(lines.length > 1 ? `${lines[0]}…` : lines[0])
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
    // Status colour, not the work-type colour these used to carry. The type
    // palette existed to mark an entry as Finance's; it also collided (Company
    // Work #E8B23A is Done #e8b23a), so an outline had to be added on top to
    // tell them apart — which is precisely the badge that is now gone. The
    // work type is still shown, as words, in the entry's details.
    colour: statusColor(status),
    status,
    statusLabel: statusLabel(status),
    cancelled: false,
    // No new money maths — these are the Finance tab's own functions, so a
    // figure on the calendar is the same figure the books use.
    amount: jobTotal(b),
    portions: jobPortions(b),
    units: jobUnits(b),
    properties: bizProperties(b, t, lines),
    typeLabel: t.label,
    source: b,
  }
}

// Everything an entry's two-line row cannot show, for the read-only panel.
//
// Built here rather than in the row because this module is already the one
// place that understands both record shapes — so the row stays presentational
// and has no reason to branch on where a booking is stored. Empty fields drop
// out, which is why a job and a Finance entry produce a list that reads the
// same even though their underlying records share almost no keys.
export function entryDetails(entry) {
  const s = entry?.source
  if (!s) return []
  const pairs =
    entry.kind === 'job'
      ? [
          ['Customer', jobCustomer(s)],
          ['Address', jobAddress(s)],
          ['Postcode', jobPostcode(s)],
          ['Reference', jobReference(s)],
          ['Measure', jobMeasure(s)],
          ['Notes', s?.data?.Notes],
        ]
      : [
          ['Work', entry.typeLabel],
          ['Customer', s.customer],
          ['Phone', s.phone],
          ['Address', s.address],
          ['Postcode', s.postcode],
          // Only when the row is NOT already listing them property by property,
          // which is the readable version of the same field. One property is
          // never listed (it would repeat the row), so its text belongs here.
          ['Addresses', entry.properties?.length > 1 ? '' : s.addresses],
          ['Notes', s.notes],
        ]
  return pairs
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([label, value]) => ({ label, value: String(value) }))
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
