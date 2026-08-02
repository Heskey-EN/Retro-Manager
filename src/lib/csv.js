import Papa from 'papaparse'
import { DEFAULT_STATUS } from './status'

// Column-name fragments used to map CSV columns onto the fields the app shows.
// The property address is the headline for a retrofit job, so it wins the title;
// the reference, postcode, customer and measure are pulled out for display too.
// Real spreadsheets have typos ("Adress"), stray punctuation (" £") and blank
// spacer columns, so hints are matched against a stripped-down form of the
// header and a couple of common misspellings are listed outright.
const ADDRESS_HINTS = ['property address', 'site address', 'address', 'adress', 'addres', 'property', 'site']
const REF_HINTS = ['job reference', 'jobref', 'reference', 'job number', 'job no', 'ref', 'id']
const POSTCODE_HINTS = ['postcode', 'post code', 'postal', 'zip']
const CUSTOMER_HINTS = ['customer', 'client', 'occupant', 'tenant', 'homeowner', 'resident', 'name', 'contact']
const MEASURE_HINTS = ['measure', 'work type', 'works', 'installation', 'product', 'scope']
const START_HINTS = ['start', 'install', 'begin', 'scheduled', 'date', 'visit', 'survey']
const END_HINTS = ['end', 'finish', 'complete', 'completion', 'due', 'target']
const PRICE_HINTS = ['price', '£', 'gbp', 'amount', 'cost', 'fee', 'value', 'charge', 'total']
const STATUS_HINTS = ['status', 'stage', 'progress', 'state']

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// A UK postcode sitting at the START of a free-text address cell, e.g.
// "FY1 3RH -7 Henthorne" or "FY3 7QT 227 Dinmore Avenue".
const LEADING_POSTCODE = /^\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*[-–—,:]?\s*(.*)$/i

// Split "POSTCODE - street" into its two halves. Returns { postcode, address }
// with postcode '' when the cell doesn't start with one.
export function splitPostcode(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { postcode: '', address: '' }
  const m = LEADING_POSTCODE.exec(raw)
  if (!m) return { postcode: '', address: raw }
  const pc = m[1].toUpperCase().replace(/\s+/g, '')
  // Re-space to the standard "OUTCODE INCODE" form.
  return { postcode: `${pc.slice(0, -3)} ${pc.slice(-3)}`, address: m[2].trim() }
}

// Map whatever the spreadsheet calls a stage onto one of ours.
export function mapStatus(value, fallback) {
  const s = norm(value)
  if (!s) return fallback
  if (/(cancel|abort|dead|lost)/.test(s)) return 'Cancelled'
  if (/(lodged|done|complete|submitted|finish|closed)/.test(s)) return 'Submitted'
  if (/(compil|document|paperwork)/.test(s)) return 'Compiling documents'
  if (/(coordinat|design)/.test(s)) return 'Coordination'
  if (/(assess|survey|visit|inspect)/.test(s)) return 'Assessment'
  if (/(pending|booked|booking|scheduled|new)/.test(s)) return 'Booking'
  return fallback
}

// Money out of a cell that might read "£1,250.00", "1250", "35" or "".
export function parsePrice(value) {
  if (value == null) return 0
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function pickColumn(headers, hints, exclude = []) {
  const excluded = new Set(exclude)
  for (const hint of hints) {
    const n = norm(hint)
    // '£' normalises to '' — match it against the raw header instead, so a
    // column headed " £" is still found.
    if (!n) {
      const raw = headers.find((h) => !excluded.has(h) && String(h).includes(hint))
      if (raw) return raw
      continue
    }
    const match = headers.find((h) => !excluded.has(h) && norm(h).includes(n))
    if (match) return match
  }
  return null
}

// True only for a real calendar date — Date() would happily roll '2026-09-31'
// over into October, and Postgres rejects impossible dates with an error that
// (because imports insert as one batch) would fail the entire file.
function isRealDate(y, m, d) {
  const yy = Number(y), mm = Number(m), dd = Number(d)
  const dt = new Date(Date.UTC(yy, mm - 1, dd))
  return dt.getUTCFullYear() === yy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd
}

/* ── Date columns that mix formats ──────────────────────────────────────
   A real export can hold BOTH "1/19/26" (American M/D) and "21/03/2026"
   (British D/M) in one column — reading them all one way silently turns
   7 February into 2 July, which is worse than refusing to import.

   So we read the whole column first. A part above 12 can only be a day, so
   those rows prove their own order; the rest inherit the proven order. The
   proof is tracked per year-shape (2-digit vs 4-digit) because that is
   usually where the two sources differ — as it does in exactly this file.   */

const SLASHED = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/

function detectDayFirst(values) {
  const tally = { 2: { dmy: 0, mdy: 0 }, 4: { dmy: 0, mdy: 0 } }
  for (const v of values) {
    const m = SLASHED.exec(String(v ?? '').trim())
    if (!m) continue
    const [, a, b, y] = m
    const shape = y.length <= 2 ? 2 : 4
    if (Number(a) > 12 && Number(b) <= 12) tally[shape].dmy++
    else if (Number(b) > 12 && Number(a) <= 12) tally[shape].mdy++
  }
  return {
    // UK data is the norm here, so an undecidable column stays day-first.
    2: tally[2].mdy > tally[2].dmy ? false : true,
    4: tally[4].mdy > tally[4].dmy ? false : true,
    evidence: tally,
  }
}

// Build a parser bound to one column's detected convention.
export function dateParserFor(values) {
  const style = detectDayFirst(values)
  const parse = (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const m = SLASHED.exec(raw)
    if (m) {
      const [, a, b, yy] = m
      const shape = yy.length <= 2 ? 2 : 4
      let dayFirst = style[shape]
      // A value that proves its own order always wins over the column's.
      if (Number(a) > 12) dayFirst = true
      else if (Number(b) > 12) dayFirst = false
      const d = dayFirst ? a : b
      const mo = dayFirst ? b : a
      const y = yy.length === 2 ? `20${yy}` : yy
      const dd = String(d).padStart(2, '0')
      const mm = String(mo).padStart(2, '0')
      if (!isRealDate(y, mm, dd)) return null
      return `${y}-${mm}-${dd}`
    }
    return parseDate(raw) // ISO, "12 Jan 2026", Excel dates…
  }
  parse.style = style
  return parse
}

// Accepts a wide range of human date formats and returns YYYY-MM-DD or null.
export function parseDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  // DD/MM/YYYY or DD-MM-YYYY (UK convention — common in Eco Futures data)
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = `20${y}`
    const dd = String(d).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    if (!isRealDate(y, mm, dd)) return null
    return `${y}-${mm}-${dd}`
  }

  // ISO-ish YYYY-MM-DD already
  const iso = raw.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    if (!isRealDate(y, m, d)) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // Fall back to Date parsing (e.g. "12 Jan 2026", "Jan 12 2026").
  // Build the yyyy-mm-dd from LOCAL components — toISOString() would shift the
  // date back a day in timezones ahead of UTC (e.g. UK in BST).
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const mm = String(parsed.getMonth() + 1).padStart(2, '0')
    const dd = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }
  return null
}

const cell = (row, col) => (col && row[col] != null ? String(row[col]).trim() : '')

/* ── Finding columns by what's IN them ──────────────────────────────────
   Header names are a hint, not a guarantee: a sheet can call the address
   column anything, or have no usable header row at all. So after matching
   on names, any role still unfilled is worked out from the data itself —
   which column actually holds postcodes, dates, money, and so on. That
   makes the position and the wording of the columns irrelevant.            */

const WHOLE_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const share = (values, test) => {
  const nonEmpty = values.filter((v) => String(v ?? '').trim() !== '')
  if (nonEmpty.length < 2) return 0
  return nonEmpty.filter(test).length / nonEmpty.length
}

// `filled` is the set of roles the header names already answered — those are
// skipped, so a leftover column can never be mislabelled as something we
// already have (and never reported as a guess when it wasn't one).
function sniffColumns(rows, headers, taken, filled) {
  const free = headers.filter((h) => !taken.has(h))
  const colValues = (h) => rows.map((r) => r[h])
  const found = {}
  const claim = (role, header) => {
    if (!header || filled.has(role)) return
    found[role] = header
    taken.add(header)
  }

  // Postcode: the whole cell is a postcode.
  claim('postcodeCol', free.find((h) => share(colValues(h), (v) => WHOLE_POSTCODE.test(String(v).trim())) >= 0.6))

  // Address: mostly longer free text, and often carries a postcode at the
  // front. Pick the strongest such column, preferring the longest text.
  const addressCandidates = free
    .filter((h) => !taken.has(h))
    .map((h) => {
      const vals = colValues(h).map((v) => String(v ?? '').trim()).filter(Boolean)
      if (vals.length < 2) return null
      const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length
      const withPostcode = share(vals, (v) => LEADING_POSTCODE.test(v))
      const numeric = share(vals, (v) => /^[£$€]?\s*[\d,.]+$/.test(v))
      if (numeric > 0.5 || avgLen < 6) return null
      return { h, score: withPostcode * 2 + Math.min(avgLen, 40) / 40 }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
  claim('addressCol', addressCandidates[0]?.h)

  // Dates.
  claim('startCol', free.find((h) => !taken.has(h) && share(colValues(h), (v) => parseDate(v) != null) >= 0.6))

  // Money: numeric, and at least one value above zero.
  claim('priceCol', free.find((h) => {
    if (taken.has(h)) return false
    const vals = colValues(h)
    return share(vals, (v) => /^[£$€]?\s*[\d,]+(\.\d+)?$/.test(String(v).trim())) >= 0.6 &&
      vals.some((v) => parsePrice(v) > 0)
  }))

  // Status: a small vocabulary of short repeated words whose values actually
  // READ like job stages. "Small vocabulary" alone isn't enough — a Pay Method
  // column looks identical by shape, so the winner is the column whose values
  // we can most often recognise as a stage.
  const statusCandidates = free
    .filter((h) => !taken.has(h))
    .map((h) => {
      const vals = colValues(h).map((v) => String(v ?? '').trim()).filter(Boolean)
      if (vals.length < 4) return null
      const distinct = new Set(vals.map((v) => v.toLowerCase()))
      const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length
      if (distinct.size > 8 || avgLen > 28) return null
      if (vals.some((v) => /^[£$€]?\s*[\d,.]+$/.test(v))) return null
      const recognised = vals.filter((v) => mapStatus(v, null) != null).length / vals.length
      return recognised >= 0.5 ? { h, recognised } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.recognised - a.recognised)
  claim('statusCol', statusCandidates[0]?.h)

  return found
}

function buildTitle(row, addressCol, refCol) {
  const address = cell(row, addressCol)
  if (address) return address
  const ref = cell(row, refCol)
  if (ref) return ref
  // No address or reference: first non-empty value.
  const first = Object.values(row).map((v) => String(v ?? '').trim()).find(Boolean)
  return first || 'Untitled job'
}

// Parse any supported spreadsheet/CSV file into normalised jobs. Excel files
// (.xlsx/.xls) are converted to CSV via SheetJS (loaded on demand), then run
// through the same column-detection path as CSV, so property addresses are
// found regardless of the source format.
// Is this workbook bytes rather than text? Checked by signature, so a
// spreadsheet with the wrong extension (or none) still parses: XLSX/XLSM/ODS
// are ZIP archives ("PK"), and legacy XLS is an OLE2 compound file.
async function isWorkbook(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    if (head[0] === 0x50 && head[1] === 0x4b) return true
    if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return true
  } catch {
    /* fall through to the extension check */
  }
  return /\.(xlsx|xlsm|xlsb|xls|xltx|xltm|ods)$/i.test(file.name || '')
}

export async function parseFile(file, opts = {}) {
  // Raw text handed in directly (the CSV path) has no slice/name.
  if (typeof file === 'string' || typeof file?.slice !== 'function') return parseCsv(file, opts)

  if (await isWorkbook(file)) {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    // cellDates + an ISO dateNF: without them SheetJS renders Excel's default
    // Short Date format as 'm/d/yy' regardless of the workbook's UK locale,
    // and parseDate's DD/MM assumption then silently swaps day and month.
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!firstSheet) return { jobs: [], headers: [], mapping: {} }
    const csv = XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false, dateNF: 'yyyy-mm-dd' })
    return parseCsv(csv, opts)
  }
  return parseCsv(file, opts)
}

// Parse a File (or raw text) into normalised job objects. Returns a Promise.
export function parseCsv(input, { batchId } = {}) {
  return new Promise((resolve, reject) => {
    const config = {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        try {
          // Blank spacer columns are common in hand-made sheets; Papa names
          // them '' or '__parsed_extra'. They can never be a real field.
          const headers = (results.meta.fields || []).filter((h) => String(h ?? '').trim() !== '')
          const addressCol = pickColumn(headers, ADDRESS_HINTS)
          const refCol = pickColumn(headers, REF_HINTS, [addressCol])
          const postcodeCol = pickColumn(headers, POSTCODE_HINTS, [addressCol, refCol])
          const measureCol = pickColumn(headers, MEASURE_HINTS, [addressCol, refCol, postcodeCol])
          const customerCol = pickColumn(headers, CUSTOMER_HINTS, [addressCol, refCol, postcodeCol, measureCol])
          const statusCol = pickColumn(headers, STATUS_HINTS, [addressCol, refCol, postcodeCol, measureCol, customerCol])
          const priceCol = pickColumn(headers, PRICE_HINTS, [addressCol, refCol, postcodeCol, measureCol, customerCol, statusCol])
          const startCol = pickColumn(headers, START_HINTS, [refCol, postcodeCol, statusCol, priceCol])
          const endCol = pickColumn(headers, END_HINTS, [startCol, refCol, postcodeCol, statusCol, priceCol])

          const rows = results.data.filter((row) =>
            Object.values(row).some((v) => String(v ?? '').trim() !== ''),
          )

          // Anything the header names didn't identify, work out from the data,
          // so a column being renamed or moved doesn't break the import.
          const taken = new Set(
            [addressCol, refCol, postcodeCol, measureCol, customerCol, statusCol, priceCol, startCol, endCol].filter(Boolean),
          )
          const filledRoles = new Set(
            Object.entries({ addressCol, postcodeCol, statusCol, priceCol, startCol })
              .filter(([, v]) => v)
              .map(([k]) => k),
          )
          const sniffed = sniffColumns(rows, headers, taken, filledRoles)
          const pick = (named, role) => named || sniffed[role] || null
          const finalAddress = pick(addressCol, 'addressCol')
          const finalPostcode = pick(postcodeCol, 'postcodeCol')
          const finalStatus = pick(statusCol, 'statusCol')
          const finalPrice = pick(priceCol, 'priceCol')
          const finalStart = pick(startCol, 'startCol')

          // Decide each date column's convention from the whole column before
          // reading any single value out of it.
          const parseStart = finalStart ? dateParserFor(rows.map((r) => r[finalStart])) : () => null
          const parseEnd = endCol ? dateParserFor(rows.map((r) => r[endCol])) : () => null

          const jobs = rows.map((row) => {
            const start = parseStart(row[finalStart])
            const end = parseEnd(row[endCol])
            // The address cell often carries the postcode too; a dedicated
            // postcode column always wins when there is one.
            const split = splitPostcode(cell(row, finalAddress))
            const postcode = (cell(row, finalPostcode) || split.postcode).toUpperCase()
            const address = split.address || cell(row, finalAddress)
            const price = finalPrice ? parsePrice(row[finalPrice]) : 0

            // `data` keeps the columns we DIDN'T promote to a real field —
            // "Pay Method" and the like. Keeping the promoted ones too would
            // show every value twice and make an import's summary unreadable.
            const promoted = new Set(
              [finalAddress, finalPostcode, finalStatus, finalPrice, finalStart, endCol, refCol, customerCol, measureCol]
                .filter(Boolean),
            )
            const data = {}
            for (const [k, v] of Object.entries(row)) {
              if (String(k ?? '').trim() === '' || String(v ?? '').trim() === '') continue
              if (promoted.has(k)) continue
              data[k] = v
            }
            if (address) data.Address = address

            return {
              title: address || postcode || buildTitle(row, finalAddress, refCol),
              reference: cell(row, refCol),
              postcode,
              customer: cell(row, customerCol),
              measure: cell(row, measureCol),
              status: finalStatus ? mapStatus(row[finalStatus], DEFAULT_STATUS) : DEFAULT_STATUS,
              start_date: start,
              end_date: end || start,
              // Price becomes costing, which is what the Finance tab reads.
              ...(price > 0 ? { costing: { revenue: price, items: [] } } : {}),
              data,
              batch_id: batchId || null,
            }
          })

          resolve({
            jobs,
            headers,
            mapping: {
              addressCol: finalAddress, refCol, postcodeCol: finalPostcode, customerCol, measureCol,
              statusCol: finalStatus, priceCol: finalPrice, startCol: finalStart, endCol,
              // Which roles were worked out from the data rather than a header,
              // so the review screen can show what it guessed.
              sniffed: Object.keys(sniffed),
              dateStyle: parseStart.style || null,
            },
          })
        } catch (err) {
          reject(err)
        }
      },
      error: (err) => reject(err),
    }

    Papa.parse(input, config)
  })
}
