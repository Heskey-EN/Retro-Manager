import { ChevronDown } from 'lucide-react'
import { STATUSES, statusColor } from '../lib/status'

// The status of an assessment, as a pill you can change where it stands.
//
// The colours are mixed from the runtime --status-color exactly as <StatusChip>
// in the kit does, so the read-only chip and this editable one are visibly the
// same object rather than two takes on it.
//
// 16px is not a style choice: iOS zooms the whole page when any form control
// under 16px takes focus, and this control lives on every card on a board that
// is demoed on a phone. The old pill was 12.5px.
export default function StatusSelect({ value, onChange, size = 'md' }) {
  return (
    <span
      // JobList starts a drag-selection from anywhere on the board that isn't a
      // control. The <select> is one; the pill's padding around it is not, so
      // without this a press on the pill's edge would begin a marquee.
      data-no-marquee
      className={
        'relative inline-flex shrink-0 items-center gap-1.5 rounded-full border pl-2.5 ' +
        (size === 'sm' ? 'min-h-10' : 'min-h-11')
      }
      style={{
        '--status-color': statusColor(value),
        color: 'color-mix(in srgb, var(--status-color) 62%, var(--color-ink))',
        backgroundColor: 'color-mix(in srgb, var(--status-color) 12%, var(--color-paper-card))',
        borderColor: 'color-mix(in srgb, var(--status-color) 38%, transparent)',
      }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--status-color)]" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Assessment status"
        // The pill sits inside a clickable card; opening the dropdown must not
        // also open the job.
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer appearance-none border-0 bg-transparent py-1 pl-0 pr-6 font-sans text-base font-semibold text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {/* Drawn rather than native: `appearance: none` removes the browser caret
          and the native one cannot take the status colour. */}
      <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5" />
    </span>
  )
}
