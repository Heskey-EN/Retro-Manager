import { idbGetAll, idbGet, idbPut, idbDelete } from './idb'

// Reusable output-document templates: a fillable PDF plus a mapping from each of
// its fields to a data source (job value or a source-PDF field). Because the
// source documents are the same job to job, the mapping is defined once here and
// reused for every job.

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rmt:templates') : null
const announce = () => channel?.postMessage({ t: Date.now() })

export const templatesStore = {
  async list() {
    const rows = await idbGetAll('templates')
    return rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  },

  async get(id) {
    return idbGet('templates', id)
  },

  async save(tpl) {
    const now = new Date().toISOString()
    const rec = { ...tpl, id: tpl.id || uuid(), created_at: tpl.created_at || now, updated_at: now }
    await idbPut('templates', rec)
    announce()
    return rec
  },

  async remove(id) {
    await idbDelete('templates', id)
    announce()
  },

  subscribe(onChange) {
    if (!channel) return () => {}
    const handler = () => onChange()
    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  },
}
