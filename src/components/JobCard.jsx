import StatusSelect from './StatusSelect'
import { statusColor } from '../lib/status'
import { jobAddress, jobReference, jobPostcode, jobCustomer, jobMeasure, formatDateShort } from '../lib/display'

// One card per job. The property address is the headline; the reference,
// postcode and dates are set in mono to read as precise, measured data.
export default function JobCard({ job, onStatusChange, onOpen, selected, onToggleSelect, onSelectRange }) {
  const reference = jobReference(job)
  const postcode = jobPostcode(job)
  const customer = jobCustomer(job)
  const measure = jobMeasure(job)
  const start = formatDateShort(job.start_date)
  const end = job.end_date && job.end_date !== job.start_date ? formatDateShort(job.end_date) : null

  return (
    <article
      className={`job-card${selected ? ' is-selected' : ''}`}
      style={{ '--status-color': statusColor(job.status) }}
      data-job-id={job.id}
      onClick={(e) => {
        if (e.shiftKey && onSelectRange) { onSelectRange(job.id); return }
        if ((e.metaKey || e.ctrlKey) && onToggleSelect) { onToggleSelect(job.id); return }
        onOpen(job)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter') onOpen(job)
        else if (e.key === ' ') { e.preventDefault(); onOpen(job) }
      }}
    >
      {onToggleSelect && (
        // The input owns the toggle (via onChange) so it stays keyboard- and
        // screen-reader-operable; the label only stops the click reaching the
        // card. Shift-click preventDefault suppresses the change event so the
        // range handler runs instead of a plain toggle.
        <label className="card__check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            aria-label={`Select ${jobAddress(job)}`}
            onClick={(e) => {
              e.stopPropagation()
              if (e.shiftKey && onSelectRange) {
                e.preventDefault()
                onSelectRange(job.id)
              }
            }}
            onChange={() => onToggleSelect(job.id)}
          />
        </label>
      )}
      <span className="card__rail" aria-hidden />
      <div className="card__body">
        <div className="card__eyebrow">
          {reference && <span className="card__ref mono">{reference}</span>}
          {measure && <span className="card__measure">{measure}</span>}
        </div>
        <h3 className="card__title">{jobAddress(job)}</h3>
        <div className="card__meta">
          {postcode && <span className="mono card__postcode">{postcode}</span>}
          {customer && <span className="card__customer">{customer}</span>}
        </div>
        {job.tags?.length > 0 && (
          <div className="card__tags">
            {job.tags.map((t) => <span key={t} className="tag tag--sm">{t}</span>)}
          </div>
        )}
        <div className="card__foot">
          <span className="card__dates mono">
            {start ? (
              <>{start}{end && <span className="card__dates-sep"> → {end}</span>}</>
            ) : (
              <span className="card__nodate">No dates</span>
            )}
          </span>
          <StatusSelect
            value={job.status}
            size="sm"
            onChange={(value) => onStatusChange(job, value)}
          />
        </div>
      </div>
    </article>
  )
}
