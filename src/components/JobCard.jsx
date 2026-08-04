import StatusSelect from './StatusSelect'
import { statusColor } from '../lib/status'
import { jobAddress, jobReference, jobPostcode, jobCustomer, jobMeasure, formatDateShort } from '../lib/display'
import { assignedPeople, initials } from '../lib/roles'
import { Card, Chip, Mono, cx } from '../ui'

// The tick box is out of the way until you want it — but it must never be
// invisible AND clickable, or it silently swallows taps meant for the card
// underneath (that bug shipped once, hence pointer-events here). Touch has no
// hover, so there it is always on; keyboard focus reveals it too, which the
// old CSS never did.
export const CHECK_REVEAL =
  'pointer-events-none opacity-0 ' +
  'group-hover:pointer-events-auto group-hover:opacity-100 ' +
  'group-focus-within:pointer-events-auto group-focus-within:opacity-100 ' +
  'pointer-coarse:pointer-events-auto pointer-coarse:opacity-100'

// One card per job. The property address is the headline; the reference,
// postcode and dates are set in mono to read as precise, measured data.
export default function JobCard({ job, onStatusChange, onOpen, selected, selecting, onToggleSelect, onSelectRange }) {
  const reference = jobReference(job)
  const postcode = jobPostcode(job)
  const customer = jobCustomer(job)
  const measure = jobMeasure(job)
  const people = assignedPeople(job.assignments)
  const start = formatDateShort(job.start_date)
  const end = job.end_date && job.end_date !== job.start_date ? formatDateShort(job.end_date) : null

  return (
    <Card
      as="article"
      pad={false}
      interactive
      // JobList finds cards through this attribute rather than a class name:
      // a data hook survives a restyle, `.job-card` did not.
      data-job-id={job.id}
      className={cx('group flex overflow-hidden', selected && 'ring-2 ring-ember')}
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
      <span className="w-[3px] shrink-0" style={{ backgroundColor: statusColor(job.status) }} aria-hidden />

      {onToggleSelect && (
        // The input owns the toggle (via onChange) so it stays keyboard- and
        // screen-reader-operable; the label only stops the click reaching the
        // card. Shift-click preventDefault suppresses the change event so the
        // range handler runs instead of a plain toggle.
        // Its own column, 44px wide: no overlap with the reference, and no
        // padding that shifts as you hover.
        <label
          data-no-marquee
          onClick={(e) => e.stopPropagation()}
          className={cx(
            'flex w-11 shrink-0 cursor-pointer items-center justify-center transition-opacity',
            selected || selecting ? 'opacity-100' : CHECK_REVEAL,
          )}
        >
          <input
            type="checkbox"
            className="h-[18px] w-[18px] cursor-pointer accent-ember"
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

      <div className={cx('flex min-w-0 flex-1 flex-col gap-1.5 py-3.5 pr-4', onToggleSelect ? 'pl-0' : 'pl-4')}>
        {(reference || measure) && (
          <div className="flex min-w-0 items-center gap-2">
            {reference && <Mono className="shrink-0 text-xs font-medium text-ember-deep">{reference}</Mono>}
            {measure && <Chip size="sm" className="min-w-0">{measure}</Chip>}
          </div>
        )}

        <h3 className="font-display text-base font-semibold leading-snug tracking-tight text-ink">{jobAddress(job)}</h3>

        {(postcode || customer) && (
          <div className="flex min-w-0 items-center gap-2.5 text-xs text-ink-faint">
            {postcode && <Mono className="shrink-0 text-ink-soft">{postcode}</Mono>}
            {customer && <span className="truncate">{customer}</span>}
          </div>
        )}

        {job.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.tags.map((t) => <Chip key={t} size="sm" tone="ember">{t}</Chip>)}
          </div>
        )}

        {people.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {people.map(({ role, person }) => (
              <span
                key={role.key}
                title={`${role.label}: ${person.name}`}
                className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-ember/30 bg-ember-wash font-mono text-[10px] font-semibold tracking-wide text-ember-deep"
              >
                {initials(person.name)}
              </span>
            ))}
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <Mono className="text-xs text-ink-faint">
            {start ? (
              <>{start}{end && <span> → {end}</span>}</>
            ) : (
              <span className="text-ink-mute">No dates</span>
            )}
          </Mono>
          {/* StatusSelect carries its own data-no-marquee, so a press on the
              pill's padding never starts a drag-selection. */}
          <StatusSelect
            value={job.status}
            size="sm"
            onChange={(value) => onStatusChange(job, value)}
          />
        </div>
      </div>
    </Card>
  )
}
