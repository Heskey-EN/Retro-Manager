import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocuments } from '../hooks/useDocuments'
import { documentsStore } from '../lib/documentsStore'
import { STATUS_VALUES, statusColor, statusLabel } from '../lib/status'
import Icon from './Icon'

const MASTER = 'Master'

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// One panel handles both the Files box (mode="files": uploads + links) and the
// Notes box (mode="notes"). Both organise items into a Master folder plus one
// folder per workflow stage. A note carries a tick-box so an outstanding /
// missing component can be marked resolved.
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
    <div className="docs">
      <div className="docs__folders" role="tablist">
        {folders.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={folder === f}
            className={`docs__folder${folder === f ? ' docs__folder--active' : ''}`}
            style={f === MASTER ? undefined : { '--status-color': statusColor(f) }}
            onClick={() => setFolder(f)}
          >
            {f !== MASTER && <span className="docs__folder-dot" />}
            {f === MASTER ? 'All' : statusLabel(f)}
            <span className="docs__folder-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {isNotes ? (
        <form className="docs__note-form" onSubmit={onAddNote}>
          <textarea
            placeholder="Add a note for this stage — e.g. Missing EPC certificate, chase customer"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={onNoteKeyDown}
            rows={2}
          />
          <button className="btn btn--sm btn--primary" type="submit" disabled={!noteText.trim()}>Add</button>
        </form>
      ) : (
        <>
          <div className="docs__add">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={onPickFile}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf"
            />
            <button className="btn btn--sm" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Upload file</button>
            <button className="btn btn--sm" onClick={() => setLinkOpen((v) => !v)}><Icon name="link" /> Add link</button>
            <span className="docs__target">into <strong>{statusLabel(targetFolder)}</strong></span>
          </div>
          {linkOpen && (
            <form className="docs__link-form" onSubmit={onAddLink}>
              <input type="text" placeholder="Label (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
              <input type="text" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
              <button className="btn btn--sm btn--primary" type="submit">Add</button>
            </form>
          )}
        </>
      )}

      <div
        className="docs__body"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {!isNotes && dragOver && (
          <div className="docs__drop" aria-hidden>
            <Icon name="upload" /> Drop files into {statusLabel(targetFolder)}
          </div>
        )}

        {visible.length === 0 ? (
          loading ? (
            <div className="loading-note"><Icon name="spinner" /> Loading documents…</div>
          ) : (
            <p className="docs__empty">
              {folder === MASTER
                ? isNotes ? 'No notes yet.' : 'No files yet.'
                : `Nothing in ${statusLabel(folder)} yet.`}
            </p>
          )
        ) : (
          <ul className="docs__list">
            {visible.map((doc) => (
              <li key={doc.id} className={`docs__item${doc.kind === 'note' ? ' docs__item--note' : ''}`}>
                {doc.kind === 'note' ? (
                  <input
                    type="checkbox"
                    className="docs__check"
                    checked={!!doc.done}
                    onChange={(e) => setDone(doc.id, e.target.checked)}
                    title={doc.done ? 'Mark outstanding' : 'Mark done'}
                  />
                ) : (
                  <span className="docs__icon" aria-hidden><Icon name={doc.kind === 'link' ? 'link' : 'file'} /></span>
                )}

                <div className="docs__meta">
                  {doc.kind === 'note' ? (
                    <span className={`docs__note-text${doc.done ? ' is-done' : ''}`}>{doc.text}</span>
                  ) : doc.kind === 'link' ? (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="docs__name">{doc.name}</a>
                  ) : (
                    <button className="docs__name docs__name--btn" onClick={() => openFile(doc)}>{doc.name}</button>
                  )}
                  <span className="docs__sub">
                    {doc.kind === 'file' && doc.size != null && <span>{formatSize(doc.size)}</span>}
                    {folder === MASTER && (
                      <select
                        className="docs__folder-pick"
                        value={doc.folder}
                        onChange={(e) => move(doc.id, e.target.value)}
                        title="Move to folder"
                      >
                        {STATUS_VALUES.map((s) => (<option key={s} value={s}>{statusLabel(s)}</option>))}
                      </select>
                    )}
                  </span>
                </div>
                <button className="iconbtn iconbtn--danger" onClick={() => onRemove(doc)} aria-label="Remove"><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
