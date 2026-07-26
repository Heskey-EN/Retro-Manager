// CSV → jobs importer, and the earnings/expenses spreadsheet export.
// The importer is tolerant of quoting, UK date formats and varied
// column names so exports from Excel/Google Sheets "just work".

import { jobTotal, jobUnits, accountOf, ACCOUNTS, JOB_TYPES } from './store.js'

// Standard CSV parse with quoted-field support ("" escapes a quote)
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const pad2 = (n) => String(n).padStart(2, '0')

// Accepts 2026-07-06, 06/07/2026, 6/7/26, 06.07.2026, 06-07-2026 (UK day-first)
export function normalizeDate(s) {
  s = (s || '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`
    return null
  }
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`
  }
  return null
}

// Accepts 09:30, 9:30, 9.30, 2:15pm → 24h HH:MM
export function normalizeTime(s) {
  s = (s || '').trim().toLowerCase()
  const m = s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/)
  if (!m) return ''
  let h = Number(m[1])
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  if (h > 23 || Number(m[2]) > 59) return ''
  return `${pad2(h)}:${m[2]}`
}

const HEADER_ALIASES = {
  date: ['date', 'jobdate', 'bookingdate', 'day'],
  customer: ['customer', 'customername', 'name', 'client', 'company', 'companyname'],
  time: ['time', 'appointmenttime', 'appointment'],
  type: ['type', 'jobtype', 'service'],
  address: ['address', 'addr', 'property', 'propertyaddress', 'addressline', 'firstlineofaddress'],
  postcode: ['postcode', 'postalcode', 'zip', 'zipcode'],
  price: ['price', 'cost', 'fee', 'amount', 'value'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'contactnumber', 'contact'],
  status: ['status'],
  notes: ['notes', 'note', 'comments', 'details'],
  account: ['account', 'costcentre', 'costcenter', 'paidto', 'paid'],
}

// Turn CSV text into ready-to-add job objects. Rows that can't be read are
// reported (with their row number) instead of silently dropped.
export function csvToJobs(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return { jobs: [], errors: ['The file needs a header row plus at least one job row.'] }
  }
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''))
  const colFor = (key) => headers.findIndex((h) => HEADER_ALIASES[key].includes(h))
  const ci = Object.fromEntries(Object.keys(HEADER_ALIASES).map((k) => [k, colFor(k)]))
  if (ci.date === -1) {
    return {
      jobs: [],
      errors: [`No "Date" column found — the first row must name the columns (found: ${rows[0].join(', ')}).`],
    }
  }

  const get = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '')
  const jobs = []
  const errors = []
  rows.slice(1).forEach((r, idx) => {
    const rowNo = idx + 2 // 1-based, after the header
    const date = normalizeDate(get(r, ci.date))
    if (!date) {
      errors.push(`Row ${rowNo}: couldn't read the date "${get(r, ci.date)}" — use DD/MM/YYYY or YYYY-MM-DD.`)
      return
    }
    const rawType = get(r, ci.type).toLowerCase()
    const type = rawType.includes('retro')
      ? 'retrofit'
      : rawType.includes('compan') || rawType.includes('block')
        ? 'company'
        : rawType.includes('other')
          ? 'other'
          : 'epc'
    const rawStatus = get(r, ci.status).toLowerCase()
    const status = rawStatus.includes('paid')
      ? 'paid'
      : rawStatus.includes('done') || rawStatus.includes('complete')
        ? 'done'
        : 'booked'
    jobs.push({
      type,
      date,
      time: normalizeTime(get(r, ci.time)),
      customer: get(r, ci.customer),
      phone: get(r, ci.phone),
      address: get(r, ci.address),
      postcode: get(r, ci.postcode),
      price: parseFloat(get(r, ci.price).replace(/[£,\s]/g, '')) || 0,
      status,
      account: /personal|myself|\bme\b|self/i.test(get(r, ci.account)) ? 'personal' : 'business',
      notes: get(r, ci.notes),
      endDate: '',
      moreEpcs: [],
      perDay: 0,
      perPrice: 0,
      addresses: '',
    })
  })
  return { jobs, errors }
}

// One flat table of every earning and expense (expenses negative), followed
// by a totals block split by cost centre — opens straight into Excel/Sheets.
export function buildExportCsv(jobs, expenses) {
  const STATUS_LABELS = { booked: 'Booked', done: 'Done — unpaid', paid: 'Paid' }
  const rows = [
    ['Date', 'Entry', 'Customer / Description', 'Category', 'Address', 'Postcode', 'Amount (£)', 'Status', 'Paid to', 'Notes'],
  ]
  const totals = { earnBusiness: 0, earnPersonal: 0, expBusiness: 0, expPersonal: 0 }

  for (const j of [...jobs].sort((a, b) => a.date.localeCompare(b.date))) {
    const label = JOB_TYPES[j.type]?.label || 'Job'
    const paidTo = ACCOUNTS[accountOf(j)]
    const status = STATUS_LABELS[j.status] || j.status
    if (j.type === 'company' && Number(j.perDay) > 0 && Number(j.perPrice) > 0) {
      rows.push([
        j.date, 'Earning', j.customer,
        `${label} — ${jobUnits(j)} assessments @ £${Number(j.perPrice)}`,
        (j.addresses || '').split('\n').join('; '), '', jobTotal(j), status, paidTo, j.notes || '',
      ])
    } else {
      rows.push([j.date, 'Earning', j.customer || '', label, j.address || '', j.postcode || '', Number(j.price) || 0, status, paidTo, j.notes || ''])
      for (const x of j.moreEpcs || []) {
        rows.push([j.date, 'Earning', j.customer || '', 'EPC', x.address || '', '', Number(x.price) || 0, status, paidTo, ''])
      }
    }
    totals[accountOf(j) === 'personal' ? 'earnPersonal' : 'earnBusiness'] += jobTotal(j)
  }

  for (const x of [...expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    const paidTo = ACCOUNTS[accountOf(x)]
    rows.push([x.date, 'Expense', x.description || '', x.category || '', '', '', -(Number(x.amount) || 0), '', paidTo, ''])
    totals[accountOf(x) === 'personal' ? 'expPersonal' : 'expBusiness'] += Number(x.amount) || 0
  }

  rows.push([])
  rows.push(['TOTALS'])
  rows.push(['Earnings — Eco Futures', '', '', '', '', '', totals.earnBusiness])
  rows.push(['Earnings — Personal', '', '', '', '', '', totals.earnPersonal])
  rows.push(['Expenses — Eco Futures', '', '', '', '', '', -totals.expBusiness])
  rows.push(['Expenses — Personal', '', '', '', '', '', -totals.expPersonal])
  rows.push(['Profit (everything)', '', '', '', '', '', totals.earnBusiness + totals.earnPersonal - totals.expBusiness - totals.expPersonal])

  const esc = (v) => {
    v = String(v ?? '')
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export const CSV_TEMPLATE = [
  'Date,Time,Customer,Type,Address,Postcode,Price,Phone,Status,Notes',
  '06/07/2026,09:30,Mrs Smith,EPC,"12 High Street, Preston",PR1 1AA,65,07700 900123,Booked,Key with neighbour',
  '07/07/2026,,RetrofitCo Ltd,Retrofit,"34 Park Road, Blackpool",FY2 2BB,450,,Booked,',
].join('\n')
