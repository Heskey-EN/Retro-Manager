import { useCallback, useEffect, useRef, useState } from 'react'
import { jobsStore } from '../lib/jobsStore'
import { documentsStore } from '../lib/documentsStore'

// Loads all jobs, keeps them in sync with the backend in real time, and exposes
// helpers for adding / updating / clearing. Merge logic is shared by both the
// Supabase and local backends so the UI behaves identically either way.
export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  // Job ids with a write in flight. Realtime echoes for those rows are
  // skipped — a stale echo from edit #1 landing after optimistic edit #2
  // would otherwise revert the newer state (and a read-modify-write field
  // like tags could then lose data permanently).
  const pendingWrites = useRef(new Map())

  // keepError: a failed write calls refetch to roll the list back to server
  // state, but the error banner must survive that reload or the user sees
  // their edit silently revert with no explanation.
  const refetch = useCallback(async (keepError = false) => {
    try {
      const rows = await jobsStore.fetchAll()
      setJobs(rows)
      if (!keepError) setError(null)
    } catch (err) {
      setError(err.message || String(err))
    }
  }, [])

  const applyChange = useCallback(
    (payload) => {
      const type = payload?.eventType
      if (type === 'INSERT' && payload.new) {
        const incoming = Array.isArray(payload.new) ? payload.new : [payload.new]
        // Dedupe against the state actually being updated — a check against a
        // stale ref can double-append when the realtime echo lands before the
        // re-render after an optimistic insert.
        setJobs((prev) => {
          const existing = new Set(prev.map((j) => j.id))
          const fresh = incoming.filter((r) => !existing.has(r.id))
          return fresh.length ? [...prev, ...fresh] : prev
        })
        return
      }
      if (type === 'UPDATE' && payload.new?.id) {
        // Skip echoes for rows we're mid-write on; the write's own response
        // reconciles them once the last in-flight patch settles.
        if (pendingWrites.current.has(payload.new.id)) return
        setJobs((prev) => prev.map((j) => (j.id === payload.new.id ? { ...j, ...payload.new } : j)))
        return
      }
      if (type === 'DELETE' && payload.old?.id) {
        // DELETE events can't be org-filtered server-side (they carry only the
        // pk), so most are other orgs' rows: keep the same array identity when
        // nothing matched, or every foreign delete re-renders the whole app.
        setJobs((prev) => {
          const next = prev.filter((j) => j.id !== payload.old.id)
          return next.length === prev.length ? prev : next
        })
        return
      }
      // SYNC, full clear, or anything unexpected -> reload from source of truth.
      refetch()
    },
    [refetch],
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      await refetch()
      if (active) setLoading(false)
    })()
    const unsubscribe = jobsStore.subscribe(applyChange)
    return () => {
      active = false
      unsubscribe()
    }
  }, [refetch, applyChange])

  const addJobs = useCallback(async (newJobs) => {
    const inserted = await jobsStore.insertMany(newJobs)
    // Optimistically merge for the local backend / immediate feedback.
    setJobs((prev) => {
      const existing = new Set(prev.map((j) => j.id))
      const fresh = (inserted || []).filter((r) => !existing.has(r.id))
      return fresh.length ? [...prev, ...fresh] : prev
    })
    return inserted
  }, [])

  const updateJob = useCallback(async (id, patch) => {
    const finishWrite = () => {
      const n = (pendingWrites.current.get(id) || 1) - 1
      if (n <= 0) pendingWrites.current.delete(id)
      else pendingWrites.current.set(id, n)
    }
    pendingWrites.current.set(id, (pendingWrites.current.get(id) || 0) + 1)
    // Optimistic update for snappy UI; the write's response reconciles.
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
    try {
      const saved = await jobsStore.updateJob(id, patch)
      finishWrite()
      // Adopt the server row only once no newer patch is in flight for it.
      if (saved?.id && !pendingWrites.current.has(id)) {
        setJobs((prev) => prev.map((j) => (j.id === saved.id ? { ...j, ...saved } : j)))
      }
      return true
    } catch (err) {
      finishWrite()
      setError(err.message || String(err))
      refetch(true)
      return false // callers that care (bulk actions) count these
    }
  }, [refetch])

  // Permanently remove jobs (and, locally, their documents). Level >= 2 in
  // suite mode — RLS is the real gate, and deleteMany surfaces a blocked
  // delete as an error rather than a silent no-op.
  const deleteJobs = useCallback(async (ids) => {
    if (!ids?.length) return 0
    const idSet = new Set(ids)
    setJobs((prev) => prev.filter((j) => !idSet.has(j.id))) // optimistic
    try {
      await jobsStore.deleteMany(ids)
    } catch (err) {
      setError(err.message || String(err))
      await refetch(true) // put back whatever survived, keep the error visible
      throw err
    }
    // Best-effort local cleanup; a failure here must not fail the delete.
    for (const id of ids) documentsStore.removeForJob(id).catch(() => {})
    return ids.length
  }, [refetch])

  const clearAll = useCallback(async () => {
    // Delete first, THEN empty the list — if the backend refuses (network,
    // permissions) the jobs are still there and the UI must keep showing them.
    try {
      await jobsStore.clearAll()
      setJobs([])
    } catch (err) {
      setError(err.message || String(err))
      await refetch()
      throw err
    }
  }, [refetch])

  return { jobs, loading, error, addJobs, updateJob, deleteJobs, clearAll, refetch }
}
