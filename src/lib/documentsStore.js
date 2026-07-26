import { idbGetAllByIndex, idbGet, idbPut, idbDelete } from './idb'

// Documents (uploaded files + links) attached to a job. Each document is filed
// into one folder, where folders are the job's workflow statuses. The "Master"
// view in the UI simply shows every document for a job regardless of folder.
//
// Uploaded files are stored as the original File/Blob inside IndexedDB, so they
// persist across reloads and can be re-opened without any server.

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rmt:docs') : null
const announce = (jobId) => channel?.postMessage({ jobId })

export const documentsStore = {
  async listForJob(jobId) {
    if (!jobId) return []
    const docs = await idbGetAllByIndex('documents', 'job_id', jobId)
    return docs.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  },

  async addLink(jobId, { name, url, folder }) {
    const doc = {
      id: uuid(),
      job_id: jobId,
      kind: 'link',
      name: name || url,
      url,
      folder,
      created_at: new Date().toISOString(),
    }
    await idbPut('documents', doc)
    announce(jobId)
    return doc
  },

  // A note is an item too, filed into a stage folder. `done` lets a note that
  // records a missing component be ticked off once it's been supplied.
  async addNote(jobId, { text, folder }) {
    const doc = {
      id: uuid(),
      job_id: jobId,
      kind: 'note',
      text,
      done: false,
      folder,
      created_at: new Date().toISOString(),
    }
    await idbPut('documents', doc)
    announce(jobId)
    return doc
  },

  async setDone(id, done) {
    const doc = await idbGet('documents', id)
    if (!doc) return null
    const updated = { ...doc, done }
    await idbPut('documents', updated)
    announce(doc.job_id)
    return updated
  },

  async addFile(jobId, file, folder) {
    const doc = {
      id: uuid(),
      job_id: jobId,
      kind: 'file',
      name: file.name,
      mime: file.type,
      size: file.size,
      blob: file, // stored directly; IndexedDB supports structured clone of File
      folder,
      created_at: new Date().toISOString(),
    }
    await idbPut('documents', doc)
    announce(jobId)
    return doc
  },

  async move(id, folder) {
    const doc = await idbGet('documents', id)
    if (!doc) return null
    const updated = { ...doc, folder }
    await idbPut('documents', updated)
    announce(doc.job_id)
    return updated
  },

  async remove(id, jobId) {
    await idbDelete('documents', id)
    announce(jobId)
  },

  // Build a temporary object URL to open/download a stored file.
  fileUrl(doc) {
    if (doc.kind !== 'file' || !doc.blob) return null
    return URL.createObjectURL(doc.blob)
  },

  subscribe(jobId, onChange) {
    if (!channel) return () => {}
    const handler = (e) => {
      if (e.data?.jobId === jobId) onChange()
    }
    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  },
}
