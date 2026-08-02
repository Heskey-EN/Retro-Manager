import { useRef, useState } from 'react'
import { parseFile } from '../lib/csv'
import Icon from './Icon'

// EXTENSIONS ONLY. Mixing MIME types in here greys real Excel files out of
// the Windows picker whenever the machine registers .xlsx with a different
// content type (common with Office 365 / OneDrive), which looks exactly like
// "it won't accept Excel files".
const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.xltx,.xltm,.ods'

// Judge a file by what it IS, not what it's called: a spreadsheet renamed,
// downloaded without an extension, or handed over by a cloud sync still
// imports. XLSX/ODS are ZIPs ("PK"), legacy XLS is an OLE2 compound file.
async function looksLikeSpreadsheet(file) {
  if (/\.(csv|tsv|txt|xlsx|xlsm|xlsb|xls|xltx|xltm|ods)$/i.test(file.name)) return true
  try {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    if (head[0] === 0x50 && head[1] === 0x4b) return true // PK.. → xlsx/ods
    if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return true // legacy xls
    // Anything that decodes as text with a delimiter is worth a try as CSV.
    const text = new TextDecoder().decode(head)
    return /[,;\t]/.test(text)
  } catch {
    return false
  }
}

// Spreadsheet importer (CSV + Excel). Renders either as a compact toolbar button
// or a large drag-and-drop dropzone (the empty state), sharing one parse path.
export default function CsvUpload({ onJobs, onToast, onReview, variant = 'compact' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  // With a review handler the file is parsed and handed over for approval —
  // nothing is written until the user has seen what it would do. Without one
  // (older callers) it imports straight away, as before.
  async function handleFilesForReview(fileList) {
    const all = Array.from(fileList || [])
    const checked = await Promise.all(all.map(looksLikeSpreadsheet))
    const files = all.filter((_, i) => checked[i])
    if (!files.length) {
      onToast?.({
        type: 'error',
        text: all.length
          ? `${all[0].name} doesn't look like a spreadsheet — save it as .xlsx or .csv and try again.`
          : 'Please choose a CSV or Excel file.',
      })
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setBusy(true)
    try {
      const file = files[0]
      const { jobs, mapping } = await parseFile(file, { batchId: `${file.name}-${Date.now()}` })
      if (!jobs.length) {
        onToast?.({ type: 'error', text: `No rows found in ${file.name}.` })
        return
      }
      onReview({ jobs, mapping, fileName: file.name })
      if (files.length > 1) {
        onToast?.({ type: 'success', text: `Reviewing ${files.length === 2 ? 'the first of 2 files' : `the first of ${files.length} files`} — import them one at a time.` })
      }
    } catch (err) {
      onToast?.({ type: 'error', text: `Couldn't read that file: ${err?.message || err}` })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleFiles(fileList) {
    if (onReview) return handleFilesForReview(fileList)
    const files = Array.from(fileList || [])
    if (!files.length) return

    const valid = files.filter((f) => /\.(csv|xlsx|xls|xlsm)$/i.test(f.name))
    const skipped = files.length - valid.length
    if (!valid.length) {
      onToast?.({ type: 'error', text: 'Please choose a CSV or Excel (.xlsx/.xls) file.' })
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setBusy(true)
    try {
      let totalJobs = 0
      const imported = []
      let lastStartCol = ''
      const failures = []

      for (const file of valid) {
        // Parse and save are separate try/catches so the toast can tell the
        // truth: "couldn't read the file" and "couldn't save the jobs" need
        // opposite user reactions (fix the file vs just retry).
        let jobs, mapping
        try {
          const batchId = `${file.name}-${Date.now()}`
          ;({ jobs, mapping } = await parseFile(file, { batchId }))
        } catch {
          failures.push({ name: file.name, reason: 'could not be read' })
          continue
        }
        if (!jobs.length) {
          failures.push({ name: file.name, reason: 'had no rows' })
          continue
        }
        try {
          await onJobs(jobs)
        } catch (err) {
          failures.push({ name: file.name, reason: `failed to save — ${err?.message || 'unknown error'}` })
          continue
        }
        totalJobs += jobs.length
        imported.push(file.name)
        if (mapping.startCol) lastStartCol = mapping.startCol
      }

      if (!totalJobs) {
        const detail = failures.length === 1
          ? `${failures[0].name} ${failures[0].reason}.`
          : failures.map((f) => `${f.name} ${f.reason}`).join('; ') + '.'
        onToast?.({ type: 'error', text: `Nothing imported: ${detail}` })
        return
      }

      const fileNote = imported.length > 1 ? ` from ${imported.length} files` : ` from ${imported[0]}`
      const dateNote = imported.length === 1 && lastStartCol ? ` · dates from “${lastStartCol}”` : ''
      const skipNote = skipped ? ` Skipped ${skipped} non-spreadsheet file${skipped === 1 ? '' : 's'}.` : ''
      const failNote = failures.length
        ? ` ${failures.map((f) => `${f.name} ${f.reason}`).join('; ')}.`
        : ''
      onToast?.({
        type: 'success',
        text: `Imported ${totalJobs} job${totalJobs === 1 ? '' : 's'}${fileNote}${dateNote}.${skipNote}${failNote}`,
      })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // The input is a SIBLING of the trigger, never a child. Nested inside, its
  // own click bubbled straight back into the trigger's onClick and reopened
  // the picker — which shows up as the dialog flickering, opening twice, or
  // the chosen file never arriving.
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      multiple
      hidden
      onChange={(e) => handleFiles(e.target.files)}
    />
  )

  const openPicker = () => inputRef.current?.click()

  if (variant === 'dropzone') {
    return (
      <>
        {input}
        <div
          className={`dropzone${dragging ? ' is-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          onClick={openPicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } }}
        >
          <div className="dropzone__title">{busy ? 'Importing…' : 'Import a spreadsheet'}</div>
          <div className="dropzone__hint">CSV or Excel — drag a file here or click to browse</div>
        </div>
      </>
    )
  }

  return (
    <>
      {input}
      <button className="btn" onClick={openPicker} disabled={busy}>
        <Icon name="upload" /> {busy ? 'Importing…' : 'Import'}
      </button>
    </>
  )
}
