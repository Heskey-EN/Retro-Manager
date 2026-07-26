import Papa from 'papaparse'
import { DEFAULT_STATUS } from './status'

// Column-name fragments used to map CSV columns onto the fields the app shows.
// The property address is the headline for a retrofit job, so it wins the title;
// the reference, postcode, customer and measure are pulled out for display too.
const ADDRESS_HINTS = ['property address', 'site address', 'address', 'property', 'site']
const REF_HINTS = ['job reference', 'jobref', 'reference', 'job number', 'job no', 'ref', 'id']
const POSTCODE_HINTS = ['postcode', 'post code', 'postal', 'zip']
const CUSTOMER_HINTS = ['customer', 'client', 'occupant', 'tenant', 'homeowner', 'resident', 'name', 'contact']
const MEASURE_HINTS = ['measure', 'work type', 'works', 'installation', 'product', 'scope']
const START_HINTS = ['start', 'install', 'begin', 'scheduled', 'date', 'visit', 'survey']
const END_HINTS = ['end', 'finish', 'complete', 'completion', 'due', 'target']

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function pickColumn(headers, hints, exclude = []) {
  const excluded = new Set(exclude)
  for (const hint of hints) {
    const match = headers.find((h) => !excluded.has(h) && norm(h).includes(norm(hint)))
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
export async function parseFile(file, opts = {}) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
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
          const headers = results.meta.fields || []
          const addressCol = pickColumn(headers, ADDRESS_HINTS)
          const refCol = pickColumn(headers, REF_HINTS, [addressCol])
          const postcodeCol = pickColumn(headers, POSTCODE_HINTS, [addressCol, refCol])
          const measureCol = pickColumn(headers, MEASURE_HINTS, [addressCol, refCol, postcodeCol])
          const customerCol = pickColumn(headers, CUSTOMER_HINTS, [addressCol, refCol, postcodeCol, measureCol])
          const startCol = pickColumn(headers, START_HINTS, [refCol, postcodeCol])
          const endCol = pickColumn(headers, END_HINTS, [startCol, refCol, postcodeCol])

          const jobs = results.data
            .filter((row) => Object.values(row).some((v) => String(v ?? '').trim() !== ''))
            .map((row) => {
              const start = startCol ? parseDate(row[startCol]) : null
              const end = endCol ? parseDate(row[endCol]) : null
              return {
                title: buildTitle(row, addressCol, refCol),
                reference: cell(row, refCol),
                postcode: cell(row, postcodeCol).toUpperCase(),
                customer: cell(row, customerCol),
                measure: cell(row, measureCol),
                status: DEFAULT_STATUS,
                start_date: start,
                end_date: end || start,
                data: row,
                batch_id: batchId || null,
              }
            })

          resolve({
            jobs,
            headers,
            mapping: { addressCol, refCol, postcodeCol, customerCol, measureCol, startCol, endCol },
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
