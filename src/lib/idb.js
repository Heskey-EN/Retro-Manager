// Minimal promise-based IndexedDB wrapper — no dependencies.
// Two object stores: "jobs" (job records) and "documents" (links + uploaded
// files, including the binary blob, indexed by job_id). IndexedDB is used
// instead of localStorage because it stores File/Blob objects and has far more
// room — important for PDF uploads.

const DB_NAME = 'rmt'
const DB_VERSION = 2
let dbPromise

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('jobs')) {
        db.createObjectStore('jobs', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('documents')) {
        const docs = db.createObjectStore('documents', { keyPath: 'id' })
        docs.createIndex('job_id', 'job_id', { unique: false })
      }
      // v2: reusable output-document templates (PDF blob + field mapping).
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function idbGetAll(store) {
  const db = await openDB()
  return reqToPromise(db.transaction(store).objectStore(store).getAll())
}

export async function idbGet(store, key) {
  const db = await openDB()
  return reqToPromise(db.transaction(store).objectStore(store).get(key))
}

export async function idbGetAllByIndex(store, index, value) {
  const db = await openDB()
  return reqToPromise(db.transaction(store).objectStore(store).index(index).getAll(value))
}

export async function idbPut(store, value) {
  const db = await openDB()
  const t = db.transaction(store, 'readwrite')
  t.objectStore(store).put(value)
  await txDone(t)
  return value
}

export async function idbBulkPut(store, values) {
  const db = await openDB()
  const t = db.transaction(store, 'readwrite')
  const os = t.objectStore(store)
  for (const v of values) os.put(v)
  await txDone(t)
  return values
}

export async function idbDelete(store, key) {
  const db = await openDB()
  const t = db.transaction(store, 'readwrite')
  t.objectStore(store).delete(key)
  return txDone(t)
}

export async function idbClear(store) {
  const db = await openDB()
  const t = db.transaction(store, 'readwrite')
  t.objectStore(store).clear()
  return txDone(t)
}
