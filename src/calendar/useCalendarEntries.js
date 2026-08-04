import { useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ensureBusinessReady, useBusinessReady, useHubData } from '../business/lib/store.js'
import { isUnlocked } from '../business/FinanceGate.jsx'
import { mergeEntries } from './entries.js'

// The single source the calendar reads, everywhere it appears.
//
// The caller passes the real jobs list (already filtered however that section
// filters). This adds the Finance tab's hand-added entries — EPC work, company
// blocks — and drops the rows Finance derived from costed jobs, because the
// real job already carries that day.

// Module-level: a fresh [] literal would be a new reference on every render and
// would break the memo below every single time.
const EMPTY = []

export function useCalendarEntries(jobs) {
  const { configured, isAdmin, orgId } = useAuth()
  const hub = useHubData()
  const ready = useBusinessReady()

  // Connect the business store from wherever the calendar is mounted. It used
  // to connect only inside the Finance tab, so a Dashboard reading hub.jobs
  // before that would be reading this device's stale pre-suite localStorage.
  // Failure is non-fatal: the calendar still shows every real job.
  useEffect(() => {
    if (configured && isAdmin && orgId) ensureBusinessReady(orgId).catch(() => {})
  }, [configured, isAdmin, orgId])

  // Levels 1–2 never see Finance entries. Not a secret kept by the UI — RLS on
  // biz_data refuses them the rows anyway; this just stops the empty request.
  const businessIncluded = (configured ? isAdmin : true) && ready

  // In local mode the Finance passcode still means something: bookings show on
  // every calendar, £ figures do not until Finance has been unlocked this
  // session. Read at render, so navigating back after unlocking picks it up —
  // no extra state to keep in sync.
  const showMoney = configured ? isAdmin : isUnlocked()

  const bizJobs = businessIncluded ? hub.jobs : EMPTY
  const { entries, byDate } = useMemo(() => mergeEntries({ jobs, bizJobs }), [jobs, bizJobs])

  return { entries, byDate, businessIncluded, showMoney }
}
