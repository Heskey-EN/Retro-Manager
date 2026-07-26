import { useEffect } from 'react'
import Icon from './Icon'
import StatusSelect from './StatusSelect'
import DocumentsPanel from './DocumentsPanel'
import CostingPanel from './CostingPanel'
import GeneratePanel from './GeneratePanel'
import TagInput from './TagInput'
import { jobAddress, jobReference, jobPostcode, jobCustomer, jobMeasure } from '../lib/display'

// Full-screen view for a single property: identity + stage + schedule at the
// top, then two boxes side by side — Notes and Files — each organised by stage.
export default function JobView({ job, onClose, onUpdate, onStatusChange, onArchive, onManageTemplates }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!job) return null

  const reference = jobReference(job)
  const chips = [
    ['Postcode', jobPostcode(job), true],
    ['Customer', jobCustomer(job), false],
    ['Measure', jobMeasure(job), false],
  ].filter(([, v]) => v)

  const shownKeys = new Set(['Reference', 'Job Reference', 'Ref', 'Postcode', 'Post Code', 'Customer', 'Client', 'Measure', 'Work Type', 'Address', 'Property Address'])
  const extraFields = Object.entries(job.data || {}).filter(
    ([k, v]) => String(v ?? '').trim() !== '' && !shownKeys.has(k),
  )

  return (
    <div className="jobview">
      <header className="jobview__top">
        <button className="jobview__back" onClick={onClose}>
          <Icon name="back" /> All jobs
        </button>
        <div className="jobview__top-actions">
          {onArchive && (
            <button className="btn btn--ghost btn--sm" onClick={() => onArchive(job)}>
              {job.archived ? 'Unarchive' : 'Archive'}
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
      </header>

      <div className="jobview__inner">
        <div className="jobview__identity">
          {reference && <p className="eyebrow mono">{reference}</p>}
          <h1 className="jobview__title">{jobAddress(job)}</h1>
          {chips.length > 0 && (
            <div className="jobview__chips">
              {chips.map(([label, value, mono]) => (
                <span key={label} className="jobview__chip">
                  <span className="jobview__chip-label">{label}</span>
                  <span className={mono ? 'mono' : undefined}>{value}</span>
                </span>
              ))}
            </div>
          )}
          <div className="jobview__tags">
            <span className="jobview__chip-label">Tags</span>
            <TagInput value={job.tags || []} onChange={(tags) => onUpdate(job.id, { tags })} />
          </div>
        </div>

        <div className="jobview__controls">
          <div className="field">
            <span>Stage</span>
            <StatusSelect value={job.status} onChange={(value) => onStatusChange(job, value)} />
          </div>
          <label className="field">
            <span>Start</span>
            <input type="date" value={job.start_date || ''} onChange={(e) => onUpdate(job.id, { start_date: e.target.value || null })} />
          </label>
          <label className="field">
            <span>End</span>
            <input type="date" value={job.end_date || ''} onChange={(e) => onUpdate(job.id, { end_date: e.target.value || null })} />
          </label>
        </div>

        <div className="jobview__grid">
          <section className="jobview__box">
            <h2 className="jobview__box-title">Notes</h2>
            <p className="jobview__box-hint">Log outstanding items per stage. Tick one when it's resolved.</p>
            <DocumentsPanel jobId={job.id} jobStatus={job.status} mode="notes" />
          </section>
          <section className="jobview__box">
            <h2 className="jobview__box-title">Files</h2>
            <p className="jobview__box-hint">Upload documents or attach links, filed by stage.</p>
            <DocumentsPanel jobId={job.id} jobStatus={job.status} mode="files" />
          </section>
        </div>

        <section className="jobview__box jobview__box--wide">
          <h2 className="jobview__box-title">Costing</h2>
          <p className="jobview__box-hint">Coordination / Design — list each item and its cost, then enter the projected revenue to see the profit.</p>
          <CostingPanel key={job.id} costing={job.costing} onSave={(costing) => onUpdate(job.id, { costing })} />
        </section>

        <section className="jobview__box jobview__box--wide">
          <h2 className="jobview__box-title">Generate documents</h2>
          <p className="jobview__box-hint">Fill a template from this job’s data and its uploaded PDFs. The finished document is saved into Files.</p>
          <GeneratePanel job={job} onManageTemplates={onManageTemplates} />
        </section>

        {extraFields.length > 0 && (
          <section className="jobview__box jobview__box--wide">
            <h2 className="jobview__box-title">All fields</h2>
            <dl className="drawer__data">
              {extraFields.map(([k, v]) => (
                <div key={k} className="drawer__data-row">
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  )
}
