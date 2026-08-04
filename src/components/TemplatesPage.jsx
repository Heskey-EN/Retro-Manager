import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useTemplates } from '../hooks/useTemplates'
import { readFields } from '../lib/pdfDocs'
import { JOB_FIELDS } from '../lib/jobData'
import FullScreenPage, { PageCard } from './FullScreenPage'
import { Banner, Button, EmptyState, IconButton, Input, Mono, Select, SpecLabel, cx } from '../ui'

// Full-screen manager for output-document templates. Upload a fillable PDF, then
// map each of its fields once — to a job value or a source-PDF field number —
// and it's reused for every job.
export default function TemplatesPage({ onClose }) {
  const { templates, loading, save, remove } = useTemplates()
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [sampleFields, setSampleFields] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const tplRef = useRef(null)
  const sampleRef = useRef(null)

  const active = templates.find((t) => t.id === activeId) || null

  // Guard unsaved mapping edits before leaving or switching away from a template.
  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved mapping changes?')
  const attemptClose = () => { if (confirmDiscard()) onClose() }
  const selectTemplate = (id) => { if (id !== activeId && confirmDiscard()) setActiveId(id) }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && confirmDiscard()) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // re-bind each render so the handler sees the current dirty state

  // Load the selected template's mapping into an editable draft.
  useEffect(() => {
    setDraft(active?.mapping || {})
    setDirty(false)
    setSampleFields([])
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onUploadTemplate(file) {
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      const fields = await readFields(file)
      if (!fields.length) {
        setMsg({ type: 'error', text: `“${file.name}” has no fillable form fields. Add form fields to the PDF (name/number them) and re-upload.` })
        return
      }
      const rec = await save({ name: file.name, pdf: file, fields: fields.map((f) => f.name), mapping: {} })
      setActiveId(rec.id)
      setMsg({ type: 'success', text: `Added “${file.name}” with ${fields.length} field${fields.length === 1 ? '' : 's'}.` })
    } catch (err) {
      setMsg({ type: 'error', text: `Couldn’t read that PDF: ${err.message || err}` })
    } finally {
      setBusy(false)
      if (tplRef.current) tplRef.current.value = ''
    }
  }

  async function onSampleSource(file) {
    if (!file) return
    try {
      const fields = await readFields(file)
      setSampleFields(fields.map((f) => f.name))
      if (!fields.length) setMsg({ type: 'error', text: 'That sample PDF has no form fields to list.' })
    } catch (err) {
      setMsg({ type: 'error', text: `Couldn’t read the sample: ${err.message || err}` })
    } finally {
      if (sampleRef.current) sampleRef.current.value = ''
    }
  }

  function setField(field, next) {
    setDraft((d) => {
      const copy = { ...d }
      if (!next || next.type === 'none') delete copy[field]
      else copy[field] = next
      return copy
    })
    setDirty(true)
  }

  async function saveMapping() {
    await save({ ...active, mapping: draft })
    setDirty(false)
    setMsg({ type: 'success', text: 'Mapping saved.' })
  }

  const mappedCount = (t) => Object.keys(t.mapping || {}).length

  const addTemplateButton = (
    <>
      <input ref={tplRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onUploadTemplate(e.target.files?.[0])} />
      <Button tone="primary" size="sm" onClick={() => tplRef.current?.click()} disabled={busy}>
        {busy ? 'Reading…' : <><Plus size={16} aria-hidden /> Add template</>}
      </Button>
    </>
  )

  return (
    <FullScreenPage onClose={attemptClose} actions={addTemplateButton}>
      <header>
        <SpecLabel>Documents</SpecLabel>
        <h1 className="font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">Document templates</h1>
        <p className="mt-2 max-w-[40rem] text-[13px] leading-relaxed text-ink-faint">
          Upload a fillable PDF template, then map each field once — to a value the app already holds,
          or to a numbered field from your source PDFs. The mapping is reused for every job’s
          “Generate documents”.
        </p>
      </header>

      {msg && <Banner tone={msg.type === 'error' ? 'danger' : 'success'}>{msg.text}</Banner>}

      {templates.length === 0 ? (
        loading ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-faint">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Loading templates…
          </p>
        ) : (
          <EmptyState
            title="No templates yet"
            action={<Button tone="primary" onClick={() => tplRef.current?.click()}><Plus size={16} aria-hidden /> Add template</Button>}
          >
            Add a fillable PDF template to get started.
          </EmptyState>
        )
      ) : (
        // minmax(0,1fr) everywhere a track holds text or a select: a track's
        // automatic minimum is min-content, so one long PDF field name would
        // otherwise widen the whole page instead of wrapping.
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className={cx(
                  'flex items-stretch overflow-hidden rounded-lg border bg-paper-card',
                  t.id === activeId ? 'border-ember ring-2 ring-ember/30' : 'border-line',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 px-3 py-2.5 text-left"
                  onClick={() => selectTemplate(t.id)}
                >
                  <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                  <Mono className="text-xs text-ink-faint">{mappedCount(t)}/{t.fields?.length || 0} mapped</Mono>
                </button>
                <IconButton
                  label="Delete template"
                  tone="danger"
                  size="sm"
                  className="self-center"
                  onClick={() => {
                    if (!window.confirm(`Delete template “${t.name}”? This removes the PDF and its field mapping.`)) return
                    remove(t.id)
                    if (activeId === t.id) setActiveId(null)
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              </div>
            ))}
          </aside>

          {!active ? (
            <PageCard>
              <EmptyState size="compact">Select a template to map its fields.</EmptyState>
            </PageCard>
          ) : (
            <PageCard
              title={active.name}
              headAction={
                <div className="flex flex-wrap items-center gap-2">
                  {/* A <label> rather than a button: it is the click target for
                      the hidden file input, so it must not be a nested button. */}
                  <Button as="label" size="sm" className="cursor-pointer">
                    <input ref={sampleRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onSampleSource(e.target.files?.[0])} />
                    Load source field list
                  </Button>
                  <Button tone="primary" size="sm" onClick={saveMapping} disabled={!dirty}>
                    {dirty ? 'Save mapping' : 'Saved'}
                  </Button>
                </div>
              }
            >
              {sampleFields.length > 0 && (
                <Banner tone="info">
                  <Mono className="break-words text-xs">Source fields: {sampleFields.join(', ')}</Mono>
                </Banner>
              )}

              <datalist id="source-fields">
                {sampleFields.map((f) => <option key={f} value={f} />)}
              </datalist>

              <div className="flex flex-col">
                {/* The two-column head only makes sense once the row is two
                    columns — on a phone each field stacks above its source. */}
                <div className="hidden gap-3 pb-2 text-[11px] uppercase tracking-wide text-ink-faint sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <span>Template field</span>
                  <span>Gets its value from</span>
                </div>
                {(active.fields || []).map((field) => {
                  const m = draft[field]
                  const selectValue = m?.type === 'job' ? `job:${m.key}` : m?.type === 'pdf' ? 'pdf' : ''
                  return (
                    <div className="grid grid-cols-1 gap-2 border-t border-line py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center sm:gap-3" key={field}>
                      <Mono className="break-words text-[13px] text-ink">{field}</Mono>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          className="sm:flex-1"
                          aria-label={`Source for ${field}`}
                          value={selectValue}
                          onChange={(e) => {
                            const v = e.target.value
                            if (!v) setField(field, null)
                            else if (v === 'pdf') setField(field, { type: 'pdf', key: m?.type === 'pdf' ? m.key : '' })
                            else setField(field, { type: 'job', key: v.slice(4) })
                          }}
                        >
                          <option value="">— not mapped —</option>
                          <optgroup label="Job data">
                            {JOB_FIELDS.map((jf) => <option key={jf.key} value={`job:${jf.key}`}>{jf.label}</option>)}
                          </optgroup>
                          <option value="pdf">From source PDF field…</option>
                        </Select>
                        {m?.type === 'pdf' && (
                          <Input
                            mono
                            className="sm:w-40"
                            list="source-fields"
                            placeholder="field number / name"
                            aria-label={`Source PDF field for ${field}`}
                            value={m.key}
                            onChange={(e) => setField(field, { type: 'pdf', key: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </PageCard>
          )}
        </div>
      )}
    </FullScreenPage>
  )
}
