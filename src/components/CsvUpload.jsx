import { useRef, useState } from 'react'
import { parseFile } from '../lib/csv'
import Icon from './Icon'

const ACCEPT = '.csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

// Spreadsheet importer (CSV + Excel). Renders either as a compact toolbar button
// or a large drag-and-drop dropzone (the empty state), sharing one parse path.
export default function CsvUpload({ onJobs, onToast, variant = 'compact' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleFiles(fileList) {
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
        try {
          const batchId = `${file.name}-${Date.now()}`
          const { jobs, mapping } = await parseFile(file, { batchId })
          if (!jobs.length) {
            failures.push(file.name)
            continue
          }
          await onJobs(jobs)
          totalJobs += jobs.length
          imported.push(file.name)
          if (mapping.startCol) lastStartCol = mapping.startCol
        } catch {
          failures.push(file.name)
        }
      }

      if (!totalJobs) {
        onToast?.({ type: 'error', text: `No rows found in ${valid.length === 1 ? valid[0].name : 'the selected files'}.` })
        return
      }

      const fileNote = imported.length > 1 ? ` from ${imported.length} files` : ` from ${imported[0]}`
      const dateNote = imported.length === 1 && lastStartCol ? ` · dates from “${lastStartCol}”` : ''
      const skipNote = skipped ? ` Skipped ${skipped} non-spreadsheet file${skipped === 1 ? '' : 's'}.` : ''
      const failNote = failures.length ? ` ${failures.length} file${failures.length === 1 ? '' : 's'} could not be read.` : ''
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
