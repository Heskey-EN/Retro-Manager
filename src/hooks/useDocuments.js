import { useCallback, useEffect, useState } from 'react'
import { documentsStore } from '../lib/documentsStore'

// Loads and live-syncs the documents for a single job.
export function useDocuments(jobId) {
  const [docs, setDocs] = useState([])
  // Start "loading" when there's a job to fetch, so the panel shows the spinner
  // from the first render instead of flashing the "No files yet" empty state
  // before the IndexedDB read resolves.
  const [loading, setLoading] = useState(Boolean(jobId))

  const refetch = useCallback(async () => {
    if (!jobId) {
      setDocs([])
      return
    }
    setLoading(true)
    setDocs(await documentsStore.listForJob(jobId))
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    refetch()
    if (!jobId) return undefined
    return documentsStore.subscribe(jobId, refetch)
  }, [jobId, refetch])

  const addFile = useCallback(
    async (file, folder) => {
      await documentsStore.addFile(jobId, file, folder)
      refetch()
    },
    [jobId, refetch],
  )

  const addLink = useCallback(
    async (link) => {
      await documentsStore.addLink(jobId, link)
      refetch()
    },
    [jobId, refetch],
  )

  const addNote = useCallback(
    async (note) => {
      await documentsStore.addNote(jobId, note)
      refetch()
    },
    [jobId, refetch],
  )

  const setDone = useCallback(
    async (id, done) => {
      await documentsStore.setDone(id, done)
      refetch()
    },
    [refetch],
  )

  const move = useCallback(
    async (id, folder) => {
      await documentsStore.move(id, folder)
      refetch()
    },
    [refetch],
  )

  const remove = useCallback(
    async (id) => {
      await documentsStore.remove(id, jobId)
      refetch()
    },
    [jobId, refetch],
  )

  return { docs, loading, addFile, addLink, addNote, setDone, move, remove }
}
