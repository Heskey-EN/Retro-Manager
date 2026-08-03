// Auto-sync from the Jobs tab: any manager job with costing data appears in
// Finance automatically — its projected revenue as income on the job's start
// date, its cost items as "Job costs" expenses. The entries are DERIVED live
// from the jobs store (never copied into the finance blob), so editing the
// job's costing updates Finance instantly and there is nothing to keep in
// sync by hand. Works in both modes: supabase realtime in suite mode,
// BroadcastChannel + refresh-on-open in local mode.
import { normalizeStatus } from '../../lib/status.js'
import { jobsStore } from '../../lib/jobsStore.js'
import { setManagerLinked } from './store.js'

const ymd = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

function convert(rows) {
  const jobs = []
  const expenses = []
  for (const r of rows || []) {
    // A cancelled job earns nothing — its costs stay (they were really spent),
    // but its revenue must never reach the income figures or the tax estimate.
    const st = normalizeStatus(r?.status)
    const cancelled = st === 'Cancelled'
    const c = r?.costing
    if (!c) continue
    const revenue = cancelled ? 0 : Number(c.revenue) || 0
    const items = (c.items || []).filter((it) => (Number(it.cost ?? it.amount) || 0) > 0)
    if (revenue <= 0 && !items.length) continue
    const date = ymd(r.start_date) || ymd(r.end_date) || ymd(r.created_at) || new Date().toISOString().slice(0, 10)
    const label = r.title || r.reference || 'Job'
    if (revenue > 0) {
      jobs.push({
        id: `rmt-${r.id}`,
        _linked: true,
        type: 'retrofit',
        date,
        customer: r.customer || label,
        address: r.customer ? label : '',
        postcode: r.postcode || '',
        price: revenue,
        // The manager pipeline has no "paid" notion — Submitted counts as
        // done-awaiting-payment, everything earlier as booked.
        // Finance tracks money, so the stage maps onto its own three states:
        // Paid = in the bank, Submitted/Finished = done but awaiting payment,
        // anything earlier = still booked.
        status: st === 'Paid' ? 'paid' : st === 'Done' ? 'done' : 'booked',
        notes: 'Synced from the Jobs tab',
      })
    }
    items.forEach((it, i) => {
      expenses.push({
        id: `rmt-${r.id}-${it.id || i}`,
        _linked: true,
        _linkedJob: label,
        date,
        category: 'Job costs',
        description: `${it.description || 'Job cost'} — ${label}`,
        amount: Number(it.cost ?? it.amount) || 0,
        account: 'business',
      })
    })
  }
  return { jobs, expenses }
}

let subscribed = false
let refreshTimer = null

async function refresh() {
  try {
    setManagerLinked(convert(await jobsStore.fetchAll()))
  } catch (err) {
    // Jobs unavailable (offline, RLS) — Finance still works without the
    // synced entries; the next open or realtime event retries.
    console.warn('[finance] job sync unavailable:', err?.message || err)
  }
}

// A big CSV import fires one event per row — coalesce into one refetch.
function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refresh, 300)
}

// Called every time the Finance section mounts: always re-pulls (covers
// local mode, where same-tab BroadcastChannel messages don't loop back),
// and subscribes to live job changes once for the app's lifetime.
export function initManagerLink() {
  refresh()
  if (subscribed) return
  subscribed = true
  jobsStore.subscribe(scheduleRefresh)
}
