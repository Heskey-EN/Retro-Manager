import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { groupProjects } from '../lib/projects'
import { STATUSES, statusColor, statusLabel } from '../lib/status'
import { jobAddress, jobReference, jobPostcode } from '../lib/display'
import { CHECK_REVEAL } from './JobCard'
import { Button, Card, EmptyState, Mono, cx } from '../ui'

// Jobs grouped into projects by road + postcode. Multi-property projects are
// expanded by default so schemes are immediately visible; single properties
// collapse to keep the list scannable. A header checkbox selects the whole
// project; row checkboxes select individual properties — both feed the bulk bar.
export default function ProjectsView({ jobs, onOpen, selectedIds, onToggleSelect, onToggleGroup, hasFilters, onClearFilters }) {
  const projects = useMemo(() => groupProjects(jobs), [jobs])
  const [overrides, setOverrides] = useState({})
  const selectable = Boolean(onToggleSelect && onToggleGroup)
  const selecting = selectable && selectedIds.size > 0

  if (!jobs.length) {
    return (
      <EmptyState action={hasFilters ? <Button size="sm" onClick={onClearFilters}>Clear filters</Button> : null}>
        {hasFilters ? 'No jobs match your search or filters.' : 'No jobs to group yet.'}
      </EmptyState>
    )
  }

  const multi = projects.filter((p) => p.jobs.length > 1).length
  const toggle = (key, open) => setOverrides((o) => ({ ...o, [key]: !open }))
  const isSel = (id) => Boolean(selectedIds && selectedIds.has(id))

  return (
    <div>
      <p className="mb-3.5 text-[13px] text-ink-faint">
        {projects.length} project{projects.length === 1 ? '' : 's'} · {multi} with multiple properties.
        Grouped by road and postcode.
      </p>
      <div className="flex flex-col gap-2.5">
        {projects.map((p) => {
          const many = p.jobs.length > 1
          const open = overrides[p.key] ?? many
          const ids = p.jobs.map((j) => j.id)
          const allSel = selectable && ids.every((id) => isSel(id))
          const someSel = selectable && ids.some((id) => isSel(id))
          return (
            <Card
              key={p.key}
              pad={false}
              className={cx('overflow-hidden', many && 'border-ember/30', someSel && 'ring-2 ring-ember')}
            >
              <div
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-sunken"
                onClick={() => toggle(p.key, open)}
                role="button"
                aria-expanded={open}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.key, open) }
                }}
              >
                {selectable && (
                  // Always on, unlike the per-property boxes: "select the whole
                  // scheme" is the point of this view, not a hover extra.
                  <label
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleGroup(ids) }}
                    title="Select whole project"
                  >
                    <input
                      type="checkbox"
                      className="h-[18px] w-[18px] cursor-pointer accent-ember"
                      checked={allSel}
                      readOnly
                      ref={(el) => { if (el) el.indeterminate = someSel && !allSel }}
                    />
                  </label>
                )}
                <ChevronRight
                  size={16}
                  aria-hidden
                  className={cx('shrink-0 text-ink-mute transition-transform', open && 'rotate-90')}
                />
                <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
                  <span className="truncate font-display text-[15px] font-semibold tracking-tight">{p.road}</span>
                  {p.outward && <Mono className="shrink-0 text-xs text-ink-faint">{p.outward}</Mono>}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 text-xs text-ink-faint">
                  <Mono className="text-[15px] font-semibold text-ink">{p.jobs.length}</Mono>
                  <span>propert{p.jobs.length === 1 ? 'y' : 'ies'}</span>
                </span>
                {/* Per-status counts are detail, not navigation: they go on a
                    phone rather than squeezing the road name out. */}
                <span className="hidden shrink-0 gap-2.5 sm:flex">
                  {STATUSES.filter((s) => p.counts[s.value] > 0).map((s) => (
                    <span key={s.value} title={s.value} className="inline-flex items-center gap-1 font-mono text-xs text-ink-faint">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {p.counts[s.value]}
                    </span>
                  ))}
                </span>
              </div>

              {open && (
                <ul className="border-t border-line">
                  {p.jobs.map((job) => {
                    const ref = jobReference(job)
                    const postcode = jobPostcode(job)
                    return (
                      <li
                        key={job.id}
                        className={cx(
                          'group flex cursor-pointer items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0 hover:bg-sunken',
                          isSel(job.id) && 'bg-ember/[0.08]',
                        )}
                        onClick={() => onOpen(job)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(job) }
                        }}
                      >
                        {selectable && (
                          <label
                            className={cx(
                              'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center transition-opacity',
                              isSel(job.id) || selecting ? 'opacity-100' : CHECK_REVEAL,
                            )}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleSelect(job.id) }}
                          >
                            <input
                              type="checkbox"
                              className="h-[18px] w-[18px] cursor-pointer accent-ember"
                              checked={isSel(job.id)}
                              readOnly
                              aria-label={`Select ${jobAddress(job)}`}
                            />
                          </label>
                        )}
                        <span
                          className="h-5 w-[3px] shrink-0 rounded-full"
                          style={{ backgroundColor: statusColor(job.status) }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{jobAddress(job)}</span>
                          {(ref || postcode) && (
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-ink-faint">
                              {ref && <Mono className="text-ember-deep">{ref}</Mono>}
                              {postcode && <Mono>{postcode}</Mono>}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-ink-faint">{statusLabel(job.status)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
