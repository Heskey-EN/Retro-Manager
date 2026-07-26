import { useEffect, useRef, useState } from 'react'
import { useTemplates } from '../hooks/useTemplates'
import { readFields } from '../lib/pdfDocs'
import { JOB_FIELDS } from '../lib/jobData'
import Icon from './Icon'

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

  return (
    <div className="jobview">
      <header className="jobview__top">
        <button className="jobview__back" onClick={attemptClose}><Icon name="back" /> Back</button>
        <div className="jobview__top-actions">
          <input ref={tplRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onUploadTemplate(e.target.files?.[0])} />
          <button className="btn btn--primary btn--sm" onClick={() => tplRef.current?.click()} disabled={busy}>
            {busy ? 'Reading…' : <><Icon name="plus" /> Add template</>}
          </button>
          <button className="icon-btn" onClick={attemptClose} aria-label="Close"><Icon name="close" /></button>
        </div>
      </header>

      <div className="jobview__inner">
        <div className="jobview__identity">
          <p className="eyebrow">Documents</p>
          <h1 className="jobview__title">Document templates</h1>
          <p className="jobview__box-hint" style={{ maxWidth: 640 }}>
            Upload a fillable PDF template, then map each field once — to a value the app already holds,
            or to a numbered field from your source PDFs. The mapping is reused for every job’s
            “Generate documents”.
          </p>
        </div>

        {msg && <div className={`upload-msg upload-msg--${msg.type}`}>{msg.text}</div>}

        {templates.length === 0 ? (
          loading ? (
            <div className="loading-note">Loading templates…</div>
          ) : (
            <div className="placeholder">
              <p>No templates yet. Add a fillable PDF template to get started.</p>
            </div>
          )
        ) : (
          <div className="templates">
            <aside className="templates__list">
              {templates.map((t) => (
                <div key={t.id} className={`templates__item${t.id === activeId ? ' is-active' : ''}`}>
                  <button className="templates__pick" onClick={() => selectTemplate(t.id)}>
                    <span className="templates__name">{t.name}</span>
                    <span className="templates__meta mono">{mappedCount(t)}/{t.fields?.length || 0} mapped</span>
                  </button>
                  <button
                    className="templates__del"
                    onClick={() => {
                      if (!window.confirm(`Delete template “${t.name}”? This removes the PDF and its field mapping.`)) return
                      remove(t.id)
                      if (activeId === t.id) setActiveId(null)
                    }}
                    aria-label="Delete template"
                  ><Icon name="trash" /></button>
                </div>
              ))}
            </aside>

            <section className="templates__editor">
              {!active ? (
                <p className="placeholder">Select a template to map its fields.</p>
              ) : (
                <>
                  <div className="templates__editor-head">
                    <h2 className="jobview__box-title">{active.name}</h2>
                    <div className="templates__editor-actions">
                      <label className="btn btn--sm">
                        <input ref={sampleRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onSampleSource(e.target.files?.[0])} />
                        Load source field list
                      </label>
                      <button className="btn btn--sm btn--primary" onClick={saveMapping} disabled={!dirty}>
                        {dirty ? 'Save mapping' : 'Saved'}
                      </button>
                    </div>
                  </div>

                  {sampleFields.length > 0 && (
                    <p className="templates__hint mono">Source fields: {sampleFields.join(', ')}</p>
                  )}

                  <datalist id="source-fields">
                    {sampleFields.map((f) => <option key={f} value={f} />)}
                  </datalist>

                  <div className="mapping">
                    <div className="mapping__row mapping__row--head">
                      <span>Template field</span>
                      <span>Gets its value from</span>
                    </div>
                    {(active.fields || []).map((field) => {
                      const m = draft[field]
                      const selectValue = m?.type === 'job' ? `job:${m.key}` : m?.type === 'pdf' ? 'pdf' : ''
                      return (
                        <div className="mapping__row" key={field}>
                          <span className="mapping__field mono">{field}</span>
                          <div className="mapping__source">
                            <select
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
                            </select>
                            {m?.type === 'pdf' && (
                              <input
                                className="mapping__pdf mono"
                                list="source-fields"
                                placeholder="field number / name"
                                value={m.key}
                                onChange={(e) => setField(field, { type: 'pdf', key: e.target.value })}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
