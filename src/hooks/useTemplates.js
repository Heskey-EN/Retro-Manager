import { useCallback, useEffect, useState } from 'react'
import { templatesStore } from '../lib/templatesStore'

// Loads and live-syncs the saved document templates.
export function useTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setTemplates(await templatesStore.list())
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    return templatesStore.subscribe(refetch)
  }, [refetch])

  const save = useCallback(async (tpl) => {
    const rec = await templatesStore.save(tpl)
    refetch()
    return rec
  }, [refetch])

  const remove = useCallback(async (id) => {
    await templatesStore.remove(id)
    refetch()
  }, [refetch])

  return { templates, loading, save, remove }
}
