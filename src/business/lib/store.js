// Data store for the Business Hub — two interchangeable persistence modes:
//   LOCAL (no suite env vars): localStorage under one key, exactly as before.
//   CLOUD (suite configured):  the whole blob lives in one org-scoped row of
//     the hub project's biz_data table (RLS: org admins only), pushed with a
//     short debounce and synced back via realtime. Last-write-wins per blob —
//     fine for a small admin team; receipts stay in this device's IndexedDB.
// Pages never care which mode is active: all reads/writes go through the
// actions below, and mutate() stays synchronous on the in-memory copy.

import { useEffect, useState } from 'react'
import { jobDates } from './dates.js'
import { deleteReceipt, getAllReceipts, replaceAllReceipts } from './receipts.js'
import { supabase } from './supabaseClient.js'

const STORAGE_KEY = 'ef-hub-data-v1'

// Tags our own pushes so the realtime echo of a write we made is ignored.
const CLIENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const DEFAULT_DATA = {
  jobs: [],
  expenses: [],
  invoices: [],
  settings: {
    passcodeHash: null,
    businessName: 'Eco Futures',
    businessAddress: '',
    businessEmail: '',
    businessPhone: '',
    invoicePrefix: 'EF-',
    nextInvoiceNo: 1,
  },
}

function normalize(raw) {
  const merged = {
    ...structuredClone(DEFAULT_DATA),
    ...(raw || {}),
    settings: { ...DEFAULT_DATA.settings, ...(raw?.settings || {}) },
  }
  delete merged._client // push-time routing tag, never part of the data
  return merged
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_DATA)
    return normalize(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_DATA)
  }
}

let data = load()
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn(data))

/* ---- Cloud persistence (suite mode) ---------------------------------- */

let cloudOrgId = null
let cloudChannel = null
let pushTimer = null

// 'off' | 'loading' | 'ready' | 'syncing' | 'error'
let cloudStatus = 'off'
const cloudListeners = new Set()
function setCloudStatus(s) {
  cloudStatus = s
  cloudListeners.forEach((fn) => fn(s))
}

export function useCloudStatus() {
  const [status, setStatus] = useState(cloudStatus)
  useEffect(() => {
    cloudListeners.add(setStatus)
    return () => cloudListeners.delete(setStatus)
  }, [])
  return status
}

let pushInFlight = null
let pushQueued = false

// One push at a time, always sending the CURRENT blob at send time — two
// overlapping UPDATEs could otherwise land out of order and leave the server
// holding the older one. .select() makes an RLS-filtered zero-row update
// (e.g. the caller was demoted mid-session) fail loudly instead of "saving".
async function pushNow() {
  if (pushInFlight) {
    pushQueued = true
    return
  }
  const orgId = cloudOrgId
  if (!orgId) return
  pushInFlight = supabase
    .from('biz_data')
    .update({ data: { ...data, _client: CLIENT_ID } })
    .eq('org_id', orgId)
    .select('org_id')
  const { data: rows, error } = await pushInFlight
  pushInFlight = null
  if (orgId !== cloudOrgId) return
  if (error || !rows?.length) {
    console.error('[tracker] cloud save failed:', error?.message || 'no row updated (permissions?)')
    setCloudStatus('error') // next change retries; data is safe in memory
  } else {
    setCloudStatus('ready')
  }
  if (pushQueued) {
    pushQueued = false
    pushNow()
  }
}

function schedulePush() {
  setCloudStatus('syncing')
  clearTimeout(pushTimer)
  pushTimer = setTimeout(pushNow, 800)
}

// Flush the debounce window — without this, closing the tab within 800ms of
// the last edit would silently drop it.
function flushPush() {
  if (!cloudOrgId) return
  clearTimeout(pushTimer)
  if (cloudStatus === 'syncing') pushNow()
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPush()
  })
}

// Connect the store to the org's cloud row: fetch (or create) it, adopt its
// contents, and follow other devices' updates. Called by the gate once the
// signed-in org admin is known.
export async function initCloud(orgId) {
  if (!supabase || !orgId || cloudOrgId === orgId) return
  cloudOrgId = orgId
  setCloudStatus('loading')

  const { data: row, error } = await supabase
    .from('biz_data')
    .select('data')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) {
    setCloudStatus('error')
    throw new Error(error.message)
  }

  if (row) {
    data = normalize(row.data)
  } else {
    const { error: insErr } = await supabase.from('biz_data').insert({ org_id: orgId, data: {} })
    // 23505 = another device created it first — harmless, we'll sync via realtime
    if (insErr && insErr.code !== '23505') {
      setCloudStatus('error')
      throw new Error(insErr.message)
    }
    data = structuredClone(DEFAULT_DATA)
  }
  notify()

  // Re-fetch the row from source of truth — used on (re)subscribe to catch
  // anything missed while the channel was down, and when an event arrives
  // too large to carry its payload.
  const refetch = async () => {
    const { data: fresh } = await supabase.from('biz_data').select('data').eq('org_id', cloudOrgId).maybeSingle()
    if (cloudOrgId === orgId && fresh) {
      data = normalize(fresh.data)
      notify()
    }
  }

  cloudChannel = supabase
    .channel('biz-data-sync')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'biz_data', filter: `org_id=eq.${orgId}` },
      (payload) => {
        // A blob over the realtime size cap arrives with values stripped and
        // an errors array — fall back to a fetch rather than ignoring it.
        if (payload.errors && !payload.new?.data) {
          refetch()
          return
        }
        const incoming = payload.new?.data
        if (!incoming || incoming._client === CLIENT_ID) return
        data = normalize(incoming)
        notify()
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setCloudStatus('ready')
        refetch() // catch updates missed while the channel was down
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Live sync is down — we can still save our own writes, but we're no
        // longer seeing other admins'. Say so rather than showing "Saved".
        setCloudStatus('offline')
      }
    })

  setCloudStatus('ready')
}

/* ---- Team-logged expenses (suite mode) -------------------------------- */
// Workers (levels 1–2) with the per-account "can add expenses" permission log
// expenses into the hub's biz_expenses table — they never touch the biz_data
// blob (RLS denies them any path to it). For admins, those rows are fetched
// and realtime-synced here, then merged into the expenses list the pages
// read, marked _team so the UI can show who logged them and route edits back
// to the table instead of the blob.

let teamExpenses = []
let teamOrgId = null

// Only these columns exist on biz_expenses — receipt fields etc. stay
// blob-only, so patches from the edit modal are filtered down to them.
const TEAM_EDITABLE = ['date', 'category', 'description', 'amount', 'account']

function normalizeTeamRow(row) {
  return {
    id: row.id,
    date: row.date,
    category: row.category || 'Other',
    description: row.description || '',
    amount: Number(row.amount) || 0,
    account: row.account === 'personal' ? 'personal' : 'business',
    _team: true,
    _teamBy: row.profiles?.full_name || row.profiles?.email || 'team member',
  }
}

async function refetchTeamExpenses() {
  if (!teamOrgId) return
  const { data: rows, error } = await supabase
    .from('biz_expenses')
    .select('*, profiles ( email, full_name )')
    .eq('org_id', teamOrgId)
    .order('date', { ascending: false })
  if (error) {
    // Table missing (hub migration 0007 not run yet) or transient failure —
    // the blob data still works, so carry on without team rows.
    console.warn('[finance] team expenses unavailable:', error.message)
    return
  }
  teamExpenses = rows.map(normalizeTeamRow)
  notify()
}

// Called by the gate alongside initCloud once the signed-in admin's org is
// known. Safe to call when the table doesn't exist yet.
export async function initTeamExpenses(orgId) {
  if (!supabase || !orgId || teamOrgId === orgId) return
  teamOrgId = orgId
  await refetchTeamExpenses()
  supabase
    .channel('biz-expenses-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'biz_expenses', filter: `org_id=eq.${orgId}` },
      // Payloads don't carry the profiles join, so just refetch — the table
      // is small and events are rare.
      () => refetchTeamExpenses(),
    )
    .subscribe()
}

const isTeamExpense = (id) => teamExpenses.some((x) => x.id === id)

// The device's pre-suite localStorage data (for the one-time cloud upload).
export function localSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const cloudIsEmpty = () =>
  !(data.jobs.length || data.expenses.length || data.invoices.length)

// One-time migration: adopt this device's local data as the org's cloud data.
// localStorage is left untouched as a safety copy. The per-device passcode
// hash is dropped — it has no meaning in the shared cloud row. The push is
// flushed immediately so closing the tab can't lose the migration.
export function uploadLocalToCloud() {
  const local = localSnapshot()
  if (!local) return
  const adopted = normalize(local)
  if (adopted.settings) adopted.settings.passcodeHash = null
  data = adopted
  persist()
  flushPush()
}

/* ---------------------------------------------------------------------- */

function persist() {
  if (cloudOrgId) {
    // Cloud mode: memory + debounced push. localStorage is deliberately left
    // alone — it still holds the pre-suite safety copy.
    schedulePush()
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
  notify()
}

// What the pages see: the org blob plus any team-logged expense rows.
// (Backups and cloud pushes use `data` directly — team rows live in their
// own table and must never be written into the blob.)
function snapshotWithTeam() {
  return teamExpenses.length ? { ...data, expenses: [...data.expenses, ...teamExpenses] } : data
}

export function getData() {
  return snapshotWithTeam()
}

export function useHubData() {
  const [snapshot, setSnapshot] = useState(snapshotWithTeam)
  useEffect(() => {
    const fn = () => setSnapshot({ ...snapshotWithTeam() })
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return snapshot
}

function mutate(fn) {
  const next = structuredClone(data)
  fn(next)
  data = next
  persist()
}

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

// ---- Jobs ------------------------------------------------------------
// job: { id, type: 'epc'|'retrofit'|'company'|'other', date: 'YYYY-MM-DD',
//        endDate (company blocks), time, customer, phone, address, postcode,
//        price: number, status: 'booked'|'done'|'paid', notes, createdAt }

export function addJob(job) {
  const id = newId()
  mutate((d) => {
    d.jobs.push({ status: 'booked', ...job, id, createdAt: new Date().toISOString() })
  })
  return id
}

// Bulk add (CSV import) — one persist for the whole batch
export function importJobs(list) {
  mutate((d) => {
    for (const job of list) {
      d.jobs.push({ status: 'booked', ...job, id: newId(), createdAt: new Date().toISOString() })
    }
  })
}

export function updateJob(id, patch) {
  mutate((d) => {
    const j = d.jobs.find((x) => x.id === id)
    if (j) Object.assign(j, patch)
  })
}

export function deleteJob(id) {
  mutate((d) => {
    d.jobs = d.jobs.filter((x) => x.id !== id)
  })
}

// ---- Expenses --------------------------------------------------------
// expense: { id, date, category, description, amount }

export function addExpense(expense) {
  const id = newId()
  mutate((d) => {
    d.expenses.push({ ...expense, id })
  })
  return id
}

export function updateExpense(id, patch) {
  // Team-logged rows live in biz_expenses, not the blob — update optimistically
  // and push the mapped columns; realtime (or a refetch on failure) reconciles.
  if (isTeamExpense(id)) {
    const upd = {}
    for (const k of TEAM_EDITABLE) {
      if (k in patch) upd[k] = k === 'amount' ? Number(patch[k]) || 0 : patch[k]
    }
    if (!Object.keys(upd).length) return
    teamExpenses = teamExpenses.map((x) => (x.id === id ? { ...x, ...upd } : x))
    notify()
    supabase
      .from('biz_expenses')
      .update(upd)
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('[finance] team expense update failed:', error.message)
          refetchTeamExpenses()
        }
      })
    return
  }
  mutate((d) => {
    const x = d.expenses.find((e) => e.id === id)
    if (x) Object.assign(x, patch)
  })
}

export function deleteExpense(id) {
  if (isTeamExpense(id)) {
    teamExpenses = teamExpenses.filter((x) => x.id !== id)
    notify()
    supabase
      .from('biz_expenses')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('[finance] team expense delete failed:', error.message)
          refetchTeamExpenses()
        }
      })
    return
  }
  const x = data.expenses.find((e) => e.id === id)
  // Fire-and-forget: drop the stored image too. Swallow rejection so a failed
  // IndexedDB tx doesn't surface as an unhandled promise rejection.
  if (x?.receiptId) deleteReceipt(x.receiptId).catch(() => {})
  mutate((d) => {
    d.expenses = d.expenses.filter((e) => e.id !== id)
  })
}

// ---- Invoices ---------------------------------------------------------
// invoice: { id, number, date, customerName, customerAddress, items: [{description, qty, unitPrice}],
//            jobId, status: 'draft'|'sent'|'paid', notes }

export function createInvoice(invoice) {
  const id = newId()
  mutate((d) => {
    const number = `${d.settings.invoicePrefix}${String(d.settings.nextInvoiceNo).padStart(4, '0')}`
    d.settings.nextInvoiceNo += 1
    d.invoices.push({ status: 'draft', ...invoice, id, number })
    if (invoice.jobId) {
      const j = d.jobs.find((x) => x.id === invoice.jobId)
      if (j && j.status === 'booked') j.status = 'done'
    }
  })
  return id
}

export function updateInvoice(id, patch) {
  mutate((d) => {
    const inv = d.invoices.find((x) => x.id === id)
    if (inv) Object.assign(inv, patch)
    // A job only flips to paid once its paid invoices cover its full value —
    // a batch visit can be split across several invoices (one per landlord)
    if (inv && patch.status === 'paid' && inv.jobId) {
      const j = d.jobs.find((x) => x.id === inv.jobId)
      if (j) {
        const paidSum = d.invoices
          .filter((x) => x.jobId === inv.jobId && x.status === 'paid')
          .reduce((s, x) => s + invoiceTotal(x), 0)
        if (paidSum >= jobTotal(j) - 0.005) j.status = 'paid'
      }
    }
  })
}

export function deleteInvoice(id) {
  mutate((d) => {
    d.invoices = d.invoices.filter((x) => x.id !== id)
  })
}

export function invoiceTotal(invoice) {
  return (invoice.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
}

// Company weeks: a block with perDay (assessments per day) + perPrice (£ per
// assessment) is priced per working day rather than as a lump sum
function isRateBlock(job) {
  return job.type === 'company' && Number(job.perDay) > 0 && Number(job.perPrice) > 0
}

// Total value of a job — EPC batches add the prices of their extra properties,
// company weeks multiply days × assessments/day × price per assessment
export function jobTotal(job) {
  if (isRateBlock(job)) return jobDates(job).length * Number(job.perDay) * Number(job.perPrice)
  const extras = (job.moreEpcs || []).reduce((s, e) => s + (Number(e.price) || 0), 0)
  return (Number(job.price) || 0) + extras
}

// How many assessments/visits a job entry represents (an EPC batch counts each
// property; a company week counts every assessment across its days)
export function jobUnits(job) {
  if (job.type === 'company') {
    return isRateBlock(job) ? jobDates(job).length * Number(job.perDay) : 1
  }
  return 1 + (job.moreEpcs || []).length
}

// Spread a job's money and assessment count across the dates it covers, so
// weekly/monthly totals stay right when a company week straddles a boundary.
// Ordinary jobs land entirely on their booked date.
export function jobPortions(job) {
  if (isRateBlock(job)) {
    const perDayIncome = Number(job.perDay) * Number(job.perPrice)
    return jobDates(job).map((date) => ({ date, income: perDayIncome, units: Number(job.perDay) }))
  }
  return [{ date: job.date, income: jobTotal(job), units: jobUnits(job) }]
}

// ---- Settings / backup -------------------------------------------------

export function updateSettings(patch) {
  mutate((d) => {
    Object.assign(d.settings, patch)
  })
}

// Backups bundle the receipt images too, so one file moves everything to a
// new device. (Async because the images are read out of IndexedDB.)
export async function exportBackup() {
  const receipts = await getAllReceipts()
  const payload = { ...data, receipts }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ecofutures-hub-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(json) {
  const parsed = JSON.parse(json) // throws on invalid JSON — caller handles
  if (!parsed || !Array.isArray(parsed.jobs)) throw new Error('Not a valid hub backup file')
  const { receipts, ...rest } = parsed
  await replaceAllReceipts(receipts || {}) // receipts back into IndexedDB, not localStorage
  data = {
    ...structuredClone(DEFAULT_DATA),
    ...rest,
    settings: { ...DEFAULT_DATA.settings, ...(rest.settings || {}) },
  }
  persist()
}

// ---- Formatting helpers -------------------------------------------------

export const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

// Cost centres — who the money belongs to. Older entries have no `account`
// field and count as 'business'; use accountOf() everywhere.
export const ACCOUNTS = {
  business: 'Eco Futures',
  personal: 'Personal',
}

export const accountOf = (x) => (x.account === 'personal' ? 'personal' : 'business')

export const JOB_TYPES = {
  epc: { label: 'EPC', color: '#2E7D4F' }, // moss
  retrofit: { label: 'Retrofit Assessment', color: '#E4572E' }, // ember
  company: { label: 'Company Work', color: '#E8B23A' }, // amber
  other: { label: 'Other', color: '#6B7885' }, // ink-faint
}

export const EXPENSE_CATEGORIES = [
  'Fuel & Mileage',
  'Equipment & Tools',
  'Software & Subscriptions',
  'Insurance',
  'Training & Accreditation',
  'Phone & Internet',
  'Accountancy',
  'Marketing',
  'Other',
]
