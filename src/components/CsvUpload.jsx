import { useRef, useState } from 'react'
import { parseFile } from '../lib/csv'
import Icon from './Icon'

const ACCEPT = '.csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

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
    const files = Array.from(fileList || []).filter((f) => /\.(csv|xlsx|xls|xlsm)$/i.test(f.name))
    if (!files.length) {
      onToast?.({ type: 'error', text: 'Please choose a CSV or Excel (.xlsx/.xls) file.' })
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

  if (variant === 'dropzone') {
    return (
      <div
        className={`dropzone${dragging ? ' is-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
      >
        {input}
        <div className="dropzone__title">{busy ? 'Importing…' : 'Import a spreadsheet'}</div>
        <div className="dropzone__hint">CSV or Excel — drag a file here or click to browse</div>
      </div>
    )
  }

  return (
    <button className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
      {input}
      <Icon name="upload" /> {busy ? 'Importing…' : 'Import'}
    </button>
  )
}
