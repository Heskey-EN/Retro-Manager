import { useEffect } from 'react'
import StatusSelect from './StatusSelect'
import DocumentsPanel from './DocumentsPanel'
import CostingPanel from './CostingPanel'
import AssignPanel from './AssignPanel'
import TagInput from './TagInput'
import FullScreenPage, { PageCard } from './FullScreenPage'
import { Button, Field, Input, Mono, SpecLabel } from '../ui'
import { jobAddress, jobReference, jobPostcode, jobCustomer, jobMeasure } from '../lib/display'

// Full-screen view for a single property: identity + status + schedule at the
// top, then Notes and Files side by side, each organised by status.
export default function JobView({ job, onClose, onUpdate, onStatusChange, onArchive }) {
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
    <FullScreenPage
      backLabel="All jobs"
      onClose={onClose}
      actions={
        onArchive && (
          <Button tone="ghost" size="sm" onClick={() => onArchive(job)}>
            {job.archived ? 'Unarchive' : 'Archive'}
          </Button>
        )
      }
    >
      <header>
        {reference && <SpecLabel>{reference}</SpecLabel>}
        <h1 className="font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">
          {jobAddress(job)}
        </h1>

        {chips.length > 0 && (
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {chips.map(([label, value, mono]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {mono ? <Mono>{value}</Mono> : value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">Tags</span>
          <div className="min-w-[12rem] flex-1">
            <TagInput value={job.tags || []} onChange={(tags) => onUpdate(job.id, { tags })} />
          </div>
        </div>
      </header>

      <PageCard>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* as="div": a <label> may wrap only one control, and the status pill
              is a dot plus a select. */}
          <Field as="div" label="Status">
            <StatusSelect value={job.status} onChange={(value) => onStatusChange(job, value)} />
          </Field>
          <Field label="Start">
            <Input
              type="date"
              value={job.start_date || ''}
              onChange={(e) => onUpdate(job.id, { start_date: e.target.value || null })}
            />
          </Field>
          <Field label="End">
            <Input
              type="date"
              value={job.end_date || ''}
              onChange={(e) => onUpdate(job.id, { end_date: e.target.value || null })}
            />
          </Field>
        </div>
      </PageCard>

      {/* grid-cols-1, not a bare `grid`. An implicit `auto` track is sized by
          its content's min-content width, and the documents panel's filter
          chips scroll sideways rather than wrapping — so the track grew to
          549px inside a 343px page and the whole overlay scrolled sideways.
          The page's own scrollWidth still read 375, which is why this has to
          be checked on the scrolling element. grid-cols-1 is minmax(0,1fr):
          definite, so the chips scroll inside their row as intended. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PageCard title="Notes" hint="Log outstanding items per status. Tick one when it's resolved.">
          <DocumentsPanel jobId={job.id} jobStatus={job.status} mode="notes" />
        </PageCard>
        <PageCard title="Files" hint="Upload documents or attach links, filed by status.">
          <DocumentsPanel jobId={job.id} jobStatus={job.status} mode="files" />
        </PageCard>
      </div>

      <PageCard title="Who's on this job" hint="Assign the people responsible for each part of the delivery.">
        <AssignPanel
          assignments={job.assignments}
          onChange={(assignments) => onUpdate(job.id, { assignments })}
        />
      </PageCard>

      <PageCard title="Costing" hint="List each item and its cost, then enter the projected revenue to see the profit.">
        <CostingPanel key={job.id} costing={job.costing} onSave={(costing) => onUpdate(job.id, { costing })} />
      </PageCard>

      {extraFields.length > 0 && (
        <PageCard title="All fields" hint="Everything else the spreadsheet carried for this property.">
          <dl className="overflow-hidden rounded-lg border border-line">
            {extraFields.map(([k, v]) => (
              <div key={k} className="flex gap-3 px-3 py-2 text-[13px] odd:bg-sunken">
                <dt className="w-[42%] shrink-0 break-words text-ink-faint">{k}</dt>
                <dd className="min-w-0 break-words text-ink">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </PageCard>
      )}
    </FullScreenPage>
  )
}
