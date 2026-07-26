import { useCallback, useEffect, useRef, useState } from 'react'
import { jobsStore } from '../lib/jobsStore'

// Loads all jobs, keeps them in sync with the backend in real time, and exposes
// helpers for adding / updating / clearing. Merge logic is shared by both the
// Supabase and local backends so the UI behaves identically either way.
export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const refetch = useCallback(async () => {
    try {
      const rows = await jobsStore.fetchAll()
      setJobs(rows)
      setError(null)
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
        setJobs((prev) => prev.map((j) => (j.id === payload.new.id ? { ...j, ...payload.new } : j)))
        return
      }
      if (type === 'DELETE' && payload.old?.id) {
        setJobs((prev) => prev.filter((j) => j.id !== payload.old.id))
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
    // Optimistic update for snappy UI; realtime echo will reconcile.
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
    try {
      await jobsStore.updateJob(id, patch)
    } catch (err) {
      setError(err.message || String(err))
      refetch()
    }
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

  return { jobs, loading, error, addJobs, updateJob, clearAll, refetch }
}
