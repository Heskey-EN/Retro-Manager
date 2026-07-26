import { useMemo, useState } from 'react'
import { groupProjects } from '../lib/projects'
import { STATUSES, statusColor, statusLabel } from '../lib/status'
import { jobAddress, jobReference, jobPostcode } from '../lib/display'

// Jobs grouped into projects by road + postcode. Multi-property projects are
// expanded by default so schemes are immediately visible; single properties
// collapse to keep the list scannable. A header checkbox selects the whole
// project; row checkboxes select individual properties — both feed the bulk bar.
export default function ProjectsView({ jobs, onOpen, selectedIds, onToggleSelect, onToggleGroup, hasFilters, onClearFilters }) {
  const projects = useMemo(() => groupProjects(jobs), [jobs])
  const [overrides, setOverrides] = useState({})
  const selectable = Boolean(onToggleSelect && onToggleGroup)

  if (!jobs.length) {
    return (
      <div className="placeholder">
        {hasFilters ? (
          <>
            <p>No jobs match your search or filters.</p>
            <button type="button" className="btn btn--sm placeholder__action" onClick={onClearFilters}>
              Clear filters
            </button>
          </>
        ) : (
          <p>No jobs to group yet.</p>
        )}
      </div>
    )
  }

  const multi = projects.filter((p) => p.jobs.length > 1).length
  const toggle = (key, open) => setOverrides((o) => ({ ...o, [key]: !open }))
  const isSel = (id) => Boolean(selectedIds && selectedIds.has(id))

  return (
    <div className={`projects${selectable && selectedIds.size > 0 ? ' projects--selecting' : ''}`}>
      <p className="projects__lead">
        {projects.length} project{projects.length === 1 ? '' : 's'} · {multi} with multiple properties.
        Grouped by road and postcode.
      </p>
      <div className="projects__list">
        {projects.map((p) => {
          const many = p.jobs.length > 1
          const open = overrides[p.key] ?? many
          const ids = p.jobs.map((j) => j.id)
          const allSel = selectable && ids.every((id) => isSel(id))
          const someSel = selectable && ids.some((id) => isSel(id))
          return (
            <div className={`project${many ? ' project--multi' : ''}${someSel ? ' is-selected' : ''}`} key={p.key}>
              <div
                className="project__head"
                onClick={() => toggle(p.key, open)}
                role="button"
                aria-expanded={open}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && toggle(p.key, open)}
              >
                {selectable && (
                  <label
                    className="project__check"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleGroup(ids) }}
                    title="Select whole project"
                  >
                    <input
                      type="checkbox"
                      checked={allSel}
                      readOnly
                      ref={(el) => { if (el) el.indeterminate = someSel && !allSel }}
                    />
                  </label>
                )}
                <span className={`project__chevron${open ? ' is-open' : ''}`} aria-hidden>›</span>
                <span className="project__title">
                  <span className="project__road">{p.road}</span>
                  {p.outward && <span className="project__pc mono">{p.outward}</span>}
                </span>
                <span className="project__meta">
                  <span className="project__count mono">{p.jobs.length}</span>
                  <span>propert{p.jobs.length === 1 ? 'y' : 'ies'}</span>
                </span>
                <span className="project__stages">
                  {STATUSES.filter((s) => p.counts[s.value] > 0).map((s) => (
                    <span key={s.value} className="project__stage" style={{ '--status-color': s.color }} title={s.value}>
                      <span className="project__stage-dot" />{p.counts[s.value]}
                    </span>
                  ))}
                </span>
              </div>

              {open && (
                <ul className="project__jobs">
                  {p.jobs.map((job) => {
                    const ref = jobReference(job)
                    return (
                      <li
                        key={job.id}
                        className={`project__job${isSel(job.id) ? ' is-selected' : ''}`}
                        style={{ '--status-color': statusColor(job.status) }}
                        onClick={() => onOpen(job)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onOpen(job)}
                      >
                        {selectable && (
                          <label
                            className="project__job-check"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleSelect(job.id) }}
                          >
                            <input type="checkbox" checked={isSel(job.id)} readOnly aria-label={`Select ${jobAddress(job)}`} />
                          </label>
                        )}
                        <span className="project__job-rail" />
                        <span className="project__job-addr">{jobAddress(job)}</span>
                        {ref && <span className="project__job-ref mono">{ref}</span>}
                        <span className="project__job-pc mono">{jobPostcode(job)}</span>
                        <span className="project__job-stage">{statusLabel(job.status)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
