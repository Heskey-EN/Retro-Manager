// A week of bookings, as the one spreadsheet the EPC checker can actually read.
//
// WHY THIS SHAPE — three columns, no dates, no reference, no money:
//
// The EPC checker (Heskey-EN/EPC-Checker26, /admin → "Bulk EPC lookup") has no
// import API. An admin spreadsheet upload is the only way in, and its parser
// has no address-column picker: the text it matches on is EVERY CELL EXCEPT the
// postcode column, joined with ", ". Its scorer is
//
//     0.65 × (shared number tokens ÷ max(our numbers, register numbers))
//   + 0.35 × (register words found in ours ÷ register words)
//
// against a 0.45 cut-off. Extra WORD columns are therefore free — a name we add
// can only ever be a word the register did not ask for — while extra NUMBER
// columns are poison, because every number we send enlarges that denominator.
//
// Measured against the real matcher: Address + Postcode + Customer scores
// 1.000, and the obvious "export everything" sheet (job reference, both dates,
// revenue) scores 0.422 — under the threshold, so every row comes back "no
// confident match" with nothing on screen to say why. Leaving the postcode
// inside the address text does the same damage on its own (1.000 → 0.567): its
// two tokens both carry digits.
//
// Hence three columns, and the postcode lifted out of the address.

import { addDays, fmtShort, weekStart } from './dates.js'

// Order matters only for readability — the checker finds the postcode column by
// name and treats everything else as address text.
export const EPC_COLUMNS = ['Address', 'Postcode', 'Customer']

/* ---- text ------------------------------------------------------------- */

// One line, no empty segments: addresses arrive with newlines (a blocked-out
// week lists one property per line), double commas and stray spacing.
function tidy(text) {
  return String(text ?? '')
    .replace(/[\r\n]+/g, ', ')
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ')
}

// The checker's own postcode normalisation, reproduced exactly ("fy13rh" →
// "FY1 3RH"). Matching it matters for reading the results back: its results
// sheet echoes the postcode normalised, so an identical string here means the
// two files join on (Address, Postcode) with no cleaning step.
export function normalisePostcode(raw) {
  const compact = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length < 5) return compact
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

// A UK postcode anywhere in free text — kept close to the checker's own regex
// so the two agree about what a postcode is. The word boundaries are ours: they
// stop it biting "B2 3RD" out of the middle of "Unit B2 3RD Avenue".
const POSTCODE_ANYWHERE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi

// Split "12 Oak Avenue, Leeds LS1 4AB" into its address and its postcode.
//
// The LAST match wins, because a postcode belongs at the end of an address and
// anything earlier that merely looks like one is far more likely to be a flat
// or unit number we would rather not delete.
export function splitPostcodeFromAddress(text) {
  const s = String(text ?? '')
  const found = [...s.matchAll(POSTCODE_ANYWHERE)]
  if (!found.length) return { address: tidy(s), postcode: '' }
  const last = found[found.length - 1]
  const without = `${s.slice(0, last.index)} ${s.slice(last.index + last[0].length)}`
  return { address: tidy(without), postcode: normalisePostcode(last[0]) }
}

// A customer name is free — see the header. A name carrying a digit is not, so
// it is dropped rather than sent: one stray number is worth ~0.3 of match
// score, which is the difference between a floor area and a blank row.
function customerForExport(value) {
  const name = tidy(value)
  return /\d/.test(name) ? '' : name
}

// Same normalisation the checker matches on, used here only to spot the same
// property twice in one week. Not exported: it is a comparison key, never
// something we write to the file.
const addressKey = (address) =>
  String(address ?? '')
    .toUpperCase()
    .replace(/\b(FLAT|APARTMENT|APT)\b/g, 'FLAT')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/* ---- weeks ------------------------------------------------------------ */

// Mon–Sun, the same week the Finance tab counts by.
export function weekRangeFor(iso) {
  const start = weekStart(iso)
  const end = addDays(start, 6)
  return { start, end, label: `${fmtShort(start)} – ${fmtShort(end)}` }
}

export const epcFilename = (startIso) => `epc-week-${startIso}.csv`

/* ---- rows ------------------------------------------------------------- */

// Which properties a booking covers is decided ONCE, in calendar/entries.js,
// and every entry carries the answer. This module deliberately does not work it
// out again: the week-ahead list and this file each having their own reading of
// `moreEpcs` / `addresses` is how a batch would come to show four addresses and
// export three, with nothing on either screen to reveal the disagreement.
//
// `label` is not read here. It is the display fallback ("Address to confirm"),
// and an invented address is the one thing that must never reach the checker.
const propertiesOf = (entry) => entry?.properties || []

/**
 * The rows to export for one week, from merged calendar entries.
 *
 * ONE ROW PER PROPERTY — not per job and not per day. A multi-day booking is
 * still one property; the checker has no concept of dates, so a second row
 * would repeat the same lookup and burn the daily API allowance twice.
 *
 * Returns `{ rows, stats }` so the screen can say what is being exported
 * before anything downloads.
 */
export function epcRowsForWeek(entries = [], startIso, endIso) {
  // Overlap, not "starts in the week": a run that began last Friday is still
  // work standing on Monday. Cancelled bookings are left out — nobody is
  // visiting them, and each row costs a lookup.
  const inWeek = entries.filter(
    (e) => e && !e.cancelled && e.start <= endIso && e.end >= startIso,
  )

  const rows = []
  const byKey = new Map() // `${addressKey}|${postcode}` → row
  const byAddress = new Map() // addressKey → the row already holding that property
  const skipped = []
  let merged = 0

  for (const entry of inWeek) {
    for (const p of propertiesOf(entry)) {
      const split = splitPostcodeFromAddress(p.address)
      const address = split.address
      // A typed postcode field wins; the one found in the address text is the
      // fallback for the shapes that have no field of their own.
      const postcode = normalisePostcode(p.postcode) || split.postcode
      const customer = customerForExport(p.customer)

      const key = addressKey(address)
      if (!key) {
        // A postcode with no street scores 0.000 against every register row —
        // it can never match, so exporting it would only look like work.
        skipped.push(entry.title || postcode || 'Untitled booking')
        continue
      }

      const exact = byKey.get(`${key}|${postcode}`)
      if (exact) {
        merged += 1
        if (!exact.customer) exact.customer = customer
        continue
      }

      // The same address typed once with its postcode and once without is one
      // property, and only the version carrying the postcode can be looked up.
      const sameAddress = byAddress.get(key)
      if (sameAddress && (!postcode || !sameAddress.postcode)) {
        merged += 1
        if (postcode && !sameAddress.postcode) {
          byKey.delete(`${key}|`)
          sameAddress.postcode = postcode
          byKey.set(`${key}|${postcode}`, sameAddress)
        }
        if (!sameAddress.customer) sameAddress.customer = customer
        continue
      }

      const row = { address, postcode, customer }
      rows.push(row)
      byKey.set(`${key}|${postcode}`, row)
      if (!sameAddress) byAddress.set(key, row)
    }
  }

  return {
    rows,
    stats: {
      bookings: inWeek.length,
      properties: rows.length,
      // Still exported: the checker answers "No postcode found" for these,
      // which is a visible result rather than a silently missing row.
      withoutPostcode: rows.filter((r) => !r.postcode).length,
      merged,
      skipped,
    },
  }
}

/* ---- file ------------------------------------------------------------- */

// RFC4180: quote anything holding a comma, a quote or a line break, and double
// the quotes inside.
const cell = (value) => {
  const s = String(value ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows = []) {
  const lines = [EPC_COLUMNS.join(',')]
  for (const r of rows) lines.push([r.address, r.postcode, r.customer].map(cell).join(','))
  // CRLF line endings, and a byte-order mark so Excel reads an accented name
  // correctly if the file is opened before it is uploaded. The BOM is safe at
  // the far end: the checker reads the sheet with SheetJS, which strips it —
  // and even unstripped it lands in a HEADER cell, which that parser drops
  // whole (it detects the header by the word "postcode" in another column).
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
