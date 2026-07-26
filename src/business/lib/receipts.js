// Receipt storage. Receipt photos are far too big for localStorage (~5MB total),
// so the images live in IndexedDB (hundreds of MB available) keyed by a receipt
// id, while the expense record in localStorage just holds that id + filename.
// Images are downscaled + JPEG-compressed on the way in so a phone photo that
// starts at 3–5MB is stored at ~100–300KB.

const DB_NAME = 'ef-hub-receipts'
const STORE = 'receipts'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        const result = fn(store)
        t.oncomplete = () => resolve(result?.__req ? result.__req.result : result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

export function putReceipt(id, dataUrl) {
  return tx('readwrite', (store) => {
    store.put(dataUrl, id)
  })
}

export function getReceipt(id) {
  return tx('readonly', (store) => ({ __req: store.get(id) }))
}

export function deleteReceipt(id) {
  if (!id) return Promise.resolve()
  return tx('readwrite', (store) => {
    store.delete(id)
  })
}

// Read every receipt into a plain { id: dataUrl } object (used for backups)
export function getAllReceipts() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const out = {}
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (cursor) {
            out[cursor.key] = cursor.value
            cursor.continue()
          } else {
            resolve(out)
          }
        }
        req.onerror = () => reject(req.error)
      })
  )
}

// Replace the whole store with the given { id: dataUrl } map (backup restore)
export function replaceAllReceipts(map) {
  return tx('readwrite', (store) => {
    store.clear()
    for (const [id, dataUrl] of Object.entries(map || {})) store.put(dataUrl, id)
  })
}

const MAX_DIM = 1600 // longest edge after downscaling
const RAW_LIMIT = 6 * 1024 * 1024 // reject anything bigger than this that we can't shrink (e.g. PDFs)

// Turn a picked File into a compact data URL. Images are resized + re-encoded
// as JPEG; PDFs (and anything non-image) are kept as-is if within the limit.
export function fileToReceipt(file) {
  if (file.type === 'application/pdf' || !file.type.startsWith('image/')) {
    if (file.size > RAW_LIMIT) {
      return Promise.reject(new Error('That file is too big (max 6MB for PDFs). Try a photo instead.'))
    }
    return readAsDataUrl(file)
  }
  return readAsDataUrl(file).then(
    (dataUrl) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          const scale = Math.min(1, MAX_DIM / Math.max(width, height))
          width = Math.round(width * scale)
          height = Math.round(height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#fff' // flatten any transparency to white
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.72))
        }
        img.onerror = () => resolve(dataUrl) // fall back to the raw image if decode fails
        img.src = dataUrl
      })
  )
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}
