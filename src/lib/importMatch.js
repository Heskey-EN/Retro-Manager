// Working out what an import actually means against the jobs you already have.
//
// Importing the same spreadsheet twice should not double your job list, and a
// sheet that has since gained a date or a price should top up the job that is
// already in the system rather than sitting there as a second copy. So every
// incoming row is either NEW, or a match that carries FILL-INS, or a match
// with nothing to add.
//
// The rule for a match is deliberately conservative: only ever fill a field
// that is currently EMPTY. An import never overwrites something you typed —
// a conflict is reported so you can look, not silently resolved.

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const pc = (s) => squash(s)

// The leading house number/name, which is what actually distinguishes
// neighbours inside one postcode ("20 Sedberch" vs "22 Sedberch").
function houseKey(address) {
  const t = String(address ?? '').trim()
  const num = /^(\d+[a-z]?)\b/i.exec(t)
  if (num) return num[1].toLowerCase()
  return squash(t).slice(0, 12)
}

// Two jobs are the same property when the postcode matches and the house
// part matches. With no postcode on either side, fall back to the full
// address text so an import into an address-only list still de-duplicates.
// A UK postcode at the start of an address, e.g. "FY1 3RH -7 Henthorne".
const LEADING_PC = /^\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*[-–—,:]?\s*(.*)$/i

export function jobKey(job) {
  const raw = job?.data?.Address || job?.title || ''
  let post = pc(job?.postcode)
  let address = raw
  // Jobs added before the importer learned to split "POSTCODE - street" keep
  // the whole thing in the title with no postcode field. Pull it apart here
  // too, or the same property keys differently depending on when it was
  // created — which is exactly how duplicates slip through.
  const m = LEADING_PC.exec(raw)
  if (m) {
    if (!post) post = pc(m[1])
    address = m[2] || raw
  }
  return post ? `${post}|${houseKey(address)}` : `addr|${squash(address)}`
}

// Fields an import may fill in, and how to read each one off a job.
const FILLABLE = [
  { key: 'start_date', label: 'Date', get: (j) => j.start_date, empty: (v) => !v },
  { key: 'end_date', label: 'End date', get: (j) => j.end_date, empty: (v) => !v },
  { key: 'postcode', label: 'Postcode', get: (j) => j.postcode, empty: (v) => !String(v || '').trim() },
  { key: 'customer', label: 'Customer', get: (j) => j.customer, empty: (v) => !String(v || '').trim() },
  { key: 'reference', label: 'Reference', get: (j) => j.reference, empty: (v) => !String(v || '').trim() },
  { key: 'measure', label: 'Measure', get: (j) => j.measure, empty: (v) => !String(v || '').trim() },
]

const revenueOf = (j) => Number(j?.costing?.revenue) || 0

// What would change if this row were applied to this existing job.
function planFor(existing, incoming) {
  const fills = []
  const conflicts = []
  const patch = {}

  for (const f of FILLABLE) {
    const before = f.get(existing)
    const after = f.get(incoming)
    if (after == null || (typeof after === 'string' && !after.trim())) continue
    if (f.empty(before)) {
      patch[f.key] = after
      fills.push({ label: f.label, value: after })
    } else if (squash(before) !== squash(after)) {
      // `key`/`value` are what an overwrite would write, so the caller can
      // choose the file's version without recomputing anything.
      conflicts.push({ key: f.key, label: f.label, mine: before, theirs: after, value: after })
    }
  }

  // Price only fills a job that has none — never silently re-prices work.
  const incomingRevenue = revenueOf(incoming)
  if (incomingRevenue > 0) {
    const currentRevenue = revenueOf(existing)
    if (currentRevenue === 0) {
      patch.costing = { ...(existing.costing || {}), revenue: incomingRevenue, items: existing.costing?.items || [] }
      fills.push({ label: 'Price', value: `£${incomingRevenue.toFixed(2)}` })
    } else if (Math.abs(currentRevenue - incomingRevenue) > 0.005) {
      conflicts.push({
        key: 'costing',
        label: 'Price',
        mine: `£${currentRevenue.toFixed(2)}`,
        theirs: `£${incomingRevenue.toFixed(2)}`,
        // Keep any cost lines already on the job — only the revenue changes.
        value: { ...(existing.costing || {}), revenue: incomingRevenue, items: existing.costing?.items || [] },
      })
    }
  }

  // Any spreadsheet column we don't have a home for is kept in `data`,
  // again only where the job has nothing already.
  const extraData = {}
  for (const [k, v] of Object.entries(incoming.data || {})) {
    const val = String(v ?? '').trim()
    if (!val) continue
    const mine = String(existing.data?.[k] ?? '').trim()
    if (!mine) extraData[k] = v
  }
  if (Object.keys(extraData).length) {
    patch.data = { ...(existing.data || {}), ...extraData }
    for (const k of Object.keys(extraData)) {
      if (k !== 'Address') fills.push({ label: k, value: String(extraData[k]) })
    }
  }

  // Status is informational by default — moving a job's stage from a
  // spreadsheet could undo real work, so it is reported rather than applied
  // unless the user explicitly chooses to take the file's version.
  if (incoming.status && existing.status && incoming.status !== existing.status) {
    conflicts.push({ key: 'status', label: 'Stage', mine: existing.status, theirs: incoming.status, value: incoming.status })
  }

  return { patch, fills, conflicts }
}

// Sort an import into what it will do. `rows` are parsed jobs, `existing` is
// the current job list.
export function planImport(rows, existing) {
  const index = new Map()
  for (const job of existing || []) {
    const k = jobKey(job)
    if (!index.has(k)) index.set(k, job)
  }

  const created = []
  const updates = []
  const unchanged = []
  const seenInFile = new Map()
  const dupesInFile = []

  for (const row of rows) {
    const key = jobKey(row)

    // The sheet can repeat a property too — count it once.
    if (seenInFile.has(key)) {
      dupesInFile.push(row)
      continue
    }
    seenInFile.set(key, row)

    const match = index.get(key)
    if (!match) {
      created.push(row)
      continue
    }
    const { patch, fills, conflicts } = planFor(match, row)
    if (fills.length) updates.push({ job: match, row, patch, fills, conflicts })
    else unchanged.push({ job: match, row, conflicts })
  }

  return { created, updates, unchanged, dupesInFile }
}

// The patch to actually write for one matched job. By default that's the
// fill-the-blanks patch; with `overwrite` the file's version of anything that
// disagreed is applied on top.
export function patchFor(entry, overwrite) {
  if (!overwrite || !entry.conflicts?.length) return entry.patch || {}
  const patch = { ...(entry.patch || {}) }
  for (const c of entry.conflicts) {
    if (c.key && c.value !== undefined) patch[c.key] = c.value
  }
  return patch
}
