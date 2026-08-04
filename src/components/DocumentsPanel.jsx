import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Link2, Loader2, Trash2, Upload } from 'lucide-react'
import { useDocuments } from '../hooks/useDocuments'
import { documentsStore } from '../lib/documentsStore'
import { STATUS_VALUES, statusColor, statusLabel } from '../lib/status'
import { Button, EmptyState, FilterChip, IconButton, Input, Select, Textarea, cx } from '../ui'

const MASTER = 'Master'

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// One panel handles both the Files box (mode="files": uploads + links) and the
// Notes box (mode="notes"). Both organise items into a Master folder plus one
// folder per status. A note carries a tick-box so an outstanding / missing
// component can be marked resolved.
export default function DocumentsPanel({ jobId, jobStatus, mode = 'files' }) {
  const { docs, loading, addFile, addLink, addNote, setDone, move, remove } = useDocuments(jobId)
  const [folder, setFolder] = useState(MASTER)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [noteText, setNoteText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const isNotes = mode === 'notes'
  const kinds = isNotes ? ['note'] : ['file', 'link']
  const items = useMemo(() => docs.filter((d) => kinds.includes(d.kind)), [docs, isNotes])

  const counts = useMemo(() => {
    const map = { [MASTER]: items.length }
    for (const s of STATUS_VALUES) map[s] = 0
    for (const d of items) if (map[d.folder] != null) map[d.folder] += 1
    return map
  }, [items])

  const targetFolder = folder === MASTER ? jobStatus : folder
  const visible = folder === MASTER ? items : items.filter((d) => d.folder === folder)

  async function addFiles(files) {
    for (const file of files) await addFile(file, targetFolder)
  }

  async function onPickFile(e) {
    await addFiles(Array.from(e.target.files || []))
    if (fileRef.current) fileRef.current.value = ''
  }

  function onDragOver(e) {
    if (isNotes) return
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(e) {
    if (isNotes) return
    // Only clear when the pointer actually leaves the wrapper, not on child enter.
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragOver(false)
  }

  async function onDrop(e) {
    if (isNotes) return
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) await addFiles(files)
  }

  // Paste-to-upload. The native paste event targets the focused element (or
  // <body>), which is never inside this panel's wrapper, so a div-level onPaste
  // would never fire — listen on the window instead. A ref keeps the current
  // target folder without re-binding on every folder change.
  const targetRef = useRef(targetFolder)
  useEffect(() => { targetRef.current = targetFolder }, [targetFolder])
  useEffect(() => {
    if (isNotes) return undefined
    const handler = (e) => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) files.forEach((f) => addFile(f, targetRef.current))
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [isNotes, addFile])

  function onNoteKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onAddNote(e)
  }

  async function onAddLink(e) {
    e.preventDefault()
    const url = linkUrl.trim()
    if (!url) return
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    await addLink({ name: linkName.trim() || normalized, url: normalized, folder: targetFolder })
    setLinkName('')
    setLinkUrl('')
    setLinkOpen(false)
  }

  async function onAddNote(e) {
    e.preventDefault()
    const text = noteText.trim()
    if (!text) return
    await addNote({ text, folder: targetFolder })
    setNoteText('')
  }

  function openFile(doc) {
    const url = documentsStore.fileUrl(doc)
    if (url) {
      window.open(url, '_blank', 'noopener')
      // Give the new tab time to load before releasing the object URL.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
  }

  function onRemove(doc) {
    const name = doc.kind === 'note' ? doc.text : doc.name
    if (doc.kind !== 'note' && !window.confirm(`Remove "${name}"? This can't be undone.`)) return
    remove(doc.id)
  }

  const folders = [MASTER, ...STATUS_VALUES]

  return (
    <div className="flex flex-col gap-3">
      {/* Same scrolling chip row as the board's status filter, for the same
          reason: five 44px chips do not fit across a phone, and shrinking them
          to fit is how the old 11px controls got there. The negative margin
          plus matching padding keeps the focus ring — which sits 2px outside
          the chip — from being clipped by the scroller. */}
      <div
        role="group"
        aria-label="Filter by folder"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {folders.map((f) => (
          <FilterChip
            key={f}
            active={folder === f}
            dot={f === MASTER ? undefined : statusColor(f)}
            count={counts[f] ?? 0}
            onClick={() => setFolder(f)}
          >
            {f === MASTER ? 'All' : statusLabel(f)}
          </FilterChip>
        ))}
      </div>

      {isNotes ? (
        <form className="flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={onAddNote}>
          <Textarea
            className="sm:flex-1"
            placeholder="Add a note for this status — e.g. Missing EPC certificate, chase customer"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={onNoteKeyDown}
            rows={2}
            aria-label="New note"
          />
          <Button tone="primary" type="submit" disabled={!noteText.trim()}>Add</Button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={onPickFile}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf"
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={16} aria-hidden /> Upload file
            </Button>
            <Button size="sm" onClick={() => setLinkOpen((v) => !v)}>
              <Link2 size={16} aria-hidden /> Add link
            </Button>
            <span className="text-xs text-ink-faint">
              into <strong className="font-semibold text-ink">{statusLabel(targetFolder)}</strong>
            </span>
          </div>
          {linkOpen && (
            /* minmax(0,…), not a bare 1fr: a grid track's automatic minimum
               is min-content, so a long URL in the second column would push
               the row wider than the phone rather than being clipped. */
            <form className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]" onSubmit={onAddLink}>
              <Input type="text" placeholder="Label (optional)" aria-label="Link label" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
              <Input type="text" placeholder="https://…" aria-label="Link address" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
              <Button tone="primary" type="submit">Add</Button>
            </form>
          )}
        </div>
      )}

      <div
        className="relative"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {!isNotes && dragOver && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ember bg-ember-wash/95 text-sm font-semibold text-ember-deep"
          >
            <Upload size={18} /> Drop files into {statusLabel(targetFolder)}
          </div>
        )}

        {visible.length === 0 ? (
          loading ? (
            <p className="flex items-center gap-2 py-2 text-[13px] text-ink-faint">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Loading documents…
            </p>
          ) : (
            <EmptyState size="compact">
              {folder === MASTER
                ? isNotes ? 'No notes yet.' : 'No files yet.'
                : `Nothing in ${statusLabel(folder)} yet.`}
            </EmptyState>
          )
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visible.map((doc) => (
              <li
                key={doc.id}
                className={cx(
                  'flex gap-3 rounded-lg border border-line bg-paper-card px-3 py-2.5',
                  doc.kind === 'note' ? 'items-start' : 'items-center',
                )}
              >
                {doc.kind === 'note' ? (
                  <input
                    type="checkbox"
                    // 20px, not the old 15px: this is the one control on the
                    // row a thumb has to hit precisely.
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ember"
                    checked={!!doc.done}
                    onChange={(e) => setDone(doc.id, e.target.checked)}
                    title={doc.done ? 'Mark outstanding' : 'Mark done'}
                    aria-label={doc.done ? 'Mark outstanding' : 'Mark done'}
                  />
                ) : (
                  <span className="shrink-0 text-ink-faint" aria-hidden>
                    {doc.kind === 'link' ? <Link2 size={16} /> : <FileText size={16} />}
                  </span>
                )}

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {doc.kind === 'note' ? (
                    <span className={cx('whitespace-pre-wrap break-words text-sm leading-snug', doc.done ? 'text-ink-faint line-through' : 'text-ink')}>
                      {doc.text}
                    </span>
                  ) : doc.kind === 'link' ? (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-ember-deep hover:underline">
                      {doc.name}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openFile(doc)}
                      className="cursor-pointer truncate text-left text-sm text-ember-deep hover:underline"
                    >
                      {doc.name}
                    </button>
                  )}
                  {(doc.kind === 'file' && doc.size != null) || folder === MASTER ? (
                    /* a div, not a span: <Select> renders a positioned
                       wrapper, and a block element inside a span is invalid. */
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                      {doc.kind === 'file' && doc.size != null && <span>{formatSize(doc.size)}</span>}
                      {folder === MASTER && (
                        <Select
                          className="w-40"
                          value={doc.folder}
                          onChange={(e) => move(doc.id, e.target.value)}
                          title="Move to folder"
                          aria-label="Move to folder"
                        >
                          {STATUS_VALUES.map((s) => (<option key={s} value={s}>{statusLabel(s)}</option>))}
                        </Select>
                      )}
                    </div>
                  ) : null}
                </div>

                <IconButton label="Remove" tone="danger" size="sm" onClick={() => onRemove(doc)}>
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
