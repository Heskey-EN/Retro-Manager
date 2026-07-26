import { useState } from 'react'
import { useTemplates } from '../hooks/useTemplates'
import { documentsStore } from '../lib/documentsStore'
import { fillTemplate, readFieldValues } from '../lib/pdfDocs'
import { jobDataValues } from '../lib/jobData'
import { jobAddress } from '../lib/display'

const isPdf = (doc) => doc.kind === 'file' && (/\.pdf$/i.test(doc.name) || doc.mime === 'application/pdf')

// "Generate documents" for a job: fill a saved template from the job's data and
// the fields read from its uploaded source PDFs, then save the result into Files.
export default function GeneratePanel({ job, onManageTemplates }) {
  const { templates, loading } = useTemplates()
  const [status, setStatus] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function generate(template) {
    setBusyId(template.id)
    setStatus(null)
    try {
      const jobVals = jobDataValues(job)

      // Aggregate form fields across all the job's uploaded PDFs.
      const docs = (await documentsStore.listForJob(job.id)).filter(isPdf)
      const sourceVals = {}
      for (const doc of docs) {
        try {
          Object.assign(sourceVals, await readFieldValues(doc.blob))
        } catch { /* skip unreadable PDFs */ }
      }

      // Resolve each mapped template field to a value.
      const values = {}
      for (const [field, m] of Object.entries(template.mapping || {})) {
        if (!m) continue
        if (m.type === 'job') values[field] = jobVals[m.key] ?? ''
        else if (m.type === 'pdf') values[field] = sourceVals[m.key] ?? ''
      }

      const { blob, missing } = await fillTemplate(template.pdf, values)
      const outName = `${template.name.replace(/\.pdf$/i, '')} — ${jobAddress(job)}.pdf`
      const file = new File([blob], outName, { type: 'application/pdf' })

      // Save into the job's Files and download a copy.
      await documentsStore.addFile(job.id, file, job.status)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = outName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)

      const filled = Object.keys(values).filter((k) => values[k]).length
      setStatus({
        type: 'success',
        text: `Generated “${outName}” — ${filled} field${filled === 1 ? '' : 's'} filled, saved to Files.${missing.length ? ` ${missing.length} template field(s) not found.` : ''}`,
      })
    } catch (err) {
      setStatus({ type: 'error', text: `Couldn’t generate: ${err.message || err}` })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="generate">
      {loading && templates.length === 0 ? (
        <div className="loading-note">Loading templates…</div>
      ) : templates.length === 0 ? (
        <p className="generate__empty">
          No templates yet.{' '}
          <button className="linkbtn" onClick={onManageTemplates}>Add a document template</button> to generate
          completed documents from this job.
        </p>
      ) : (
        <ul className="generate__list">
          {templates.map((t) => {
            const mapped = Object.keys(t.mapping || {}).length
            return (
              <li key={t.id} className="generate__item">
                <div className="generate__meta">
                  <span className="generate__name">{t.name}</span>
                  <span className="generate__sub mono">{mapped}/{t.fields?.length || 0} fields mapped</span>
                </div>
                <button className="btn btn--sm btn--primary" onClick={() => generate(t)} disabled={busyId === t.id || mapped === 0}>
                  {busyId === t.id ? 'Generating…' : 'Generate'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {status && <div className={`upload-msg upload-msg--${status.type}`}>{status.text}</div>}

      {templates.length > 0 && (
        <button className="linkbtn generate__manage" onClick={onManageTemplates}>Manage templates</button>
      )}
    </div>
  )
}
