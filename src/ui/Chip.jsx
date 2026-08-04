import { statusColor, statusLabel } from '../lib/status'
import { cx, focusRing } from './cx'

// Pills. The app had one concept and eight paddings.

const chipSizes = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
}

const chipTones = {
  neutral: 'border-line bg-sunken text-ink-faint',
  ember: 'border-ember/25 bg-ember-wash text-ember-deep',
  moss: 'border-moss/30 bg-moss-wash text-moss-deep',
  amber: 'border-amber/30 bg-amber/[0.12] text-amber-deep',
  ink: 'border-ink/15 bg-ink/[0.06] text-ink-soft',
  danger: 'border-danger/25 bg-danger-wash text-danger',
}

// A static label. `dot` takes a colour and draws a leading marker.
//
// Every primitive here forwards unknown props to its root element. That is not
// tidiness: JobList.jsx finds cards and controls by querying the DOM
// (`closest('.job-card')`, `.status-pill`), and the migration replaces those
// class hooks with data- attributes. A primitive that silently swallows
// `data-job-id` breaks drag-select with no error anywhere.
export function Chip({ tone = 'neutral', size = 'md', dot, className, children, ...rest }) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex max-w-full items-center rounded-full border font-semibold',
        chipSizes[size] || chipSizes.md,
        chipTones[tone] || chipTones.neutral,
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  )
}

// The status of an assessment, in the app's colours for it.
//
// Driven from src/lib/status.js rather than a hard-coded map, so Booked / Done
// / Paid / Cancelled stay in one place and normalizeStatus() keeps handling
// jobs still carrying the old pipeline names. The tint is mixed from the
// status colour at runtime — the same color-mix formula .status-pill used —
// which is why Cancelled works here and did not in the Finance tab's chip.
export function StatusChip({ status, size = 'md', className, ...rest }) {
  const colour = statusColor(status)
  return (
    <span
      {...rest}
      style={{
        '--status-color': colour,
        color: 'color-mix(in srgb, var(--status-color) 62%, var(--color-ink))',
        backgroundColor: 'color-mix(in srgb, var(--status-color) 12%, var(--color-paper-card))',
        borderColor: 'color-mix(in srgb, var(--status-color) 38%, transparent)',
      }}
      className={cx(
        'inline-flex max-w-full items-center rounded-full border font-semibold',
        chipSizes[size] || chipSizes.md,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-color)]" aria-hidden />
      <span className="truncate">{statusLabel(status)}</span>
    </span>
  )
}

// A chip you tap to filter. Same shape as Chip, but a real button: 44px tall,
// pressed state announced to screen readers, and an optional count.
export function FilterChip({ active = false, dot, count, onClick, className, children, ...rest }) {
  return (
    <button
      {...rest}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3.5',
        'text-sm font-medium transition-colors',
        active
          ? 'border-ember bg-ember-wash text-ember-deep'
          : 'border-line-strong bg-paper-card text-ink-faint hover:border-ink-faint hover:text-ink',
        focusRing,
        className,
      )}
    >
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      {count != null && (
        <span className={cx('font-mono font-bold tabular-nums', active ? 'text-ember-deep' : 'text-ink')}>{count}</span>
      )}
      {children}
    </button>
  )
}
